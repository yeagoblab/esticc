"""
modulo_04_reportes/generador.py

Ejecuta los 5 escáneres de auditoría, calcula una puntuación de riesgo
global (0-100) y devuelve un informe consolidado en un único mensaje IPC.

Diseño deliberado: este módulo llama a los otros módulos directamente
(no a través del router IPC) porque ya está dentro del mismo proceso
Python. Hacerlo vía IPC añadiría 5 round-trips Rust→Python innecesarios.

Flujo de ejecución:
  run()  →  5x escaner.run()  →  _data()  →  _calcular_riesgo()  →  dict IPC
"""
from __future__ import annotations  # Permite "dict | None" en Python 3.8 y 3.9

import socket                        # Para obtener el nombre del equipo (hostname)
from datetime import datetime, timezone  # Timestamp UTC del momento del informe

# Importamos directamente los 5 escáneres de auditoría local.
# No usamos el router IPC porque estamos en el mismo proceso Python:
# llamarlos directamente es más rápido y sencillo.
from modulo_02_auditoria import (
    estado_defensas,     # Firewall, Defender, BitLocker
    escaner_puertos,     # Conexiones TCP activas
    escaner_procesos,    # Procesos activos con métricas de CPU/RAM (también expone CPU_UMBRAL)
    analisis_autoinicio, # Entradas de registro Run y tareas programadas
    verificador_parches, # Actualizaciones pendientes de Windows
)

# Puertos conocidos por ser usados por herramientas de acceso remoto maliciosas:
# 4444  → Metasploit (framework de pentesting/exploits)
# 31337 → "Elite" (nombre clásico de backdoors en la cultura hacker)
# 1337  → Variante de "elite", usado por RATs simples
# 9999  → Puerto genérico frecuente en C2 caseros
# 6666/6667 → IRC (usado por botnets para recibir comandos)
# 1080  → SOCKS proxy (puede indicar tunelado de tráfico malicioso)
# 4899  → Radmin (herramienta de acceso remoto legítima pero frecuentemente explotada)
# 5900  → VNC sin cifrar (acceso remoto gráfico sin autenticación fuerte)
# 5555  → Android Debug Bridge (ADB) expuesto en red
# 7777  → Puerto genérico de muchos RATs
_PUERTOS_SOSPECHOSOS = {4444, 31337, 1337, 9999, 6666, 6667, 1080, 4899, 5900, 5555, 7777}


def _data(resultado: dict) -> dict | list:
    """
    Extrae el campo 'data' de un resultado IPC estándar.
    Devuelve un contenedor vacío (dict o list) si el escáner devolvió error.

    Esta función existe porque si un escáner falla, su 'data' puede ser None
    o no existir, y el código posterior necesita siempre poder operar con un
    tipo correcto (no None) para no lanzar AttributeError/TypeError.

    Ejemplo de resultado IPC exitoso:
      {"ok": True, "data": [...], "meta": {...}}
    Ejemplo de resultado IPC con error:
      {"ok": False, "error": "...", "meta": {...}}
    """
    if isinstance(resultado, dict) and resultado.get("ok"):
        # El escáner tuvo éxito: extraer el campo 'data'
        data = resultado.get("data")
        if data is None:
            # 'data' existe pero es None → devolver contenedor vacío del tipo correcto
            return []  # La mayoría de escáneres devuelven listas; generador.py corrige luego
        return data
    # El escáner devolvió ok=False o no es un dict → devolver vacío
    return {}


