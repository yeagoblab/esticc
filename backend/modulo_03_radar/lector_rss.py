"""
Lector de feeds RSS de ciberseguridad.
Fetch concurrente de 6 fuentes OSINT con estimación de severidad por keywords.
"""
import time        # Para medir la duración total del fetch
import re          # Expresiones regulares para limpiar el HTML de los resúmenes
import urllib.request  # HTTP sin dependencias externas (no necesita requests)
from concurrent.futures import ThreadPoolExecutor, as_completed  # Paralelismo por hilos
from datetime import datetime, timezone

import feedparser  # Librería que parsea feeds RSS y Atom; instalable con pip

# Lista de fuentes RSS de ciberseguridad que se consultarán en paralelo
FEEDS = [
    {"nombre": "NIST NVD",          "url": "https://nvd.nist.gov/feeds/xml/cve/misc/nvd-rss.xml"},
    # NIST NVD: base de datos oficial de vulnerabilidades del gobierno de EE.UU. (CVEs nuevos)
    {"nombre": "Bleeping Computer",  "url": "https://www.bleepingcomputer.com/feed/"},
    # Bleeping Computer: noticias de seguridad y malware muy seguidas por la industria
    {"nombre": "Krebs on Security",  "url": "https://krebsonsecurity.com/feed/"},
    # Krebs: blog del periodista de ciberseguridad Brian Krebs, muy respetado
    {"nombre": "SANS ISC",           "url": "https://isc.sans.edu/rssfeed_full.xml"},
    # SANS ISC: Centro de Tormentas de Internet, monitoriza amenazas en tiempo real
    {"nombre": "The Hacker News",    "url": "https://feeds.feedburner.com/TheHackersNews"},
    # The Hacker News: medio de divulgación de seguridad con millones de lectores
    {"nombre": "Reddit r/netsec",    "url": "https://www.reddit.com/r/netsec/.rss"},
    # Reddit r/netsec: comunidad de profesionales de seguridad que comparten investigaciones
]

# Palabras clave que indican amenaza CRÍTICA: explotación activa, zero-days, RCE
KEYWORDS_CRITICO = [
    'actively exploited',    # Explotación activa en la naturaleza
    'zero-day', '0-day',     # Vulnerabilidad desconocida sin parche
    'critical rce',          # Ejecución remota de código crítica
    'remote code execution', # Ejecución remota de código (cualquier severidad)
    'worm',                  # Gusano autopropagante
    'ransomware outbreak',   # Brote de ransomware en curso
    'emergency patch',       # Parche de emergencia (fuera del ciclo normal)
    'patch now',             # Urgencia máxima: parchear inmediatamente
    'exploit in the wild',   # Exploit circulando en el ecosistema de atacantes
]

# Palabras clave que indican amenaza ALTA: vulnerabilidades, ataques, malware conocido
KEYWORDS_ALTO = [
    'vulnerability',      # Vulnerabilidad genérica
    'cve-',               # Cualquier referencia a un CVE (Common Vulnerabilities and Exposures)
    'exploit',            # Herramienta de explotación
    'patch tuesday',      # Martes de parches de Microsoft (segundo martes de cada mes)
    'breach',             # Brecha de datos / incidente de seguridad
    'attack',             # Ataque activo
    'malware',            # Software malicioso genérico
    'backdoor',           # Puerta trasera en software o hardware
    'trojan',             # Troyano (software malicioso disfrazado de legítimo)
    'ransomware',         # Ransomware (aunque no sea un brote activo)
    'high severity',      # Severidad alta declarada por el proveedor
    'data leak',          # Filtración de datos
    'credential',         # Credenciales comprometidas
    'phishing campaign',  # Campaña de phishing activa
]

MAX_POR_FEED  = 10  # Máximo de noticias a extraer por feed (evita procesar cientos de artículos)
TIMEOUT_FETCH = 8   # Segundos máximos de espera por feed (feeds lentos no bloquean el resto)


def _estimar_severidad(titulo: str, resumen: str) -> str:
    """
    Estima la severidad de una noticia basándose en palabras clave en el título y resumen.
    Devuelve 'critico', 'alto' o 'info'.
    """
    texto = (titulo + ' ' + resumen).lower()  # Unir y poner en minúsculas para comparar sin distinción

    if any(k in texto for k in KEYWORDS_CRITICO):
        return 'critico'  # Una sola keyword crítica es suficiente para marcar como crítico

    if any(k in texto for k in KEYWORDS_ALTO):
        return 'alto'     # Una sola keyword alta es suficiente para marcar como alto

    return 'info'  # Sin keywords relevantes → noticia informativa sin urgencia inmediata


def _fecha_iso(entry) -> str:
    """Extrae y convierte la fecha de publicación de una entrada RSS a formato ISO 8601."""
    for campo in ('published_parsed', 'updated_parsed'):
        # feedparser parsea las fechas RSS a tuplas de tiempo (como time.struct_time)
        t = getattr(entry, campo, None)  # Intentar primero 'published', luego 'updated'
        if t:
            try:
                # Construir un datetime UTC a partir de la tupla (año, mes, día, hora, min, seg)
                return datetime(*t[:6], tzinfo=timezone.utc).isoformat()
            except Exception:
                pass  # Fecha malformada → ignorar y seguir intentando
    # Si no hay fecha válida, usar la hora actual como fallback
    return datetime.now(timezone.utc).isoformat()


