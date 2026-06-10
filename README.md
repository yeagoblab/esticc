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
Panel en tiempo real con métricas del sistema, detección de eventos críticos y **análisis de vida útil**:
- **CPU** — uso en %, modelo, núcleos físicos/lógicos, frecuencia y temperatura (modo avanzado)
- **RAM** — uso en %, total, disponible y velocidad de los módulos (modo avanzado)
- **Almacenamiento** — uso por partición con barras de color, velocidades de lectura/escritura y tipo de disco (HDD/SSD)
- **Batería** — porcentaje, estado de carga y tiempo estimado restante (oculto en equipos de sobremesa)
- **Event Log de hardware** — últimos eventos críticos del Visor de eventos de Windows (reinicios inesperados, throttling térmico)
- Gráficas de historial de CPU y RAM con las últimas 30 muestras
- Tabla de especificaciones del sistema (visible solo en modo avanzado)

#### Salud y vida útil del hardware *(nuevo en v0.6.0)*
Cada tarjeta de componente muestra ahora **dos gauges circulares**: Uso actual y Salud/vida útil (0–100). Un botón **?** despliega el panel explicativo con los factores que determinan la puntuación y consejos de acción concretos:

| Componente | Método de evaluación | Factores |
|---|---|---|
| CPU | Temperatura + Event Log | °C actuales · eventos de throttling térmico (ID 37) |
| RAM | Uso de swap (proxy) | % de memoria de intercambio activa |
| Almacenamiento | `Get-PhysicalDisk HealthStatus` | Healthy / Warning / Unhealthy por disco físico |
| Batería | WMI `BatteryFullChargedCapacity / DesignedCapacity` | % de capacidad original conservada |

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
Ejecuta los 5 escáneres de auditoría y el escaneo de hardware en paralelo, calcula una puntuación de riesgo global (0–100) y genera un informe HTML completo exportable a PDF:
- Nivel de riesgo: **Bajo / Medio / Alto / Crítico**
- Hallazgos individuales con nivel de severidad y categoría
- Resumen por módulo con métricas clave
- **Sección de salud del dispositivo** *(nuevo en v0.6.0)* — puntuación de CPU, RAM, disco y batería con factores explicativos y consejos de mejora
- **Ficha técnica de la máquina** *(nuevo en v0.6.0)* — nombre del equipo, dirección IP, MAC, tipo (portátil/sobremesa), procesador, RAM y almacenamiento en la cabecera del informe
- Recomendaciones de remediación personalizadas según los hallazgos detectados
- Exportación a PDF correcta en múltiples páginas (sin barra lateral ni elementos de UI)

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

**Disponible en Español e Inglés** *(nuevo en v0.6.3)* — al cambiar el idioma en Configuración, toda la enciclopedia (descripciones, síntomas, medidas de prevención, herramientas recomendadas, ejemplos, categorías y niveles de peligro) se actualiza al instante sin recargar la aplicación.

### 🎓 Tutorial interactivo *(nuevo en v0.6.0)*
Tutorial de primera vez que guía al usuario por todas las funciones principales de ESTICC:
- Se lanza automáticamente en la primera instalación (puede omitirse)
- Navegación paso a paso con resaltado visual del elemento de la UI explicado
- Relanzable en cualquier momento desde el panel de Configuración con "🎓 Ver tutorial"
- 7 pasos: Bienvenida → Escáneres → Modo Demo → Enciclopedia → Radar → Informe → Configuración

### ⚙️ Configuración y Perfiles de Usuario
Panel de ajustes persistidos en `%APPDATA%\ESTICC\config.json` (sobrevive a reinstalaciones) con efecto inmediato sin recargar:
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

