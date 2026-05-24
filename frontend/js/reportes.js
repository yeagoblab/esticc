/**
 * reportes.js — Módulo de generación de informes de seguridad.
 * Invoca generate_report en el sidecar Python (que ejecuta los 5 escáneres),
 * calcula el riesgo y renderiza un informe HTML completo e imprimible.
 */

(function () {
  'use strict';

  // Puertos sospechosos (debe coincidir con _PUERTOS_SOSPECHOSOS en generador.py)
  const PUERTOS_SOSPECHOSOS = new Set([4444, 31337, 1337, 9999, 6666, 6667, 1080, 4899, 5900, 5555, 7777]);

  // Colores por nivel de riesgo (screen + print)
  const COLORES = {
    bajo:    '#3fb950',
    medio:   '#d29922',
    alto:    '#e3813a',
    critico: '#f85149',
  };

  // Iconos por nivel
  const ICONOS_NIVEL = {
    critico: '🔴',
    alto:    '🟠',
    medio:   '🟡',
    bajo:    '🟢',
  };

  // ── Recomendaciones por tipo de hallazgo ────────────────────────────────────
  const RECOMENDACIONES = [
    {
      check: h => h.categoria === 'Defensas' && h.texto.includes('Firewall'),
      texto: 'Activa el Firewall: Configuración → Seguridad de Windows → Firewall y protección de red → Activar.',
    },
    {
      check: h => h.categoria === 'Defensas' && (h.texto.includes('Defender') || h.texto.includes('Antivirus')),
      texto: 'Reactiva Windows Defender: Seguridad de Windows → Protección contra virus y amenazas → Activar.',
    },
    {
      check: h => h.categoria === 'Defensas' && h.texto.includes('BitLocker'),
      texto: 'Considera activar BitLocker: Panel de control → Cifrado de unidad BitLocker → Activar.',
    },
    {
      check: h => h.categoria === 'Puertos' && h.texto.includes('sospechoso'),
      texto: 'Investiga los puertos sospechosos: usa el panel Procesos de ESTICC para identificar qué aplicación los ocupa y verifica su legitimidad.',
    },
    {
      check: h => h.categoria === 'Puertos' && h.texto.includes('ESTABLISHED'),
      texto: 'Revisa las conexiones activas inusualmente numerosas. Podría indicar actividad de fondo no autorizada.',
    },
    {
      check: h => h.categoria === 'Procesos' && h.texto.includes('sin ruta'),
      texto: 'Investiga los procesos sin ruta de ejecutable: pueden indicar código malicioso inyectado en memoria. Ejecuta un análisis completo con Windows Defender.',
    },
    {
      check: h => h.categoria === 'Procesos' && h.texto.includes('CPU'),
      texto: 'El consumo de CPU elevado sostenido puede indicar minería de criptomonedas (cryptojacker). Revisa el proceso en el panel Procesos e investiga su origen.',
    },
    {
      check: h => h.categoria === 'Autoinicio',
      texto: 'Revisa las entradas de autoinicio con Autoruns (Sysinternals) para identificar entradas no reconocidas o sospechosas.',
    },
    {
      check: h => h.categoria === 'Parches',
      texto: 'Instala las actualizaciones pendientes de Windows: Configuración → Windows Update → Buscar actualizaciones.',
    },
  ];

  // ── Inicialización ──────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', () => {
    const btnGenerar  = document.getElementById('btn-generar-informe');
    const btnImprimir = document.getElementById('btn-imprimir-informe');
    if (btnGenerar)  btnGenerar.addEventListener('click', generarInforme);
    if (btnImprimir) btnImprimir.addEventListener('click', () => window.print());
  });

  // ── Generación del informe ──────────────────────────────────────────────────

  async function generarInforme() {
    if (window.SIMULADOR?.activo) {
      document.getElementById('reporte-contenido').innerHTML = `
        <p style="color:var(--warn);margin-top:12px;">
          ⚠️ El generador de informes requiere datos reales del sistema.<br>
          Desactiva el modo demostración antes de generar un informe.
        </p>`;
      return;
    }

    const btnGenerar  = document.getElementById('btn-generar-informe');
    const btnImprimir = document.getElementById('btn-imprimir-informe');
    const progress    = document.getElementById('reporte-progress');
    const contenido   = document.getElementById('reporte-contenido');
    const pasos       = document.querySelectorAll('#reporte-progress .rep-paso');

    // ── UI de carga ──────────────────────────────────────────────────────────
    btnGenerar.disabled = true;
    btnImprimir.style.display = 'none';
    contenido.innerHTML = '';
    progress.style.display = 'block';

    // Animación de pasos: activar uno a uno cada ~3 s (estimación)
    const intervalIds = [];
    const tiemposEstimados = [0, 3000, 6000, 12000, 18000]; // defensas, puertos, procesos, autoinicio, parches
    pasos.forEach((el, i) => {
      el.className = 'rep-paso';
      if (i === 0) {
        el.classList.add('activo');
      } else {
        const id = setTimeout(() => {
          pasos[i - 1]?.classList.replace('activo', 'hecho');
          el.classList.add('activo');
        }, tiemposEstimados[i]);
        intervalIds.push(id);
      }
    });

    try {
      // Una sola llamada IPC — el sidecar ejecuta los 5 escáneres y calcula el riesgo
      const resultado = await invoke('audit', { action: 'generate_report' });

      intervalIds.forEach(clearTimeout);
      pasos.forEach(el => el.classList.replace('activo', 'hecho'));

      if (!resultado.ok) {
        throw new Error(resultado.error || 'El sidecar devolvió un error desconocido');
      }

      contenido.innerHTML = buildReportHTML(resultado.data);
      btnImprimir.style.display = 'inline-block';

      // Guardar evento en el historial de análisis
      window.HISTORIAL?.registrar('informe_completo', {
        nivel:         resultado.data.riesgo?.nivel,
        puntuacion:    resultado.data.riesgo?.puntos,
        num_hallazgos: resultado.data.hallazgos?.length ?? 0,
      });

    } catch (e) {
      intervalIds.forEach(clearTimeout);
      contenido.innerHTML = `
        <p style="color:var(--danger);margin-top:12px;">
          Error al generar el informe: ${esc(String(e))}<br>
          <span style="font-size:12px;color:var(--text-dim)">
            Asegúrate de que ESTICC está corriendo con Tauri y el sidecar Python está activo.
          </span>
        </p>`;
    } finally {
      btnGenerar.disabled = false;
      progress.style.display = 'none';
    }
  }

  // ── Constructor del HTML del informe ────────────────────────────────────────

  function buildReportHTML(d) {
    const { riesgo, hallazgos, defensas, puertos, procesos, autoinicio, parches, timestamp, hostname } = d;

    const fecha = timestamp
      ? new Date(timestamp).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' })
      : new Date().toLocaleString('es-ES');

    const color = COLORES[riesgo.nivel] || '#8b949e';
    const nivelLabel = (riesgo.nivel || 'desconocido').toUpperCase();

    return `
      <div id="report-print-area">

        ${seccionCabecera(hostname, fecha)}
        ${seccionRiesgo(riesgo, color, nivelLabel)}
        ${seccionHallazgos(hallazgos, color)}
        ${seccionResumen(defensas, puertos, procesos, autoinicio, parches)}
        ${seccionRecomendaciones(hallazgos)}
        ${seccionFooter(fecha)}

      </div>`;
  }

  // ── Secciones del informe ────────────────────────────────────────────────────

  function seccionCabecera(hostname, fecha) {
    return `
      <div class="rep-header">
        <div>
          <div class="rep-logo">ESTICC</div>
          <div style="font-size:12px;color:var(--text-dim);margin-top:2px;">Informe de Seguridad del Sistema</div>
        </div>
        <div class="rep-header-meta">
          <div class="rep-hostname">${esc(hostname)}</div>
          <div>${esc(fecha)}</div>
        </div>
      </div>`;
  }

  function seccionRiesgo(riesgo, color, nivelLabel) {
    const pct = Math.min(riesgo.puntos, 100);
    return `
      <div class="rep-riesgo-card" style="border-color:${color}">
        <div class="rep-riesgo-izq">
          <div class="rep-nivel-label">Nivel de riesgo</div>
          <div class="rep-nivel-valor" style="color:${color}">${nivelLabel}</div>
        </div>
        <div class="rep-score-wrap">
          <div class="rep-score-label">Puntuación global</div>
          <div class="rep-score-bar-bg">
            <div class="rep-score-bar" style="width:${pct}%;background:${color}"></div>
          </div>
          <div class="rep-score-num">${pct} / 100</div>
        </div>
      </div>`;
  }

  function seccionHallazgos(hallazgos, colorRiesgo) {
    const items = hallazgos.length === 0
      ? `<div class="rep-sin-hallazgos">✅ No se detectaron problemas de seguridad activos.</div>`
      : hallazgos.map(h => {
          const c = COLORES[h.nivel] || '#8b949e';
          const icono = ICONOS_NIVEL[h.nivel] || '⚪';
          return `
            <div class="rep-hallazgo" style="border-left-color:${c}">
              <span class="rep-hallazgo-nivel" style="color:${c}">${icono} ${(h.nivel || '').toUpperCase()}</span>
              <span class="rep-hallazgo-cat">${esc(h.categoria)}</span>
              <span class="rep-hallazgo-texto">— ${esc(h.texto)}</span>
            </div>`;
        }).join('');

    return `
      <div class="rep-section">
        <h3>Hallazgos detectados (${hallazgos.length})</h3>
        ${items}
      </div>`;
  }

  function seccionResumen(defensas, puertos, procesos, autoinicio, parches) {
    // Defensas
    const fw = defensas?.firewall  || {};
    const av = defensas?.antivirus || {};
    const bl = defensas?.bitlocker || {};
    const cardDefensas = summaryCard('🛡️ Defensas', [
      ['Firewall',   estadoStr(fw.activo),  estadoClase(fw.activo)],
      ['Antivirus',  estadoStr(av.activo),  estadoClase(av.activo)],
      ['BitLocker',  estadoStr(bl.activo),  estadoClase(bl.activo)],
    ]);

    // Puertos
    const totalPuertos    = puertos.length;
    const established     = puertos.filter(p => p.estado === 'ESTABLISHED').length;
    const sospechosos     = puertos.filter(p => {
      const port = parseInt((p.local || '').split(':').at(-1));
      return PUERTOS_SOSPECHOSOS.has(port);
    }).length;
    const cardPuertos = summaryCard('🌐 Puertos TCP', [
      ['Total sockets', totalPuertos],
      ['ESTABLISHED',   established],
      ['Sospechosos',   sospechosos, sospechosos > 0 ? 'danger' : 'ok'],
    ]);

    // Procesos
    const totalProc   = procesos.length;
    const alertas     = procesos.filter(p => p.alerta_cpu || p.alerta_ram || p.sin_ruta).length;
    const sinRuta     = procesos.filter(p => p.sin_ruta).length;
    const cardProcesos = summaryCard('⚙️ Procesos', [
      ['Total activos',  totalProc],
      ['Con alertas',    alertas,  alertas > 0 ? 'warn' : 'ok'],
      ['Sin ruta',       sinRuta,  sinRuta > 0 ? 'danger' : 'ok'],
    ]);

    // Autoinicio
    const numReg    = (autoinicio?.registro            || []).length;
    const numTareas = (autoinicio?.tareas_programadas  || []).length;
    const cardAutoinicio = summaryCard('🚀 Autoinicio', [
      ['Entradas registro', numReg,    numReg > 20 ? 'warn' : 'ok'],
      ['Tareas programadas', numTareas],
    ]);

    // Parches
    const pendientes = (parches?.actualizaciones_pendientes || []).length;
    const actualizado = parches?.sistema_actualizado;
    const ultimaAct   = parches?.ultima_actualizacion_exitosa || '—';
    const cardParches = summaryCard('🔧 Parches', [
      ['Estado',     actualizado ? 'Al día' : 'Desactualizado', actualizado ? 'ok' : 'danger'],
      ['Pendientes', pendientes,   pendientes > 0 ? 'warn' : 'ok'],
      ['Última act.', ultimaAct],
    ]);

    return `
      <div class="rep-section">
        <h3>Resumen por módulo</h3>
        <div class="rep-summary-grid">
          ${cardDefensas}
          ${cardPuertos}
          ${cardProcesos}
          ${cardAutoinicio}
          ${cardParches}
        </div>
      </div>`;
  }

  function seccionRecomendaciones(hallazgos) {
    if (hallazgos.length === 0) {
      return `
        <div class="rep-section">
          <h3>Recomendaciones</h3>
          <div class="rep-ok-msg">
            ✅ Tu sistema no presenta problemas detectables. Mantén las defensas activas y realiza análisis periódicos.
          </div>
        </div>`;
    }

    // Construir lista de recomendaciones únicas basadas en los hallazgos
    const vistas = new Set();
    const items = [];
    for (const h of hallazgos) {
      for (const rec of RECOMENDACIONES) {
        if (rec.check(h) && !vistas.has(rec.texto)) {
          vistas.add(rec.texto);
          items.push(`<li>${esc(rec.texto)}</li>`);
        }
      }
    }

    // Siempre añadir recomendación genérica de seguimiento
    items.push(`<li>Realiza un nuevo análisis completo en 24–48 horas para verificar que los problemas han sido resueltos.</li>`);

    return `
      <div class="rep-section">
        <h3>Recomendaciones (${items.length})</h3>
        <ul class="rep-lista-rec">${items.join('')}</ul>
      </div>`;
  }

  function seccionFooter(fecha) {
    return `
      <div class="rep-footer">
        Generado por ESTICC v0.1.0 &nbsp;·&nbsp; ${esc(fecha)} &nbsp;·&nbsp;
        github.com/yeagob-commits/esticc &nbsp;·&nbsp; MIT License
      </div>`;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function summaryCard(titulo, filas) {
    const filasHtml = filas.map(([clave, valor, clase]) => {
      const cls = clase ? ` rep-summary-${clase}` : '';
      return `
        <div class="rep-summary-row">
          <span class="rep-summary-key">${esc(String(clave))}</span>
          <span class="rep-summary-val${cls}">${esc(String(valor))}</span>
        </div>`;
    }).join('');
    return `
      <div class="rep-summary-card">
        <div class="rep-summary-title">${titulo}</div>
        ${filasHtml}
      </div>`;
  }

  function estadoStr(activo) {
    if (activo === true)  return 'ACTIVO';
    if (activo === false) return 'INACTIVO';
    return 'Desconocido';
  }

  function estadoClase(activo) {
    if (activo === true)  return 'ok';
    if (activo === false) return 'danger';
    return 'warn';
  }

  /** Escapa caracteres HTML para prevenir XSS en datos del sistema. */
  function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

})();
