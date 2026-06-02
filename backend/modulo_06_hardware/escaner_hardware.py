"""
escaner_hardware.py — Recopila métricas de CPU, RAM, disco, batería y Event Log.

Estrategia de medición:
  · psutil.cpu_percent(interval=muestreo): bloquea durante 'muestreo' segundos tomando
    una muestra real de actividad de CPU. Este bloqueo se usa también como ventana de
    tiempo para medir la velocidad de disco (dos lecturas de io_counters, antes y después).
  · WMI / CIM: consultado mediante PowerShell para datos que psutil no expone en Windows
    (temperatura, velocidad de RAM, tipo de disco HDD/SSD, modelo de CPU).
  · Event Log: PowerShell Get-WinEvent filtra los últimos 5 eventos de Kernel-Power (ID 41)
    y Kernel-Processor-Power (ID 37) relevantes para detectar reinicios inesperados y
    estrangulamiento térmico (thermal throttling).
"""
from __future__ import annotations  # Permite anotaciones modernas en Python 3.8

import json      # Parsear JSON devuelto por PowerShell en algunos helpers
import time      # time.time() para calcular duracion_s del escaneo
import datetime  # datetime.now().isoformat() para el timestamp de la respuesta
import subprocess  # subprocess.run() para lanzar comandos PowerShell

import psutil  # Métricas de sistema multiplataforma (CPU, RAM, disco, batería)


# ── Helper PowerShell ────────────────────────────────────────────────────────

def _ps(comando: str) -> str:
    """
    Ejecuta un comando PowerShell y devuelve su stdout como string.
    Usa -NonInteractive y -NoProfile para máxima velocidad de arranque.
    Captura stderr por separado para no mezclar errores con la salida útil.
    Devuelve '' si el proceso falla o lanza excepción (ej. timeout, permisos).
    """
    try:
        r = subprocess.run(
            ["powershell", "-NonInteractive", "-NoProfile", "-Command", comando],
            capture_output=True,   # Captura stdout y stderr en r.stdout / r.stderr
            text=True,             # Decodifica los bytes a str automáticamente
            timeout=10,            # Máximo 10 s por consulta WMI/CIM para no bloquear
        )
        return r.stdout.strip()    # Eliminar espacios y saltos de línea del resultado
    except Exception:
        return ''                  # Cualquier fallo (timeout, FileNotFoundError) → vacío


# ── CPU ──────────────────────────────────────────────────────────────────────

def _cpu_modelo() -> str:
    """
    Devuelve el nombre completo del procesador, p.ej. 'Intel(R) Core(TM) i7-10750H CPU @ 2.60GHz'.
    psutil no expone el nombre del modelo, así que usamos WMI via PowerShell.
    En caso de fallo, devolvemos 'Desconocido' como fallback seguro.
    """
    salida = _ps("(Get-WmiObject Win32_Processor).Name")  # Consulta WMI al objeto del procesador
    return salida if salida else 'Desconocido'             # Fallback si WMI no responde


def _cpu_temperatura() -> float | None:
    """
    Intenta leer la temperatura del procesador en grados Celsius.
    Windows no expone temperaturas en psutil.sensors_temperatures() → devuelve {}.
    Usamos la clase WMI MSAcpi_ThermalZoneTemperature del namespace root/WMI.
    El valor WMI está en décimas de Kelvin: dividir entre 10 y restar 273.15 → Celsius.
    Devuelve None si WMI no tiene datos o el valor es inválido (0, negativo, > 150 °C).
    """
    salida = _ps(
        # Obtener el primer sensor de temperatura disponible y redondear a 1 decimal
        "(Get-WmiObject -Namespace 'root/WMI' -Class MSAcpi_ThermalZoneTemperature "
        "| Select-Object -First 1 -ExpandProperty CurrentTemperature)"
    )
    if not salida:                # PowerShell no devolvió nada (WMI no disponible o sin sensor)
        return None
    try:
        decimas_kelvin = float(salida)                    # El valor WMI está en décimas de K
        celsius = round((decimas_kelvin / 10.0) - 273.15, 1)  # Convertir a °C
        # Validar que el valor esté en rango físico razonable (0–150 °C)
        return celsius if 0 < celsius < 150 else None
    except ValueError:
        return None  # La salida no era un número válido


