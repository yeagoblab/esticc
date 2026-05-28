"""
Escáner de puertos TCP locales.
Lista todos los sockets TCP activos con su PID y nombre de proceso.
"""
import time                          # Para medir la duración del escaneo
from datetime import datetime, timezone  # Para incluir timestamp UTC en el resultado
import psutil                        # Librería de sistema: lee información del SO sin permisos de admin

# Puertos conocidos por ser usados habitualmente por herramientas de acceso remoto maliciosas.
# Centralizado aquí para que tanto el panel de Puertos como el generador de informes
# usen la misma lista sin duplicarla.
PUERTOS_SOSPECHOSOS: frozenset[int] = frozenset({
    4444,   # Metasploit default (RAT / reverse shell)
    31337,  # "Elite" — nombre clásico de backdoors
    1337,   # Variante "elite", usado por RATs simples
    9999,   # Puerto genérico frecuente en C2 caseros
    6666,   # IRC (usado por botnets para recibir comandos)
    6667,   # IRC alternativo
    1080,   # SOCKS proxy (tunelado de tráfico malicioso)
    4899,   # Radmin (herramienta de acceso remoto frecuentemente explotada)
    5900,   # VNC sin cifrar (acceso remoto gráfico sin autenticación fuerte)
    5555,   # Android Debug Bridge (ADB) expuesto en red
    7777,   # Puerto genérico de muchos RATs
})


def run() -> dict:
    """Escanea todas las conexiones TCP activas y devuelve el resultado IPC estándar."""
    t0 = time.perf_counter()  # Marca de tiempo de alta resolución para medir rendimiento
    try:
        conexiones = []  # Lista que acumulará un dict por cada socket TCP encontrado

        # psutil.net_connections(kind="tcp") devuelve todos los sockets TCP del sistema
        # Incluye LISTEN, ESTABLISHED, TIME_WAIT, CLOSE_WAIT, etc.
        for c in psutil.net_connections(kind="tcp"):
            proceso = ""  # Nombre del proceso propietario del socket; vacío si no se puede obtener

            try:
                if c.pid:  # Algunos sockets (estado LISTEN sin binding de proceso) tienen pid=None
                    proceso = psutil.Process(c.pid).name()  # Obtiene el nombre del ejecutable por PID
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                # NoSuchProcess: el proceso murió entre el listado y la consulta (race condition normal)
                # AccessDenied: el proceso pertenece a otro usuario o a SYSTEM sin privilegios de admin
                proceso = "N/A"

            # Convertir las tuplas (ip, port) de psutil a strings "ip:puerto" legibles
            laddr = f"{c.laddr.ip}:{c.laddr.port}" if c.laddr else ""  # Dirección local (siempre presente)
            raddr = f"{c.raddr.ip}:{c.raddr.port}" if c.raddr else ""  # Dirección remota (vacía si LISTEN)

            # Extraer el número de puerto local para comparar con la lista negra
            puerto_local = c.laddr.port if c.laddr else 0

            # Añadir un diccionario por cada conexión con todos sus campos
            conexiones.append({
                "pid":        c.pid,     # ID del proceso propietario del socket
                "proceso":    proceso,   # Nombre del ejecutable (ej: "chrome.exe")
                "local":      laddr,     # Puerto local (ej: "0.0.0.0:445")
                "remoto":     raddr,     # IP y puerto remotos si hay conexión activa
                "estado":     c.status,  # Estado TCP: LISTEN, ESTABLISHED, TIME_WAIT...
                "sospechoso": puerto_local in PUERTOS_SOSPECHOSOS,  # True si el puerto está en la lista negra
            })

        # Ordenar primero por estado (ESTABLISHED antes que LISTEN) y luego por nombre de proceso
        # Esto hace que las conexiones activas aparezcan primero en la UI
        conexiones.sort(key=lambda x: (x["estado"], x["proceso"]))

        duracion = int((time.perf_counter() - t0) * 1000)  # Duración en milisegundos

        # Estructura de respuesta estándar IPC: ok + data + meta
        return {
            "ok":   True,
            "data": conexiones,  # Lista de dicts, uno por socket TCP
            "meta": {
                "timestamp":  datetime.now(timezone.utc).isoformat(),  # Cuándo se ejecutó el escaneo (UTC)
                "duracion_ms": duracion,   # Cuánto tardó en ejecutarse (para diagnóstico)
                "total":       len(conexiones),  # Número total de sockets encontrados
            },
        }

    except Exception as e:
        # Si falla cualquier cosa (permisos, OS error...) devolver error IPC sin crashear
        return {
            "ok":    False,
            "error": str(e),
            "meta":  {"timestamp": datetime.now(timezone.utc).isoformat()},
        }
