/**
 * simulador.js — Modo Demostración / Simulador de Amenazas (modulo_04_simulador)
 *
 * Intercepta las llamadas a invoke('audit', ...) cuando está activo y
 * devuelve datos ficticios que recrean escenarios de riesgo reales,
 * sin tocar el sistema operativo del usuario.
 */

// ── Datos ficticios por escenario ─────────────────────────────────────────────

function ts() { return new Date().toISOString(); }

const DATOS = {

  // ── Escenario 1: Puerto 4444 abierto (RAT / Metasploit) ──────────────────
  1: {
    scan_ports: () => ({
      ok: true,
      data: [
        { pid: 7341, proceso: 'unknown.exe',  local: '0.0.0.0:4444',   remoto: '185.234.219.47:52341', estado: 'ESTABLISHED' },
        { pid: 7341, proceso: 'unknown.exe',  local: '0.0.0.0:4445',   remoto: '',                     estado: 'LISTEN'      },
        { pid: 4,    proceso: 'System',       local: '0.0.0.0:445',    remoto: '',                     estado: 'LISTEN'      },
        { pid: 1032, proceso: 'svchost.exe',  local: '0.0.0.0:135',    remoto: '',                     estado: 'LISTEN'      },
        { pid: 2841, proceso: 'chrome.exe',   local: '127.0.0.1:49312',remoto: '142.250.184.238:443',  estado: 'ESTABLISHED' },
        { pid: 2841, proceso: 'chrome.exe',   local: '127.0.0.1:49313',remoto: '151.101.1.140:443',    estado: 'ESTABLISHED' },
      ],
      meta: { timestamp: ts(), duracion_ms: 74, total: 6 },
    }),
    scan_processes: () => ({
      ok: true,
      data: [
        { pid: 7341, nombre: 'unknown.exe', cpu_pct: 12.4, ram_mb: 48.1, ruta: '', usuario: 'SYSTEM', alerta_cpu: false, alerta_ram: false, sin_ruta: true },
        { pid: 2841, nombre: 'chrome.exe',  cpu_pct: 8.2,  ram_mb: 310.0, ruta: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', usuario: 'Usuario', alerta_cpu: false, alerta_ram: false, sin_ruta: false },
        { pid: 1032, nombre: 'svchost.exe', cpu_pct: 1.1,  ram_mb: 42.0,  ruta: 'C:\\Windows\\System32\\svchost.exe', usuario: 'SYSTEM', alerta_cpu: false, alerta_ram: false, sin_ruta: false },
      ],
      meta: { timestamp: ts(), duracion_ms: 340, total: 3, alertas: 1 },
    }),
    scan_defenses: () => ({
      ok: true,
      data: {
        firewall:  { activo: true,  perfiles: [{ nombre: 'Domain', habilitado: true }, { nombre: 'Private', habilitado: true }, { nombre: 'Public', habilitado: true }] },
        antivirus: { activo: true,  detalle: { AMServiceEnabled: true, RealTimeProtectionEnabled: true, AntivirusEnabled: true } },
        bitlocker: { activo: false, volumenes: [{ unidad: 'C:', estado: 'FullyDecrypted', protegido: false }] },
        todas_defensas_activas: false,
      },
      meta: { timestamp: ts(), duracion_ms: 910 },
    }),
    scan_startup:  () => ({ ok: true, data: { registro: [ { origen: 'HKCU\\Run', nombre: 'unknown_agent', comando: 'C:\\Users\\Usuario\\AppData\\Roaming\\unk.exe --hidden' } ], tareas_programadas: [] }, meta: { timestamp: ts(), duracion_ms: 200, total_registro: 1, total_tareas: 0 } }),
    scan_patches:  () => ({ ok: true, data: { actualizaciones_pendientes: [], ultima_actualizacion_exitosa: new Date(Date.now() - 3 * 86400000).toISOString(), sistema_actualizado: true }, meta: { timestamp: ts(), duracion_ms: 420, metodo: 'WUA COM', total_pendientes: 0 } }),
  },

  // ── Escenario 2: Proceso minero / ransomware (svchost32.exe) ─────────────
  2: {
    scan_processes: () => ({
      ok: true,
      data: [
        { pid: 9812, nombre: 'svchost32.exe', cpu_pct: 99.1, ram_mb: 245.3, ruta: '', usuario: 'SYSTEM', alerta_cpu: true, alerta_ram: false, sin_ruta: true },
        { pid: 2841, nombre: 'chrome.exe',    cpu_pct: 4.2,  ram_mb: 310.0, ruta: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', usuario: 'Usuario', alerta_cpu: false, alerta_ram: false, sin_ruta: false },
        { pid: 1032, nombre: 'svchost.exe',   cpu_pct: 0.8,  ram_mb: 42.0,  ruta: 'C:\\Windows\\System32\\svchost.exe', usuario: 'SYSTEM', alerta_cpu: false, alerta_ram: false, sin_ruta: false },
        { pid: 812,  nombre: 'explorer.exe',  cpu_pct: 0.3,  ram_mb: 88.0,  ruta: 'C:\\Windows\\explorer.exe', usuario: 'Usuario', alerta_cpu: false, alerta_ram: false, sin_ruta: false },
      ],
      meta: { timestamp: ts(), duracion_ms: 360, total: 4, alertas: 1 },
    }),
    scan_ports: () => ({
      ok: true,
      data: [
        { pid: 9812, proceso: 'svchost32.exe', local: '0.0.0.0:33521', remoto: '91.108.56.121:443', estado: 'ESTABLISHED' },
        { pid: 4,    proceso: 'System',        local: '0.0.0.0:445',   remoto: '',                   estado: 'LISTEN'      },
        { pid: 2841, proceso: 'chrome.exe',    local: '127.0.0.1:49420',remoto: '142.250.184.1:443', estado: 'ESTABLISHED' },
      ],
      meta: { timestamp: ts(), duracion_ms: 68, total: 3 },
    }),
    scan_defenses: () => ({
      ok: true,
      data: {
        firewall:  { activo: true, perfiles: [{ nombre: 'Domain', habilitado: true }, { nombre: 'Private', habilitado: true }, { nombre: 'Public', habilitado: true }] },
        antivirus: { activo: true, detalle: { AMServiceEnabled: true, RealTimeProtectionEnabled: true, AntivirusEnabled: true } },
        bitlocker: { activo: false, volumenes: [{ unidad: 'C:', estado: 'FullyDecrypted', protegido: false }] },
        todas_defensas_activas: false,
      },
      meta: { timestamp: ts(), duracion_ms: 880 },
    }),
    scan_startup: () => ({ ok: true, data: { registro: [], tareas_programadas: [] }, meta: { timestamp: ts(), duracion_ms: 190, total_registro: 0, total_tareas: 0 } }),
    scan_patches: () => ({ ok: true, data: { actualizaciones_pendientes: [], ultima_actualizacion_exitosa: new Date(Date.now() - 2 * 86400000).toISOString(), sistema_actualizado: true }, meta: { timestamp: ts(), duracion_ms: 400, metodo: 'WUA COM', total_pendientes: 0 } }),
  },

  // ── Escenario 3: Sistema abandonado (defensas caídas + parches) ───────────
  3: {
    scan_defenses: () => ({
      ok: true,
      data: {
        firewall:  { activo: false, perfiles: [{ nombre: 'Domain', habilitado: false }, { nombre: 'Private', habilitado: false }, { nombre: 'Public', habilitado: false }] },
        antivirus: { activo: false, detalle: { AMServiceEnabled: false, RealTimeProtectionEnabled: false, AntivirusEnabled: false } },
        bitlocker: { activo: false, volumenes: [{ unidad: 'C:', estado: 'FullyDecrypted', protegido: false }] },
        todas_defensas_activas: false,
      },
      meta: { timestamp: ts(), duracion_ms: 870 },
    }),
    scan_patches: () => ({
      ok: true,
      data: {
        actualizaciones_pendientes: [
          { kb: 'KB5034441', titulo: 'Actualización de seguridad crítica para Windows 11 (CVE-2024-21334)', reinicio_requerido: true },
          { kb: 'KB5034203', titulo: 'Actualización acumulativa para .NET Framework 4.8', reinicio_requerido: false },
          { kb: 'KB5032190', titulo: 'Parche de seguridad para Microsoft Edge', reinicio_requerido: false },
          { kb: 'KB5031539', titulo: 'Actualización de Windows Defender Antivirus', reinicio_requerido: false },
          { kb: 'KB5030219', titulo: 'Actualización acumulativa para Windows 11 22H2', reinicio_requerido: true },
          { kb: 'KB5029928', titulo: 'Parche crítico para protocolo SMB (CVE-2024-38063)', reinicio_requerido: true },
          { kb: 'KB5028185', titulo: 'Actualización de seguridad para Microsoft Office', reinicio_requerido: false },
          { kb: 'KB5027123', titulo: 'Actualización de controladores de red', reinicio_requerido: false },
          { kb: 'KB5026039', titulo: 'Actualización de componentes de Windows Update', reinicio_requerido: false },
          { kb: 'KB5024990', titulo: 'Parche para vulnerabilidad en NTLM (CVE-2024-30078)', reinicio_requerido: true },
          { kb: 'KB5023702', titulo: 'Actualización acumulativa para PowerShell 7.4', reinicio_requerido: false },
          { kb: 'KB5022282', titulo: 'Actualización de seguridad para Windows Print Spooler', reinicio_requerido: false },
          { kb: 'KB5021234', titulo: 'Parche para vulnerabilidad de elevación de privilegios', reinicio_requerido: true },
          { kb: 'KB5020387', titulo: 'Actualización de seguridad para Microsoft Visual C++', reinicio_requerido: false },
        ],
        ultima_actualizacion_exitosa: new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0],
        sistema_actualizado: false,
      },
      meta: { timestamp: ts(), duracion_ms: 1840, metodo: 'WUA COM', total_pendientes: 14 },
    }),
    scan_startup: () => ({
      ok: true,
      data: {
        registro: [
          { origen: 'HKCU\\Run', nombre: 'OneDrive',    comando: 'C:\\Program Files\\Microsoft OneDrive\\OneDrive.exe /background' },
          { origen: 'HKCU\\Run', nombre: 'Spotify',     comando: 'C:\\Users\\Usuario\\AppData\\Roaming\\Spotify\\Spotify.exe' },
          { origen: 'HKCU\\Run', nombre: 'Discord',     comando: 'C:\\Users\\Usuario\\AppData\\Local\\Discord\\Update.exe --processStart Discord.exe' },
          { origen: 'HKLM\\Run', nombre: 'SecurityHealth', comando: '%windir%\\system32\\SecurityHealthSystray.exe' },
          { origen: 'HKLM\\Run', nombre: 'NvBackend',   comando: '"C:\\Program Files (x86)\\NVIDIA Corporation\\Update Core\\NvBackend.exe"' },
        ],
        tareas_programadas: [],
      },
      meta: { timestamp: ts(), duracion_ms: 220, total_registro: 5, total_tareas: 0 },
    }),
    scan_ports:    () => ({ ok: true, data: [{ pid: 4, proceso: 'System', local: '0.0.0.0:445', remoto: '', estado: 'LISTEN' }, { pid: 1032, proceso: 'svchost.exe', local: '0.0.0.0:135', remoto: '', estado: 'LISTEN' }], meta: { timestamp: ts(), duracion_ms: 60, total: 2 } }),
    scan_processes: () => ({ ok: true, data: [{ pid: 812, nombre: 'explorer.exe', cpu_pct: 0.8, ram_mb: 88.0, ruta: 'C:\\Windows\\explorer.exe', usuario: 'Usuario', alerta_cpu: false, alerta_ram: false, sin_ruta: false }], meta: { timestamp: ts(), duracion_ms: 320, total: 1, alertas: 0 } }),
  },
};

// ── Tarjetas educativas por escenario y acción ────────────────────────────────

const TARJETAS = {
  1: {
    scan_ports: {
      nivel: 'critico',
      icono: '🚨',
      titulo: 'Puerto 4444 — Firma de herramienta de acceso remoto',
      que: 'El puerto 4444 es la firma por defecto de <strong>Metasploit Framework</strong>, la suite de pentesting más utilizada del mundo, y de numerosos troyanos de acceso remoto (RAT). Una conexión ESTABLISHED a una IP externa en este puerto indica que alguien podría estar controlando tu equipo en este momento.',
      hacer: 'Desconecta el equipo de la red inmediatamente. Ejecuta un análisis completo con Windows Defender en modo fuera de línea. Contacta con soporte técnico antes de volver a conectar.',
      herramienta: 'Microsoft Safety Scanner (msert.exe)',
    },
    scan_startup: {
      nivel: 'alto',
      icono: '⚠️',
      titulo: 'Entrada sospechosa en el autoinicio',
      que: 'Se detectó un programa desconocido configurado para iniciarse automáticamente desde la carpeta AppData/Roaming. Los programas maliciosos se instalan en estas ubicaciones para sobrevivir a los reinicios del sistema.',
      hacer: 'No reinicies el equipo todavía. Identifica el archivo y analízalo con VirusTotal antes de eliminarlo. Si es malware, usa Malwarebytes para una limpieza completa.',
      herramienta: 'Malwarebytes Free',
    },
  },
  2: {
    scan_processes: {
      nivel: 'critico',
      icono: '🚨',
      titulo: 'Proceso sospechoso: svchost32.exe al 99% de CPU',
      que: '<strong>svchost32.exe no existe en Windows</strong>. El proceso legítimo se llama <code>svchost.exe</code> (sin el "32"). Este proceso sin ruta conocida y consumiendo toda la CPU es una señal clásica de un <strong>minero de criptomonedas</strong> o de un ransomware en fase de cifrado de archivos.',
      hacer: 'Abre el Administrador de tareas (Ctrl+Shift+Esc) y termina el proceso. Acto seguido ejecuta un análisis completo. Si tienes archivos importantes, comprueba que no hayan sido cifrados antes de apagar el equipo.',
      herramienta: 'Malwarebytes AdwCleaner',
    },
    scan_ports: {
      nivel: 'alto',
      icono: '⚠️',
      titulo: 'Conexión saliente no identificada',
      que: 'El proceso svchost32.exe está manteniendo una conexión activa con una IP externa en el puerto 443 (HTTPS). Los malware modernos usan el puerto 443 para camuflar sus comunicaciones con el servidor de comando y control (C2) como tráfico web normal.',
      hacer: 'Bloquea el proceso en el Firewall de Windows. Revisa los logs del router para identificar el volumen de datos enviados. Una exfiltración de datos puede haberse producido.',
      herramienta: 'Windows Firewall con seguridad avanzada',
    },
  },
  3: {
    scan_defenses: {
      nivel: 'critico',
      icono: '🚨',
      titulo: 'Sistema completamente desprotegido',
      que: 'El Firewall, el Antivirus y el cifrado de disco están <strong>todos desactivados</strong>. Un sistema en este estado está expuesto a cualquier amenaza de red, a la instalación silenciosa de malware y al robo físico de datos del disco duro. Es el equivalente a dejar la puerta de casa abierta de par en par.',
      hacer: 'Activa el Firewall de Windows desde el Panel de Control. Activa Windows Defender desde Seguridad de Windows. Considera activar BitLocker si el equipo es portátil.',
      herramienta: 'Centro de Seguridad de Windows',
    },
    scan_patches: {
      nivel: 'alto',
      icono: '⚠️',
      titulo: '14 actualizaciones pendientes — El sistema lleva 30 días sin parchear',
      que: 'Entre las actualizaciones pendientes hay parches para <strong>vulnerabilidades críticas</strong> con CVE asignado (CVE-2024-21334, CVE-2024-38063). Estas vulnerabilidades son conocidas públicamente y existen exploits funcionales disponibles en internet. Cada día sin parchear es un día de exposición.',
      hacer: 'Abre Windows Update y aplica todas las actualizaciones pendientes. Reinicia el equipo. Configura las actualizaciones automáticas para que esto no vuelva a ocurrir.',
      herramienta: 'Windows Update (Configuración → Windows Update)',
    },
  },
};

// ── Estado del simulador ──────────────────────────────────────────────────────

window.SIMULADOR = {
  activo: false,
  escenario: null,

  activar() {
    this.activo = true;
    document.body.classList.add('modo-demo');
    limpiarResultados();
  },

  desactivar() {
    this.activo   = false;
    this.escenario = null;
    document.body.classList.remove('modo-demo');
    document.querySelectorAll('.sim-btn').forEach(b => b.classList.remove('activo'));
    limpiarResultados();
  },

  seleccionarEscenario(n) {
    this.escenario = n;
    document.querySelectorAll('.sim-btn').forEach(b => {
      b.classList.toggle('activo', parseInt(b.dataset.escenario) === n);
    });
    limpiarResultados();
  },

  interceptar(action) {
    if (!this.escenario) {
      return Promise.resolve({ ok: false, error: 'Selecciona un escenario antes de analizar.' });
    }
    const datos = DATOS[this.escenario]?.[action];
    if (!datos) {
      return Promise.resolve({ ok: false, error: `Acción "${action}" no tiene datos de simulación.` });
    }
    // Simular latencia realista
    const latencia = 300 + Math.random() * 600;
    return new Promise(resolve => setTimeout(() => resolve(datos()), latencia));
  },

  tarjeta(action) {
    return this.escenario ? TARJETAS[this.escenario]?.[action] : null;
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function limpiarResultados() {
  ['resultado-defensas', 'resultado-puertos', 'resultado-procesos',
   'resultado-autoinicio', 'resultado-parches'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });
}

function renderTarjeta(info) {
  if (!info) return '';
  return `
    <div class="tarjeta-edu">
      <div class="tarjeta-edu-header ${info.nivel}">
        <span>${info.icono}</span>
        <span>${info.titulo}</span>
      </div>
      <div class="tarjeta-edu-body">
        <div>
          <h4>¿Qué significa esto?</h4>
          <p>${info.que}</p>
        </div>
        <div>
          <h4>¿Qué deberías hacer?</h4>
          <p>${info.hacer}</p>
          <div class="tarjeta-edu-herramienta">🛠️ Herramienta recomendada: ${info.herramienta}</div>
        </div>
      </div>
    </div>`;
}

window.SIMULADOR.renderTarjeta = renderTarjeta;

// ── Inicialización de controles ───────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-activar-demo').addEventListener('click', () => {
    window.SIMULADOR.activar();
  });

  document.getElementById('btn-salir-demo').addEventListener('click', () => {
    window.SIMULADOR.desactivar();
  });

  document.querySelectorAll('.sim-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      window.SIMULADOR.seleccionarEscenario(parseInt(btn.dataset.escenario));
    });
  });
});