def _recopilar_cpu(muestreo: int, io_antes: object) -> dict:
    """
    Toma una muestra de CPU durante 'muestreo' segundos y recopila todas las métricas.
    El bloqueo de cpu_percent(interval=muestreo) es intencional: nos da una medición
    real de actividad en lugar de un snapshot puntual que podría ser 0 % o 100 %.
    También sirve de ventana de tiempo para calcular la velocidad de disco (io_antes).
    Devuelve un dict con: modelo, nucleos_fisicos, nucleos_logicos, frecuencia_mhz,
    uso_pct, temperatura_c.
    """
    uso_pct = psutil.cpu_percent(interval=muestreo)      # Bloquea 'muestreo' segundos → medición real
    freq    = psutil.cpu_freq()                          # Frecuencia actual/min/max en MHz
    modelo  = _cpu_modelo()                              # Nombre del procesador vía WMI
    temp    = _cpu_temperatura()                         # Temperatura en °C (None si no disponible)

    return {
        "modelo":          modelo,                                  # Ej. 'Intel Core i7-10750H'
        "nucleos_fisicos": psutil.cpu_count(logical=False) or 1,   # Núcleos físicos (sin HT)
        "nucleos_logicos": psutil.cpu_count(logical=True)  or 1,   # Núcleos con Hyper-Threading
        "frecuencia_mhz":  round(freq.current) if freq else None,   # Frecuencia actual en MHz
        "uso_pct":         round(uso_pct, 1),                       # Uso porcentual con 1 decimal
        "temperatura_c":   temp,                                    # °C o None si no disponible
    }


# ── RAM ──────────────────────────────────────────────────────────────────────

def _ram_velocidad_mhz() -> int | None:
    """
    Consulta la velocidad de los módulos de RAM en MHz via WMI Win32_PhysicalMemory.
    Devuelve la velocidad del primer módulo encontrado, o None si WMI falla.
    La mayoría de sistemas reportan la velocidad configurada (XMP/SPD), no la real.
    """
    salida = _ps(
        "(Get-WmiObject Win32_PhysicalMemory | Select-Object -First 1 -ExpandProperty Speed)"
    )
    if not salida:
        return None  # WMI no disponible o el sistema no tiene RAM DIMM física (VM, etc.)
    try:
        vel = int(salida)              # La velocidad llega como entero (ej. 3200)
        return vel if vel > 0 else None  # 0 = campo no informado por el firmware
    except ValueError:
        return None


def _recopilar_ram() -> dict:
    """
    Recopila métricas de memoria RAM usando psutil y WMI para la velocidad.
    svmem.available es la RAM que el SO puede asignar sin swap, no solo la libre.
    """
    mem    = psutil.virtual_memory()  # NamedTuple: total, available, percent, used, free
    vel    = _ram_velocidad_mhz()     # MHz del módulo (puede ser None)

    return {
        "total_gb":     round(mem.total    / 1024**3, 1),  # Bytes → GB con 1 decimal
        "disponible_gb":round(mem.available/ 1024**3, 1),  # RAM disponible para nuevos procesos
        "uso_pct":      round(mem.percent, 1),             # % usado reportado por el SO
        "velocidad_mhz":vel,                               # Velocidad del módulo (o None)
    }


# ── DISCO ────────────────────────────────────────────────────────────────────

