/**
 * config.js — Gestión de configuración de ESTICC.
 *
 * Responsabilidades:
 *  · Cargar la configuración guardada en %APPDATA%\ESTICC\config.json (via IPC) al iniciar.
 *  · Fallback a localStorage si el sidecar no está disponible (modo simulador).
 *  · Aplicar el tema visual (oscuro/claro), el rol de usuario y el idioma al <body>.
 *  · Sincronizar el formulario del panel de Configuración con el estado guardado.
 *  · Guardar los cambios vía IPC (config_set) y en localStorage como caché rápida.
 *  · Exponer window.ESTICC_CONFIG para que otros módulos puedan leer/escribir config.
 */

(function () {
  'use strict';  // Activa el modo estricto: prohíbe variables sin declarar y otras malas prácticas

  // ── Constantes ───────────────────────────────────────────────────────────────

  const STORAGE_KEY = 'esticc_config';  // Clave única en localStorage donde se guarda el JSON de config

  // Valores por defecto usados cuando el usuario abre la app por primera vez o no hay config guardada
  const DEFAULTS = {
    rol:               'estudiante',   // Perfil de usuario inicial: el más básico y educativo
    tema:              'oscuro',       // Tema visual por defecto: fondo oscuro (GitHub-style)
    idioma:            'es',           // Idioma por defecto: español
    historial_local:   true,           // Guardar historial de análisis en localStorage por defecto
    ruta_exportacion:  '',             // Ruta de exportación de PDF vacía (el usuario la rellena)
    tiempo_muestreo:   'balanceado',   // 3 segundos de muestreo al analizar (equilibrio velocidad/precisión)
    autoscan_inicio:   false,          // No auto-escanear al abrir por defecto (requiere activación explícita)
    recordatorio_dias: 7,              // Mostrar recordatorio si no se analiza en 7 días (una semana)
  };

  // ── Carga y guardado ─────────────────────────────────────────────────────────

  /**
   * cargarConfigLocal() — Lee la configuración de localStorage (caché rápida y fallback).
   */
  function cargarConfigLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? Object.assign({}, DEFAULTS, JSON.parse(raw)) : Object.assign({}, DEFAULTS);
    } catch (_) {
      return Object.assign({}, DEFAULTS);
    }
  }

  /**
   * guardarConfigLocal(cfg) — Escribe la config en localStorage como caché.
   */
  function guardarConfigLocal(cfg) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    } catch (_) {}
  }

  /**
   * cargarConfig() — Fuente primaria: %APPDATA%\ESTICC\config.json via IPC.
   * Fallback síncrono a localStorage si el sidecar no responde (modo simulador).
   * Devuelve una Promise<cfg> para poder await en DOMContentLoaded.
   */
  async function cargarConfig() {
    try {
      const resp = await window.__TAURI__.tauri.invoke('audit', { action: 'config_get' });
      if (resp && resp.ok && resp.data && Object.keys(resp.data).length > 0) {
        const cfg = Object.assign({}, DEFAULTS, resp.data);
        guardarConfigLocal(cfg);  // Sincronizar caché localStorage
        return cfg;
      }
    } catch (_) {}
    // Fallback: localStorage (modo simulador o fallo del sidecar)
    return cargarConfigLocal();
  }

  /**
   * guardarConfig(cfg) — Escribe via IPC (persistente) y en localStorage (caché).
   */
  async function guardarConfig(cfg) {
    guardarConfigLocal(cfg);  // Siempre escribir en localStorage (rápido, no falla)
    try {
      await window.__TAURI__.tauri.invoke('audit', { action: 'config_set', cfg });
    } catch (_) {}  // Si el sidecar no está disponible, localStorage es suficiente
  }

  // ── Aplicar configuración al DOM ─────────────────────────────────────────────

  /**
   * applyThema(tema) — Alterna el tema visual cambiando la clase CSS del <body>.
   * body.tema-claro sobreescribe las variables CSS :root con colores de fondo claro.
   * Si tema es 'oscuro', se elimina la clase y prevalecen los colores del :root original.
   */
  function applyThema(tema) {
    document.body.classList.toggle('tema-claro', tema === 'claro');  // true → añade clase, false → la elimina
  }

  // Roles que activan el modo avanzado automáticamente al seleccionarse.
  //  · 'administrador' → usuario técnico; necesita todas las tablas y datos raw.
  //  · 'pyme_med'      → entorno corporativo donde el responsable de IT espera la vista completa.
  // 'pyme' (pequeña PYME) NO está aquí: sus usuarios suelen ser no técnicos y
  // la vista básica con escudos visuales les resulta más clara.
  const ROLES_AVANZADO = new Set(['administrador', 'pyme_med']);

  /**
   * applyRol(rol) — Aplica todos los efectos de interfaz asociados al perfil de usuario.
   *
   * Efectos por rol:
   *  · estudiante    → modo básico por defecto; sin efectos extra (es el rol neutro)
   *  · persona_mayor → clase rol-mayor en <body> → tipografía 16px (ver config.css)
   *  · pyme          → data-rol="pyme" en <body> (reservado para CSS futuro)
   *  · pyme_med      → fuerza modo avanzado igual que administrador
   *  · administrador → fuerza modo avanzado (tablas, PID, datos técnicos)
   *
   * El badge del header se crea una sola vez en el DOM (la primera llamada) y luego
   * se reutiliza actualizando solo textContent. Esto evita acumular nodos repetidos
   * si el usuario cambia de rol varias veces sin recargar la página.
   * Se oculta para 'estudiante' porque es el valor por defecto y mostrarlo añadiría
   * ruido visual sin aportar información útil.
   */
  function applyRol(rol) {
    document.body.dataset.rol = rol;  // data-rol="xxx" en <body> → disponible como selector CSS [data-rol]
    document.body.classList.toggle('rol-mayor', rol === 'persona_mayor');  // Tipografía aumentada

    if (ROLES_AVANZADO.has(rol)) {
      // Forzar modo avanzado: añadir clase, marcar el toggle del header y cambiar su etiqueta
      document.body.classList.add('modo-avanzado');
      const cb = document.getElementById('modo-checkbox');
      if (cb) { cb.checked = true; }
      const lbl = document.getElementById('modo-label');
      // t() ya está disponible porque config.js se carga después de i18n.js en el HTML
      if (lbl) lbl.textContent = window.t ? t('botones.modo_avanzado') : 'Modo Avanzado';
    }

    // ── Badge de rol activo en el header ─────────────────────────────────────
    // Muestra un chip con el nombre del perfil activo junto al toggle de modo,
    // para que el usuario sepa en todo momento con qué perfil está trabajando.
    const NOMBRE_ROL = {
      estudiante:    'Estudiante',
      persona_mayor: 'Accesible',
      pyme:          'PYME',
      pyme_med:      'PYME Med',
      administrador: 'Admin',
    };
    let badge = document.getElementById('rol-badge-header');
    if (!badge) {
      // Primera vez: crear el nodo e insertarlo antes del toggle de modo en el header.
      // Los estilos van inline porque este elemento no tiene clase en el CSS base
      // (vive en config.js, fuera del alcance de config.css que carga antes).
      badge = document.createElement('span');
      badge.id = 'rol-badge-header';
      badge.style.cssText = [
        'font-size:11px', 'padding:2px 8px', 'border-radius:10px',
        'font-weight:600', 'background:rgba(88,166,255,0.15)',
        'color:var(--accent)', 'border:1px solid rgba(88,166,255,0.3)',
        'margin-left:4px',
      ].join(';');
      const modoToggle = document.getElementById('modo-toggle');
      const header     = document.querySelector('header');
      if (header && modoToggle) header.insertBefore(badge, modoToggle);
    }
    badge.textContent = NOMBRE_ROL[rol] || rol;
    // Ocultar para 'estudiante': es el rol por defecto y el badge añadiría ruido visual
    badge.style.display = rol === 'estudiante' ? 'none' : '';
  }

  /**
   * applyIdioma(idioma) — Cambia el idioma activo de la UI y relanza las traducciones.
   * window.ESTICC_LANG es leído por t() en i18n.js para saber qué diccionario usar.
   * applyTranslations() recorre todos los elementos con data-i18n y actualiza su textContent.
   */
  function applyIdioma(idioma) {
    window.ESTICC_LANG = idioma;  // Actualizar la variable global de idioma activo
    if (typeof window.applyTranslations === 'function') window.applyTranslations();  // Retradución del DOM
  }

  /**
   * applyAll(cfg) — Aplica todos los efectos de la configuración de una sola vez.
   * Se llama tanto al cargar la app como al guardar cambios, para mantener sincronía.
   */
  function applyAll(cfg) {
    applyThema(cfg.tema);    // 1. Primero el tema (cambia variables CSS globales)
    applyRol(cfg.rol);       // 2. Luego el rol (puede forzar modo avanzado)
    applyIdioma(cfg.idioma); // 3. Por último el idioma (retraduce el DOM con las clases ya aplicadas)
  }

  // ── Rellena el formulario con los valores actuales ───────────────────────────

  /**
   * poblarFormulario(cfg) — Sincroniza los controles del panel de Configuración con cfg.
   * Se llama una vez al cargar el DOM para que el formulario refleje la config guardada.
   * Cada grupo de botones tiene un data-valor que se compara con el valor actual de cfg.
   */
  function poblarFormulario(cfg) {

    // ── Rol: marcar como activo el botón cuyo data-valor coincide con cfg.rol ────
    document.querySelectorAll('#cfg-rol-group .cfg-btn-group-item').forEach(btn => {
      btn.classList.toggle('activo', btn.dataset.valor === cfg.rol);  // Resaltar el rol guardado
    });

    // ── Tema: marcar el botón oscuro/claro según la preferencia guardada ─────────
    document.querySelectorAll('#cfg-tema-group .cfg-btn-group-item').forEach(btn => {
      btn.classList.toggle('activo', btn.dataset.valor === cfg.tema);
    });

    // ── Idioma: marcar ES o EN según la preferencia guardada ─────────────────────
    document.querySelectorAll('#cfg-idioma-group .cfg-btn-group-item').forEach(btn => {
      btn.classList.toggle('activo', btn.dataset.valor === cfg.idioma);
    });

    // ── Tiempo de muestreo: rápido / balanceado / preciso ────────────────────────
    document.querySelectorAll('#cfg-muestreo-group .cfg-btn-group-item').forEach(btn => {
      btn.classList.toggle('activo', btn.dataset.valor === cfg.tiempo_muestreo);
    });

    // ── Checkboxes y campos de texto ─────────────────────────────────────────────

    const historialCb = document.getElementById('cfg-historial');
    if (historialCb) historialCb.checked = cfg.historial_local;  // Guardar historial local

    const autoscanCb = document.getElementById('cfg-autoscan');
    if (autoscanCb) autoscanCb.checked = cfg.autoscan_inicio || false;  // Auto-escanear al abrir

    const recSelect = document.getElementById('cfg-recordatorio');
    // String() para que el <option value="7"> se compare correctamente con el número guardado
    if (recSelect) recSelect.value = String(cfg.recordatorio_dias ?? 7);

    const rutaInput = document.getElementById('cfg-ruta');
    if (rutaInput) rutaInput.value = cfg.ruta_exportacion || '';  // Ruta de exportación PDF
  }

  // ── Leer formulario → objeto config ─────────────────────────────────────────

  /**
   * leerFormulario() — Extrae el estado actual del formulario y construye el objeto config.
   * Cada getter busca el botón marcado como 'activo' en su grupo y lee su data-valor.
   * Si el formulario no existe en el DOM (panel no cargado aún), usa el valor de DEFAULTS.
   */
  function leerFormulario() {

    // Getters para cada grupo de botones: buscan el elemento con clase 'activo'
    const getRol = () => {
      const a = document.querySelector('#cfg-rol-group .cfg-btn-group-item.activo');
      return a ? a.dataset.valor : DEFAULTS.rol;  // Fallback a 'estudiante' si ninguno está activo
    };
    const getTema = () => {
      const a = document.querySelector('#cfg-tema-group .cfg-btn-group-item.activo');
      return a ? a.dataset.valor : DEFAULTS.tema;  // Fallback a 'oscuro'
    };
    const getIdioma = () => {
      const a = document.querySelector('#cfg-idioma-group .cfg-btn-group-item.activo');
      return a ? a.dataset.valor : DEFAULTS.idioma;  // Fallback a 'es'
    };
    const getMuestreo = () => {
      const a = document.querySelector('#cfg-muestreo-group .cfg-btn-group-item.activo');
      return a ? a.dataset.valor : DEFAULTS.tiempo_muestreo;  // Fallback a 'balanceado'
    };

    // Referencias a los controles de formulario que no son botones de grupo
    const historialCb = document.getElementById('cfg-historial');   // Toggle historial local
    const autoscanCb  = document.getElementById('cfg-autoscan');    // Toggle auto-scan al iniciar
    const recSelect   = document.getElementById('cfg-recordatorio'); // Select días de recordatorio
    const rutaInput   = document.getElementById('cfg-ruta');         // Input ruta exportación

    // Construir el objeto de configuración leyendo cada control; si el control no existe, usar DEFAULTS
    return {
      rol:               getRol(),
      tema:              getTema(),
      idioma:            getIdioma(),
      historial_local:   historialCb ? historialCb.checked   : DEFAULTS.historial_local,
      autoscan_inicio:   autoscanCb  ? autoscanCb.checked    : DEFAULTS.autoscan_inicio,
      recordatorio_dias: recSelect   ? recSelect.value       : DEFAULTS.recordatorio_dias,  // String 'nunca'/'7'/etc.
      ruta_exportacion:  rutaInput   ? rutaInput.value.trim(): DEFAULTS.ruta_exportacion,   // trim() elimina espacios
      tiempo_muestreo:   getMuestreo(),
    };
  }

  // ── Inicialización tras carga del DOM ────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', async () => {

    // Aplicar primero con caché local (síncrono) para evitar flash de tema incorrecto,
    // luego sobrescribir con la config de %APPDATA% si difiere (puede cambiar tras reinstalación).
    const cfgLocal = cargarConfigLocal();
    applyAll(cfgLocal);
    poblarFormulario(cfgLocal);

    const cfg = await cargarConfig();  // Leer desde %APPDATA% (async, puede tardar ~50ms)
    applyAll(cfg);               // Re-aplicar si difiere de la caché local
    poblarFormulario(cfg);

    // ── Botones de grupo: respuesta inmediata al hacer clic ──────────────────────
    // Todos los botones de grupo (rol, tema, idioma, muestreo) comparten la misma lógica:
    // desmarcar todos los del grupo y marcar solo el pulsado, luego aplicar el efecto.
    document.querySelectorAll('.cfg-btn-group-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const groupId = btn.closest('.cfg-btn-group')?.id;  // Obtener el id del contenedor del grupo
        if (!groupId) return;  // Salida segura si el botón no está dentro de un grupo con id

        // Quitar la clase 'activo' de todos los botones del mismo grupo
        document.querySelectorAll(`#${groupId} .cfg-btn-group-item`).forEach(b => b.classList.remove('activo'));
        btn.classList.add('activo');  // Marcar el botón pulsado como activo

        // Aplicar el cambio en tiempo real (sin esperar a "Guardar cambios")
        if (groupId === 'cfg-tema-group')   applyThema(btn.dataset.valor);    // Cambio de tema inmediato
        if (groupId === 'cfg-idioma-group') applyIdioma(btn.dataset.valor);   // Retradución inmediata del DOM
        if (groupId === 'cfg-rol-group')    applyRol(btn.dataset.valor);      // Cambio de rol inmediato
      });
    });

    // ── Botón "Guardar cambios" ──────────────────────────────────────────────────
    const formBtn = document.getElementById('cfg-guardar-btn');
    if (formBtn) {
      formBtn.addEventListener('click', async () => {
        const nueva = leerFormulario();   // Leer el estado actual de todos los controles
        await guardarConfig(nueva);       // Persistir en %APPDATA% y en localStorage
        applyAll(nueva);                  // Re-aplicar todo (especialmente rol, por si cambió)

        // Mostrar el mensaje "Configuración guardada" y desvanecerlo tras 2.2 segundos
        const feedback = document.getElementById('cfg-guardado-msg');
        if (feedback) {
          feedback.style.opacity = '1';                                       // Hacer visible
          setTimeout(() => { feedback.style.opacity = '0'; }, 2200);          // Desvanecer
        }
      });
    }
  });

  // ── API pública ──────────────────────────────────────────────────────────────
  // Expuesto en window para que módulos externos (ej. background.js) puedan
  // leer o escribir la configuración sin duplicar la lógica de persistencia.
  // cargar() → Promise<cfg>  (IPC + fallback localStorage)
  // guardar(cfg) → Promise   (IPC + localStorage)
  // cargarLocal() → cfg      (solo localStorage, síncrono — para uso en iframes/workers)
  window.ESTICC_CONFIG = {
    cargar:      cargarConfig,
    guardar:     guardarConfig,
    cargarLocal: cargarConfigLocal,
  };

})();  // IIFE: encapsula todo en un scope privado para no contaminar el namespace global
