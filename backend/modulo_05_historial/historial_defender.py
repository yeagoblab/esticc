"""
modulo_05_historial/historial_defender.py

Consulta el historial de análisis de Windows Defender desde tres fuentes:

  1. Get-MpComputerStatus  →  Fecha del último análisis rápido y completo,
                               estado actual de Defender (activo/inactivo).

  2. Get-WinEvent          →  Registro de Eventos de Windows (Event Log):
                               canal "Microsoft-Windows-Windows Defender/Operational".
                               IDs de eventos relevantes:
                                 1000 → Análisis antimalware iniciado
                                 1001 → Análisis antimalware completado
                                 1116 → Amenaza detectada
                                 1117 → Acción tomada sobre amenaza

  3. Get-MpThreatDetection →  Historial de amenazas detectadas (detalle por amenaza).

Todas las llamadas se realizan a través de PowerShell porque:
  - WMI/CIM es la API oficial para consultar Defender desde código no privilegiado.
  - Get-WinEvent lee el Event Log sin necesitar privilegios de administrador.
  - Evita dependencias externas (no necesitamos instalar pywin32 ni similares).

Formato de la respuesta IPC:
  {
    "ok": true,
    "data": {
      "estado":   { ... },    // Último análisis + estado actual de Defender
      "eventos":  [ ... ],    // Eventos del Event Log (inicio/fin de análisis, amenazas)
      "amenazas": [ ... ]     // Historial detallado de amenazas de Get-MpThreatDetection
    },
    "meta": { "timestamp": "...", "duracion_ms": N }
  }
"""
from __future__ import annotations  # Permite anotaciones modernas en Python 3.8/3.9

import subprocess  # Para ejecutar PowerShell como subproceso
import json        # Para parsear la salida JSON de los cmdlets de PS
import time        # Para medir la duración total del análisis
from datetime import datetime, timezone  # Para timestamps UTC y conversión de fechas


def _ps(cmd: str, timeout: int = 20) -> str:
    """
    Ejecuta un comando PowerShell y devuelve la salida (stdout) como string.

    Opciones usadas:
      -NonInteractive: impide que PowerShell espere input del usuario.
                       Sin esta opción, en algunos entornos puede quedarse colgado.

    Manejo de errores:
      Devuelve string vacío en lugar de lanzar excepciones.
      Esto permite que si un cmdlet específico no está disponible (ej: Defender
      desactivado en Windows Home), el resto de consultas sigan funcionando.
    """
    try:
        r = subprocess.run(
            ["powershell", "-NonInteractive", "-Command", cmd],
            capture_output=True,  # Captura stdout y stderr en memoria
            text=True,            # Decodifica como texto UTF-8
            timeout=timeout,      # Timeout configurable por consulta
        )
        return r.stdout.strip()   # Eliminar espacios/saltos de línea del resultado
    except Exception:
        return ""  # Cualquier fallo (timeout, proceso no encontrado) → string vacío


def _parse_fecha(valor: str | None) -> str | None:
    """
    Convierte fechas del formato WMI/PowerShell a ISO 8601 UTC.
    Devuelve None si el valor no se puede parsear.

    PowerShell serializa las fechas en dos formatos según el cmdlet:

    1. Formato WMI ("/Date(ms_epoch)/"):
       Algunas versiones de ConvertTo-Json serializan fechas como
       "/Date(1716451200000)/" donde el número son milisegundos desde
       el epoch Unix (1 enero 1970 00:00:00 UTC).
       Este formato viene de la serialización JSON de .NET DateTime.

    2. Formato ISO string:
       Versiones más recientes de PowerShell serializan como
       "2026-05-23T10:30:00.0000000" o con timezone "+00:00".

    Ejemplo de conversión:
      "/Date(1716451200000)/" → "2026-05-23T08:00:00+00:00"
      "2026-05-23T10:30:00Z" → "2026-05-23T10:30:00+00:00"
    """
    if not valor:
        return None  # Fecha vacía o None → no hay información

    # ── Formato 1: /Date(milisegundos)/ ──────────────────────────────────────
    if isinstance(valor, str) and valor.startswith("/Date("):
        try:
            # Extraer el número entre "/Date(" y ")"
            # Ejemplo: "/Date(1716451200000)/" → 1716451200000
            ms = int(valor[6:valor.index(")")])
            # Convertir de milisegundos a segundos y crear datetime UTC
            return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat()
        except Exception:
            return None  # Si el número no es válido, devolver None

    # ── Formato 2: string ISO o variantes ────────────────────────────────────
    try:
        # Python 3.7+ acepta ISO 8601, pero no el sufijo "Z" (literal de zona UTC).
        # Reemplazar "Z" por "+00:00" para que fromisoformat() lo entienda.
        dt = datetime.fromisoformat(valor.replace("Z", "+00:00"))
        return dt.isoformat()  # Devolver en ISO 8601 estándar
    except Exception:
        # Si no se puede parsear como ISO, devolver el valor original tal cual.
        # Mejor devolver algo que None, para que el frontend pueda al menos mostrarlo.
        return valor