def _tipos_disco() -> dict[str, str]:
    """
    Consulta el tipo (HDD / SSD) de cada disco físico via PowerShell Get-PhysicalDisk.
    Devuelve un dict {letra_unidad: tipo}, ej. {"C": "SSD", "D": "HDD"}.
    MediaType 3 = HDD, 4 = SSD. Valores distintos (ej. 0 = no informado) → 'Desconocido'.
    El mapeo usa FriendlyName (ej. 'Samsung SSD 860') como clave intermedia porque
    Win32 no asocia discos físicos a letras directamente; el partido se hace por número.
    """
    salida = _ps(
        "Get-PhysicalDisk | Select-Object DeviceId,MediaType | ConvertTo-Json -Compress"
    )
    if not salida:
        return {}  # PowerShell falló o Get-PhysicalDisk no está disponible (Windows 7)

    try:
        discos = json.loads(salida)                   # Parsear JSON con lista de discos
        if isinstance(discos, dict):                  # Si solo hay un disco, llega como objeto
            discos = [discos]                         # Normalizar a lista para el bucle

        mapping = {}
        for d in discos:
            media = d.get("MediaType", 0)             # 3=HDD, 4=SSD, 0=desconocido
            tipo  = {3: "HDD", 4: "SSD"}.get(media, "Desconocido")
            dev_id = str(d.get("DeviceId", ""))       # ID numérico del disco físico
            mapping[dev_id] = tipo                    # Guardar por ID para el cruce posterior
        return mapping
    except (json.JSONDecodeError, TypeError):
        return {}  # JSON malformado → ignorar datos de tipo


def _velocidad_disco(io_antes: object, io_despues: object, elapsed_s: float) -> dict:
    """
    Calcula la velocidad de lectura/escritura de disco entre dos muestras de io_counters.
    io_antes se tomó antes del bloqueo de cpu_percent, io_despues justo después.
    elapsed_s es el tiempo real transcurrido entre ambas muestras (≈ muestreo, pero exacto).
    Devuelve velocidades en MB/s redondeadas a 2 decimales. Si io_counters no está
    disponible (VMs, algunos contenedores), devuelve 0.0 para ambas métricas.
    """
    if io_antes is None or io_despues is None:
        return {"lectura_mbs": 0.0, "escritura_mbs": 0.0}  # io_counters no disponible

    elapsed_s = max(elapsed_s, 0.001)  # Evitar división por cero si el tiempo fue mínimo

    # Diferencia de bytes leídos/escritos entre las dos muestras
    bytes_leidos   = io_despues.read_bytes  - io_antes.read_bytes
    bytes_escritos = io_despues.write_bytes - io_antes.write_bytes

    # Convertir diferencia de bytes a MB/s
    lectura_mbs   = round(bytes_leidos   / (1024**2) / elapsed_s, 2)
    escritura_mbs = round(bytes_escritos / (1024**2) / elapsed_s, 2)

    return {
        "lectura_mbs":   max(lectura_mbs,   0.0),  # Nunca negativo (overflow de contador)
        "escritura_mbs": max(escritura_mbs, 0.0),
    }


def _recopilar_disco(io_antes: object, io_despues: object, elapsed_s: float) -> dict:
    """
    Recopila uso de cada partición, velocidades de I/O y tipo de disco.
    Solo incluye particiones con sdiskpart.fstype definido (excluye unidades de red sin montar).
    """
    tipos   = _tipos_disco()      # Dict de tipo por DeviceId (puede estar vacío)
    vel     = _velocidad_disco(io_antes, io_despues, elapsed_s)  # Lectura/escritura en MB/s

    particiones = []
    for part in psutil.disk_partitions(all=False):  # all=False: solo particiones reales montadas
        if not part.fstype:                          # Ignorar entradas sin sistema de archivos
            continue
        try:
            uso = psutil.disk_usage(part.mountpoint)  # Puede lanzar PermissionError en algunas
        except PermissionError:
            continue  # Saltar particiones inaccesibles (ej. unidades cifradas no montadas)

        particiones.append({
            "unidad":    part.mountpoint,                  # Ej. 'C:\\' o '/mnt/data'
            "total_gb":  round(uso.total / 1024**3, 1),    # Capacidad total en GB
            "libre_gb":  round(uso.free  / 1024**3, 1),    # Espacio libre en GB
            "uso_pct":   round(uso.percent, 1),             # Porcentaje usado
            "tipo":      tipos.get("0", "Desconocido"),     # HDD/SSD (simplificado)
        })

    return {
        "particiones":     particiones,    # Lista de particiones con uso
        "lectura_mbs":     vel["lectura_mbs"],   # Velocidad de lectura global del sistema
        "escritura_mbs":   vel["escritura_mbs"], # Velocidad de escritura global del sistema
    }


