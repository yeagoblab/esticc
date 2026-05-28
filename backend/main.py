"""
Router IPC del sidecar Python de ESTICC.
Recibe mensajes JSON por stdin (uno por línea) y responde por stdout.

Protocolo:
  Entrada:  {"id": "uuid", "action": "scan_ports"}
            {"id": "uuid", "action": "radar_correlate", "context": {...}}
  Salida:   {"id": "uuid", "result": {...}}  o  {"id": "uuid", "error": "..."}

Concurrencia:
  Cada petición se despacha en un hilo separado via ThreadPoolExecutor.
  Esto permite que scan_ports (rápido) responda mientras scan_patches (lento)
  sigue ejecutándose, evitando timeouts artificiales en la UI.
  El stdout_lock garantiza que las respuestas JSON no se entrelacen.
"""
from __future__ import annotations  # Permite anotaciones de tipo modernas en Python 3.8/3.9

import sys       # Acceso a stdin/stdout del proceso
import json      # Serialización y deserialización de mensajes JSON
import threading # Lock para escritura thread-safe en stdout
from concurrent.futures import ThreadPoolExecutor  # Ejecución concurrente de escáneres

# Importamos los 5 módulos de auditoría local (cada uno es un archivo .py independiente)
from modulo_02_auditoria import (
    escaner_puertos,    # Lista conexiones TCP activas del sistema
    escaner_procesos,   # Lista procesos en ejecución con CPU y RAM
    analisis_autoinicio,# Lee claves Run del registro y tareas programadas
    estado_defensas,    # Comprueba Firewall, Defender y BitLocker
    verificador_parches,# Consulta actualizaciones pendientes de Windows
)

# Importamos los 2 módulos del radar OSINT
from modulo_03_radar import (
    lector_rss,  # Descarga noticias de 6 feeds RSS de ciberseguridad
    correlacion, # Cruza noticias con el estado del sistema local
)

# Importamos el generador de informes consolidados
from modulo_04_reportes import generador  # Ejecuta los 5 escáneres + puntuación de riesgo

# Importamos los módulos del historial de análisis
from modulo_05_historial import historial_defender, historial_esticc

# Importamos el módulo de monitorización de hardware (CPU, RAM, disco, batería, eventos)
from modulo_06_hardware import escaner_hardware

# Importamos el módulo de auto-actualización (GitHub Releases API)
from modulo_07_actualizador import actualizador

# Importamos el módulo de configuración persistente (%APPDATA%\ESTICC\config.json)
from modulo_01_config import config as config_modulo

# Diccionario acción → función: permite despachar sin if/elif explícitos
# Las acciones simples no necesitan datos extra del request
ACCIONES_SIMPLES: dict[str, callable] = {
    "scan_ports":     escaner_puertos.run,    # Escaneo de puertos TCP
    "scan_processes": escaner_procesos.run,   # Lista de procesos activos
    "scan_startup":   analisis_autoinicio.run,# Entradas de autoinicio
    "scan_defenses":  estado_defensas.run,    # Estado de las defensas
    "scan_patches":   verificador_parches.run,# Parches pendientes
    "radar_fetch":    lector_rss.run,         # Descarga de noticias RSS
    "generate_report":      generador.run,           # Informe consolidado (5 escáneres + riesgo)
    "historial_defender":   historial_defender.run,       # Historial de análisis de Defender
    "historial_esticc_get": historial_esticc.get,         # Historial de escaneos ESTICC (lectura)
    "update_check":         actualizador.check_update,    # Consulta GitHub Releases API
    "config_get":           config_modulo.get,            # Lee config de %APPDATA%\ESTICC\config.json
}

# Conjunto de todas las acciones válidas, incluyendo las que tienen lógica especial
ACCIONES_CONOCIDAS: set[str] = set(ACCIONES_SIMPLES) | {
    "radar_correlate",         # Necesita el campo "context" del request
    "historial_esticc_guardar",# Necesita el campo "entrada" del request
    "scan_hardware",           # Necesita el campo "muestreo" (segundos, default 3)
    "update_download",         # Necesita el campo "url_zip"
    "update_apply",            # Necesita el campo "ps_path"
    "config_set",              # Necesita el campo "cfg" con el dict de configuración
}


def main() -> None:
    """Bucle principal del sidecar: lee peticiones línea a línea y las despacha en hilos."""

    # Forzar UTF-8 en stdin y stdout independientemente del codepage del sistema operativo
    # Sin esto, Windows usa CP1252 por defecto y el pipe falla con caracteres no ASCII
    sys.stdin.reconfigure(encoding='utf-8')
    sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)

    # Lock que serializa las escrituras a stdout: sin él, dos hilos podrían entrelazar
    # sus respuestas JSON y Rust recibiría líneas inválidas.
    stdout_lock = threading.Lock()

    def enviar(mensaje: dict) -> None:
        """Serializa el mensaje a JSON y lo escribe en stdout de forma thread-safe."""
        linea = json.dumps(mensaje, ensure_ascii=True)
        with stdout_lock:
            print(linea, flush=True)

    def despachar(req: dict) -> None:
        """Ejecuta la acción de una petición y envía la respuesta. Se llama en un hilo."""
        req_id = req.get("id")
        action = req.get("action", "")

        if action not in ACCIONES_CONOCIDAS:
            enviar({"id": req_id, "error": f"Acción desconocida: '{action}'"})
            return

        try:
            if action == "radar_correlate":
                context  = req.get("context", {})
                resultado = correlacion.run(context)
            elif action == "historial_esticc_guardar":
                entrada  = req.get("entrada", {})
                resultado = historial_esticc.guardar(entrada)
            elif action == "scan_hardware":
                muestreo = int(req.get("muestreo", 3))
                resultado = escaner_hardware.run(muestreo=muestreo)
            elif action == "update_download":
                url_zip  = req.get("url_zip", "")
                resultado = actualizador.download_and_prepare(url_zip)
            elif action == "update_apply":
                ps_path  = req.get("ps_path", "")
                resultado = actualizador.apply_update(ps_path)
            elif action == "config_set":
                cfg_data = req.get("cfg", {})
                resultado = config_modulo.set_config(cfg_data)
            else:
                resultado = ACCIONES_SIMPLES[action]()

            enviar({"id": req_id, "result": resultado})

        except Exception as e:
            enviar({"id": req_id, "error": str(e)})

    # max_workers=8: suficiente para atender todos los paneles a la vez sin saturar el sistema.
    # Los escáneres más pesados (scan_patches, generate_report) bloquean su hilo pero no
    # impiden que otros escáneres rápidos (scan_ports, scan_processes) respondan de inmediato.
    with ThreadPoolExecutor(max_workers=8) as pool:
        for linea in sys.stdin:
            linea = linea.strip()

            if not linea:
                continue

            try:
                req = json.loads(linea)
            except json.JSONDecodeError as e:
                enviar_error = json.dumps({"id": None, "error": f"JSON inválido: {e}"}, ensure_ascii=True)
                with stdout_lock:
                    print(enviar_error, flush=True)
                continue

            # Enviar la petición al pool; el hilo lector de stdin no se bloquea
            pool.submit(despachar, req)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass  # Terminación normal cuando Tauri cierra el proceso sidecar
