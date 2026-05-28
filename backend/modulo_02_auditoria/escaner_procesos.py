"""
Escáner de procesos activos ordenados por consumo de CPU y RAM.
Marca como sospechosos procesos sin ruta conocida o con CPU/RAM por encima del umbral.
"""
import time                          # Para medir duración del escaneo y esperar el intervalo de CPU
from datetime import datetime, timezone  # Timestamp UTC en la respuesta
import psutil                        # Acceso multiplataforma a procesos del sistema operativo

# Umbrales de alerta: si un proceso supera estos valores se marca como "a revisar"
CPU_UMBRAL    = 50.0   # % de CPU: por encima de 50% sostenido se considera elevado
RAM_UMBRAL_MB = 800    # MB de RAM: por encima de 800 MB se considera elevado


def _info_proceso(proc: psutil.Process) -> dict | None:
    """
    Extrae la información relevante de un proceso.
    Devuelve None si el proceso terminó antes de que pudiéramos leerlo.
    """
    try:
        # proc.oneshot() abre el proceso UNA sola vez y cachea todas las lecturas
        # Sin esto, cada atributo haría una llamada de sistema separada (mucho más lento)
        with proc.oneshot():
            nombre  = proc.name()        # Nombre del ejecutable, ej: "chrome.exe"
            pid     = proc.pid           # ID del proceso en el SO
            cpu     = proc.cpu_percent() # % CPU desde la última llamada a cpu_percent (requiere intervalo)
            ram_mb  = round(proc.memory_info().rss / (1024 * 1024), 1)  # RSS en MB (memoria física usada)

            try:
                ruta = proc.exe()  # Ruta completa del ejecutable, ej: "C:\Windows\System32\svchost.exe"
            except (psutil.AccessDenied, psutil.NoSuchProcess):
                ruta = ""  # Sin ruta es sospechoso: malware a menudo se ejecuta sin ruta registrada

            usuario = ""  # Usuario propietario del proceso
            try:
                usuario = proc.username()  # Puede fallar con AccessDenied en procesos de SYSTEM
            except (psutil.AccessDenied, psutil.NoSuchProcess):
                pass  # Dejamos usuario vacío si no tenemos permisos

        # Devolvemos todos los campos + banderas de alerta calculadas
        return {
            "pid":       pid,
            "nombre":    nombre,
            "cpu_pct":   cpu,        # Porcentaje de CPU en el intervalo de muestreo
            "ram_mb":    ram_mb,     # Megabytes de RAM física (RSS = Resident Set Size)
            "ruta":      ruta,       # Ruta del ejecutable (vacía = sospechoso)
            "usuario":   usuario,    # Ej: "SYSTEM", "Usuario", "NT AUTHORITY\NETWORK SERVICE"
            "alerta_cpu": cpu    >= CPU_UMBRAL,     # True si la CPU supera el umbral
            "alerta_ram": ram_mb >= RAM_UMBRAL_MB,  # True si la RAM supera el umbral
            "sin_ruta":   ruta == "",               # True si no tiene ruta conocida (red flag)
        }

    except (psutil.NoSuchProcess, psutil.ZombieProcess):
        # NoSuchProcess: el proceso terminó entre el listado inicial y esta lectura
        # ZombieProcess: el proceso está muerto pero su entrada sigue en la tabla
        return None  # Lo descartamos silenciosamente


def run() -> dict:
    """Escanea todos los procesos activos y devuelve el resultado IPC estándar."""
    t0 = time.perf_counter()  # Inicio del cronómetro
    try:
        # Primera pasada: inicializar el contador de CPU de psutil
        # cpu_percent() necesita DOS llamadas con un intervalo entre ellas para calcular el %
        # La primera llamada siempre devuelve 0.0, así que la hacemos aquí y esperamos
        procs = list(psutil.process_iter())  # Snapshot de todos los procesos actuales
        for p in procs:
            try:
                p.cpu_percent()  # Primera llamada (inicia el muestreo); el valor se descarta
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass  # Ignorar procesos que ya no existen o no son accesibles

        time.sleep(0.3)  # Esperar 300ms para que psutil pueda calcular el % de CPU real

        # Segunda pasada: leer los datos reales de cada proceso
        resultados = []
        for p in procs:
            info = _info_proceso(p)  # Extraer info; devuelve None si el proceso ya no existe
            if info:                  # Solo añadir procesos que pudimos leer correctamente
                resultados.append(info)

        # Ordenar por CPU descendente: los procesos más pesados aparecen primero en la UI
        resultados.sort(key=lambda x: x["cpu_pct"], reverse=True)

        duracion = int((time.perf_counter() - t0) * 1000)  # Tiempo total en ms

        return {
            "ok":   True,
            "data": resultados,  # Lista de procesos con sus métricas y alertas
            "meta": {
                "timestamp":  datetime.now(timezone.utc).isoformat(),
                "duracion_ms": duracion,
                "total":       len(resultados),  # Número de procesos leídos
                # Cuenta procesos con al menos una alerta activa
                "alertas": sum(1 for p in resultados if p["alerta_cpu"] or p["alerta_ram"] or p["sin_ruta"]),
            },
        }

    except Exception as e:
        return {
            "ok":    False,
            "error": str(e),
            "meta":  {"timestamp": datetime.now(timezone.utc).isoformat()},
        }
