/**
 * radar.js — Panel OSINT Radar.
 * Obtiene noticias de 6 fuentes RSS de ciberseguridad vía sidecar Python
 * y las correlaciona con el último escaneo de puertos del sistema local.
 */

(function () {
  'use strict';  // Modo estricto: activa comprobaciones extra de JavaScript (no permite variables sin declarar)

  // ── Estado interno del radar ─────────────────────────────────────────────────
  // Objeto centralizado que mantiene el estado entre actualizaciones del radar

  const estado = {
    cargando:      false,  // Bandera para evitar llamadas simultáneas si el usuario hace doble click
    noticias:      [],     // Array de noticias RSS descargadas (salida de radar_fetch)
    alertas:       [],     // Array de alertas de correlación (salida de radar_correlate)
    resumen:       { critico: 0, alto: 0, total: 0 },  // Contadores para los escudos de la vista básica
    fuentesOk:     0,      // Número de feeds RSS descargados con éxito (de 6 posibles)
    noticiasTotal: 0,      // Total de noticias descargadas (para mostrar en metadata)
    timestamp:     null,   // Hora de la última actualización (string formateado)
  };

  // ── IPC directo a Tauri (sin pasar por el interceptor del simulador) ──────────

  /**
   * invokeRaw() — Llama directamente a Tauri sin pasar por el simulador.
   * El radar no tiene modo demo (requiere internet real), así que no usamos window.invoke().
   */
  function invokeRaw(action, extra) {
    if (!window.__TAURI__) {
      // Si Tauri no está disponible (apertura en navegador), rechazar con mensaje claro
      return Promise.reject('window.__TAURI__ no disponible. Ejecuta desde Tauri.');
    }
    // Object.assign combina {action} con extra (ej: {payload: {context: {...}}})
    // El resultado es el objeto de argumentos que recibe el comando Rust 'audit'
    return window.__TAURI__.tauri.invoke('audit', Object.assign({ action }, extra || {}));
  }

  // ── Inicialización tras carga del DOM ─────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btn-radar');
    if (btn) btn.addEventListener('click', ejecutarRadar);  // Conectar el botón con la función principal
  });

  // ── Función principal del radar ────────────────────────────────────────────────

  /**
   * ejecutarRadar() — Orquesta el ciclo completo del Radar OSINT:
   * 1. Descarga noticias RSS (radar_fetch)
   * 2. Construye el contexto local (puertos del último escaneo)
   * 3. Correlaciona noticias con el estado local (radar_correlate)
   * 4. Renderiza los resultados en ambas vistas (básica y avanzada)
   */
  async function ejecutarRadar() {
    if (estado.cargando) return;  // Evitar ejecuciones paralelas si el usuario hace click varias veces

    const resultadoEl = document.getElementById('resultado-radar');
    if (!resultadoEl) return;  // Salida segura si el panel no existe en el DOM

    // El radar no funciona en modo demo (necesita internet real para los feeds RSS)
    if (window.SIMULADOR?.activo) {
      resultadoEl.innerHTML = `
        <div class="radar-demo-notice">
          <div style="font-size:28px;margin-bottom:10px;">📡</div>
          El Radar OSINT requiere conexión a internet real.<br>
          Este módulo no está disponible en modo demostración.
        </div>`;
      return;
    }

    // ── Fase de carga ────────────────────────────────────────────────────────────
    estado.cargando = true;  // Marcar como en progreso para evitar doble click
    const btn = document.getElementById('btn-radar');
    if (btn) { btn.disabled = true; btn.textContent = t('estados.analizando'); }  // Feedback visual inmediato
    setLoading(true, 'Actualizando Radar OSINT…');

    try {
      // ── Paso 1: Descargar noticias RSS desde el sidecar Python ───────────────
      // radar_fetch llama a lector_rss.run() → descarga paralela de 6 feeds RSS
      const fetchRes = await invokeRaw('radar_fetch');
      if (!fetchRes.ok) throw new Error(fetchRes.error || 'Error al obtener noticias');

      const noticias  = fetchRes.data?.noticias || [];   // Array de noticias con título, resumen, fecha, etc.
      const metaFetch = fetchRes.meta || {};              // Metadata: cuántos feeds respondieron, tiempo, etc.

      // ── Paso 2: Construir el contexto local para la correlación ──────────────
      // window.ULTIMO_SCAN se puebla en auditoria.js cuando el usuario escanea puertos/procesos
      // Si no se ha escaneado todavía, puertos y procesos estarán vacíos (correlación solo por CVE)
      const context = {
        noticias,                                        // Las noticias recién descargadas
        puertos:  window.ULTIMO_SCAN?.puertos  || [],   // Último escáner de puertos (puede ser [])
        procesos: window.ULTIMO_SCAN?.procesos || [],   // Último escáner de procesos (reservado)
      };

      // ── Paso 3: Correlacionar noticias con el estado local ───────────────────
      // radar_correlate llama a correlacion.run(context) en el sidecar Python
      // payload.context se fusiona en el JSON IPC gracias al cambio en main.rs (payload: Option<Value>)
      const corrRes = await invokeRaw('radar_correlate', { payload: { context } });
      if (!corrRes.ok) throw new Error(corrRes.error || 'Error en correlación');

      // Actualizar el estado interno con los resultados de la correlación
      estado.noticias      = noticias;
      estado.alertas       = corrRes.data?.alertas || [];   // Array de alertas generadas
      estado.resumen       = corrRes.data?.resumen  || { critico: 0, alto: 0, total: 0 };
      estado.fuentesOk     = metaFetch.fuentes_ok  || 0;   // Feeds que respondieron correctamente
      estado.noticiasTotal = noticias.length;
      estado.timestamp     = new Date().toLocaleTimeString('es-ES');  // Hora local formateada

      renderizar();  // Actualizar la UI con los nuevos datos

    } catch (err) {
      // Mostrar el error en el panel (timeout, sin internet, sidecar caído...)
      resultadoEl.innerHTML =
        `<p style="color:var(--danger);margin-top:16px;">Error: ${err}</p>`;
    } finally {
      // Siempre restaurar la UI al estado normal, haya habido error o no
      estado.cargando = false;
      if (btn) { btn.disabled = false; btn.textContent = t('botones.actualizar_radar'); }
      setLoading(false);
    }
  }

  // ── Renderizado principal ──────────────────────────────────────────────────────

  /**
   * renderizar() — Genera el HTML de ambas vistas e inyecta la metadata.
   * Las vistas básica y avanzada se generan siempre y el CSS decide cuál mostrar.
   */
  function renderizar() {
    const el = document.getElementById('resultado-radar');
    if (!el) return;

    // Metadata visible debajo del panel (fuentes, total de noticias, timestamp)
    const meta = estado.timestamp
      ? `<div class="radar-meta" style="margin-top:14px;">
           Actualizado: ${estado.timestamp} &nbsp;·&nbsp;
           ${estado.fuentesOk} fuentes &nbsp;·&nbsp;
           ${estado.noticiasTotal} noticias analizadas
         </div>`
      : '';

    // Inyectar ambas vistas en el DOM (una oculta según el modo actual)
    el.innerHTML = `
      <div class="vista-basica">${vistaBasica()}</div>
      <div class="vista-avanzada">${vistaAvanzada()}</div>
      ${meta}
    `;
  }

  // ── Vista básica ───────────────────────────────────────────────────────────────

  /**
   * vistaBasica() — Genera contadores grandes + lista resumida de alertas.
   * Diseñada para usuarios sin conocimientos técnicos: visual, directo, sin tecnicismos.
   */
  function vistaBasica() {
    const { critico, alto, total } = estado.resumen;

    // Tres contadores grandes: alertas críticas, alertas altas, noticias revisadas
    // El color del borde depende de si hay alertas (critico/alto/ok)
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
        <div class="radar-sin-alertas-bloque">
          <span class="radar-sin-alertas-badge">✅ Sin amenazas relevantes</span>
          <span class="radar-sin-alertas-sub">Las ${estado.noticiasTotal} noticias analizadas no presentan coincidencias con tu sistema.</span>
        </div>`;
    }

    // Con alertas: mostrar tarjetas simplificadas con el tipo de amenaza y la explicación
    const alertasHtml = estado.alertas.map(a => {
      const icono  = a.nivel === 'critico' ? '🔴' : '🟡';  // Color semáforo para el nivel
      // El tipo 'puerto' significa coincidencia directa; 'cve' significa vulnerabilidad publicada
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

  // ── Vista avanzada ─────────────────────────────────────────────────────────────

  /**
   * vistaAvanzada() — Combina las alertas detalladas con la tabla de noticias completa.
   */
  function vistaAvanzada() {
    return alertasAvanzado() + tablaDeNoticias();
  }

  /**
   * alertasAvanzado() — Genera las tarjetas de alerta con todos los detalles técnicos:
   * nivel, tipo, coincidencia exacta, explicación, CVEs y enlace a la noticia fuente.
   */
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
      // CVEs referenciados en la noticia (si los hay) como chips rojos monoespaciados
      const cveHtml = (a.cves?.length)
        ? `<div class="radar-cve-tags">${a.cves.map(c => `<span class="radar-cve-tag">${esc(c)}</span>`).join('')}</div>`
        : '';

      // Enlace a la noticia que generó la alerta (para que el usuario pueda leer el artículo completo)
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

  /**
   * tablaDeNoticias() — Genera la tabla completa de noticias RSS ordenadas por fecha.
   * Limita a 40 noticias para no sobrecargar el DOM con cientos de filas.
   */
  function tablaDeNoticias() {
    if (!estado.noticias.length) return '';

    const filas = estado.noticias.slice(0, 40).map(n => {  // Máximo 40 noticias en la tabla
      const fecha    = n.fecha ? n.fecha.substring(0, 10) : '—';  // Solo la parte YYYY-MM-DD de la fecha ISO
      const sevClass = n.severidad || 'info';   // Clase CSS del punto de color (critico/alto/info)
      // Si hay enlace, la noticia es clickable; si no, mostrar solo el texto
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

  // ── Helpers ────────────────────────────────────────────────────────────────────

  /**
   * esc() — Escapa caracteres HTML especiales para prevenir XSS.
   * Es crítico aplicar este escape a cualquier dato que venga de internet (títulos, resúmenes de noticias).
   * Sin esto, un feed RSS malicioso podría inyectar scripts en la UI.
   */
  function esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g,  '&amp;')   // & → &amp;  (debe ser primero para no escapar los otros escapes)
      .replace(/</g,  '&lt;')    // < → &lt;   (evita inyección de etiquetas HTML)
      .replace(/>/g,  '&gt;')    // > → &gt;   (cierre de etiquetas)
      .replace(/"/g,  '&quot;'); // " → &quot; (evita romper atributos HTML)
  }

  // ── Estado vacío inicial (antes de la primera actualización) ──────────────────

  document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('resultado-radar');
    if (el) {
      // Mostrar instrucciones iniciales para guiar al usuario antes de la primera actualización
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

})();  // IIFE (Immediately Invoked Function Expression): encapsula todo en un scope privado
       // Evita contaminar el namespace global con las variables internas del módulo
