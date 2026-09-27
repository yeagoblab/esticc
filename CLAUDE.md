# CLAUDE.md

Este fichero da contexto a Claude Code (claude.ai/code) al trabajar en este repositorio.

## Qué es esto

Panel de seguridad de escritorio para Windows (Tauri + sidecar Python). El `README.md` tiene la lista completa de funcionalidades, protocolo IPC acción por acción y el árbol de ficheros comentado — no lo dupliques aquí; esta guía se centra en lo que cruza Rust/Python/JS y no es obvio leyendo un único fichero.

## Comandos

```bat
setup.bat                          :: una sola vez — crea el venv de Python e instala Tauri CLI
run.bat                            :: modo desarrollo (cargo tauri dev + sidecar Python desde el venv)
cd scripts && .\package_release.ps1  :: empaqueta ESTICC_portable\ en el ZIP de release (requiere haber corrido antes "cargo tauri build")
.\installer\build_installer.ps1    :: compila el instalador gráfico (esticc_installer.py) con PyInstaller
```

No hay tests automatizados ni CI.

## Arquitectura

**Dos procesos, un solo protocolo de líneas JSON por stdin/stdout** (documentado en detalle en el README): `src-tauri/src/main.rs` lanza el sidecar (Python en dev desde `backend/.venv`, `backend.exe` ya compilado en release) y correla petición↔respuesta con un `HashMap<id, oneshot::Sender>` (`PendingMap`) — cada `invoke("audit", …)` de JS genera un id único, y un hilo lector de stdout separado resuelve el canal correspondiente cuando llega la línea con ese id. `backend/main.py` es el router del lado Python: despacha cada línea entrante a un `ThreadPoolExecutor(max_workers=8)` para que un escáner lento (`scan_patches`, ~120s) no bloquee a uno rápido (`scan_ports`).

**Restricción crítica no obvia**: stdout del sidecar Python **es** el canal IPC. Cualquier `print()` suelto en un módulo de `backend/` (fuera de la función `enviar()` de `main.py`) corrompe el protocolo — Rust intentará parsear esa línea como JSON y fallará silenciosamente. `sys.stdin`/`sys.stdout` se reconfiguran a UTF-8 explícito al arrancar porque Windows usa CP1252 por defecto en el pipe (ver `main.py`); los mensajes salen con `ensure_ascii=True` por el mismo motivo (ver el `mojibake` de la v0.6.2 en el CHANGELOG).

**Cada módulo de `backend/modulo_0N_*` es independiente** (una función `run()` por escáner) y se registra a mano en el diccionario `ACCIONES_SIMPLES`/`ACCIONES_CONOCIDAS` de `main.py` — añadir una acción nueva implica tocar ese diccionario, no solo crear el módulo.

**Frontend sin bundler**: `frontend/index.html` es una SPA única que carga directamente los `.js`/`.css` de cada panel (no hay Node.js ni paso de build); cada panel es un par de ficheros `frontend/js/<panel>.js` + `frontend/css/<panel>.css` independiente.

## Gotcha: la versión vive en tres sitios

`tauri.conf.json` (`package.version`) es la fuente de verdad. `Cargo.toml` debe coincidir a mano. `backend/modulo_07_actualizador/actualizador.py` (`VERSION_ACTUAL`) se sincroniza **automáticamente** desde `tauri.conf.json` al correr `package_release.ps1` — pero solo ese fichero; si se te olvida actualizar `Cargo.toml` a mano, el binario compilado reportará una versión distinta a la que ve el actualizador in-app (ya pasó en la v0.5.2 y la v0.5.3, ver CHANGELOG). El script usa Python para el reemplazo de texto en vez de `Get-Content`/`Set-Content` de PowerShell 5.1 porque este último corrompía el UTF-8 (mojibake, v0.6.2).

## Notas de seguridad

ESTICC solo lee el sistema local (sin escritura ni cambios de configuración) y el Radar OSINT solo hace GET a feeds RSS públicos — nunca envía datos del equipo a servidores externos. Repo público bajo licencia MIT.