def _estado_actual() -> dict:
    """
    Obtiene el estado actual de Windows Defender y las fechas de los últimos análisis.

    Cmdlet usado: Get-MpComputerStatus
    Requiere: módulo Defender de PowerShell (disponible en Windows 8.1+).

    Campos extraídos:
      LastQuickScanTime  → Fecha/hora del último análisis rápido
      LastFullScanTime   → Fecha/hora del último análisis completo
      QuickScanAge       → Días transcurridos desde el último análisis rápido (entero)
      FullScanAge        → Días transcurridos desde el último análisis completo (entero)
      AMServiceEnabled   → True si el servicio de antimalware está activo
      RealTimeProtectionEnabled → True si la protección en tiempo real está activa

    Si Defender no está disponible o hay un error, devuelve dict vacío {}.
    """
    raw = _ps(
        # Seleccionamos solo los campos que necesitamos (más rápido que traer todo el objeto)
        "Get-MpComputerStatus | Select-Object "
        "LastFullScanTime,LastQuickScanTime,QuickScanAge,FullScanAge,"
        "AMServiceEnabled,RealTimeProtectionEnabled,AntivirusEnabled,"
        "NISEnabled,LastFullScanSource,LastQuickScanSource | ConvertTo-Json"
    )

    if not raw:
        return {}  # El cmdlet falló o Defender no está disponible

    try:
        d = json.loads(raw)  # Parsear el JSON que devolvió PowerShell
        return {
            # Convertir las fechas de formato WMI/PS a ISO 8601 UTC
            "ultimo_analisis_rapido":   _parse_fecha(d.get("LastQuickScanTime")),
            "ultimo_analisis_completo": _parse_fecha(d.get("LastFullScanTime")),
            # QuickScanAge y FullScanAge ya son enteros (días), sin conversión necesaria
            "dias_desde_rapido":        d.get("QuickScanAge"),
            "dias_desde_completo":      d.get("FullScanAge"),
            # Booleanos de estado: True/False/None (None si no se pudo obtener)
            "defender_activo":          d.get("AMServiceEnabled"),
            "proteccion_tiempo_real":   d.get("RealTimeProtectionEnabled"),
        }
    except Exception:
        return {}  # JSON malformado o campos inesperados → devolver dict vacío


