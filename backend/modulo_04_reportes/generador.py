"""
modulo_04_reportes/generador.py
Ejecuta los 5 escáneres de auditoría, calcula la puntuación de riesgo global
y devuelve un informe consolidado al frontend en un único mensaje IPC.
"""
from __future__ import annotations

import socket
from datetime import datetime, timezone

from modulo_02_auditoria import (
    estado_defensas,
    escaner_puertos,
    escaner_procesos,
    analisis_autoinicio,
    verificador_parches,
)

# Puertos frecuentemente asociados a RATs, backdoors y herramientas de acceso remoto no autorizado
_PUERTOS_SOSPECHOSOS = {4444, 31337, 1337, 9999, 6666, 6667, 1080, 4899, 5900, 5555, 7777}


def _data(resultado: dict) -> dict | list:
    """Extrae el campo 'data' de un resultado IPC. Devuelve dict/list vacío si hubo error."""
    if isinstance(resultado, dict) and resultado.get("ok"):
        return resultado.get("data") or ({} if not isinstance(resultado.get("data"), list) else [])
    return {} if not isinstance(resultado, list) else []


def _calcular_riesgo(
    defensas: dict,
    puertos: list,
    procesos: list,
    autoinicio: dict,
    parches: dict,
) -> tuple[dict, list[dict]]:
    """
    Evalúa el estado de seguridad del sistema y devuelve (puntuacion, hallazgos).
    Puntuación máxima 100 — mayor es peor.
    """
    puntos = 0
    hallazgos: list[dict] = []

    # ── Defensas (hasta ~63 puntos) ──────────────────────────────────────────
    if defensas.get("firewall", {}).get("activo") is False:
        puntos += 30
        hallazgos.append({
            "nivel": "critico", "categoria": "Defensas",
            "texto": "Firewall de Windows desactivado",
        })
    if defensas.get("antivirus", {}).get("activo") is False:
        puntos += 25
        hallazgos.append({
            "nivel": "critico", "categoria": "Defensas",
            "texto": "Antivirus (Windows Defender) desactivado",
        })
    if defensas.get("bitlocker", {}).get("activo") is False:
        puntos += 8
        hallazgos.append({
            "nivel": "medio", "categoria": "Defensas",
            "texto": "BitLocker no activo: disco sin cifrado en reposo",
        })

    # ── Puertos (hasta ~40 puntos) ────────────────────────────────────────────
    puertos_locales: set[int] = set()
    for p in puertos:
        local = p.get("local", "")
        if ":" in local:
            try:
                puertos_locales.add(int(local.rsplit(":", 1)[-1]))
            except ValueError:
                pass

    for puerto in sorted(puertos_locales & _PUERTOS_SOSPECHOSOS):
        puntos += 20
        hallazgos.append({
            "nivel": "critico", "categoria": "Puertos",
            "texto": f"Puerto sospechoso detectado en escucha: {puerto}",
        })

    establecidas = [p for p in puertos if p.get("estado") == "ESTABLISHED"]
    if len(establecidas) > 40:
        puntos += 10
        hallazgos.append({
            "nivel": "alto", "categoria": "Puertos",
            "texto": f"{len(establecidas)} conexiones TCP ESTABLISHED simultáneas (inusualmente alto)",
        })

    # ── Procesos (hasta ~32 puntos) ───────────────────────────────────────────
    sin_ruta = [p for p in procesos if p.get("sin_ruta")]
    cpu_alta  = [p for p in procesos if p.get("alerta_cpu")]

    if sin_ruta:
        pts = min(len(sin_ruta) * 5, 20)
        puntos += pts
        hallazgos.append({
            "nivel": "alto", "categoria": "Procesos",
            "texto": f"{len(sin_ruta)} proceso(s) sin ruta de ejecutable verificable",
        })
    if cpu_alta:
        pts = min(len(cpu_alta) * 4, 12)
        puntos += pts
        hallazgos.append({
            "nivel": "medio", "categoria": "Procesos",
            "texto": f"{len(cpu_alta)} proceso(s) con consumo de CPU elevado (>80%)",
        })

    # ── Autoinicio (hasta 15 puntos) ──────────────────────────────────────────
    num_reg = len(autoinicio.get("registro", []))
    if num_reg > 20:
        puntos += 15
        hallazgos.append({
            "nivel": "alto", "categoria": "Autoinicio",
            "texto": f"{num_reg} entradas de autoinicio en el registro (umbral >20)",
        })
    elif num_reg > 10:
        puntos += 5

    # ── Parches (hasta 25 puntos) ─────────────────────────────────────────────
    pendientes = len(parches.get("actualizaciones_pendientes", []))
    if pendientes > 10:
        puntos += 25
        hallazgos.append({
            "nivel": "alto", "categoria": "Parches",
            "texto": f"{pendientes} actualizaciones de Windows pendientes",
        })
    elif pendientes > 5:
        puntos += 12
        hallazgos.append({
            "nivel": "medio", "categoria": "Parches",
            "texto": f"{pendientes} actualizaciones de Windows pendientes",
        })
    elif pendientes > 0:
        puntos += 5
        hallazgos.append({
            "nivel": "bajo", "categoria": "Parches",
            "texto": f"{pendientes} actualización(es) de Windows pendiente(s)",
        })

    # ── Nivel global ──────────────────────────────────────────────────────────
    puntos = min(puntos, 100)
    if puntos <= 10:
        nivel = "bajo"
    elif puntos <= 35:
        nivel = "medio"
    elif puntos <= 65:
        nivel = "alto"
    else:
        nivel = "critico"

    return {"puntos": puntos, "nivel": nivel}, hallazgos


