"""
Comprobador de parches de Windows Update.
Consulta actualizaciones pendientes vía PowerShell (PSWindowsUpdate o WUA COM).
Si PSWindowsUpdate no está instalado, cae a la última fecha de actualización del registro.
"""
import time
import subprocess
import json
import winreg
from datetime import datetime, timezone


def _actualizaciones_pendientes_ps() -> list[dict] | None:
    """Intenta obtener actualizaciones pendientes con PSWindowsUpdate."""
    try:
        salida = subprocess.run(
            [
                "powershell", "-NonInteractive", "-Command",
                "Get-WindowsUpdate -NotInstalled -MicrosoftUpdate | "
                "Select-Object KB,Title,Size,MandatoryReboot | ConvertTo-Json"
            ],
            capture_output=True, text=True, timeout=30
        )
        if salida.returncode != 0 or not salida.stdout.strip():
            return None
        datos = json.loads(salida.stdout.strip())
        if isinstance(datos, dict):
            datos = [datos]
        return [
            {
                "kb": d.get("KB", ""),
                "titulo": d.get("Title", ""),
                "reinicio_requerido": d.get("MandatoryReboot", False),
            }
            for d in datos
        ]
    except Exception:
        return None


def _fecha_ultima_actualizacion() -> str:
    """Lee la fecha de la última actualización exitosa desde el registro."""
    try:
        with winreg.OpenKey(
            winreg.HKEY_LOCAL_MACHINE,
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\Results\Install"
        ) as key:
            valor, _ = winreg.QueryValueEx(key, "LastSuccessTime")
            return valor
    except Exception:
        return "Desconocida"


def _actualizaciones_pendientes_wua() -> list[dict]:
    """Consulta WUA COM directamente desde PowerShell como alternativa."""
    try:
        script = (
            "$s = New-Object -ComObject Microsoft.Update.Session;"
            "$b = $s.CreateUpdateSearcher();"
            "$r = $b.Search('IsInstalled=0');"
            "$r.Updates | Select-Object Title,IsMandatory | ConvertTo-Json"
        )
        salida = subprocess.run(
            ["powershell", "-NonInteractive", "-Command", script],
            capture_output=True, text=True, timeout=60
        )
        if not salida.stdout.strip():
            return []
        datos = json.loads(salida.stdout.strip())
        if isinstance(datos, dict):
            datos = [datos]
        return [{"titulo": d.get("Title", ""), "obligatoria": d.get("IsMandatory", False)} for d in datos]
    except Exception:
        return []


def run() -> dict:
    t0 = time.perf_counter()
    try:
        pendientes = _actualizaciones_pendientes_ps()
        metodo = "PSWindowsUpdate"
        if pendientes is None:
            pendientes = _actualizaciones_pendientes_wua()
            metodo = "WUA COM"

        ultima_actualizacion = _fecha_ultima_actualizacion()
        duracion = int((time.perf_counter() - t0) * 1000)
        return {
            "ok": True,
            "data": {
                "actualizaciones_pendientes": pendientes,
                "ultima_actualizacion_exitosa": ultima_actualizacion,
                "sistema_actualizado": len(pendientes) == 0,
            },
            "meta": {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "duracion_ms": duracion,
                "metodo": metodo,
                "total_pendientes": len(pendientes),
            },
        }
    except Exception as e:
        return {
            "ok": False,
            "error": str(e),
            "meta": {"timestamp": datetime.now(timezone.utc).isoformat()},
        }
