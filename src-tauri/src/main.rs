#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicU64, Ordering};

use tauri::api::process::{Command, CommandEvent};
use serde_json::Value;
use tokio::sync::oneshot;

// ── ID de solicitudes ─────────────────────────────────────────────────────────

static REQ_ID: AtomicU64 = AtomicU64::new(0);

fn next_id() -> String {
    REQ_ID.fetch_add(1, Ordering::Relaxed).to_string()
}

// ── Estado compartido de la aplicación ───────────────────────────────────────

type PendingMap = Arc<Mutex<HashMap<String, oneshot::Sender<Result<Value, String>>>>>;

struct AppState {
    /// Handle al proceso hijo Python (para escribir en su stdin).
    child: Mutex<tauri::api::process::CommandChild>,
    /// Canales oneshot esperando respuesta del sidecar, indexados por request ID.
    pending: PendingMap,
}

// ── Comando Tauri ─────────────────────────────────────────────────────────────

/// Punto de entrada único para todas las acciones de auditoría.
/// JS llama: invoke('audit', { action: 'scan_ports' })
#[tauri::command]
async fn audit(
    action: String,
    state: tauri::State<'_, AppState>,
) -> Result<Value, String> {
    let id = next_id();
    let (tx, rx) = oneshot::channel::<Result<Value, String>>();

    // Registrar canal antes de escribir para evitar race condition.
    state.pending.lock().unwrap().insert(id.clone(), tx);

    let msg = format!("{}\n", serde_json::json!({ "id": id, "action": action }));

    state
        .child
        .lock()
        .unwrap()
        .write(msg.as_bytes())
        .map_err(|e| format!("Error escribiendo al sidecar: {e}"))?;

    rx.await
        .map_err(|_| "El sidecar cerró el canal inesperadamente.".to_string())?
}

// ── Resolución de ruta del sidecar Python ─────────────────────────────────────

/// En desarrollo, el exe está en src-tauri/target/debug/; subimos 3 niveles
/// para llegar a la raíz del proyecto ESTICC/ y luego a backend/main.py.
/// En producción se usa el binario empaquetado con PyInstaller.
fn python_script_path() -> std::path::PathBuf {
    let mut p = std::env::current_exe().expect("No se puede obtener la ruta del ejecutable.");
    p.pop(); // debug/
    p.pop(); // target/
    p.pop(); // src-tauri/
    p.push("backend");
    p.push("main.py");
    p
}

// ── Hilo lector de stdout del sidecar ────────────────────────────────────────

fn spawn_stdout_reader(
    mut rx: tauri::async_runtime::Receiver<CommandEvent>,
    pending: PendingMap,
) {
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    let line = line.trim().to_string();
                    if line.is_empty() {
                        continue;
                    }
                    match serde_json::from_str::<Value>(&line) {
                        Ok(msg) => {
                            let id = msg
                                .get("id")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();

                            if let Some(tx) = pending.lock().unwrap().remove(&id) {
                                let payload = if let Some(err) = msg.get("error") {
                                    Err(err.as_str().unwrap_or("Error desconocido").to_string())
                                } else {
                                    Ok(msg.get("result").cloned().unwrap_or(Value::Null))
                                };
                                let _ = tx.send(payload);
                            }
                        }
                        Err(e) => {
                            eprintln!("[sidecar stdout] JSON inválido: {e} — línea: {line}");
                        }
                    }
                }
                CommandEvent::Stderr(line) => {
                    eprintln!("[sidecar stderr] {line}");
                }
                CommandEvent::Terminated(status) => {
                    eprintln!("[sidecar] proceso terminado — estado: {:?}", status.code);
                    // Notificar a todos los canales pendientes que el sidecar cayó.
                    let mut map = pending.lock().unwrap();
                    for (_, tx) in map.drain() {
                        let _ = tx.send(Err("El sidecar se terminó inesperadamente.".to_string()));
                    }
                    break;
                }
                _ => {}
            }
        }
    });
}

// ── Punto de entrada ──────────────────────────────────────────────────────────

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let pending: PendingMap = Arc::new(Mutex::new(HashMap::new()));

            // Lanzar el sidecar Python.
            let (rx, child) = {
                #[cfg(debug_assertions)]
                {
                    let script = python_script_path();
                    Command::new("python")
                        .args([script.to_str().unwrap()])
                        .spawn()
                        .map_err(|e| format!("No se pudo iniciar Python: {e}"))?
                }
                #[cfg(not(debug_assertions))]
                {
                    // Producción: binario generado con PyInstaller, empaquetado en externalBin.
                    Command::new_sidecar("main")
                        .map_err(|e| format!("{e}"))?
                        .spawn()
                        .map_err(|e| format!("{e}"))?
                }
            };

            // Hilo de lectura de stdout en background.
            spawn_stdout_reader(rx, Arc::clone(&pending));

            // Registrar estado en el contenedor de Tauri.
            app.manage(AppState {
                child: Mutex::new(child),
                pending,
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![audit])
        .run(tauri::generate_context!())
        .expect("Error al iniciar ESTICC.");
}
