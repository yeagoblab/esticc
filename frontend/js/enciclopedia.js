/**
 * enciclopedia.js — Enciclopedia de Malware Interactiva de ESTICC
 *
 * Arquitectura de datos (separación base / i18n):
 *   AMENAZAS_BASE[]   — campos técnicos invariantes: mitre, iocs, cves, icono, peligro, categoria.
 *                       No cambian con el idioma; se definen una sola vez.
 *   AMENAZAS_I18N{}   — textos traducibles por idioma (es/en): nombre, descripcion, sintomas, etc.
 *                       Cada entrada es un objeto keyed por el id de la amenaza.
 *
 * getAmenazas() fusiona ambas estructuras con Object.assign para producir el array
 * de objetos completos en el idioma activo (window.ESTICC_LANG).
 *
 * Al cambiar de idioma, config.js llama a applyTranslations() (i18n.js), que a su vez
 * invoca window.refreshEnciclopedia() para re-renderizar chips, grid y modal sin recargar.
 */

// ── Base de datos de amenazas (campos técnicos, no traducibles) ───────────────
// Estos campos son idénticos en todos los idiomas:
//   - icono:     emoji que representa visualmente la amenaza en tarjetas y modal
//   - peligro:   clave interna usada como clase CSS y para traducción ('critico'|'alto'|'medio')
//   - categoria: clave interna del filtro de chips (la etiqueta visible se traduce en renderChips)
//   - mitre:     técnicas MITRE ATT&CK — nomenclatura inglesa oficial, invariante
//   - iocs:      indicadores de compromiso — contienen artefactos técnicos (rutas, hashes, puertos)
//   - cves:      identificadores CVE — universales, sin traducción posible

const AMENAZAS_BASE = [
  {
    id: 'ransomware',      // Clave única que enlaza con AMENAZAS_I18N[lang].ransomware
    icono: '🔒',
    peligro: 'critico',    // Nivel de riesgo: 'critico' → badge rojo CRÍTICO/CRITICAL
    categoria: 'Ransomware',
    mitre: [
      { id: 'T1486',     nombre: 'Data Encrypted for Impact' },
      { id: 'T1490',     nombre: 'Inhibit System Recovery' },
      { id: 'T1566.001', nombre: 'Spearphishing Attachment' },
      { id: 'T1021.001', nombre: 'Remote Desktop Protocol' },
    ],
    iocs: [
      'Extensiones: .locked · .encrypted · .enc · .ryk · .wncry',
      'Notas: HOW_TO_DECRYPT.txt · README_FOR_DECRYPT.hta · _HELP_HELP_HELP.hta',
      'Mutex: Global\\MsWinZonesCacheCounterMutexA (WannaCry)',
      'Reg: HKCU\\Software\\[ID_víctima] — clave de cifrado parcial',
      'Red: conexiones Tor a .onion para C2 / pago',
    ],
    cves: ['CVE-2017-0144 (EternalBlue/WannaCry)', 'CVE-2019-19781 (Citrix/REvil)', 'CVE-2021-34527 (PrintNightmare/Conti)'],
  },
  {
    id: 'rat',
    icono: '🎭',
    peligro: 'critico',
    categoria: 'Troyanos',
    mitre: [
      { id: 'T1059.003', nombre: 'Windows Command Shell' },
      { id: 'T1071.001', nombre: 'Web Protocols (C2 over HTTPS)' },
      { id: 'T1547.001', nombre: 'Registry Run Keys / Startup Folder' },
      { id: 'T1113',     nombre: 'Screen Capture' },
      { id: 'T1125',     nombre: 'Video Capture' },
    ],
    iocs: [
      'Puerto de escucha: 4444 (Metasploit default) · 1337 · 8080',
      'Reg: HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\\[nombre_aleatorio]',
      'Proceso: nombres similares a sistema (svchost32.exe, explorer_.exe)',
      'Red: beacon periódico cada 60s a IP fija o dominio DGA',
      'Archivo: dropped en %APPDATA%\\Roaming\\ o %TEMP%\\',
    ],
    cves: ['CVE-2022-30190 (Follina/MSDT)', 'CVE-2021-40444 (MSHTML RCE)'],
  },
  {
    id: 'spyware',
    icono: '👁️',
    peligro: 'alto',       // 'alto' → badge naranja ALTO/HIGH
    categoria: 'Spyware',
    mitre: [
      { id: 'T1056.001', nombre: 'Keylogging (API hooking)' },
      { id: 'T1113',     nombre: 'Screen Capture (GDI/BitBlt)' },
      { id: 'T1041',     nombre: 'Exfiltration Over C2 Channel' },
      { id: 'T1176',     nombre: 'Browser Extensions' },
    ],
    iocs: [
      'API hooking: SetWindowsHookEx(WH_KEYBOARD_LL) sin firma conocida',
      'Archivos: logs cifrados en %APPDATA%\\[GUID]\\',
      'Red: POST periódico a dominio de aspecto legítimo (CDN falso)',
      'Proceso: inyectado en explorer.exe o navegadores via DLL injection',
    ],
    cves: ['CVE-2021-30983 (iOS/Pegasus)', 'CVE-2022-22620 (Safari/WebKit)'],
  },
  {
    id: 'adware',
    icono: '📢',
    peligro: 'medio',      // 'medio' → badge amarillo MEDIO/MEDIUM
    categoria: 'Adware',
    mitre: [
      { id: 'T1176',     nombre: 'Browser Extensions' },
      { id: 'T1112',     nombre: 'Modify Registry (motor búsqueda)' },
      { id: 'T1574.002', nombre: 'DLL Side-Loading (inyección en browser)' },
    ],
    iocs: [
      'Reg: HKLM\\SOFTWARE\\Policies\\Google\\Chrome\\ExtensionInstallForcelist',
      'Archivo hosts: entradas que redirigen dominios de búsqueda',
      'Extensión sin firma ni ID verificado en chrome://extensions/',
      'Proceso: BHO (Browser Helper Object) cargado en iexplore.exe',
    ],
    cves: [],              // Sin CVEs documentados para adware genérico
  },
  {
    id: 'rootkit',
    icono: '🕳️',
    peligro: 'critico',
    categoria: 'Rootkits',
    mitre: [
      { id: 'T1014',     nombre: 'Rootkit (DKOM / SSDT hooking)' },
      { id: 'T1542.003', nombre: 'Bootkit (MBR/VBR infection)' },
      { id: 'T1068',     nombre: 'Exploitation for Privilege Escalation' },
      { id: 'T1562.001', nombre: 'Disable or Modify Tools' },
    ],
    iocs: [
      'Discrepancia entre procesos de Task Manager y Process Hacker',
      'Discrepancia entre netstat y WireShark (conexiones ocultas)',
      'SSDT hooked: funciones NtQuerySystemInformation / NtOpenProcess modificadas',
      'MBR: sector 0 del disco con firma no estándar (verificar con RootkitRevealer)',
      'Driver sin firma cargado en System32\\drivers\\',
    ],
    cves: ['CVE-2021-21551 (Dell DBUtil — EoP a kernel)', 'CVE-2022-21882 (Win32k EoP)'],
  },
  {
    id: 'gusano',
    icono: '🐛',
    peligro: 'alto',
    categoria: 'Gusanos',
    mitre: [
      { id: 'T1210',     nombre: 'Exploitation of Remote Services' },
      { id: 'T1570',     nombre: 'Lateral Tool Transfer' },
      { id: 'T1091',     nombre: 'Replication Through Removable Media' },
      { id: 'T1203',     nombre: 'Exploitation for Client Execution' },
    ],
    iocs: [
      'CVE: EternalBlue (MS17-010) — tráfico SMB anómalo en puerto 445',
      'Escáneo masivo: miles de SYN a :445/:3389 desde host interno',
      'Archivo: copia de sí mismo en \\\\[IP]\\ADMIN$\\',
      'Proceso: cmd.exe lanzado por services.exe con args de red',
      'Red: payload DOUBLEPULSAR en SMB Named Pipe \\PIPE\\browser',
    ],
    cves: ['CVE-2017-0144 (EternalBlue/WannaCry)', 'CVE-2019-0708 (BlueKeep/RDP)', 'CVE-2008-4250 (Conficker/MS08-067)'],
  },
  {
    id: 'keylogger',
    icono: '⌨️',
    peligro: 'alto',
    categoria: 'Keyloggers',
    mitre: [
      { id: 'T1056.001', nombre: 'Keylogging (SetWindowsHookEx)' },
      { id: 'T1056.003', nombre: 'Web Portal Capture (form grabbing)' },
      { id: 'T1041',     nombre: 'Exfiltration Over C2 Channel' },
    ],
    iocs: [
      'API: SetWindowsHookEx(WH_KEYBOARD_LL) invocado por proceso sin firma',
      'DLL inyectada en chrome.exe / firefox.exe sin publisher verificado',
      'Archivo de log cifrado creciendo en %TEMP%\\ o %APPDATA%\\',
      'Red: SMTP saliente en puerto 587/25 desde proceso no-cliente de correo',
      'Hardware: dispositivo USB/PS2 desconocido entre teclado y equipo',
    ],
    cves: ['CVE-2022-1096 (Chrome V8 — form grabbing)', 'CVE-2021-30551 (Chrome Type Confusion)'],
  },
  {
    id: 'cryptojacker',
    icono: '⛏️',
    peligro: 'medio',
    categoria: 'Cryptojackers',
    mitre: [
      { id: 'T1496',     nombre: 'Resource Hijacking (CPU/GPU)' },
      { id: 'T1059.007', nombre: 'JavaScript (WebAssembly miner)' },
      { id: 'T1176',     nombre: 'Browser Extensions' },
    ],
    iocs: [
      'Proceso: xmrig.exe / xmr-stak / minerd con argumento --pool',
      'Red: conexión stratum+tcp:// a puerto 3333/4444/14444 (XMR pool)',
      'CPU: uso sostenido >80% en reposo sin proceso aparente en Task Manager',
      'Script: WebAssembly (.wasm) cargado desde CDN desconocido en DevTools',
      'Dominio: coinhive.com (histórico) · miner.pr0gramm.com y similares',
    ],
    cves: ['CVE-2018-4878 (Flash — cryptojacking)', 'CVE-2021-3156 (sudo — escalada para instalar miner)'],
  },
  {
    id: 'botnet',
    icono: '🤖',
    peligro: 'alto',
    categoria: 'Botnets',
    mitre: [
      { id: 'T1071.001', nombre: 'Web Protocols (HTTP/S C2)' },
      { id: 'T1008',     nombre: 'Fallback Channels (DGA / P2P)' },
      { id: 'T1498',     nombre: 'Network DoS (DDoS via bot)' },
      { id: 'T1110.004', nombre: 'Credential Stuffing' },
    ],
    iocs: [
      'Red: beacon HTTP/S a dominio DGA (e.g., random-dict-words.com) cada 60s',
      'Proceso: powershell.exe / wscript.exe con conexión de red persistente',
      'Reg: HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run — dropper',
      'DNS: resoluciones fallidas masivas (DGA generando dominios)',
      'Tráfico: UDP flood saliente o HTTP POST masivo en puertos altos',
    ],
    cves: ['CVE-2016-10372 (Mirai/IoT)', 'CVE-2014-6271 (Shellshock/Bash — botnet Linux)'],
  },
  {
    id: 'phishing',
    icono: '🎣',
    peligro: 'alto',
    categoria: 'Vectores',
    mitre: [
      { id: 'T1566.001', nombre: 'Spearphishing Attachment' },
      { id: 'T1566.002', nombre: 'Spearphishing Link' },
      { id: 'T1557',     nombre: 'Adversary-in-the-Middle (AiTM / Evilginx)' },
      { id: 'T1598',     nombre: 'Phishing for Information (recon)' },
    ],
    iocs: [
      'Dominio: registrado <30 días · Levenshtein distance 1 del legítimo',
      'Cert: Let\'s Encrypt en dominio con typosquatting (paypa1.com)',
      'Header: X-Originating-IP no coincide con dominio del remitente',
      'URL: redirección a través de open redirect en dominio legítimo',
      'Kit: directorios /wp-content/phish/ o /verify/ con index.php de captura',
    ],
    cves: ['CVE-2021-40444 (MSHTML — doc malicioso por phishing)', 'CVE-2022-30190 (Follina — link phishing)'],
  },
];