def run() -> dict:
    """
    Ejecuta los 5 escáneres en secuencia, calcula el riesgo global
    y devuelve el informe consolidado en formato IPC estándar.
    """
    timestamp = datetime.now(timezone.utc).isoformat(timespec="seconds")

    try:
        hostname = socket.gethostname()
    except Exception:
        hostname = "Equipo local"

    # Ejecutar los 5 escáneres en secuencia
    res_defensas   = estado_defensas.run()
    res_puertos    = escaner_puertos.run()
    res_procesos   = escaner_procesos.run()
    res_autoinicio = analisis_autoinicio.run()
    res_parches    = verificador_parches.run()

    # Extraer datos crudos de cada resultado
    d_defensas   = _data(res_defensas)   if isinstance(res_defensas, dict)   else {}
    d_puertos    = _data(res_puertos)    if isinstance(res_puertos, dict)    else []
    d_procesos   = _data(res_procesos)   if isinstance(res_procesos, dict)   else []
    d_autoinicio = _data(res_autoinicio) if isinstance(res_autoinicio, dict) else {}
    d_parches    = _data(res_parches)    if isinstance(res_parches, dict)    else {}

    # Asegurar que son tipos correctos (defensa ante escáneres con error)
    if not isinstance(d_defensas, dict):   d_defensas   = {}
    if not isinstance(d_puertos, list):    d_puertos    = []
    if not isinstance(d_procesos, list):   d_procesos   = []
    if not isinstance(d_autoinicio, dict): d_autoinicio = {}
    if not isinstance(d_parches, dict):    d_parches    = {}

    puntuacion, hallazgos = _calcular_riesgo(
        d_defensas, d_puertos, d_procesos, d_autoinicio, d_parches
    )

    return {
        "ok": True,
        "data": {
            "timestamp": timestamp,
            "hostname":  hostname,
            "riesgo":    puntuacion,
            "hallazgos": hallazgos,
            "defensas":   d_defensas,
            "puertos":    d_puertos,
            "procesos":   d_procesos,
            "autoinicio": d_autoinicio,
            "parches":    d_parches,
        },
    }
