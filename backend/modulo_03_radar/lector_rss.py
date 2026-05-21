"""
Lector de feeds RSS de ciberseguridad.
Fetch concurrente de 6 fuentes OSINT con estimación de severidad por keywords.
"""
import time
import re
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

import feedparser

FEEDS = [
    {"nombre": "NIST NVD",          "url": "https://nvd.nist.gov/feeds/xml/cve/misc/nvd-rss.xml"},
    {"nombre": "Bleeping Computer",  "url": "https://www.bleepingcomputer.com/feed/"},
    {"nombre": "Krebs on Security",  "url": "https://krebsonsecurity.com/feed/"},
    {"nombre": "SANS ISC",           "url": "https://isc.sans.edu/rssfeed_full.xml"},
    {"nombre": "The Hacker News",    "url": "https://feeds.feedburner.com/TheHackersNews"},
    {"nombre": "Reddit r/netsec",    "url": "https://www.reddit.com/r/netsec/.rss"},
]

KEYWORDS_CRITICO = [
    'actively exploited', 'zero-day', '0-day', 'critical rce',
    'remote code execution', 'worm', 'ransomware outbreak',
    'emergency patch', 'patch now', 'exploit in the wild',
]

KEYWORDS_ALTO = [
    'vulnerability', 'cve-', 'exploit', 'patch tuesday', 'breach',
    'attack', 'malware', 'backdoor', 'trojan', 'ransomware',
    'high severity', 'data leak', 'credential', 'phishing campaign',
]

MAX_POR_FEED   = 10
TIMEOUT_FETCH  = 8


def _estimar_severidad(titulo: str, resumen: str) -> str:
    texto = (titulo + ' ' + resumen).lower()
    if any(k in texto for k in KEYWORDS_CRITICO):
        return 'critico'
    if any(k in texto for k in KEYWORDS_ALTO):
        return 'alto'
    return 'info'


def _fecha_iso(entry) -> str:
    for campo in ('published_parsed', 'updated_parsed'):
        t = getattr(entry, campo, None)
        if t:
            try:
                return datetime(*t[:6], tzinfo=timezone.utc).isoformat()
            except Exception:
                pass
    return datetime.now(timezone.utc).isoformat()


def _fetch_feed(feed_info: dict) -> list[dict]:
    try:
        req = urllib.request.Request(
            feed_info['url'],
            headers={'User-Agent': 'ESTICC-OSINT-Radar/1.0'}
        )
        with urllib.request.urlopen(req, timeout=TIMEOUT_FETCH) as resp:
            contenido = resp.read()
        parsed = feedparser.parse(contenido)
        items = []
        for entry in parsed.entries[:MAX_POR_FEED]:
            titulo  = getattr(entry, 'title',   '') or ''
            resumen = getattr(entry, 'summary', '') or ''
            # Limpiar HTML básico del resumen
            resumen_limpio = re.sub(r'<[^>]+>', '', resumen).strip()[:300]
            items.append({
                'fuente':    feed_info['nombre'],
                'titulo':    titulo.strip(),
                'resumen':   resumen_limpio,
                'enlace':    getattr(entry, 'link', ''),
                'fecha':     _fecha_iso(entry),
                'severidad': _estimar_severidad(titulo, resumen_limpio),
            })
        return items
    except Exception:
        return []


def run() -> dict:
    t0 = time.perf_counter()
    todas = []
    errores = []

    with ThreadPoolExecutor(max_workers=6) as pool:
        futuros = {pool.submit(_fetch_feed, f): f['nombre'] for f in FEEDS}
        for futuro in as_completed(futuros):
            nombre = futuros[futuro]
            try:
                items = futuro.result()
                todas.extend(items)
            except Exception as e:
                errores.append(f"{nombre}: {e}")

    # Ordenar por fecha descendente
    todas.sort(key=lambda x: x['fecha'], reverse=True)

    duracion = int((time.perf_counter() - t0) * 1000)
    return {
        'ok': True,
        'data': {
            'noticias': todas,
            'resumen': {
                'critico': sum(1 for n in todas if n['severidad'] == 'critico'),
                'alto':    sum(1 for n in todas if n['severidad'] == 'alto'),
                'info':    sum(1 for n in todas if n['severidad'] == 'info'),
                'total':   len(todas),
            },
        },
        'meta': {
            'timestamp':  datetime.now(timezone.utc).isoformat(),
            'duracion_ms': duracion,
            'fuentes_ok': len(FEEDS) - len(errores),
            'fuentes_error': errores,
        },
    }
