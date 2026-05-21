"""
Auditor de entradas de autoinicio.
Lee claves Run/RunOnce del registro (HKCU y HKLM) y tareas programadas activas.
"""
import time
import subprocess
import winreg
from datetime import datetime, timezone

CLAVES_REGISTRO = [
    (winreg.HKEY_CURRENT_USER,  r"Software\Microsoft\Windows\CurrentVersion\Run",     "HKCU\\Run"),
    (winreg.HKEY_CURRENT_USER,  r"Software\Microsoft\Windows\CurrentVersion\RunOnce", "HKCU\\RunOnce"),
    (winreg.HKEY_LOCAL_MACHINE, r"Software\Microsoft\Windows\CurrentVersion\Run",     "HKLM\\Run"),
    (winreg.HKEY_LOCAL_MACHINE, r"Software\Microsoft\Windows\CurrentVersion\RunOnce", "HKLM\\RunOnce"),
]


def _leer_clave(hive, subkey, etiqueta: str) -> list[dict]:
    entradas = []
    try:
        with winreg.OpenKey(hive, subkey, 0, winreg.KEY_READ) as key:
            i = 0
            while True:
                try:
                    nombre, valor, _ = winreg.EnumValue(key, i)
                    entradas.append({"origen": etiqueta, "nombre": nombre, "comando": valor})
                    i += 1
                except OSError:
                    break
    except (PermissionError, FileNotFoundError):
        pass
    return entradas


def _tareas_programadas() -> list[dict]:
    try:
        resultado = subprocess.run(
            ["schtasks", "/query", "/fo", "CSV", "/v"],
            capture_output=True, text=True, timeout=10, encoding="latin-1"
        )
        tareas = []
        lineas = resultado.stdout.splitlines()
        if not lineas:
            return tareas
        # Primera línea son las cabeceras CSV
        from csv import reader as csv_reader
        import io
        rows = list(csv_reader(io.StringIO(resultado.stdout), delimiter=","))
        if len(rows) < 2:
            return tareas
        headers = [h.strip().strip('"') for h in rows[0]]
        idx = {h: i for i, h in enumerate(headers)}

        nombre_col  = idx.get("TaskName", idx.get("Nombre de tarea", 0))
        estado_col  = idx.get("Status", idx.get("Estado", -1))
        siguiente_col = idx.get("Next Run Time", idx.get("Próxima hora de ejecución", -1))

        for row in rows[1:]:
            if len(row) <= nombre_col:
                continue
            nombre = row[nombre_col].strip()
            estado = row[estado_col].strip() if estado_col >= 0 and estado_col < len(row) else ""
            siguiente = row[siguiente_col].strip() if siguiente_col >= 0 and siguiente_col < len(row) else ""
            if nombre and nombre != "N/A":
                tareas.append({"nombre": nombre, "estado": estado, "siguiente_ejecucion": siguiente})
        return tareas
    except Exception:
        return []


def run() -> dict:
    t0 = time.perf_counter()
    try:
        registro = []
        for hive, subkey, etiqueta in CLAVES_REGISTRO:
            registro.extend(_leer_clave(hive, subkey, etiqueta))

        tareas = _tareas_programadas()
        duracion = int((time.perf_counter() - t0) * 1000)
        return {
            "ok": True,
            "data": {
                "registro": registro,
                "tareas_programadas": tareas,
            },
            "meta": {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "duracion_ms": duracion,
                "total_registro": len(registro),
                "total_tareas": len(tareas),
            },
        }
    except Exception as e:
        return {
            "ok": False,
            "error": str(e),
            "meta": {"timestamp": datetime.now(timezone.utc).isoformat()},
        }
