"""
modulo_06_hardware — Monitorización de métricas de hardware local.

Expone una única función pública run(muestreo) que recopila:
  · CPU:       modelo, núcleos, frecuencia, uso porcentual, temperatura (WMI), historial
  · RAM:       total, disponible, uso porcentual, velocidad (WMI)
  · Disco:     uso de cada partición, velocidad de lectura/escritura, tipo (HDD/SSD, WMI)
  · Batería:   presente/ausente, porcentaje, tiempo restante, estado de carga
  · Eventos:   últimas advertencias críticas del Event Log (IDs 41 y 37 de Kernel)
"""