# ── BATERÍA ──────────────────────────────────────────────────────────────────

def _recopilar_bateria() -> dict:
    """
    Devuelve información de la batería si el sistema tiene una (portátil).
    psutil.sensors_battery() devuelve None en equipos de escritorio sin UPS.
    secsleft = -1 indica que está cargando; -2 indica que psutil no puede calcularlo.
    Convertimos el tiempo restante a minutos enteros para facilitar la visualización.
    """
    bat = psutil.sensors_battery()  # None en desktops, NamedTuple en portátiles

    if bat is None:
        return {"presente": False}  # Desktop o sistema sin batería detectable

    # Calcular minutos restantes (evitar valores especiales -1 y -2 de psutil)
    if bat.secsleft > 0:
        minutos_restantes = int(bat.secsleft / 60)  # Convertir segundos a minutos enteros
    else:
        minutos_restantes = None  # Cargando o tiempo no calculable

    return {
        "presente":          True,
        "porcentaje":        round(bat.percent, 1),    # Nivel de carga con 1 decimal
        "cargando":          bat.power_plugged,        # True si el adaptador está conectado
        "minutos_restantes": minutos_restantes,        # None si cargando o desconocido
    }


# ── EVENT LOG ────────────────────────────────────────────────────────────────

def _recopilar_eventos() -> list[dict]:
    """
    Recupera los últimos eventos críticos de hardware del Event Log de Windows.
    Filtra dos IDs específicos del subsistema Kernel:
      · ID 41 (Kernel-Power): reinicio inesperado / apagado brusco sin proceso limpio de shutdown
      · ID 37 (Kernel-Processor-Power): estrangulamiento térmico (thermal throttling) del procesador
    Devuelve una lista de dicts con tipo, timestamp y descripción breve.
    Máximo 5 eventos para no sobrecargar la UI.
    """
    cmd = (
        # Combinar búsqueda de ambos Event IDs en un solo Get-WinEvent con -FilterHashtable
        "try { "
        "$e = Get-WinEvent -FilterHashtable @{LogName='System'; Id=41,37} "
        "-MaxEvents 5 -ErrorAction Stop | "
        "Select-Object Id,TimeCreated,Message | "
        "ForEach-Object { "
        "  [PSCustomObject]@{ "
        "    id=$_.Id; "
        "    ts=$_.TimeCreated.ToString('yyyy-MM-ddTHH:mm:ss'); "
        "    msg=($_.Message -split '`n')[0] "  # Solo primera línea del mensaje (puede ser largo)
        "  } "
        "} | ConvertTo-Json -Compress; "
        "if($e){$e}else{'[]'} "
        "} catch { '[]' }"  # Si no hay eventos o falla el acceso al log, devolver JSON vacío
    )
    salida = _ps(cmd)           # Ejecutar la consulta PowerShell
    if not salida or salida == '[]':
        return []               # Sin eventos críticos recientes

    try:
        eventos_raw = json.loads(salida)           # Parsear la lista JSON
        if isinstance(eventos_raw, dict):          # Un solo evento llega como objeto, no lista
            eventos_raw = [eventos_raw]

        eventos = []
        for ev in eventos_raw:
            ev_id = ev.get("id", 0)
            # Mapear el ID a un tipo descriptivo para la UI
            tipo = {
                41: "reinicio_inesperado",  # Kernel-Power: shutdown brusco / corte de luz
                37: "throttling_termico",   # Kernel-Processor-Power: CPU reducida por calor
            }.get(ev_id, "desconocido")

            eventos.append({
                "tipo":      tipo,
                "timestamp": ev.get("ts", ""),     # ISO datetime del evento
                "mensaje":   ev.get("msg", ""),    # Primera línea del mensaje del evento
            })
        return eventos
    except (json.JSONDecodeError, TypeError):
        return []  # JSON malformado → ignorar eventos