// ── Contenido traducible por idioma ───────────────────────────────────────────
// Estructura: AMENAZAS_I18N[lang][id] = { nombre, descripcion_corta, descripcion,
//             vector, sintomas[], prevencion[], herramienta, ejemplos[] }
//
// Por qué estos campos van aquí y no en AMENAZAS_BASE:
//   - Contienen prosa en lenguaje natural, no identificadores técnicos.
//   - Descripciones, síntomas y medidas de prevención cambian significativamente
//     según el idioma (longitud, vocabulario, contexto cultural).
//   - ejemplos[] incluye en algunos casos términos entre paréntesis que sí se traducen
//     (ej. "Pegasus (grado gubernamental)" → "Pegasus (government-grade)").

const AMENAZAS_I18N = {

  /* ── ESPAÑOL ─────────────────────────────────────────────────────── */
  es: {
    ransomware: {
      nombre: 'Ransomware',
      descripcion_corta: 'Cifra tus archivos y exige un rescate económico para devolverte el acceso.',
      // Descripción completa mostrada en el modal de detalle
      descripcion: 'El ransomware es uno de los ataques más devastadores de la actualidad. Tras infectar el sistema, cifra documentos, imágenes, vídeos y bases de datos usando algoritmos de criptografía asimétrica (RSA-2048 + AES-256). El atacante posee la clave privada de descifrado y exige un pago —generalmente en criptomonedas como Bitcoin o Monero— a cambio de enviarla. No hay garantía de recuperación incluso pagando.',
      // Vector de ataque: cómo llega la amenaza al sistema
      vector: 'Correos con adjuntos maliciosos (macros de Office), sitios de descarga ilegítimos, vulnerabilidades de red sin parchear (SMB/EternalBlue), acceso RDP con contraseñas débiles.',
      // Síntomas observables por el usuario no técnico
      sintomas: [
        'Archivos con extensiones desconocidas (.locked, .encrypted, .enc)',
        'Nota de rescate en el escritorio o en cada carpeta',
        'Imposibilidad de abrir documentos, fotos o bases de datos',
        'CPU al 100% durante la fase de cifrado',
        'Iconos de archivo cambiados o en blanco',
      ],
      // Medidas preventivas ordenadas por facilidad de implementación
      prevencion: [
        'Realizar copias de seguridad offline y en la nube de forma regular',
        'Mantener el sistema operativo y aplicaciones actualizados',
        'No abrir adjuntos de correos no solicitados',
        'Deshabilitar macros de Office en entornos corporativos',
        'Usar autenticación de dos factores en accesos remotos',
      ],
      herramienta: 'No More Ransom (nomoreransom.org)',
      ejemplos: ['WannaCry', 'LockBit', 'REvil / Sodinokibi', 'Conti', 'Ryuk', 'BlackCat'],
    },
    rat: {
      nombre: 'Troyano de Acceso Remoto (RAT)',
      descripcion_corta: 'Permite a un atacante controlar tu equipo de forma remota y completamente silenciosa.',
      descripcion: 'Un RAT (Remote Access Trojan) se disfraza de software legítimo para engañar al usuario. Una vez ejecutado, establece una conexión persistente con el servidor del atacante usando protocolos cifrados (HTTPS/TLS sobre 443) para evadir firewalls. El atacante obtiene control total: pantalla en tiempo real, acceso a archivos, activación de cámara/micrófono, registro de teclado y ejecución de comandos arbitrarios.',
      vector: 'Software pirata, adjuntos de correo disfrazados de documentos, descargas de foros y redes P2P, ingeniería social.',
      sintomas: [
        'Actividad de red inusual, especialmente en horas de inactividad',
        'Procesos desconocidos ejecutándose en segundo plano',
        'Luz de la cámara web encendiéndose sola',
        'Rendimiento del equipo degradado sin causa aparente',
        'Aplicaciones que se abren o cierran solas',
      ],
      prevencion: [
        'Descargar software únicamente de sitios oficiales del fabricante',
        'Mantener el antivirus y el firewall activos y actualizados',
        'Cubrir la cámara web cuando no se usa',
        'Verificar la firma digital de los instaladores',
        'Revisar periódicamente los procesos activos',
      ],
      herramienta: 'Malwarebytes, Windows Defender Offline Scan',
      ejemplos: ['Metasploit Meterpreter', 'DarkComet', 'NjRAT', 'AsyncRAT', 'QuasarRAT'],
    },
    spyware: {
      nombre: 'Spyware',
      descripcion_corta: 'Recopila información personal y de navegación sin tu conocimiento y la envía a terceros.',
      descripcion: 'El spyware se instala de forma sigilosa y monitoriza la actividad del usuario de manera continuada: historial de navegación, credenciales introducidas mediante hooking de APIs Win32 (SetWindowsHookEx), capturas de pantalla periódicas mediante GDI/BitBlt y hasta conversaciones de audio. Los datos se comprimen, cifran y exfiltran en intervalos regulares hacia servidores C2.',
      vector: 'Software gratuito con bundleware, sitios web maliciosos con exploits de navegador, phishing, extensiones de navegador falsas.',
      sintomas: [
        'Navegador notablemente más lento de lo habitual',
        'Cambios en la página de inicio o motor de búsqueda sin haberlos configurado',
        'Anuncios hiperpersonalizados sobre conversaciones recientes',
        'Batería que se agota más rápido en portátiles',
        'Uso elevado de datos de red en segundo plano',
      ],
      prevencion: [
        'Leer detenidamente los pasos de instalación de software gratuito',
        'Usar un bloqueador de anuncios y scripts (uBlock Origin)',
        'Revisar y limpiar las extensiones del navegador periódicamente',
        'Usar un gestor de contraseñas para detectar credenciales comprometidas',
      ],
      herramienta: 'Malwarebytes AdwCleaner, SUPERAntiSpyware',
      ejemplos: ['CoolWebSearch', 'FinFisher', 'Pegasus (grado gubernamental)', 'Gator'],
    },
    adware: {
      nombre: 'Adware',
      descripcion_corta: 'Muestra publicidad invasiva y puede redirigir el navegador a sitios maliciosos.',
      descripcion: 'El adware modifica el navegador instalando extensiones no autorizadas, cambiando el motor de búsqueda predeterminado a través de políticas de grupo (GPO) o modificando el archivo hosts. Inyecta JavaScript en cada página visitada para insertar anuncios. Aunque su objetivo principal es generar ingresos publicitarios (pay-per-click), puede actuar como dropper de malware más peligroso.',
      vector: 'Instaladores de software gratuito con casillas preseleccionadas, extensiones de navegador falsas, sitios de descarga de terceros.',
      sintomas: [
        'Anuncios emergentes en páginas que no los muestran normalmente',
        'Motor de búsqueda o página de inicio cambiados sin permiso',
        'Extensiones o barras de herramientas desconocidas en el navegador',
        'Redirecciones a sitios publicitarios al hacer clic en enlaces',
        'Lentitud general del navegador',
      ],
      prevencion: [
        'Elegir siempre "Instalación personalizada" para deseleccionar extras',
        'Descargar software únicamente desde el sitio oficial del desarrollador',
        'Usar Unchecky para deseleccionar automáticamente el bundleware',
        'Revisar las extensiones instaladas en el navegador mensualmente',
      ],
      herramienta: 'Malwarebytes AdwCleaner (gratuito)',
      ejemplos: ['Superfish', 'Conduit', 'Babylon Toolbar', 'Ask Toolbar', 'OpenCandy'],
    },
    rootkit: {
      nombre: 'Rootkit',
      descripcion_corta: 'Se oculta en las capas más profundas del sistema operativo para ser completamente indetectable.',
      descripcion: 'Un rootkit opera en los niveles más privilegiados del sistema (Ring 0 / kernel). Utiliza técnicas como DKOM (Direct Kernel Object Manipulation) para desvincular su proceso de la lista de procesos activos, hooking de SSDT (System Service Descriptor Table) para interceptar llamadas al sistema y filtrar resultados, o bootkits que infectan el MBR/VBR para ejecutarse antes que el sistema operativo. Un rootkit de firmware sobrevive a reinstalaciones.',
      vector: 'Exploits de escalada de privilegios (privilege escalation), instaladores comprometidos (supply chain), acceso físico al equipo.',
      sintomas: [
        'Herramientas de seguridad que de repente dejan de funcionar',
        'Discrepancias entre lo que muestran distintas herramientas del sistema',
        'Comportamiento errático e impredecible del sistema operativo',
        'Tiempo de arranque significativamente más lento',
        'Archivos que aparecen y desaparecen inexplicablemente',
      ],
      prevencion: [
        'Activar Secure Boot en la BIOS/UEFI',
        'Mantener el firmware y los drivers actualizados',
        'No instalar software de fuentes no verificadas',
        'Usar el arranque seguro de Windows (Trusted Boot)',
        'Considerar la reinstalación completa ante sospecha seria',
      ],
      herramienta: 'Kaspersky TDSSKiller, GMER, Microsoft Rootkit Revealer',
      ejemplos: ['Sony BMG rootkit', 'ZeroAccess', 'Necurs', 'Flame', 'Azazel', 'Avatar'],
    },
    gusano: {
      nombre: 'Gusano de Red',
      descripcion_corta: 'Se propaga automáticamente por la red infectando otros equipos sin intervención del usuario.',
      descripcion: 'Los gusanos explotan vulnerabilidades de red (buffer overflows, use-after-free en protocolos de red) para inyectar shellcode en procesos remotos sin autenticación. Tras comprometer el objetivo, ejecutan su payload (descarga de malware, backdoor, ransomware) y repiten el ciclo de escáneo y explotación de forma exponencial. La propagación puede saturar redes enteras en minutos.',
      vector: 'Vulnerabilidades de red sin parchear (SMB, RDP), dispositivos USB, servicios con contraseñas débiles, redes compartidas.',
      sintomas: [
        'Red local notablemente lenta sin motivo aparente',
        'Alto uso de CPU y ancho de banda de red en reposo',
        'Conexiones salientes masivas a múltiples IPs',
        'Otros equipos de la red reportando problemas simultáneamente',
        'Logs del firewall con miles de intentos de conexión',
      ],
      prevencion: [
        'Mantener el sistema actualizado con los últimos parches de seguridad',
        'Segmentar la red (VLANs) para limitar la propagación',
        'Deshabilitar servicios de red no necesarios (SMBv1, Telnet)',
        'Usar contraseñas fuertes y únicas para servicios de red',
        'Monitorizar el tráfico de red en busca de anomalías',
      ],
      herramienta: 'Microsoft Safety Scanner, Windows Malicious Software Removal Tool',
      ejemplos: ['WannaCry', 'Conficker', 'Blaster', 'Sasser', 'Slammer', 'Code Red'],
    },
    keylogger: {
      nombre: 'Keylogger',
      descripcion_corta: 'Registra cada tecla pulsada capturando contraseñas, mensajes privados y datos bancarios.',
      descripcion: 'Los keyloggers de software usan la API SetWindowsHookEx(WH_KEYBOARD_LL) para registrar pulsaciones globalmente, o GetAsyncKeyState() en polling para capturar estado de teclas. Las variantes más avanzadas inyectan una DLL en el proceso del navegador para capturar directamente el contenido de campos de formulario antes del cifrado TLS (form grabbing). Los keyloggers hardware son dispositivos físicos invisibles para cualquier software de detección.',
      vector: 'Software malicioso descargado, phishing, acceso físico al equipo (keyloggers hardware), troyanos con componente keylogger integrado.',
      sintomas: [
        'Generalmente completamente imperceptible para el usuario',
        'Actividad de red sospechosa — envíos periódicos de datos pequeños',
        'Cuentas comprometidas a pesar de no reutilizar contraseñas',
        'En keyloggers hardware: dispositivo desconocido en el puerto USB del teclado',
      ],
      prevencion: [
        'Activar la autenticación de dos factores en todas las cuentas',
        'Usar el teclado virtual del sistema para datos bancarios en equipos desconocidos',
        'Revisar físicamente los puertos USB antes de usar un equipo público',
        'Usar un gestor de contraseñas con autorrelleno (resiste keyloggers de teclado)',
      ],
      herramienta: 'Malwarebytes, SpyBot Search & Destroy',
      ejemplos: ['HawkEye', 'Snake Keylogger', 'Agent Tesla', 'Olympic Vision', 'Ardamax'],
    },
    cryptojacker: {
      nombre: 'Cryptojacker',
      descripcion_corta: 'Secuestra la potencia de tu procesador para minar criptomonedas sin tu permiso.',
      descripcion: 'El cryptojacking implementa algoritmos Proof-of-Work (PoW) —especialmente CryptoNight para Monero por su resistencia a ASICs— usando las instrucciones AES-NI del procesador para maximizar el hashrate. En navegadores usa WebAssembly (WASM) para ejecutar código nativo a velocidades cercanas a las nativas. Los operadores usan pools de minería (stratum+tcp://) para agregar el hashrate de miles de víctimas y repartir recompensas.',
      vector: 'Scripts JavaScript en páginas web comprometidas, extensiones de navegador, malware descargado, contenedores Docker comprometidos.',
      sintomas: [
        'CPU o GPU al 80-100% durante la navegación web o en reposo',
        'Equipo extremadamente lento o con lag',
        'Ventiladores funcionando al máximo continuamente',
        'Batería que se agota en minutos en portátiles',
        'Facturas eléctricas anormalmente elevadas en servidores',
      ],
      prevencion: [
        'Instalar una extensión anti-cryptomining (NoCoin, MinerBlock)',
        'Usar uBlock Origin con listas de filtros actualizadas',
        'Mantener el antivirus actualizado',
        'Revisar el uso de CPU antes y después de abrir páginas web',
      ],
      herramienta: 'Malwarebytes, extensión minerBlock para navegadores',
      ejemplos: ['Coinhive (inactivo)', 'XMRig', 'PowerGhost', 'WannaMine', 'BadShell'],
    },
    botnet: {
      nombre: 'Botnet',
      descripcion_corta: 'Convierte tu equipo en un "zombie" controlado remotamente para atacar a otros o enviar spam.',
      descripcion: 'Una botnet es una red de equipos infectados controlados mediante un servidor C2 (Command & Control). Las botnets modernas usan arquitecturas P2P o domain generation algorithms (DGA) para que el C2 sea resistente a takedowns. El botmaster puede enviar comandos firmados digitalmente a todos los bots simultáneamente: DDoS (UDP/SYN flood, HTTP flood), spam, credential stuffing, click fraud o distribución de payloads adicionales.',
      vector: 'Malware descargado, exploits de red, credenciales débiles en RDP/SSH, dispositivos IoT con contraseñas por defecto.',
      sintomas: [
        'Actividad de red intensa en horas de inactividad',
        'Equipo lento sin procesos aparentemente responsables',
        'Dirección IP incluida en listas negras antispam',
        'Proveedor de internet notifica abuso desde la IP',
        'Router con conexiones salientes masivas a IPs desconocidas',
      ],
      prevencion: [
        'Contraseñas fuertes y únicas, especialmente en router y servicios remotos',
        'Cambiar las credenciales por defecto de todos los dispositivos IoT',
        'Mantener el firmware del router actualizado',
        'Monitorizar el tráfico de red saliente con el firewall',
      ],
      herramienta: 'Microsoft Safety Scanner, ESET Online Scanner',
      ejemplos: ['Mirai (IoT)', 'Emotet', 'ZeuS / Zbot', 'Necurs', 'Cutwail', 'Kelihos'],
    },
    phishing: {
      nombre: 'Phishing',
      descripcion_corta: 'Engaña al usuario para que entregue voluntariamente credenciales o datos personales.',
      descripcion: 'El phishing moderno usa técnicas de evasión avanzadas: kits de phishing con proxy inverso (Evilginx2, Modlishka) que interceptan credenciales Y tokens 2FA en tiempo real, typosquatting de dominios registrados con Let\'s Encrypt (HTTPS válido), y homograph attacks usando caracteres Unicode visualmente idénticos (аpple.com con а cirílico). El spear phishing usa OSINT para personalizar el engaño con datos reales de la víctima.',
      vector: 'Correo electrónico masivo o dirigido (spear phishing), SMS (smishing), llamadas (vishing), redes sociales y apps de mensajería.',
      sintomas: [
        'URL con variaciones sutiles del original (paypa1.com, micros0ft.com)',
        'Certificado SSL inválido o de dominio diferente al mostrado',
        'Lenguaje de urgencia extrema: "Tu cuenta será bloqueada en 24h"',
        'Errores gramaticales o de traducción en el mensaje',
        'Remitente de correo con dominio sospechoso',
      ],
      prevencion: [
        'Verificar siempre la URL completa antes de introducir cualquier dato',
        'Activar la autenticación de dos factores resistente a phishing (FIDO2/passkey)',
        'Usar un gestor de contraseñas (no autocompleta en sitios falsos)',
        'No hacer clic en enlaces de correos no solicitados; ir directamente al sitio',
        'Habilitar la protección anti-phishing del navegador',
      ],
      herramienta: 'Google Safe Browsing, extensión Netcraft Anti-Phishing',
      ejemplos: ['Microsoft 365 Credential Harvesting', 'Emotet (distribución)', 'PayPal phishing', 'Business Email Compromise (BEC)'],
    },
  },

  /* ── ENGLISH ─────────────────────────────────────────────────────── */
  en: {
    ransomware: {
      nombre: 'Ransomware',
      descripcion_corta: 'Encrypts your files and demands a ransom payment to restore your access.',
      descripcion: 'Ransomware is one of the most devastating attacks today. After infecting the system, it encrypts documents, images, videos and databases using asymmetric cryptographic algorithms (RSA-2048 + AES-256). The attacker holds the private decryption key and demands payment—usually in cryptocurrencies like Bitcoin or Monero—in exchange for sending it. There is no guarantee of recovery even after paying.',
      vector: 'Emails with malicious attachments (Office macros), illegitimate download sites, unpatched network vulnerabilities (SMB/EternalBlue), RDP access with weak passwords.',
      sintomas: [
        'Files with unknown extensions (.locked, .encrypted, .enc)',
        'Ransom note on the desktop or in each folder',
        'Inability to open documents, photos or databases',
        'CPU at 100% during the encryption phase',
        'Changed or blank file icons',
      ],
      prevencion: [
        'Perform regular offline and cloud backups',
        'Keep the OS and applications up to date',
        'Do not open attachments from unsolicited emails',
        'Disable Office macros in corporate environments',
        'Use two-factor authentication for remote access',
      ],
      herramienta: 'No More Ransom (nomoreransom.org)',
      ejemplos: ['WannaCry', 'LockBit', 'REvil / Sodinokibi', 'Conti', 'Ryuk', 'BlackCat'],
    },
    rat: {
      nombre: 'Remote Access Trojan (RAT)',
      descripcion_corta: 'Allows an attacker to control your device remotely and completely silently.',
      descripcion: 'A RAT (Remote Access Trojan) disguises itself as legitimate software to trick the user. Once executed, it establishes a persistent connection to the attacker\'s server using encrypted protocols (HTTPS/TLS over 443) to evade firewalls. The attacker gains full control: real-time screen, file access, camera/microphone activation, keylogging and arbitrary command execution.',
      vector: 'Pirated software, email attachments disguised as documents, downloads from forums and P2P networks, social engineering.',
      sintomas: [
        'Unusual network activity, especially during idle hours',
        'Unknown processes running in the background',
        'Webcam indicator light turning on by itself',
        'Degraded device performance for no apparent reason',
        'Applications opening or closing on their own',
      ],
      prevencion: [
        'Download software only from official manufacturer sites',
        'Keep antivirus and firewall active and updated',
        'Cover the webcam when not in use',
        'Verify the digital signature of installers',
        'Regularly check active processes',
      ],
      herramienta: 'Malwarebytes, Windows Defender Offline Scan',
      ejemplos: ['Metasploit Meterpreter', 'DarkComet', 'NjRAT', 'AsyncRAT', 'QuasarRAT'],
    },
    spyware: {
      nombre: 'Spyware',
      descripcion_corta: 'Collects personal and browsing information without your knowledge and sends it to third parties.',
      descripcion: 'Spyware installs itself silently and continuously monitors user activity: browsing history, credentials entered via Win32 API hooking (SetWindowsHookEx), periodic screenshots via GDI/BitBlt, and even audio conversations. Data is compressed, encrypted and exfiltrated at regular intervals to C2 servers.',
      vector: 'Freeware with bundleware, malicious websites with browser exploits, phishing, fake browser extensions.',
      sintomas: [
        'Browser noticeably slower than usual',
        'Changes to home page or search engine without your input',
        'Hyper-personalized ads about recent conversations',
        'Battery draining faster than normal on laptops',
        'High background network data usage',
      ],
      prevencion: [
        'Read freeware installation steps carefully before accepting',
        'Use an ad and script blocker (uBlock Origin)',
        'Regularly review and clean browser extensions',
        'Use a password manager to detect compromised credentials',
      ],
      herramienta: 'Malwarebytes AdwCleaner, SUPERAntiSpyware',
      ejemplos: ['CoolWebSearch', 'FinFisher', 'Pegasus (government-grade)', 'Gator'],
    },
    adware: {
      nombre: 'Adware',
      descripcion_corta: 'Displays invasive advertising and can redirect your browser to malicious sites.',
      descripcion: 'Adware modifies the browser by installing unauthorized extensions, changing the default search engine through Group Policy (GPO), or modifying the hosts file. It injects JavaScript into every visited page to insert ads. Although its primary goal is to generate advertising revenue (pay-per-click), it can act as a dropper for more dangerous malware.',
      vector: 'Freeware installers with pre-checked extras, fake browser extensions, third-party download sites.',
      sintomas: [
        'Pop-up ads on pages that do not normally show them',
        'Search engine or home page changed without permission',
        'Unknown extensions or toolbars in the browser',
        'Redirects to ad sites when clicking links',
        'General browser slowness',
      ],
      prevencion: [
        'Always choose "Custom Installation" to deselect extras',
        'Download software only from the official developer site',
        'Use Unchecky to automatically deselect bundleware',
        'Review installed browser extensions monthly',
      ],
      herramienta: 'Malwarebytes AdwCleaner (free)',
      ejemplos: ['Superfish', 'Conduit', 'Babylon Toolbar', 'Ask Toolbar', 'OpenCandy'],
    },
    rootkit: {
      nombre: 'Rootkit',
      descripcion_corta: 'Hides in the deepest layers of the operating system to become completely undetectable.',
      descripcion: 'A rootkit operates at the most privileged levels of the system (Ring 0 / kernel). It uses techniques such as DKOM (Direct Kernel Object Manipulation) to unlink its process from the active process list, SSDT (System Service Descriptor Table) hooking to intercept system calls and filter results, or bootkits that infect the MBR/VBR to run before the OS. A firmware rootkit survives full reinstallations.',
      vector: 'Privilege escalation exploits, compromised installers (supply chain), physical access to the device.',
      sintomas: [
        'Security tools that suddenly stop working',
        'Discrepancies between what different system tools show',
        'Erratic and unpredictable operating system behavior',
        'Significantly slower boot time',
        'Files appearing and disappearing inexplicably',
      ],
      prevencion: [
        'Enable Secure Boot in BIOS/UEFI',
        'Keep firmware and drivers updated',
        'Do not install software from unverified sources',
        'Use Windows Trusted Boot',
        'Consider a full reinstallation if seriously suspected',
      ],
      herramienta: 'Kaspersky TDSSKiller, GMER, Microsoft Rootkit Revealer',
      ejemplos: ['Sony BMG rootkit', 'ZeroAccess', 'Necurs', 'Flame', 'Azazel', 'Avatar'],
    },
    gusano: {
      nombre: 'Network Worm',
      descripcion_corta: 'Spreads automatically across the network infecting other devices without user interaction.',
      descripcion: 'Worms exploit network vulnerabilities (buffer overflows, use-after-free in network protocols) to inject shellcode into remote processes without authentication. After compromising the target, they execute their payload (malware download, backdoor, ransomware) and repeat the scanning and exploitation cycle exponentially. Propagation can saturate entire networks within minutes.',
      vector: 'Unpatched network vulnerabilities (SMB, RDP), USB drives, services with weak passwords, shared network drives.',
      sintomas: [
        'Local network noticeably slow without apparent reason',
        'High CPU and network bandwidth usage while idle',
        'Massive outgoing connections to multiple IPs',
        'Other devices on the network reporting simultaneous issues',
        'Firewall logs with thousands of connection attempts',
      ],
      prevencion: [
        'Keep the system updated with the latest security patches',
        'Segment the network (VLANs) to limit propagation',
        'Disable unnecessary network services (SMBv1, Telnet)',
        'Use strong, unique passwords for network services',
        'Monitor network traffic for anomalies',
      ],
      herramienta: 'Microsoft Safety Scanner, Windows Malicious Software Removal Tool',
      ejemplos: ['WannaCry', 'Conficker', 'Blaster', 'Sasser', 'Slammer', 'Code Red'],
    },
    keylogger: {
      nombre: 'Keylogger',
      descripcion_corta: 'Records every keystroke, capturing passwords, private messages and banking data.',
      descripcion: 'Software keyloggers use the SetWindowsHookEx(WH_KEYBOARD_LL) API to record keystrokes globally, or GetAsyncKeyState() in polling mode to capture key state. More advanced variants inject a DLL into the browser process to directly capture form field content before TLS encryption (form grabbing). Hardware keyloggers are physical devices invisible to any detection software.',
      vector: 'Downloaded malicious software, phishing, physical access to the device (hardware keyloggers), trojans with an integrated keylogger component.',
      sintomas: [
        'Generally completely imperceptible to the user',
        'Suspicious network activity — periodic small data transmissions',
        'Compromised accounts despite not reusing passwords',
        'For hardware keyloggers: unknown device in the keyboard USB port',
      ],
      prevencion: [
        'Enable two-factor authentication on all accounts',
        'Use the system on-screen keyboard for banking on untrusted devices',
        'Physically inspect USB ports before using a public computer',
        'Use a password manager with autofill (resists keyboard keyloggers)',
      ],
      herramienta: 'Malwarebytes, SpyBot Search & Destroy',
      ejemplos: ['HawkEye', 'Snake Keylogger', 'Agent Tesla', 'Olympic Vision', 'Ardamax'],
    },
    cryptojacker: {
      nombre: 'Cryptojacker',
      descripcion_corta: 'Hijacks your processor\'s power to mine cryptocurrencies without your permission.',
      descripcion: 'Cryptojacking implements Proof-of-Work (PoW) algorithms—especially CryptoNight for Monero due to its ASIC resistance—using the CPU\'s AES-NI instructions to maximize hashrate. In browsers it uses WebAssembly (WASM) to run native-speed code. Operators use mining pools (stratum+tcp://) to aggregate hashrate from thousands of victims and distribute rewards.',
      vector: 'JavaScript scripts on compromised websites, browser extensions, downloaded malware, compromised Docker containers.',
      sintomas: [
        'CPU or GPU at 80–100% while browsing or at idle',
        'Extremely slow or laggy device',
        'Fans running at maximum speed continuously',
        'Battery draining in minutes on laptops',
        'Abnormally high electricity bills on servers',
      ],
      prevencion: [
        'Install an anti-cryptomining extension (NoCoin, MinerBlock)',
        'Use uBlock Origin with updated filter lists',
        'Keep antivirus updated',
        'Check CPU usage before and after opening web pages',
      ],
      herramienta: 'Malwarebytes, minerBlock browser extension',
      ejemplos: ['Coinhive (inactive)', 'XMRig', 'PowerGhost', 'WannaMine', 'BadShell'],
    },
    botnet: {
      nombre: 'Botnet',
      descripcion_corta: 'Turns your device into a remotely controlled "zombie" to attack others or send spam.',
      descripcion: 'A botnet is a network of infected devices controlled through a C2 (Command & Control) server. Modern botnets use P2P architectures or domain generation algorithms (DGA) to make the C2 resilient to takedowns. The botmaster can send digitally signed commands to all bots simultaneously: DDoS (UDP/SYN flood, HTTP flood), spam, credential stuffing, click fraud or distribution of additional payloads.',
      vector: 'Downloaded malware, network exploits, weak credentials on RDP/SSH, IoT devices with default passwords.',
      sintomas: [
        'Intense network activity during idle hours',
        'Slow device with no obviously responsible processes',
        'IP address included in antispam blacklists',
        'Internet provider notifying abuse from your IP',
        'Router with massive outgoing connections to unknown IPs',
      ],
      prevencion: [
        'Use strong and unique passwords, especially on router and remote services',
        'Change default credentials on all IoT devices',
        'Keep router firmware updated',
        'Monitor outbound network traffic with the firewall',
      ],
      herramienta: 'Microsoft Safety Scanner, ESET Online Scanner',
      ejemplos: ['Mirai (IoT)', 'Emotet', 'ZeuS / Zbot', 'Necurs', 'Cutwail', 'Kelihos'],
    },
    phishing: {
      nombre: 'Phishing',
      descripcion_corta: 'Tricks the user into voluntarily handing over credentials or personal data.',
      descripcion: 'Modern phishing uses advanced evasion techniques: reverse proxy phishing kits (Evilginx2, Modlishka) that intercept credentials AND 2FA tokens in real time, typosquatting of domains registered with Let\'s Encrypt (valid HTTPS), and homograph attacks using visually identical Unicode characters (аpple.com with Cyrillic а). Spear phishing uses OSINT to personalize the deception with real victim data.',
      vector: 'Mass or targeted email (spear phishing), SMS (smishing), phone calls (vishing), social networks and messaging apps.',
      sintomas: [
        'URL with subtle variations of the original (paypa1.com, micros0ft.com)',
        'Invalid SSL certificate or one for a different domain than displayed',
        'Extreme urgency language: "Your account will be blocked in 24h"',
        'Grammatical errors or mistranslations in the message',
        'Email sender with a suspicious domain',
      ],
      prevencion: [
        'Always verify the full URL before entering any data',
        'Enable phishing-resistant two-factor authentication (FIDO2/passkey)',
        'Use a password manager (will not autocomplete on fake sites)',
        'Do not click links in unsolicited emails; navigate directly to the site',
        'Enable the browser\'s built-in anti-phishing protection',
      ],
      herramienta: 'Google Safe Browsing, Netcraft Anti-Phishing extension',
      ejemplos: ['Microsoft 365 Credential Harvesting', 'Emotet (distribution)', 'PayPal phishing', 'Business Email Compromise (BEC)'],
    },
  },
};

