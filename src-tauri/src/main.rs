#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use serde_json::Value;
use tauri::Manager;
use tokio::sync::oneshot;

// ── ID de solicitudes ─────────────────────────────────────────────────────────

static REQ_ID: AtomicU64 = AtomicU64::new(0);

fn next_id() -> String {
    REQ_ID.fetch_add(1, Ordering::Relaxed).to_string()
}

// ── Estado compartido ─────────────────────────────────────────────────────────

type PendingMap = Arc<Mutex<HashMap<String, oneshot::Sender<Result<Value, String>>>>>;

struct AppState {
    stdin:   Mutex<std::process::ChildStdin>,
    pending: PendingMap,
}

// ── Comando Tauri ─────────────────────────────────────────────────────────────

#[tauri::command]
async fn audit(
    action: String,
    state: tauri::State<'_, AppState>,
) -> Result<Value, String> {
    let id = next_id();
    let (tx, rx) = oneshot::channel::<Result<Value, String>>();

    state.pending.lock().unwrap().insert(id.clone(), tx);

    let msg = format!("{}\n", serde_json::json!({ "id": id, "action": action }));
    state
        .stdin
        .lock()
        .unwrap()
        .write_all(msg.as_bytes())
        .map_err(|e| format!("Error escribiendo al sidecar: {e}"))?;

    rx.await
        .map_err(|_| "El sidecar cerró el canal inesperadamente.".to_string())?
}

// ── Ruta del script Python ────────────────────────────────────────────────────

fn python_script_path() -> std::path::PathBuf {
    // En dev, el exe está en src-tauri/target/debug/; subimos 3 niveles.
    let mut p = std::env::current_exe().expect("No se puede obtener la ruta del ejecutable.");
    p.pop(); // esticc.exe
    p.pop(); // debug/
    p.pop(); // target/
    p.pop(); // src-tauri/
    p.push("backend");
    p.push("main.py");
    p
}

// ── Lector de stdout del sidecar ─────────────────────────────────────────────

fn spawn_stdout_reader(stdout: std::process::ChildStdout, pending: PendingMap) {
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(line) => {
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
                            eprintln!("[sidecar] JSON inválido: {e} — «{line}»");
                        }
                    }
                }
                Err(e) => {
                    eprintln!("[sidecar] Error de lectura stdout: {e}");
                    break;
                }
            }
        }
        // EOF: notificar a todos los pendientes que el sidecar cayó.
        let mut map = pending.lock().unwrap();
        for (_, tx) in map.drain() {
            let _ = tx.send(Err("El sidecar se terminó inesperadamente.".to_string()));
        }
    });
}

// ── Punto de entrada ──────────────────────────────────────────────────────────

fn main() {
    tauri::Builder::default()
        .setup(|app| -> Result<(), Box<dyn std::error::Error>> {
            let pending: PendingMap = Arc::new(Mutex::new(HashMap::new()));

            let script = python_script_path();
            eprintln!("[setup] Lanzando sidecar: python {:?}", script);

            let backend_dir = script.parent().expect("backend/ sin parent");
            let mut child = Command::new("python")
                .arg(&script)
                .current_dir(backend_dir)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::inherit())
                .spawn()?;

            let stdout = child.stdout.take().expect("stdout no disponible");
            let stdin  = child.stdin.take().expect("stdin no disponible");

            spawn_stdout_reader(stdout, Arc::clone(&pending));

            app.manage(AppState {
                stdin:   Mutex::new(stdin),
                pending,
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![audit])
        .run(tauri::generate_context!())
        .expect("Error al iniciar ESTICC.");
}
