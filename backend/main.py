"""
Router IPC del sidecar Python de ESTICC.
Recibe mensajes JSON por stdin (uno por línea) y responde por stdout.

Protocolo:
  Entrada:  {"id": "uuid", "action": "scan_ports"}
            {"id": "uuid", "action": "radar_correlate", "context": {...}}
  Salida:   {"id": "uuid", "result": {...}}  o  {"id": "uuid", "error": "..."}
"""
import sys
import json

from modulo_02_auditoria import (
    escaner_puertos,
    escaner_procesos,
    analisis_autoinicio,
    estado_defensas,
    verificador_parches,
)
from modulo_03_radar import lector_rss, correlacion

ACCIONES_SIMPLES = {
    "scan_ports":     escaner_puertos.run,
    "scan_processes": escaner_procesos.run,
    "scan_startup":   analisis_autoinicio.run,
    "scan_defenses":  estado_defensas.run,
    "scan_patches":   verificador_parches.run,
    "radar_fetch":    lector_rss.run,
}

ACCIONES_CONOCIDAS = set(ACCIONES_SIMPLES) | {"radar_correlate"}


def enviar(mensaje: dict):
    # ensure_ascii=True: solo bytes ASCII al pipe → sin problemas de codepage en Windows
    print(json.dumps(mensaje, ensure_ascii=True), flush=True)


def main():
    # Forzar UTF-8 en el pipe IPC independientemente del codepage de Windows
    sys.stdin.reconfigure(encoding='utf-8')
    sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)

    for linea in sys.stdin:
        linea = linea.strip()
        if not linea:
            continue
        try:
            req = json.loads(linea)
        except json.JSONDecodeError as e:
            enviar({"id": None, "error": f"JSON inválido: {e}"})
            continue

        req_id = req.get("id")
        action = req.get("action", "")

        if action not in ACCIONES_CONOCIDAS:
            enviar({"id": req_id, "error": f"Acción desconocida: '{action}'"})
            continue

        try:
            if action == "radar_correlate":
                resultado = correlacion.run(req.get("context", {}))
            else:
                resultado = ACCIONES_SIMPLES[action]()
            enviar({"id": req_id, "result": resultado})
        except Exception as e:
            enviar({"id": req_id, "error": str(e)})


if __name__ == "__main__":
    main()