// ── Estado del filtro de categoría y del buscador ─────────────────────────────
// filtroCategoria usa el sentinel '_todos_' (no vacío ni null) para distinguir
// "sin filtro activo" de un filtro que coincida con una categoría llamada "todos".
let filtroCategoria = '_todos_';
let filtroBusqueda  = '';    // Texto actual del input de búsqueda (en minúsculas se compara en amenazasFiltradas)

// ── Fusión base + idioma activo ───────────────────────────────────────────────
// Devuelve el array completo de amenazas combinando los campos técnicos de
// AMENAZAS_BASE con los textos del idioma activo de AMENAZAS_I18N.
// Object.assign({}, base, i18n[id]) crea un nuevo objeto en cada llamada,
// de modo que ni AMENAZAS_BASE ni AMENAZAS_I18N se mutan nunca.
function getAmenazas() {
  const lang = window.ESTICC_LANG || 'es';              // Idioma activo; 'es' como fallback seguro
  const i18n  = AMENAZAS_I18N[lang] || AMENAZAS_I18N.es; // Si el idioma no existe, caer a español
  return AMENAZAS_BASE.map(base => Object.assign({}, base, i18n[base.id] || {}));
  // i18n[base.id] || {} protege contra un id presente en base pero no en el idioma solicitado
}