def _historial_eventos(max_eventos: int = 60) -> list[dict]:
    """
    Lee el Registro de Eventos de Windows Defender para extraer el historial de análisis.

    Canal del Event Log:
      "Microsoft-Windows-Windows Defender/Operational"
      Este canal registra todas las actividades del servicio Defender:
      inicio de análisis, detecciones, actualizaciones de firmas, etc.

    IDs de evento utilizados:
      1000 → Análisis antimalware INICIADO (tipo quick/full/custom)
      1001 → Análisis antimalware COMPLETADO (con estadísticas)
      1116 → AMENAZA DETECTADA (malware encontrado)
      1117 → ACCIÓN TOMADA sobre amenaza (cuarentena, eliminación, etc.)

    Por qué usamos try/catch dentro del script PowerShell:
      Get-WinEvent lanza una excepción terminante si el canal no existe o está vacío.
      Capturamos la excepción en PowerShell y devolvemos '[]' para que Python no
      reciba un string de error en lugar de JSON.

    Parámetro max_eventos:
      Limita cuántos eventos recientes se leen del canal. Leer todos los eventos
      históricos podría ser lento en equipos con mucha actividad de Defender.
      Con 60 eventos recientes y 4 IDs de interés, capturamos ~15 ciclos completos.
    """
    # El script PowerShell tiene try/catch interno para manejar canales vacíos o sin permisos
    cmd = f"""
        try {{
            Get-WinEvent -LogName 'Microsoft-Windows-Windows Defender/Operational' `
                -MaxEvents {max_eventos} -ErrorAction Stop |
            Where-Object {{ $_.Id -in @(1000,1001,1116,1117) }} |
            Select-Object TimeCreated,Id,LevelDisplayName,Message |
            ConvertTo-Json -Depth 2
        }} catch {{
            Write-Output '[]'
        }}
    """
    # Timeout reducido a 15s: Get-WinEvent con pocos eventos es rápido
    raw = _ps(cmd, timeout=15)

    if not raw or raw == "[]":
        return []  # Sin eventos o error en PowerShell

    try:
        eventos = json.loads(raw)  # Parsear la lista JSON de eventos

        # ConvertTo-Json devuelve un dict (no lista) si solo hay UN evento → normalizar
        if isinstance(eventos, dict):
            eventos = [eventos]

        # Mapas de ID de evento → tipo y etiqueta legible en español
        tipos = {
            1000: "inicio_analisis",    # El usuario o Defender inició un análisis
            1001: "fin_analisis",       # El análisis completó (resultado: N amenazas)
            1116: "amenaza_detectada",  # Defender encontró malware
            1117: "accion_tomada",      # Defender realizó una acción (cuarentena, etc.)
        }
        etiquetas = {
            1000: "Análisis iniciado",
            1001: "Análisis completado",
            1116: "Amenaza detectada",
            1117: "Acción tomada",
        }

        resultado = []
        for ev in eventos:
            eid = ev.get("Id")  # ID numérico del evento (1000, 1001, 1116 o 1117)

            # El campo Message contiene un texto largo multilinea con todos los detalles.
            # Extraemos solo la primera línea para mostrar en la UI (el resto es técnico).
            msg_raw = ev.get("Message") or ""
            msg = msg_raw.split("\n")[0].strip()[:120] if msg_raw else ""
            # [:120]: limitar a 120 caracteres para que quepa en una línea de la UI

            resultado.append({
                "timestamp": _parse_fecha(ev.get("TimeCreated")),  # Momento del evento (ISO 8601)
                "tipo":      tipos.get(eid, "evento"),              # Tipo interno para el frontend
                "etiqueta":  etiquetas.get(eid, f"Evento {eid}"),  # Texto legible en español
                "nivel":     ev.get("LevelDisplayName", ""),        # "Information", "Warning", "Error"
                "mensaje":   msg,                                   # Primera línea del mensaje del evento
                "evento_id": eid,                                   # ID numérico original del evento
                "fuente":    "defender",                            # Para distinguirlo de eventos ESTICC
            })

        return resultado

    except Exception:
        return []  # JSON malformado o estructura inesperada → lista vacía


