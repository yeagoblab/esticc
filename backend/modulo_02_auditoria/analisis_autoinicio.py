"""
Auditor de entradas de autoinicio.
Lee claves Run/RunOnce del registro (HKCU y HKLM) y tareas programadas activas.
"""
import time                            # Para medir duración del análisis
import subprocess                      # Para ejecutar schtasks.exe como subproceso
import winreg                          # Acceso nativo al Registro de Windows (solo en Windows)
from datetime import datetime, timezone

# Las 4 claves del registro donde Windows carga programas al inicio
# Tupla: (hive, subclave, etiqueta_legible)
CLAVES_REGISTRO = [
    (winreg.HKEY_CURRENT_USER,  r"Software\Microsoft\Windows\CurrentVersion\Run",     "HKCU\\Run"),
    # HKCU\Run: autoinicio solo para el usuario actual (sin privilegios de admin para escribir)
    (winreg.HKEY_CURRENT_USER,  r"Software\Microsoft\Windows\CurrentVersion\RunOnce", "HKCU\\RunOnce"),
    # HKCU\RunOnce: igual que Run pero se elimina la entrada tras ejecutarse una vez
    (winreg.HKEY_LOCAL_MACHINE, r"Software\Microsoft\Windows\CurrentVersion\Run",     "HKLM\\Run"),
    # HKLM\Run: autoinicio para todos los usuarios (requiere admin para escribir — red flag si aparece malware)
    (winreg.HKEY_LOCAL_MACHINE, r"Software\Microsoft\Windows\CurrentVersion\RunOnce", "HKLM\\RunOnce"),
    # HKLM\RunOnce: igual que HKLM\Run pero de un solo uso
]


def _leer_clave(hive: int, subkey: str, etiqueta: str) -> list[dict]:
    """Lee todos los valores de una clave del registro y los devuelve como lista de dicts."""
    entradas = []
    try:
        # winreg.KEY_READ: abre la clave en modo solo lectura (no modificamos nada)
        with winreg.OpenKey(hive, subkey, 0, winreg.KEY_READ) as key:
            i = 0  # Índice del valor dentro de la clave (el registro usa índices enteros)
            while True:
                try:
                    # EnumValue devuelve (nombre_valor, dato, tipo) para el índice i
                    nombre, valor, _ = winreg.EnumValue(key, i)
                    entradas.append({
                        "origen":  etiqueta,  # Ej: "HKCU\\Run" para identificar de dónde viene
                        "nombre":  nombre,    # Nombre del valor, ej: "Discord" o "WindowsAgent"
                        "comando": valor,     # Comando que se ejecuta, ej: "C:\...\Discord.exe"
                    })
                    i += 1  # Pasar al siguiente valor de la clave
                except OSError:
                    break  # OSError se lanza cuando no hay más valores (fin de enumeración)
    except (PermissionError, FileNotFoundError):
        # PermissionError: HKLM requiere privilegios elevados en algunos sistemas
        # FileNotFoundError: la clave no existe (normal si RunOnce está vacía)
        pass
    return entradas


def _tareas_programadas() -> list[dict]:
    """Obtiene las tareas programadas del sistema usando schtasks.exe."""
    try:
        # schtasks /query /fo CSV /v: exporta todas las tareas en formato CSV detallado
        resultado = subprocess.run(
            ["schtasks", "/query", "/fo", "CSV", "/v"],
            capture_output=True,  # Captura stdout y stderr sin mostrarlos en consola
            text=True,            # Decodifica la salida como texto (no bytes)
            timeout=45,           # 45s: schtasks puede tardar 30s+ en sistemas con muchas GPOs activas
            encoding="latin-1"    # schtasks en Windows a veces usa Latin-1 en lugar de UTF-8
        )
        tareas = []
        lineas = resultado.stdout.splitlines()  # Dividir salida en líneas individuales
        if not lineas:
            return tareas  # Si no hay salida, devolver lista vacía

        # Parsear el CSV resultante (primera línea son las cabeceras)
        from csv import reader as csv_reader  # Importación local para no ensuciar el namespace global
        import io
        rows = list(csv_reader(io.StringIO(resultado.stdout), delimiter=","))  # Parsear CSV completo
        if len(rows) < 2:
            return tareas  # Solo cabeceras, sin tareas

        # Limpiar y mapear cabeceras (el idioma del SO afecta los nombres de columna)
        headers = [h.strip().strip('"') for h in rows[0]]
        idx = {h: i for i, h in enumerate(headers)}  # Dict nombre_columna → índice numérico

        # Intentar obtener las columnas en inglés (Windows en inglés) o en español
        nombre_col    = idx.get("TaskName",      idx.get("Nombre de tarea", 0))
        estado_col    = idx.get("Status",        idx.get("Estado", -1))
        siguiente_col = idx.get("Next Run Time", idx.get("Próxima hora de ejecución", -1))

        for row in rows[1:]:  # Iterar desde la segunda fila (saltar cabeceras)
            if len(row) <= nombre_col:
                continue  # Fila demasiado corta, posiblemente corrupta

            nombre    = row[nombre_col].strip()
            estado    = row[estado_col].strip()    if estado_col    >= 0 and estado_col    < len(row) else ""
            siguiente = row[siguiente_col].strip() if siguiente_col >= 0 and siguiente_col < len(row) else ""

            if nombre and nombre != "N/A":  # Filtrar filas vacías o inválidas
                tareas.append({
                    "nombre":             nombre,    # Nombre de la tarea, ej: "\MicrosoftEdgeUpdate"
                    "estado":             estado,    # Ready, Running, Disabled...
                    "siguiente_ejecucion": siguiente, # Cuándo se ejecutará la próxima vez
                })
        return tareas
    except Exception:
        return []  # Cualquier error al leer tareas → lista vacía (no crashear el escáner)


def run() -> dict:
    """Lee todas las entradas de autoinicio del registro y las tareas programadas."""
    t0 = time.perf_counter()
    try:
        registro = []
        # Iterar las 4 claves del registro y acumular todas las entradas
        for hive, subkey, etiqueta in CLAVES_REGISTRO:
            registro.extend(_leer_clave(hive, subkey, etiqueta))

        tareas   = _tareas_programadas()  # Lista de tareas programadas del sistema
        duracion = int((time.perf_counter() - t0) * 1000)

        return {
            "ok":   True,
            "data": {
                "registro":           registro,  # Programas que se inician con Windows (registro)
                "tareas_programadas": tareas,    # Tareas del Programador de tareas de Windows
            },
            "meta": {
                "timestamp":     datetime.now(timezone.utc).isoformat(),
                "duracion_ms":   duracion,
                "total_registro": len(registro),  # Número de entradas Run/RunOnce encontradas
                "total_tareas":   len(tareas),    # Número de tareas programadas
            },
        }
    except Exception as e:
        return {
            "ok":    False,
            "error": str(e),
            "meta":  {"timestamp": datetime.now(timezone.utc).isoformat()},
        }