// ── Render de chips de categoría ──────────────────────────────────────────────
// Los chips muestran la etiqueta traducida (t('enc.cat.Ransomware') etc.) pero
// almacenan la clave interna en data-cat para que el filtro funcione sin
// depender del idioma activo en el momento de comparación.
function renderChips() {
  const chipsEl = document.getElementById('enc-chips');
  if (!chipsEl) return;  // Salida segura si el panel no está montado aún

  // Extrae categorías únicas del array ya fusionado (en el idioma activo)
  const categorias = [...new Set(getAmenazas().map(a => a.categoria))];

  // Construye el HTML: primer chip siempre es "Todos/All" con sentinel '_todos_'
  chipsEl.innerHTML = [
    `<button class="enc-chip${filtroCategoria === '_todos_' ? ' activo' : ''}" data-cat="_todos_">${t('enc.cat_todos')}</button>`,
    ...categorias.map(c =>
      // c es la clave interna (p.ej. 'Troyanos'); t() la traduce al idioma activo
      `<button class="enc-chip${filtroCategoria === c ? ' activo' : ''}" data-cat="${c}">${t('enc.cat.' + c)}</button>`
    ),
  ].join('');

  // Adjunta listeners tras reconstruir el DOM; los listeners previos se eliminan
  // automáticamente al sobrescribir innerHTML
  chipsEl.querySelectorAll('.enc-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      filtroCategoria = chip.dataset.cat;  // Actualiza el filtro con la clave interna del chip
      // Quita 'activo' de todos y lo pone solo en el chip pulsado
      chipsEl.querySelectorAll('.enc-chip').forEach(c => c.classList.remove('activo'));
      chip.classList.add('activo');
      renderGrid();  // Re-renderiza la grid con el nuevo filtro
    });
  });
}

