# ESTICC — Panel de Seguridad Local

[![Release](https://img.shields.io/github/v/release/yeagoblab/esticc?style=flat-square&logo=github&color=1f6feb)](https://github.com/yeagoblab/esticc/releases/latest)
[![Windows](https://img.shields.io/badge/Windows-10%2F11-0078D4?style=flat-square&logo=windows)](https://github.com/yeagoblab/esticc/releases/latest)
[![Licencia](https://img.shields.io/badge/licencia-MIT-3fb950?style=flat-square)](License)

**ESTICC** (Entorno de Seguridad TIC) es un panel de seguridad educativo de código abierto para Windows. Combina auditoría local del sistema, inteligencia OSINT en tiempo real, simulación de amenazas y enciclopedia de malware en una sola interfaz de escritorio.

Pensado para estudiantes, PYMEs y usuarios individuales que quieran entender el estado de seguridad de su equipo sin necesidad de conocimientos técnicos previos.

![Panel de Defensas de ESTICC](docs/screenshot.png)

---

## Características

### 🛡️ Auditoría Local
Escanea el sistema Windows en tiempo real con detección de atascos: si un escáner no responde en su tiempo límite (WMI bloqueado, WUA lento, etc.) la UI lo indica inmediatamente con un mensaje descriptivo en lugar de quedarse colgada.
- **Defensas** — estado de Firewall, Windows Defender y BitLocker
- **Puertos** — conexiones TCP activas y sockets en escucha, con alertas de puertos sospechosos
- **Procesos** — procesos activos con alertas de CPU/RAM elevada y ejecutables sin ruta en disco
- **Autoinicio** — entradas de registro (Run/RunOnce) y tareas programadas
- **Parches** — actualizaciones pendientes de Windows Update

### 💻 Monitor de Hardware
Panel en tiempo real con métricas del sistema y detección de eventos críticos:
- **CPU** — uso en %, modelo, núcleos físicos/lógicos, frecuencia y temperatura (modo avanzado)
- **RAM** — uso en %, total, disponible y velocidad de los módulos (modo avanzado)
- **Almacenamiento** — uso por partición con barras de color, velocidades de lectura/escritura y tipo de disco (HDD/SSD)
- **Batería** — porcentaje, estado de carga y tiempo estimado restante (oculto en equipos de sobremesa sin batería)
- **Event Log de hardware** — últimos eventos críticos del Visor de eventos de Windows (reinicios inesperados, errores de disco, etc.)
- Gráficas de historial de CPU y RAM con las últimas 30 muestras
- Tabla de especificaciones del sistema (visible solo en modo avanzado)

### 📡 Radar OSINT
Monitoriza 6 fuentes de inteligencia de ciberseguridad en tiempo real y correlaciona las amenazas publicadas con el estado del sistema local:
- NIST NVD · Bleeping Computer · Krebs on Security
- SANS Internet Storm Center · The Hacker News · Reddit r/netsec
- Alerta cuando un puerto abierto coincide con una amenaza publicada
- Extracción automática de CVEs y correlación de protocolos

### 🎓 Simulador de Amenazas
Modo demostración educativo con **8 escenarios de ataque** con datos ficticios completos (5 escáneres cada uno).
Cada escenario incluye una tarjeta educativa con explicación, pasos de respuesta y un botón de acceso directo a la entrada correspondiente de la Enciclopedia:

| # | Escenario | Amenaza |
|---|---|---|
| 1 | Puerto 4444 abierto | Troyano de Acceso Remoto (RAT) |
| 2 | svchost32.exe al 99% CPU | Cryptojacker disfrazado |
| 3 | Sistema abandonado (14 parches) | Exposición general |
| 4 | Exfiltración SMTP puertos 25/587 | Keylogger (Agent Tesla) |
| 5 | xmrig.exe al 95% + pool stratum | Cryptojacker (XMRig) |
| 6 | Cifrado activo + vssadmin + Defender caído | Ransomware en curso |
| 7 | 4 conexiones SMB + MS17-010 sin parchear | Gusano de Red (EternalBlue) |
| 8 | Beacon C2 powershell + dropper .vbs | Botnet zombie (Emotet) |

### 📋 Informe de Seguridad
Ejecuta los 5 escáneres de auditoría en una sola operación, calcula una puntuación de riesgo global (0–100) y genera un informe HTML completo exportable a PDF:
- Nivel de riesgo: **Bajo / Medio / Alto / Crítico**
- Hallazgos individuales con nivel de severidad y categoría
- Resumen por módulo con métricas clave
- Recomendaciones de remediación personalizadas según los hallazgos detectados
- Exportación a PDF limpia (sin barra lateral ni elementos de la UI) mediante `window.print()`

### 📅 Historial de Análisis
Calendario interactivo que combina los datos de **Windows Defender** con los escaneos propios de ESTICC:
- Vista mensual con navegación de mes en mes
- Puntos de colores por tipo de evento: azul (ESTICC), verde (Defender OK), rojo (amenaza detectada)
- Clic en cualquier día para ver la timeline detallada de eventos con hora y fuente
- Tarjetas de estado: último análisis rápido y completo de Defender, protección en tiempo real, amenazas recientes
- Historial persistido en `%APPDATA%\ESTICC\historial.json` (últimas 100 entradas)
- Los informes completos se registran automáticamente en el historial al generarse

### 📖 Enciclopedia de Malware
Base de conocimiento con 10 categorías de amenazas, búsqueda en tiempo real y ficha técnica completa con:
- Técnicas MITRE ATT&CK
- Indicadores de Compromiso (IOCs)
- CVEs asociados
- Vectores de ataque, síntomas y medidas de prevención

### ⚙️ Configuración y Perfiles de Usuario
Panel de ajustes persistidos en `localStorage` con efecto inmediato sin recargar:
- **Perfil de usuario** — 5 perfiles con comportamientos diferenciados:
  - *Estudiante* — modo básico por defecto, orientado al aprendizaje
  - *Persona Mayor* — tipografía aumentada y lenguaje simplificado
  - *Pequeña PYME* — contexto empresarial con recomendaciones de seguridad
  - *Mediana PYME* — activa el modo avanzado automáticamente
  - *Administrador* — modo avanzado completo con todos los datos técnicos
- **Tema visual** — oscuro (por defecto) o claro
- **Idioma** — Español / English (i18n completo de la interfaz)
- **Escáner en segundo plano** — recordatorio configurable si no se analiza en N días
- **Auto-análisis al iniciar** — ejecuta los 5 escáneres automáticamente al abrir la app
- **Tiempo de muestreo** — rápido (2s) / balanceado (3s) / preciso (5s)

### 🔄 Modo Básico / Avanzado
Toggle global que cambia la presentación de todos los paneles:
- **Básico** — escudos visuales con estado OK/WARN/DANGER, filas alternas en listas, orientado a usuarios sin conocimientos técnicos
- **Avanzado** — tablas de datos completos, CVEs, IOCs, PID de procesos y detalles técnicos

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Shell de escritorio | [Tauri 1.x](https://tauri.app/) (Rust) |
| Backend / sidecar | Python 3.8+ |
| Frontend | HTML · CSS · JavaScript vanilla |
| IPC | stdin/stdout JSON newline-delimited |
| Feeds OSINT | `feedparser` + `concurrent.futures` |
| Escaneo local | `psutil` + WMI / PowerShell |

---

## Instalación para usuarios

> **Forma recomendada** — no requiere Python, Rust ni ningún conocimiento técnico.

### 1. Descargar el instalador

**[⬇ Descargar ESTICC_Installer.exe](https://github.com/yeagoblab/esticc/releases/latest/download/ESTICC_Installer.exe)**

También puedes ir a la [página de Releases](https://github.com/yeagoblab/esticc/releases/latest) para ver todas las descargas disponibles.

### 2. Ejecutar el instalador

Haz doble clic en `ESTICC_Installer.exe`. El instalador:

1. Comprueba automáticamente los requisitos del sistema (Windows 10+, RAM, disco, Internet).
2. Descarga la última versión de ESTICC desde GitHub.
3. Instala los archivos en `%LOCALAPPDATA%\ESTICC\` (sin permisos de administrador).
4. Crea accesos directos en el Escritorio y en el Menú de Inicio.

Si algo falla, aparecerá un mensaje de error con instrucciones claras sobre cómo resolverlo.

### Versión portable (opcional)

Si prefieres no usar el instalador, descarga **`ESTICC_portable_win64.zip`** desde la misma página de Releases, descomprímelo en cualquier carpeta y ejecuta `ESTICC.exe`.

> **Requisito:** [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) instalado en el sistema (incluido por defecto en Windows 11 y en Windows 10 con Edge actualizado).

---

## Requisitos previos (solo para desarrolladores)

- **Windows 10/11** (64-bit)
- **Python 3.8+** — [python.org](https://www.python.org/downloads/) *(marcar "Add Python to PATH")*
- **Rust + Cargo** — [rustup.rs](https://rustup.rs/) *(Tauri CLI se instala automáticamente)*
- **Node.js** no requerido

---

## Instalación en modo desarrollo

```bat
:: 1. Clonar el repositorio
git clone https://github.com/yeagoblab/esticc.git
cd esticc

:: 2. Configurar entorno (una sola vez)
setup.bat

:: 3. Iniciar la aplicación
run.bat
```

`setup.bat` verifica las dependencias, crea un entorno virtual Python aislado e instala Tauri CLI si es necesario.

> La primera compilación de Rust puede tardar varios minutos. Las siguientes serán mucho más rápidas.

---

## Estructura del proyecto

```
esticc/
├── setup.bat                          # Configura entorno virtual + Tauri CLI (una sola vez)
├── run.bat                            # Inicia la aplicación en modo desarrollo
├── scripts/
│   └── package_release.ps1            # Empaqueta ESTICC_portable_win64.zip para release
├── installer/
│   ├── esticc_installer.py            # Instalador gráfico (tkinter + stdlib; sin deps externas)
│   └── build_installer.ps1            # Compila esticc_installer.py con PyInstaller
├── backend/
│   ├── main.py                        # Router IPC (stdin/stdout JSON newline-delimited)
│   ├── requirements.txt               # psutil, feedparser
│   ├── modulo_02_auditoria/
│   │   ├── escaner_puertos.py         # Conexiones TCP activas (psutil.net_connections)
│   │   ├── escaner_procesos.py        # Procesos activos con métricas de CPU/RAM
│   │   ├── analisis_autoinicio.py     # Registro Run/RunOnce + tareas programadas
│   │   ├── estado_defensas.py         # Firewall, Windows Defender y BitLocker (CIM/WMI)
│   │   └── verificador_parches.py     # Actualizaciones pendientes de Windows Update (WUA)
│   ├── modulo_03_radar/
│   │   ├── lector_rss.py              # Fetch concurrente de 6 feeds RSS de ciberseguridad
│   │   └── correlacion.py             # Cruza noticias con puertos abiertos y CVEs locales
│   ├── modulo_04_reportes/
│   │   └── generador.py               # Ejecuta los 5 escáneres + puntuación de riesgo 0-100
│   ├── modulo_05_historial/
│   │   ├── historial_defender.py      # Consulta el log de eventos de Windows Defender
│   │   └── historial_esticc.py        # Persiste el historial propio en %APPDATA%\ESTICC\
│   └── modulo_06_hardware/
│       └── escaner_hardware.py        # CPU, RAM, disco, batería y Event Log de hardware
├── frontend/
│   ├── index.html                     # SPA única; incluye todos los paneles y el CSS base
│   ├── css/
│   │   ├── simulador.css              # Paneles del simulador de amenazas
│   │   ├── enciclopedia.css           # Grid de tarjetas + modal de amenaza
│   │   ├── radar.css                  # Contadores OSINT + tabla de noticias
│   │   ├── reportes.css               # Informe de seguridad + @media print (PDF limpio)
│   │   ├── historial.css              # Calendario mensual + timeline de eventos
│   │   ├── config.css                 # Panel de configuración + variables de tema claro
│   │   └── hardware.css               # Grid de tarjetas de hardware + gauges SVG
│   └── js/
│       ├── i18n.js                    # Diccionarios ES/EN + función t() global
│       ├── config.js                  # Carga/guarda config en localStorage; aplica tema, rol e idioma
│       ├── background.js              # Escáner en segundo plano + banner de recordatorio
│       ├── auditoria.js               # Renderers de los 5 módulos + sistema de toasts + withTimeout
│       ├── simulador.js               # 8 escenarios de demo + interceptor de invoke()
│       ├── enciclopedia.js            # Base de datos de malware + buscador + modal de detalle
│       ├── radar.js                   # Fetch OSINT + renderizado en vista básica/avanzada
│       ├── reportes.js                # Generación del informe HTML exportable a PDF
│       ├── historial.js               # Calendario interactivo + window.HISTORIAL.registrar()
│       └── hardware.js                # Monitor de CPU/RAM/disco/batería + Event Log
└── src-tauri/
    ├── src/main.rs                    # Sidecar spawn (CREATE_NO_WINDOW) + IPC Rust↔Python
    ├── Cargo.toml                     # Versión del paquete (debe coincidir con tauri.conf.json)
    └── tauri.conf.json                # Config de Tauri: versión, bundle, CSP, allowlist
```

---

## Protocolo IPC

El sidecar Python se comunica con Rust mediante JSON newline-delimited por stdin/stdout:

```jsonc
// Solicitud (Rust → Python)
{ "id": "42", "action": "scan_ports" }
{ "id": "43", "action": "radar_correlate", "context": { "noticias": [...], "puertos": [...] } }

// Respuesta (Python → Rust)
{ "id": "42", "result": { "ok": true, "data": [...] } }
{ "id": "43", "error": "descripción del error" }
```

Acciones disponibles:

| Acción | Módulo | Timeout UI | Descripción |
|---|---|---|---|
| `scan_defenses` | auditoria | 35s | Firewall, Defender y BitLocker (CIM/WMI) |
| `scan_ports` | auditoria | 20s | Conexiones TCP activas (psutil) |
| `scan_processes` | auditoria | 20s | Procesos con métricas de CPU/RAM |
| `scan_startup` | auditoria | 50s | Autoinicio (registro + schtasks) |
| `scan_patches` | auditoria | 120s | Actualizaciones pendientes (WUA) |
| `scan_hardware` | hardware | 30s | CPU, RAM, disco, batería, Event Log |
| `radar_fetch` | radar | — | Descarga las últimas noticias RSS (6 feeds) |
| `radar_correlate` | radar | — | Cruza noticias con el estado local |
| `generate_report` | reportes | 150s | 5 escáneres en secuencia + puntuación de riesgo |
| `historial_defender` | historial | — | Estado y eventos del log de Windows Defender |
| `historial_esticc_get` | historial | — | Lee el historial persistido en %APPDATA%\ESTICC\ |
| `historial_esticc_guardar` | historial | — | Añade una entrada al historial (política FIFO 100) |

> **Timeout UI**: si el sidecar Python no responde en ese tiempo, la UI muestra un aviso descriptivo y se desbloquea. El sidecar continúa ejecutándose en segundo plano y acepta la siguiente petición cuando termina.

---

## Uso del Radar OSINT

Para obtener correlaciones precisas:

1. Ejecuta primero el escáner de **Puertos** (panel *Puertos*)
2. Ve al panel **📡 Radar OSINT** y pulsa *Actualizar radar*
3. ESTICC descarga las últimas noticias de las 6 fuentes y compara los puertos abiertos con las amenazas publicadas
4. Las alertas se clasifican en **Crítico** (puerto coincide con amenaza) y **Alto** (CVE publicado relevante)

---

## Datos persistentes: %APPDATA%\ESTICC\

ESTICC guarda el historial de sus propios escaneos en la carpeta de datos de aplicación del usuario:

```
C:\Users\<NombreUsuario>\AppData\Roaming\ESTICC\
└── historial.json     ← Historial de escaneos (últimas 100 entradas)
```

**¿Por qué %APPDATA%?**
- No requiere permisos de administrador para escribir.
- Sigue el estándar de Windows para datos de usuario por aplicación.
- Los datos del usuario se conservan aunque se reinstale ESTICC.
- Compatible con entornos corporativos donde `Program Files\` es de solo lectura.

**Formato de historial.json:**

```json
[
  {
    "timestamp":     "2026-05-23T10:30:00+00:00",
    "tipo":          "informe_completo",
    "nivel":         "medio",
    "puntuacion":    42,
    "num_hallazgos": 3,
    "resumen":       null,
    "fuente":        "esticc"
  }
]
```

La lista se limita a las **100 entradas más recientes** (política FIFO). Para eliminar el historial basta con borrar el archivo manualmente.

---

## Notas de seguridad

- ESTICC **solo realiza lectura pasiva** del sistema local. No modifica ningún archivo, configuración ni ajuste de red.
- El Radar OSINT realiza peticiones HTTP GET a feeds RSS públicos. No envía ningún dato del sistema a servidores externos.
- Los datos del simulador son **completamente ficticios** y se generan en el frontend sin tocar el sistema real.

---

## Changelog

### [v0.4.0](https://github.com/yeagoblab/esticc/releases/tag/v0.4.0) — 2026-05-27
- **fix:** panel Hardware ya no se solapa con otras secciones (conflicto de especificidad CSS ID vs. clase resuelto)
- **fix:** Radar OSINT vuelve a funcionar (`#loading` eliminado sustituido por el sistema de toasts)
- **fix:** PDF generado ya no incluye la barra lateral de navegación
- **feat:** detección de atascos en todos los escaneos con timeout configurable por módulo y mensaje descriptivo al usuario
- **feat:** filas alternas en listas de vista básica (defensas, procesos, autoinicio)
- **feat:** Módulo 06 — Monitor de Hardware (CPU, RAM, disco, batería, Event Log) integrado en la interfaz principal
- **feat:** Panel de Configuración con i18n ES/EN, escáner en segundo plano y perfil de usuario; perfil `Mediana PYME` activa modo avanzado automáticamente
- **ui:** cards de perfiles de usuario más anchas y con texto más legible

### [v0.3.2](https://github.com/yeagoblab/esticc/releases/tag/v0.3.2) — 2026-05-24
- **chore:** recompilación del portable con los metadatos de versión corregidos. El binario ahora reporta `0.3.2` internamente.

### [v0.3.1](https://github.com/yeagoblab/esticc/releases/tag/v0.3.1) — 2026-05-24
- **chore:** versión interna de `tauri.conf.json` y `Cargo.toml` actualizada a `0.3.1` para que coincida con el tag de la release.

### [v0.3.0](https://github.com/yeagoblab/esticc/releases/tag/v0.3.0) — 2026-05-24
- **fix:** suprimida la ventana de consola (terminal negra) que aparecía al iniciar ESTICC. El sidecar `backend.exe` ahora se lanza con el flag `CREATE_NO_WINDOW` de la API Win32.

### [v0.2.0](https://github.com/yeagoblab/esticc/releases/tag/v0.2.0) — 2026-05-24
- **feat:** instalador gráfico `ESTICC_Installer.exe` para usuarios finales. Comprueba requisitos del sistema, descarga ESTICC desde GitHub y crea accesos directos sin necesidad de permisos de administrador.
- **feat:** versión portable `ESTICC_portable_win64.zip` lista para descomprimir y ejecutar.
- **docs:** instrucciones de instalación para usuarios finales separadas de las de desarrollo.

### [v0.1.0](https://github.com/yeagoblab/esticc/releases/tag/v0.1.0) — 2026-05-24
- Primera versión pública. Incluye auditoría local, radar OSINT, simulador de amenazas, informe de seguridad, historial de análisis y enciclopedia de malware.

---

## Licencia

Este proyecto está bajo la Licencia MIT. Para más detalles, consulta el archivo [License](License) en la raíz del repositorio.