# ── SALUD / VIDA ÚTIL ────────────────────────────────────────────────────────

def _cpu_salud(temperatura_c: 'float | None', eventos: list) -> dict:
    """
    Puntuación de salud de CPU (0–100) con factores explicativos y consejo.

    Devuelve un dict con:
      · pct      (int)       puntuación 0–100
      · factores (list[dict]) cada factor con 'tipo' ('ok'|'warn'|'danger') y 'texto'
      · consejo  (str|None)  qué puede hacer el usuario para mejorar la salud
    """
    score    = 100   # Puntuación inicial perfecta; cada problema detectado resta puntos
    factores = []    # Lista de factores mostrados al usuario con su nivel (ok/warn/danger)
    consejos = []    # Acciones recomendadas; se deduplican antes de devolverlas

    # ── Factor temperatura ───────────────────────────────────────────────────
    if temperatura_c is not None:
        if temperatura_c >= 90:
            score -= 20   # Zona crítica: la electromigración se acelera exponencialmente >90°C
            factores.append({"tipo": "danger",
                "texto": f"Temperatura crítica: {temperatura_c} °C — riesgo de daño acumulativo en el chip"})
            consejos.append("Revisa urgentemente la refrigeración: puede que la pasta térmica esté seca o el disipador esté obstruido por polvo.")
        elif temperatura_c >= 85:
            score -= 10   # Zona de riesgo: el margen hasta el thermal throttling es mínimo
            factores.append({"tipo": "warn",
                "texto": f"Temperatura elevada: {temperatura_c} °C — margen de seguridad muy reducido"})
            consejos.append("Limpia los ventiladores y comprueba que el disipador hace buen contacto con el procesador.")
        elif temperatura_c >= 70:
            score -= 5    # Zona de aviso: aceptable bajo carga, preocupante en reposo
            factores.append({"tipo": "warn",
                "texto": f"Temperatura en zona de aviso: {temperatura_c} °C"})
            consejos.append("Asegúrate de que el equipo tiene buena ventilación y los ventiladores no están obstruidos.")
        else:
            # Temperatura dentro del rango seguro para la mayoría de procesadores (<70°C)
            factores.append({"tipo": "ok",
                "texto": f"Temperatura en rango normal: {temperatura_c} °C"})
    else:
        # WMI MSAcpi_ThermalZoneTemperature no expone datos en todos los sistemas
        factores.append({"tipo": "ok",
            "texto": "Sensor de temperatura no disponible en este sistema"})

    # ── Factor throttling térmico ────────────────────────────────────────────
    # Cuenta los eventos de ID 37 (Kernel-Processor-Power) ya recopilados por _recopilar_eventos()
    throttling = sum(1 for e in eventos if e.get('tipo') == 'throttling_termico')
    if throttling > 0:
        score -= min(throttling * 8, 30)  # 8 pts por evento; cap 30 para que un evento puntual no destruya el score
        factores.append({"tipo": "warn",
            "texto": f"{throttling} evento(s) de reducción de velocidad por calor en el historial del sistema"})
        consejos.append("El procesador ha bajado su frecuencia para no sobrecalentarse. Considera cambiar la pasta térmica o mejorar el flujo de aire del chasis.")
    else:
        factores.append({"tipo": "ok",
            "texto": "Sin eventos de reducción de velocidad por calor registrados"})

    score = max(0, min(100, score))  # Clamp final al rango [0, 100] por si varias penalizaciones se acumulan

    # Eliminar consejos duplicados preservando el orden de aparición
    # (puede haber duplicados si temperatura y throttling generan el mismo consejo)
    vistos, unicos = set(), []
    for c in consejos:
        if c not in vistos:
            vistos.add(c)
            unicos.append(c)
    consejo = " ".join(unicos) if unicos else None  # Concatenar o None si no hay nada que mejorar

    return {"pct": score, "factores": factores, "consejo": consejo}