// ── Filtrado de amenazas ──────────────────────────────────────────────────────
// Aplica simultáneamente el filtro de categoría y la búsqueda de texto libre.
// La búsqueda inspecciona todos los campos de texto de la amenaza, incluyendo
// MITRE, IOCs y CVEs para que un analista pueda buscar "T1486" o "EternalBlue".
function amenazasFiltradas() {
  return getAmenazas().filter(a => {
    // Comprueba si la amenaza pertenece a la categoría seleccionada
    const matchCat = filtroCategoria === '_todos_' || a.categoria === filtroCategoria;

    const q = filtroBusqueda.toLowerCase();  // Normaliza el término de búsqueda
    const matchBusq = !q || [               // Si q está vacío, todas coinciden
      a.nombre, a.categoria, a.descripcion_corta, a.vector,
      ...(a.sintomas   || []),              // Guarda nula por si algún lang/entry está incompleto
      ...(a.prevencion || []),
      ...(a.ejemplos   || []),
      ...(a.iocs       || []),
      ...(a.cves       || []),
      ...(a.mitre      || []).map(m => `${m.id} ${m.nombre}`), // "T1486 Data Encrypted for Impact"
    ].some(text => text.toLowerCase().includes(q));  // Basta con que un campo contenga el término

    return matchCat && matchBusq;  // Ambos filtros deben satisfacerse
  });
}

