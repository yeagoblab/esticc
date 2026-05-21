/**
 * simulador.js — Modo Demostración / Simulador de Amenazas (modulo_04_simulador)
 *
 * Intercepta las llamadas a invoke('audit', ...) cuando está activo y
 * devuelve datos ficticios que recrean escenarios de riesgo reales,
 * sin tocar el sistema operativo del usuario.
 *
 * Cada escenario está enlazado con la Enciclopedia de Malware para
 * mostrar cómo resolver la amenaza paso a paso.
 */

// ── Utilidad ──────────────────────────────────────────────────────────────────

function ts() { return new Date().toISOString(); }

// ── Datos ficticios por escenario ─────────────────────────────────────────────

const DATOS = {

  // ── Escenario 1: RAT — Puerto 4444 abierto (Metasploit) ──────────────────
  1: {
    scan_ports: () => ({
      ok: true,
      data: [
        { pid: 7341, proceso: 'unknown.exe',  local: '0.0.0.0:4444',    remoto: '185.234.219.47:52341', estado: 'ESTABLISHED' },
        { pid: 7341, proceso: 'unknown.exe',  local: '0.0.0.0:4445',    remoto: '',                     estado: 'LISTEN'      },
        { pid: 4,    proceso: 'System',       local: '0.0.0.0:445',     remoto: '',                     estado: 'LISTEN'      },
        { pid: 1032, proceso: 'svchost.exe',  local: '0.0.0.0:135',     remoto: '',                     estado: 'LISTEN'      },
        { pid: 2841, proceso: 'chrome.exe',   local: '127.0.0.1:49312', remoto: '142.250.184.238:443',  estado: 'ESTABLISHED' },
        { pid: 2841, proceso: 'chrome.exe',   local: '127.0.0.1:49313', remoto: '151.101.1.140:443',    estado: 'ESTABLISHED' },
      ],
      meta: { timestamp: ts(), duracion_ms: 74, total: 6 },
    }),
    scan_processes: () => ({
      ok: true,
      data: [
        { pid: 7341, nombre: 'unknown.exe',  cpu_pct: 12.4, ram_mb: 48.1,  ruta: '',                                                               usuario: 'SYSTEM',  alerta_cpu: false, alerta_ram: false, sin_ruta: true  },
        { pid: 2841, nombre: 'chrome.exe',   cpu_pct: 8.2,  ram_mb: 310.0, ruta: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',     usuario: 'Usuario', alerta_cpu: false, alerta_ram: false, sin_ruta: false },
        { pid: 1032, nombre: 'svchost.exe',  cpu_pct: 1.1,  ram_mb: 42.0,  ruta: 'C:\\Windows\\System32\\svchost.exe',                            usuario: 'SYSTEM',  alerta_cpu: false, alerta_ram: false, sin_ruta: false },
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
    scan_startup: () => ({
      ok: true,
      data: {
        registro: [{ origen: 'HKCU\\Run', nombre: 'unknown_agent', comando: 'C:\\Users\\Usuario\\AppData\\Roaming\\unk.exe --hidden' }],
        tareas_programadas: [],
      },
      meta: { timestamp: ts(), duracion_ms: 200, total_registro: 1, total_tareas: 0 },
    }),
    scan_patches: () => ({
      ok: true,
      data: { actualizaciones_pendientes: [], ultima_actualizacion_exitosa: new Date(Date.now() - 3 * 86400000).toISOString(), sistema_actualizado: true },
      meta: { timestamp: ts(), duracion_ms: 420, metodo: 'WUA COM', total_pendientes: 0 },
    }),
  },

  // ── Escenario 2: Cryptojacker — svchost32.exe al 99% CPU ─────────────────
  2: {
    scan_processes: () => ({
      ok: true,
      data: [
        { pid: 9812, nombre: 'svchost32.exe', cpu_pct: 99.1, ram_mb: 245.3, ruta: '',                                                               usuario: 'SYSTEM',  alerta_cpu: true,  alerta_ram: false, sin_ruta: true  },
        { pid: 2841, nombre: 'chrome.exe',    cpu_pct: 4.2,  ram_mb: 310.0, ruta: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',     usuario: 'Usuario', alerta_cpu: false, alerta_ram: false, sin_ruta: false },
        { pid: 1032, nombre: 'svchost.exe',   cpu_pct: 0.8,  ram_mb: 42.0,  ruta: 'C:\\Windows\\System32\\svchost.exe',                            usuario: 'SYSTEM',  alerta_cpu: false, alerta_ram: false, sin_ruta: false },
        { pid: 812,  nombre: 'explorer.exe',  cpu_pct: 0.3,  ram_mb: 88.0,  ruta: 'C:\\Windows\\explorer.exe',                                     usuario: 'Usuario', alerta_cpu: false, alerta_ram: false, sin_ruta: false },
      ],
      meta: { timestamp: ts(), duracion_ms: 360, total: 4, alertas: 1 },
    }),
    scan_ports: () => ({
      ok: true,
      data: [
        { pid: 9812, proceso: 'svchost32.exe', local: '0.0.0.0:33521',  remoto: '91.108.56.121:443',    estado: 'ESTABLISHED' },
        { pid: 4,    proceso: 'System',         local: '0.0.0.0:445',    remoto: '',                     estado: 'LISTEN'      },
        { pid: 2841, proceso: 'chrome.exe',     local: '127.0.0.1:49420',remoto: '142.250.184.1:443',   estado: 'ESTABLISHED' },
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
    scan_startup:  () => ({ ok: true, data: { registro: [], tareas_programadas: [] }, meta: { timestamp: ts(), duracion_ms: 190, total_registro: 0, total_tareas: 0 } }),
    scan_patches:  () => ({ ok: true, data: { actualizaciones_pendientes: [], ultima_actualizacion_exitosa: new Date(Date.now() - 2 * 86400000).toISOString(), sistema_actualizado: true }, meta: { timestamp: ts(), duracion_ms: 400, metodo: 'WUA COM', total_pendientes: 0 } }),
  },

  // ── Escenario 3: Sistema abandonado (defensas caídas + 14 parches) ────────
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
          { origen: 'HKCU\\Run', nombre: 'OneDrive',      comando: 'C:\\Program Files\\Microsoft OneDrive\\OneDrive.exe /background' },
          { origen: 'HKCU\\Run', nombre: 'Spotify',       comando: 'C:\\Users\\Usuario\\AppData\\Roaming\\Spotify\\Spotify.exe' },
          { origen: 'HKCU\\Run', nombre: 'Discord',       comando: 'C:\\Users\\Usuario\\AppData\\Local\\Discord\\Update.exe --processStart Discord.exe' },
          { origen: 'HKLM\\Run', nombre: 'SecurityHealth',comando: '%windir%\\system32\\SecurityHealthSystray.exe' },
          { origen: 'HKLM\\Run', nombre: 'NvBackend',     comando: '"C:\\Program Files (x86)\\NVIDIA Corporation\\Update Core\\NvBackend.exe"' },
        ],
        tareas_programadas: [],
      },
      meta: { timestamp: ts(), duracion_ms: 220, total_registro: 5, total_tareas: 0 },
    }),
    scan_ports:     () => ({ ok: true, data: [{ pid: 4, proceso: 'System', local: '0.0.0.0:445', remoto: '', estado: 'LISTEN' }, { pid: 1032, proceso: 'svchost.exe', local: '0.0.0.0:135', remoto: '', estado: 'LISTEN' }], meta: { timestamp: ts(), duracion_ms: 60, total: 2 } }),
    scan_processes: () => ({ ok: true, data: [{ pid: 812, nombre: 'explorer.exe', cpu_pct: 0.8, ram_mb: 88.0, ruta: 'C:\\Windows\\explorer.exe', usuario: 'Usuario', alerta_cpu: false, alerta_ram: false, sin_ruta: false }], meta: { timestamp: ts(), duracion_ms: 320, total: 1, alertas: 0 } }),
  },

  // ── Escenario 4: Keylogger — Agent Tesla exfiltrando por SMTP ────────────
  4: {
    scan_processes: () => ({
      ok: true,
      data: [
        { pid: 5512, nombre: 'agent_upd.exe', cpu_pct: 2.1,  ram_mb: 38.4,  ruta: '',                                                               usuario: 'Usuario', alerta_cpu: false, alerta_ram: false, sin_ruta: true  },
        { pid: 2841, nombre: 'chrome.exe',    cpu_pct: 6.3,  ram_mb: 312.0, ruta: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',     usuario: 'Usuario', alerta_cpu: false, alerta_ram: false, sin_ruta: false },
        { pid: 1032, nombre: 'svchost.exe',   cpu_pct: 0.9,  ram_mb: 44.0,  ruta: 'C:\\Windows\\System32\\svchost.exe',                            usuario: 'SYSTEM',  alerta_cpu: false, alerta_ram: false, sin_ruta: false },
        { pid: 812,  nombre: 'explorer.exe',  cpu_pct: 0.4,  ram_mb: 90.0,  ruta: 'C:\\Windows\\explorer.exe',                                     usuario: 'Usuario', alerta_cpu: false, alerta_ram: false, sin_ruta: false },
      ],
      meta: { timestamp: ts(), duracion_ms: 355, total: 4, alertas: 1 },
    }),
    scan_ports: () => ({
      ok: true,
      data: [
        { pid: 5512, proceso: 'agent_upd.exe', local: '0.0.0.0:49801', remoto: '185.220.101.34:587',  estado: 'ESTABLISHED' },
        { pid: 5512, proceso: 'agent_upd.exe', local: '0.0.0.0:49802', remoto: '185.220.101.34:25',   estado: 'TIME_WAIT'   },
        { pid: 2841, proceso: 'chrome.exe',    local: '127.0.0.1:49312',remoto: '142.250.184.238:443', estado: 'ESTABLISHED' },
        { pid: 4,    proceso: 'System',        local: '0.0.0.0:445',   remoto: '',                     estado: 'LISTEN'      },
      ],
      meta: { timestamp: ts(), duracion_ms: 71, total: 4 },
    }),
    scan_defenses: () => ({
      ok: true,
      data: {
        firewall:  { activo: true, perfiles: [{ nombre: 'Domain', habilitado: true }, { nombre: 'Private', habilitado: true }, { nombre: 'Public', habilitado: true }] },
        antivirus: { activo: true, detalle: { AMServiceEnabled: true, RealTimeProtectionEnabled: true, AntivirusEnabled: true } },
        bitlocker: { activo: false, volumenes: [{ unidad: 'C:', estado: 'FullyDecrypted', protegido: false }] },
        todas_defensas_activas: false,
      },
      meta: { timestamp: ts(), duracion_ms: 890 },
    }),
    scan_startup: () => ({
      ok: true,
      data: {
        registro: [
          { origen: 'HKCU\\Run', nombre: 'WindowsAgent', comando: 'C:\\Users\\Usuario\\AppData\\Roaming\\WindowsAgent\\agent_upd.exe' },
          { origen: 'HKCU\\Run', nombre: 'OneDrive',     comando: 'C:\\Program Files\\Microsoft OneDrive\\OneDrive.exe /background' },
        ],
        tareas_programadas: [
          { nombre: '\\AgentUpdate',      estado: 'Ready', siguiente_ejecucion: new Date(Date.now() + 3600000).toISOString() },
        ],
      },
      meta: { timestamp: ts(), duracion_ms: 230, total_registro: 2, total_tareas: 1 },
    }),
    scan_patches: () => ({
      ok: true,
      data: {
        actualizaciones_pendientes: [
          { kb: 'KB5034441', titulo: 'Actualización de seguridad para .NET Framework (CVE-2024-21338)', reinicio_requerido: false },
          { kb: 'KB5031539', titulo: 'Actualización de Windows Defender Antivirus', reinicio_requerido: false },
        ],
        ultima_actualizacion_exitosa: new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0],
        sistema_actualizado: false,
      },
      meta: { timestamp: ts(), duracion_ms: 510, metodo: 'WUA COM', total_pendientes: 2 },
    }),
  },

  // ── Escenario 5: Cryptojacker — XMRig minando Monero ─────────────────────
  5: {
    scan_processes: () => ({
      ok: true,
      data: [
        { pid: 6631, nombre: 'xmrig.exe',    cpu_pct: 95.8, ram_mb: 182.4, ruta: '',                                                               usuario: 'SYSTEM',  alerta_cpu: true,  alerta_ram: true,  sin_ruta: true  },
        { pid: 812,  nombre: 'explorer.exe', cpu_pct: 0.2,  ram_mb: 89.0,  ruta: 'C:\\Windows\\explorer.exe',                                     usuario: 'Usuario', alerta_cpu: false, alerta_ram: false, sin_ruta: false },
        { pid: 1032, nombre: 'svchost.exe',  cpu_pct: 0.3,  ram_mb: 44.0,  ruta: 'C:\\Windows\\System32\\svchost.exe',                            usuario: 'SYSTEM',  alerta_cpu: false, alerta_ram: false, sin_ruta: false },
        { pid: 2841, nombre: 'chrome.exe',   cpu_pct: 1.1,  ram_mb: 208.0, ruta: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',     usuario: 'Usuario', alerta_cpu: false, alerta_ram: false, sin_ruta: false },
      ],
      meta: { timestamp: ts(), duracion_ms: 340, total: 4, alertas: 1 },
    }),
    scan_ports: () => ({
      ok: true,
      data: [
        { pid: 6631, proceso: 'xmrig.exe',  local: '0.0.0.0:44810', remoto: 'pool.supportxmr.com:3333', estado: 'ESTABLISHED' },
        { pid: 6631, proceso: 'xmrig.exe',  local: '0.0.0.0:44811', remoto: '104.21.48.9:14444',        estado: 'ESTABLISHED' },
        { pid: 4,    proceso: 'System',     local: '0.0.0.0:445',   remoto: '',                          estado: 'LISTEN'      },
        { pid: 2841, proceso: 'chrome.exe', local: '127.0.0.1:49400',remoto: '142.250.184.1:443',       estado: 'ESTABLISHED' },
      ],
      meta: { timestamp: ts(), duracion_ms: 66, total: 4 },
    }),
    scan_defenses: () => ({
      ok: true,
      data: {
        firewall:  { activo: true, perfiles: [{ nombre: 'Domain', habilitado: true }, { nombre: 'Private', habilitado: true }, { nombre: 'Public', habilitado: true }] },
        antivirus: { activo: true, detalle: { AMServiceEnabled: true, RealTimeProtectionEnabled: true, AntivirusEnabled: true } },
        bitlocker: { activo: false, volumenes: [{ unidad: 'C:', estado: 'FullyDecrypted', protegido: false }] },
        todas_defensas_activas: false,
      },
      meta: { timestamp: ts(), duracion_ms: 870 },
    }),
    scan_startup: () => ({
      ok: true,
      data: {
        registro: [],
        tareas_programadas: [
          { nombre: '\\MicrosoftEdgeUpdate',   estado: 'Ready', siguiente_ejecucion: new Date(Date.now() + 7200000).toISOString() },
          { nombre: '\\XMRigMaintain',         estado: 'Ready', siguiente_ejecucion: new Date(Date.now() + 1800000).toISOString() },
        ],
      },
      meta: { timestamp: ts(), duracion_ms: 210, total_registro: 0, total_tareas: 2 },
    }),
    scan_patches: () => ({
      ok: true,
      data: { actualizaciones_pendientes: [], ultima_actualizacion_exitosa: new Date(Date.now() - 1 * 86400000).toISOString(), sistema_actualizado: true },
      meta: { timestamp: ts(), duracion_ms: 390, metodo: 'WUA COM', total_pendientes: 0 },
    }),
  },

  // ── Escenario 6: Ransomware — Fase activa de cifrado ─────────────────────
  6: {
    scan_processes: () => ({
      ok: true,
      data: [
        { pid: 8820, nombre: 'decrypt_help.exe', cpu_pct: 98.3, ram_mb: 312.0, ruta: 'C:\\Users\\Usuario\\AppData\\Local\\Temp\\decrypt_help.exe',  usuario: 'Usuario', alerta_cpu: true,  alerta_ram: true,  sin_ruta: false },
        { pid: 8910, nombre: 'vssadmin.exe',     cpu_pct: 12.1, ram_mb: 14.0,  ruta: 'C:\\Windows\\System32\\vssadmin.exe',                         usuario: 'SYSTEM',  alerta_cpu: false, alerta_ram: false, sin_ruta: false },
        { pid: 812,  nombre: 'explorer.exe',     cpu_pct: 0.1,  ram_mb: 76.0,  ruta: 'C:\\Windows\\explorer.exe',                                   usuario: 'Usuario', alerta_cpu: false, alerta_ram: false, sin_ruta: false },
        { pid: 1032, nombre: 'svchost.exe',      cpu_pct: 0.5,  ram_mb: 44.0,  ruta: 'C:\\Windows\\System32\\svchost.exe',                          usuario: 'SYSTEM',  alerta_cpu: false, alerta_ram: false, sin_ruta: false },
      ],
      meta: { timestamp: ts(), duracion_ms: 380, total: 4, alertas: 2 },
    }),
    scan_ports: () => ({
      ok: true,
      data: [
        { pid: 8820, proceso: 'decrypt_help.exe', local: '0.0.0.0:50120', remoto: '94.102.49.190:443',  estado: 'ESTABLISHED' },
        { pid: 4,    proceso: 'System',           local: '0.0.0.0:445',   remoto: '',                   estado: 'LISTEN'      },
      ],
      meta: { timestamp: ts(), duracion_ms: 58, total: 2 },
    }),
    scan_defenses: () => ({
      ok: true,
      data: {
        firewall:  { activo: true, perfiles: [{ nombre: 'Domain', habilitado: true }, { nombre: 'Private', habilitado: true }, { nombre: 'Public', habilitado: true }] },
        antivirus: { activo: false, detalle: { AMServiceEnabled: false, RealTimeProtectionEnabled: false, AntivirusEnabled: false } },
        bitlocker: { activo: false, volumenes: [{ unidad: 'C:', estado: 'FullyDecrypted', protegido: false }] },
        todas_defensas_activas: false,
      },
      meta: { timestamp: ts(), duracion_ms: 920 },
    }),
    scan_startup: () => ({
      ok: true,
      data: {
        registro: [
          { origen: 'HKCU\\Run', nombre: 'HOW_TO_RESTORE', comando: 'C:\\Users\\Usuario\\Desktop\\HOW_TO_RESTORE.exe' },
          { origen: 'HKCU\\Run', nombre: 'OneDrive',       comando: 'C:\\Program Files\\Microsoft OneDrive\\OneDrive.exe /background' },
        ],
        tareas_programadas: [],
      },
      meta: { timestamp: ts(), duracion_ms: 225, total_registro: 2, total_tareas: 0 },
    }),
    scan_patches: () => ({
      ok: true,
      data: {
        actualizaciones_pendientes: [
          { kb: 'KB5029928', titulo: 'Parche crítico para protocolo SMB (CVE-2024-38063)', reinicio_requerido: true },
          { kb: 'KB5034441', titulo: 'Actualización de seguridad crítica para Windows 11 (CVE-2024-21334)', reinicio_requerido: true },
          { kb: 'KB5031539', titulo: 'Actualización de Windows Defender Antivirus', reinicio_requerido: false },
        ],
        ultima_actualizacion_exitosa: new Date(Date.now() - 45 * 86400000).toISOString().split('T')[0],
        sistema_actualizado: false,
      },
      meta: { timestamp: ts(), duracion_ms: 1620, metodo: 'WUA COM', total_pendientes: 3 },
    }),
  },

  // ── Escenario 7: Gusano de Red — propagación por SMB (EternalBlue) ────────
  7: {
    scan_ports: () => ({
      ok: true,
      data: [
        { pid: 9301, proceso: 'System',      local: '0.0.0.0:445',    remoto: '192.168.1.15:49234',  estado: 'ESTABLISHED' },
        { pid: 9301, proceso: 'System',      local: '0.0.0.0:445',    remoto: '192.168.1.22:51102',  estado: 'ESTABLISHED' },
        { pid: 9301, proceso: 'System',      local: '0.0.0.0:445',    remoto: '192.168.1.31:50019',  estado: 'ESTABLISHED' },
        { pid: 9301, proceso: 'System',      local: '0.0.0.0:445',    remoto: '10.0.0.105:52341',    estado: 'ESTABLISHED' },
        { pid: 9301, proceso: 'System',      local: '0.0.0.0:445',    remoto: '',                    estado: 'LISTEN'      },
        { pid: 3310, proceso: 'worm_svc.exe',local: '0.0.0.0:49200',  remoto: '91.108.4.140:443',    estado: 'ESTABLISHED' },
        { pid: 4,    proceso: 'System',      local: '0.0.0.0:135',    remoto: '',                    estado: 'LISTEN'      },
      ],
      meta: { timestamp: ts(), duracion_ms: 92, total: 7 },
    }),
    scan_processes: () => ({
      ok: true,
      data: [
        { pid: 3310, nombre: 'worm_svc.exe', cpu_pct: 34.2, ram_mb: 126.0, ruta: '',                                              usuario: 'SYSTEM',  alerta_cpu: false, alerta_ram: false, sin_ruta: true  },
        { pid: 3320, nombre: 'cmd.exe',      cpu_pct: 8.1,  ram_mb: 8.0,   ruta: 'C:\\Windows\\System32\\cmd.exe',               usuario: 'SYSTEM',  alerta_cpu: false, alerta_ram: false, sin_ruta: false },
        { pid: 1032, nombre: 'svchost.exe',  cpu_pct: 22.3, ram_mb: 58.0,  ruta: 'C:\\Windows\\System32\\svchost.exe',           usuario: 'SYSTEM',  alerta_cpu: false, alerta_ram: false, sin_ruta: false },
        { pid: 812,  nombre: 'explorer.exe', cpu_pct: 0.3,  ram_mb: 88.0,  ruta: 'C:\\Windows\\explorer.exe',                   usuario: 'Usuario', alerta_cpu: false, alerta_ram: false, sin_ruta: false },
      ],
      meta: { timestamp: ts(), duracion_ms: 350, total: 4, alertas: 1 },
    }),
    scan_defenses: () => ({
      ok: true,
      data: {
        firewall:  { activo: false, perfiles: [{ nombre: 'Domain', habilitado: true }, { nombre: 'Private', habilitado: true }, { nombre: 'Public', habilitado: false }] },
        antivirus: { activo: true, detalle: { AMServiceEnabled: true, RealTimeProtectionEnabled: true, AntivirusEnabled: true } },
        bitlocker: { activo: false, volumenes: [{ unidad: 'C:', estado: 'FullyDecrypted', protegido: false }] },
        todas_defensas_activas: false,
      },
      meta: { timestamp: ts(), duracion_ms: 895 },
    }),
    scan_startup: () => ({
      ok: true,
      data: {
        registro: [
          { origen: 'HKLM\\Run', nombre: 'WormServices', comando: 'C:\\Windows\\System32\\worm_svc.exe --persist' },
          { origen: 'HKCU\\Run', nombre: 'OneDrive',     comando: 'C:\\Program Files\\Microsoft OneDrive\\OneDrive.exe /background' },
        ],
        tareas_programadas: [],
      },
      meta: { timestamp: ts(), duracion_ms: 215, total_registro: 2, total_tareas: 0 },
    }),
    scan_patches: () => ({
      ok: true,
      data: {
        actualizaciones_pendientes: [
          { kb: 'MS17-010', titulo: 'Parche crítico para SMB — EternalBlue (CVE-2017-0144)', reinicio_requerido: true },
          { kb: 'KB5034441',titulo: 'Actualización de seguridad crítica para Windows 11', reinicio_requerido: true },
          { kb: 'KB5029928',titulo: 'Parche para protocolo SMB v2 (CVE-2024-38063)', reinicio_requerido: true },
        ],
        ultima_actualizacion_exitosa: new Date(Date.now() - 60 * 86400000).toISOString().split('T')[0],
        sistema_actualizado: false,
      },
      meta: { timestamp: ts(), duracion_ms: 1710, metodo: 'WUA COM', total_pendientes: 3 },
    }),
  },

  // ── Escenario 8: Botnet zombie — Emotet C2 beacon ─────────────────────────
  8: {
    scan_processes: () => ({
      ok: true,
      data: [
        { pid: 7720, nombre: 'powershell.exe', cpu_pct: 4.2, ram_mb: 95.0,  ruta: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', usuario: 'SYSTEM',  alerta_cpu: false, alerta_ram: false, sin_ruta: false },
        { pid: 7721, nombre: 'wscript.exe',    cpu_pct: 1.1, ram_mb: 22.0,  ruta: 'C:\\Windows\\System32\\wscript.exe',                              usuario: 'Usuario', alerta_cpu: false, alerta_ram: false, sin_ruta: false },
        { pid: 812,  nombre: 'explorer.exe',   cpu_pct: 0.4, ram_mb: 90.0,  ruta: 'C:\\Windows\\explorer.exe',                                       usuario: 'Usuario', alerta_cpu: false, alerta_ram: false, sin_ruta: false },
        { pid: 1032, nombre: 'svchost.exe',    cpu_pct: 0.9, ram_mb: 44.0,  ruta: 'C:\\Windows\\System32\\svchost.exe',                              usuario: 'SYSTEM',  alerta_cpu: false, alerta_ram: false, sin_ruta: false },
        { pid: 2841, nombre: 'chrome.exe',     cpu_pct: 5.3, ram_mb: 298.0, ruta: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',      usuario: 'Usuario', alerta_cpu: false, alerta_ram: false, sin_ruta: false },
      ],
      meta: { timestamp: ts(), duracion_ms: 365, total: 5, alertas: 0 },
    }),
    scan_ports: () => ({
      ok: true,
      data: [
        { pid: 7720, proceso: 'powershell.exe', local: '0.0.0.0:50342', remoto: '203.0.113.44:80',    estado: 'ESTABLISHED' },
        { pid: 7720, proceso: 'powershell.exe', local: '0.0.0.0:50343', remoto: '198.51.100.77:443',  estado: 'ESTABLISHED' },
        { pid: 7720, proceso: 'powershell.exe', local: '0.0.0.0:50344', remoto: '192.0.2.133:8080',   estado: 'ESTABLISHED' },
        { pid: 7721, proceso: 'wscript.exe',    local: '0.0.0.0:50399', remoto: '185.220.101.18:443', estado: 'TIME_WAIT'   },
        { pid: 4,    proceso: 'System',         local: '0.0.0.0:445',   remoto: '',                   estado: 'LISTEN'      },
        { pid: 2841, proceso: 'chrome.exe',     local: '127.0.0.1:49312',remoto: '142.250.184.1:443', estado: 'ESTABLISHED' },
      ],
      meta: { timestamp: ts(), duracion_ms: 79, total: 6 },
    }),
    scan_defenses: () => ({
      ok: true,
      data: {
        firewall:  { activo: true, perfiles: [{ nombre: 'Domain', habilitado: true }, { nombre: 'Private', habilitado: true }, { nombre: 'Public', habilitado: true }] },
        antivirus: { activo: true, detalle: { AMServiceEnabled: true, RealTimeProtectionEnabled: true, AntivirusEnabled: true } },
        bitlocker: { activo: false, volumenes: [{ unidad: 'C:', estado: 'FullyDecrypted', protegido: false }] },
        todas_defensas_activas: false,
      },
      meta: { timestamp: ts(), duracion_ms: 875 },
    }),
    scan_startup: () => ({
      ok: true,
      data: {
        registro: [
          { origen: 'HKCU\\Run', nombre: 'WindowsUpdate', comando: 'wscript.exe C:\\Users\\Usuario\\AppData\\Roaming\\update.vbs' },
          { origen: 'HKCU\\Run', nombre: 'OneDrive',      comando: 'C:\\Program Files\\Microsoft OneDrive\\OneDrive.exe /background' },
          { origen: 'HKCU\\Run', nombre: 'Discord',       comando: 'C:\\Users\\Usuario\\AppData\\Local\\Discord\\Update.exe --processStart Discord.exe' },
        ],
        tareas_programadas: [
          { nombre: '\\EmotetBeacon', estado: 'Ready', siguiente_ejecucion: new Date(Date.now() + 60000).toISOString() },
        ],
      },
      meta: { timestamp: ts(), duracion_ms: 240, total_registro: 3, total_tareas: 1 },
    }),
    scan_patches: () => ({
      ok: true,
      data: {
        actualizaciones_pendientes: [
          { kb: 'KB5034441', titulo: 'Actualización de seguridad crítica para Windows 11 (CVE-2024-21334)', reinicio_requerido: true },
          { kb: 'KB5031539', titulo: 'Actualización de Windows Defender Antivirus', reinicio_requerido: false },
        ],
        ultima_actualizacion_exitosa: new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0],
        sistema_actualizado: false,
      },
      meta: { timestamp: ts(), duracion_ms: 480, metodo: 'WUA COM', total_pendientes: 2 },
    }),
  },
};

// ── Tarjetas educativas ───────────────────────────────────────────────────────
// enciclopedia_id conecta con el id de AMENAZAS en enciclopedia.js

const TARJETAS = {
  1: {
    scan_ports: {
      nivel: 'critico', icono: '🚨',
      enciclopedia_id: 'rat', enciclopedia_nombre: 'Troyano de Acceso Remoto (RAT)',
      titulo: 'Puerto 4444 — Firma de herramienta de acceso remoto',
      que: 'El puerto 4444 es la firma por defecto de <strong>Metasploit Framework</strong>, la suite de pentesting más utilizada, y de numerosos troyanos de acceso remoto (RAT). Una conexión ESTABLISHED a una IP externa en este puerto indica que alguien podría estar controlando tu equipo en este momento.',
      hacer: 'Desconecta el equipo de la red inmediatamente. Ejecuta un análisis completo con Windows Defender en modo fuera de línea. Contacta con soporte técnico antes de volver a conectar.',
      herramienta: 'Microsoft Safety Scanner (msert.exe)',
    },
    scan_startup: {
      nivel: 'alto', icono: '⚠️',
      enciclopedia_id: 'rat', enciclopedia_nombre: 'Troyano de Acceso Remoto (RAT)',
      titulo: 'Entrada sospechosa en el autoinicio',
      que: 'Se detectó un programa desconocido configurado para iniciarse automáticamente desde la carpeta AppData/Roaming. Los programas maliciosos se instalan en estas ubicaciones para sobrevivir a los reinicios del sistema.',
      hacer: 'No reinicies el equipo todavía. Identifica el archivo y analízalo con VirusTotal antes de eliminarlo. Si es malware, usa Malwarebytes para una limpieza completa.',
      herramienta: 'Malwarebytes Free',
    },
  },
  2: {
    scan_processes: {
      nivel: 'critico', icono: '🚨',
      enciclopedia_id: 'cryptojacker', enciclopedia_nombre: 'Cryptojacker',
      titulo: 'Proceso sospechoso: svchost32.exe al 99% de CPU',
      que: '<strong>svchost32.exe no existe en Windows</strong>. El proceso legítimo se llama <code>svchost.exe</code> (sin el "32"). Este proceso sin ruta conocida consumiendo toda la CPU es una señal clásica de un <strong>minero de criptomonedas</strong> o ransomware en fase de cifrado.',
      hacer: 'Abre el Administrador de tareas (Ctrl+Shift+Esc) y termina el proceso. Acto seguido ejecuta un análisis completo. Comprueba que tus archivos no hayan sido cifrados antes de apagar el equipo.',
      herramienta: 'Malwarebytes AdwCleaner',
    },
    scan_ports: {
      nivel: 'alto', icono: '⚠️',
      enciclopedia_id: 'cryptojacker', enciclopedia_nombre: 'Cryptojacker',
      titulo: 'Conexión saliente no identificada',
      que: 'El proceso sospechoso mantiene una conexión activa con una IP externa en el puerto 443. Los malware modernos usan el puerto 443 para camuflar sus comunicaciones con el servidor de comando y control (C2) como tráfico web normal.',
      hacer: 'Bloquea el proceso en el Firewall de Windows. Revisa los logs del router para identificar el volumen de datos enviados.',
      herramienta: 'Windows Firewall con seguridad avanzada',
    },
  },
  3: {
    scan_defenses: {
      nivel: 'critico', icono: '🚨',
      titulo: 'Sistema completamente desprotegido',
      que: 'El Firewall, el Antivirus y el cifrado de disco están <strong>todos desactivados</strong>. Un sistema en este estado está expuesto a cualquier amenaza de red, instalación silenciosa de malware y robo de datos. Es el equivalente a dejar la puerta de casa abierta de par en par.',
      hacer: 'Activa el Firewall de Windows desde el Panel de Control. Activa Windows Defender desde Seguridad de Windows. Considera activar BitLocker si el equipo es portátil.',
      herramienta: 'Centro de Seguridad de Windows',
    },
    scan_patches: {
      nivel: 'alto', icono: '⚠️',
      titulo: '14 actualizaciones pendientes — 30 días sin parchear',
      que: 'Entre las actualizaciones pendientes hay parches para <strong>vulnerabilidades críticas</strong> con CVE asignado. Estas vulnerabilidades son conocidas públicamente y existen exploits funcionales disponibles. Cada día sin parchear es un día de exposición.',
      hacer: 'Abre Windows Update y aplica todas las actualizaciones. Reinicia el equipo. Configura las actualizaciones automáticas para que esto no vuelva a ocurrir.',
      herramienta: 'Windows Update (Configuración → Windows Update)',
    },
  },
  4: {
    scan_processes: {
      nivel: 'alto', icono: '⚠️',
      enciclopedia_id: 'keylogger', enciclopedia_nombre: 'Keylogger',
      titulo: 'Proceso sin ruta con persistencia en el registro',
      que: '<strong>agent_upd.exe</strong> está ejecutándose sin ruta conocida y con una entrada de autoinicio en el registro. Los keyloggers como Agent Tesla y Snake Keylogger usan nombres similares a herramientas legítimas del sistema para pasar desapercibidos.',
      hacer: 'Cambia inmediatamente las contraseñas de todas tus cuentas desde un dispositivo limpio. Activa la autenticación en dos pasos. Ejecuta un análisis completo con Malwarebytes.',
      herramienta: 'Malwarebytes, SpyBot Search & Destroy',
    },
    scan_ports: {
      nivel: 'critico', icono: '🚨',
      enciclopedia_id: 'keylogger', enciclopedia_nombre: 'Keylogger',
      titulo: 'Exfiltración activa de datos por SMTP (puertos 25/587)',
      que: 'El proceso sospechoso está enviando datos activamente a través de los puertos de correo electrónico (25 y 587). Esto es la firma inequívoca de un <strong>keylogger con módulo de exfiltración por email</strong> — tus contraseñas, mensajes y datos bancarios pueden estar siendo enviados en este momento.',
      hacer: 'Desconecta el equipo de la red ahora. La exfiltración ya ha comenzado: notifica a tu banco y cambia contraseñas críticas desde otro dispositivo. Contacta con soporte técnico.',
      herramienta: 'Malwarebytes, análisis offline de Windows Defender',
    },
    scan_startup: {
      nivel: 'alto', icono: '⚠️',
      enciclopedia_id: 'keylogger', enciclopedia_nombre: 'Keylogger',
      titulo: 'Keylogger con tarea programada de persistencia',
      que: 'Además de la entrada en el registro, el malware ha creado una tarea programada \\AgentUpdate que lo reinstalará si lo eliminas manualmente. Esta técnica de doble persistencia es característica de keyloggers comerciales como Agent Tesla.',
      hacer: 'Elimina tanto la entrada del registro como la tarea programada. Utiliza una herramienta especializada (Malwarebytes) para asegurarte de eliminar todos los componentes.',
      herramienta: 'Malwarebytes + autoruns de Sysinternals',
    },
  },
  5: {
    scan_processes: {
      nivel: 'critico', icono: '🚨',
      enciclopedia_id: 'cryptojacker', enciclopedia_nombre: 'Cryptojacker',
      titulo: 'XMRig detectado — Minero de Monero al 95% CPU',
      que: '<strong>xmrig.exe</strong> es el minero de Monero de código abierto más usado por atacantes. Está secuestrando casi toda la capacidad de tu procesador para generar criptomonedas para el atacante. El uso elevado de CPU acorta la vida útil del procesador, dispara el consumo eléctrico y hace el equipo inutilizable.',
      hacer: 'Termina el proceso xmrig.exe desde el Administrador de tareas. Elimina la tarea programada \\XMRigMaintain. Ejecuta un análisis completo con Malwarebytes.',
      herramienta: 'Malwarebytes, extensión minerBlock',
    },
    scan_ports: {
      nivel: 'critico', icono: '🚨',
      enciclopedia_id: 'cryptojacker', enciclopedia_nombre: 'Cryptojacker',
      titulo: 'Conexión activa a pool de minería (puertos 3333/14444)',
      que: 'Los puertos 3333 y 14444 son los puertos estándar del protocolo Stratum, usado exclusivamente para la minería de criptomonedas. El equipo está conectado a un pool de minería y transfiriendo hashrate (capacidad de cómputo) al atacante en tiempo real.',
      hacer: 'Bloquea los puertos 3333 y 14444 en el Firewall de Windows. Esto detendrá la minería aunque el proceso siga activo, y te dará tiempo para eliminarlo limpiamente.',
      herramienta: 'Windows Firewall con seguridad avanzada',
    },
    scan_startup: {
      nivel: 'alto', icono: '⚠️',
      enciclopedia_id: 'cryptojacker', enciclopedia_nombre: 'Cryptojacker',
      titulo: 'Tarea programada \\XMRigMaintain garantiza la persistencia',
      que: 'El cryptojacker ha creado una tarea programada camuflada como mantenimiento del sistema. Si terminas el proceso xmrig.exe sin eliminar esta tarea, el minero se reiniciará automáticamente en minutos.',
      hacer: 'Abre el Programador de tareas (taskschd.msc) y elimina \\XMRigMaintain. Luego elimina el proceso y ejecuta un análisis completo.',
      herramienta: 'Programador de tareas de Windows + Malwarebytes',
    },
  },
  6: {
    scan_processes: {
      nivel: 'critico', icono: '🚨',
      enciclopedia_id: 'ransomware', enciclopedia_nombre: 'Ransomware',
      titulo: '¡CIFRADO EN CURSO! Ransomware activo en el sistema',
      que: '<strong>decrypt_help.exe al 98% de CPU</strong> indica que el ransomware está cifrando tus archivos ahora mismo. <strong>vssadmin.exe</strong> está siendo usado para eliminar las copias de seguridad de Windows (Volume Shadow Copies), bloqueando cualquier posibilidad de recuperación sin pagar el rescate.',
      hacer: '⚡ ACTÚA AHORA: Apaga el equipo pulsando el botón de encendido durante 5 segundos. No reinicies. Cada segundo que el equipo sigue funcionando son más archivos cifrados. Consulta No More Ransom antes de plantearte pagar.',
      herramienta: 'No More Ransom (nomoreransom.org)',
    },
    scan_defenses: {
      nivel: 'critico', icono: '🚨',
      enciclopedia_id: 'ransomware', enciclopedia_nombre: 'Ransomware',
      titulo: 'Windows Defender desactivado por el ransomware',
      que: 'El ransomware ha desactivado el antivirus como primer paso de la infección. Esta es una técnica estándar documentada en el MITRE ATT&CK como T1562.001 (Disable or Modify Tools). Sin protección, el cifrado avanza sin obstáculos.',
      hacer: 'No intentes reactivar el antivirus mientras el ransomware está activo. Apaga el equipo inmediatamente para detener el cifrado. La recuperación debe realizarse desde un entorno externo limpio.',
      herramienta: 'Windows Defender Offline Scan (desde dispositivo externo)',
    },
    scan_startup: {
      nivel: 'alto', icono: '⚠️',
      enciclopedia_id: 'ransomware', enciclopedia_nombre: 'Ransomware',
      titulo: 'Nota de rescate instalada en el autoinicio',
      que: 'HOW_TO_RESTORE.exe en el autoinicio es la nota de rescate del ransomware, que se abrirá en cada inicio. Los ransomware modernos también usan el autoinicio para intentar continuar el cifrado si el equipo se reinicia durante el proceso.',
      hacer: 'No ejecutes HOW_TO_RESTORE.exe. No pagues el rescate sin consultar primero nomoreransom.org — puede que exista una herramienta de descifrado gratuita para esta variante.',
      herramienta: 'No More Ransom · ID Ransomware (id-ransomware.malwarehunterteam.com)',
    },
  },
  7: {
    scan_ports: {
      nivel: 'critico', icono: '🚨',
      enciclopedia_id: 'gusano', enciclopedia_nombre: 'Gusano de Red',
      titulo: 'Escáneo masivo SMB — El gusano se está propagando',
      que: 'El equipo tiene 4 conexiones simultáneas entrantes en el puerto 445 (SMB) desde diferentes IPs de la red local. Esto indica que el gusano está <strong>ya propagado en la red</strong> y está intentando explotar la vulnerabilidad EternalBlue (CVE-2017-0144) en otros equipos cercanos.',
      hacer: 'Aísla TODOS los equipos de la red inmediatamente desconectando el switch/router. Aplica el parche MS17-010 en todos los equipos antes de reconectar. El gusano puede estar en múltiples máquinas simultáneamente.',
      herramienta: 'Microsoft Safety Scanner + parche MS17-010',
    },
    scan_patches: {
      nivel: 'critico', icono: '🚨',
      enciclopedia_id: 'gusano', enciclopedia_nombre: 'Gusano de Red',
      titulo: 'Parche EternalBlue (MS17-010) no instalado',
      que: 'CVE-2017-0144 (EternalBlue) lleva <strong>más de 7 años sin parchear</strong> en este equipo. Esta es la misma vulnerabilidad explotada por WannaCry en 2017, que paralizó el NHS, Telefónica, Renault y más de 200.000 equipos en 150 países en 24 horas. Sin el parche, cualquier equipo en la misma red puede infectar al tuyo.',
      hacer: 'Descarga e instala MS17-010 de forma inmediata (disponible en el Catálogo de Windows Update). Deshabilita SMBv1 en todos los equipos de la red. Segmenta la red con VLANs.',
      herramienta: 'Microsoft Baseline Security Analyzer + parche MS17-010',
    },
    scan_defenses: {
      nivel: 'alto', icono: '⚠️',
      enciclopedia_id: 'gusano', enciclopedia_nombre: 'Gusano de Red',
      titulo: 'Firewall público desactivado — Red sin protección de perímetro',
      que: 'El perfil público del Firewall de Windows está desactivado. Esto elimina la primera línea de defensa contra el escaneo y explotación de puertos desde la red. El gusano aprovecha esta ausencia para escanear sin ser bloqueado.',
      hacer: 'Activa el Firewall en todos los perfiles. Crea una regla que bloquee el tráfico entrante al puerto 445 desde IPs externas. Deshabilita SMBv1 con PowerShell: Set-SmbServerConfiguration -EnableSMB1Protocol $false',
      herramienta: 'Windows Firewall + PowerShell (deshabilitar SMBv1)',
    },
  },
  8: {
    scan_ports: {
      nivel: 'critico', icono: '🚨',
      enciclopedia_id: 'botnet', enciclopedia_nombre: 'Botnet',
      titulo: 'Equipo zombie — Beacon C2 activo (Emotet)',
      que: '<strong>powershell.exe</strong> mantiene 3 conexiones simultáneas salientes a IPs externas en puertos HTTP/HTTPS. Este patrón es la firma del beacon de Emotet: el bot consulta al servidor C2 cada 60 segundos esperando instrucciones. Tu equipo puede estar participando en ataques DDoS, envío de spam o distribución de más malware en este momento.',
      hacer: 'Bloquea las conexiones de powershell.exe en el Firewall. Ejecuta el escáner de Microsoft Safety Scanner. Notifica a tu proveedor de internet ya que tu IP probablemente esté en listas negras antispam.',
      herramienta: 'Microsoft Safety Scanner, ESET Online Scanner',
    },
    scan_startup: {
      nivel: 'critico', icono: '🚨',
      enciclopedia_id: 'botnet', enciclopedia_nombre: 'Botnet',
      titulo: 'Script VBS malicioso y tarea programada de beacon',
      que: 'La entrada <strong>WindowsUpdate → update.vbs</strong> en el registro es el dropper de la botnet, camuflado con un nombre de Windows. La tarea \\EmotetBeacon se ejecutará en 60 segundos para contactar con el servidor C2. Esta es la arquitectura clásica de persistencia de Emotet.',
      hacer: 'Elimina update.vbs, la entrada de registro y la tarea \\EmotetBeacon. Luego ejecuta un análisis completo — Emotet suele actuar como downloader de otros malware (TrickBot, Ryuk).',
      herramienta: 'Malwarebytes + Sysinternals Autoruns',
    },
    scan_processes: {
      nivel: 'alto', icono: '⚠️',
      enciclopedia_id: 'botnet', enciclopedia_nombre: 'Botnet',
      titulo: 'powershell.exe y wscript.exe con tráfico de red anómalo',
      que: 'PowerShell es una herramienta legítima de administración, pero los atacantes la abusan constantemente (técnica "living off the land") porque suele estar en listas blancas del antivirus. Combinado con wscript.exe ejecutando un .vbs, este es el patrón de infección inicial de Emotet y otras botnets modernas.',
      hacer: 'Configura las políticas de ejecución de PowerShell (Set-ExecutionPolicy RemoteSigned) y habilita el registro de scripts de PowerShell para detectar abusos futuros.',
      herramienta: 'PowerShell Script Block Logging + Windows Defender',
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
    this.activo    = false;
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
    const latencia = 300 + Math.random() * 600;
    return new Promise(resolve => setTimeout(() => resolve(datos()), latencia));
  },

  tarjeta(action) {
    return this.escenario ? TARJETAS[this.escenario]?.[action] : null;
  },
};

// ── Navegación a la enciclopedia ──────────────────────────────────────────────

window.navegarEnciclopedia = function (id) {
  // Activa el tab de enciclopedia
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  const navBtn = document.querySelector('[data-panel="enciclopedia"]');
  if (navBtn) navBtn.classList.add('active');
  const panel = document.getElementById('panel-enciclopedia');
  if (panel) panel.classList.add('active');
  // Abre el modal (enciclopedia.js expone abrirModal globalmente)
  if (typeof abrirModal === 'function') {
    setTimeout(() => abrirModal(id), 80);
  }
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

  const encBtn = info.enciclopedia_id ? `
    <button class="tarjeta-edu-enc-btn"
            onclick="navegarEnciclopedia('${info.enciclopedia_id}')">
      📖 Aprende más sobre ${info.enciclopedia_nombre || info.enciclopedia_id} →
    </button>` : '';

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
      ${encBtn ? `<div class="tarjeta-edu-footer">${encBtn}</div>` : ''}
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
