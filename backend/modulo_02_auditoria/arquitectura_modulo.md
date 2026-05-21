# Arquitectura — modulo_02_auditoria

## Responsabilidad
Proporcionar cinco auditorías locales del sistema operativo Windows. Cada script es independiente, devuelve un dict Python serializable a JSON y no tiene efectos secundarios en el sistema.

## Scripts
| Archivo | Función | Librería principal |
|---|---|---|
| `escaner_puertos.py` | Lista sockets TCP activos con PID y proceso propietario | `psutil` |
| `escaner_procesos.py` | Procesos ordenados por CPU/RAM, marcando consumo excesivo | `psutil` |
| `analisis_autoinicio.py` | Entradas Run/RunOnce del registro + tareas programadas | `winreg`, `subprocess` |
| `estado_defensas.py` | Estado de Firewall, AV nativo y BitLocker | `winreg`, `subprocess` (PowerShell) |
| `verificador_parches.py` | Actualizaciones pendientes de Windows Update | `subprocess` (PowerShell) |

## Contrato de salida (JSON)
Todos los scripts exponen una función `run() -> dict` con la siguiente forma:
```json
{
  "ok": true,
  "data": [...],
  "meta": { "timestamp": "ISO8601", "duracion_ms": 120 }
}
```
En caso de error:
```json
{
  "ok": false,
  "error": "Mensaje legible",
  "meta": { "timestamp": "ISO8601" }
}
```

## Privilegios requeridos
- `escaner_puertos.py`, `escaner_procesos.py`: usuario estándar.
- `analisis_autoinicio.py`: HKCU sin admin; HKLM puede requerir admin.
- `estado_defensas.py`: PowerShell `Get-MpComputerStatus` puede requerir admin.
- `verificador_parches.py`: PowerShell `Get-WindowsUpdateLog` requiere admin para detalles completos.
