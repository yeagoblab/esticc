/**
 * radar.js — Panel OSINT Radar de ESTICC
 *
 * ── Flujo de ejecución ────────────────────────────────────────────────────────
 *  1. radar_fetch     → lector_rss.run()    → descarga paralela de 6 feeds RSS
 *  2. radar_correlate → correlacion.run()   → cruza noticias con puertos locales
 *  3. renderizar()    → construye el Informe OSINT Semanal en el DOM
 *
 * ── Estructura del informe ────────────────────────────────────────────────────
 *  [vista-basica]    Contadores + alertas de correlación compactas
 *  [siempre]         Informe OSINT Semanal:
 *                      • Noticias críticas/altas/info de los últimos 7 días
 *                      • Cada noticia: título como enlace, fuente, fecha relativa,
 *                        resumen (solo modo avanzado)
 *  [vista-avanzada]  Alertas de correlación detalladas + tabla raw de noticias
 *
 * ── Exportación PDF ──────────────────────────────────────────────────────────
 *  Botón btn-radar-pdf → window.print() → @media print en radar.css oculta
 *  toda la UI y adapta los colores al papel blanco mostrando las URLs completas.
 *
 * ── Seguridad ─────────────────────────────────────────────────────────────────
 *  Todos los textos de internet (títulos, resúmenes, fuentes) pasan por esc()
 *  antes de insertarse en el DOM para prevenir XSS.
 */