### 🔄 Actualización in-app
Botón "Buscar actualización" en el panel de Configuración que permite actualizar ESTICC sin salir de la app ni requerir permisos de administrador:
1. Consulta la GitHub Releases API y compara la versión instalada con la publicada
2. Muestra las novedades de la nueva versión antes de descargar
3. Descarga el ZIP portable directamente desde GitHub (~10 MB)
4. Cierra la app y un script PowerShell desacoplado reemplaza los binarios y la relanza automáticamente

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
│   ├── modulo_01_config/
│   │   └── config.py                  # Lee/escribe config en %APPDATA%\ESTICC\config.json
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
│   │   └── generador.py               # Ejecuta 6 escáneres en paralelo + riesgo 0-100 + ficha de máquina
│   ├── modulo_05_historial/
│   │   ├── historial_defender.py      # Consulta el log de eventos de Windows Defender
│   │   └── historial_esticc.py        # Persiste el historial propio en %APPDATA%\ESTICC\
│   ├── modulo_06_hardware/
│   │   └── escaner_hardware.py        # CPU, RAM, disco, batería, Event Log + scores de salud/vida útil
│   └── modulo_07_actualizador/
│       ├── __init__.py                # Exporta check_update, download_and_prepare, apply_update
│       └── actualizador.py            # GitHub API + descarga ZIP + PS script copy-on-close
├── frontend/
│   ├── index.html                     # SPA única; incluye todos los paneles y el CSS base
│   ├── css/
│   │   ├── tutorial.css               # Overlay del tutorial + dots de progreso + highlight de UI
│   │   ├── simulador.css              # Paneles del simulador de amenazas
│   │   ├── enciclopedia.css           # Grid de tarjetas + modal de amenaza
│   │   ├── radar.css                  # Contadores OSINT + tabla de noticias
│   │   ├── reportes.css               # Informe de seguridad + @media print multi-página
│   │   ├── historial.css              # Calendario mensual + timeline de eventos
│   │   ├── config.css                 # Panel de configuración + variables de tema claro
│   │   └── hardware.css               # Grid de tarjetas + doble gauge + panel de salud
│   └── js/
│       ├── tutorial.js                # Tutorial de primera vez (7 pasos, highlight, persistencia)
│       ├── i18n.js                    # Diccionarios ES/EN + función t() global
│       ├── config.js                  # Carga/guarda config vía IPC (%APPDATA%) con fallback localStorage; aplica tema, rol e idioma
│       ├── background.js              # Escáner en segundo plano + banner de recordatorio
│       ├── auditoria.js               # Renderers de los 5 módulos + sistema de toasts + withTimeout
│       ├── simulador.js               # 8 escenarios de demo + interceptor de invoke()
│       ├── enciclopedia.js            # Base de datos de malware (ES/EN) + buscador + modal de detalle; AMENAZAS_BASE + AMENAZAS_I18N
│       ├── radar.js                   # Fetch OSINT + renderizado en vista básica/avanzada
│       ├── reportes.js                # Informe HTML con ficha de máquina + sección de salud
│       ├── historial.js               # Calendario interactivo + window.HISTORIAL.registrar()
│       ├── hardware.js                # Monitor + doble gauge (uso/salud) + panel explicativo
│       └── actualizador.js            # UI de actualización in-app (comprobar → descargar → instalar)
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
| `generate_report` | reportes | 150s | 4 escáneres en paralelo + procesos en serie + puntuación de riesgo |
| `historial_defender` | historial | — | Estado y eventos del log de Windows Defender |
| `historial_esticc_get` | historial | — | Lee el historial persistido en %APPDATA%\ESTICC\ |
| `historial_esticc_guardar` | historial | — | Añade una entrada al historial (política FIFO 100) |
| `update_check` | actualizador | 15s | Consulta GitHub Releases API y compara versiones |
| `update_download` | actualizador | 120s | Descarga el ZIP portable y prepara el script de sustitución |
| `update_apply` | actualizador | — | Lanza el PS script desacoplado y señala que la app debe cerrarse |
| `config_get` | config | — | Lee la configuración de %APPDATA%\ESTICC\config.json |
| `config_set` | config | — | Escribe la configuración en %APPDATA%\ESTICC\config.json |

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

ESTICC guarda datos de usuario en la carpeta de datos de aplicación estándar de Windows:

