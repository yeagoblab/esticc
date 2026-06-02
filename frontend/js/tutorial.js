/**
 * tutorial.js — Tutorial interactivo de primera vez para ESTICC.
 *
 * Lanzado automáticamente por config.js cuando tutorial_completado === false.
 * Puede relanzarse desde Configuración con el botón "Ver tutorial" o llamando
 * window.ESTICC_TUTORIAL.lanzar() desde cualquier módulo.
 */

(function () {
  'use strict';

  // Array de pasos del tutorial: cada entrada define el contenido de una diapositiva
  // y el selector del elemento de UI que se resaltará mientras está activo.
  // highlight: null en el primer paso porque no apunta a ningún elemento específico (bienvenida genérica).
  const PASOS = [
    {
      icono: '🛡️',
      titulo: 'Bienvenido a ESTICC',
      desc: 'ESTICC es tu panel de seguridad local. Te ayuda a detectar amenazas, entender tu estado de seguridad y aprender a protegerte, sin necesidad de conocimientos técnicos.\n\nEste tutorial te guiará por las funciones principales en menos de 2 minutos.',
      highlight: null,  // Primer paso sin highlight: el modal habla de la app en general
    },
    {
      icono: '🔍',
      titulo: 'Escáneres de Auditoría',
      desc: 'En el menú lateral tienes los 5 escáneres principales:\n\n🛡️ Defensas · 🌐 Puertos · ⚙️ Procesos · 🚀 Autoinicio · 🔧 Parches\n\nPulsa cualquiera y luego el botón "Analizar" para inspeccionar tu sistema en segundos.',
      highlight: '[data-panel="defensas"]',  // Señalar el ítem de nav de Defensas como punto de entrada
    },
    {
      icono: '⚠️',
      titulo: 'Modo Demostración',
      desc: '¿No quieres tocar tu sistema todavía? Usa el Modo Demo.\n\nSimula 8 escenarios reales (RAT, ransomware, cryptojacker, botnet...) con datos ficticios. ESTICC te explicará qué significa cada resultado y qué hacer ante él.',
      highlight: '#btn-activar-demo',  // Resaltar el botón de activación del modo demo en el header
    },
    {
      icono: '📖',
      titulo: 'Enciclopedia de Malware',
      desc: 'Aprende sobre las principales amenazas digitales: ransomware, spyware, botnets, keyloggers y más.\n\nCada ficha incluye síntomas de infección, técnicas MITRE ATT&CK, indicadores de compromiso (IOCs) y consejos de prevención.',
      highlight: '[data-panel="enciclopedia"]',  // Señalar el ítem de nav de la enciclopedia
    },
    {
      icono: '📡',
      titulo: 'Radar OSINT',
      desc: 'El Radar monitoriza 6 fuentes de inteligencia de amenazas en tiempo real:\n\nNIST NVD · Bleeping Computer · Krebs on Security · SANS · The Hacker News · Reddit r/netsec\n\nTambién cruza los CVEs publicados con los puertos abiertos en tu equipo.',
      highlight: '[data-panel="radar"]',  // Señalar el ítem de nav del radar de amenazas
    },
    {
      icono: '📋',
      titulo: 'Informe de Seguridad',
      desc: 'Genera un informe completo de tu sistema con un solo clic.\n\nEjecuta los 5 escáneres en paralelo, calcula una puntuación de riesgo del 0 al 100 y produce un documento exportable a PDF.',
      highlight: '[data-panel="reportes"]',  // Señalar el ítem de nav de informes
    },
    {
      icono: '✅',
      titulo: '¡Todo listo!',
      desc: 'Ya conoces ESTICC. Empieza con tu primer análisis pulsando "Analizar ahora" en el panel de Defensas.\n\nDesde Configuración puedes elegir tu perfil, cambiar el idioma y volver a ver este tutorial cuando quieras.',
      highlight: '[data-panel="configuracion"]',  // Último paso: señalar Configuración (desde donde se relanza)
    },
  ];

  let pasoActual        = 0;    // Índice del paso actualmente visible (0-based)
  let elementoResaltado = null;  // Referencia al elemento de UI con clase tutorial-highlight activa

  // ── Highlight ────────────────────────────────────────────────────────────────

  function quitarHighlight() {
    if (elementoResaltado) {
      // Retirar la clase antes de avanzar para evitar que varios elementos tengan outline simultáneamente
      elementoResaltado.classList.remove('tutorial-highlight');
      elementoResaltado = null;
    }
  }

  function aplicarHighlight(selector) {
    quitarHighlight();  // Siempre limpiar el highlight anterior antes de aplicar el nuevo
    if (!selector) return;  // Pasos sin highlight definido (ej. bienvenida) no resaltan nada
    const el = document.querySelector(selector);
    if (el) {
      // Añadir la clase que activa el outline pulsante (definida en tutorial.css)
      el.classList.add('tutorial-highlight');
      elementoResaltado = el;  // Guardar referencia para poder limpiarla en el siguiente paso
    }
  }

  // ── Render del paso actual ───────────────────────────────────────────────────

  function actualizarUI() {
    const paso  = PASOS[pasoActual];
    const total = PASOS.length;

    // Actualizar el contenido textual de la tarjeta con los datos del paso actual
    document.getElementById('tut-icono').textContent  = paso.icono;
    document.getElementById('tut-titulo').textContent = paso.titulo;
    document.getElementById('tut-desc').textContent   = paso.desc;

    // Sincronizar los dots de progreso: solo el dot del paso actual lleva la clase 'activo'
    document.querySelectorAll('#tut-dots .tut-dot').forEach((dot, i) => {
      dot.classList.toggle('activo', i === pasoActual);
    });

    const btnAnterior  = document.getElementById('tut-btn-anterior');
    const btnSiguiente = document.getElementById('tut-btn-siguiente');

    // Ocultar el botón "Anterior" en el primer paso: no tiene sentido retroceder desde el inicio
    btnAnterior.style.display = pasoActual === 0 ? 'none' : '';

    if (pasoActual === total - 1) {
      // En el último paso, cambiar el texto y estilo del botón para indicar que el tutorial termina
      btnSiguiente.textContent = '¡Empezar!';
      btnSiguiente.classList.add('primario');  // Fondo de color accent (llamada a la acción principal)
    } else {
      btnSiguiente.textContent = 'Siguiente →';
      btnSiguiente.classList.remove('primario');  // Estilo outline neutral en pasos intermedios
    }

    aplicarHighlight(paso.highlight);  // Resaltar el elemento de UI correspondiente al paso
  }

  // ── Mostrar / cerrar ─────────────────────────────────────────────────────────

  function lanzar() {
    pasoActual = 0;  // Reiniciar al primer paso (permite relanzar desde Configuración sin residuos)
    const overlay = document.getElementById('tutorial-overlay');
    if (!overlay) return;  // Salida segura si el HTML del tutorial aún no está cargado
    overlay.classList.remove('oculto');  // Mostrar el overlay (display:flex desde CSS)
    actualizarUI();  // Dibujar el contenido del paso 0 y aplicar el highlight inicial
  }

  function cerrar() {
    quitarHighlight();  // Limpiar el outline del elemento de UI antes de cerrar
    const overlay = document.getElementById('tutorial-overlay');
    if (overlay) overlay.classList.add('oculto');  // Ocultar el overlay (display:none via CSS)

    // Persistir tutorial_completado: true sin perder el resto de la config.
    // Se usa cargarLocal() (síncrono) para no bloquear el cierre con un await,
    // y se fusiona con la config existente para no sobreescribir otras claves.
    const cfg = window.ESTICC_CONFIG?.cargarLocal?.() || {};
    cfg.tutorial_completado = true;
    window.ESTICC_CONFIG?.guardar?.(cfg);  // Escribe en localStorage + IPC (async, no esperamos)
  }

  // ── Setup de listeners ───────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', () => {
    // Generar dots de progreso dinámicamente para que el número de dots
    // sea siempre igual al número de pasos sin tocar el HTML cada vez que se añade uno.
    const dotsEl = document.getElementById('tut-dots');
    if (dotsEl) {
      dotsEl.innerHTML = PASOS.map((_, i) =>
        // El primer dot arranca con clase 'activo' porque el tutorial empieza en el paso 0
        `<div class="tut-dot${i === 0 ? ' activo' : ''}"></div>`
      ).join('');
    }

    const btnOmitir    = document.getElementById('tut-btn-omitir');
    const btnAnterior  = document.getElementById('tut-btn-anterior');
    const btnSiguiente = document.getElementById('tut-btn-siguiente');
    const btnRelanzar  = document.getElementById('cfg-btn-tutorial');  // Botón en el panel de Configuración

    if (btnOmitir) {
      // Omitir cierra el tutorial y lo marca como completado para no volver a mostrarlo
      btnOmitir.addEventListener('click', cerrar);
    }

    if (btnAnterior) {
      btnAnterior.addEventListener('click', () => {
        // Retroceder solo si no estamos ya en el primer paso (guarda contra underflow)
        if (pasoActual > 0) { pasoActual--; actualizarUI(); }
      });
    }

    if (btnSiguiente) {
      btnSiguiente.addEventListener('click', () => {
        // Avanzar al siguiente paso o, si estamos en el último, cerrar y marcar como completado
        if (pasoActual < PASOS.length - 1) { pasoActual++; actualizarUI(); }
        else cerrar();  // El texto del botón ya dice "¡Empezar!" en el último paso
      });
    }

    // Botón "Ver tutorial" en el panel de Configuración: relanza desde el paso 0
    if (btnRelanzar) {
      btnRelanzar.addEventListener('click', lanzar);
    }
  });

  // ── API pública ──────────────────────────────────────────────────────────────
  // Expuesto antes de DOMContentLoaded para que config.js pueda llamar lanzar()
  // desde su propio handler (que resuelve después de un await).
  // Solo se expone lanzar(): cerrar() es un detalle de implementación interna.
  window.ESTICC_TUTORIAL = { lanzar };

})();
