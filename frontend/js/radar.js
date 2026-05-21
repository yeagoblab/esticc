/**
 * radar.js — Panel OSINT Radar.
 * Obtiene noticias RSS vía sidecar Python y las correlaciona con el escaneo local.
 */

(function () {
  'use strict';

  // ── Estado interno ───────────────────────────────────────────────────────────

  const estado = {
    cargando:       false,
    noticias:       [],
    alertas:        [],
    resumen:        { critico: 0, alto: 0, total: 0 },
    fuentesOk:      0,
    noticiasTotal:  0,
    timestamp:      null,
  };

  // ── IPC — llama directamente a Tauri (ignora interceptor del simulador) ───────

  function invokeRaw(action, extra) {
    if (!window.__TAURI__) {
      return Promise.reject('window.__TAURI__ no disponible. Ejecuta desde Tauri.');
    }
    return window.__TAURI__.tauri.invoke('audit', Object.assign({ action }, extra || {}));
  }

  // ── Inicialización ───────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btn-radar');
    if (btn) btn.addEventListener('click', ejecutarRadar);
  });

  // ── Ejecución principal ──────────────────────────────────────────────────────

  async function ejecutarRadar() {
    if (estado.cargando) return;

    const resultadoEl = document.getElementById('resultado-radar');
    if (!resultadoEl) return;

    // El radar no tiene modo demo
    if (window.SIMULADOR?.activo) {
      resultadoEl.innerHTML = `
        <div class="radar-demo-notice">
          <div style="font-size:28px;margin-bottom:10px;">📡</div>
          El Radar OSINT requiere conexión a internet real.<br>
          Este módulo no está disponible en modo demostración.
        </div>`;
      return;
    }

    estado.cargando = true;
    const btn = document.getElementById('btn-radar');
    if (btn) { btn.disabled = true; btn.textContent = 'Analizando...'; }
    document.getElementById('loading').style.display = 'block';

    try {
      // 1. Obtener noticias de los feeds RSS
      const fetchRes = await invokeRaw('radar_fetch');
      if (!fetchRes.ok) throw new Error(fetchRes.error || 'Error al obtener noticias');

      const noticias  = fetchRes.data?.noticias || [];
      const metaFetch = fetchRes.meta || {};

      // 2. Correlacionar con el estado local (último escaneo de puertos y procesos)
      const context = {
        noticias,
        puertos:  window.ULTIMO_SCAN?.puertos  || [],
        procesos: window.ULTIMO_SCAN?.procesos || [],
      };

      const corrRes = await invokeRaw('radar_correlate', { payload: { context } });
      if (!corrRes.ok) throw new Error(corrRes.error || 'Error en correlación');

      estado.noticias      = noticias;
      estado.alertas       = corrRes.data?.alertas || [];
      estado.resumen       = corrRes.data?.resumen  || { critico: 0, alto: 0, total: 0 };
      estado.fuentesOk     = metaFetch.fuentes_ok  || 0;
      estado.noticiasTotal = noticias.length;
      estado.timestamp     = new Date().toLocaleTimeString('es-ES');

      renderizar();

    } catch (err) {
      resultadoEl.innerHTML =
        `<p style="color:var(--danger);margin-top:16px;">Error: ${err}</p>`;
    } finally {
      estado.cargando = false;
      if (btn) { btn.disabled = false; btn.textContent = 'Actualizar radar'; }
      document.getElementById('loading').style.display = 'none';
    }
  }

  // ── Render principal (genera ambas vistas a la vez) ──────────────────────────

  function renderizar() {
    const el = document.getElementById('resultado-radar');
    if (!el) return;

    const meta = estado.timestamp
      ? `<div class="radar-meta" style="margin-top:14px;">
           Actualizado: ${estado.timestamp} &nbsp;·&nbsp;
           ${estado.fuentesOk} fuentes &nbsp;·&nbsp;
           ${estado.noticiasTotal} noticias analizadas
         </div>`
      : '';

    el.innerHTML = `
      <div class="vista-basica">${vistaBasica()}</div>
      <div class="vista-avanzada">${vistaAvanzada()}</div>
      ${meta}
    `;
  }

  // ── Vista básica ─────────────────────────────────────────────────────────────

  function vistaBasica() {
    const { critico, alto, total } = estado.resumen;

    const contadores = `
      <div class="radar-escudos-wrap">
        <div class="radar-contador ${critico > 0 ? 'critico' : 'ok'}">
          <div class="radar-contador-num">${critico}</div>
          <div class="radar-contador-label">Alertas críticas</div>
        </div>
        <div class="radar-contador ${alto > 0 ? 'alto' : 'ok'}">
          <div class="radar-contador-num">${alto}</div>
          <div class="radar-contador-label">Alertas altas</div>
        </div>
        <div class="radar-contador ok">
          <div class="radar-contador-num">${estado.noticiasTotal}</div>
          <div class="radar-contador-label">Noticias revisadas</div>
        </div>
      </div>`;

    if (total === 0) {
      return contadores + `
        <div class="radar-sin-alertas">
          <div class="radar-sin-alertas-icono">✅</div>
          No hay amenazas activas relacionadas con tu sistema.
        </div>`;
    }

    const alertasHtml = estado.alertas.map(a => {
      const icono  = a.nivel === 'critico' ? '🔴' : '🟡';
      const titulo = a.tipo === 'puerto'
        ? `Puerto expuesto detectado: ${esc(a.coincidencia)}`
        : `Vulnerabilidad publicada: ${esc(a.coincidencia)}`;
      return `
        <div class="radar-alerta-basica ${a.nivel}">
          <div class="radar-alerta-basica-titulo">${icono} ${titulo}</div>
          <div class="radar-alerta-basica-desc">${esc(a.explicacion)}</div>
        </div>`;
    }).join('');

    return contadores + `<div class="radar-alertas-basico">${alertasHtml}</div>`;
  }

  // ── Vista avanzada ───────────────────────────────────────────────────────────

  function vistaAvanzada() {
    return alertasAvanzado() + tablaDeNoticias();
  }

  function alertasAvanzado() {
    if (!estado.alertas.length) {
      return `<div class="radar-sin-alertas" style="padding:16px;">
        <span style="font-size:20px;">✅</span>&nbsp; Sin alertas de correlación
      </div>`;
    }

    const titulo = `<div class="radar-alertas-titulo">
      ⚠️ Alertas de correlación (${estado.alertas.length})
    </div>`;

    const items = estado.alertas.map(a => {
      const cveHtml = (a.cves?.length)
        ? `<div class="radar-cve-tags">${a.cves.map(c => `<span class="radar-cve-tag">${esc(c)}</span>`).join('')}</div>`
        : '';

      const noticiaHtml = a.noticia
        ? `<div class="radar-alerta-noticia">
             Fuente: <strong>${esc(a.noticia.fuente)}</strong> —
             <a href="${esc(a.noticia.enlace)}" target="_blank">${esc(a.noticia.titulo)}</a>
           </div>`
        : '';

      return `
        <div class="radar-alerta ${a.nivel}">
          <div class="radar-alerta-header">
            <span class="radar-alerta-nivel ${a.nivel}">${a.nivel}</span>
            <span class="radar-alerta-coincidencia">${esc(a.coincidencia)}</span>
          </div>
          <div class="radar-alerta-explicacion">${esc(a.explicacion)}</div>
          ${cveHtml}
          ${noticiaHtml}
        </div>`;
    }).join('');

    return `<div style="margin-bottom:20px;">${titulo}${items}</div>`;
  }

  function tablaDeNoticias() {
    if (!estado.noticias.length) return '';

    const filas = estado.noticias.slice(0, 40).map(n => {
      const fecha    = n.fecha ? n.fecha.substring(0, 10) : '—';
      const sevClass = n.severidad || 'info';
      const enlace   = n.enlace
        ? `<a href="${esc(n.enlace)}" target="_blank">${esc(n.titulo)}</a>`
        : esc(n.titulo);
      return `<tr>
        <td style="width:16px;"><span class="radar-sev ${sevClass}"></span></td>
        <td class="radar-noticia-titulo">${enlace}</td>
        <td>${esc(n.fuente)}</td>
        <td style="color:var(--text-dim);white-space:nowrap;">${fecha}</td>
      </tr>`;
    }).join('');

    return `
      <div class="radar-noticias-titulo">📰 Últimas noticias (${estado.noticias.length})</div>
      <table>
        <thead>
          <tr>
            <th style="width:16px;"></th>
            <th>Título</th>
            <th>Fuente</th>
            <th>Fecha</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>`;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Estado vacío inicial
  document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('resultado-radar');
    if (el) {
      el.innerHTML = `
        <div class="radar-vacio">
          <div class="radar-vacio-icono">📡</div>
          Pulsa <strong>Actualizar radar</strong> para analizar las últimas amenazas OSINT<br>
          y correlacionarlas con el estado de tu sistema.
          <br><br>
          <span style="font-size:11px;">
            Para mejores resultados, ejecuta primero el escáner de <em>Puertos</em>.
          </span>
        </div>`;
    }
  });

})();