def _calcular_riesgo(
    defensas:   dict,
    puertos:    list,
    procesos:   list,
    autoinicio: dict,
    parches:    dict,
) -> tuple[dict, list[dict]]:
    """
    Evalúa el riesgo global del sistema asignando puntos por cada problema.
    Devuelve (puntuacion_dict, hallazgos_list).

    Filosofía del sistema de puntuación:
    - Puntuación MÁS ALTA = sistema MÁS INSEGURO (más riesgo).
    - Máximo teórico > 100; se recorta al final con min(puntos, 100).
    - Los thresholds son intencionalmente conservadores para no alarmar
      innecesariamente a usuarios con sistemas bien configurados.

    Tabla de puntuación:
    ┌───────────────────────────────────────┬────────┐
    │ Problema                              │ Puntos │
    ├───────────────────────────────────────┼────────┤
    │ Firewall desactivado                  │  +30   │
    │ Antivirus desactivado                 │  +25   │
    │ BitLocker no activo                   │   +8   │
    │ Puerto sospechoso en escucha (c/u)    │  +20   │
    │ >40 conexiones ESTABLISHED            │  +10   │
    │ Procesos sin ruta (c/u, máx 20)       │   +5   │
    │ Procesos con CPU alta (c/u, máx 12)   │   +4   │
    │ >20 entradas en registro autoinicio   │  +15   │
    │ >10 entradas en registro autoinicio   │   +5   │
    │ >10 parches pendientes                │  +25   │
    │ 6-10 parches pendientes               │  +12   │
    │ 1-5 parches pendientes                │   +5   │
    └───────────────────────────────────────┴────────┘

    Niveles de riesgo por puntuación total:
      0-10  → bajo    (sistema bien configurado)
      11-35 → medio   (algunos problemas menores)
      36-65 → alto    (problemas relevantes que corregir)
      66+   → critico (compromiso inminente o activo)
    """
    puntos    = 0        # Contador acumulador de puntos de riesgo
    hallazgos: list[dict] = []  # Lista de problemas individuales encontrados

    # ── BLOQUE 1: Defensas (peso máximo ~63 pts) ─────────────────────────────
    # Usamos `is False` en lugar de `not ...` para distinguir tres estados:
    #   True  → defensa activa (no penalizar)
    #   False → defensa explícitamente desactivada (penalizar)
    #   None  → no se pudo comprobar (no penalizar por la duda)

    if defensas.get("firewall", {}).get("activo") is False:
        # El Firewall desactivado es el fallo más grave: expone todos los puertos al exterior
        puntos += 30
        hallazgos.append({
            "nivel":     "critico",
            "categoria": "Defensas",
            "texto":     "Firewall de Windows desactivado",
        })

    if defensas.get("antivirus", {}).get("activo") is False:
        # Antivirus desactivado: segundo fallo más grave, sin detección de malware en tiempo real
        puntos += 25
        hallazgos.append({
            "nivel":     "critico",
            "categoria": "Defensas",
            "texto":     "Antivirus (Windows Defender) desactivado",
        })

    if defensas.get("bitlocker", {}).get("activo") is False:
        # BitLocker solo protege datos en reposo (disco robado/extraído); menos urgente que los anteriores
        puntos += 8
        hallazgos.append({
            "nivel":     "medio",
            "categoria": "Defensas",
            "texto":     "BitLocker no activo: disco sin cifrado en reposo",
        })

    # ── BLOQUE 2: Puertos (peso variable) ────────────────────────────────────
    # Extraer el número de puerto de cada conexión del escáner.
    # El campo "local" tiene formato "ip:puerto", ej: "0.0.0.0:4444"
    puertos_locales: set[int] = set()
    for p in puertos:
        local = p.get("local", "")
        if ":" in local:
            try:
                # rsplit(":", 1) divide solo por el último ":" para manejar IPv6 (::1:443)
                puertos_locales.add(int(local.rsplit(":", 1)[-1]))
            except ValueError:
                pass  # Ignorar si el puerto no es un número válido

    # Intersección de conjuntos: puertos abiertos localmente que están en la lista negra
    for puerto in sorted(puertos_locales & _PUERTOS_SOSPECHOSOS):
        # Cada puerto sospechoso suma 20 puntos: uno solo puede elevar al nivel "alto"
        puntos += 20
        hallazgos.append({
            "nivel":     "critico",
            "categoria": "Puertos",
            "texto":     f"Puerto sospechoso detectado en escucha: {puerto}",
        })

    # Muchas conexiones ESTABLISHED simultáneas pueden indicar un botnet o exfiltración de datos
    establecidas = [p for p in puertos if p.get("estado") == "ESTABLISHED"]
    if len(establecidas) > 40:
        # Umbral de 40: un navegador con muchas pestañas puede generar ~20-30; 40+ es inusual
        puntos += 10
        hallazgos.append({
            "nivel":     "alto",
            "categoria": "Puertos",
            "texto":     f"{len(establecidas)} conexiones TCP ESTABLISHED simultáneas (inusualmente alto)",
        })

    # ── BLOQUE 3: Procesos (peso máximo ~32 pts) ──────────────────────────────
    sin_ruta = [p for p in procesos if p.get("sin_ruta")]   # Procesos sin ruta verificable
    cpu_alta  = [p for p in procesos if p.get("alerta_cpu")] # Procesos con CPU elevada

    if sin_ruta:
        # Un proceso sin ruta ejecutable puede indicar código inyectado en memoria
        # (malware avanzado como Cobalt Strike no deja archivo en disco)
        # Limitamos a 20 pts para que varios procesos legítimos (System, Idle) no inflen el score
        pts = min(len(sin_ruta) * 5, 20)  # 5 pts por proceso, máximo 20
        puntos += pts
        hallazgos.append({
            "nivel":     "alto",
            "categoria": "Procesos",
            "texto":     f"{len(sin_ruta)} proceso(s) sin ruta de ejecutable verificable",
        })

    if cpu_alta:
        # CPU sostenidamente alta puede indicar minería de criptomonedas (cryptojacker)
        pts = min(len(cpu_alta) * 4, 12)  # 4 pts por proceso, máximo 12
        puntos += pts
        hallazgos.append({
            "nivel":     "medio",
            "categoria": "Procesos",
            "texto":     f"{len(cpu_alta)} proceso(s) con consumo de CPU elevado (>{int(escaner_procesos.CPU_UMBRAL)}%)",
        })

    # ── BLOQUE 4: Autoinicio (peso máximo 15 pts) ─────────────────────────────
    # El registro Run es el lugar más frecuente donde el malware instala su persistencia
    num_reg = len(autoinicio.get("registro", []))
    if num_reg > 20:
        # >20 entradas es inusualmente alto; la mayoría de sistemas sanos tienen 5-15
        puntos += 15
        hallazgos.append({
            "nivel":     "alto",
            "categoria": "Autoinicio",
            "texto":     f"{num_reg} entradas de autoinicio en el registro (umbral >20)",
        })
    elif num_reg > 10:
        # Entre 11-20 merece atención pero no es necesariamente alarmante
        puntos += 5
        # Sin hallazgo explícito: solo suma puntos sin mostrar en la lista de problemas

    # ── BLOQUE 5: Parches (peso máximo 25 pts) ────────────────────────────────
    # Los parches de seguridad sin instalar son una de las causas más frecuentes de compromiso
    pendientes = len(parches.get("actualizaciones_pendientes", []))
    if pendientes > 10:
        # >10 parches pendientes: sistema muy desactualizado, múltiples vulnerabilidades explotables
        puntos += 25
        hallazgos.append({
            "nivel":     "alto",
            "categoria": "Parches",
            "texto":     f"{pendientes} actualizaciones de Windows pendientes",
        })
    elif pendientes > 5:
        # 6-10 parches: preocupante pero no crítico
        puntos += 12
        hallazgos.append({
            "nivel":     "medio",
            "categoria": "Parches",
            "texto":     f"{pendientes} actualizaciones de Windows pendientes",
        })
    elif pendientes > 0:
        # 1-5 parches: bajo impacto, solo advertencia informativa
        puntos += 5
        hallazgos.append({
            "nivel":     "bajo",
            "categoria": "Parches",
            "texto":     f"{pendientes} actualización(es) de Windows pendiente(s)",
        })

    # ── Calcular nivel de riesgo global ───────────────────────────────────────
    puntos = min(puntos, 100)  # Recortar al máximo de la escala (100 = máximo riesgo)

    if puntos <= 10:
        nivel = "bajo"     # Sistema bien configurado, sin problemas significativos
    elif puntos <= 35:
        nivel = "medio"    # Algunos problemas menores que conviene revisar
    elif puntos <= 65:
        nivel = "alto"     # Problemas relevantes que aumentan el riesgo de compromiso
    else:
        nivel = "critico"  # Múltiples defensas caídas o vulnerabilidades críticas activas

    return {"puntos": puntos, "nivel": nivel}, hallazgos


