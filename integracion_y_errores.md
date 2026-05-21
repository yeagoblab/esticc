# ESTICC — Integración y Errores

## Descripción general
Panel de control unificado de seguridad local (Single Pane of Glass). Stack: Tauri (frontend) + Python sidecar (backend). IPC via stdin/stdout JSON.

## Stack
| Capa | Tecnología |
|---|---|
| Shell nativa | Tauri (Rust) |
| UI | HTML/CSS/JS |
| Backend / Auditoría | Python 3.11+ (sidecar) |
| Persistencia | SQLite3 |
| OSINT | feedparser (RSS) |

## Módulos registrados
| ID | Nombre | Estado |
|---|---|---|
| modulo_02_auditoria | Auditoría Local | En desarrollo |

## Errores conocidos
_Ninguno aún._

## Decisiones de integración
- El sidecar Python se lanza desde Tauri como proceso hijo. Comunicación por stdin/stdout con mensajes JSON delimitados por newline.
- En Windows, `analisis_autoinicio.py` y `estado_defensas.py` requieren ejecución con privilegios o acceso a winreg (usuario estándar puede leer HKCU, HKLM puede requerir admin para ciertas claves).
