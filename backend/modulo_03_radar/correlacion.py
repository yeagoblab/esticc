"""
Motor de correlación de riesgos.
Cruza noticias OSINT con los hallazgos del escáner local.
Eleva a Alerta Crítica cuando hay coincidencia directa entre un puerto abierto y una amenaza publicada.
"""
from __future__ import annotations  # Permite anotaciones modernas (dict|None) en Python 3.8/3.9

import re    # Expresiones regulares para extraer puertos y CVEs del texto de noticias
import time  # Para medir la duración del proceso de correlación
from datetime import datetime, timezone

# Mapeo protocolo → lista de puertos estándar asociados
# Si una noticia menciona "SMB" sin número de puerto, se infieren los puertos 445 y 139
PROTOCOLO_PUERTOS: dict[str, list[int]] = {
    'smb':    [445, 139],    # Server Message Block: protocolo de compartición de archivos Windows
    'rdp':    [3389],        # Remote Desktop Protocol: acceso remoto gráfico a Windows
    'ssh':    [22],          # Secure Shell: acceso remoto por terminal a servidores Linux/Unix
    'ftp':    [21],          # File Transfer Protocol: transferencia de archivos (sin cifrar)
    'telnet': [23],          # Telnet: acceso remoto por terminal sin cifrado (obsoleto y peligroso)
    'http':   [80, 8080, 8000],  # Protocolo web sin cifrar
    'https':  [443, 8443],   # Protocolo web con cifrado TLS
    'dns':    [53],          # Domain Name System: resolución de nombres de dominio
    'vnc':    [5900, 5901],  # Virtual Network Computing: escritorio remoto multiplataforma
    'mysql':  [3306],        # Base de datos MySQL/MariaDB
    'mssql':  [1433],        # Microsoft SQL Server
    'redis':  [6379],        # Base de datos Redis (en memoria, a menudo mal configurada)
    'mongo':  [27017],       # MongoDB (base de datos NoSQL)
    'elastic':[9200, 9300],  # Elasticsearch (motor de búsqueda, frecuentemente expuesto sin auth)
}

# Regex para extraer puertos escritos como "port 445" o "ports 443"
RE_PUERTO   = re.compile(r'\bport[s]?\s+(\d{2,5})\b', re.IGNORECASE)
# \b: límite de palabra para no capturar "report 443"
# \d{2,5}: números de 2 a 5 dígitos (puertos válidos: 1-65535)

# Regex para extraer puertos escritos como ":445" solo cuando el contexto indica
# que es realmente un puerto: precedido por una IP, hostname, o la palabra "port".
# Versión anterior r':(\d{2,5})\b' era demasiado amplia y capturaba horas (10:30),
# datos estadísticos (2024:18000) y versiones de software.
RE_DOS_PTOS = re.compile(
    r'(?:'
    r'\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}'  # IPv4 literal: 192.168.1.1:445
    r'|localhost'                             # localhost:8080
    r'|0\.0\.0\.0'                            # 0.0.0.0:4444
    r'|(?:tcp|udp)(?:/ip)?'                   # tcp:445, udp/ip:53
    r'):(\d{2,5})\b'
)

# Regex para extraer identificadores CVE (Common Vulnerabilities and Exposures)
RE_CVE = re.compile(r'CVE-\d{4}-\d{4,}', re.IGNORECASE)
# Formato oficial CVE: CVE-AÑO-NÚMERO (ej: CVE-2017-0144 para EternalBlue)


