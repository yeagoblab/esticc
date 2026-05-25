/**
 * i18n.js — Sistema de internacionalización de ESTICC.
 * Idiomas: español (es) e inglés (en).
 * Uso: t('seccion.clave') → cadena traducida en el idioma activo.
 */

const ESTICC_STRINGS = {

  /* ── ESPAÑOL ─────────────────────────────────────────────────────── */
  es: {
    nav: {
      defensas:      'Defensas',
      puertos:       'Puertos',
      procesos:      'Procesos',
      autoinicio:    'Autoinicio',
      parches:       'Parches',
      enciclopedia:  'Enciclopedia',
      radar:         'Radar OSINT',
      reportes:      'Informe',
      historial:     'Historial',
      configuracion: 'Configuración',
    },
    paneles: {
      defensas_titulo:      'Estado de las Defensas del Sistema',
      puertos_titulo:       'Puertos TCP Abiertos',
      procesos_titulo:      'Procesos Activos',
      autoinicio_titulo:    'Programas de Autoinicio',
      parches_titulo:       'Actualizaciones del Sistema',
      radar_titulo:         'Radar de Amenazas OSINT',
      radar_fuentes:        'Monitoriza 6 fuentes · NIST NVD · Bleeping Computer · Krebs · SANS · The Hacker News · Reddit r/netsec',
      reportes_titulo:      'Informe de Seguridad del Sistema',
      reportes_desc:        'Ejecuta los 5 escáneres, calcula la puntuación de riesgo global y genera un informe completo exportable a PDF. El análisis puede tardar hasta 30 segundos.',
      historial_titulo:     'Historial de Análisis',
      enciclopedia_titulo:  'Enciclopedia de Malware',
      configuracion_titulo: 'Configuración',
    },
    botones: {
      analizar:            'Analizar ahora',
      escanear_puertos:    'Escanear puertos',
      escanear_procesos:   'Escanear procesos',
      analizar_autoinicio: 'Analizar autoinicio',
      comprobar_parches:   'Comprobar parches',
      actualizar_radar:    'Actualizar radar',
      generar_informe:     'Generar informe completo',
      guardar_pdf:         '🖨️ Guardar PDF',
      actualizar_hist:     'Actualizar',
      modo_demo:           '⚠️ Modo Demo',
      modo_basico:         'Modo Básico',
      modo_avanzado:       'Modo Avanzado',
    },
    estados: {
      activo:      'ACTIVO',
      inactivo:    'INACTIVO',
      desconocido: 'DESCONOCIDO',
      actualizado: 'Actualizado',
      analizando:  'Analizando…',
      completado:  'Análisis completado',
      error:       'Error en el análisis',
      error_com:   'Error de comunicación con el sidecar',
    },
    escudos: {
      firewall:     'Firewall',
      antivirus:    'Antivirus',
      bitlocker:    'BitLocker',
      conexiones:   'Conexiones activas',
      puertos_sosp: 'Puertos sospechosos',
      procesos:     'Procesos activos',
      a_revisar:    'Procesos a revisar',
      autoinicio:   'Programas de autoinicio',
      tareas:       'Tareas programadas',
      win_update:   'Windows Update',
    },
    msgs: {
      defensas_ok:      'Todas las defensas están activas',
      defensas_warn:    'Una o más defensas requieren atención',
      sin_puertos:      'No se encontraron conexiones TCP activas.',
      sin_procesos:     'Sin procesos detectados.',
      sin_parches:      'No hay actualizaciones pendientes.',
      sin_autoinicio:   'Sin entradas en el registro de autoinicio.',
      sin_tareas:       'Sin tareas programadas detectadas.',
      sosp_investiga:   'Requieren investigación',
      sosp_ninguno:     'Sin puertos de riesgo',
      sosp_badge:       'sospechoso',
      cpu_desc:         'en ejecución ahora',
      proc_desc:        'CPU/RAM elevada o sin ruta',
      proc_top:         'Top procesos por uso de CPU',
      sin_ruta:         'sin ruta',
      revisar:          'revisar',
      reg_entries:      'entradas en el registro',
      en_sistema:       'en el sistema',
      ultima_act:       'Última actualización exitosa:',
      pendientes:       'actualización(es) pendiente(s)',
      consultado:       'Consultado:',
      ultimo_analisis:  'Último análisis:',
    },
    tabla: {
      impacto:       'Impacto',
      origen:        'Origen',
      nombre:        'Nombre',
      comando:       'Comando',
      proceso:       'Proceso',
      pid:           'PID',
      cpu:           'CPU',
      ram:           'RAM',
      alerta:        'Alerta',
      local:         'Local',
      remoto:        'Remoto',
      estado:        'Estado',
      kb:            'KB',
      titulo:        'Título',
      reinicio:      'Reinicio',
      reinicio_req:  'Requerido',
      tareas_title:  'Tareas Programadas',
      reg_title:     'Registro (Run / RunOnce)',
      prox_ejec:     'Próxima ejecución',
    },
    config: {
      titulo:             'Configuración',
      perfil_titulo:      'Perfil de Usuario',
      perfil_desc:        'Personaliza la experiencia según tu nivel de conocimientos técnicos.',
      rol_estudiante:     'Estudiante',
      rol_mayor:          'Persona Mayor',
      rol_pyme:           'Pequeña PYME',
      rol_pyme_med:       'Mediana PYME',
      rol_admin:          'Administrador',
      rol_est_desc:       'Explicaciones educativas, modo básico por defecto',
      rol_mayor_desc:     'Tipografía más grande, lenguaje simplificado',
      rol_pyme_desc:      'Contexto empresarial, recomendaciones de seguridad',
      rol_pyme_med_desc:  'Análisis detallado para entornos corporativos',
      rol_admin_desc:     'Modo avanzado automático, datos técnicos completos',
      interfaz_titulo:    'Interfaz y Aspecto Visual',
      tema_label:         'Tema visual',
      tema_oscuro:        '🌙 Oscuro',
      tema_claro:         '☀️ Claro',
      idioma_label:       'Idioma',
      sistema_titulo:     'Sistema y Exportación',
      historial_label:    'Guardar historial local de análisis',
      ruta_label:         'Ruta de exportación por defecto',
      ruta_placeholder:   'Ej: C:\\Users\\Usuario\\Escritorio',
      muestreo_label:     'Tiempo de muestreo al analizar',
      muestreo_rapido:    '⚡ Rápido (2s)',
      muestreo_balanceado:'⚖️ Balanceado (3s)',
      muestreo_preciso:   '🔬 Preciso (5s)',
      guardar_btn:        'Guardar cambios',
      guardado:           'Configuración guardada',
      enc_note:           'La Enciclopedia de Malware está disponible solo en español en esta versión.',
      // ── Prioridad 5: Escaneo automático y recordatorio (background.js) ──────
      autoscan_label:     'Analizar automáticamente al abrir la aplicación',  // Toggle del panel config
      autoscan_desc:      'Ejecuta los 5 escáneres al iniciar sin necesidad de pulsar ningún botón',
      recordatorio_label: 'Recordatorio si no analizo en',                    // Label del selector de días
      rec_nunca:          'Nunca',    // Opción para desactivar el recordatorio completamente
      rec_1d:             '1 día',    // Umbral de 1 día (para usuarios que quieren monitoreo diario)
      rec_3d:             '3 días',   // Umbral de 3 días (revisión frecuente)
      rec_7d:             '7 días',   // Umbral de 7 días (valor por defecto: una semana)
      rec_14d:            '14 días',  // Umbral de 14 días (quincenal)
      rec_30d:            '30 días',  // Umbral de 30 días (mensual)
    },
    bg: {
      // Cadenas usadas por background.js para construir el banner y los toasts del auto-scan
      banner_hace:        'Hace',                               // Parte inicial del mensaje: "Hace X días…"
      banner_dias_sin:    'días sin analizar el sistema.',      // Parte final del mensaje del banner
      banner_cta:         'Analizar ahora',                     // Botón de acción del banner
      banner_cerrar:      'Ignorar',                            // Botón para descartar el banner sin escanear
      autoscan_inicio:    'Iniciando análisis automático…',     // Toast que aparece al comenzar el auto-scan
      autoscan_ok:        'Análisis automático completado',     // Toast de éxito al terminar el auto-scan
    },
  },

  /* ── ENGLISH ─────────────────────────────────────────────────────── */
  en: {
    nav: {
      defensas:      'Defenses',
      puertos:       'Ports',
      procesos:      'Processes',
      autoinicio:    'Startup',
      parches:       'Patches',
      enciclopedia:  'Encyclopedia',
      radar:         'OSINT Radar',
      reportes:      'Report',
      historial:     'History',
      configuracion: 'Settings',
    },
    paneles: {
      defensas_titulo:      'System Defense Status',
      puertos_titulo:       'Open TCP Ports',
      procesos_titulo:      'Active Processes',
      autoinicio_titulo:    'Startup Programs',
      parches_titulo:       'System Updates',
      radar_titulo:         'OSINT Threat Radar',
      radar_fuentes:        'Monitors 6 sources · NIST NVD · Bleeping Computer · Krebs · SANS · The Hacker News · Reddit r/netsec',
      reportes_titulo:      'System Security Report',
      reportes_desc:        'Runs all 5 scanners, calculates the global risk score and generates a complete PDF-exportable report. Analysis may take up to 30 seconds.',
      historial_titulo:     'Analysis History',
      enciclopedia_titulo:  'Malware Encyclopedia',
      configuracion_titulo: 'Settings',
    },
    botones: {
      analizar:            'Analyze now',
      escanear_puertos:    'Scan ports',
      escanear_procesos:   'Scan processes',
      analizar_autoinicio: 'Analyze startup',
      comprobar_parches:   'Check patches',
      actualizar_radar:    'Update radar',
      generar_informe:     'Generate full report',
      guardar_pdf:         '🖨️ Save PDF',
      actualizar_hist:     'Refresh',
      modo_demo:           '⚠️ Demo Mode',
      modo_basico:         'Basic Mode',
      modo_avanzado:       'Advanced Mode',
    },
    estados: {
      activo:      'ACTIVE',
      inactivo:    'INACTIVE',
      desconocido: 'UNKNOWN',
      actualizado: 'Up to date',
      analizando:  'Analyzing…',
      completado:  'Analysis complete',
      error:       'Analysis error',
      error_com:   'Communication error with sidecar',
    },
    escudos: {
      firewall:     'Firewall',
      antivirus:    'Antivirus',
      bitlocker:    'BitLocker',
      conexiones:   'Active connections',
      puertos_sosp: 'Suspicious ports',
      procesos:     'Active processes',
      a_revisar:    'Processes to review',
      autoinicio:   'Startup programs',
      tareas:       'Scheduled tasks',
      win_update:   'Windows Update',
    },
    msgs: {
      defensas_ok:      'All defenses are active',
      defensas_warn:    'One or more defenses need attention',
      sin_puertos:      'No active TCP connections found.',
      sin_procesos:     'No processes detected.',
      sin_parches:      'No pending updates.',
      sin_autoinicio:   'No startup entries found.',
      sin_tareas:       'No scheduled tasks detected.',
      sosp_investiga:   'Require investigation',
      sosp_ninguno:     'No risky ports',
      sosp_badge:       'suspicious',
      cpu_desc:         'running now',
      proc_desc:        'High CPU/RAM or no path',
      proc_top:         'Top processes by CPU usage',
      sin_ruta:         'no path',
      revisar:          'review',
      reg_entries:      'registry entries',
      en_sistema:       'in the system',
      ultima_act:       'Last successful update:',
      pendientes:       'pending update(s)',
      consultado:       'Checked:',
      ultimo_analisis:  'Last analysis:',
    },
    tabla: {
      impacto:       'Impact',
      origen:        'Origin',
      nombre:        'Name',
      comando:       'Command',
      proceso:       'Process',
      pid:           'PID',
      cpu:           'CPU',
      ram:           'RAM',
      alerta:        'Alert',
      local:         'Local',
      remoto:        'Remote',
      estado:        'State',
      kb:            'KB',
      titulo:        'Title',
      reinicio:      'Restart',
      reinicio_req:  'Required',
      tareas_title:  'Scheduled Tasks',
      reg_title:     'Registry (Run / RunOnce)',
      prox_ejec:     'Next run',
    },
    config: {
      titulo:             'Settings',
      perfil_titulo:      'User Profile',
      perfil_desc:        'Customize the experience based on your technical knowledge level.',
      rol_estudiante:     'Student',
      rol_mayor:          'Senior User',
      rol_pyme:           'Small Business',
      rol_pyme_med:       'Mid Business',
      rol_admin:          'Administrator',
      rol_est_desc:       'Educational explanations, basic mode by default',
      rol_mayor_desc:     'Larger font, simplified language',
      rol_pyme_desc:      'Business context, security recommendations',
      rol_pyme_med_desc:  'Detailed analysis for corporate environments',
      rol_admin_desc:     'Auto advanced mode, full technical data',
      interfaz_titulo:    'Interface & Appearance',
      tema_label:         'Visual theme',
      tema_oscuro:        '🌙 Dark',
      tema_claro:         '☀️ Light',
      idioma_label:       'Language',
      sistema_titulo:     'System & Export',
      historial_label:    'Save local analysis history',
      ruta_label:         'Default export path',
      ruta_placeholder:   'e.g. C:\\Users\\Username\\Desktop',
      muestreo_label:     'Analysis sampling time',
      muestreo_rapido:    '⚡ Fast (2s)',
      muestreo_balanceado:'⚖️ Balanced (3s)',
      muestreo_preciso:   '🔬 Precise (5s)',
      guardar_btn:        'Save changes',
      guardado:           'Settings saved',
      enc_note:           'The Malware Encyclopedia is only available in Spanish in this version.',
      // ── Priority 5: Auto-scan and reminder (background.js) ──────────────────
      autoscan_label:     'Automatically scan when opening the app',
      autoscan_desc:      'Runs all 5 scanners on startup without pressing any button',
      recordatorio_label: 'Remind me if I haven\'t scanned in',
      rec_nunca:          'Never',
      rec_1d:             '1 day',
      rec_3d:             '3 days',
      rec_7d:             '7 days',
      rec_14d:            '14 days',
      rec_30d:            '30 days',
    },
    bg: {
      // Strings used by background.js for the reminder banner and auto-scan toasts
      banner_hace:        'Last scan',           // Used as: "Last scan 7 days ago."
      banner_dias_sin:    'days ago.',
      banner_cta:         'Scan now',
      banner_cerrar:      'Dismiss',
      autoscan_inicio:    'Starting automatic scan…',
      autoscan_ok:        'Automatic scan complete',
    },
  },
};

window.ESTICC_LANG = 'es';

/**
 * t(key) — Devuelve la cadena en el idioma activo.
 * Acepta claves con notación punto: t('msgs.sin_puertos')
 */
function t(key) {
  const lang = window.ESTICC_LANG || 'es';
  const parts = key.split('.');
  let obj = ESTICC_STRINGS[lang] || ESTICC_STRINGS.es;
  for (const p of parts) {
    if (obj == null || typeof obj !== 'object') return key;
    obj = obj[p];
  }
  return (typeof obj === 'string') ? obj : key;
}
window.t = t;

/** Aplica las traducciones a todos los elementos con data-i18n en el DOM. */
function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const val = t(el.dataset.i18n);
    if (val !== el.dataset.i18n) el.textContent = val;
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const val = t(el.dataset.i18nPlaceholder);
    if (val !== el.dataset.i18nPlaceholder) el.placeholder = val;
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const val = t(el.dataset.i18nTitle);
    if (val !== el.dataset.i18nTitle) el.title = val;
  });
  // Actualizar lang en <html>
  document.documentElement.lang = window.ESTICC_LANG || 'es';
}
window.applyTranslations = applyTranslations;
