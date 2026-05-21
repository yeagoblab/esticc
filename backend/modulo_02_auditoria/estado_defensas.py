"""
Verificador del estado de las defensas del sistema.
Comprueba Firewall, Antivirus nativo (Windows Defender) y BitLocker.
Usa PowerShell para las consultas WMI/CIM que requieren privilegios mínimos.
"""
import time       # Para medir duración del análisis
import subprocess # Para lanzar PowerShell como subproceso y capturar su salida
import json       # Para parsear el JSON que devuelven los cmdlets de PowerShell
from datetime import datetime, timezone


def _ps(comando: str) -> str:
    """Ejecuta un comando PowerShell y devuelve la salida como string."""
    resultado = subprocess.run(
        ["powershell", "-NonInteractive", "-Command", comando],
        # -NonInteractive: impide que PowerShell espere input del usuario (no se cuelga)
        capture_output=True,  # Captura stdout y stderr en memoria (no los muestra en consola)
        text=True,            # Decodifica la salida como texto UTF-8
        timeout=15            # Máximo 15 segundos para que el cmdlet responda
    )
    return resultado.stdout.strip()  # Eliminar espacios y saltos de línea del resultado


def _estado_firewall() -> dict:
    """Consulta el estado de los 3 perfiles del Firewall de Windows (Domain, Private, Public)."""
    try:
        # Get-NetFirewallProfile: cmdlet de Windows que devuelve los perfiles del firewall
        # ConvertTo-Json: convierte el objeto PowerShell a JSON para que Python lo pueda leer
        salida = _ps(
            "Get-NetFirewallProfile | Select-Object -Property Name,Enabled | ConvertTo-Json"
        )
        perfiles = json.loads(salida)  # Convertir JSON → lista de dicts Python

        # ConvertTo-Json devuelve un dict (no lista) si solo hay un perfil → normalizar
        if isinstance(perfiles, dict):
            perfiles = [perfiles]

        # El firewall está "activo" solo si LOS TRES perfiles están habilitados
        todos_activos = all(p.get("Enabled", False) for p in perfiles)

        return {
            "activo":   todos_activos,  # True si Domain + Private + Public están todos activos
            "perfiles": [
                {"nombre": p["Name"], "habilitado": p["Enabled"]}  # Detalle por perfil
                for p in perfiles
            ],
        }
    except Exception as e:
        return {"activo": None, "error": str(e)}  # None indica "no se pudo comprobar"


def _estado_antivirus() -> dict:
    """Consulta el estado de Windows Defender / Microsoft Defender Antivirus."""
    try:
        # Get-MpComputerStatus: cmdlet de Windows Defender con el estado detallado
        salida = _ps(
            "Get-MpComputerStatus | Select-Object "
            "AMServiceEnabled,RealTimeProtectionEnabled,AntivirusEnabled,"
            "AntispywareEnabled,NISEnabled | ConvertTo-Json"
        )
        datos = json.loads(salida)  # Dict con los campos de estado del antivirus

        # El antivirus se considera "activo" solo si los 3 componentes principales están habilitados
        activo = all([
            datos.get("AMServiceEnabled",         False),  # Servicio de antimalware activo
            datos.get("RealTimeProtectionEnabled", False),  # Protección en tiempo real activa
            datos.get("AntivirusEnabled",          False),  # Motor antivirus habilitado
        ])

        return {
            "activo":  activo,  # True solo si los 3 componentes están activos simultáneamente
            "detalle": datos,   # Devolvemos todos los campos para el modo avanzado de la UI
        }
    except Exception as e:
        return {"activo": None, "error": str(e)}


def _estado_bitlocker() -> dict:
    """Comprueba si el cifrado de disco BitLocker está activo en algún volumen."""
    try:
        # Get-BitLockerVolume: cmdlet que requiere el módulo BitLocker de PowerShell
        # No todos los Windows tienen BitLocker (solo Pro, Enterprise, Education)
        salida = _ps(
            "Get-BitLockerVolume | Select-Object MountPoint,VolumeStatus,ProtectionStatus | ConvertTo-Json"
        )

        if not salida:
            # Sin salida significa que no hay volúmenes BitLocker o que no está disponible
            return {
                "activo":   False,
                "volumenes": [],
                "nota": "No se encontraron volúmenes cifrados o BitLocker no está disponible.",
            }

        volumenes = json.loads(salida)  # Lista de volúmenes (o dict si solo hay uno)
        if isinstance(volumenes, dict):
            volumenes = [volumenes]  # Normalizar a lista

        # ProtectionStatus == 1 significa que la protección BitLocker está activa en ese volumen
        # (0 = desprotegido, 1 = protegido, 2 = protección suspendida temporalmente)
        activo = any(v.get("ProtectionStatus") == 1 for v in volumenes)

        return {
            "activo":   activo,  # True si AL MENOS un volumen tiene BitLocker activo
            "volumenes": [
                {
                    "unidad":    v.get("MountPoint"),          # Ej: "C:", "D:"
                    "estado":    v.get("VolumeStatus"),         # Ej: "FullyEncrypted", "FullyDecrypted"
                    "protegido": v.get("ProtectionStatus") == 1, # True si BitLocker activo
                }
                for v in volumenes
            ],
        }
    except Exception as e:
        return {"activo": None, "error": str(e)}


def run() -> dict:
    """Ejecuta los 3 comprobadores de defensa y agrega los resultados."""
    t0 = time.perf_counter()
    try:
        firewall  = _estado_firewall()   # Comprobación del Firewall de Windows
        antivirus = _estado_antivirus()  # Comprobación de Windows Defender
        bitlocker = _estado_bitlocker()  # Comprobación del cifrado de disco

        # El sistema solo está "completamente defendido" si LAS TRES defensas están activas
        # Se usa `is True` (no solo truthy) para distinguir True de None ("desconocido")
        defensas_ok = all([
            firewall.get("activo")  is True,
            antivirus.get("activo") is True,
            bitlocker.get("activo") is True,
        ])

        duracion = int((time.perf_counter() - t0) * 1000)

        return {
            "ok":   True,
            "data": {
                "firewall":              firewall,    # Estado detallado del Firewall
                "antivirus":             antivirus,   # Estado detallado de Defender
                "bitlocker":             bitlocker,   # Estado detallado de BitLocker
                "todas_defensas_activas": defensas_ok, # Resumen booleano para la vista básica
            },
            "meta": {
                "timestamp":  datetime.now(timezone.utc).isoformat(),
                "duracion_ms": duracion,
            },
        }
    except Exception as e:
        return {
            "ok":    False,
            "error": str(e),
            "meta":  {"timestamp": datetime.now(timezone.utc).isoformat()},
        }