def run() -> dict:
    """
    Punto de entrada del módulo de reportes.

    Ejecuta los 5 escáneres en secuencia (no en paralelo — psutil necesita
    un intervalo de tiempo para medir CPU correctamente), calcula el riesgo
    global y devuelve el informe consolidado en formato IPC estándar.

    La respuesta incluye todos los datos crudos de los escáneres para que
    el frontend pueda mostrar el resumen por módulo sin hacer llamadas
    IPC adicionales.
    """
    timestamp = datetime.now(timezone.utc).isoformat(timespec="seconds")  # Momento del informe

    try:
        hostname = socket.gethostname()  # Nombre del equipo para la cabecera del informe
    except Exception:
        hostname = "Equipo local"  # Fallback si el SO no devuelve el hostname

    # Ejecutar los 5 escáneres en secuencia.
    # NOTA: escaner_procesos hace internamente un time.sleep(0.3) para el muestreo de CPU.
    # Ejecutarlos en paralelo con threads no ahorraría tiempo porque el cuello de botella
    # es ese sleep, no la CPU del proceso Python.
    res_defensas   = estado_defensas.run()    # ~1-2s (PowerShell CIM)
    res_puertos    = escaner_puertos.run()    # <1s (psutil.net_connections)
    res_procesos   = escaner_procesos.run()   # ~0.5s (psutil + sleep 300ms)
    res_autoinicio = analisis_autoinicio.run()# ~2s (registro + schtasks)
    res_parches    = verificador_parches.run()# 5-60s dependiendo de WUA/PSWindowsUpdate

    # Extraer el campo 'data' de cada resultado, con fallback a tipo vacío si hubo error
    d_defensas   = _data(res_defensas)
    d_puertos    = _data(res_puertos)
    d_procesos   = _data(res_procesos)
    d_autoinicio = _data(res_autoinicio)
    d_parches    = _data(res_parches)

    # Garantizar que cada variable tiene el tipo correcto aunque _data devuelva {}/[]
    # Esto previene TypeError en _calcular_riesgo si un escáner falla en tiempo de ejecución
    if not isinstance(d_defensas,   dict): d_defensas   = {}
    if not isinstance(d_puertos,    list): d_puertos    = []
    if not isinstance(d_procesos,   list): d_procesos   = []
    if not isinstance(d_autoinicio, dict): d_autoinicio = {}
    if not isinstance(d_parches,    dict): d_parches    = {}

    # Calcular la puntuación de riesgo y la lista de hallazgos
    puntuacion, hallazgos = _calcular_riesgo(
        d_defensas, d_puertos, d_procesos, d_autoinicio, d_parches
    )

    # Respuesta IPC estándar con todos los datos del informe
    return {
        "ok": True,
        "data": {
            "timestamp":  timestamp,   # Cuándo se generó el informe (ISO 8601 UTC)
            "hostname":   hostname,    # Nombre del equipo analizado
            "riesgo":     puntuacion,  # {"puntos": 0-100, "nivel": "bajo/medio/alto/critico"}
            "hallazgos":  hallazgos,   # Lista de problemas encontrados con nivel y descripción
            # Datos crudos de cada escáner (el frontend los usa para el resumen por módulo):
            "defensas":   d_defensas,   # Estado de Firewall, Defender, BitLocker
            "puertos":    d_puertos,    # Lista de conexiones TCP activas
            "procesos":   d_procesos,   # Lista de procesos con métricas
            "autoinicio": d_autoinicio, # Entradas de registro Run y tareas programadas
            "parches":    d_parches,    # Parches pendientes y última actualización
        },
    }