// ── Render de la grid de tarjetas ─────────────────────────────────────────────
// Genera el HTML de todas las tarjetas filtradas y lo inyecta en #enc-grid.
// En modo avanzado (body.modo-avanzado) se muestran bloques adicionales de
// MITRE, IOCs, CVEs y ejemplos mediante la clase enc-avanzado-extra.
function renderGrid() {
  const grid = document.getElementById('enc-grid');
  if (!grid) return;  // Panel aún no visible en el DOM

  const lista = amenazasFiltradas();

  // Estado vacío: sin resultados para el criterio actual
  if (!lista.length) {
    grid.innerHTML = `<div class="enc-sin-resultados">${t('enc.sin_resultados')}</div>`;
    return;
  }

  grid.innerHTML = lista.map(a => `
    <div class="enc-card" data-id="${a.id}" role="button" tabindex="0">
      <div class="enc-card-top">
        <span class="enc-icono">${a.icono}</span>
        <div class="enc-badges">
          <!-- t('enc.peligro.critico') → 'CRÍTICO' o 'CRITICAL' según idioma -->
          <span class="enc-peligro ${a.peligro}">${t('enc.peligro.' + a.peligro)}</span>
          <!-- Categoría traducida al idioma activo -->
          <span class="enc-categoria-tag">${t('enc.cat.' + a.categoria)}</span>
        </div>
      </div>
      <p class="enc-nombre">${a.nombre}</p>
      <p class="enc-desc-corta">${a.descripcion_corta}</p>

      <!-- Bloque técnico: solo visible en modo avanzado via CSS (.enc-avanzado-extra) -->
      <div class="enc-avanzado-extra">
        <div class="enc-tecnico-bloque">
          <!-- Cabecera fija en inglés: nomenclatura oficial de MITRE -->
          <div class="enc-tecnico-label">MITRE ATT&amp;CK</div>
          <div class="enc-mitre-tags">
            <!-- title muestra el nombre completo al hacer hover sobre el tag corto -->
            ${(a.mitre || []).map(m =>
              `<span class="enc-mitre-tag" title="${m.nombre}">${m.id}</span>`
            ).join('')}
          </div>
        </div>
        <div class="enc-tecnico-bloque">
          <!-- Título traducible: "IOCs destacados" / "Notable IOCs" -->
          <div class="enc-tecnico-label">${t('enc.iocs_titulo')}</div>
          <div class="enc-ioc-lista">
            <!-- Solo los 2 primeros IOCs para no saturar la tarjeta; el modal muestra todos -->
            ${(a.iocs || []).slice(0, 2).map(ioc =>
              `<div class="enc-ioc">${ioc}</div>`
            ).join('')}
          </div>
        </div>
        <!-- Bloque CVEs: solo se renderiza si la amenaza tiene CVEs asociados -->
        ${a.cves?.length ? `
        <div class="enc-tecnico-bloque">
          <div class="enc-tecnico-label">${t('enc.cves_titulo')}</div>
          <div class="enc-cve-lista">
            <!-- Solo el identificador CVE-XXXX-XXXX, sin la descripción extra -->
            ${a.cves.map(c => `<span class="enc-cve-tag">${c.split(' ')[0]}</span>`).join('')}
          </div>
        </div>` : ''}
        <div class="enc-tecnico-bloque">
          <div class="enc-tecnico-label">${t('enc.ejemplos_titulo')}</div>
          <div class="enc-ejemplos">
            ${(a.ejemplos || []).map(e => `<span class="enc-ejemplo-tag">${e}</span>`).join('')}
          </div>
        </div>
      </div>

      <!-- Pie de tarjeta: texto traducido del CTA -->
      <div class="enc-card-footer">${t('enc.ver_ficha')}</div>
    </div>`).join('');

  // Adjunta eventos de apertura del modal a cada tarjeta generada
  grid.querySelectorAll('.enc-card').forEach(card => {
    card.addEventListener('click', () => abrirModal(card.dataset.id));
    // Accesibilidad: permite abrir el modal con teclado (Enter sobre la tarjeta)
    card.addEventListener('keydown', e => { if (e.key === 'Enter') abrirModal(card.dataset.id); });
  });
}

