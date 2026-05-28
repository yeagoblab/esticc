"""
Módulo de auto-actualización de ESTICC.

Flujo:
  1. check_update()        → consulta GitHub API, compara semver, devuelve metadatos
  2. download_and_prepare() → descarga el ZIP de la release, extrae los .exe,
                              escribe el script PowerShell de sustitución en %TEMP%
  3. apply_update()         → lanza el PS script en proceso separado (DETACHED_PROCESS)
                              y devuelve {cerrar: True} para que el frontend cierre la app

El reemplazo real ocurre *después* de que ESTICC.exe termine: el PS script espera
hasta 30 s a que el proceso desaparezca antes de copiar los nuevos binarios.
"""
from __future__ import annotations

import os
import sys
import json
import shutil
import tempfile
import zipfile
import subprocess
import urllib.request
from pathlib import Path


VERSION_ACTUAL = "0.5.0"             # Actualizar junto con tauri.conf.json y Cargo.toml en cada release
REPO           = "yeagoblab/esticc"
API_URL        = f"https://api.github.com/repos/{REPO}/releases/latest"
USER_AGENT     = f"ESTICC/{VERSION_ACTUAL}"


# ── Helpers internos ─────────────────────────────────────────────────────────

def _dir_app() -> Path:
    """Devuelve el directorio donde residen ESTICC.exe y backend.exe."""
    if getattr(sys, 'frozen', False):
        # En producción: backend.exe está en el mismo dir que ESTICC.exe
        return Path(sys.executable).parent
    # En desarrollo: carpeta portable de referencia (ajustar si cambia la estructura)
    return Path(__file__).parent.parent.parent / "ESTICC_portable"


def _parse_version(v: str) -> tuple[int, ...]:
    """Convierte 'v0.4.1' o '0.4.1' en (0, 4, 1) para comparación numérica."""
    v = v.lstrip("v").strip()
    try:
        return tuple(int(x) for x in v.split("."))
    except ValueError:
        return (0,)


# ── Acciones IPC ─────────────────────────────────────────────────────────────

def check_update() -> dict:
    """
    Consulta la GitHub Releases API y compara con VERSION_ACTUAL.

    Devuelve:
      {
        "actualizar":     bool,   # True si hay versión más nueva
        "version_actual": str,
        "version_nueva":  str,    # Tag de la última release (ej. "v0.4.1")
        "novedades":      str,    # body markdown de la release (primeras 800 chars)
        "url_zip":        str,    # URL del asset portable ZIP para descargar
      }
    """
    req = urllib.request.Request(API_URL, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=12) as resp:
        data = json.loads(resp.read().decode())

    tag        = data.get("tag_name", "")
    novedades  = (data.get("body") or "")[:800]
    assets     = data.get("assets", [])

    # Buscar el asset ZIP portable (nombre contiene 'portable' y termina en .zip)
    url_zip = ""
    for asset in assets:
        nombre = asset.get("name", "").lower()
        if "portable" in nombre and nombre.endswith(".zip"):
            url_zip = asset.get("browser_download_url", "")
            break

    actualizar = _parse_version(tag) > _parse_version(VERSION_ACTUAL)

    return {
        "actualizar":     actualizar,
        "version_actual": VERSION_ACTUAL,
        "version_nueva":  tag,
        "novedades":      novedades,
        "url_zip":        url_zip,
    }


def download_and_prepare(url_zip: str) -> dict:
    """
    Descarga el ZIP de la release y prepara el script de sustitución.

    Pasos:
      1. Descarga el ZIP a un directorio temporal
      2. Extrae ESTICC.exe y backend.exe del ZIP
      3. Escribe un script PowerShell que hará la sustitución tras el cierre

    Devuelve:
      { "ps_path": "<ruta absoluta al .ps1>" }
    """
    if not url_zip:
        raise ValueError("url_zip no proporcionada")

    tmp_dir = Path(tempfile.mkdtemp(prefix="esticc_upd_"))
    zip_path = tmp_dir / "update.zip"

    # Descargar con User-Agent para evitar el rate-limit de GitHub
    req = urllib.request.Request(url_zip, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=90) as resp, open(zip_path, "wb") as fout:
        shutil.copyfileobj(resp, fout)

    # Extraer solo los ejecutables necesarios a una subcarpeta
    extract_dir = tmp_dir / "extracted"
    extract_dir.mkdir()
    with zipfile.ZipFile(zip_path, "r") as zf:
        for member in zf.namelist():
            basename = Path(member).name.lower()
            if basename in ("esticc.exe", "backend.exe"):
                # Extraer preservando solo el nombre (sin subdirectorios del ZIP)
                source = zf.open(member)
                target = extract_dir / Path(member).name
                with open(target, "wb") as fout:
                    shutil.copyfileobj(source, fout)

    try:
        zip_path.unlink()  # Liberar espacio; puede fallar si Defender lo escanea, no es crítico
    except OSError:
        pass  # El PS script borrará el directorio temporal completo al finalizar

    app_dir     = _dir_app()
    ps_path     = tmp_dir / "apply_update.ps1"
    esticc_new  = extract_dir / "ESTICC.exe"
    backend_new = extract_dir / "backend.exe"
    esticc_dst  = app_dir / "ESTICC.exe"
    backend_dst = app_dir / "backend.exe"

    # Script PowerShell: espera a que ESTICC termine, copia, valida, limpia y relanza.
    # - $ok valida que ambas copias tuvieron éxito antes de borrar el directorio temporal.
    # - Si la copia falla (archivo bloqueado, permisos), el temporal se conserva y ESTICC
    #   no se relanza, evitando lanzar una versión corrupta o la versión antigua sin aviso.
    ps_script = f"""
$waited = 0
while ((Get-Process -Name 'ESTICC' -ErrorAction SilentlyContinue) -and $waited -lt 30) {{
    Start-Sleep -Seconds 1
    $waited++
}}
$ok = $false
try {{
    Copy-Item -Path '{esticc_new}'  -Destination '{esticc_dst}'  -Force -ErrorAction Stop
    Copy-Item -Path '{backend_new}' -Destination '{backend_dst}' -Force -ErrorAction Stop
    $ok = $true
}} catch {{}}
if ($ok) {{
    Remove-Item -Path '{tmp_dir}' -Recurse -Force -ErrorAction SilentlyContinue
    Start-Process -FilePath '{esticc_dst}'
}}
""".strip()

    ps_path.write_text(ps_script, encoding="utf-8")
    return {"ps_path": str(ps_path)}


def apply_update(ps_path: str) -> dict:
    """
    Lanza el script PowerShell de sustitución en proceso completamente desacoplado.

    Flags usados:
      CREATE_NO_WINDOW  (0x08000000) — sin ventana de consola visible
      DETACHED_PROCESS  (0x00000008) — el proceso sobrevive al cierre de backend.exe

    Devuelve { "cerrar": True } para que el frontend cierre la app inmediatamente.
    """
    if not ps_path or not Path(ps_path).exists():
        raise FileNotFoundError(f"Script de actualización no encontrado: {ps_path}")

    CREATE_NO_WINDOW = 0x08000000
    DETACHED_PROCESS = 0x00000008

    subprocess.Popen(
        ["powershell.exe", "-ExecutionPolicy", "Bypass", "-File", ps_path],
        creationflags=CREATE_NO_WINDOW | DETACHED_PROCESS,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    return {"cerrar": True}
