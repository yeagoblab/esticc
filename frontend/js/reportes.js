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
    const tiemposEstimados = [0, 3000, 6000, 12000, 18000, 21000]; // +hardware al final
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
    const { riesgo, hallazgos, defensas, puertos, procesos, autoinicio, parches, hardware, maquina, timestamp } = d;

    const fecha = timestamp
      ? new Date(timestamp).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' })
      : new Date().toLocaleString('es-ES');

    const color = COLORES[riesgo.nivel] || '#8b949e';
    const nivelLabel = (riesgo.nivel || 'desconocido').toUpperCase();

    // Fallback por si el backend es antiguo y no envía `maquina`
    const maq = maquina || { hostname: d.hostname || '—', ip: '—', mac: '—', tipo: '—', cpu: '—', ram: '—', discos: '—' };

    return `
      <div id="report-print-area">

        ${seccionCabecera(maq, fecha)}
        ${seccionRiesgo(riesgo, color, nivelLabel)}
        ${seccionHallazgos(hallazgos, color)}
        ${seccionResumen(defensas, puertos, procesos, autoinicio, parches)}
        ${hardware ? seccionSaludHardware(hardware) : ''}
        ${seccionRecomendaciones(hallazgos)}
        ${seccionFooter(fecha)}

      </div>`;
  }

  // ── Secciones del informe ────────────────────────────────────────────────────

  function seccionCabecera(maq, fecha) {
    // Separar la información de la máquina en dos columnas temáticas:
    // izquierda = identidad de red (quién es el equipo en la red);
    // derecha = componentes de hardware (qué tiene por dentro).
    // Esta separación facilita la lectura rápida y el encuadre forense del informe.
    const colRed = [
      ['Equipo',         maq.hostname],
      ['Dirección IP',   maq.ip],
      ['Dirección MAC',  maq.mac,  true],  // true → clase rep-mono: fuente monospace para la dirección MAC
      ['Tipo de equipo', maq.tipo],
    ];

    const colHW = [
      ['Procesador',      maq.cpu],
      ['Memoria RAM',     maq.ram],
      ['Almacenamiento',  maq.discos],
    ];

    // Helper local: construye una fila clave/valor con escape HTML y tipografía opcional monospace
    const fila = (clave, valor, mono = false) => `
      <div class="rep-maquina-row">
        <span class="rep-maquina-key">${esc(clave)}</span>
        <span class="rep-maquina-val${mono ? ' rep-mono' : ''}">${esc(valor || '—')}</span>
      </div>`;

    return `
      <div class="rep-header-top">
        <div>
          <div class="rep-logo">ESTICC</div>
          <div class="rep-logo-sub">Informe de Seguridad del Sistema</div>
        </div>
        <div class="rep-header-fecha">${esc(fecha)}</div>
      </div>

      <div class="rep-maquina-card">
        <div class="rep-maquina-grid">
          <div class="rep-maquina-col">
            ${colRed.map(([k, v, m]) => fila(k, v, !!m)).join('')}
          </div>
          <div class="rep-maquina-col">
            ${colHW.map(([k, v]) => fila(k, v)).join('')}
          </div>
        </div>
      </div>`;
  }

  function gaugeChart(pct, color) {
    if (pct <= 0) {
      return `<svg viewBox="0 0 200 115" width="180" height="103" xmlns="http://www.w3.org/2000/svg">
        <path d="M 20,100 A 80,80 0 0,1 180,100" fill="none" stroke="#30363d" stroke-width="16" stroke-linecap="round"/>
        <text x="100" y="92" text-anchor="middle" font-size="28" font-weight="700" fill="${color}" font-family="Segoe UI,system-ui,sans-serif">0</text>
        <text x="100" y="110" text-anchor="middle" font-size="11" fill="#8b949e" font-family="Segoe UI,system-ui,sans-serif">/ 100</text>
      </svg>`;
    }
    const p = Math.min(pct, 100);
    const angle = (180 - p * 1.8) * Math.PI / 180;
    const ex = (100 + 80 * Math.cos(angle)).toFixed(2);
    const ey = (100 - 80 * Math.sin(angle)).toFixed(2);
    const largeArc = p > 50 ? 1 : 0;
    const fillPath = p >= 100
      ? 'M 20,100 A 80,80 0 1,1 179.9,100'
      : `M 20,100 A 80,80 0 ${largeArc},1 ${ex},${ey}`;
    return `<svg viewBox="0 0 200 115" width="180" height="103" xmlns="http://www.w3.org/2000/svg">
      <path d="M 20,100 A 80,80 0 0,1 180,100" fill="none" stroke="#30363d" stroke-width="16" stroke-linecap="round"/>
      <path d="${fillPath}" fill="none" stroke="${color}" stroke-width="16" stroke-linecap="round"/>
      <text x="100" y="92" text-anchor="middle" font-size="28" font-weight="700" fill="${color}" font-family="Segoe UI,system-ui,sans-serif">${p}</text>
      <text x="100" y="110" text-anchor="middle" font-size="11" fill="#8b949e" font-family="Segoe UI,system-ui,sans-serif">/ 100</text>
    </svg>`;
  }

  function seccionRiesgo(riesgo, color, nivelLabel) {
    const pct = Math.min(riesgo.puntos, 100);
    return `
      <div class="rep-riesgo-card" style="border-color:${color}">
        <div class="rep-gauge-wrap">
          ${gaugeChart(pct, color)}
        </div>
        <div class="rep-riesgo-info">
          <div class="rep-nivel-label">Nivel de riesgo</div>
          <div class="rep-nivel-valor" style="color:${color}">${nivelLabel}</div>
          <div class="rep-nivel-desc" style="margin-top:6px;font-size:12px;color:var(--text-dim);">
            ${pct <= 10 ? 'Sistema en buen estado. Mantén las defensas activas.' :
              pct <= 35 ? 'Algunos aspectos a mejorar. Revisa las recomendaciones.' :
              pct <= 65 ? 'Riesgo significativo detectado. Actúa pronto.' :
              'Riesgo crítico. Toma acción inmediata.'}
          </div>
        </div>
      </div>`;
  }

  // Mapa de categoría de hallazgo → panel al que navegar
  const CAT_PANEL = {
    'Defensas':  'defensas',
    'Puertos':   'puertos',
    'Procesos':  'procesos',
    'Autoinicio': 'autoinicio',
    'Parches':   'parches',
  };

  function navegarAModulo(panel) {
    const btn = document.querySelector(`#sidebar .nav-item[data-panel="${panel}"]`);
    if (btn) btn.click();
  }
  // Exponer globalmente para los onclick inline
  window.__navegarAModulo = navegarAModulo;

  function seccionHallazgos(hallazgos, colorRiesgo) {
    const items = hallazgos.length === 0
      ? `<div class="rep-sin-hallazgos">✅ No se detectaron problemas de seguridad activos.</div>`
      : hallazgos.map((h, i) => {
          const c = COLORES[h.nivel] || '#8b949e';
          const icono = ICONOS_NIVEL[h.nivel] || '⚪';
          const panelId = CAT_PANEL[h.categoria];
          const linkModulo = panelId
            ? `<button class="rep-hallazgo-link" onclick="__navegarAModulo('${panelId}')">Ver módulo →</button>`
            : '';
          return `
            <div class="rep-hallazgo-badge" style="background:rgba(${c === '#f85149' ? '248,81,73' : c === '#d29922' ? '210,153,34' : c === '#e3813a' ? '227,129,58' : '63,185,80'},0.07);border-color:rgba(${c === '#f85149' ? '248,81,73' : c === '#d29922' ? '210,153,34' : c === '#e3813a' ? '227,129,58' : '63,185,80'},0.3);">
              <span class="rep-hallazgo-num">${i + 1}</span>
              <span class="rep-hallazgo-nivel-badge" style="background:rgba(${c === '#f85149' ? '248,81,73' : c === '#d29922' ? '210,153,34' : c === '#e3813a' ? '227,129,58' : '63,185,80'},0.18);color:${c};">${icono} ${(h.nivel || '').toUpperCase()}</span>
              <span class="rep-hallazgo-cat-chip">${esc(h.categoria)}</span>
              <span class="rep-hallazgo-texto">${esc(h.texto)}</span>
              ${linkModulo}
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

  // ── Sección: Salud del dispositivo ──────────────────────────────────────────

  function seccionSaludHardware(hw) {
    // Si el sidecar no envió el objeto hardware o no calculó salud, omitir la sección entera.
    // Esto ocurre cuando el usuario genera el informe con una versión antigua del backend.
    if (!hw || !hw.salud) return '';

    const s   = hw.salud;     // Objeto con los scores y factores de salud de cada componente
    const cpu = hw.cpu  || {};
    const ram = hw.ram  || {};
    const bat = hw.bateria || {};

    // colorSalud: escala INVERSA a la del gauge de uso (donde rojo = nivel alto).
    // Aquí verde = componente sano, rojo = componente deteriorado.
    // Se definen como funciones internas porque solo se usan en esta sección.
    function colorSalud(pct) {
      if (pct == null) return '#8b949e';  // Gris neutro: sin datos disponibles
      return pct >= 80 ? '#3fb950' : pct >= 50 ? '#d29922' : '#f85149';
    }

    // nivelSalud: etiqueta textual del score para usuarios no técnicos que no interpretan porcentajes
    function nivelSalud(pct) {
      if (pct == null) return 'Sin datos';
      return pct >= 80 ? 'Buena' : pct >= 50 ? 'Moderada' : 'Deteriorada';
    }

    // compCard: constructor de una tarjeta de componente de hardware para el informe.
    // Se usa como helper en lugar de repetir el mismo HTML 4 veces (CPU, RAM, disco, batería).
    // slice(0, 3): limitar a 3 factores en el informe para no desbordarlo en caso de muchos factores.
    function compCard(icono, nombre, pct, factores, consejo, extraInfo) {
      const color  = colorSalud(pct);
      const pctTxt = pct != null ? `${pct}%` : '—';  // Guion si no hay datos
      const nivel  = nivelSalud(pct);

      const iconosF = { ok: '✅', warn: '⚠️', danger: '🔴' };
      const factoresHTML = (factores || []).slice(0, 3).map(f =>
        `<div class="rep-salud-factor">
          <span>${iconosF[f.tipo] || '•'}</span>
          <span>${esc(f.texto)}</span>
        </div>`
      ).join('');

      // El consejo solo aparece si hay algo que mejorar (null = todo en orden)
      const consejoHTML = consejo
        ? `<div class="rep-salud-consejo">💡 ${esc(consejo)}</div>`
        : '';

      // extraInfo: contexto numérico del componente (uso actual, temperatura, GB disponibles, etc.)
      // inline style porque este bloque no merece una clase CSS propia en el informe
      const extraHTML = extraInfo
        ? `<div style="font-size:11px;color:var(--text-dim);margin-bottom:6px;">${esc(extraInfo)}</div>`
        : '';

      // Armar la tarjeta del componente con header (nombre + score), nivel, contexto, factores y consejo
      return `
        <div class="rep-salud-comp">
          <div class="rep-salud-header">
            <span class="rep-salud-nombre">${icono} ${esc(nombre)}</span>
            <span class="rep-salud-pct" style="color:${color}">${pctTxt}</span>
          </div>
          <div class="rep-salud-nivel" style="color:${color}">${nivel}</div>
          ${extraHTML}
          <div class="rep-salud-factores">${factoresHTML}</div>
          ${consejoHTML}
        </div>`;
    }

    // Líneas de contexto para cada tarjeta: muestran el estado actual del componente
    // (uso en tiempo real, temperatura, GB disponibles) sin repetir los factores de salud
    const cpuExtra = cpu.uso_pct != null
      ? `Uso actual: ${cpu.uso_pct}%${cpu.temperatura_c != null ? ` · Temp: ${cpu.temperatura_c} °C` : ''} · ${cpu.nucleos_fisicos ?? '—'} núcleos`
      : null;

    const ramExtra = ram.total_gb != null
      ? `${ram.disponible_gb ?? '—'} GB disponibles de ${ram.total_gb ?? '—'} GB totales`
      : null;

    // discoTxt proviene del análisis S.M.A.R.T. del sidecar (ej. "Óptimo", "Advertencia")
    const discoTxt = s.disco_txt ? `Estado S.M.A.R.T.: ${s.disco_txt}` : null;

    const batExtra = bat.presente
      ? `Carga actual: ${bat.porcentaje ?? '—'}% · ${bat.cargando ? 'Cargando' : 'Descargando'}`
      : null;

    // Si no hay batería (desktop), sustituir los factores del sidecar por un mensaje neutral
    // para que la tarjeta no aparezca vacía ni confunda al usuario de sobremesa
    const batFactores = bat.presente
      ? s.bateria_factores
      : [{ tipo: 'ok', texto: 'Equipo de sobremesa o sin batería detectada' }];

    // Construir las cuatro tarjetas de componente.
    // Para batería: si el equipo no tiene batería, pasar pct=null para que muestre "Sin datos"
    const cpuCard   = compCard('🖥️', 'Procesador (CPU)',  s.cpu_pct,     s.cpu_factores,     s.cpu_consejo,     cpuExtra);
    const ramCard   = compCard('🧠', 'Memoria RAM',       s.ram_pct,     s.ram_factores,     s.ram_consejo,     ramExtra);
    const discoCard = compCard('💾', 'Almacenamiento',    s.disco_pct,   s.disco_factores,   s.disco_consejo,   discoTxt);
    const batCard   = compCard('🔋', 'Batería',           bat.presente ? s.bateria_pct : null, batFactores, bat.presente ? s.bateria_consejo : null, batExtra);

    return `
      <div class="rep-section">
        <h3>Salud del dispositivo</h3>
        <p style="font-size:12px;color:var(--text-dim);margin-bottom:12px;">
          Estado de vida útil del hardware basado en temperatura, análisis de memoria y diagnóstico S.M.A.R.T.
          Una puntuación alta indica que el componente está en buenas condiciones; una baja indica deterioro o riesgo.
        </p>
        <div class="rep-salud-grid">
          ${cpuCard}
          ${ramCard}
          ${discoCard}
          ${batCard}
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
        github.com/yeagoblab/esticc &nbsp;·&nbsp; MIT License
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