def _extraer_puertos_noticia(texto: str) -> set[int]:
    """
    Extrae todos los números de puerto mencionados en el texto de una noticia.
    Usa tres técnicas: regex "port N", regex ":N", y mapeo protocolo→puerto.
    """
    puertos: set[int] = set()  # Set para evitar duplicados automáticamente

    # Técnica 1: buscar "port 443" o "ports 80, 8080" con regex
    for m in RE_PUERTO.finditer(texto):
        try:
            puertos.add(int(m.group(1)))  # m.group(1) es el número capturado
        except ValueError:
            pass  # Por si acaso int() falla (no debería con \d+)

    # Técnica 2: buscar ":443" típico en URLs y referencias a servicios
    for m in RE_DOS_PTOS.finditer(texto):
        try:
            p = int(m.group(1))
            if 1 <= p <= 65535:   # Validar que es un puerto TCP/UDP real
                puertos.add(p)
        except ValueError:
            pass

    # Técnica 3: si la noticia menciona un protocolo por nombre, añadir sus puertos estándar
    # Ej: si menciona "SMB" → añadir 445 y 139 aunque no cite el número de puerto
    texto_lower = texto.lower()  # Una sola conversión a minúsculas para eficiencia
    for proto, ports in PROTOCOLO_PUERTOS.items():
        if proto in texto_lower:     # Búsqueda de substring simple (rápido)
            puertos.update(ports)    # Añadir todos los puertos del protocolo al set

    return puertos


def _extraer_cves_noticia(texto: str) -> list[str]:
    """Extrae todos los CVE IDs mencionados en el texto, normalizados a mayúsculas y sin duplicados."""
    # Set comprehension para deduplicar → convertir a lista al final
    return list({m.upper() for m in RE_CVE.findall(texto)})
    # m.upper(): normalizar a "CVE-2017-0144" aunque en la noticia aparezca "cve-2017-0144"


def _puertos_locales_abiertos(puertos_scan: list[dict]) -> set[int]:
    """
    Extrae los números de puerto de la salida del escáner de puertos local.
    Convierte la lista de conexiones [{local: "0.0.0.0:445", ...}] en un set de enteros {445}.
    """
    abiertos: set[int] = set()

    for conn in puertos_scan:
        local = conn.get('local', '')  # Campo "local" del escáner: "ip:puerto"
        if ':' in local:               # Solo procesar si tiene el formato esperado
            try:
                # Extraer el puerto del final del string "0.0.0.0:445" → 445
                abiertos.add(int(local.split(':')[-1]))
            except ValueError:
                pass  # Ignorar si el puerto no es un número válido

    return abiertos


def _correlacionar_noticia(
    noticia: dict,
    puertos_locales: set[int],
) -> dict | None:
    """
    Compara una noticia con el estado local del sistema.
    Devuelve una alerta si hay coincidencia, None si no hay riesgo relevante.
    """
    # Unir título y resumen en un solo texto para analizar con las dos regex
    texto = f"{noticia.get('titulo', '')} {noticia.get('resumen', '')}"

    puertos_noticia = _extraer_puertos_noticia(texto)  # Puertos mencionados en la noticia
    cves_noticia    = _extraer_cves_noticia(texto)     # CVEs referenciados en la noticia

    # Intersección de conjuntos: puertos que están TANTO en la noticia COMO abiertos localmente
    coincidencias_puerto = puertos_locales & puertos_noticia

    if coincidencias_puerto:
        # ALERTA CRÍTICA: la noticia describe ataques a puertos que tenemos abiertos
        puertos_str = ', '.join(f':{p}' for p in sorted(coincidencias_puerto))  # Ej: ":445, :3389"
        return {
            'nivel':        'critico',          # Nivel de riesgo más alto
            'tipo':         'puerto',           # El disparador fue una coincidencia de puerto
            'coincidencia': puertos_str,        # Qué puertos coincidieron
            'explicacion': (
                f"La noticia menciona ataques a los puertos {puertos_str} "
                f"y tu sistema tiene {'ese puerto' if len(coincidencias_puerto)==1 else 'esos puertos'} "
                f"abierto{'s' if len(coincidencias_puerto)>1 else ''}. "
                f"Revisa si el servicio es necesario y aplica el parche si existe."
            ),
            'noticia': {
                'titulo': noticia.get('titulo', ''),  # Referencia a la noticia que generó la alerta
                'fuente': noticia.get('fuente', ''),  # Fuente RSS de la que proviene
                'enlace': noticia.get('enlace', ''),  # URL para leer el artículo completo
                'fecha':  noticia.get('fecha',  ''),  # Cuándo se publicó la noticia
            },
            'cves': cves_noticia,  # Lista de CVEs mencionados en la noticia (puede estar vacía)
        }

    # ALERTA ALTA: noticia con CVEs críticos/altos aunque no haya coincidencia de puerto directa
    # Condición: tiene CVEs Y la noticia ya estaba clasificada como crítica o alta por keywords
    if cves_noticia and noticia.get('severidad') in ('critico', 'alto'):
        return {
            'nivel':        'alto',
            'tipo':         'cve',                            # El disparador fue un CVE publicado
            'coincidencia': ', '.join(cves_noticia[:3]),      # Mostrar máximo 3 CVEs en el resumen
            'explicacion': (
                f"Se han publicado {'vulnerabilidades' if len(cves_noticia)>1 else 'una vulnerabilidad'} "
                f"({', '.join(cves_noticia[:3])}) que pueden afectar a sistemas Windows. "
                f"Ejecuta el escáner de parches para verificar si tu sistema está al día."
            ),
            'noticia': {
                'titulo': noticia.get('titulo', ''),
                'fuente': noticia.get('fuente', ''),
                'enlace': noticia.get('enlace', ''),
                'fecha':  noticia.get('fecha',  ''),
            },
            'cves': cves_noticia,
        }

    return None  # Sin coincidencias relevantes: esta noticia no genera alerta


