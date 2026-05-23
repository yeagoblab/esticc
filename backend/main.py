"""
Router IPC del sidecar Python de ESTICC.
Recibe mensajes JSON por stdin (uno por línea) y responde por stdout.

Protocolo:
  Entrada:  {"id": "uuid", "action": "scan_ports"}
            {"id": "uuid", "action": "radar_correlate", "context": {...}}
  Salida:   {"id": "uuid", "result": {...}}  o  {"id": "uuid", "error": "..."}
"""
from __future__ import annotations  # Permite anotaciones de tipo modernas en Python 3.8/3.9

import sys   # Acceso a stdin/stdout del proceso
import json  # Serialización y deserialización de mensajes JSON

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

# Diccionario acción → función: permite despachar sin if/elif explícitos
# Las acciones simples no necesitan datos extra del request
ACCIONES_SIMPLES: dict[str, callable] = {
    "scan_ports":     escaner_puertos.run,    # Escaneo de puertos TCP
    "scan_processes": escaner_procesos.run,   # Lista de procesos activos
    "scan_startup":   analisis_autoinicio.run,# Entradas de autoinicio
    "scan_defenses":  estado_defensas.run,    # Estado de las defensas
    "scan_patches":   verificador_parches.run,# Parches pendientes
    "radar_fetch":    lector_rss.run,         # Descarga de noticias RSS
    "generate_report": generador.run,        # Informe consolidado (5 escáneres + riesgo)
}

# Conjunto de todas las acciones válidas, incluyendo las que tienen lógica especial
ACCIONES_CONOCIDAS: set[str] = set(ACCIONES_SIMPLES) | {"radar_correlate"}


def enviar(mensaje: dict) -> None:
    """Serializa el mensaje a JSON y lo escribe en stdout con flush inmediato."""
    # ensure_ascii=True: solo bytes ASCII al pipe → evita errores de codepage en Windows
    print(json.dumps(mensaje, ensure_ascii=True), flush=True)


def main() -> None:
    """Bucle principal del sidecar: lee peticiones línea a línea y responde."""

    # Forzar UTF-8 en stdin y stdout independientemente del codepage del sistema operativo
    # Sin esto, Windows usa CP1252 por defecto y el pipe falla con caracteres no ASCII
    sys.stdin.reconfigure(encoding='utf-8')
    sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)  # line_buffering=True: flush automático en cada \n

    # Bucle infinito: cada iteración procesa una petición de Rust
    for linea in sys.stdin:
        linea = linea.strip()  # Eliminar espacios y saltos de línea

        if not linea:          # Ignorar líneas vacías (puede haber pings del heartbeat)
            continue

        # Intentar parsear el JSON recibido desde Rust
        try:
            req = json.loads(linea)  # Convierte el string JSON en un dict de Python
        except json.JSONDecodeError as e:
            # Si el JSON está malformado, responder con error sin crashear el proceso
            enviar({"id": None, "error": f"JSON inválido: {e}"})
            continue

        req_id = req.get("id")      # ID único de la petición (correlaciona respuesta con Rust)
        action = req.get("action", "")  # Nombre de la acción a ejecutar

        # Rechazar acciones desconocidas antes de intentar ejecutarlas
        if action not in ACCIONES_CONOCIDAS:
            enviar({"id": req_id, "error": f"Acción desconocida: '{action}'"})
            continue

        try:
            if action == "radar_correlate":
                # radar_correlate necesita el campo "context" del request JSON
                # que contiene: { "noticias": [...], "puertos": [...], "procesos": [...] }
                context = req.get("context", {})  # Si no viene context, usar dict vacío
                resultado = correlacion.run(context)
            else:
                # El resto de acciones no necesitan datos extra → llamada directa sin args
                resultado = ACCIONES_SIMPLES[action]()

            # Enviar resultado exitoso: Rust busca el campo "result" para resolver la promesa
            enviar({"id": req_id, "result": resultado})

        except Exception as e:
            # Capturar cualquier error del escáner y devolverlo como error IPC
            # Esto evita que un escáner crashee todo el sidecar
            enviar({"id": req_id, "error": str(e)})


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass  # Terminación normal cuando Tauri cierra el proceso sidecar