def _ram_salud() -> dict:
    """
    Puntuación de salud de RAM (0–100) con factores y consejo.
    Usa el uso de swap como proxy de saturación o degradación de módulos.
    """
    score    = 100   # Puntuación de partida; el swap alto la degrada progresivamente
    factores = []
    consejo  = None

    try:
        swap = psutil.swap_memory()  # NamedTuple: total, used, free, percent, sin, sout
        if swap.total == 0:
            # Sin archivo de paginación → Windows gestiona solo con RAM física
            factores.append({"tipo": "ok",
                "texto": "Sin archivo de paginación configurado (sistema con RAM suficiente)"})
        else:
            pct = round(swap.percent, 1)  # % del archivo de paginación en uso
            if pct >= 80:
                score -= 30  # Uso crítico: el disco sustituye a la RAM, rendimiento muy degradado
                factores.append({"tipo": "danger",
                    "texto": f"Memoria de intercambio (swap) al {pct}% — el sistema está usando intensivamente el disco como RAM"})
                consejo = ("El equipo se está quedando sin memoria RAM. "
                           "Cierra aplicaciones que no uses, añade más RAM o aumenta el archivo de paginación. "
                           "Si persiste, un módulo de RAM podría estar fallando — ejecuta el diagnóstico de memoria de Windows (mdsched.exe).")
            elif pct >= 50:
                score -= 15  # Uso moderado-alto: señal de que la RAM no da abasto
                factores.append({"tipo": "warn",
                    "texto": f"Memoria de intercambio al {pct}% — señal de presión sobre la RAM"})
                consejo = ("La RAM está bajo presión. Cierra aplicaciones innecesarias en segundo plano "
                           "o considera ampliar la memoria del equipo.")
            elif pct >= 20:
                score -= 5   # Uso bajo pero existente: penalización leve
                factores.append({"tipo": "warn",
                    "texto": f"Memoria de intercambio en uso moderado: {pct}%"})
                consejo = "El uso de swap es bajo pero existente. Es normal en sistemas con poca RAM instalada."
            else:
                # <20%: swap apenas utilizado, RAM en buen estado
                factores.append({"tipo": "ok",
                    "texto": f"Memoria de intercambio prácticamente sin uso: {pct}%"})
    except Exception:
        # psutil puede fallar en algunos entornos virtualizados donde swap no está disponible
        factores.append({"tipo": "ok",
            "texto": "No se pudo leer el estado de la memoria de intercambio"})

    return {"pct": max(0, min(100, score)), "factores": factores, "consejo": consejo}