// ── Modal de detalle ──────────────────────────────────────────────────────────
// Rellena y muestra el modal completo para la amenaza con el id dado.
// Los headings del modal (h3) se actualizan en cada apertura para garantizar
// que reflejen el idioma activo aunque el usuario haya cambiado de idioma
// mientras el modal estaba cerrado.
function abrirModal(id) {
  // Busca la amenaza en el array fusionado con el idioma activo actual
  const a = getAmenazas().find(x => x.id === id);
  if (!a) return;  // Defensa: id inválido (no debería ocurrir en uso normal)

  // ── Cabecera del modal ────────────────────────────────────────────────
  document.getElementById('enc-modal-icono').textContent   = a.icono;
  document.getElementById('enc-modal-titulo').textContent  = a.nombre;
  // Subtítulo: badge de peligro + etiqueta de categoría, ambos traducidos
  document.getElementById('enc-modal-subtitulo').innerHTML =
    `<span class="enc-peligro ${a.peligro}" style="margin-right:6px;">${t('enc.peligro.' + a.peligro)}</span>${t('enc.cat.' + a.categoria)}`;

  // ── Cuerpo del modal ──────────────────────────────────────────────────
  document.getElementById('enc-modal-descripcion').textContent = a.descripcion;
  document.getElementById('enc-modal-vector').textContent      = a.vector;

  document.getElementById('enc-modal-sintomas').innerHTML =
    (a.sintomas || []).map(s => `<li>${s}</li>`).join('');

  document.getElementById('enc-modal-prevencion').innerHTML =
    (a.prevencion || []).map(p => `<li>${p}</li>`).join('');

  document.getElementById('enc-modal-ejemplos').innerHTML =
    (a.ejemplos || []).map(e => `<span class="enc-ejemplo-modal">${e}</span>`).join('');

  // Prefijo de herramienta con emoji de llave inglesa para distinción visual
  document.getElementById('enc-modal-herramienta').textContent = `🛠️ ${a.herramienta}`;

  // ── Sección técnica (modo avanzado) ──────────────────────────────────
  // MITRE: cada técnica en una fila con el tag corto (T1486) + nombre largo
  document.getElementById('enc-modal-mitre').innerHTML =
    (a.mitre || []).map(m =>
      `<div class="enc-modal-mitre-row">
        <span class="enc-mitre-tag">${m.id}</span>
        <span class="enc-modal-mitre-nombre">${m.nombre}</span>
      </div>`
    ).join('');

  // IOCs en lista; font monospace aplicada vía CSS en enc-modal-iocs
  document.getElementById('enc-modal-iocs').innerHTML =
    (a.iocs || []).map(ioc => `<li>${ioc}</li>`).join('');

  // Sección CVEs: se oculta completamente si la amenaza no tiene CVEs documentados
  const cveSec = document.getElementById('enc-modal-cve-seccion');
  if (a.cves?.length) {
    document.getElementById('enc-modal-cves').innerHTML =
      a.cves.map(c => `<div class="enc-modal-cve">${c}</div>`).join('');
    cveSec.style.display = '';  // Restaura display por defecto (block)
  } else {
    cveSec.style.display = 'none';
  }

  // ── Headings del modal (traducibles) ─────────────────────────────────
  // Se actualizan al abrir el modal (no en applyTranslations) porque el modal
  // normalmente está oculto: actualizarlo a ciegas cada vez que cambia el idioma
  // sería trabajo innecesario, y hacerlo aquí garantiza que siempre sea correcto.
  const headings = {
    'enc-modal-h-que-es':     'enc.modal_que_es',
    'enc-modal-h-vector':     'enc.modal_vector',
    'enc-modal-h-sintomas':   'enc.modal_sintomas',
    'enc-modal-h-prevencion': 'enc.modal_prevencion',
    'enc-modal-h-ejemplos':   'enc.modal_ejemplos',
    'enc-modal-h-herramienta':'enc.modal_herramienta',
    'enc-modal-h-mitre':      'enc.modal_mitre',
    'enc-modal-h-iocs':       'enc.modal_iocs',
    'enc-modal-h-cves':       'enc.modal_cves',
    'enc-modal-h-tecnico':    'enc.modal_tecnico',
  };
  // Itera el mapa y actualiza cada heading; el ||{} protege contra IDs ausentes
  Object.entries(headings).forEach(([elId, key]) => {
    const el = document.getElementById(elId);
    if (el) el.textContent = t(key);
  });

  // Muestra el overlay y bloquea el scroll del body mientras el modal está abierto
  document.getElementById('enc-modal-overlay').classList.add('visible');
  document.body.style.overflow = 'hidden';
}

