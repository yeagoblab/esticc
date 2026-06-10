# Changelog — ESTICC

Todas las versiones publicadas de ESTICC están documentadas en este archivo.
El formato sigue [Keep a Changelog](https://keepachangelog.com/es/1.0.0/).

---

## [v0.6.3](https://github.com/yeagoblab/esticc/releases/tag/v0.6.3) — 2026-06-10

### Añadido
- **Enciclopedia multiidioma (ES/EN)** — las 9 amenazas de la enciclopedia están ahora disponibles en español e inglés. `enciclopedia.js` separa `AMENAZAS_BASE` (campos técnicos invariantes: MITRE ATT&CK, IOCs, CVEs) de `AMENAZAS_I18N {es, en}` (textos en lenguaje natural: nombre, descripción, vector, síntomas, prevención, herramienta recomendada, ejemplos conocidos). La función `getAmenazas()` fusiona ambas estructuras con el idioma activo mediante `Object.assign` en cada llamada.
- **Chips y badges traducidos** — los chips de categoría ("Troyanos" → "Trojans", "Gusanos" → "Worms", "Vectores" → "Attack Vectors") y los badges de nivel de peligro ("CRÍTICO/ALTO/MEDIO" → "CRITICAL/HIGH/MEDIUM") reflejan ahora el idioma activo.
- **`window.refreshEnciclopedia()`** — hook expuesto globalmente e invocado por `applyTranslations()` (i18n.js) al cambiar de idioma. Re-renderiza chips, grid y placeholder del buscador al instante sin recargar la aplicación.
- **Sección `enc` en i18n.js** — añadidos en ambos idiomas: placeholder del buscador, mensaje "sin resultados", texto "Ver ficha completa →", etiquetas de categoría, niveles de peligro y los 10 headings del modal de detalle.

### Eliminado
- Aviso "La Enciclopedia de Malware está disponible solo en español en esta versión" (ya no aplica).

---

## [v0.6.2](https://github.com/yeagoblab/esticc/releases/tag/v0.6.2) — 2026-06-03

### Corregido
- **Actualizador reescrito limpio** — `actualizador.py` reescrito desde cero en ASCII puro, eliminando el mojibake histórico introducido por `package_release.ps1` en versiones anteriores. El código fuente es ahora legible y mantenible.
- **`package_release.ps1`** — el script ahora usa una llamada Python (`ast` + `re`) para sincronizar `VERSION_ACTUAL` en `actualizador.py` en lugar de `Get-Content`/`Set-Content` de PowerShell 5.1, que corrompía los caracteres UTF-8 al escribir el archivo.
- **Relanzado automático tras actualización** — el backend ejecuta un wait-loop que espera a que `ESTICC.exe` cierre antes de señalizar al script PowerShell desacoplado que puede copiar los nuevos binarios y relanzar la aplicación.

---

## [v0.6.1](https://github.com/yeagoblab/esticc/releases/tag/v0.6.1) — 2026-06-03

### Corregido
- **Relaunch tras actualización** — la app no se relanzaba automáticamente al terminar la instalación de una actualización. Se añadió el wait-loop en `backend.exe` para esperar el cierre de `ESTICC.exe` antes de ejecutar el script PowerShell de sustitución de binarios.

---

## [v0.6.0](https://github.com/yeagoblab/esticc/releases/tag/v0.6.0) — 2026-06-02

### Añadido
- **Tutorial interactivo de primera vez** — overlay de 7 pasos (Bienvenida → Escáneres → Modo Demo → Enciclopedia → Radar → Informe → Configuración) con resaltado visual del elemento de UI en cada paso. Se lanza automáticamente en la primera instalación (estado persistido en `config.json` como `tutorial_completado`). Relanzable desde Configuración con "🎓 Ver tutorial".
- **Doble gauge de salud en el monitor de hardware** — cada tarjeta de componente (CPU, RAM, disco, batería) muestra dos indicadores circulares: Uso actual y Salud/vida útil (0–100, verde/naranja/rojo). Un botón **?** despliega el panel explicativo con los factores de la puntuación y un consejo de acción.
- **Sección de salud del dispositivo en el informe PDF** — grid 2×2 con la puntuación, nivel (Buena/Moderada/Deteriorada), factores explicativos y consejo por componente (CPU, RAM, disco, batería).
- **Ficha técnica de la máquina en el informe** — nombre del equipo, IP, MAC, tipo (portátil/sobremesa), procesador, RAM y almacenamiento en la cabecera del informe.

### Corregido
- **Exportación a PDF en múltiples páginas** — sobreescrito `height: auto` y `overflow: visible` en `@media print` para que el contenido no quede truncado a una sola página.

### Mejorado
- **`generate_report` paralelizado** — `escaner_hardware` (con `muestreo=2`) se ejecuta ahora en paralelo con los 4 escáneres de auditoría, sin incrementar el tiempo total del informe.

---

## [v0.5.3](https://github.com/yeagoblab/esticc/releases/tag/v0.5.3) — 2026-06-01

### Corregido
- **Versión interna del binario** — `backend.exe` de v0.5.2 se compiló con `VERSION_ACTUAL = "0.4.9"`, haciendo que el actualizador detectara una falsa actualización disponible. Ahora reporta `0.5.3` correctamente.
- **Banner de primera instalación** — mostraba "Hace Infinity días sin analizar el sistema" en instalaciones limpias. Ahora usa la clave i18n `banner_nunca` ("Nunca has analizado el sistema." / "You have never scanned this system.").
- **Warning de favicon** — suprimido el aviso interno de Tauri "Asset favicon.ico not found" añadiendo `<link rel="icon" href="data:,">` en `index.html`.
- **SyntaxWarning en `config.py`** — corregidas secuencias de escape inválidas `\E` en docstrings con rutas `%APPDATA%\ESTICC`.

---

## [v0.5.2](https://github.com/yeagoblab/esticc/releases/tag/v0.5.2) — 2026-05-30

### Corregido
- **Actualizador funcional de extremo a extremo** — al pulsar "Instalar y reiniciar", ESTICC se cierra, el script PowerShell reemplaza los binarios y la app vuelve a abrirse correctamente.
- **`backend.exe` huérfano** — Windows no mata procesos hijo sin Job Object. El script de actualización ahora termina `backend.exe` explícitamente con `Stop-Process` antes de copiar los nuevos binarios.

---

## [v0.5.1](https://github.com/yeagoblab/esticc/releases/tag/v0.5.1) — 2026-05-30

### Mejorado
- **Nuevo logo vectorial** — icono regenerado desde fuente SVG (escudo con ECG + flecha verde) con mayor nitidez en todos los tamaños de icono (16 px a 512 px).

---

## [v0.5.0](https://github.com/yeagoblab/esticc/releases/tag/v0.5.0) — 2026-05-28

### Añadido
- **Configuración persistida en `%APPDATA%`** — tema, rol e idioma se guardan ahora en `%APPDATA%\ESTICC\config.json` y sobreviven a reinstalaciones (anteriormente solo en `localStorage`).

### Mejorado
- **Informe paralelo** — los 4 escáneres independientes (defensas, puertos, autoinicio, parches) se ejecutan en paralelo con `ThreadPoolExecutor`; el tiempo total pasa de ser la suma al tiempo del más lento.

### Corregido
- Umbral de alerta de CPU bajado a 50 % y RAM a 800 MB para reducir falsos positivos.
- El texto del hallazgo de CPU en el informe ahora lee el umbral dinámicamente.
- `schtasks` con timeout aumentado de 10 s a 45 s para evitar listas vacías con muchas GPOs.
- Añadidas claves `HKLM\Wow6432Node\Run` y `RunOnce` al escáner de autoinicio para detectar persistencia de malware de 32 bits.
- Regex de extracción de puertos en el radar acotada para no capturar timestamps ni estadísticas.
- `PUERTOS_SOSPECHOSOS` centralizado en `escaner_puertos.py`; eliminada la copia duplicada en `generador.py`.

---

## [v0.4.1](https://github.com/yeagoblab/esticc/releases/tag/v0.4.1) — 2026-05-28

### Añadido
- **Actualización in-app** — botón "Buscar actualización" en Configuración que comprueba la versión en GitHub, muestra las novedades, descarga el ZIP portable y reemplaza los binarios automáticamente al cerrar la app.

---

## [v0.4.0](https://github.com/yeagoblab/esticc/releases/tag/v0.4.0) — 2026-05-27

### Añadido
- Detección de atascos con timeout configurable por módulo y mensaje descriptivo al usuario.
- Filas alternas en listas de vista básica (defensas, procesos, autoinicio).
- Módulo 06 — Monitor de Hardware (CPU, RAM, disco, batería, Event Log) integrado en la interfaz principal.
- Panel de Configuración con i18n ES/EN, escáner en segundo plano y perfiles de usuario.

### Corregido
- Panel Hardware ya no se solapa con otras secciones (conflicto de especificidad CSS ID vs. clase).
- Radar OSINT funcional de nuevo (`#loading` sustituido por el sistema de toasts).
- PDF generado ya no incluye la barra lateral de navegación.

---

## [v0.3.2](https://github.com/yeagoblab/esticc/releases/tag/v0.3.2) — 2026-05-24

### Corregido
- Recompilación del portable con metadatos de versión correctos (`0.3.2` en el binario).

---

## [v0.3.1](https://github.com/yeagoblab/esticc/releases/tag/v0.3.1) — 2026-05-24

### Corregido
- Versión interna de `tauri.conf.json` y `Cargo.toml` actualizada a `0.3.1` para coincidir con el tag de release.

---

## [v0.3.0](https://github.com/yeagoblab/esticc/releases/tag/v0.3.0) — 2026-05-24

### Corregido
- **Ventana de consola** — suprimida la terminal negra que aparecía al iniciar ESTICC. El sidecar `backend.exe` se lanza ahora con el flag `CREATE_NO_WINDOW` de la API Win32.

---

## [v0.2.0](https://github.com/yeagoblab/esticc/releases/tag/v0.2.0) — 2026-05-24

### Añadido
- Instalador gráfico `ESTICC_Installer.exe` para usuarios finales (Python stdlib + PyInstaller; sin deps externas). Comprueba requisitos del sistema, descarga ESTICC desde GitHub y crea accesos directos sin permisos de administrador.
- Versión portable `ESTICC_portable_win64.zip` lista para descomprimir y ejecutar.

---

## [v0.1.0](https://github.com/yeagoblab/esticc/releases/tag/v0.1.0) — 2026-05-24

### Añadido
- Primera versión pública. Incluye auditoría local (5 escáneres), radar OSINT, simulador de amenazas (8 escenarios), informe de seguridad con puntuación de riesgo 0–100, historial de análisis y enciclopedia de malware.