def _disco_salud_global() -> dict:
    """
    Salud global del almacenamiento: score, factores y consejo del disco en peor estado.
    Usa Get-PhysicalDisk HealthStatus (1=Healthy, 3=Warning, 2=Unhealthy).
    """
    SCORE_MAP  = {1: 95, 2: 20, 3: 60}
    ESTADO_MAP = {1: 'Healthy', 2: 'Unhealthy', 3: 'Warning'}

    salida = _ps(
        "Get-PhysicalDisk | Select-Object FriendlyName,HealthStatus,MediaType "
        "| ConvertTo-Json -Compress"
    )

    factores = []
    consejo  = None

    if not salida:
        factores.append({"tipo": "ok",
            "texto": "Estado S.M.A.R.T. no disponible — PowerShell no devolvió datos de disco"})
        return {"pct": 85, "txt": "Sin datos", "factores": factores, "consejo": consejo}

    try:
        discos = json.loads(salida)
        if isinstance(discos, dict):
            discos = [discos]

        scores = []
        for d in discos:
            health_num = d.get('HealthStatus', 1)
            media_num  = d.get('MediaType', 0)
            nombre     = d.get('FriendlyName') or 'Disco desconocido'
            tipo_txt   = {3: 'HDD', 4: 'SSD'}.get(media_num, '')
            etiqueta   = f"{nombre} ({tipo_txt})" if tipo_txt else nombre
            score_d    = SCORE_MAP.get(health_num, 75)
            estado_txt = ESTADO_MAP.get(health_num, 'Desconocido')
            scores.append(score_d)

            if health_num == 1:
                factores.append({"tipo": "ok",
                    "texto": f"{etiqueta}: estado óptimo según S.M.A.R.T."})
            elif health_num == 3:
                factores.append({"tipo": "warn",
                    "texto": f"{etiqueta}: {estado_txt} — sectores reasignados o atributos S.M.A.R.T. degradados"})
                consejo = ("Haz una copia de seguridad de tus datos inmediatamente. "
                           "Usa CrystalDiskInfo (gratuito) para ver los atributos S.M.A.R.T. en detalle "
                           "y valora sustituir el disco si la situación empeora.")
            else:
                factores.append({"tipo": "danger",
                    "texto": f"{etiqueta}: {estado_txt} — fallos detectados, riesgo de pérdida de datos"})
                consejo = ("Este disco tiene fallos graves. Haz una copia de seguridad AHORA "
                           "y reemplázalo lo antes posible. No esperes más.")

        if not scores:
            factores.append({"tipo": "ok", "texto": "Sin discos físicos detectados"})
            return {"pct": 85, "txt": "Sin datos", "factores": factores, "consejo": None}

        min_score = min(scores)
        txt = 'Óptimo' if min_score >= 85 else 'Advertencia' if min_score >= 50 else 'Defectuoso'
        return {"pct": min_score, "txt": txt, "factores": factores, "consejo": consejo}

    except (json.JSONDecodeError, TypeError):
        factores.append({"tipo": "ok", "texto": "No se pudo parsear la respuesta de Get-PhysicalDisk"})
        return {"pct": 85, "txt": "Sin datos", "factores": factores, "consejo": None}


def _bateria_salud_wmi() -> dict:
    """
    Vida útil de la batería comparando capacidad actual vs diseño (via WMI).
    Devuelve dict con pct (int|None), factores y consejo.
    pct=None indica que los datos WMI no están disponibles en este sistema.
    """
    full_str = _ps(
        "(Get-WmiObject -Namespace 'root/WMI' -Class BatteryFullChargedCapacity "
        "| Select-Object -First 1 -ExpandProperty FullChargedCapacity)"
    )
    design_str = _ps(
        "(Get-WmiObject -Namespace 'root/WMI' -Class BatteryStaticData "
        "| Select-Object -First 1 -ExpandProperty DesignedCapacity)"
    )

    if not full_str or not design_str:
        return {
            "pct": None,
            "factores": [{"tipo": "ok",
                "texto": "Datos de desgaste no disponibles vía WMI en este sistema"}],
            "consejo": None,
        }

    try:
        full   = int(full_str)
        design = int(design_str)
        if design <= 0 or full <= 0:
            return {"pct": None, "factores": [], "consejo": None}

        pct     = max(0, min(100, round((full / design) * 100)))
        perdida = 100 - pct
        factores = []
        consejo  = None

        factores.append({"tipo": "ok" if pct >= 80 else "warn" if pct >= 50 else "danger",
            "texto": f"Capacidad actual: {pct}% respecto a la original de fábrica (has perdido un {perdida}%)"})

        if pct >= 80:
            factores.append({"tipo": "ok",
                "texto": "Batería en buen estado — degradación normal para su uso"})
        elif pct >= 50:
            factores.append({"tipo": "warn",
                "texto": "Degradación notable — la autonomía es significativamente menor que cuando era nueva"})
            consejo = ("La batería ha perdido capacidad. Evita cargarla al 100% constantemente "
                       "y no la dejes descargarse completamente. Mantenerla entre el 20% y el 80% "
                       "alarga su vida útil. Considera revisarla con el fabricante.")
        else:
            factores.append({"tipo": "danger",
                "texto": "Batería muy degradada — autonomía gravemente reducida"})
            consejo = ("La batería ha perdido más de la mitad de su capacidad original. "
                       "Se recomienda reemplazarla para recuperar la autonomía del equipo. "
                       "Contacta con el servicio técnico del fabricante.")

        return {"pct": pct, "factores": factores, "consejo": consejo}

    except (ValueError, ZeroDivisionError):
        return {"pct": None, "factores": [], "consejo": None}


