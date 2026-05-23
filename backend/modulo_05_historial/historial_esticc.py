"""
modulo_05_historial/historial_esticc.py
Persiste el historial de escaneos propios de ESTICC en:
  %APPDATA%\ESTICC\historial.json

Formato de cada entrada:
  {
    "timestamp": "2026-05-23T10:00:00+00:00",   # ISO-8601 UTC
    "tipo":      "informe_completo" | "scan_ports" | "scan_processes" | ...,
    "nivel":     "bajo" | "medio" | "alto" | "critico" | null,
    "puntuacion": 0-100 | null,
    "num_hallazgos": int | null,
    "resumen":   str | null,
  }
"""
from __future__ import annotations
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

_MAX_ENTRADAS = 100


def _ruta_historial() -> Path:
    appdata = os.environ.get("APPDATA", str(Path.home()))
    carpeta = Path(appdata) / "ESTICC"
    carpeta.mkdir(parents=True, exist_ok=True)
    return carpeta / "historial.json"


def _cargar() -> list[dict]:
    ruta = _ruta_historial()
    if not ruta.exists():
        return []
    try:
        with ruta.open("r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            return data
    except Exception:
        pass
    return []


def _guardar_lista(entradas: list[dict]) -> None:
    ruta = _ruta_historial()
    with ruta.open("w", encoding="utf-8") as f:
        json.dump(entradas, f, ensure_ascii=False, indent=2)


def get() -> dict:
    """Devuelve todas las entradas del historial ESTICC."""
    t0 = time.perf_counter()
    entradas = _cargar()
    duracion = int((time.perf_counter() - t0) * 1000)
    return {
        "ok": True,
        "data": {"entradas": entradas},
        "meta": {
            "timestamp":   datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "duracion_ms": duracion,
        },
    }


def guardar(entrada: dict) -> dict:
    """
    Añade una nueva entrada al historial y lo persiste.
    Trunca a _MAX_ENTRADAS entradas más recientes.
    """
    t0 = time.perf_counter()

    if not entrada.get("timestamp"):
        entrada["timestamp"] = datetime.now(timezone.utc).isoformat(timespec="seconds")

    entradas = _cargar()
    entradas.append(entrada)

    # Mantener solo las _MAX_ENTRADAS más recientes
    if len(entradas) > _MAX_ENTRADAS:
        entradas = entradas[-_MAX_ENTRADAS:]

    try:
        _guardar_lista(entradas)
        ok = True
        error = None
    except Exception as e:
        ok = False
        error = str(e)

    duracion = int((time.perf_counter() - t0) * 1000)
    result = {
        "ok": ok,
        "data": {"total": len(entradas)},
        "meta": {
            "timestamp":   datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "duracion_ms": duracion,
        },
    }
    if error:
        result["error"] = error
    return result
