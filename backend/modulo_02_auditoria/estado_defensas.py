"""
Verificador del estado de las defensas del sistema.
Comprueba Firewall, Antivirus nativo (Windows Defender) y BitLocker.
Usa PowerShell para las consultas WMI/CIM que requieren privilegios mínimos.
"""
import time
import subprocess
import json
from datetime import datetime, timezone


def _ps(comando: str) -> str:
    resultado = subprocess.run(
        ["powershell", "-NonInteractive", "-Command", comando],
        capture_output=True, text=True, timeout=15
    )
    return resultado.stdout.strip()


def _estado_firewall() -> dict:
    try:
        salida = _ps(
            "Get-NetFirewallProfile | Select-Object -Property Name,Enabled | ConvertTo-Json"
        )
        perfiles = json.loads(salida)
        if isinstance(perfiles, dict):
            perfiles = [perfiles]
        todos_activos = all(p.get("Enabled", False) for p in perfiles)
        return {
            "activo": todos_activos,
            "perfiles": [{"nombre": p["Name"], "habilitado": p["Enabled"]} for p in perfiles],
        }
    except Exception as e:
        return {"activo": None, "error": str(e)}


def _estado_antivirus() -> dict:
    try:
        salida = _ps(
            "Get-MpComputerStatus | Select-Object AMServiceEnabled,RealTimeProtectionEnabled,AntivirusEnabled,AntispywareEnabled,NISEnabled | ConvertTo-Json"
        )
        datos = json.loads(salida)
        activo = all([
            datos.get("AMServiceEnabled", False),
            datos.get("RealTimeProtectionEnabled", False),
            datos.get("AntivirusEnabled", False),
        ])
        return {"activo": activo, "detalle": datos}
    except Exception as e:
        return {"activo": None, "error": str(e)}


def _estado_bitlocker() -> dict:
    try:
        salida = _ps(
            "Get-BitLockerVolume | Select-Object MountPoint,VolumeStatus,ProtectionStatus | ConvertTo-Json"
        )
        if not salida:
            return {"activo": False, "volumenes": [], "nota": "No se encontraron volúmenes cifrados o BitLocker no está disponible."}
        volumenes = json.loads(salida)
        if isinstance(volumenes, dict):
            volumenes = [volumenes]
        activo = any(v.get("ProtectionStatus") == 1 for v in volumenes)
        return {
            "activo": activo,
            "volumenes": [
                {
                    "unidad": v.get("MountPoint"),
                    "estado": v.get("VolumeStatus"),
                    "protegido": v.get("ProtectionStatus") == 1,
                }
                for v in volumenes
            ],
        }
    except Exception as e:
        return {"activo": None, "error": str(e)}


def run() -> dict:
    t0 = time.perf_counter()
    try:
        firewall  = _estado_firewall()
        antivirus = _estado_antivirus()
        bitlocker = _estado_bitlocker()

        # Nivel de riesgo global: ALTO si alguna defensa está caída
        defensas_ok = all([
            firewall.get("activo") is True,
            antivirus.get("activo") is True,
            bitlocker.get("activo") is True,
        ])

        duracion = int((time.perf_counter() - t0) * 1000)
        return {
            "ok": True,
            "data": {
                "firewall": firewall,
                "antivirus": antivirus,
                "bitlocker": bitlocker,
                "todas_defensas_activas": defensas_ok,
            },
            "meta": {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "duracion_ms": duracion,
            },
        }
    except Exception as e:
        return {
            "ok": False,
            "error": str(e),
            "meta": {"timestamp": datetime.now(timezone.utc).isoformat()},
        }
