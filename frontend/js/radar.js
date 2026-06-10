/**
 * radar.js — Panel OSINT Radar.
 *
 * Flujo de ejecución:
 *  1. radar_fetch   → lector_rss.run()   → descarga paralela de 6 feeds RSS
 *  2. radar_correlate → correlacion.run() → cruza noticias con puertos locales abiertos
 *  3. renderizar()  → genera el Informe OSINT Semanal (correlación + noticias + PDF)
 *
 * Informe OSINT Semanal:
 *  - Alertas de correlación (puertos locales ↔ noticias)
 *  - Noticias de interés de los últimos 7 días, agrupadas por severidad (crítico/alto/info)
 *  - Cada noticia muestra título como enlace clickable, fuente, fecha relativa y resumen
 *  - Botón "Guardar PDF" → window.print() con @media print en radar.css
 */

(function () {
  'use strict';

  // ── Estado interno del módulo ─────────────────────────────────────────────────
  // Centraliza todos los datos entre actualizaciones para que renderizar() no
  // necesite parámetros y siempre trabaje con el snapshot más reciente.
  const estado = {
    cargando:      false,   // Previene doble click mientras el fetch está en curso
    noticias:      [],      // Array completo de noticias descargadas (todas las fuentes)
    alertas:       [],      // Array de alertas de correlación generadas por el backend
    resumen:       { critico: 0, alto: 0, total: 0 },  // Contadores de alertas
    fuentesOk:     0,       // Feeds RSS que respondieron correctamente (de 6 posibles)
    noticiasTotal: 0,       // Total de noticias descargadas (para el footer del informe)
    duracionMs:    0,       // Tiempo total del ciclo fetch+correlate en milisegundos
    timestamp:     null,    // Fecha/hora de la última actualización (string legible)
    fechaInforme:  null,    // Fecha formateada para la cabecera del informe
  };

  // ── Ventana temporal del informe semanal ──────────────────────────────────────
  const VENTANA_SEMANA_MS = 7 * 24 * 60 * 60 * 1000;  // 7 días en milisegundos

  // ── IPC directo a Tauri ───────────────────────────────────────────────────────
  // Llama al comando Rust 'audit' sin pasar por el interceptor del simulador.
  // El radar no tiene modo demo porque necesita internet real para los feeds RSS.
  function invokeRaw(action, extra) {
    if (!window.__TAURI__) {
      return Promise.reject('window.__TAURI__ no disponible. Ejecuta desde Tauri.');
    }
    return window.__TAURI__.tauri.invoke('audit', Object.assign({ action }, extra || {}));
  }

  // ── Inicialización ────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    const btn    = document.getElementById('btn-radar');
    const btnPdf = document.getElementById('btn-radar-pdf');

    if (btn)    btn.addEventListener('click', ejecutarRadar);
    // El botón PDF invoca window.print(); @media print en radar.css se encarga del resto
    if (btnPdf) btnPdf.addEventListener('click', () => window.print());

    // Estado vacío inicial: instrucciones antes de la primera actualización
    const el = document.getElementById('resultado-radar');
    if (el) {
      el.innerHTML = `
        <div class="radar-vacio">
          <div class="radar-vacio-icono">📡</div>
          Pulsa <strong>${t('botones.actualizar_radar')}</strong> para generar el Informe OSINT Semanal<br>
          y correlacionar las amenazas publicadas con el estado de tu sistema.
          <br><br>
          <span style="font-size:11px;">
            Para mejores resultados, ejecuta primero el escáner de <em>${t('nav.puertos')}</em>.
          </span>
        </div>`;
    }
  });

  // ── Ciclo principal del radar ─────────────────────────────────────────────────
  /**
   * ejecutarRadar() — Orquesta el ciclo completo:
   *  1. Descarga noticias de 6 feeds RSS (radar_fetch)
   *  2. Correlaciona con los puertos locales abiertos (radar_correlate)
   *  3. Renderiza el Informe OSINT Semanal
   */
  async function ejecutarRadar() {
    if (estado.cargando) return;  // Evitar ejecuciones paralelas

    const resultadoEl = document.getElementById('resultado-radar');
    if (!resultadoEl) return;

    // El radar no tiene datos ficticios; mostrar aviso si el modo demo está activo
    if (window.SIMULADOR?.activo) {
      resultadoEl.innerHTML = `
        <div class="radar-demo-notice">
          <div style="font-size:28px;margin-bottom:10px;">📡</div>
          El Radar OSINT requiere conexión a internet real.<br>
          Este módulo no está disponible en modo demostración.
        </div>`;
      return;
    }

    // ── Inicio de carga ───────────────────────────────────────────────────────
    estado.cargando = true;
    const btn    = document.getElementById('btn-radar');
    const btnPdf = document.getElementById('btn-radar-pdf');
    if (btn)    { btn.disabled = true; btn.textContent = t('estados.analizando'); }
    if (btnPdf) btnPdf.style.display = 'none';  // Ocultar PDF durante la actualización
    setLoading(true, t('radar.cargando'));

    try {
      // ── Paso 1: Descargar noticias RSS ────────────────────────────────────
      const fetchRes = await invokeRaw('radar_fetch');
      if (!fetchRes.ok) throw new Error(fetchRes.error || t('radar.error_fetch'));

      const noticias  = fetchRes.data?.noticias || [];
      const metaFetch = fetchRes.meta || {};

      // ── Paso 2: Construir contexto local y correlacionar ──────────────────
      // window.ULTIMO_SCAN se rellena en auditoria.js cuando el usuario escanea
      const context = {
        noticias,
        puertos:  window.ULTIMO_SCAN?.puertos  || [],
        procesos: window.ULTIMO_SCAN?.procesos || [],
      };

      const corrRes = await invokeRaw('radar_correlate', { payload: { context } });
      if (!corrRes.ok) throw new Error(corrRes.error || t('radar.error_corr'));

      // ── Actualizar estado ─────────────────────────────────────────────────
      const ahora = new Date();
      estado.noticias      = noticias;
      estado.alertas       = corrRes.data?.alertas || [];
      estado.resumen       = corrRes.data?.resumen  || { critico: 0, alto: 0, total: 0 };
      estado.fuentesOk     = metaFetch.fuentes_ok  || 0;
      estado.noticiasTotal = noticias.length;
      estado.duracionMs    = (metaFetch.duracion_ms || 0) + (corrRes.meta?.duracion_ms || 0);
      estado.timestamp     = ahora.toLocaleTimeString('es-ES');
      // Fecha larga para la cabecera del informe: "martes, 10 de junio de 2026"
      estado.fechaInforme  = ahora.toLocaleDateString(
        window.ESTICC_LANG === 'en' ? 'en-US' : 'es-ES',
        { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }
      );

      renderizar();

    } catch (err) {
      resultadoEl.innerHTML =
        `<p style="color:var(--danger);margin-top:16px;">${t('estados.error')}: ${esc(String(err))}</p>`;
    } finally {
      estado.cargando = false;
      if (btn)    { btn.disabled = false; btn.textContent = t('botones.actualizar_radar'); }
      setLoading(false);
    }
  }

  // ── Renderizado principal ─────────────────────────────────────────────────────
  /**
   * renderizar() — Genera el HTML completo del informe e inyecta en #resultado-radar.
   * Estructura:
   *   [vista-basica]  Contadores + alertas compactas
   *   [siempre]       Informe OSINT Semanal (correlación + noticias de la semana)
   *   [vista-avanzada] Tabla raw de todas las noticias
   *   [siempre]       Footer de metadata
   */
  function renderizar() {
    const el = document.getElementById('resultado-radar');
    if (!el) return;

    // Mostrar botón PDF una vez que hay contenido
    const btnPdf = document.getElementById('btn-radar-pdf');
    if (btnPdf) btnPdf.style.display = '';

    el.innerHTML = `
      <div id="radar-informe-contenido">

        <!-- Vista básica: contadores + alertas simplificadas -->
        <div class="vista-basica">${seccionContadores()}${alertasBasicas()}</div>

        <!-- Informe OSINT Semanal: visible en ambos modos -->
        ${informeSemanal()}

        <!-- Vista avanzada: tabla raw de todas las noticias + alertas detalladas -->
        <div class="vista-avanzada">
          ${alertasAvanzadas()}
          ${tablaRaw()}
        </div>

        <!-- Footer de metadata: timestamp, fuentes, noticias, duración -->
        ${footerMeta()}

      </div>`;
  }

  // ── Sección: Contadores (vista básica) ───────────────────────────────────────
  function seccionContadores() {
    const { critico, alto } = estado.resumen;
    return `
      <div class="radar-escudos-wrap">
        <div class="radar-contador ${critico > 0 ? 'critico' : 'ok'}">
          <div class="radar-contador-num">${critico}</div>
          <div class="radar-contador-label">${t('radar.alertas_criticas')}</div>
        </div>
        <div class="radar-contador ${alto > 0 ? 'alto' : 'ok'}">
          <div class="radar-contador-num">${alto}</div>
          <div class="radar-contador-label">${t('radar.alertas_altas')}</div>
        </div>
        <div class="radar-contador ok">
          <div class="radar-contador-num">${estado.noticiasTotal}</div>
          <div class="radar-contador-label">${t('radar.noticias_revisadas')}</div>
        </div>
      </div>`;
  }

  // ── Sección: Alertas simplificadas (vista básica) ────────────────────────────
  function alertasBasicas() {
    if (!estado.alertas.length) {
      return `
        <div class="radar-sin-alertas-bloque" style="margin-top:12px;">
          <span class="radar-sin-alertas-badge">✅ ${t('radar.sin_amenazas')}</span>
          <span class="radar-sin-alertas-sub">
            ${estado.noticiasTotal} ${t('radar.noticias_sin_coincidencia')}
          </span>
        </div>`;
    }
    const items = estado.alertas.map(a => {
      const icono  = a.nivel === 'critico' ? '🔴' : '🟡';
      const titulo = a.tipo === 'puerto'
        ? `${t('radar.puerto_expuesto')}: ${esc(a.coincidencia)}`
        : `${t('radar.vulnerabilidad')}: ${esc(a.coincidencia)}`;
      return `
        <div class="radar-alerta-basica ${a.nivel}">
          <div class="radar-alerta-basica-titulo">${icono} ${titulo}</div>
          <div class="radar-alerta-basica-desc">${esc(a.explicacion)}</div>
        </div>`;
    }).join('');
    return `<div class="radar-alertas-basico">${items}</div>`;
  }

  // ── Informe OSINT Semanal ─────────────────────────────────────────────────────
  /**
   * informeSemanal() — Filtra las noticias de los últimos 7 días y las agrupa
   * por severidad (crítico → alto → info) en secciones con cabeceras.
   * Este bloque es el núcleo del informe y se muestra en ambos modos (básico y avanzado).
   * Es el único contenido que se imprime al generar el PDF.
   */
  function informeSemanal() {
    const ahora  = Date.now();

    // Filtrar noticias publicadas dentro de la ventana de 7 días
    const semana = estado.noticias.filter(n => {
      try {
        return (ahora - new Date(n.fecha).getTime()) <= VENTANA_SEMANA_MS;
      } catch { return false; }
    });

    // Si ninguna noticia tiene fecha reciente (feeds con fechas antiguas o sin fecha),
    // mostrar las 20 más recientes disponibles como fallback
    const fuente = semana.length >= 3 ? semana : estado.noticias.slice(0, 20);
    const esCompletaSemana = semana.length >= 3;

    // Agrupar por severidad para presentarlas en secciones diferenciadas
    const criticas = fuente.filter(n => n.severidad === 'critico');
    const altas    = fuente.filter(n => n.severidad === 'alto');
    const infos    = fuente.filter(n => n.severidad === 'info');

    // Cabecera del informe con fecha y nota de fallback si aplica
    const cabecera = `
      <div class="radar-informe-header" id="radar-informe-print-header">
        <div class="radar-informe-titulo">
          📰 ${t('radar.informe_titulo')}
        </div>
        <div class="radar-informe-fecha">
          ${estado.fechaInforme || ''}
          ${!esCompletaSemana ? `<span class="radar-informe-fallback"> — ${t('radar.ultimas_disponibles')}</span>` : ''}
        </div>
      </div>`;

    // Construir cada sección si tiene noticias
    const secCriticas = criticas.length
      ? seccionNoticias(criticas, 'critico', `🔴 ${t('radar.sec_criticas')}`, criticas.length)
      : '';
    const secAltas = altas.length
      ? seccionNoticias(altas, 'alto', `🟡 ${t('radar.sec_altas')}`, altas.length)
      : '';
    const secInfo = infos.length
      ? seccionNoticias(infos, 'info', `ℹ️ ${t('radar.sec_info')}`, infos.length)
      : '';

    // Si no hay noticias en absoluto (todos los feeds fallaron)
    const sinDatos = !criticas.length && !altas.length && !infos.length
      ? `<div class="radar-sin-alertas" style="margin-top:16px;">
           ${t('radar.sin_noticias_semana')}
         </div>`
      : '';

    return `
      <div class="radar-informe-seccion" id="radar-informe-semana">
        ${cabecera}
        ${secCriticas}
        ${secAltas}
        ${secInfo}
        ${sinDatos}
      </div>`;
  }

  /**
   * seccionNoticias() — Genera una sección con título de severidad y sus tarjetas.
   * Limita a 10 tarjetas por sección para no saturar el informe.
   */
  function seccionNoticias(lista, nivel, titulo, total) {
    const MAX_TARJETAS = 10;
    const mostrar = lista.slice(0, MAX_TARJETAS);
    const restantes = total > MAX_TARJETAS ? total - MAX_TARJETAS : 0;

    const tarjetas = mostrar.map(n => tarjetaNoticia(n)).join('');

    const masHtml = restantes
      ? `<div class="radar-mas-noticias">+${restantes} ${t('radar.mas_noticias')}</div>`
      : '';

    return `
      <div class="radar-grupo-severidad">
        <div class="radar-grupo-titulo ${nivel}">
          ${titulo} <span class="radar-grupo-count">(${total})</span>
        </div>
        <div class="radar-tarjetas-grid">
          ${tarjetas}
        </div>
        ${masHtml}
      </div>`;
  }

  /**
   * tarjetaNoticia() — Genera la tarjeta individual de una noticia.
   * Siempre visible: punto de severidad, título como enlace, fuente y fecha relativa.
   * Solo en modo avanzado (clase modo-avanzado-only): resumen de texto.
   */
  function tarjetaNoticia(n) {
    // Calcular cuántos días hace que se publicó la noticia
    let etiquetaDias = '';
    try {
      const diasAtras = Math.floor((Date.now() - new Date(n.fecha).getTime()) / 86_400_000);
      if      (diasAtras === 0) etiquetaDias = t('radar.hoy');
      else if (diasAtras === 1) etiquetaDias = t('radar.ayer');
      else if (diasAtras <  7)  etiquetaDias = `${t('radar.hace')} ${diasAtras} ${t('radar.dias')}`;
      else                      etiquetaDias = n.fecha?.substring(0, 10) || '';
    } catch { etiquetaDias = n.fecha?.substring(0, 10) || ''; }

    // El título es un enlace externo si la noticia tiene URL; si no, texto plano
    const tituloHtml = n.enlace
      ? `<a href="${esc(n.enlace)}" target="_blank" rel="noopener noreferrer">${esc(n.titulo)}</a>`
      : `<span>${esc(n.titulo)}</span>`;

    // El resumen solo se muestra en modo avanzado para no saturar la vista básica
    const resumenHtml = n.resumen
      ? `<div class="radar-noticia-card-resumen modo-avanzado-only">
           ${esc(n.resumen.length > 200 ? n.resumen.slice(0, 200) + '…' : n.resumen)}
         </div>`
      : '';

    return `
      <div class="radar-noticia-card ${n.severidad}">
        <div class="radar-noticia-card-meta">
          <span class="radar-sev ${n.severidad}"></span>
          <span class="radar-noticia-fuente">${esc(n.fuente)}</span>
          <span class="radar-noticia-fecha">${etiquetaDias}</span>
        </div>
        <div class="radar-noticia-card-titulo">${tituloHtml}</div>
        ${resumenHtml}
      </div>`;
  }

  // ── Sección: Alertas detalladas (vista avanzada) ──────────────────────────────
  function alertasAvanzadas() {
    if (!estado.alertas.length) {
      return `<div class="radar-sin-alertas">
        <span style="font-size:20px;">✅</span>&nbsp; ${t('radar.sin_alertas_correlacion')}
      </div>`;
    }

    const titulo = `<div class="radar-alertas-titulo">
      ⚠️ ${t('radar.alertas_correlacion')} (${estado.alertas.length})
    </div>`;

    const items = estado.alertas.map(a => {
      const cveHtml = a.cves?.length
        ? `<div class="radar-cve-tags">
             ${a.cves.map(c => `<span class="radar-cve-tag">${esc(c)}</span>`).join('')}
           </div>`
        : '';
      const noticiaHtml = a.noticia
        ? `<div class="radar-alerta-noticia">
             ${t('radar.fuente_label')}: <strong>${esc(a.noticia.fuente)}</strong> —
             <a href="${esc(a.noticia.enlace)}" target="_blank" rel="noopener noreferrer">
               ${esc(a.noticia.titulo)}
             </a>
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

  // ── Tabla raw (vista avanzada) ────────────────────────────────────────────────
  // Muestra todas las noticias descargadas sin filtro, para analistas que quieren
  // revisar el feed completo más allá de los últimos 7 días.
  function tablaRaw() {
    if (!estado.noticias.length) return '';

    const MAX_FILAS = 50;  // Limitar a 50 filas para no sobrecargar el DOM
    const filas = estado.noticias.slice(0, MAX_FILAS).map(n => {
      const fecha  = n.fecha ? n.fecha.substring(0, 10) : '—';
      const enlace = n.enlace
        ? `<a href="${esc(n.enlace)}" target="_blank" rel="noopener noreferrer">${esc(n.titulo)}</a>`
        : esc(n.titulo);
      return `<tr>
        <td style="width:16px;"><span class="radar-sev ${n.severidad || 'info'}"></span></td>
        <td class="radar-noticia-titulo">${enlace}</td>
        <td>${esc(n.fuente)}</td>
        <td style="color:var(--text-dim);white-space:nowrap;">${fecha}</td>
      </tr>`;
    }).join('');

    return `
      <div class="radar-noticias-titulo" style="margin-top:20px;">
        📋 ${t('radar.todas_noticias')} (${estado.noticias.length})
      </div>
      <table>
        <thead>
          <tr>
            <th style="width:16px;"></th>
            <th>${t('tabla.titulo')}</th>
            <th>${t('radar.fuente_label')}</th>
            <th>${t('tabla.fecha') || 'Fecha'}</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>`;
  }

  // ── Footer de metadata ────────────────────────────────────────────────────────
  function footerMeta() {
    if (!estado.timestamp) return '';
    return `
      <div class="radar-meta" style="margin-top:14px;">
        ${t('msgs.consultado')} ${estado.timestamp} &nbsp;·&nbsp;
        ${estado.fuentesOk} ${t('radar.fuentes')} &nbsp;·&nbsp;
        ${estado.noticiasTotal} ${t('radar.noticias_analizadas')}
        ${estado.duracionMs ? `&nbsp;·&nbsp; ${estado.duracionMs} ms` : ''}
      </div>`;
  }

  // ── Helper: escape HTML ───────────────────────────────────────────────────────
  // Esencial para prevenir XSS: los títulos y resúmenes vienen de internet (feeds RSS).
  function esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g,  '&amp;')
      .replace(/</g,  '&lt;')
      .replace(/>/g,  '&gt;')
      .replace(/"/g,  '&quot;');
  }

})();