def _amenazas_recientes(max_amenazas: int = 10) -> list[dict]:
    """
    Obtiene el historial detallado de amenazas detectadas por Windows Defender.

    Cmdlet usado: Get-MpThreatDetection
    Este cmdlet devuelve el historial de todas las detecciones de Defender,
    incluyendo amenazas en cuarentena, eliminadas o ignoradas.

    A diferencia del Event Log (que tiene solo el mensaje de texto),
    Get-MpThreatDetection devuelve datos estructurados con ThreatID, proceso
    afectado, recursos comprometidos y si la acción fue exitosa.

    Campos extraídos:
      InitialDetectionTime → Cuándo se detectó la amenaza por primera vez
      ThreatID             → ID numérico del tipo de amenaza en la base de datos de Defender
      ActionSuccess        → True si Defender pudo eliminar/cuarentenar la amenaza
      ProcessName          → Nombre del proceso que ejecutó el archivo malicioso (si aplica)
      Resources            → Lista de archivos/rutas afectados
    """
    raw = _ps(
        # Obtener las N más recientes y convertir a JSON
        f"Get-MpThreatDetection | "
        "Select-Object InitialDetectionTime,ThreatID,ActionSuccess,ProcessName,Resources | "
        f"Select-Object -First {max_amenazas} | ConvertTo-Json"
    )

    if not raw:
        return []  # Sin amenazas en el historial o Defender no disponible

    try:
        amenazas = json.loads(raw)  # Parsear la lista de amenazas

        # ConvertTo-Json devuelve dict (no lista) si solo hay UNA amenaza → normalizar
        if isinstance(amenazas, dict):
            amenazas = [amenazas]

        return [
            {
                "timestamp":  _parse_fecha(a.get("InitialDetectionTime")),  # Fecha de detección (ISO 8601)
                "threat_id":  a.get("ThreatID"),    # ID numérico del tipo de amenaza en la BD de Defender
                "accion_ok":  a.get("ActionSuccess"), # True si la amenaza fue eliminada/cuarentenada con éxito
                "proceso":    a.get("ProcessName"),  # Proceso que ejecutó el malware (puede ser null)
                "recursos":   a.get("Resources"),    # Archivos/rutas comprometidos (lista o null)
                "fuente":     "defender",            # Identificador de fuente para el frontend
                "tipo":       "amenaza_detectada",   # Tipo de evento para el calendario
            }
            for a in amenazas
        ]
    except Exception:
        return []  # JSON malformado o campos inesperados → lista vacía


def run() -> dict:
    """
    Punto de entrada IPC del módulo.

    Ejecuta las tres consultas a Defender en secuencia y combina los resultados.
    Las consultas son secuenciales (no paralelas) porque PowerShell tiene un coste
    de arranque (~200-300ms) que hace que el paralelismo con threads no aporte
    beneficio real para 3 comandos cortos.

    Respuesta exitosa:
      {
        "ok": true,
        "data": {
          "estado": {
            "ultimo_analisis_rapido":   "2026-05-22T18:30:00+00:00",
            "ultimo_analisis_completo": "2026-05-10T02:00:00+00:00",
            "dias_desde_rapido":  1,
            "dias_desde_completo": 13,
            "defender_activo": true,
            "proteccion_tiempo_real": true
          },
          "eventos": [
            { "timestamp": "...", "tipo": "fin_analisis", "etiqueta": "Análisis completado", ... },
            ...
          ],
          "amenazas": [
            { "timestamp": "...", "threat_id": 2147519003, "accion_ok": true, "proceso": null, ... },
            ...
          ]
        },
        "meta": { "timestamp": "...", "duracion_ms": 2850 }
      }
    """
    t0 = time.perf_counter()  # Inicio del cronómetro global

    estado   = _estado_actual()           # ~500ms: consulta Get-MpComputerStatus
    eventos  = _historial_eventos()       # ~500ms: consulta Get-WinEvent
    amenazas = _amenazas_recientes()      # ~300ms: consulta Get-MpThreatDetection

    duracion = int((time.perf_counter() - t0) * 1000)  # Duración total en ms

    return {
        "ok": True,
        "data": {
            "estado":   estado,    # Estado actual de Defender + fechas de últimos análisis
            "eventos":  eventos,   # Lista de eventos del Event Log (inicio/fin/amenazas)
            "amenazas": amenazas,  # Lista de amenazas detectadas con detalle
        },
        "meta": {
            "timestamp":   datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "duracion_ms": duracion,  # Típicamente 1000-3000ms según rendimiento del sistema
        },
    }
