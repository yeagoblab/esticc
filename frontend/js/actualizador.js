/**
 * actualizador.js — Lógica de actualización in-app de ESTICC.
 *
 * Flujo completo:
 *  1. El usuario pulsa "Buscar actualización" → check_update IPC
 *  2. Si hay versión nueva se muestra info y el botón "Descargar e instalar"
 *  3. Al pulsar se lanza update_download (descarga + prepara PS script)
 *  4. Al terminar se lanza update_apply (PS script desacoplado) y se cierra la app
 *
 * El PS script espera a que ESTICC.exe cierre, reemplaza los binarios y relanza la app.
 */

(function () {
  'use strict';

  // ── Estado interno ────────────────────────────────────────────────────────

  // Almacena la ruta al .ps1 una vez preparado, para pasarla a update_apply
  let _psPath = null;

  // ── Helper: invoke IPC (misma firma que en auditoria.js) ──────────────────

  /**
   * invoke(action, extra) — Envía una petición al sidecar Python y resuelve con el resultado.
   * Reutiliza window.__TAURI__.tauri.invoke si está disponible; si no, lanza error de entorno.
   */
  function invoke(action, extra = {}) {
    if (!window.__TAURI__) return Promise.reject(new Error('Tauri no disponible'));
    return window.__TAURI__.tauri.invoke('audit', { action, ...extra });
  }

  // ── Selectores DOM (resueltos una vez cuando el DOM está listo) ───────────

  function $(id) { return document.getElementById(id); }

  // ── Renderizadores de estado ──────────────────────────────────────────────

  /**
   * setEstado(estado, msg) — Actualiza la zona de estado con el color e icono adecuados.
   * estados posibles: 'idle' | 'cargando' | 'ok' | 'nueva' | 'error'
   */
  function setEstado(estado, msg) {
    const zona = $('upd-estado');
    if (!zona) return;

    const colores = {
      idle:     'var(--text-dim)',
      cargando: 'var(--text-dim)',
      ok:       'var(--ok)',
      nueva:    'var(--accent)',
      error:    'var(--danger)',
    };
    const iconos = {
      idle:     '●',
      cargando: '◌',
      ok:       '✔',
      nueva:    '↑',
      error:    '✖',
    };

    zona.style.color = colores[estado] || 'var(--text-dim)';
    zona.textContent = `${iconos[estado] || ''} ${msg}`.trim();
  }

  /**
   * setNovedades(texto) — Muestra o esconde el bloque de novedades de la release.
   * El bloque está oculto por defecto y solo aparece cuando hay una actualización disponible.
   */
  function setNovedades(texto) {
    const bloque = $('upd-novedades-bloque');
    const cuerpo = $('upd-novedades-cuerpo');
    if (!bloque || !cuerpo) return;

    if (texto) {
      cuerpo.textContent = texto;
      bloque.style.display = '';
    } else {
      bloque.style.display = 'none';
    }
  }

  /**
   * setBtnInstalar(visible, habilitado) — Muestra/oculta y activa/desactiva el botón de instalación.
   */
  function setBtnInstalar(visible, habilitado = true) {
    const btn = $('upd-instalar-btn');
    if (!btn) return;
    btn.style.display  = visible ? '' : 'none';
    btn.disabled       = !habilitado;
  }

  /**
   * setBtnBuscar(habilitado) — Desactiva el botón mientras hay una operación en curso.
   */
  function setBtnBuscar(habilitado) {
    const btn = $('upd-check-btn');
    if (btn) btn.disabled = !habilitado;
  }

  // ── Paso 1: Comprobar actualización ──────────────────────────────────────

  async function comprobarActualizacion() {
    setBtnBuscar(false);
    setBtnInstalar(false);
    setNovedades(null);
    setEstado('cargando', 'Comprobando versión…');

    try {
      const res = await invoke('update_check');

      if (res.actualizar) {
        setEstado('nueva', `Nueva versión disponible: ${res.version_nueva} (tienes ${res.version_actual})`);
        setNovedades(res.novedades || '');
        // Guardar URL del ZIP en el botón para usarla al instalar
        const btn = $('upd-instalar-btn');
        if (btn) btn.dataset.urlZip = res.url_zip || '';
        setBtnInstalar(true, true);
      } else {
        setEstado('ok', `ESTICC está al día (${res.version_actual})`);
        setBtnInstalar(false);
      }
    } catch (e) {
      setEstado('error', `Error al comprobar: ${e}`);
    } finally {
      setBtnBuscar(true);
    }
  }

  // ── Paso 2: Descargar y preparar ─────────────────────────────────────────

  async function descargarYPreparar() {
    const btn = $('upd-instalar-btn');
    const urlZip = btn?.dataset.urlZip || '';

    if (!urlZip) {
      setEstado('error', 'URL de descarga no disponible — busca la actualización de nuevo');
      return;
    }

    setBtnInstalar(true, false);  // Deshabilitar mientras descarga
    setBtnBuscar(false);
    setEstado('cargando', 'Descargando actualización (~10 MB)…');

    try {
      const res = await invoke('update_download', { url_zip: urlZip });
      _psPath = res.ps_path;
      // Cambiar el botón a "Instalar y reiniciar" para la confirmación final
      if (btn) {
        btn.textContent = 'Instalar y reiniciar';
        btn.dataset.fase = 'aplicar';
        btn.disabled     = false;
      }
      setEstado('nueva', 'Descarga completa — pulsa "Instalar y reiniciar" para aplicar la actualización');
    } catch (e) {
      setEstado('error', `Error en la descarga: ${e}`);
      setBtnInstalar(true, true);
      setBtnBuscar(true);
    }
  }

  // ── Paso 3: Aplicar actualización y cerrar ────────────────────────────────

  async function aplicarActualizacion() {
    if (!_psPath) {
      setEstado('error', 'Script de actualización no encontrado — vuelve a descargar');
      return;
    }

    setBtnInstalar(true, false);
    setBtnBuscar(false);
    setEstado('cargando', 'Aplicando actualización…');

    try {
      await invoke('update_apply', { ps_path: _psPath });
      setEstado('ok', 'Actualización iniciada. Cerrando ESTICC…');
      // Dar 800 ms para que el mensaje sea visible antes de cerrar.
      // close_app es un comando Rust personalizado (no depende del allowlist de tauri.conf.json).
      setTimeout(() => invoke('close_app').catch(() => window.close()), 800);
    } catch (e) {
      setEstado('error', `Error al aplicar: ${e}`);
      setBtnInstalar(true, true);
      setBtnBuscar(true);
    }
  }

  // ── Wire-up de eventos ────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', () => {

    const btnCheck    = $('upd-check-btn');
    const btnInstalar = $('upd-instalar-btn');

    if (btnCheck) {
      btnCheck.addEventListener('click', comprobarActualizacion);
    }

    if (btnInstalar) {
      btnInstalar.addEventListener('click', () => {
        // Primer clic → descargar; segundo clic (fase 'aplicar') → instalar
        if (btnInstalar.dataset.fase === 'aplicar') {
          aplicarActualizacion();
        } else {
          descargarYPreparar();
        }
      });
    }
  });

})();