```
C:\Users\<NombreUsuario>\AppData\Roaming\ESTICC\
├── config.json        ← Configuración del usuario (tema, rol, idioma, etc.)
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

### [v0.6.3](https://github.com/yeagoblab/esticc/releases/tag/v0.6.3) — 2026-06-10
- **feat:** enciclopedia de malware internacionalizada — las 9 amenazas están disponibles en español e inglés. `enciclopedia.js` se ha refactorizado separando `AMENAZAS_BASE` (campos técnicos invariantes: MITRE, IOCs, CVEs) de `AMENAZAS_I18N` (textos en ES/EN: nombre, descripción, vector, síntomas, prevención, herramienta, ejemplos). La función `getAmenazas()` fusiona ambas estructuras con el idioma activo en cada llamada.
- **feat:** chips de categoría y niveles de peligro traducidos — "Troyanos" → "Trojans", "Gusanos" → "Worms", "Vectores" → "Attack Vectors"; "CRÍTICO/ALTO/MEDIO" → "CRITICAL/HIGH/MEDIUM".
- **feat:** `window.refreshEnciclopedia()` — al cambiar de idioma en Configuración, `applyTranslations()` invoca este hook y la enciclopedia (chips, grid, placeholder del buscador) se re-renderiza al instante sin recargar la app.
- **chore:** eliminado el aviso "La Enciclopedia de Malware está disponible solo en español".

### [v0.6.2](https://github.com/yeagoblab/esticc/releases/tag/v0.6.2) — 2026-06-03
- **fix:** `actualizador.py` reescrito en ASCII puro — la release v0.6.1 contenía un `backend.exe` compilado desde un fuente con encoding corrupto (mojibake introducido por `package_release.ps1`). El binario funcionaba correctamente en tiempo de ejecución, pero el código fuente era ilegible y difícil de mantener.
- **fix:** `package_release.ps1` corregido — el script ahora usa Python para sincronizar `VERSION_ACTUAL` en `actualizador.py` en lugar de `Get-Content`/`Set-Content` de PowerShell 5.1, que corrompía los caracteres UTF-8 en cada release.
- **fix:** la app se relanza automáticamente al terminar la instalación de una actualización — el wait-loop del backend espera a que `ESTICC.exe` cierre antes de señalizar al PS script que puede copiar los binarios.

### [v0.6.0](https://github.com/yeagoblab/esticc/releases/tag/v0.6.0) — 2026-06-02
- **feat:** tutorial interactivo de primera vez — se lanza automáticamente en la primera instalación con un overlay de 7 pasos que resalta cada elemento de la UI. Incluye botón "Omitir" y opción de relanzar desde Configuración. El estado se persiste en `config.json` (`tutorial_completado`).
- **feat:** doble gauge de salud en el monitor de hardware — cada tarjeta (CPU, RAM, disco, batería) muestra ahora dos indicadores circulares: **Uso actual** y **Salud / vida útil** (0–100, escala verde/naranja/rojo invertida).
- **feat:** panel explicativo de salud — botón **?** junto a cada gauge de salud que despliega los factores que determinan la puntuación (temperatura, throttling, swap, S.M.A.R.T., desgaste de batería) y un consejo de acción concreto si hay algo que mejorar.
- **feat:** sección de salud del dispositivo en el informe PDF — el informe incluye un grid 2×2 con la puntuación, nivel (Buena/Moderada/Deteriorada), factores explicativos y consejo por componente.
- **feat:** ficha técnica de la máquina en la cabecera del informe — nombre del equipo, IP, MAC, tipo (portátil/sobremesa), procesador, RAM y almacenamiento.
- **fix:** exportación a PDF en múltiples páginas — sobreescrito `height: auto` y `overflow: visible` en `@media print` para que el contenido no quede truncado a una sola página.
- **chore:** `generate_report` ahora ejecuta 6 escáneres en paralelo (añadido `escaner_hardware` con `muestreo=2`) sin incrementar el tiempo total.

### [v0.5.3](https://github.com/yeagoblab/esticc/releases/tag/v0.5.3) — 2026-06-01
- **fix:** versión interna quemada en el binario — `backend.exe` de la release v0.5.2 se compiló con `VERSION_ACTUAL = "0.4.9"` en lugar de `"0.5.2"`, haciendo que el actualizador detectara una falsa actualización disponible incluso en la instalación más reciente. El binario ahora reporta `0.5.3` correctamente. Causa raíz: el script `package_release.ps1` sincronizaba el source pero no recompilaba el binario antes de empaquetar.
- **fix:** banner de primera instalación — en instalaciones limpias (sin ningún escaneo previo en `localStorage`), el banner mostraba `Hace Infinity días sin analizar el sistema`. Ahora muestra `Nunca has analizado el sistema.` usando la clave i18n `banner_nunca` (disponible en ES y EN).
- **fix:** suprimido el warning interno de Tauri `Asset favicon.ico not found` — añadido `<link rel="icon" href="data:,">` en `index.html` para que el WebView no realice la petición automática de `/favicon.ico`.
- **fix:** corregidas secuencias de escape inválidas `\E` en docstrings de `config.py` (rutas `%APPDATA%\ESTICC`) que habrían causado `SyntaxError` en versiones futuras de Python.

### [v0.5.2](https://github.com/yeagoblab/esticc/releases/tag/v0.5.2) — 2026-05-30
- **fix:** actualizador funcional de extremo a extremo — al pulsar "Instalar y reiniciar", ESTICC ahora se cierra, el script PowerShell reemplaza los binarios y la app vuelve a abrirse correctamente.
- **fix:** `backend.exe` sobrevivía como proceso huérfano al cerrar `ESTICC.exe` (Windows no mata procesos hijo sin Job Object). El script de actualización ahora termina `backend.exe` explícitamente con `Stop-Process` antes de copiar los nuevos binarios.
- **fix:** nuevo logo vectorial — icono regenerado a partir de fuente SVG con mayor nitidez en todos los tamaños de icono (16px a 512px).

### [v0.5.1](https://github.com/yeagoblab/esticc/releases/tag/v0.5.1) — 2026-05-30
- **ui:** nuevo logo vectorial e iconos regenerados — el escudo con ECG ahora se construye desde un SVG fuente para mantener nitidez en todos los tamaños de icono del bundle.

### [v0.5.0](https://github.com/yeagoblab/esticc/releases/tag/v0.5.0) — 2026-05-28
- **feat:** configuración persistida en `%APPDATA%\ESTICC\config.json` — el tema, el rol y el idioma elegidos sobreviven ahora a reinstalaciones de la app (anteriormente solo se guardaban en `localStorage`)
- **perf:** los 4 escáneres independientes del informe completo (defensas, puertos, autoinicio, parches) se ejecutan ahora en paralelo con `ThreadPoolExecutor` — el tiempo total del informe pasa de ser la suma de los 4 al tiempo del más lento
- **fix:** umbral de alerta de CPU bajado de 30% a 50% y de RAM de 500 MB a 800 MB para eliminar falsos positivos en sistemas con Chrome, VS Code o antivirus activo
- **fix:** el texto del hallazgo de CPU en el informe leía siempre `>80%` en lugar del umbral real; ahora se lee dinámicamente de `escaner_procesos.CPU_UMBRAL`
- **fix:** `schtasks` en el escáner de autoinicio: timeout aumentado de 10 s a 45 s para evitar listas vacías en sistemas con muchas GPOs
- **fix:** añadidas las claves `HKLM\Wow6432Node\Run` y `RunOnce` al escáner de autoinicio para detectar persistencia de malware de 32 bits en sistemas de 64 bits
- **fix:** regex de extracción de puertos en el radar OSINT acotada para no capturar timestamps (`10:30`) ni estadísticas (`2024:18000`) como números de puerto
- **fix:** `PUERTOS_SOSPECHOSOS` centralizado en `escaner_puertos.py` (eliminada la copia duplicada en `generador.py`); el panel de Puertos ahora recibe el campo `sospechoso` en cada conexión sin necesidad de generar un informe completo

### [v0.4.1](https://github.com/yeagoblab/esticc/releases/tag/v0.4.1) — 2026-05-28
- **feat:** actualización in-app desde el panel de Configuración — comprueba la versión en GitHub, muestra las novedades, descarga el ZIP y reemplaza los binarios automáticamente tras cerrar la app (sin permisos de administrador)

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