// ── Cierre del modal ──────────────────────────────────────────────────────────
function cerrarModal() {
  document.getElementById('enc-modal-overlay').classList.remove('visible');
  document.body.style.overflow = '';  // Restaura el scroll del body
}

// ── Refresco al cambiar idioma ────────────────────────────────────────────────
// Expuesto como window.refreshEnciclopedia para que applyTranslations() (i18n.js)
// lo invoque cada vez que el usuario cambia de idioma en Configuración.
// Re-renderiza chips, buscador y grid con los textos del nuevo idioma activo.
window.refreshEnciclopedia = function () {
  const buscarEl = document.getElementById('enc-buscar');
  // Actualiza el placeholder del input de búsqueda con el texto traducido
  if (buscarEl) buscarEl.placeholder = t('enc.buscar_placeholder');
  renderChips();  // Reconstruye los chips con las etiquetas de categoría traducidas
  renderGrid();   // Re-renderiza todas las tarjetas con los textos del nuevo idioma
};

// ── Inicialización ────────────────────────────────────────────────────────────
// Se ejecuta una sola vez al cargar el DOM; registra listeners permanentes
// (buscador, cerrar modal, tecla Escape) y hace el primer render.
document.addEventListener('DOMContentLoaded', () => {
  const buscarEl = document.getElementById('enc-buscar');
  if (buscarEl) {
    // Placeholder inicial en el idioma cargado (es por defecto)
    buscarEl.placeholder = t('enc.buscar_placeholder');
    // Listener de escritura: actualiza filtroBusqueda y re-renderiza en tiempo real
    buscarEl.addEventListener('input', e => {
      filtroBusqueda = e.target.value;
      renderGrid();
    });
  }

  // Botón × del modal
  document.getElementById('enc-modal-cerrar').addEventListener('click', cerrarModal);

  // Clic fuera del modal (en el overlay semitransparente) también lo cierra
  document.getElementById('enc-modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) cerrarModal();  // Solo si el clic fue en el overlay, no en el modal
  });

  // Tecla Escape cierra el modal desde cualquier foco en la página
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') cerrarModal();
  });

  // Render inicial: chips + grid en el idioma por defecto
  renderChips();
  renderGrid();
});