# ── Función principal ────────────────────────────────────────────────────────

def run(muestreo: int = 3) -> dict:
    """
    Punto de entrada del módulo: recopila todas las métricas de hardware.

    Orden de ejecución:
      1. io_antes: snapshot de I/O de disco ANTES del bloqueo de CPU
      2. _recopilar_cpu(): bloquea 'muestreo' segundos midiendo CPU real
      3. io_despues: snapshot de I/O DESPUÉS del bloqueo → diferencia = actividad real
      4. _recopilar_ram(), _recopilar_disco(), _recopilar_bateria(), _recopilar_eventos()

    El bloqueo de cpu_percent sirve tanto para medir CPU como para dar tiempo de
    muestreo al disco sin añadir un sleep() adicional.

    Retorna el formato estándar de ESTICC:
      {"ok": True, "data": {...}, "meta": {"duracion_s": float, "timestamp": str}}
    """
    inicio = time.time()  # Marcar inicio para calcular duración total del escaneo

    # ── 1. Snapshot de disco ANTES del muestreo de CPU ───────────────────────
    try:
        io_antes = psutil.disk_io_counters()  # Contadores globales de I/O en este momento
    except Exception:
        io_antes = None  # disk_io_counters no disponible (algunos entornos virtualizados)

    t_io_antes = time.time()  # Timestamp preciso para calcular elapsed_s

    # ── 2. Medir CPU (bloquea 'muestreo' segundos) ───────────────────────────
    cpu = _recopilar_cpu(muestreo, io_antes)  # Bloqueo intencional durante muestreo segundos

    # ── 3. Snapshot de disco DESPUÉS del muestreo ────────────────────────────
    try:
        io_despues = psutil.disk_io_counters()  # Contadores después del intervalo de muestreo
    except Exception:
        io_despues = None

    elapsed_io = time.time() - t_io_antes  # Tiempo real transcurrido entre los dos snapshots

    # ── 4. Recopilar el resto de métricas (rápidas, sin bloqueo) ─────────────
    ram     = _recopilar_ram()
    disco   = _recopilar_disco(io_antes, io_despues, elapsed_io)
    bateria = _recopilar_bateria()
    eventos = _recopilar_eventos()

    # ── 5. Calcular scores de salud / vida útil ───────────────────────────────
    cpu_salud   = _cpu_salud(cpu['temperatura_c'], eventos)
    ram_salud   = _ram_salud()
    disco_salud = _disco_salud_global()
    bat_salud   = _bateria_salud_wmi() if bateria.get('presente') else {
        "pct": None, "factores": [], "consejo": None
    }

    duracion = round(time.time() - inicio, 2)

    return {
        "ok": True,
        "data": {
            "cpu":     cpu,
            "ram":     ram,
            "disco":   disco,
            "bateria": bateria,
            "eventos": eventos,
            "salud": {
                "cpu_pct":          cpu_salud["pct"],
                "cpu_factores":     cpu_salud["factores"],
                "cpu_consejo":      cpu_salud["consejo"],
                "ram_pct":          ram_salud["pct"],
                "ram_factores":     ram_salud["factores"],
                "ram_consejo":      ram_salud["consejo"],
                "disco_pct":        disco_salud["pct"],
                "disco_txt":        disco_salud["txt"],
                "disco_factores":   disco_salud["factores"],
                "disco_consejo":    disco_salud["consejo"],
                "bateria_pct":      bat_salud["pct"],
                "bateria_factores": bat_salud["factores"],
                "bateria_consejo":  bat_salud["consejo"],
            },
        },
        "meta": {
            "duracion_s": duracion,
            "timestamp":  datetime.datetime.now().isoformat(),
        },
    }
