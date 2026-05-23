"""
modulo_05_historial/historial_defender.py
Consulta el historial de análisis de Windows Defender:
  - Último análisis rápido y completo (Get-MpComputerStatus)
  - Historial de análisis recientes del Registro de Eventos de Windows
  - Últimas detecciones de amenazas
"""
from __future__ import annotations
import subprocess, json, time
from datetime import datetime, timezone


def _ps(cmd: str, timeout: int = 20) -> str:
    """Ejecuta PowerShell y devuelve stdout como string. Silencia errores."""
    try:
        r = subprocess.run(
            ["powershell", "-NonInteractive", "-Command", cmd],
            capture_output=True, text=True, timeout=timeout,
        )
        return r.stdout.strip()
    except Exception:
        return ""


def _parse_fecha(valor: str | None) -> str | None:
    """Convierte fechas WMI/PS a ISO-8601. Devuelve None si no se puede parsear."""
    if not valor:
        return None
    # PowerShell serializa fechas como "/Date(ms_epoch)/" o ISO string
    if isinstance(valor, str) and valor.startswith("/Date("):
        try:
            ms = int(valor[6:valor.index(")")])
            return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat()
        except Exception:
            return None
    try:
        # Intentar parsear como ISO directamente
        dt = datetime.fromisoformat(valor.replace("Z", "+00:00"))
        return dt.isoformat()
    except Exception:
        return valor  # Devolver tal cual si no se puede parsear


def _estado_actual() -> dict:
    """Obtiene el estado actual de Defender y las fechas del último análisis."""
    raw = _ps(
        "Get-MpComputerStatus | Select-Object "
        "LastFullScanTime,LastQuickScanTime,QuickScanAge,FullScanAge,"
        "AMServiceEnabled,RealTimeProtectionEnabled,AntivirusEnabled,"
        "NISEnabled,LastFullScanSource,LastQuickScanSource | ConvertTo-Json"
    )
    if not raw:
        return {}
    try:
        d = json.loads(raw)
        return {
            "ultimo_analisis_rapido":  _parse_fecha(d.get("LastQuickScanTime")),
            "ultimo_analisis_completo": _parse_fecha(d.get("LastFullScanTime")),
            "dias_desde_rapido":       d.get("QuickScanAge"),
            "dias_desde_completo":     d.get("FullScanAge"),
            "defender_activo":         d.get("AMServiceEnabled"),
            "proteccion_tiempo_real":  d.get("RealTimeProtectionEnabled"),
        }
    except Exception:
        return {}


def _historial_eventos(max_eventos: int = 60) -> list[dict]:
    """
    Lee el Registro de Eventos de Windows Defender para extraer análisis recientes.
    IDs relevantes:
      1000 = Análisis antimalware iniciado
      1001 = Análisis antimalware completado
      1116 = Amenaza detectada
      1117 = Acción tomada sobre amenaza
    """
    cmd = f"""
        try {{
            Get-WinEvent -LogName 'Microsoft-Windows-Windows Defender/Operational' `
                -MaxEvents {max_eventos} -ErrorAction Stop |
            Where-Object {{ $_.Id -in @(1000,1001,1116,1117) }} |
            Select-Object TimeCreated,Id,LevelDisplayName,Message |
            ConvertTo-Json -Depth 2
        }} catch {{
            Write-Output '[]'
        }}
    """
    raw = _ps(cmd, timeout=15)
    if not raw or raw == "[]":
        return []
    try:
        eventos = json.loads(raw)
        if isinstance(eventos, dict):
            eventos = [eventos]

        resultado = []
        tipos = {
            1000: "inicio_analisis",
            1001: "fin_analisis",
            1116: "amenaza_detectada",
            1117: "accion_tomada",
        }
        etiquetas = {
            1000: "Análisis iniciado",
            1001: "Análisis completado",
            1116: "Amenaza detectada",
            1117: "Acción tomada",
        }
        for ev in eventos:
            eid = ev.get("Id")
            # Extraer primera línea del mensaje (es un texto largo)
            msg_raw = ev.get("Message") or ""
            msg = msg_raw.split("\n")[0].strip()[:120] if msg_raw else ""
            resultado.append({
                "timestamp": _parse_fecha(ev.get("TimeCreated")),
                "tipo":      tipos.get(eid, "evento"),
                "etiqueta":  etiquetas.get(eid, f"Evento {eid}"),
                "nivel":     ev.get("LevelDisplayName", ""),
                "mensaje":   msg,
                "evento_id": eid,
                "fuente":    "defender",
            })
        return resultado
    except Exception:
        return []


def _amenazas_recientes(max_amenazas: int = 10) -> list[dict]:
    """Obtiene las últimas detecciones de amenazas de Windows Defender."""
    raw = _ps(
        f"Get-MpThreatDetection | "
        "Select-Object InitialDetectionTime,ThreatID,ActionSuccess,ProcessName,Resources | "
        f"Select-Object -First {max_amenazas} | ConvertTo-Json"
    )
    if not raw:
        return []
    try:
        amenazas = json.loads(raw)
        if isinstance(amenazas, dict):
            amenazas = [amenazas]
        return [
            {
                "timestamp":    _parse_fecha(a.get("InitialDetectionTime")),
                "threat_id":    a.get("ThreatID"),
                "accion_ok":    a.get("ActionSuccess"),
                "proceso":      a.get("ProcessName"),
                "recursos":     a.get("Resources"),
                "fuente":       "defender",
                "tipo":         "amenaza_detectada",
            }
            for a in amenazas
        ]
    except Exception:
        return []


def run() -> dict:
    """Punto de entrada IPC: devuelve estado actual + historial de eventos de Defender."""
    t0 = time.perf_counter()

    estado   = _estado_actual()
    eventos  = _historial_eventos()
    amenazas = _amenazas_recientes()

    duracion = int((time.perf_counter() - t0) * 1000)

    return {
        "ok": True,
        "data": {
            "estado":   estado,
            "eventos":  eventos,
            "amenazas": amenazas,
        },
        "meta": {
            "timestamp":   datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "duracion_ms": duracion,
        },
    }
