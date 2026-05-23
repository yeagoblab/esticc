/**
 * historial.js — Calendario de análisis de ESTICC + Defender.
 * Expone window.HISTORIAL.registrar(tipo, datos) para que otros módulos
 * puedan guardar eventos sin depender directamente de este archivo.
 */

(function () {
  'use strict';

  // ── Constantes ───────────────────────────────────────────────────────────────

  const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  const MESES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ];

  // Tipo de evento → color del punto en el calendario
  const COLOR_POR_TIPO = {
    informe_completo:  '#58a6ff', // azul  — informe ESTICC
    scan_ports:        '#58a6ff',
    scan_processes:    '#58a6ff',
    scan_startup:      '#58a6ff',
    scan_defenses:     '#58a6ff',
    scan_patches:      '#58a6ff',
    fin_analisis:      '#3fb950', // verde — Defender OK
    inicio_analisis:   '#8b949e', // gris  — inicio Defender
    amenaza_detectada: '#f85149', // rojo  — amenaza
    accion_tomada:     '#d29922', // naranja — acción sobre amenaza
  };

  // Etiquetas legibles para tipos de eventos ESTICC
  const ETIQUETA_TIPO = {
    informe_completo: 'Informe completo',
    scan_ports:       'Escaneo de puertos',
    scan_processes:   'Escaneo de procesos',
    scan_startup:     'Entradas de autoinicio',
    scan_defenses:    'Estado de defensas',
    scan_patches:     'Parches del sistema',
  };

  // ── Estado del módulo ────────────────────────────────────────────────────────

  let mesActual  = new Date().getMonth();
  let anioActual = new Date().getFullYear();
  let diaSeleccionado = null;

  // Todos los eventos normalizados: { fecha: "YYYY-MM-DD", hora: "HH:MM", tipo, etiqueta, color, msg, fuente }
  let todosEventos = [];

  // ── API pública ──────────────────────────────────────────────────────────────

  window.HISTORIAL = {
    /**
     * Registra un evento de escaneo ESTICC y actualiza el calendario.
     * @param {string} tipo  — e.g. "informe_completo", "scan_ports"
     * @param {object} datos — { nivel, puntuacion, num_hallazgos } o { resumen }
     */
    registrar: async function (tipo, datos = {}) {
      if (window.SIMULADOR?.activo) return;
      const entrada = {
        timestamp:      new Date().toISOString(),
        tipo,
        nivel:          datos.nivel          ?? null,
        puntuacion:     datos.puntuacion      ?? null,
        num_hallazgos:  datos.num_hallazgos   ?? null,
        resumen:        datos.resumen         ?? null,
        fuente:         'esticc',
      };
      try {
        await invoke('audit', { action: 'historial_esticc_guardar', entrada });
        // Actualizar calendario si está visible
        const panel = document.getElementById('panel-historial');
        if (panel && panel.classList.contains('activo')) {
          await cargarHistorial();
        }
      } catch (_) {
        // No propagar errores de guardado al flujo principal
      }
    },
  };

  // ── Inicialización ───────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btn-cargar-historial');
    const btnPrev = document.getElementById('hist-prev-mes');
    const btnNext = document.getElementById('hist-next-mes');

    if (btn)     btn.addEventListener('click', cargarHistorial);
    if (btnPrev) btnPrev.addEventListener('click', () => navegarMes(-1));
    if (btnNext) btnNext.addEventListener('click', () => navegarMes(+1));

    // Cargar automáticamente cuando el panel se active
    const panelHistorial = document.getElementById('panel-historial');
    if (panelHistorial) {
      const observer = new MutationObserver(() => {
        if (panelHistorial.classList.contains('active') && todosEventos.length === 0) {
          cargarHistorial();
        }
      });
      observer.observe(panelHistorial, { attributes: true, attributeFilter: ['class'] });
    }
  });

  // Actualizar etiqueta del mes al cargar
  const label = document.getElementById('hist-nav-mes');
  if (label) label.textContent = `${MESES[mesActual]} ${anioActual}`;

  // ── Carga de datos ───────────────────────────────────────────────────────────

  async function cargarHistorial() {
    if (window.SIMULADOR?.activo) {
      renderCalendarioVacio('Desactiva el modo demostración para ver el historial real.');
      return;
    }

    const btn = document.getElementById('btn-cargar-historial');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Cargando…';
    }

    try {
      const [resDefender, resEsticc] = await Promise.all([
        invoke('audit', { action: 'historial_defender' }),
        invoke('audit', { action: 'historial_esticc_get' }),
      ]);

      todosEventos = [
        ...normalizarDefender(resDefender),
        ...normalizarEsticc(resEsticc),
      ];

      renderCalendario();
      renderResumen(resDefender);

    } catch (e) {
      const cal = document.getElementById('hist-calendario');
      if (cal) cal.innerHTML = `<p style="color:var(--danger);padding:16px;">Error al cargar historial: ${esc(String(e))}</p>`;
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Actualizar';
      }
    }
  }

  // ── Normalización de datos ───────────────────────────────────────────────────

  function normalizarDefender(res) {
    if (!res?.ok) return [];
    const eventos = res.data?.eventos ?? [];
    const amenazas = res.data?.amenazas ?? [];

    const resultado = [];

    for (const ev of eventos) {
      if (!ev.timestamp) continue;
      const { fecha, hora } = splitFechaHora(ev.timestamp);
      resultado.push({
        fecha,
        hora,
        tipo:     ev.tipo,
        etiqueta: ev.etiqueta || ev.tipo,
        color:    COLOR_POR_TIPO[ev.tipo] || '#8b949e',
        msg:      ev.mensaje || '',
        fuente:   'defender',
      });
    }

    for (const am of amenazas) {
      if (!am.timestamp) continue;
      const { fecha, hora } = splitFechaHora(am.timestamp);
      resultado.push({
        fecha,
        hora,
        tipo:     'amenaza_detectada',
        etiqueta: 'Amenaza detectada',
        color:    '#f85149',
        msg:      am.proceso ? `Proceso: ${am.proceso}` : '',
        fuente:   'defender',
      });
    }

    return resultado;
  }

  function normalizarEsticc(res) {
    if (!res?.ok) return [];
    const entradas = res.data?.entradas ?? [];
    return entradas
      .filter(e => e.timestamp)
      .map(e => {
        const { fecha, hora } = splitFechaHora(e.timestamp);
        const etiqueta = ETIQUETA_TIPO[e.tipo] || e.tipo || 'Escaneo ESTICC';
        let msg = '';
        if (e.nivel)         msg += `Nivel: ${e.nivel.toUpperCase()}`;
        if (e.puntuacion != null) msg += (msg ? ' · ' : '') + `Puntuación: ${e.puntuacion}/100`;
        if (e.num_hallazgos != null) msg += (msg ? ' · ' : '') + `${e.num_hallazgos} hallazgo${e.num_hallazgos !== 1 ? 's' : ''}`;
        if (e.resumen)       msg += (msg ? ' · ' : '') + e.resumen;
        return {
          fecha,
          hora,
          tipo:     e.tipo,
          etiqueta,
          color:    COLOR_POR_TIPO[e.tipo] || '#58a6ff',
          msg,
          fuente:   'esticc',
        };
      });
  }

  // ── Renderizado del calendario ───────────────────────────────────────────────

  function renderCalendario() {
    actualizarNavMes();
    const calGrid = document.getElementById('hist-cal-grid');
    if (!calGrid) return;

    // Agrupar eventos por fecha YYYY-MM-DD
    const porFecha = {};
    for (const ev of todosEventos) {
      if (!porFecha[ev.fecha]) porFecha[ev.fecha] = [];
      porFecha[ev.fecha].push(ev);
    }

    const hoy = new Date();
    const primerDia = new Date(anioActual, mesActual, 1);
    const totalDias = new Date(anioActual, mesActual + 1, 0).getDate();

    // getDay() devuelve 0=Dom…6=Sáb; convertir a 0=Lun…6=Dom
    let inicioOffset = primerDia.getDay() - 1;
    if (inicioOffset < 0) inicioOffset = 6;

    let html = '';

    // Celdas vacías del comienzo
    for (let i = 0; i < inicioOffset; i++) {
      html += '<div class="hist-cal-day vacio"></div>';
    }

    for (let d = 1; d <= totalDias; d++) {
      const fechaStr = `${anioActual}-${String(mesActual + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const eventos = porFecha[fechaStr] || [];
      const esHoy = (d === hoy.getDate() && mesActual === hoy.getMonth() && anioActual === hoy.getFullYear());
      const esSeleccionado = diaSeleccionado === fechaStr;

      const clases = [
        'hist-cal-day',
        esHoy ? 'hoy' : '',
        eventos.length > 0 ? 'con-eventos' : '',
        esSeleccionado ? 'seleccionado' : '',
      ].filter(Boolean).join(' ');

      // Puntos: máximo 6 visibles
      const puntos = eventos.slice(0, 6).map(ev =>
        `<div class="hist-punto" style="background:${ev.color}" title="${esc(ev.etiqueta)}"></div>`
      ).join('');

      const extra = eventos.length > 6
        ? `<div style="font-size:10px;color:var(--text-dim)">+${eventos.length - 6}</div>`
        : '';

      html += `
        <div class="${clases}" data-fecha="${fechaStr}" onclick="__histDiaClick('${fechaStr}')">
          <div class="hist-dia-num">${d}</div>
          <div class="hist-puntos">${puntos}${extra}</div>
        </div>`;
    }

    calGrid.innerHTML = html;

    // Si hay día seleccionado, mostrar su detalle
    if (diaSeleccionado) {
      renderDetalleDia(diaSeleccionado, porFecha[diaSeleccionado] || []);
    } else {
      renderDetalleVacio();
    }
  }

  // Callback global para clics en celdas (evita problemas de scope en onclick inline)
  window.__histDiaClick = function (fecha) {
    if (diaSeleccionado === fecha) {
      diaSeleccionado = null;
    } else {
      diaSeleccionado = fecha;
    }
    renderCalendario();
  };

  function renderCalendarioVacio(msg) {
    const calGrid = document.getElementById('hist-cal-grid');
    if (calGrid) calGrid.innerHTML = `<p style="color:var(--text-dim);padding:16px;grid-column:1/-1;">${esc(msg)}</p>`;
    renderDetalleVacio();
  }

  function actualizarNavMes() {
    const label = document.getElementById('hist-nav-mes');
    if (label) label.textContent = `${MESES[mesActual]} ${anioActual}`;
  }

  function navegarMes(delta) {
    mesActual += delta;
    if (mesActual > 11) { mesActual = 0;  anioActual++; }
    if (mesActual < 0)  { mesActual = 11; anioActual--; }
    diaSeleccionado = null;
    renderCalendario();
  }

  // ── Detalle del día ──────────────────────────────────────────────────────────

  function renderDetalleDia(fecha, eventos) {
    const el = document.getElementById('hist-detalle');
    if (!el) return;

    const [anio, mes, dia] = fecha.split('-');
    const fechaFormato = `${parseInt(dia)} de ${MESES[parseInt(mes) - 1]} de ${anio}`;

    if (eventos.length === 0) {
      el.innerHTML = `
        <div class="hist-detalle-titulo">${esc(fechaFormato)}</div>
        <div class="hist-detalle-vacio">Sin actividad registrada este día.</div>`;
      return;
    }

    // Ordenar cronológicamente
    const ordenados = [...eventos].sort((a, b) => a.hora.localeCompare(b.hora));

    const items = ordenados.map(ev => `
      <div class="hist-ev">
        <div class="hist-ev-dot" style="background:${ev.color}"></div>
        <div class="hist-ev-body">
          <div class="hist-ev-hora">${esc(ev.hora)} · ${ev.fuente === 'defender' ? 'Windows Defender' : 'ESTICC'}</div>
          <div class="hist-ev-etiqueta">${esc(ev.etiqueta)}</div>
          ${ev.msg ? `<div class="hist-ev-msg">${esc(ev.msg)}</div>` : ''}
        </div>
      </div>`).join('');

    el.innerHTML = `
      <div class="hist-detalle-titulo">${esc(fechaFormato)} — ${eventos.length} evento${eventos.length !== 1 ? 's' : ''}</div>
      <div class="hist-timeline">${items}</div>`;
  }

  function renderDetalleVacio() {
    const el = document.getElementById('hist-detalle');
    if (el) {
      el.innerHTML = `<div class="hist-detalle-vacio">Haz clic en un día con actividad para ver los detalles.</div>`;
    }
  }

  // ── Resumen del estado de Defender ──────────────────────────────────────────

  function renderResumen(resDefender) {
    const el = document.getElementById('hist-resumen');
    if (!el) return;

    const estado = resDefender?.data?.estado ?? {};

    const fmtFecha = ts => ts
      ? new Date(ts).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
      : 'Sin datos';

    const diasRapido    = estado.dias_desde_rapido   ?? '—';
    const diasCompleto  = estado.dias_desde_completo ?? '—';

    const claseActivo   = estado.defender_activo         ? 'hist-defender-ok' : 'hist-defender-danger';
    const claseRTP      = estado.proteccion_tiempo_real  ? 'hist-defender-ok' : 'hist-defender-danger';
    const valorActivo   = estado.defender_activo         ? 'Activo' : 'Inactivo';
    const valorRTP      = estado.proteccion_tiempo_real  ? 'Activa' : 'Inactiva';

    el.innerHTML = `
      <div class="hist-stat-card">
        <div class="hist-stat-label">Último análisis rápido</div>
        <div class="hist-stat-valor" style="font-size:15px">${esc(fmtFecha(estado.ultimo_analisis_rapido))}</div>
        <div class="hist-stat-sub">Hace ${esc(String(diasRapido))} día${diasRapido !== 1 ? 's' : ''}</div>
      </div>
      <div class="hist-stat-card">
        <div class="hist-stat-label">Último análisis completo</div>
        <div class="hist-stat-valor" style="font-size:15px">${esc(fmtFecha(estado.ultimo_analisis_completo))}</div>
        <div class="hist-stat-sub">Hace ${esc(String(diasCompleto))} día${diasCompleto !== 1 ? 's' : ''}</div>
      </div>
      <div class="hist-stat-card">
        <div class="hist-stat-label">Windows Defender</div>
        <div class="hist-stat-valor ${claseActivo}" style="font-size:16px">${esc(valorActivo)}</div>
        <div class="hist-stat-sub ${claseRTP}">Protección en tiempo real: ${esc(valorRTP)}</div>
      </div>
      <div class="hist-stat-card">
        <div class="hist-stat-label">Amenazas recientes</div>
        <div class="hist-stat-valor">${resDefender?.data?.amenazas?.length ?? 0}</div>
        <div class="hist-stat-sub">En el historial de Defender</div>
      </div>`;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function splitFechaHora(isoStr) {
    try {
      const d = new Date(isoStr);
      const fecha = d.toLocaleDateString('sv-SE'); // YYYY-MM-DD
      const hora  = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
      return { fecha, hora };
    } catch (_) {
      return { fecha: '1970-01-01', hora: '00:00' };
    }
  }

  function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

})();
