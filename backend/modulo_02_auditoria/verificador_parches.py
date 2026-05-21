"""
Comprobador de parches de Windows Update.
Consulta actualizaciones pendientes vía PowerShell (PSWindowsUpdate o WUA COM).
Si PSWindowsUpdate no está instalado, cae a la API WUA COM (siempre disponible en Windows).
"""
from __future__ import annotations  # Permite anotaciones modernas en Python 3.8/3.9

import time       # Para medir la duración del análisis
import subprocess # Para ejecutar PowerShell como subproceso
import json       # Para parsear la salida JSON de los cmdlets
import winreg     # Para leer la fecha de la última actualización desde el registro
from datetime import datetime, timezone


def _actualizaciones_pendientes_ps() -> list[dict] | None:
    """
    Intenta obtener actualizaciones pendientes usando el módulo PSWindowsUpdate.
    Devuelve None si PSWindowsUpdate no está instalado (fallback a WUA COM).
    """
    try:
        salida = subprocess.run(
            [
                "powershell", "-NonInteractive", "-Command",
                # Get-WindowsUpdate: cmdlet del módulo PSWindowsUpdate (no viene con Windows)
                # -NotInstalled: solo actualizaciones que faltan
                # -MicrosoftUpdate: incluye actualizaciones de Office y otros productos Microsoft
                "Get-WindowsUpdate -NotInstalled -MicrosoftUpdate | "
                "Select-Object KB,Title,Size,MandatoryReboot | ConvertTo-Json"
            ],
            capture_output=True,
            text=True,
            timeout=30  # PSWindowsUpdate puede tardar bastante en consultar los servidores de Microsoft
        )
        # Si el comando falla (módulo no instalado) o la salida está vacía, señalizar con None
        if salida.returncode != 0 or not salida.stdout.strip():
            return None

        datos = json.loads(salida.stdout.strip())  # Parsear lista de actualizaciones
        if isinstance(datos, dict):
            datos = [datos]  # Normalizar a lista si solo hay una actualización

        # Mapear cada actualización al formato estándar de ESTICC
        return [
            {
                "kb":                d.get("KB",             ""),    # Número de Knowledge Base, ej: "KB5034441"
                "titulo":            d.get("Title",          ""),    # Descripción de la actualización
                "reinicio_requerido": d.get("MandatoryReboot", False), # True si requiere reinicio
            }
            for d in datos
        ]
    except Exception:
        return None  # Cualquier error → intentar con WUA COM como alternativa


def _fecha_ultima_actualizacion() -> str:
    """
    Lee desde el registro cuándo fue la última instalación de actualización exitosa.
    Esta información la escribe Windows Update automáticamente tras cada instalación.
    """
    try:
        with winreg.OpenKey(
            winreg.HKEY_LOCAL_MACHINE,
            # Esta clave del registro contiene los resultados del último proceso de instalación
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\Results\Install"
        ) as key:
            valor, _ = winreg.QueryValueEx(key, "LastSuccessTime")  # Timestamp de la última instalación
            return valor  # Devuelve la fecha como string en formato ISO
    except Exception:
        return "Desconocida"  # Si la clave no existe o no tenemos permisos


def _actualizaciones_pendientes_wua() -> list[dict]:
    """
    Consulta actualizaciones pendientes usando la API WUA (Windows Update Agent) directamente.
    WUA COM está disponible en TODAS las versiones de Windows sin instalar nada extra.
    """
    try:
        # Este script PowerShell usa la API COM de Windows Update directamente:
        # 1. Crea una sesión de Windows Update
        # 2. Crea un buscador de actualizaciones
        # 3. Busca actualizaciones NO instaladas (IsInstalled=0)
        # 4. Serializa los resultados a JSON
        script = (
            "$s = New-Object -ComObject Microsoft.Update.Session;"      # Sesión WUA
            "$b = $s.CreateUpdateSearcher();"                           # Motor de búsqueda
            "$r = $b.Search('IsInstalled=0');"                          # Buscar no instaladas
            "$r.Updates | Select-Object Title,IsMandatory | ConvertTo-Json"  # Serializar
        )
        salida = subprocess.run(
            ["powershell", "-NonInteractive", "-Command", script],
            capture_output=True,
            text=True,
            timeout=60  # WUA puede tardar hasta 60 segundos si contacta con los servidores
        )

        if not salida.stdout.strip():
            return []  # Sin salida → no hay actualizaciones pendientes o WUA no está disponible

        datos = json.loads(salida.stdout.strip())
        if isinstance(datos, dict):
            datos = [datos]  # Normalizar a lista

        return [
            {
                "titulo":    d.get("Title",        ""),    # Descripción de la actualización
                "obligatoria": d.get("IsMandatory", False), # True si es obligatoria (parche de seguridad crítico)
            }
            for d in datos
        ]
    except Exception:
        return []  # Si falla WUA COM también, devolver lista vacía


def run() -> dict:
    """
    Ejecuta el verificador de parches con estrategia de fallback:
    1. Intenta PSWindowsUpdate (más información, KB numbers)
    2. Si no está disponible, usa WUA COM (siempre disponible en Windows)
    """
    t0 = time.perf_counter()
    try:
        # Intentar con PSWindowsUpdate primero (más detallado, incluye números KB)
        pendientes = _actualizaciones_pendientes_ps()
        metodo     = "PSWindowsUpdate"

        if pendientes is None:
            # PSWindowsUpdate no está disponible → usar WUA COM como alternativa
            pendientes = _actualizaciones_pendientes_wua()
            metodo     = "WUA COM"

        ultima_actualizacion = _fecha_ultima_actualizacion()  # Última instalación exitosa

        duracion = int((time.perf_counter() - t0) * 1000)

        return {
            "ok":   True,
            "data": {
                "actualizaciones_pendientes":  pendientes,           # Lista de parches que faltan
                "ultima_actualizacion_exitosa": ultima_actualizacion, # Cuándo se actualizó por última vez
                "sistema_actualizado":          len(pendientes) == 0,  # True si no hay parches pendientes
            },
            "meta": {
                "timestamp":      datetime.now(timezone.utc).isoformat(),
                "duracion_ms":    duracion,
                "metodo":         metodo,           # "PSWindowsUpdate" o "WUA COM" (para diagnóstico)
                "total_pendientes": len(pendientes), # Número de actualizaciones que faltan
            },
        }
    except Exception as e:
        return {
            "ok":    False,
            "error": str(e),
            "meta":  {"timestamp": datetime.now(timezone.utc).isoformat()},
        }
