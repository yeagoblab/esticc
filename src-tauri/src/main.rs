// En builds de release (--release), ocultar la ventana de consola negra de Windows
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;  // HashMap: tabla hash para mapear IDs de petición → canales de respuesta
use std::io::{BufRead, BufReader, Write};  // BufRead: lectura línea a línea | Write: escribir al stdin del sidecar
use std::process::{Command, Stdio};  // Command: lanzar subprocesos | Stdio: configurar pipes stdin/stdout
use std::sync::atomic::{AtomicU64, Ordering};  // AtomicU64: contador thread-safe para IDs únicos
use std::sync::{Arc, Mutex};  // Arc: referencia contada para compartir datos entre hilos | Mutex: exclusión mutua

use serde_json::Value;  // Value: tipo JSON genérico (puede ser objeto, array, string, número...)
use tauri::Manager;     // Manager: trait de Tauri necesario para usar app.manage()
use tokio::sync::oneshot;  // oneshot: canal async de un solo uso (envía exactamente un valor)

// ── Generador de IDs únicos ────────────────────────────────────────────────────

// Contador atómico global: garantiza IDs únicos aunque varios hilos llamen a next_id() a la vez
static REQ_ID: AtomicU64 = AtomicU64::new(0);

fn next_id() -> String {
    // fetch_add: incrementa y devuelve el valor anterior en una operación atómica (thread-safe)
    // Ordering::Relaxed: no necesitamos garantías de orden de memoria, solo atomicidad
    REQ_ID.fetch_add(1, Ordering::Relaxed).to_string()
}

// ── Tipos del estado compartido ────────────────────────────────────────────────

// PendingMap: tabla que asocia cada ID de petición con el canal donde se enviará la respuesta
// Arc<Mutex<...>>: permite compartir el mapa entre el hilo de Rust y el hilo lector de stdout
type PendingMap = Arc<Mutex<HashMap<String, oneshot::Sender<Result<Value, String>>>>>;

// AppState: datos compartidos entre el comando `audit` (async) y el lector de stdout (hilo separado)
struct AppState {
    stdin:   Mutex<std::process::ChildStdin>,  // Canal de escritura al stdin del sidecar Python
    pending: PendingMap,                       // Mapa ID → canal de respuesta para peticiones en vuelo
}

// ── Comando Tauri (invocable desde JavaScript) ─────────────────────────────────

// #[tauri::command]: registra esta función como un comando invocable con window.__TAURI__.tauri.invoke()
#[tauri::command]
async fn audit(
    action:  String,         // Nombre de la acción a ejecutar en el sidecar Python
    payload: Option<Value>,  // Datos adicionales opcionales (ej: {context: {...}} para radar_correlate)
    state:   tauri::State<'_, AppState>,  // Estado compartido inyectado por Tauri automáticamente
) -> Result<Value, String> {  // Ok(Value) si el sidecar responde bien, Err(String) si hay error

    let id = next_id();  // Generar un ID único para correlacionar la respuesta con esta petición

    // Crear un canal oneshot: tx envía exactamente un valor, rx lo recibe de forma async
    // tx se guarda en pending hasta que el sidecar responda; rx espera la respuesta
    let (tx, rx) = oneshot::channel::<Result<Value, String>>();

    // Registrar el canal de respuesta en el mapa antes de enviar la petición
    // (si registráramos después, la respuesta podría llegar antes que el registro)
    state.pending.lock().unwrap().insert(id.clone(), tx);

    // Construir el objeto JSON de la petición con id y action
    let mut msg = serde_json::json!({ "id": id, "action": action });

    // Si hay payload, fusionar sus campos en el objeto de la petición
    // Ej: payload={context:{...}} → msg queda {id, action, context:{...}}
    if let Some(p) = payload {
        if let (Some(obj), Some(p_obj)) = (msg.as_object_mut(), p.as_object()) {
            for (k, v) in p_obj {
                obj.insert(k.clone(), v.clone());  // Copiar cada campo del payload al mensaje
            }
        }
    }

    // Serializar el JSON a string, añadir \n (el protocolo IPC usa líneas) y enviarlo al sidecar
    let line = format!("{}\n", msg);
    state
        .stdin
        .lock()
        .unwrap()
        .write_all(line.as_bytes())  // Escribir los bytes del JSON al pipe stdin del proceso Python
        .map_err(|e| format!("Error escribiendo al sidecar: {e}"))?;  // Convertir Error de IO a String

    // Esperar de forma asíncrona a que el lector de stdout coloque la respuesta en el canal
    // map_err convierte el error de canal caído (sidecar terminó) a un mensaje legible
    rx.await
        .map_err(|_| "El sidecar cerró el canal inesperadamente.".to_string())?
    // El ? propaga el Err hacia arriba; si Ok(inner), inner puede ser Ok(Value) o Err(String)
}

// ── Ruta del script Python del sidecar ────────────────────────────────────────

fn python_script_path() -> std::path::PathBuf {
    // Obtener la ruta del ejecutable de Tauri en tiempo de ejecución
    // En desarrollo: .../ESTICC/src-tauri/target/debug/esticc.exe
    let mut p = std::env::current_exe().expect("No se puede obtener la ruta del ejecutable.");

    p.pop();  // Eliminar "esticc.exe"  → .../ESTICC/src-tauri/target/debug/
    p.pop();  // Eliminar "debug/"      → .../ESTICC/src-tauri/target/
    p.pop();  // Eliminar "target/"     → .../ESTICC/src-tauri/
    p.pop();  // Eliminar "src-tauri/"  → .../ESTICC/

    p.push("backend");   // Bajar a la carpeta del sidecar
    p.push("main.py");   // Apuntar al script principal

    p  // Resultado: .../ESTICC/backend/main.py
}

