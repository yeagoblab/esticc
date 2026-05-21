/**
 * enciclopedia.js — Enciclopedia de Malware Interactiva
 * Panel educativo con categorías, buscador en tiempo real y modal de detalle.
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
    descripcion: 'El ransomware es uno de los ataques más devastadores de la actualidad. Tras infectar el sistema, cifra documentos, imágenes, vídeos y bases de datos usando algoritmos de criptografía asimétrica (RSA + AES). El atacante posee la clave privada de descifrado y exige un pago —generalmente en criptomonedas como Bitcoin o Monero— a cambio de enviarla. No hay garantía de recuperación incluso pagando.',
    vector: 'Correos con adjuntos maliciosos (macros de Office), sitios de descarga ilegítimos, vulnerabilidades de red sin parchear (SMB), acceso RDP con contraseñas débiles.',
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
    descripcion: 'Un RAT (Remote Access Trojan) se disfraza de software legítimo (juego, herramienta, PDF) para engañar al usuario y que lo instale voluntariamente. Una vez ejecutado, establece una conexión persistente con el servidor del atacante y le otorga control total: puede ver la pantalla en tiempo real, acceder a archivos, activar la cámara y el micrófono, registrar pulsaciones de teclado y descargar malware adicional.',
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
  {
    id: 'spyware',
    nombre: 'Spyware',
    categoria: 'Spyware',
    icono: '👁️',
    peligro: 'alto',
    descripcion_corta: 'Recopila información personal y de navegación sin tu conocimiento y la envía a terceros.',
    descripcion: 'El spyware se instala de forma sigilosa y monitoriza la actividad del usuario de manera continuada: historial de navegación, credenciales introducidas, correos electrónicos, capturas de pantalla periódicas y hasta conversaciones. Los datos recopilados se envían cifrados a servidores externos y pueden usarse para robo de identidad, chantaje o ser vendidos a anunciantes y actores maliciosos.',
    vector: 'Software gratuito con bundleware (programas que vienen "de regalo"), sitios web maliciosos con exploits de navegador, phishing, extensiones de navegador falsas.',
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
      'Usar un gestor de contraseñas para detectar si las credenciales han sido comprometidas',
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
    descripcion: 'El adware (Advertising-supported software) se instala normalmente junto a software gratuito mediante instaladores que incluyen programas adicionales de forma predeterminada. Modifica el navegador (cambia la página de inicio, el motor de búsqueda y añade extensiones) para inyectar anuncios en todas las páginas web visitadas. Aunque su objetivo principal es generar ingresos publicitarios, puede actuar como vector de entrada para malware más peligroso.',
    vector: 'Instaladores de software gratuito (freeware) con casillas de instalación adicional preseleccionadas, extensiones de navegador falsas, sitios de descarga de terceros.',
    sintomas: [
      'Anuncios emergentes (pop-ups) en páginas que no los muestran normalmente',
      'Motor de búsqueda o página de inicio cambiados sin permiso',
      'Extensiones o barras de herramientas desconocidas en el navegador',
      'Redirecciones a sitios publicitarios al hacer clic en enlaces',
      'Lentitud general del navegador',
    ],
    prevencion: [
      'Elegir siempre "Instalación personalizada" para deseleccionar programas extra',
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
    descripcion: 'Un rootkit opera en los niveles más privilegiados del sistema (kernel, hipervisor o firmware). Modifica el propio sistema operativo para ocultar su presencia: esconde procesos, archivos, conexiones de red y entradas del registro de cualquier herramienta de análisis convencional. Un rootkit de nivel kernel tiene más privilegios que cualquier antivirus, lo que lo hace extremadamente difícil de detectar y eliminar. En casos de rootkits de firmware, puede sobrevivir incluso a la reinstalación del sistema operativo.',
    vector: 'Exploits de escalada de privilegios (privilege escalation), instaladores de software comprometidos (supply chain attack), acceso físico al equipo.',
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
    descripcion: 'A diferencia de los virus, los gusanos no necesitan un archivo huésped ni que el usuario ejecute nada. Explotan vulnerabilidades de red (protocolos SMB, RDP, SSH) para copiarse de forma autónoma de un equipo a otro dentro de la misma red o por internet. Pueden saturar el ancho de banda, instalar backdoors, descargar ransomware u otro malware. Su capacidad de propagación exponencial los hace especialmente peligrosos en redes corporativas.',
    vector: 'Vulnerabilidades de red sin parchear (SMB, EternalBlue), dispositivos USB, servicios con contraseñas débiles (RDP, SSH), redes compartidas.',
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
    descripcion: 'Un keylogger intercepta y registra todas las pulsaciones de teclado del usuario. Puede operar como driver del teclado a nivel de sistema operativo o inyectar código en los procesos del navegador para capturar los campos de formulario. Los registros se almacenan localmente o se envían en tiempo real al atacante. Existen también versiones hardware (un pequeño dispositivo que se conecta entre el teclado y el PC) que son totalmente invisibles para el software.',
    vector: 'Software malicioso descargado, phishing, acceso físico al equipo (keyloggers hardware), malware de tipo troyano que incluye componente keylogger.',
    sintomas: [
      'Generalmente completamente imperceptible para el usuario',
      'Actividad de red sospechosa (envíos periódicos de datos)',
      'Cuentas comprometidas a pesar de no reutilizar contraseñas',
      'En keyloggers hardware: pequeño dispositivo desconocido en el puerto USB del teclado',
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
    descripcion: 'El cryptojacking usa los recursos computacionales de la víctima (CPU y GPU) para resolver los algoritmos matemáticos del minado de criptomonedas, especialmente Monero (XMR) por su resistencia al rastreo. El beneficio económico va al atacante; la víctima sufre degradación del rendimiento, mayor consumo eléctrico y desgaste acelerado del hardware. Puede ejecutarse en el navegador (in-browser mining mediante JavaScript) sin instalar nada, o como malware residente.',
    vector: 'Scripts JavaScript en páginas web comprometidas o maliciosas, extensiones de navegador, malware descargado, contenedores Docker comprometidos en servidores.',
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
    descripcion: 'Una botnet es una red de equipos infectados (bots o zombies) controlados de forma centralizada por un operador (botmaster) a través de un servidor de Comando y Control (C2). El usuario infectado generalmente no nota nada. El operador puede ordenar simultáneamente a miles o millones de bots lanzar ataques DDoS, enviar correo spam, distribuir malware, robar credenciales, realizar fraude de clics o minar criptomonedas. El equipo infectado puede quedar en listas negras de internet.',
    vector: 'Malware descargado o recibido por correo, exploits de red, credenciales débiles en servicios RDP/SSH, dispositivos IoT con contraseñas por defecto.',
    sintomas: [
      'Actividad de red intensa en horas de inactividad (madrugada)',
      'Equipo lento sin procesos aparentemente responsables',
      'Dirección IP incluida en listas negras antispam',
      'Proveedor de internet notifica abuso desde la IP',
      'Router con conexiones salientes masivas a IPs desconocidas',
    ],
    prevencion: [
      'Usar contraseñas fuertes y únicas, especialmente en router y servicios remotos',
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
    descripcion: 'El phishing (suplantación de identidad) es el vector de ataque más común del mundo. El atacante crea una réplica convincente de un servicio legítimo (banco, correo, Microsoft, Amazon) y envía el enlace a la víctima por correo, SMS (smishing) o llamada telefónica (vishing). La víctima cree estar en el sitio real, introduce sus credenciales o datos bancarios, y el atacante los captura en tiempo real. El spear phishing es una variante dirigida específicamente a una persona u organización concreta.',
    vector: 'Correo electrónico masivo o dirigido (spear phishing), SMS (smishing), llamadas telefónicas (vishing), mensajes en redes sociales y aplicaciones de mensajería.',
    sintomas: [
      'URL con variaciones sutiles del original (paypa1.com, micros0ft.com)',
      'Certificado SSL inválido o ausente (candado rojo en el navegador)',
      'Lenguaje de urgencia extrema: "Tu cuenta será bloqueada en 24h"',
      'Errores gramaticales o de traducción en el mensaje',
      'Remitente de correo con dominio sospechoso',
    ],
    prevencion: [
      'Verificar siempre la URL completa antes de introducir cualquier dato',
      'Activar la autenticación de dos factores en todas las cuentas importantes',
      'Usar un gestor de contraseñas (no autocompleta en sitios falsos)',
      'No hacer clic en enlaces de correos no solicitados; ir directamente al sitio',
      'Habilitar la protección anti-phishing del navegador',
    ],
    herramienta: 'Google Safe Browsing, extensión Netcraft Anti-Phishing',
    ejemplos: ['Microsoft 365 Credential Harvesting', 'Emotet (distribución)', 'PayPal phishing', 'Campañas de COVID-19', 'Business Email Compromise (BEC)'],
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
        <div class="enc-vector-label">Vector de ataque</div>
        <div class="enc-vector-texto">${a.vector}</div>
        <div class="enc-ejemplos">
          ${a.ejemplos.slice(0, 3).map(e => `<span class="enc-ejemplo-tag">${e}</span>`).join('')}
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

  const overlay = document.getElementById('enc-modal-overlay');
  overlay.classList.add('visible');
  document.body.style.overflow = 'hidden';
}

function cerrarModal() {
  document.getElementById('enc-modal-overlay').classList.remove('visible');
  document.body.style.overflow = '';
}

// ── Inicialización ────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // Chips de categoría
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

  // Buscador
  document.getElementById('enc-buscar').addEventListener('input', e => {
    filtroBusqueda = e.target.value;
    renderGrid();
  });

  // Modal: cerrar
  document.getElementById('enc-modal-cerrar').addEventListener('click', cerrarModal);
  document.getElementById('enc-modal-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) cerrarModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') cerrarModal();
  });

  // Render inicial
  renderGrid();
});
