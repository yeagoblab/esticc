/**
 * historial.js — Calendario interactivo de análisis de ESTICC + Windows Defender.
 *
 * Responsabilidades de este módulo:
 *   1. Cargar datos de historial desde dos fuentes vía IPC:
 *        - historial_defender (eventos del Event Log + estado actual de Defender)
 *        - historial_esticc_get (escaneos guardados en %APPDATA%\ESTICC\historial.json)
 *   2. Normalizar ambas fuentes a un formato de evento único.
 *   3. Renderizar un calendario mensual con puntos de colores por tipo de evento.
 *   4. Mostrar una timeline de eventos al hacer clic en un día.
 *   5. Mostrar tarjetas de resumen del estado actual de Defender.
 *
 * API pública (window.HISTORIAL):
 *   window.HISTORIAL.registrar(tipo, datos) → guarda un evento ESTICC y
 *   refresca el calendario si el panel está activo. Otros módulos (reportes.js,
 *   auditoria.js) pueden llamar a este método con optional chaining (?.) para
 *   que no falle si historial.js no está cargado.
 *
 * Patrón de módulo (IIFE):
 *   Todo el código está envuelto en una IIFE (Immediately Invoked Function Expression):
 *     (function() { 'use strict'; ... })();
 *   Esto crea un scope privado: las variables internas no contaminan el namespace
 *   global. Solo window.HISTORIAL y window.__histDiaClick son globales (necesarios
 *   para la API pública y los onclick inline del HTML generado dinámicamente).
 */