def _fetch_feed(feed_info: dict) -> list[dict]:
    """
    Descarga y parsea un único feed RSS.
    Devuelve lista de noticias o lista vacía si hay error (no propaga excepciones).
    """
    try:
        # Construir la petición HTTP con un User-Agent personalizado
        # Algunos servidores bloquean user-agents genéricos de Python
        req = urllib.request.Request(
            feed_info['url'],
            headers={'User-Agent': 'ESTICC-OSINT-Radar/1.0'}  # Identificamos la aplicación
        )

        # Descargar el feed con timeout para no bloquear el thread pool
        with urllib.request.urlopen(req, timeout=TIMEOUT_FETCH) as resp:
            contenido = resp.read()  # Leer el XML/Atom completo en memoria (feeds son pequeños)

        # feedparser.parse() acepta bytes, strings, URLs o archivos
        # Es muy tolerante con feeds malformados (RSS no tiene un estándar estricto)
        parsed = feedparser.parse(contenido)

        items = []
        for entry in parsed.entries[:MAX_POR_FEED]:  # Limitar a las N noticias más recientes
            titulo  = getattr(entry, 'title',   '') or ''  # Título del artículo
            resumen = getattr(entry, 'summary', '') or ''  # Resumen/descripción del artículo

            # Limpiar el HTML del resumen: los feeds suelen incluir etiquetas HTML en el texto
            # re.sub(r'<[^>]+>', '', ...) elimina cualquier tag HTML con regex
            resumen_limpio = re.sub(r'<[^>]+>', '', resumen).strip()[:300]  # Limitar a 300 chars

            items.append({
                'fuente':    feed_info['nombre'],                          # Nombre del feed origen
                'titulo':    titulo.strip(),                               # Título limpio
                'resumen':   resumen_limpio,                               # Resumen sin HTML
                'enlace':    getattr(entry, 'link', ''),                   # URL del artículo completo
                'fecha':     _fecha_iso(entry),                            # Fecha ISO 8601 UTC
                'severidad': _estimar_severidad(titulo, resumen_limpio),   # Estimación: critico/alto/info
            })
        return items

    except Exception:
        return []  # Si el feed falla (timeout, 404, XML inválido...) devolver lista vacía


def run() -> dict:
    """
    Descarga todos los feeds RSS en paralelo y devuelve las noticias ordenadas por fecha.
    Usa ThreadPoolExecutor para hacer los 6 fetches simultáneamente (no secuencialmente).
    """
    t0     = time.perf_counter()
    todas  = []   # Acumulará todas las noticias de todos los feeds
    errores = []  # Registro de feeds que fallaron (para el campo meta)

    # ThreadPoolExecutor con max_workers=6: un hilo por feed → todos descargan a la vez
    # Sin esto, 6 feeds secuenciales × 8s timeout = hasta 48 segundos de espera
    # Con paralelismo: el tiempo total es el del feed más lento (~8 segundos máximo)
    with ThreadPoolExecutor(max_workers=6) as pool:
        # Enviar los 6 fetches al pool: cada future representa una descarga en progreso
        futuros = {pool.submit(_fetch_feed, f): f['nombre'] for f in FEEDS}

        # as_completed() devuelve futuros en el orden en que terminan (no en el de envío)
        for futuro in as_completed(futuros):
            nombre = futuros[futuro]  # Recuperar el nombre del feed para el log de errores
            try:
                items = futuro.result()  # Obtener el resultado de la descarga (puede lanzar excepción)
                todas.extend(items)      # Añadir las noticias de este feed a la lista global
            except Exception as e:
                errores.append(f"{nombre}: {e}")  # Registrar el error sin detener los demás feeds

    # Ordenar todas las noticias por fecha descendente: las más recientes primero
    todas.sort(key=lambda x: x['fecha'], reverse=True)

    duracion = int((time.perf_counter() - t0) * 1000)

    return {
        'ok':   True,
        'data': {
            'noticias': todas,  # Lista completa de noticias de todas las fuentes
            'resumen': {
                'critico': sum(1 for n in todas if n['severidad'] == 'critico'),  # Amenazas críticas
                'alto':    sum(1 for n in todas if n['severidad'] == 'alto'),     # Amenazas altas
                'info':    sum(1 for n in todas if n['severidad'] == 'info'),     # Informativas
                'total':   len(todas),                                            # Total de noticias
            },
        },
        'meta': {
            'timestamp':    datetime.now(timezone.utc).isoformat(),
            'duracion_ms':  duracion,
            'fuentes_ok':   len(FEEDS) - len(errores),  # Número de feeds descargados con éxito
            'fuentes_error': errores,                    # Lista de feeds que fallaron y por qué
        },
    }
