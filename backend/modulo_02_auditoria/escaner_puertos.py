"""
Escáner de puertos TCP locales.
Lista todos los sockets TCP activos con su PID y nombre de proceso.
"""
import time
from datetime import datetime, timezone
import psutil


def run() -> dict:
    t0 = time.perf_counter()
    try:
        conexiones = []
        for c in psutil.net_connections(kind="tcp"):
            proceso = ""
            try:
                if c.pid:
                    proceso = psutil.Process(c.pid).name()
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                proceso = "N/A"

            laddr = f"{c.laddr.ip}:{c.laddr.port}" if c.laddr else ""
            raddr = f"{c.raddr.ip}:{c.raddr.port}" if c.raddr else ""

            conexiones.append({
                "pid": c.pid,
                "proceso": proceso,
                "local": laddr,
                "remoto": raddr,
                "estado": c.status,
            })

        conexiones.sort(key=lambda x: (x["estado"], x["proceso"]))
        duracion = int((time.perf_counter() - t0) * 1000)
        return {
            "ok": True,
            "data": conexiones,
            "meta": {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "duracion_ms": duracion,
                "total": len(conexiones),
            },
        }
    except Exception as e:
        return {
            "ok": False,
            "error": str(e),
            "meta": {"timestamp": datetime.now(timezone.utc).isoformat()},
        }
