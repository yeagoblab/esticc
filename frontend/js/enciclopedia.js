/**
 * enciclopedia.js — Enciclopedia de Malware Interactiva
 * Panel educativo con categorías, buscador en tiempo real y modal de detalle.
 * Modo avanzado: técnicas MITRE ATT&CK, IOCs e CVEs para analistas.
 */

// ── Base de datos de amenazas ─────────────────────────────────────────────────

const AMENAZAS = [
  {
    id: 'ransomware',
    nombre: 'Ransomware',
    categoria: 'Ransomware',
    icono: '🔒',
    peligro: 'critico',
    descripcion_corta: 'Cifra tus archivos y exige un rescate económico para devolverte el acceso.',
    descripcion: 'El ransomware es uno de los ataques más devastadores de la actualidad. Tras infectar el sistema, cifra documentos, imágenes, vídeos y bases de datos usando algoritmos de criptografía asimétrica (RSA-2048 + AES-256). El atacante posee la clave privada de descifrado y exige un pago —generalmente en criptomonedas como Bitcoin o Monero— a cambio de enviarla. No hay garantía de recuperación incluso pagando.',
    vector: 'Correos con adjuntos maliciosos (macros de Office), sitios de descarga ilegítimos, vulnerabilidades de red sin parchear (SMB/EternalBlue), acceso RDP con contraseñas débiles.',
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
    sintomas: [
      'Archivos con extensiones desconocidas (.locked, .encrypted, .enc)',
      'Nota de rescate en el escritorio o en cada carpeta',
      'Imposibilidad de abrir documentos, fotos o bases de datos',
      'CPU al 100% durante la fase de cifrado',
      'Iconos de archivo cambiados o en blanco',
    ],
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
  {
    id: 'rat',
    nombre: 'Troyano de Acceso Remoto (RAT)',
    categoria: 'Troyanos',
    icono: '🎭',
    peligro: 'critico',
    descripcion_corta: 'Permite a un atacante controlar tu equipo de forma remota y completamente silenciosa.',
    descripcion: 'Un RAT (Remote Access Trojan) se disfraza de software legítimo para engañar al usuario. Una vez ejecutado, establece una conexión persistente con el servidor del atacante usando protocolos cifrados (HTTPS/TLS sobre 443) para evadir firewalls. El atacante obtiene control total: pantalla en tiempo real, acceso a archivos, activación de cámara/micrófono, registro de teclado y ejecución de comandos arbitrarios.',
    vector: 'Software pirata, adjuntos de correo disfrazados de documentos, descargas de foros y redes P2P, ingeniería social.',
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
  {
    id: 'spyware',
    nombre: 'Spyware',
    categoria: 'Spyware',
    icono: '👁️',
    peligro: 'alto',
    descripcion_corta: 'Recopila información personal y de navegación sin tu conocimiento y la envía a terceros.',
    descripcion: 'El spyware se instala de forma sigilosa y monitoriza la actividad del usuario de manera continuada: historial de navegación, credenciales introducidas mediante hooking de APIs Win32 (SetWindowsHookEx), capturas de pantalla periódicas mediante GDI/BitBlt y hasta conversaciones de audio. Los datos se comprimen, cifran y exfiltran en intervalos regulares hacia servidores C2.',
    vector: 'Software gratuito con bundleware, sitios web maliciosos con exploits de navegador, phishing, extensiones de navegador falsas.',
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
  {
    id: 'adware',
    nombre: 'Adware',
    categoria: 'Adware',
    icono: '📢',
    peligro: 'medio',
    descripcion_corta: 'Muestra publicidad invasiva y puede redirigir el navegador a sitios maliciosos.',
    descripcion: 'El adware modifica el navegador instalando extensiones no autorizadas, cambiando el motor de búsqueda predeterminado a través de políticas de grupo (GPO) o modificando el archivo hosts. Inyecta JavaScript en cada página visitada para insertar anuncios. Aunque su objetivo principal es generar ingresos publicitarios (pay-per-click), puede actuar como dropper de malware más peligroso.',
    vector: 'Instaladores de software gratuito con casillas preseleccionadas, extensiones de navegador falsas, sitios de descarga de terceros.',
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
    cves: [],
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
  {
    id: 'rootkit',
    nombre: 'Rootkit',
    categoria: 'Rootkits',
    icono: '🕳️',
    peligro: 'critico',
    descripcion_corta: 'Se oculta en las capas más profundas del sistema operativo para ser completamente indetectable.',
    descripcion: 'Un rootkit opera en los niveles más privilegiados del sistema (Ring 0 / kernel). Utiliza técnicas como DKOM (Direct Kernel Object Manipulation) para desvincular su proceso de la lista de procesos activos, hooking de SSDT (System Service Descriptor Table) para interceptar llamadas al sistema y filtrar resultados, o bootkits que infectan el MBR/VBR para ejecutarse antes que el sistema operativo. Un rootkit de firmware sobrevive a reinstalaciones.',
    vector: 'Exploits de escalada de privilegios (privilege escalation), instaladores comprometidos (supply chain), acceso físico al equipo.',
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
  {
    id: 'gusano',
    nombre: 'Gusano de Red',
    categoria: 'Gusanos',
    icono: '🐛',
    peligro: 'alto',
    descripcion_corta: 'Se propaga automáticamente por la red infectando otros equipos sin intervención del usuario.',
    descripcion: 'Los gusanos explotan vulnerabilidades de red (buffer overflows, use-after-free en protocolos de red) para inyectar shellcode en procesos remotos sin autenticación. Tras comprometer el objetivo, ejecutan su payload (descarga de malware, backdoor, ransomware) y repiten el ciclo de escáneo y explotación de forma exponencial. La propagación puede saturar redes enteras en minutos.',
    vector: 'Vulnerabilidades de red sin parchear (SMB, RDP), dispositivos USB, servicios con contraseñas débiles, redes compartidas.',
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
  {
    id: 'keylogger',
    nombre: 'Keylogger',
    categoria: 'Keyloggers',
    icono: '⌨️',
    peligro: 'alto',
    descripcion_corta: 'Registra cada tecla pulsada capturando contraseñas, mensajes privados y datos bancarios.',
    descripcion: 'Los keyloggers de software usan la API SetWindowsHookEx(WH_KEYBOARD_LL) para registrar pulsaciones globalmente, o GetAsyncKeyState() en polling para capturar estado de teclas. Las variantes más avanzadas inyectan una DLL en el proceso del navegador para capturar directamente el contenido de campos de formulario antes del cifrado TLS (form grabbing). Los keyloggers hardware son dispositivos físicos invisibles para cualquier software de detección.',
    vector: 'Software malicioso descargado, phishing, acceso físico al equipo (keyloggers hardware), troyanos con componente keylogger integrado.',
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
  {
    id: 'cryptojacker',
    nombre: 'Cryptojacker',
    categoria: 'Cryptojackers',
    icono: '⛏️',
    peligro: 'medio',
    descripcion_corta: 'Secuestra la potencia de tu procesador para minar criptomonedas sin tu permiso.',
    descripcion: 'El cryptojacking implementa algoritmos Proof-of-Work (PoW) —especialmente CryptoNight para Monero por su resistencia a ASICs— usando las instrucciones AES-NI del procesador para maximizar el hashrate. En navegadores usa WebAssembly (WASM) para ejecutar código nativo a velocidades cercanas a las nativas. Los operadores usan pools de minería (stratum+tcp://) para agregar el hashrate de miles de víctimas y repartir recompensas.',
    vector: 'Scripts JavaScript en páginas web comprometidas, extensiones de navegador, malware descargado, contenedores Docker comprometidos.',
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
  {
    id: 'botnet',
    nombre: 'Botnet',
    categoria: 'Botnets',
    icono: '🤖',
    peligro: 'alto',
    descripcion_corta: 'Convierte tu equipo en un "zombie" controlado remotamente para atacar a otros o enviar spam.',
    descripcion: 'Una botnet es una red de equipos infectados controlados mediante un servidor C2 (Command & Control). Las botnets modernas usan arquitecturas P2P o domain generation algorithms (DGA) para que el C2 sea resistente a takedowns. El botmaster puede enviar comandos firmados digitalmente a todos los bots simultáneamente: DDoS (UDP/SYN flood, HTTP flood), spam, credential stuffing, click fraud o distribución de payloads adicionales.',
    vector: 'Malware descargado, exploits de red, credenciales débiles en RDP/SSH, dispositivos IoT con contraseñas por defecto.',
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
  {
    id: 'phishing',
    nombre: 'Phishing',
    categoria: 'Vectores',
    icono: '🎣',
    peligro: 'alto',
    descripcion_corta: 'Engaña al usuario para que entregue voluntariamente credenciales o datos personales.',
    descripcion: 'El phishing moderno usa técnicas de evasión avanzadas: kits de phishing con proxy inverso (Evilginx2, Modlishka) que interceptan credenciales Y tokens 2FA en tiempo real, typosquatting de dominios registrados con Let\'s Encrypt (HTTPS válido), y homograph attacks usando caracteres Unicode visualmente idénticos (аpple.com con а cirílico). El spear phishing usa OSINT para personalizar el engaño con datos reales de la víctima.',
    vector: 'Correo electrónico masivo o dirigido (spear phishing), SMS (smishing), llamadas (vishing), redes sociales y apps de mensajería.',
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
];

// ── Estado del filtro ─────────────────────────────────────────────────────────

let filtroCategoria = 'Todos';
let filtroBusqueda  = '';

// ── Render de la grid ─────────────────────────────────────────────────────────

function amenazasFiltradas() {
  return AMENAZAS.filter(a => {
    const matchCat = filtroCategoria === 'Todos' || a.categoria === filtroCategoria;
    const q = filtroBusqueda.toLowerCase();
    const matchBusq = !q || [
      a.nombre, a.categoria, a.descripcion_corta, a.vector,
      ...a.sintomas, ...a.prevencion, ...a.ejemplos,
      ...(a.iocs || []),
      ...(a.cves || []),
      ...(a.mitre || []).map(m => `${m.id} ${m.nombre}`),
    ].some(t => t.toLowerCase().includes(q));
    return matchCat && matchBusq;
  });
}

function renderGrid() {
  const grid = document.getElementById('enc-grid');
  const lista = amenazasFiltradas();

  if (!lista.length) {
    grid.innerHTML = '<div class="enc-sin-resultados">No se encontraron amenazas con ese criterio.</div>';
    return;
  }

  grid.innerHTML = lista.map(a => `
    <div class="enc-card" data-id="${a.id}" role="button" tabindex="0">
      <div class="enc-card-top">
        <span class="enc-icono">${a.icono}</span>
        <div class="enc-badges">
          <span class="enc-peligro ${a.peligro}">${a.peligro.toUpperCase()}</span>
          <span class="enc-categoria-tag">${a.categoria}</span>
        </div>
      </div>
      <p class="enc-nombre">${a.nombre}</p>
      <p class="enc-desc-corta">${a.descripcion_corta}</p>

      <div class="enc-avanzado-extra">
        <div class="enc-tecnico-bloque">
          <div class="enc-tecnico-label">MITRE ATT&CK</div>
          <div class="enc-mitre-tags">
            ${(a.mitre || []).map(m =>
              `<span class="enc-mitre-tag" title="${m.nombre}">${m.id}</span>`
            ).join('')}
          </div>
        </div>
        <div class="enc-tecnico-bloque">
          <div class="enc-tecnico-label">IOCs destacados</div>
          <div class="enc-ioc-lista">
            ${(a.iocs || []).slice(0, 2).map(ioc =>
              `<div class="enc-ioc">${ioc}</div>`
            ).join('')}
          </div>
        </div>
        ${a.cves?.length ? `
        <div class="enc-tecnico-bloque">
          <div class="enc-tecnico-label">CVEs asociados</div>
          <div class="enc-cve-lista">
            ${a.cves.map(c => `<span class="enc-cve-tag">${c.split(' ')[0]}</span>`).join('')}
          </div>
        </div>` : ''}
        <div class="enc-tecnico-bloque">
          <div class="enc-tecnico-label">Ejemplos conocidos</div>
          <div class="enc-ejemplos">
            ${a.ejemplos.map(e => `<span class="enc-ejemplo-tag">${e}</span>`).join('')}
          </div>
        </div>
      </div>

      <div class="enc-card-footer">Ver ficha completa →</div>
    </div>`).join('');

  grid.querySelectorAll('.enc-card').forEach(card => {
    card.addEventListener('click', () => abrirModal(card.dataset.id));
    card.addEventListener('keydown', e => { if (e.key === 'Enter') abrirModal(card.dataset.id); });
  });
}

// ── Modal de detalle ──────────────────────────────────────────────────────────

function abrirModal(id) {
  const a = AMENAZAS.find(x => x.id === id);
  if (!a) return;

  document.getElementById('enc-modal-icono').textContent   = a.icono;
  document.getElementById('enc-modal-titulo').textContent  = a.nombre;
  document.getElementById('enc-modal-subtitulo').innerHTML =
    `<span class="enc-peligro ${a.peligro}" style="margin-right:6px;">${a.peligro.toUpperCase()}</span>${a.categoria}`;

  document.getElementById('enc-modal-descripcion').textContent = a.descripcion;
  document.getElementById('enc-modal-vector').textContent      = a.vector;

  document.getElementById('enc-modal-sintomas').innerHTML =
    a.sintomas.map(s => `<li>${s}</li>`).join('');

  document.getElementById('enc-modal-prevencion').innerHTML =
    a.prevencion.map(p => `<li>${p}</li>`).join('');

  document.getElementById('enc-modal-ejemplos').innerHTML =
    a.ejemplos.map(e => `<span class="enc-ejemplo-modal">${e}</span>`).join('');

  document.getElementById('enc-modal-herramienta').textContent = `🛠️ ${a.herramienta}`;

  // Sección técnica
  document.getElementById('enc-modal-mitre').innerHTML =
    (a.mitre || []).map(m =>
      `<div class="enc-modal-mitre-row">
        <span class="enc-mitre-tag">${m.id}</span>
        <span class="enc-modal-mitre-nombre">${m.nombre}</span>
      </div>`
    ).join('');

  document.getElementById('enc-modal-iocs').innerHTML =
    (a.iocs || []).map(ioc => `<li>${ioc}</li>`).join('');

  const cveSec = document.getElementById('enc-modal-cve-seccion');
  if (a.cves?.length) {
    document.getElementById('enc-modal-cves').innerHTML =
      a.cves.map(c => `<div class="enc-modal-cve">${c}</div>`).join('');
    cveSec.style.display = '';
  } else {
    cveSec.style.display = 'none';
  }

  document.getElementById('enc-modal-overlay').classList.add('visible');
  document.body.style.overflow = 'hidden';
}

function cerrarModal() {
  document.getElementById('enc-modal-overlay').classList.remove('visible');
  document.body.style.overflow = '';
}

// ── Inicialización ────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const categorias = ['Todos', ...new Set(AMENAZAS.map(a => a.categoria))];
  const chipsEl    = document.getElementById('enc-chips');

  chipsEl.innerHTML = categorias.map(c =>
    `<button class="enc-chip${c === 'Todos' ? ' activo' : ''}" data-cat="${c}">${c}</button>`
  ).join('');

  chipsEl.querySelectorAll('.enc-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      filtroCategoria = chip.dataset.cat;
      chipsEl.querySelectorAll('.enc-chip').forEach(c => c.classList.remove('activo'));
      chip.classList.add('activo');
      renderGrid();
    });
  });

  document.getElementById('enc-buscar').addEventListener('input', e => {
    filtroBusqueda = e.target.value;
    renderGrid();
  });

  document.getElementById('enc-modal-cerrar').addEventListener('click', cerrarModal);
  document.getElementById('enc-modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) cerrarModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') cerrarModal();
  });

  renderGrid();
});
