"""
Router IPC del sidecar Python de ESTICC.
Recibe mensajes JSON por stdin (uno por línea) y responde por stdout.

Protocolo:
  Entrada:  {"id": "uuid", "action": "scan_ports"}
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

ACCIONES = {
    "scan_ports":    escaner_puertos.run,
    "scan_processes": escaner_procesos.run,
    "scan_startup":  analisis_autoinicio.run,
    "scan_defenses": estado_defensas.run,
    "scan_patches":  verificador_parches.run,
}


def enviar(mensaje: dict):
    print(json.dumps(mensaje, ensure_ascii=False), flush=True)


def main():
    for linea in sys.stdin:
        linea = linea.strip()
        if not linea:
            continue
        try:
            req = json.loads(linea)
        except json.JSONDecodeError as e:
            enviar({"id": None, "error": f"JSON inválido: {e}"})
            continue

        req_id  = req.get("id")
        action  = req.get("action", "")

        if action not in ACCIONES:
            enviar({"id": req_id, "error": f"Acción desconocida: '{action}'"})
            continue

        try:
            resultado = ACCIONES[action]()
            enviar({"id": req_id, "result": resultado})
        except Exception as e:
            enviar({"id": req_id, "error": str(e)})


if __name__ == "__main__":
    main()