// ── Lector de stdout del sidecar ──────────────────────────────────────────────

fn spawn_stdout_reader(stdout: std::process::ChildStdout, pending: PendingMap) {
    // Lanzar un hilo dedicado para leer las respuestas del sidecar Python
    // Un hilo separado es necesario porque Rust no puede hacer await en código síncrono
    std::thread::spawn(move || {
        // BufReader envuelve el stdout del proceso para poder leer línea a línea eficientemente
        let reader = BufReader::new(stdout);

        for line in reader.lines() {  // Iterar indefinidamente hasta EOF (sidecar termina)
            match line {
                Ok(line) => {
                    let line = line.trim().to_string();  // Eliminar \r\n o espacios sobrantes
                    if line.is_empty() {
                        continue;  // Ignorar líneas vacías (pueden aparecer entre respuestas)
                    }

                    // Intentar parsear el JSON de la respuesta del sidecar
                    match serde_json::from_str::<Value>(&line) {
                        Ok(msg) => {
                            // Extraer el ID de la respuesta para encontrar el canal correspondiente
                            let id = msg
                                .get("id")
                                .and_then(|v| v.as_str())  // Extraer como &str
                                .unwrap_or("")              // Usar "" si no hay campo "id"
                                .to_string();

                            // Buscar y eliminar el canal de respuesta del mapa (consume el Sender)
                            if let Some(tx) = pending.lock().unwrap().remove(&id) {
                                // Construir el payload de la respuesta según si es error o resultado
                                let payload = if let Some(err) = msg.get("error") {
                                    // El sidecar devolvió un error: {"id": "...", "error": "..."}
                                    Err(err.as_str().unwrap_or("Error desconocido").to_string())
                                } else {
                                    // El sidecar devolvió un resultado: {"id": "...", "result": {...}}
                                    Ok(msg.get("result").cloned().unwrap_or(Value::Null))
                                };
                                let _ = tx.send(payload);  // Despertar al hilo async que está en rx.await
                            }
                            // Si el ID no está en pending, la petición ya expiró o fue cancelada
                        }
                        Err(e) => {
                            // JSON malformado en stdout: loguear pero no crashear el lector
                            eprintln!("[sidecar] JSON inválido: {e} — «{line}»");
                        }
                    }
                }
                Err(e) => {
                    // Error de lectura del pipe: el sidecar probablemente ha terminado
                    eprintln!("[sidecar] Error de lectura stdout: {e}");
                    break;  // Salir del bucle para ir a la limpieza de peticiones pendientes
                }
            }
        }

        // EOF o error: notificar a todas las peticiones pendientes que el sidecar cayó
        // Sin esto, los rx.await de los comandos `audit` pendientes esperarían para siempre
        let mut map = pending.lock().unwrap();
        for (_, tx) in map.drain() {  // drain() vacía el mapa y devuelve todos los pares
            let _ = tx.send(Err("El sidecar se terminó inesperadamente.".to_string()));
        }
    });
}

// ── Punto de entrada de la aplicación ─────────────────────────────────────────

fn main() {
    tauri::Builder::default()
        .setup(|app| -> Result<(), Box<dyn std::error::Error>> {
            // El mapa de peticiones pendientes se comparte entre el comando audit y el lector de stdout
            let pending: PendingMap = Arc::new(Mutex::new(HashMap::new()));

            // Calcular la ruta del sidecar Python en tiempo de ejecución (no hardcodeada)
            let script = python_script_path();
            eprintln!("[setup] Lanzando sidecar: python {:?}", script);

            // El directorio de trabajo del sidecar debe ser "backend/" para que Python
            // pueda importar "modulo_02_auditoria" y "modulo_03_radar" como paquetes
            let backend_dir = script.parent().expect("backend/ sin parent");

            // Lanzar el proceso Python con pipes para stdin y stdout (protocolo IPC)
            let mut child = Command::new("python")
                .arg(&script)                    // Ruta al script main.py
                .current_dir(backend_dir)         // Directorio de trabajo = backend/ (necesario para imports)
                .stdin(Stdio::piped())            // stdin del hijo conectado a un pipe (Rust escribe aquí)
                .stdout(Stdio::piped())           // stdout del hijo conectado a un pipe (Rust lee aquí)
                .stderr(Stdio::inherit())         // stderr del hijo va directamente a la consola de dev
                .spawn()?;                        // Lanzar el proceso; ? propaga error si Python no está instalado

            // Extraer los handles de los pipes antes de que `child` se mueva
            let stdout = child.stdout.take().expect("stdout no disponible");
            let stdin  = child.stdin.take().expect("stdin no disponible");

            // Iniciar el hilo lector de stdout pasándole el pipe y el mapa de pendientes
            spawn_stdout_reader(stdout, Arc::clone(&pending));

            // Registrar el estado compartido en Tauri para que sea accesible desde los comandos
            app.manage(AppState {
                stdin:   Mutex::new(stdin),  // El Mutex protege el stdin de accesos concurrentes
                pending,                     // El mapa de peticiones pendientes
            });

            Ok(())
        })
        // Registrar el comando `audit` como handler invocable desde JavaScript
        .invoke_handler(tauri::generate_handler![audit])
        .run(tauri::generate_context!())  // Cargar tauri.conf.json y arrancar el event loop de la UI
        .expect("Error al iniciar ESTICC.");
}
