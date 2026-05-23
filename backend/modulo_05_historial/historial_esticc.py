"""
modulo_05_historial/historial_esticc.py

Persistencia del historial de escaneos propios de ESTICC.

¿Dónde se guardan los datos?
  %APPDATA%\ESTICC\historial.json

  %APPDATA% es una variable de entorno de Windows que apunta a la carpeta
  de datos de aplicación del usuario actual, normalmente:
    C:\Users\<NombreUsuario>\AppData\Roaming\

  Elegimos %APPDATA% en lugar de la carpeta del programa por varias razones:
    1. No requiere permisos de administrador para escribir.
    2. Sigue el estándar de Windows para datos de usuario por aplicación.
    3. Si el usuario desinstala ESTICC, sus datos permanecen (pueden limpiarlos
       manualmente si lo desean).
    4. Compatible con entornos corporativos donde Program Files es de solo lectura.

Formato de historial.json:
  Lista JSON de hasta _MAX_ENTRADAS objetos, ordenados cronológicamente
  (más antiguo primero). Cada objeto sigue este esquema:

  {
    "timestamp":     "2026-05-23T10:00:00+00:00",  # ISO-8601 UTC (siempre presente)
    "tipo":          "informe_completo",             # Tipo de evento (ver TIPOS más abajo)
    "nivel":         "medio",                        # Nivel de riesgo del informe (o null)
    "puntuacion":    42,                             # Puntuación 0-100 (o null)
    "num_hallazgos": 3,                              # Número de problemas detectados (o null)
    "resumen":       null,                           # Texto libre para escaneos individuales
    "fuente":        "esticc"                        # Siempre "esticc" en este módulo
  }

  Tipos de evento ("tipo"):
    "informe_completo" → generado por modulo_04_reportes al ejecutar los 5 escáneres
    "scan_ports"       → escaneo manual de puertos desde el panel Puertos
    "scan_processes"   → escaneo manual de procesos
    "scan_startup"     → análisis manual de autoinicio
    "scan_defenses"    → comprobación manual de defensas
    "scan_patches"     → verificación manual de parches

Límite de entradas:
  Se mantienen solo las últimas _MAX_ENTRADAS entradas. Al superar el límite,
  se eliminan las más antiguas (política FIFO). Esto evita que el archivo
  crezca indefinidamente en equipos que ejecutan ESTICC muy frecuentemente.
"""
from __future__ import annotations  # Permite anotaciones modernas en Python 3.8/3.9

import json   # Para serializar/deserializar el historial a/desde JSON
import os     # Para leer la variable de entorno %APPDATA%
import time   # Para medir la duración de las operaciones de disco
from datetime import datetime, timezone  # Para generar timestamps UTC
from pathlib import Path  # Manipulación de rutas multiplataforma (Path es más seguro que os.path)

# Número máximo de entradas a conservar en el historial.
# Con 100 entradas y un análisis diario, el historial cubre ~3 meses.
_MAX_ENTRADAS = 100


def _ruta_historial() -> Path:
    """
    Calcula y devuelve la ruta completa al archivo historial.json.

    La carpeta %APPDATA%\ESTICC\ se crea automáticamente si no existe.
    parents=True: crea también las carpetas intermedias si faltan (Path.mkdir equivale a mkdir -p).
    exist_ok=True: no lanza error si la carpeta ya existe.
    """
    # os.environ.get("APPDATA") devuelve None si %APPDATA% no está definida (raro fuera de Windows)
    # En ese caso usamos el directorio home del usuario como fallback
    appdata = os.environ.get("APPDATA", str(Path.home()))

    carpeta = Path(appdata) / "ESTICC"  # Ej: C:\Users\Juan\AppData\Roaming\ESTICC
    carpeta.mkdir(parents=True, exist_ok=True)  # Crear si no existe, sin error si ya existe

    return carpeta / "historial.json"  # Ej: C:\Users\Juan\AppData\Roaming\ESTICC\historial.json


def _cargar() -> list[dict]:
    """
    Lee y parsea el archivo historial.json.
    Devuelve lista vacía si el archivo no existe o está corrupto.

    Esta función es tolerante a fallos: si el JSON está malformado (escritura
    interrumpida, disco lleno, etc.) devuelve [] en lugar de lanzar una excepción,
    lo que evita que un historial corrupto crashee toda la aplicación.
    """
    ruta = _ruta_historial()

    if not ruta.exists():
        return []  # Primera ejecución: el archivo todavía no se ha creado

    try:
        with ruta.open("r", encoding="utf-8") as f:
            data = json.load(f)  # Parsear el JSON completo de una vez (los archivos son pequeños)

        if isinstance(data, list):
            return data  # Formato correcto: lista de entradas
        # Si el JSON es válido pero no es una lista (p.ej. un dict), ignorarlo y empezar de cero
        return []
    except Exception:
        # json.JSONDecodeError si el JSON está malformado, OSError si hay problemas de disco
        return []


