"""
Motor de correlación de riesgos.
Cruza noticias OSINT con los hallazgos del escáner local.
Eleva a Alerta Crítica cuando hay coincidencia directa.
"""
import re
import time
from datetime import datetime, timezone

# ── Mapeo protocolo → puertos ─────────────────────────────────────────────────

PROTOCOLO_PUERTOS: dict[str, list[int]] = {
    'smb':    [445, 139],
    'rdp':    [3389],
    'ssh':    [22],
    'ftp':    [21],
    'telnet': [23],
    'http':   [80, 8080, 8000],
    'https':  [443, 8443],
    'dns':    [53],
    'vnc':    [5900, 5901],
    'mysql':  [3306],
    'mssql':  [1433],
    'redis':  [6379],
    'mongo':  [27017],
    'elastic':[9200, 9300],
}

RE_PUERTO   = re.compile(r'\bport[s]?\s+(\d{2,5})\b', re.IGNORECASE)
RE_DOS_PTOS = re.compile(r':(\d{2,5})\b')
RE_CVE      = re.compile(r'CVE-\d{4}-\d{4,}', re.IGNORECASE)


def _extraer_puertos_noticia(texto: str) -> set[int]:
    """Extrae números de puerto mencionados en texto de una noticia."""
    puertos: set[int] = set()

    for m in RE_PUERTO.finditer(texto):
        try:
            puertos.add(int(m.group(1)))
        except ValueError:
            pass

    for m in RE_DOS_PTOS.finditer(texto):
        try:
            p = int(m.group(1))
            if 1 <= p <= 65535:
                puertos.add(p)
        except ValueError:
            pass

    texto_lower = texto.lower()
    for proto, ports in PROTOCOLO_PUERTOS.items():
        if proto in texto_lower:
            puertos.update(ports)

    return puertos


def _extraer_cves_noticia(texto: str) -> list[str]:
    return list({m.upper() for m in RE_CVE.findall(texto)})


def _puertos_locales_abiertos(puertos_scan: list[dict]) -> set[int]:
    abiertos: set[int] = set()
    for conn in puertos_scan:
        local = conn.get('local', '')
        if ':' in local:
            try:
                abiertos.add(int(local.split(':')[-1]))
            except ValueError:
                pass
    return abiertos


def _correlacionar_noticia(
    noticia: dict,
    puertos_locales: set[int],
) -> dict | None:
    """Devuelve una alerta si la noticia coincide con el estado local, o None."""
    texto = f"{noticia.get('titulo', '')} {noticia.get('resumen', '')}"

    puertos_noticia = _extraer_puertos_noticia(texto)
    cves_noticia    = _extraer_cves_noticia(texto)

    coincidencias_puerto = puertos_locales & puertos_noticia

    if coincidencias_puerto:
        puertos_str = ', '.join(f':{p}' for p in sorted(coincidencias_puerto))
        return {
            'nivel':      'critico',
            'tipo':       'puerto',
            'coincidencia': puertos_str,
            'explicacion': (
                f"La noticia menciona ataques a los puertos {puertos_str} "
                f"y tu sistema tiene {'ese puerto' if len(coincidencias_puerto)==1 else 'esos puertos'} "
                f"abierto{'s' if len(coincidencias_puerto)>1 else ''}. "
                f"Revisa si el servicio es necesario y aplica el parche si existe."
            ),
            'noticia': {
                'titulo':  noticia.get('titulo', ''),
                'fuente':  noticia.get('fuente', ''),
                'enlace':  noticia.get('enlace', ''),
                'fecha':   noticia.get('fecha', ''),
            },
            'cves': cves_noticia,
        }

    if cves_noticia and noticia.get('severidad') in ('critico', 'alto'):
        return {
            'nivel':      'alto',
            'tipo':       'cve',
            'coincidencia': ', '.join(cves_noticia[:3]),
            'explicacion': (
                f"Se han publicado {'vulnerabilidades' if len(cves_noticia)>1 else 'una vulnerabilidad'} "
                f"({', '.join(cves_noticia[:3])}) que pueden afectar a sistemas Windows. "
                f"Ejecuta el escáner de parches para verificar si tu sistema está al día."
            ),
            'noticia': {
                'titulo':  noticia.get('titulo', ''),
                'fuente':  noticia.get('fuente', ''),
                'enlace':  noticia.get('enlace', ''),
                'fecha':   noticia.get('fecha', ''),
            },
            'cves': cves_noticia,
        }

    return None


def run(context: dict) -> dict:
    """
    context = {
        "noticias": [...],   # salida de lector_rss
        "puertos":  [...],   # salida de escaner_puertos (puede ser [])
        "procesos": [...],   # reservado para correlación futura
    }
    """
    t0 = time.perf_counter()
    try:
        noticias = context.get('noticias', [])
        puertos_locales = _puertos_locales_abiertos(context.get('puertos', []))

        alertas = []
        ids_vistos: set[str] = set()

        for noticia in noticias:
            alerta = _correlacionar_noticia(noticia, puertos_locales)
            if alerta:
                # Deduplicar por título de noticia
                key = noticia.get('titulo', '')[:80]
                if key not in ids_vistos:
                    ids_vistos.add(key)
                    alertas.append(alerta)

        # Ordenar: crítico primero
        alertas.sort(key=lambda a: 0 if a['nivel'] == 'critico' else 1)

        duracion = int((time.perf_counter() - t0) * 1000)
        return {
            'ok': True,
            'data': {
                'alertas': alertas,
                'resumen': {
                    'critico': sum(1 for a in alertas if a['nivel'] == 'critico'),
                    'alto':    sum(1 for a in alertas if a['nivel'] == 'alto'),
                    'total':   len(alertas),
                },
            },
            'meta': {
                'timestamp':        datetime.now(timezone.utc).isoformat(),
                'duracion_ms':      duracion,
                'noticias_analizadas': len(noticias),
                'puertos_locales':  sorted(puertos_locales),
            },
        }
    except Exception as e:
        return {
            'ok': False,
            'error': str(e),
            'meta': {'timestamp': datetime.now(timezone.utc).isoformat()},
        }
