"""
Escáner de procesos activos ordenados por consumo de CPU y RAM.
Marca como sospechosos procesos sin ruta conocida o con CPU > umbral.
"""
import time
from datetime import datetime, timezone
import psutil

CPU_UMBRAL = 30.0   # % CPU para marcar como elevado
RAM_UMBRAL_MB = 500


def _info_proceso(proc: psutil.Process) -> dict | None:
    try:
        with proc.oneshot():
            nombre = proc.name()
            pid = proc.pid
            cpu = proc.cpu_percent()
            ram_mb = round(proc.memory_info().rss / (1024 * 1024), 1)
            try:
                ruta = proc.exe()
            except (psutil.AccessDenied, psutil.NoSuchProcess):
                ruta = ""
            usuario = ""
            try:
                usuario = proc.username()
            except (psutil.AccessDenied, psutil.NoSuchProcess):
                pass

        return {
            "pid": pid,
            "nombre": nombre,
            "cpu_pct": cpu,
            "ram_mb": ram_mb,
            "ruta": ruta,
            "usuario": usuario,
            "alerta_cpu": cpu >= CPU_UMBRAL,
            "alerta_ram": ram_mb >= RAM_UMBRAL_MB,
            "sin_ruta": ruta == "",
        }
    except (psutil.NoSuchProcess, psutil.ZombieProcess):
        return None


def run() -> dict:
    t0 = time.perf_counter()
    try:
        # Primera pasada para inicializar cpu_percent (necesita intervalo)
        procs = list(psutil.process_iter())
        for p in procs:
            try:
                p.cpu_percent()
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
        time.sleep(0.3)

        resultados = []
        for p in procs:
            info = _info_proceso(p)
            if info:
                resultados.append(info)

        resultados.sort(key=lambda x: x["cpu_pct"], reverse=True)
        duracion = int((time.perf_counter() - t0) * 1000)
        return {
            "ok": True,
            "data": resultados,
            "meta": {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "duracion_ms": duracion,
                "total": len(resultados),
                "alertas": sum(1 for p in resultados if p["alerta_cpu"] or p["alerta_ram"] or p["sin_ruta"]),
            },
        }
    except Exception as e:
        return {
            "ok": False,
            "error": str(e),
            "meta": {"timestamp": datetime.now(timezone.utc).isoformat()},
        }
