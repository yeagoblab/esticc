"""
modulo_01_config/config.py

Persiste la configuración del usuario en %APPDATA%/ESTICC/config.json.
Sobrevive a reinstalaciones de la app (a diferencia de localStorage).

Acciones IPC:
  config_get  → devuelve el dict guardado (o {} si no existe)
  config_set  → recibe el dict y lo escribe en disco
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path


def _ruta_config() -> Path:
    """Devuelve %APPDATA%/ESTICC/config.json, creando el directorio si no existe."""
    base = Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming"))
    directorio = base / "ESTICC"
    directorio.mkdir(parents=True, exist_ok=True)
    return directorio / "config.json"


def get() -> dict:
    """Lee la configuración persistida. Devuelve {} si el archivo no existe o está corrupto."""
    try:
        ruta = _ruta_config()
        if ruta.exists():
            return {
                "ok":   True,
                "data": json.loads(ruta.read_text(encoding="utf-8")),
                "meta": {"timestamp": datetime.now(timezone.utc).isoformat()},
            }
        return {
            "ok":   True,
            "data": {},
            "meta": {"timestamp": datetime.now(timezone.utc).isoformat()},
        }
    except Exception as e:
        return {
            "ok":    False,
            "error": str(e),
            "meta":  {"timestamp": datetime.now(timezone.utc).isoformat()},
        }


def set_config(cfg: dict) -> dict:
    """Escribe el dict de configuración en disco."""
    try:
        ruta = _ruta_config()
        ruta.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
        return {
            "ok":   True,
            "data": None,
            "meta": {"timestamp": datetime.now(timezone.utc).isoformat()},
        }
    except Exception as e:
        return {
            "ok":    False,
            "error": str(e),
            "meta":  {"timestamp": datetime.now(timezone.utc).isoformat()},
        }