def _guardar_lista(entradas: list[dict]) -> None:
    """
    Serializa y escribe la lista completa de entradas en historial.json.

    ensure_ascii=False: permite caracteres UTF-8 en el JSON (tildes, ñ, etc.)
    indent=2: formato legible para que un desarrollador pueda inspeccionar el archivo
              sin necesidad de un formateador externo.

    La escritura es atómica a nivel de sistema operativo en la mayoría de SSDs modernos
    bajo Windows. Para un historial de auditoría educativo no necesitamos escritura
    atómica compleja (temp file + rename), que añadiría complejidad sin beneficio real.
    """
    ruta = _ruta_historial()
    with ruta.open("w", encoding="utf-8") as f:
        json.dump(entradas, f, ensure_ascii=False, indent=2)


def get() -> dict:
    """
    Lee el historial ESTICC y lo devuelve en formato IPC estándar.

    Punto de entrada para la acción IPC "historial_esticc_get".
    No requiere parámetros adicionales en el request.

    Respuesta exitosa:
      {
        "ok": true,
        "data": {
          "entradas": [...]   // Lista de eventos en orden cronológico (más antiguo primero)
        },
        "meta": {
          "timestamp": "...",  // Momento en que se leyó el historial
          "duracion_ms": 5     // Tiempo que tardó en leer el archivo (típicamente <10ms)
        }
      }
    """
    t0 = time.perf_counter()    # Inicio del cronómetro
    entradas = _cargar()         # Leer el historial desde disco
    duracion = int((time.perf_counter() - t0) * 1000)  # Calcular duración en ms

    return {
        "ok": True,
        "data": {
            "entradas": entradas,  # Lista completa de eventos del historial
        },
        "meta": {
            "timestamp":   datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "duracion_ms": duracion,
        },
    }


def guardar(entrada: dict) -> dict:
    """
    Añade una nueva entrada al historial y lo persiste en disco.

    Punto de entrada para la acción IPC "historial_esticc_guardar".
    El campo "entrada" del request JSON debe contener el objeto a guardar.

    Comportamiento:
      1. Si la entrada no tiene "timestamp", se le añade automáticamente el momento actual.
      2. La entrada se añade al FINAL de la lista (orden cronológico).
      3. Si la lista supera _MAX_ENTRADAS, se eliminan las más ANTIGUAS (inicio de la lista).
      4. La lista actualizada se escribe en disco.

    Ejemplo de entrada válida:
      {
        "tipo": "informe_completo",
        "nivel": "medio",
        "puntuacion": 42,
        "num_hallazgos": 3
      }

    La función añadirá automáticamente "timestamp" y "fuente": "esticc".
    """
    t0 = time.perf_counter()

    # Asegurar que la entrada tiene timestamp: el frontend puede enviarlo o dejarlo vacío
    if not entrada.get("timestamp"):
        # Generar timestamp UTC en formato ISO 8601 con precisión de segundos
        # Ej: "2026-05-23T10:30:00+00:00"
        entrada["timestamp"] = datetime.now(timezone.utc).isoformat(timespec="seconds")

    entradas = _cargar()      # Leer el historial actual desde disco
    entradas.append(entrada)  # Añadir la nueva entrada al final

    # Política de retención: mantener solo las _MAX_ENTRADAS más recientes.
    # Las entradas antiguas están al inicio de la lista (FIFO).
    # Ejemplo: si hay 101 entradas y el límite es 100, eliminar entradas[0] (la más antigua).
    if len(entradas) > _MAX_ENTRADAS:
        entradas = entradas[-_MAX_ENTRADAS:]  # Slice desde el final: conserva las más nuevas

    try:
        _guardar_lista(entradas)  # Escribir el historial actualizado en disco
        ok    = True
        error = None
    except Exception as e:
        # Si falla la escritura en disco (disco lleno, permisos, etc.) devolver error IPC
        # sin crashear el proceso sidecar
        ok    = False
        error = str(e)

    duracion = int((time.perf_counter() - t0) * 1000)

    result = {
        "ok": ok,
        "data": {
            "total": len(entradas),  # Número total de entradas en el historial tras guardar
        },
        "meta": {
            "timestamp":   datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "duracion_ms": duracion,
        },
    }

    if error:
        result["error"] = error  # Incluir el error en la respuesta si hubo fallo de escritura

    return result