(function () {
  'use strict';

  // ── Constantes de configuración ─────────────────────────────────────────────

  // Nombres de los días de la semana (orden lunes→domingo para el calendario europeo)
  const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  // Nombres de los meses en español para el encabezado de navegación
  const MESES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ];

  // Mapeo de tipo de evento → color del punto en el calendario.
  // Colores elegidos para ser distinguibles en modo oscuro y con daltonismo:
  //   Azul (#58a6ff) → escaneos propios de ESTICC
  //   Verde (#3fb950) → Defender funcionando correctamente (análisis completado)
  //   Gris (#8b949e) → eventos informativos (inicio de análisis)
  //   Rojo (#f85149) → amenazas detectadas
  //   Naranja (#d29922) → acciones sobre amenazas
  const COLOR_POR_TIPO = {
    informe_completo:  '#58a6ff', // Azul: informe completo de ESTICC
    scan_ports:        '#58a6ff', // Azul: escaneo manual de puertos
    scan_processes:    '#58a6ff', // Azul: escaneo manual de procesos
    scan_startup:      '#58a6ff', // Azul: análisis manual de autoinicio
    scan_defenses:     '#58a6ff', // Azul: comprobación manual de defensas
    scan_patches:      '#58a6ff', // Azul: verificación manual de parches
    fin_analisis:      '#3fb950', // Verde: Defender completó un análisis sin incidentes
    inicio_analisis:   '#8b949e', // Gris: Defender inició un análisis (evento informativo)
    amenaza_detectada: '#f85149', // Rojo: Defender encontró malware
    accion_tomada:     '#d29922', // Naranja: Defender actuó sobre una amenaza
  };

  // Etiquetas en español para tipos de eventos ESTICC (los de Defender ya vienen con etiqueta)
  const ETIQUETA_TIPO = {
    informe_completo: 'Informe completo',
    scan_ports:       'Escaneo de puertos',
    scan_processes:   'Escaneo de procesos',
    scan_startup:     'Entradas de autoinicio',
    scan_defenses:    'Estado de defensas',
    scan_patches:     'Parches del sistema',
  };

  // ── Estado interno del módulo ────────────────────────────────────────────────

  // Mes y año actualmente visibles en el calendario (inicio = mes actual)
  let mesActual  = new Date().getMonth();   // 0=Enero … 11=Diciembre
  let anioActual = new Date().getFullYear();

  // Fecha seleccionada por el usuario al hacer clic en una celda del calendario
  // Formato "YYYY-MM-DD" o null si no hay selección
  let diaSeleccionado = null;

  // Todos los eventos normalizados de ambas fuentes (Defender + ESTICC).
  // Cada evento: { fecha, hora, tipo, etiqueta, color, msg, fuente }
  // Se acumula aquí para poder re-renderizar al cambiar de mes sin hacer otra llamada IPC.
  let todosEventos = [];

  // ── API pública: window.HISTORIAL ───────────────────────────────────────────

  /**
   * Objeto público que otros módulos pueden usar para registrar eventos.
   * Se expone en window para que sea accesible desde reportes.js y auditoria.js
   * usando optional chaining: window.HISTORIAL?.registrar(...)
   */
  window.HISTORIAL = {
    /**
     * Registra un evento de escaneo ESTICC en el historial persistente.
     *
     * @param {string} tipo  - Tipo del evento: "informe_completo", "scan_ports", etc.
     * @param {object} datos - Datos adicionales del evento:
     *                         { nivel, puntuacion, num_hallazgos } para informes
     *                         { resumen } para escaneos individuales
     *
     * Diseño: la función es async pero no propaga errores al llamador.
     * Si el guardado falla (Tauri no disponible, sidecar caído), el escaneo
     * principal no se ve afectado. El historial es un "nice to have", no crítico.
     */
    registrar: async function (tipo, datos = {}) {
      // No guardar eventos en modo demostración (los datos son ficticios)
      if (window.SIMULADOR?.activo) return;

      // Construir la entrada que se guardará en historial.json
      const entrada = {
        timestamp:     new Date().toISOString(),    // ISO 8601 con timezone local (el backend lo normaliza a UTC)
        tipo,                                        // Tipo de evento
        nivel:         datos.nivel         ?? null,  // Nivel de riesgo (para informes)
        puntuacion:    datos.puntuacion    ?? null,  // Puntuación 0-100 (para informes)
        num_hallazgos: datos.num_hallazgos ?? null,  // Número de problemas (para informes)
        resumen:       datos.resumen       ?? null,  // Texto libre (para escaneos individuales)
        fuente:        'esticc',                     // Identificador de fuente
      };

      try {
        // Llamada IPC al sidecar Python: acción "historial_esticc_guardar"
        // La acción especial necesita el campo "entrada" en el payload (no es acción simple)
        await invoke('audit', { action: 'historial_esticc_guardar', entrada });

        // Si el panel de historial está abierto, refrescarlo para mostrar el nuevo evento
        const panel = document.getElementById('panel-historial');
        if (panel && panel.classList.contains('active')) {
          await cargarHistorial(); // Re-cargar datos y re-renderizar el calendario
        }
      } catch (_) {
        // Error silencioso: no interrumpir el flujo del módulo que llamó a registrar()
      }
    },
  };

  // ── Inicialización ───────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', () => {
    // Botón "Actualizar": carga/recarga los datos del historial
    const btn     = document.getElementById('btn-cargar-historial');
    // Botones de navegación de mes: < y >
    const btnPrev = document.getElementById('hist-prev-mes');
    const btnNext = document.getElementById('hist-next-mes');

    if (btn)     btn.addEventListener('click', cargarHistorial);
    if (btnPrev) btnPrev.addEventListener('click', () => navegarMes(-1)); // Mes anterior
    if (btnNext) btnNext.addEventListener('click', () => navegarMes(+1)); // Mes siguiente

    // Mostrar el mes actual en el encabezado de navegación al cargar la página
    const label = document.getElementById('hist-nav-mes');
    if (label) label.textContent = `${MESES[mesActual]} ${anioActual}`;

    // Auto-carga: cuando el panel de historial se active por primera vez,
    // cargar los datos automáticamente sin que el usuario tenga que pulsar "Actualizar".
    // Usamos MutationObserver para detectar el cambio de clase "active" en el panel.
    const panelHistorial = document.getElementById('panel-historial');
    if (panelHistorial) {
      const observer = new MutationObserver(() => {
        // Solo cargar si:
        //   1. El panel ahora tiene la clase "active" (está visible)
        //   2. Todavía no hay datos cargados (primera visita)
        if (panelHistorial.classList.contains('active') && todosEventos.length === 0) {
          cargarHistorial();
        }
      });
      // Observar solo cambios en atributos del elemento (específicamente la clase)
      observer.observe(panelHistorial, { attributes: true, attributeFilter: ['class'] });
    }
  });

  // ── Carga de datos desde el sidecar ─────────────────────────────────────────

  /**
   * Carga los datos de historial de ambas fuentes (Defender + ESTICC) en paralelo
   * y renderiza el calendario con los resultados.
   *
   * Usa Promise.all() para lanzar las dos llamadas IPC simultáneamente.
   * Esto es posible porque las dos acciones son independientes entre sí:
   *   historial_defender → consulta PowerShell (Event Log + MpComputerStatus)
   *   historial_esticc_get → lee %APPDATA%\ESTICC\historial.json
   * Total: tiempo del más lento (~2-3s) en lugar de la suma (~4-6s).
   */
  async function cargarHistorial() {
    if (window.SIMULADOR?.activo) {
      // En modo demo no hay historial real: mostrar mensaje explicativo
      renderCalendarioVacio('Desactiva el modo demostración para ver el historial real.');
      return;
    }

    // Feedback visual: deshabilitar el botón y cambiar su texto mientras carga
    const btn = document.getElementById('btn-cargar-historial');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Cargando…';
    }

    try {
      // Lanzar ambas llamadas IPC en paralelo con Promise.all()
      // Si una falla, Promise.all() rechaza con el primer error
      const [resDefender, resEsticc] = await Promise.all([
        invoke('audit', { action: 'historial_defender' }),    // Datos de Defender
        invoke('audit', { action: 'historial_esticc_get' }),  // Datos de ESTICC
      ]);

      // Normalizar ambas fuentes al mismo formato de evento y combinarlas
      todosEventos = [
        ...normalizarDefender(resDefender), // Eventos del Event Log de Defender
        ...normalizarEsticc(resEsticc),     // Eventos del historial ESTICC
      ];

      renderCalendario();              // Dibujar el calendario con los eventos cargados
      renderResumen(resDefender);      // Dibujar las tarjetas de estado de Defender

    } catch (e) {
      // Error de red/IPC: mostrar mensaje de error en el calendario
      const cal = document.getElementById('hist-cal-grid');
      if (cal) cal.innerHTML = `<p style="color:var(--danger);padding:16px;">Error al cargar historial: ${esc(String(e))}</p>`;
    } finally {
      // Restaurar el botón siempre, haya éxito o error
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Actualizar';
      }
    }
  }

  // ── Normalización de datos ───────────────────────────────────────────────────

  /**
   * Convierte la respuesta de historial_defender al formato de evento estándar.
   * Combina eventos del Event Log con amenazas de Get-MpThreatDetection.
   *
   * @param {object} res - Respuesta IPC de historial_defender
   * @returns {Array} Lista de eventos normalizados
   */
  function normalizarDefender(res) {
    if (!res?.ok) return []; // Si el sidecar devolvió error, ignorar esta fuente

    const eventos  = res.data?.eventos  ?? []; // Eventos del Event Log (IDs 1000/1001/1116/1117)
    const amenazas = res.data?.amenazas ?? []; // Amenazas de Get-MpThreatDetection

    const resultado = [];

    // Normalizar eventos del Event Log
    for (const ev of eventos) {
      if (!ev.timestamp) continue; // Ignorar eventos sin timestamp (no se pueden ubicar en el calendario)
      const { fecha, hora } = splitFechaHora(ev.timestamp); // Separar fecha y hora para el calendario
      resultado.push({
        fecha,                                           // "YYYY-MM-DD" (clave del calendario)
        hora,                                            // "HH:MM" (mostrado en el detalle del día)
        tipo:     ev.tipo,                              // "fin_analisis", "amenaza_detectada", etc.
        etiqueta: ev.etiqueta || ev.tipo,               // Texto legible en español
        color:    COLOR_POR_TIPO[ev.tipo] || '#8b949e', // Color del punto; gris si tipo desconocido
        msg:      ev.mensaje || '',                     // Primera línea del mensaje del Event Log
        fuente:   'defender',                           // Para mostrar "Windows Defender" en el detalle
      });
    }

    // Normalizar amenazas de Get-MpThreatDetection
    for (const am of amenazas) {
      if (!am.timestamp) continue;
      const { fecha, hora } = splitFechaHora(am.timestamp);
      resultado.push({
        fecha,
        hora,
        tipo:     'amenaza_detectada',
        etiqueta: 'Amenaza detectada',
        color:    '#f85149', // Siempre rojo para amenazas
        msg:      am.proceso ? `Proceso: ${am.proceso}` : '', // Proceso que ejecutó el malware
        fuente:   'defender',
      });
    }

    return resultado;
  }

  /**
   * Convierte la respuesta de historial_esticc_get al formato de evento estándar.
   *
   * @param {object} res - Respuesta IPC de historial_esticc_get
   * @returns {Array} Lista de eventos normalizados
   */
  function normalizarEsticc(res) {
    if (!res?.ok) return []; // Si el sidecar devolvió error, ignorar esta fuente

    const entradas = res.data?.entradas ?? []; // Entradas de historial.json

    return entradas
      .filter(e => e.timestamp) // Descartar entradas sin timestamp (no deberían existir)
      .map(e => {
        const { fecha, hora } = splitFechaHora(e.timestamp);

        // Construir etiqueta legible: buscar en el mapa, o usar el tipo como fallback
        const etiqueta = ETIQUETA_TIPO[e.tipo] || e.tipo || 'Escaneo ESTICC';

        // Construir el mensaje resumen con los campos disponibles
        let msg = '';
        if (e.nivel)          msg += `Nivel: ${e.nivel.toUpperCase()}`;
        if (e.puntuacion != null) msg += (msg ? ' · ' : '') + `Puntuación: ${e.puntuacion}/100`;
        if (e.num_hallazgos  != null) msg += (msg ? ' · ' : '') + `${e.num_hallazgos} hallazgo${e.num_hallazgos !== 1 ? 's' : ''}`;
        if (e.resumen)        msg += (msg ? ' · ' : '') + e.resumen;

        return {
          fecha,
          hora,
          tipo:    e.tipo,
          etiqueta,
          color:   COLOR_POR_TIPO[e.tipo] || '#58a6ff', // Azul ESTICC por defecto
          msg,
          fuente:  'esticc', // Para mostrar "ESTICC" en el detalle del día
        };
      });
  }

  // ── Renderizado del calendario ───────────────────────────────────────────────

  /**
   * Dibuja la cuadrícula del calendario para el mes/año actual.
   *
   * Algoritmo:
   *   1. Calcular el primer día del mes (y su día de la semana 0=Lun…6=Dom).
   *   2. Añadir celdas vacías al inicio para alinear con la columna correcta.
   *   3. Para cada día del mes:
   *      a. Buscar eventos en el mapa porFecha[YYYY-MM-DD].
   *      b. Generar puntos de colores (máximo 6 visibles).
   *      c. Añadir el onclick handler vía window.__histDiaClick.
   *   4. Si hay un día seleccionado, mostrar su detalle debajo del calendario.
   */
  function renderCalendario() {
    actualizarNavMes(); // Actualizar el texto "Mayo 2026" en la barra de navegación

    const calGrid = document.getElementById('hist-cal-grid');
    if (!calGrid) return;

    // Agrupar todos los eventos por fecha "YYYY-MM-DD" para acceso O(1) durante el render
    const porFecha = {};
    for (const ev of todosEventos) {
      if (!porFecha[ev.fecha]) porFecha[ev.fecha] = [];
      porFecha[ev.fecha].push(ev);
    }

    const hoy       = new Date();
    const primerDia = new Date(anioActual, mesActual, 1);  // Primer día del mes visible
    const totalDias = new Date(anioActual, mesActual + 1, 0).getDate(); // Último día del mes

    // getDay() devuelve 0=Domingo…6=Sábado (sistema americano)
    // Convertir a 0=Lunes…6=Domingo (sistema europeo del calendario)
    let inicioOffset = primerDia.getDay() - 1; // Restar 1 para que Domingo=0 → 6
    if (inicioOffset < 0) inicioOffset = 6;    // Si es domingo (getDay()=0), offset = 6

    let html = '';

    // Celdas vacías antes del primer día para alinear la cuadrícula
    for (let i = 0; i < inicioOffset; i++) {
      html += '<div class="hist-cal-day vacio"></div>'; // Celda sin número ni contenido
    }

    // Generar una celda por cada día del mes
    for (let d = 1; d <= totalDias; d++) {
      // Construir la clave de fecha en formato "YYYY-MM-DD" con padding de ceros
      const fechaStr = `${anioActual}-${String(mesActual + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const eventos  = porFecha[fechaStr] || []; // Eventos de este día (vacío si no hay)

      // Determinar clases CSS adicionales para la celda
      const esHoy         = (d === hoy.getDate() && mesActual === hoy.getMonth() && anioActual === hoy.getFullYear());
      const esSeleccionado = diaSeleccionado === fechaStr;

      const clases = [
        'hist-cal-day',
        esHoy           ? 'hoy'           : '',  // Clase especial para el día de hoy (fondo azul)
        eventos.length > 0 ? 'con-eventos' : '',  // Cursor pointer si tiene eventos
        esSeleccionado  ? 'seleccionado'  : '',  // Outline azul si está seleccionado
      ].filter(Boolean).join(' '); // filter(Boolean) elimina las strings vacías

      // Generar los puntos de colores (máximo 6 para que quepan en la celda)
      const puntos = eventos.slice(0, 6).map(ev =>
        `<div class="hist-punto" style="background:${ev.color}" title="${esc(ev.etiqueta)}"></div>`
      ).join('');

      // Si hay más de 6 eventos, mostrar contador "+N"
      const extra = eventos.length > 6
        ? `<div style="font-size:10px;color:var(--text-dim)">+${eventos.length - 6}</div>`
        : '';

      // onclick inline necesario porque las celdas son generadas dinámicamente con innerHTML.
      // No podemos usar addEventListener en este punto; usamos una función global (__histDiaClick).
      html += `
        <div class="${clases}" data-fecha="${fechaStr}" onclick="__histDiaClick('${fechaStr}')">
          <div class="hist-dia-num">${d}</div>
          <div class="hist-puntos">${puntos}${extra}</div>
        </div>`;
    }

    calGrid.innerHTML = html; // Insertar toda la cuadrícula de una vez (un solo reflow del DOM)

    // Actualizar el panel de detalle según si hay día seleccionado o no
    if (diaSeleccionado) {
      renderDetalleDia(diaSeleccionado, porFecha[diaSeleccionado] || []);
    } else {
      renderDetalleVacio(); // Mostrar mensaje "haz clic en un día..."
    }
  }

  /**
   * Función global para manejar el clic en una celda del calendario.
   * Es global (window.__histDiaClick) porque se invoca desde onclick inline
   * en el HTML generado dinámicamente.
   *
   * Comportamiento de toggle: clic en el mismo día seleccionado lo deselecciona.
   */
  window.__histDiaClick = function (fecha) {
    if (diaSeleccionado === fecha) {
      diaSeleccionado = null; // Deseleccionar si se hace clic en el mismo día
    } else {
      diaSeleccionado = fecha; // Seleccionar el nuevo día
    }
    renderCalendario(); // Re-renderizar para actualizar clases CSS y el panel de detalle
  };

  /** Muestra un mensaje en el calendario cuando no hay datos disponibles. */
  function renderCalendarioVacio(msg) {
    const calGrid = document.getElementById('hist-cal-grid');
    if (calGrid) calGrid.innerHTML = `<p style="color:var(--text-dim);padding:16px;grid-column:1/-1;">${esc(msg)}</p>`;
    renderDetalleVacio();
  }

  /** Actualiza el texto del encabezado de navegación con el mes/año actual. */
  function actualizarNavMes() {
    const label = document.getElementById('hist-nav-mes');
    if (label) label.textContent = `${MESES[mesActual]} ${anioActual}`;
  }

  /**
   * Navega al mes anterior (delta=-1) o siguiente (delta=+1).
   * Maneja el desbordamiento de año: diciembre+1 → enero del año siguiente.
   */
  function navegarMes(delta) {
    mesActual += delta;
    if (mesActual > 11) { mesActual = 0;  anioActual++; } // Desbordamiento hacia adelante
    if (mesActual < 0)  { mesActual = 11; anioActual--; } // Desbordamiento hacia atrás
    diaSeleccionado = null; // Limpiar selección al cambiar de mes
    renderCalendario();
  }

  // ── Panel de detalle del día ─────────────────────────────────────────────────

  /**
   * Renderiza la timeline de eventos de un día específico debajo del calendario.
   *
   * @param {string} fecha  - Fecha en formato "YYYY-MM-DD"
   * @param {Array}  eventos - Lista de eventos normalizados para ese día
   */
  function renderDetalleDia(fecha, eventos) {
    const el = document.getElementById('hist-detalle');
    if (!el) return;

    // Formatear la fecha como "23 de Mayo de 2026" para el título del panel
    const [anio, mes, dia] = fecha.split('-');
    const fechaFormato = `${parseInt(dia)} de ${MESES[parseInt(mes) - 1]} de ${anio}`;

    if (eventos.length === 0) {
      // El día fue seleccionado pero no tiene eventos (puede pasar si se navega a otro mes)
      el.innerHTML = `
        <div class="hist-detalle-titulo">${esc(fechaFormato)}</div>
        <div class="hist-detalle-vacio">Sin actividad registrada este día.</div>`;
      return;
    }

    // Ordenar los eventos cronológicamente por hora (HH:MM como string → orden lexicográfico)
    const ordenados = [...eventos].sort((a, b) => a.hora.localeCompare(b.hora));

    // Generar el HTML de cada evento en la timeline
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

  /** Muestra el mensaje de "haz clic en un día" cuando no hay selección. */
  function renderDetalleVacio() {
    const el = document.getElementById('hist-detalle');
    if (el) {
      el.innerHTML = `<div class="hist-detalle-vacio">Haz clic en un día con actividad para ver los detalles.</div>`;
    }
  }

  // ── Tarjetas de resumen de estado de Defender ────────────────────────────────

  /**
   * Renderiza las tarjetas de estadísticas en la parte inferior del panel.
   * Muestra: último análisis rápido, último completo, estado de Defender, amenazas recientes.
   *
   * @param {object} resDefender - Respuesta IPC completa de historial_defender
   */
  function renderResumen(resDefender) {
    const el = document.getElementById('hist-resumen');
    if (!el) return;

    const estado = resDefender?.data?.estado ?? {}; // Estado actual de Defender (puede ser {})

    // Formatear fechas ISO como "22 may. 2026" usando Intl.DateTimeFormat
    const fmtFecha = ts => ts
      ? new Date(ts).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
      : 'Sin datos'; // Fallback si Defender no ha ejecutado ningún análisis o no está disponible

    const diasRapido   = estado.dias_desde_rapido   ?? '—'; // Días desde el último análisis rápido
    const diasCompleto = estado.dias_desde_completo ?? '—'; // Días desde el último análisis completo

    // Clases CSS para colorear el estado (verde=ok, rojo=inactivo)
    const claseActivo = estado.defender_activo        ? 'hist-defender-ok' : 'hist-defender-danger';
    const claseRTP    = estado.proteccion_tiempo_real ? 'hist-defender-ok' : 'hist-defender-danger';
    const valorActivo = estado.defender_activo        ? 'Activo'   : 'Inactivo';
    const valorRTP    = estado.proteccion_tiempo_real ? 'Activa'   : 'Inactiva';

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

  // ── Funciones de utilidad ────────────────────────────────────────────────────

  /**
   * Separa un string ISO 8601 en fecha y hora para el calendario.
   *
   * @param {string} isoStr - Fecha en formato ISO 8601 (con o sin timezone)
   * @returns {{ fecha: string, hora: string }}
   *          fecha: "YYYY-MM-DD" (clave para el mapa porFecha del calendario)
   *          hora:  "HH:MM" (mostrado en el panel de detalle)
   *
   * Por qué usamos locale "sv-SE" para la fecha:
   *   toLocaleDateString('sv-SE') formatea como "YYYY-MM-DD" (formato sueco),
   *   que coincide con el formato ISO y es la clave del mapa porFecha.
   *   Es más robusto que hacer substring del string ISO porque new Date() normaliza
   *   a la timezone local del navegador automáticamente.
   */
  function splitFechaHora(isoStr) {
    try {
      const d    = new Date(isoStr);
      const fecha = d.toLocaleDateString('sv-SE');  // "2026-05-23" (formato ISO como locale sueco)
      const hora  = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }); // "10:30"
      return { fecha, hora };
    } catch (_) {
      // Si la fecha es inválida, usar valores de fallback para no romper el renderizado
      return { fecha: '1970-01-01', hora: '00:00' };
    }
  }

  /**
   * Escapa caracteres HTML especiales para prevenir XSS.
   *
   * Necesario porque insertamos datos del sistema (nombres de procesos, mensajes del
   * Event Log, etc.) directamente en innerHTML. Sin escaping, un proceso con nombre
   * "<script>alert(1)</script>" podría ejecutar código JavaScript en la app.
   *
   * Aunque ESTICC es una app de escritorio Tauri (no un servidor web), las buenas
   * prácticas de seguridad se aplican igualmente.
   */
  function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')   // & → &amp; (debe ser el primero para no doble-escapar)
      .replace(/</g, '&lt;')    // < → &lt;  (previene apertura de tags HTML)
      .replace(/>/g, '&gt;')    // > → &gt;  (previene cierre de tags HTML)
      .replace(/"/g, '&quot;'); // " → &quot; (previene inyección en atributos HTML)
  }

})(); // Fin del IIFE: todas las variables declaradas aquí son privadas al módulo