def run(context: dict) -> dict:
    """
    Punto de entrada del motor de correlación.
    Recibe el contexto completo del sistema y devuelve la lista de alertas.

    context = {
        "noticias": [...],  # Salida de lector_rss.run() → lista de noticias RSS
        "puertos":  [...],  # Salida de escaner_puertos.run() → puede ser [] si no se ha escaneado
        "procesos": [...],  # Reservado para correlación futura de procesos con amenazas
    }
    """
    t0 = time.perf_counter()
    try:
        noticias        = context.get('noticias', [])   # Lista de noticias del radar
        puertos_locales = _puertos_locales_abiertos(context.get('puertos', []))
        # Convertir la lista de conexiones en un set de puertos enteros para la intersección

        alertas: list[dict] = []    # Acumulará las alertas generadas
        ids_vistos: set[str] = set()  # Para deduplicar: evitar dos alertas del mismo artículo

        for noticia in noticias:
            alerta = _correlacionar_noticia(noticia, puertos_locales)  # Analizar esta noticia

            if alerta:
                # Usar los primeros 80 caracteres del título como clave de deduplicación
                key = noticia.get('titulo', '')[:80]
                if key not in ids_vistos:     # Solo añadir si no hemos procesado ya este titular
                    ids_vistos.add(key)
                    alertas.append(alerta)

        # Ordenar alertas: las críticas primero (nivel 0), las altas después (nivel 1)
        alertas.sort(key=lambda a: 0 if a['nivel'] == 'critico' else 1)

        duracion = int((time.perf_counter() - t0) * 1000)

        return {
            'ok':   True,
            'data': {
                'alertas': alertas,  # Lista de alertas generadas, ordenadas por criticidad
                'resumen': {
                    'critico': sum(1 for a in alertas if a['nivel'] == 'critico'),  # Nº de alertas críticas
                    'alto':    sum(1 for a in alertas if a['nivel'] == 'alto'),     # Nº de alertas altas
                    'total':   len(alertas),                                        # Total de alertas
                },
            },
            'meta': {
                'timestamp':           datetime.now(timezone.utc).isoformat(),
                'duracion_ms':         duracion,
                'noticias_analizadas': len(noticias),         # Cuántas noticias se analizaron
                'puertos_locales':     sorted(puertos_locales), # Lista de puertos abiertos analizados
            },
        }
    except Exception as e:
        return {
            'ok':    False,
            'error': str(e),
            'meta':  {'timestamp': datetime.now(timezone.utc).isoformat()},
        }