(function () {
  'use strict';

  // ── Estado interno del módulo ─────────────────────────────────────────────────
  // Objeto centralizado con todos los datos de la última actualización.
  // renderizar() siempre lee de aquí; ninguna función de render recibe parámetros.
  const estado = {
    cargando:      false,   // Bloquea nuevas llamadas mientras el fetch está en curso
    noticias:      [],      // Todas las noticias descargadas de los 6 feeds RSS
    alertas:       [],      // Alertas generadas por el motor de correlación del backend
    resumen:       { critico: 0, alto: 0, total: 0 },  // Contadores rápidos de alertas
    fuentesOk:     0,       // Número de feeds que respondieron (de 6 posibles)
    noticiasTotal: 0,       // Total de noticias (para el footer del informe)
    duracionMs:    0,       // Tiempo total del ciclo fetch + correlate en ms
    timestamp:     null,    // Hora de la última actualización (formato local HH:MM:SS)
    fechaInforme:  null,    // Fecha larga para la cabecera del informe (ej: "martes, 10 de junio de 2026")
  };

  // Ventana temporal del informe: cuántos ms hacia atrás consideramos "esta semana"
  const VENTANA_SEMANA_MS = 7 * 24 * 60 * 60 * 1000;  // 7 días en milisegundos

  // ── IPC con Tauri ─────────────────────────────────────────────────────────────
  // Llama directamente al comando Rust 'audit' sin pasar por el interceptor del
  // simulador (window.invoke). El radar no tiene datos ficticios porque necesita
  // internet real; si el simulador está activo se muestra un aviso y se corta.
  function invokeRaw(action, extra) {
    if (!window.__TAURI__) {
      // Entorno de desarrollo en navegador: rechazar con mensaje descriptivo
      return Promise.reject('window.__TAURI__ no disponible. Ejecuta desde Tauri.');
    }
    // Object.assign mezcla {action} con los campos extra (ej: payload.context)
    return window.__TAURI__.tauri.invoke('audit', Object.assign({ action }, extra || {}));
  }

  // ── Inicialización ────────────────────────────────────────────────────────────
  // Se ejecuta una sola vez al cargar el DOM: conecta los botones y muestra el
  // estado vacío con instrucciones al usuario.
  document.addEventListener('DOMContentLoaded', () => {
    const btn    = document.getElementById('btn-radar');
    const btnPdf = document.getElementById('btn-radar-pdf');

    // Conectar el botón principal al ciclo del radar
    if (btn)    btn.addEventListener('click', ejecutarRadar);
    // El botón PDF delega directamente a window.print(); radar.css @media print
    // se encarga de ocultar la UI y formatear el documento para papel
    if (btnPdf) btnPdf.addEventListener('click', () => window.print());

    // Estado vacío inicial: guiar al usuario antes de la primera actualización
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

  // ── Ciclo principal ───────────────────────────────────────────────────────────
  /**
   * ejecutarRadar() — Orquesta los dos pasos del backend y actualiza la UI.
   *
   * Paso 1 — radar_fetch:
   *   Llama a lector_rss.run() en el sidecar Python que descarga en paralelo
   *   los 6 feeds RSS y devuelve un array de noticias con título, resumen,
   *   enlace, fecha ISO y severidad estimada por keywords.
   *
   * Paso 2 — radar_correlate:
   *   Llama a correlacion.run(context) con las noticias + los puertos locales
   *   abiertos (del último escaneo del usuario). Detecta coincidencias de puerto
   *   (alerta crítica) y vulnerabilidades CVE publicadas (alerta alta).
   */
  async function ejecutarRadar() {
    if (estado.cargando) return;  // Prevenir ejecuciones paralelas por doble click

    const resultadoEl = document.getElementById('resultado-radar');
    if (!resultadoEl) return;  // El panel puede no estar montado aún si el usuario no lo ha visitado

    // El radar requiere internet real; el simulador solo tiene datos locales ficticios
    if (window.SIMULADOR?.activo) {
      resultadoEl.innerHTML = `
        <div class="radar-demo-notice">
          <div style="font-size:28px;margin-bottom:10px;">📡</div>
          El Radar OSINT requiere conexión a internet real.<br>
          Este módulo no está disponible en modo demostración.
        </div>`;
      return;
    }

    // ── Inicio del ciclo: bloquear UI ────────────────────────────────────────
    estado.cargando = true;
    const btn    = document.getElementById('btn-radar');
    const btnPdf = document.getElementById('btn-radar-pdf');
    if (btn)    { btn.disabled = true; btn.textContent = t('estados.analizando'); }
    if (btnPdf) btnPdf.style.display = 'none';  // Ocultar PDF mientras se actualiza
    setLoading(true, t('radar.cargando'));

    try {
      // ── Paso 1: Descargar noticias de los 6 feeds RSS ───────────────────────
      const fetchRes = await invokeRaw('radar_fetch');
      if (!fetchRes.ok) throw new Error(fetchRes.error || t('radar.error_fetch'));

      const noticias  = fetchRes.data?.noticias || [];  // Array con todas las noticias
      const metaFetch = fetchRes.meta || {};             // Metadata: feeds OK, duración, errores

      // ── Paso 2: Construir contexto local y correlacionar ────────────────────
      // window.ULTIMO_SCAN es rellenado por auditoria.js cuando el usuario escanea
      // puertos o procesos. Si no ha escaneado aún, la correlación solo funcionará
      // con CVEs (sin coincidencias de puerto directas).
      const context = {
        noticias,
        puertos:  window.ULTIMO_SCAN?.puertos  || [],  // Lista de conexiones TCP activas
        procesos: window.ULTIMO_SCAN?.procesos || [],  // Lista de procesos (reservado para correlaciones futuras)
      };

      // payload.context es el campo que correlacion.run() espera en el sidecar
      const corrRes = await invokeRaw('radar_correlate', { payload: { context } });
      if (!corrRes.ok) throw new Error(corrRes.error || t('radar.error_corr'));

      // ── Actualizar estado con los resultados ────────────────────────────────
      const ahora = new Date();
      estado.noticias      = noticias;
      estado.alertas       = corrRes.data?.alertas || [];
      estado.resumen       = corrRes.data?.resumen  || { critico: 0, alto: 0, total: 0 };
      estado.fuentesOk     = metaFetch.fuentes_ok  || 0;
      estado.noticiasTotal = noticias.length;
      // Sumar las duraciones de ambas llamadas IPC para mostrar el tiempo total
      estado.duracionMs    = (metaFetch.duracion_ms || 0) + (corrRes.meta?.duracion_ms || 0);
      estado.timestamp     = ahora.toLocaleTimeString('es-ES');
      // Fecha completa para la cabecera del informe impreso: "martes, 10 de junio de 2026"
      estado.fechaInforme  = ahora.toLocaleDateString(
        window.ESTICC_LANG === 'en' ? 'en-US' : 'es-ES',
        { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }
      );

      renderizar();  // Reconstruir toda la UI con los datos recién obtenidos

    } catch (err) {
      // Mostrar el error en el panel (timeout de red, sin conexión, sidecar caído...)
      resultadoEl.innerHTML =
        `<p style="color:var(--danger);margin-top:16px;">${t('estados.error')}: ${esc(String(err))}</p>`;
    } finally {
      // Restaurar la UI siempre, haya habido error o no
      estado.cargando = false;
      if (btn)    { btn.disabled = false; btn.textContent = t('botones.actualizar_radar'); }
      setLoading(false);
    }
  }

  // ── Renderizado principal ─────────────────────────────────────────────────────
  /**
   * renderizar() — Genera el HTML completo del informe e inyecta en #resultado-radar.
   *
   * La estructura del HTML generado es:
   *   #radar-informe-contenido
   *   ├── .vista-basica      → contadores + alertas compactas
   *   ├── #radar-informe-semana → Informe OSINT Semanal (ambos modos)
   *   ├── .vista-avanzada    → alertas detalladas + tabla raw
   *   └── footer de metadata
   *
   * El div #radar-informe-contenido es lo único que @media print muestra al
   * generar el PDF; el resto de la aplicación se oculta.
   */
  function renderizar() {
    const el = document.getElementById('resultado-radar');
    if (!el) return;

    // Revelar el botón PDF ahora que hay contenido que imprimir
    const btnPdf = document.getElementById('btn-radar-pdf');
    if (btnPdf) btnPdf.style.display = '';

    el.innerHTML = `
      <div id="radar-informe-contenido">

        <!-- Modo básico: contadores numéricos + tarjetas de alerta simplificadas -->
        <div class="vista-basica">
          ${seccionContadores()}
          ${alertasBasicas()}
        </div>

        <!-- Informe OSINT Semanal: visible en ambos modos; noticias de los últimos 7 días -->
        ${informeSemanal()}

        <!-- Modo avanzado: alertas con detalle técnico + tabla raw de todas las noticias -->
        <div class="vista-avanzada">
          ${alertasAvanzadas()}
          ${tablaRaw()}
        </div>

        <!-- Footer con metadata de la actualización: timestamp, fuentes, noticias, duración -->
        ${footerMeta()}

      </div>`;
  }

  // ── Contadores (vista básica) ─────────────────────────────────────────────────
  // Tres indicadores grandes con borde de color según si hay alertas:
  //   Críticas (rojo si > 0, verde si 0) · Altas (naranja si > 0) · Noticias revisadas (verde)
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

  // ── Alertas compactas (vista básica) ─────────────────────────────────────────
  // Si no hay alertas muestra el bloque verde "Sin amenazas relevantes".
  // Si las hay, muestra tarjetas de alerta con icono de semáforo y explicación.
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
      // 🔴 para alertas críticas (coincidencia de puerto), 🟡 para altas (CVE publicado)
      const icono  = a.nivel === 'critico' ? '🔴' : '🟡';
      // El tipo 'puerto' indica que un puerto local abierto coincide con la amenaza publicada
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
   * informeSemanal() — Núcleo del nuevo informe.
   *
   * Filtra las noticias de los últimos 7 días usando VENTANA_SEMANA_MS.
   * Si menos de 3 noticias tienen fecha dentro de esa ventana (feeds con fechas
   * antiguas o sin fecha correcta), usa las 20 más recientes como fallback y
   * muestra un aviso en la cabecera del informe.
   *
   * Agrupa las noticias por severidad (crítico → alto → info) y genera una
   * sección con título y grid de tarjetas para cada grupo que tenga noticias.
   */
  function informeSemanal() {
    const ahora = Date.now();

    // Filtrar noticias dentro de la ventana de 7 días
    // El bloque try/catch protege contra fechas malformadas en feeds no estándar
    const semana = estado.noticias.filter(n => {
      try {
        return (ahora - new Date(n.fecha).getTime()) <= VENTANA_SEMANA_MS;
      } catch { return false; }
    });

    // Fallback: si hay menos de 3 noticias recientes, mostrar las 20 más recientes
    // sin importar la fecha (los feeds ya vienen ordenados por fecha descendente)
    const fuente         = semana.length >= 3 ? semana : estado.noticias.slice(0, 20);
    const esVentanaReal  = semana.length >= 3;  // false → se usó el fallback

    // Separar por severidad para presentar secciones diferenciadas por color
    const criticas = fuente.filter(n => n.severidad === 'critico');
    const altas    = fuente.filter(n => n.severidad === 'alto');
    const infos    = fuente.filter(n => n.severidad === 'info');

    // Cabecera del informe: título grande + fecha + indicador de fallback si aplica
    const cabecera = `
      <div class="radar-informe-header" id="radar-informe-print-header">
        <div class="radar-informe-titulo">
          📰 ${t('radar.informe_titulo')}
        </div>
        <div class="radar-informe-fecha">
          ${estado.fechaInforme || ''}
          ${!esVentanaReal
            ? `<span class="radar-informe-fallback"> — ${t('radar.ultimas_disponibles')}</span>`
            : ''}
        </div>
      </div>`;

    // Solo renderizar las secciones que tienen noticias (omitir secciones vacías)
    const secCriticas = criticas.length ? seccionNoticias(criticas, 'critico', `🔴 ${t('radar.sec_criticas')}`,  criticas.length) : '';
    const secAltas    = altas.length    ? seccionNoticias(altas,    'alto',    `🟡 ${t('radar.sec_altas')}`,    altas.length)    : '';
    const secInfo     = infos.length    ? seccionNoticias(infos,    'info',    `ℹ️ ${t('radar.sec_info')}`,    infos.length)    : '';

    // Si todos los feeds fallaron y no hay ninguna noticia, mostrar mensaje de error
    const sinDatos = !criticas.length && !altas.length && !infos.length
      ? `<div class="radar-sin-alertas" style="margin-top:16px;">${t('radar.sin_noticias_semana')}</div>`
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
   * seccionNoticias() — Genera una sección con título y grid de tarjetas.
   *
   * Limita a 10 tarjetas para no sobrecargar el DOM ni el PDF impreso.
   * Si la lista tiene más, muestra un pie de sección con el recuento de las omitidas.
   *
   * @param {Array}  lista  - Noticias filtradas de una severidad concreta
   * @param {string} nivel  - 'critico' | 'alto' | 'info' (clase CSS del título)
   * @param {string} titulo - Texto del encabezado de la sección
   * @param {number} total  - Total de noticias en la lista (antes del slice)
   */
  function seccionNoticias(lista, nivel, titulo, total) {
    const MAX_TARJETAS = 10;
    const mostrar   = lista.slice(0, MAX_TARJETAS);
    const restantes = total > MAX_TARJETAS ? total - MAX_TARJETAS : 0;

    const tarjetas = mostrar.map(n => tarjetaNoticia(n)).join('');

    // Pie de sección con el número de noticias omitidas (solo si las hay)
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
   *
   * Estructura de la tarjeta:
   *   [punto severidad] [fuente]           [fecha relativa]
   *   Título como enlace clickable
   *   Resumen truncado a 200 chars (solo modo avanzado, clase modo-avanzado-only)
   *
   * La fecha relativa se calcula en el cliente para mostrar "hoy", "ayer" o
   * "hace N días" en lugar de la fecha ISO cruda del feed.
   * Si la fecha no es parseable, se cae al fragmento YYYY-MM-DD de la fecha ISO.
   *
   * @param {Object} n - Objeto noticia con titulo, enlace, fuente, fecha, resumen, severidad
   */
  function tarjetaNoticia(n) {
    // ── Calcular etiqueta de fecha relativa ──────────────────────────────────
    let etiquetaDias = '';
    try {
      const diasAtras = Math.floor((Date.now() - new Date(n.fecha).getTime()) / 86_400_000);
      if      (diasAtras === 0) etiquetaDias = t('radar.hoy');
      else if (diasAtras === 1) etiquetaDias = t('radar.ayer');
      else if (diasAtras <  7) {
        // "hace 3 días" en español; en inglés: "3 days ago" (hace='' + dias='days ago')
        const hace = t('radar.hace');
        etiquetaDias = `${hace}${hace ? ' ' : ''}${diasAtras} ${t('radar.dias')}`;
      }
      else etiquetaDias = n.fecha?.substring(0, 10) || '';  // Fuera de la semana: fecha ISO
    } catch {
      etiquetaDias = n.fecha?.substring(0, 10) || '';  // Fecha malformada: mostrar raw
    }

    // ── Título como enlace o texto plano ─────────────────────────────────────
    // rel="noopener noreferrer" previene que la página destino pueda acceder a
    // window.opener (buena práctica de seguridad para enlaces externos en Tauri)
    const tituloHtml = n.enlace
      ? `<a href="${esc(n.enlace)}" target="_blank" rel="noopener noreferrer">${esc(n.titulo)}</a>`
      : `<span>${esc(n.titulo)}</span>`;

    // ── Resumen (solo modo avanzado) ─────────────────────────────────────────
    // Truncado a 200 caracteres para mantener las tarjetas compactas en la grid.
    // La clase modo-avanzado-only hace que CSS lo oculte en modo básico.
    const resumenHtml = n.resumen
      ? `<div class="radar-noticia-card-resumen modo-avanzado-only">
           ${esc(n.resumen.length > 200 ? n.resumen.slice(0, 200) + '…' : n.resumen)}
         </div>`
      : '';

    return `
      <div class="radar-noticia-card ${n.severidad}">
        <div class="radar-noticia-card-meta">
          <span class="radar-sev ${n.severidad}"></span>  <!-- Punto de color de severidad -->
          <span class="radar-noticia-fuente">${esc(n.fuente)}</span>
          <span class="radar-noticia-fecha">${etiquetaDias}</span>
        </div>
        <div class="radar-noticia-card-titulo">${tituloHtml}</div>
        ${resumenHtml}
      </div>`;
  }

  // ── Alertas detalladas (vista avanzada) ───────────────────────────────────────
  /**
   * alertasAvanzadas() — Genera las tarjetas de correlación con toda la información
   * técnica: nivel, tipo, coincidencia exacta (puerto o CVE), explicación,
   * tags de CVEs referenciados y enlace a la noticia origen.
   */
  function alertasAvanzadas() {
    if (!estado.alertas.length) {
      return `<div class="radar-sin-alertas">
        <span style="font-size:20px;">✅</span>&nbsp; ${t('radar.sin_alertas_correlacion')}
      </div>`;
    }

    const tituloHtml = `<div class="radar-alertas-titulo">
      ⚠️ ${t('radar.alertas_correlacion')} (${estado.alertas.length})
    </div>`;

    const items = estado.alertas.map(a => {
      // CVEs en chips monoespaciados rojos (solo si la alerta los tiene)
      const cveHtml = a.cves?.length
        ? `<div class="radar-cve-tags">
             ${a.cves.map(c => `<span class="radar-cve-tag">${esc(c)}</span>`).join('')}
           </div>`
        : '';

      // Enlace a la noticia fuente que disparó la alerta
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
            <!-- Badge de nivel: fondo semitransparente del color del nivel -->
            <span class="radar-alerta-nivel ${a.nivel}">${a.nivel}</span>
            <!-- Coincidencia: puerto ":445, :139" o CVE "CVE-2017-0144" -->
            <span class="radar-alerta-coincidencia">${esc(a.coincidencia)}</span>
          </div>
          <!-- Explicación en lenguaje natural generada por el backend Python -->
          <div class="radar-alerta-explicacion">${esc(a.explicacion)}</div>
          ${cveHtml}
          ${noticiaHtml}
        </div>`;
    }).join('');

    return `<div style="margin-bottom:20px;">${tituloHtml}${items}</div>`;
  }

  // ── Tabla raw (vista avanzada) ────────────────────────────────────────────────
  /**
   * tablaRaw() — Tabla completa de todas las noticias descargadas, sin filtro
   * de fecha, para analistas que quieran revisar el feed más allá de 7 días.
   * Limitada a 50 filas para no sobrecargar el DOM con feeds prolíficos.
   */
  function tablaRaw() {
    if (!estado.noticias.length) return '';

    const MAX_FILAS = 50;
    const filas = estado.noticias.slice(0, MAX_FILAS).map(n => {
      const fecha  = n.fecha ? n.fecha.substring(0, 10) : '—';  // Solo YYYY-MM-DD de la ISO
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
  // Muestra el timestamp de la última actualización, el número de fuentes que
  // respondieron, el total de noticias analizadas y el tiempo de respuesta.
  function footerMeta() {
    if (!estado.timestamp) return '';  // Sin datos aún: no mostrar footer vacío
    return `
      <div class="radar-meta" style="margin-top:14px;">
        ${t('msgs.consultado')} ${estado.timestamp} &nbsp;·&nbsp;
        ${estado.fuentesOk} ${t('radar.fuentes')} &nbsp;·&nbsp;
        ${estado.noticiasTotal} ${t('radar.noticias_analizadas')}
        ${estado.duracionMs ? `&nbsp;·&nbsp; ${estado.duracionMs} ms` : ''}
      </div>`;
  }

  // ── Helper: escape de HTML ────────────────────────────────────────────────────
  /**
   * esc() — Escapa los caracteres HTML especiales de un string.
   *
   * Es CRÍTICO aplicar este escape a cualquier texto que provenga de internet
   * (títulos de noticias, resúmenes, nombres de fuentes, URLs) antes de
   * insertarlo en el DOM. Sin esto, un feed RSS malicioso podría inyectar
   * scripts arbitrarios en la interfaz de ESTICC (ataque XSS).
   *
   * Orden de sustituciones: & primero para no re-escapar los otros caracteres.
   */
  function esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g,  '&amp;')   // & → &amp;  (primero: evita doble-escape)
      .replace(/</g,  '&lt;')    // < → &lt;   (previene apertura de etiquetas)
      .replace(/>/g,  '&gt;')    // > → &gt;   (previene cierre de etiquetas)
      .replace(/"/g,  '&quot;'); // " → &quot; (previene romper atributos HTML)
  }

})();  // IIFE: todo el módulo vive en un scope privado; nada se expone al namespace global
