# Arquitectura — modulo_03_radar

## Responsabilidad
Inteligencia externa: lee feeds RSS de ciberseguridad y correlaciona
las noticias con los hallazgos del escáner local.

## Scripts
| Archivo | Función | Librería |
|---|---|---|
| `lector_rss.py` | Fetch concurrente de 6 feeds RSS, filtrado por keywords, estimación de severidad | `feedparser`, `concurrent.futures` |
| `correlacion.py` | Cruza noticias con puertos abiertos y procesos locales, genera alertas | `re` |

## Acciones IPC
| Acción | Input | Output |
|---|---|---|
| `radar_fetch` | — | `{ok, data: {noticias: [...], meta: {...}}}` |
| `radar_correlate` | `context: {noticias, puertos, procesos}` | `{ok, data: {alertas: [...]}}` |

## Fuentes RSS
- NIST NVD (CVEs nuevos)
- Bleeping Computer
- Krebs on Security
- SANS Internet Storm Center
- The Hacker News
- Reddit r/netsec
