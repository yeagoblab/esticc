/**
 * hardware.js — Panel de monitorización de hardware de ESTICC.
 *
 * Responsabilidades:
 *  · Llamar al sidecar Python con la acción 'scan_hardware' y renderizar los resultados.
 *  · Mostrar gauges circulares SVG de CPU y RAM con animación suave.
 *  · Mantener un historial de 30 muestras y dibujar mini-gráficas de línea.
 *  · Mostrar uso de disco, velocidad de lectura/escritura y tipo de cada partición.
 *  · Mostrar estado de batería con barra de progreso (solo en portátiles).
 *  · Listar los últimos eventos críticos del Event Log (ID 41 y 37).
 *  · En modo avanzado: tabla de especificaciones del sistema (modelo, núcleos, velocidad RAM).
 *  · Integrar el modo demo de ESTICC (SIMULADOR).
 */

(function () {
  'use strict';  // Modo estricto: detecta errores como variables no declaradas en tiempo de parseo

  // ── Constantes ───────────────────────────────────────────────────────────────

  const CIRCUNFERENCIA = 2 * Math.PI * 40;   // 2π × radio=40 ≈ 251.33 px: longitud total del arco SVG
  const HIST_MAX       = 30;                  // Número máximo de muestras en el historial
  const PANEL_ID       = 'panel-hardware';    // ID del elemento raíz del panel en el HTML

  // ── Estado interno ───────────────────────────────────────────────────────────

  // Arrays circulares de historial: cada vez que llega un nuevo escaneo se hace push()
  // y si superan HIST_MAX se descartan las muestras más antiguas con shift().
  let histCpu = [];  // Historial de % uso de CPU (0–100)
  let histRam = [];  // Historial de % uso de RAM (0–100)

  // ── Helpers de acceso IPC ────────────────────────────────────────────────────

  /**
   * invocarTauri(accion, payload) — Llama al comando Tauri 'audit' con la acción dada.
   * Rust fusiona el payload en el JSON enviado al sidecar Python, por lo que
   * Python lee los campos de payload directamente en req.get("campo").
   * Devuelve el objeto result o lanza una excepción si hay error.
   */
  async function invocarTauri(accion, payload = {}) {
    // window.__TAURI__ solo existe cuando el código corre dentro de la shell Tauri.
    // Si no existe (desarrollo en navegador), lanzar error para que el caller lo maneje.
    if (!window.__TAURI__) throw new Error('Tauri no disponible');  // Debe usarse modo demo en navegador

    const { invoke } = window.__TAURI__.tauri;          // Destructurar la función invoke de la API Tauri
    return invoke('audit', { action: accion, payload }); // Llama al comando Rust 'audit'
  }

  // ── Gauge circular SVG ───────────────────────────────────────────────────────

  /**
   * actualizarGauge(svgId, pct) — Anima el arco del gauge circular al porcentaje dado.
   *
   * El truco del gauge circular usa dos propiedades CSS de stroke:
   *   · stroke-dasharray: [circunferencia] → el trazo ocupa toda la circunferencia
   *   · stroke-dashoffset: circunferencia × (1 − pct/100) → cuánto del trazo está oculto
   *
   * Con stroke-dashoffset=0 el arco está completo (100 %).
   * Con stroke-dashoffset=circunferencia el arco es invisible (0 %).
   * La transición CSS en hardware.css anima el cambio suavemente.
   *
   * También aplica la clase 'warn' (≥70 %) o 'hot' (≥90 %) para cambiar el color del arco.
   */
  function actualizarGauge(svgId, pct) {
    const circle = document.querySelector(`#${svgId} .hw-gauge-circle`);  // Arco SVG del gauge
    const label  = document.querySelector(`#${svgId} .hw-gauge-pct`);     // Texto de porcentaje central

    if (!circle || !label) return;  // Salida segura si el gauge no está en el DOM

    const clamp = Math.max(0, Math.min(100, pct));                            // Limitar al rango 0–100
    const offset = CIRCUNFERENCIA * (1 - clamp / 100);                        // Offset = porción vacía

    circle.style.strokeDasharray  = CIRCUNFERENCIA;  // Longitud total del arco (constante)
    circle.style.strokeDashoffset = offset;           // Parte visible determinada por el porcentaje

    // Aplicar clase de color según el nivel de uso
    circle.classList.toggle('warn', clamp >= 70 && clamp < 90);  // Amarillo entre 70 y 89 %
    circle.classList.toggle('hot',  clamp >= 90);                  // Rojo a partir de 90 %

    label.textContent = `${Math.round(clamp)}%`;  // Actualizar el texto del porcentaje
  }

  // ── Gauge de salud (escala de color invertida: verde=bueno, rojo=malo) ──────

  /**
   * actualizarGaugeSalud(svgId, pct) — Anima el gauge de salud/vida útil.
   *
   * La escala de color es la inversa al gauge de uso:
   *   · ≥ 80 %: verde  (salud buena)
   *   · 50–79 %: naranja (salud moderada, vigilar)
   *   · < 50 %:  rojo   (salud crítica, intervención necesaria)
   *
   * Si pct es null/undefined (datos no disponibles), muestra '—' y deja el arco vacío.
   */
  function actualizarGaugeSalud(svgId, pct) {
    const circle = document.querySelector(`#${svgId} .hw-gauge-circle`);
    const label  = document.querySelector(`#${svgId} .hw-gauge-pct`);
    if (!circle || !label) return;  // El gauge aún no está en el DOM (ej. batería en equipo sin batería)

    if (pct == null) {
      // Sin datos disponibles (ej. WMI no reporta el atributo en este hardware):
      // poner el offset = circunferencia completa hace invisible el arco sin cambiar el SVG
      circle.style.strokeDasharray  = CIRCUNFERENCIA;
      circle.style.strokeDashoffset = CIRCUNFERENCIA;  // Arco invisible (0 % de relleno visible)
      label.textContent = '—';  // Guion para indicar "no disponible" en lugar de 0 %
      return;
    }

    const clamp  = Math.max(0, Math.min(100, pct));  // Prevenir valores fuera de rango del sidecar
    const offset = CIRCUNFERENCIA * (1 - clamp / 100);  // Porción oculta del arco

    circle.style.strokeDasharray  = CIRCUNFERENCIA;
    circle.style.strokeDashoffset = offset;

    // Limpiar primero las tres clases de color para evitar combinaciones inválidas
    // (si se llama varias veces en el mismo ciclo de escaneo podrían acumularse)
    circle.classList.remove('salud-ok', 'salud-warn', 'salud-danger');
    // Escala inversa a actualizarGauge(): aquí verde=bueno, rojo=malo
    if (clamp >= 80)      circle.classList.add('salud-ok');      // Verde: salud buena
    else if (clamp >= 50) circle.classList.add('salud-warn');    // Naranja: degradación notable
    else                  circle.classList.add('salud-danger');  // Rojo: intervención recomendada

    label.textContent = `${Math.round(clamp)}%`;
  }

  // ── Mini-gráfica de línea (SVG polyline) ────────────────────────────────────

  /**
   * dibujarChart(canvasId, datos) — Renderiza una polyline SVG con el historial de uso.
   *
   * El SVG viewBox tiene coordenadas lógicas 300×40 (ancho × alto).
   * Cada punto del historial se mapea a una coordenada X proporcional al índice
   * y una coordenada Y invertida (SVG crece hacia abajo, pero los % crecen hacia arriba).
   *
   * También dibuja un polígono de área rellena semitransparente debajo de la línea.
   */
  function dibujarChart(canvasId, datos) {
    const svg = document.querySelector(`#${canvasId} svg`);  // El elemento SVG del chart
    if (!svg || datos.length < 2) return;                     // Sin suficientes datos no hay gráfica

    const W = 300;    // Ancho lógico del viewBox SVG (coordenadas internas, no px reales)
    const H = 40;     // Alto lógico del viewBox SVG

    /**
     * Calcula la coordenada X de un punto basándose en su índice.
     * El primer punto es x=0, el último x=W.
     */
    const xP = i => (i / (datos.length - 1)) * W;

    /**
     * Calcula la coordenada Y de un punto. En SVG Y=0 es arriba,
     * pero queremos que los valores altos aparezcan arriba → invertimos.
     * Reservamos 2px de margen arriba y abajo para que la línea no se corte.
     */
    const yP = v => H - 2 - ((v / 100) * (H - 4));

    // Construir el string de puntos "x,y x,y x,y..." para la polyline
    const puntos = datos.map((v, i) => `${xP(i).toFixed(1)},${yP(v).toFixed(1)}`).join(' ');

    // El polígono de área cierra por abajo: primer punto → último punto → esquina inferior derecha → esquina inferior izquierda
    const areaPoints = `${xP(0).toFixed(1)},${H} ${puntos} ${xP(datos.length-1).toFixed(1)},${H}`;

    // Limpiar el SVG y redibujar completamente
    svg.innerHTML = `
      <polygon class="hw-chart-area" points="${areaPoints}" />
      <polyline class="hw-chart-line" points="${puntos}" />
    `;
  }

  // ── Panel de explicación de salud ────────────────────────────────────────────

  /**
   * renderSaludDetalle(panelId, factores, consejo) — Rellena el panel explicativo.
   *
   * Cada factor tiene { tipo: 'ok'|'warn'|'danger', texto: string }.
   * El consejo es un string con la acción recomendada, o null si todo está bien.
   * Si el panel no existe o no hay factores, no hace nada.
   */
  function renderSaludDetalle(panelId, factores, consejo) {
    const panel = document.getElementById(panelId);
    if (!panel) return;  // El panel puede no existir en el DOM si la tarjeta no incluye detalle de salud

    // Mapeo tipo → emoji: permite que los factores vengan del sidecar sin lógica de presentación
    const iconos = { ok: '✅', warn: '⚠️', danger: '🔴' };

    // Construir el HTML de los factores; si no hay factores, el array vacío produce string vacío
    const factoresHTML = (factores || []).map(f => `
      <div class="hw-salud-factor">
        <span class="hw-salud-factor-icon">${iconos[f.tipo] || '•'}</span>
        <span>${f.texto}</span>
      </div>`).join('');

    // El consejo solo se muestra cuando el sidecar lo envía (no nulo): si todo está bien, no aparece nada
    const consejoHTML = consejo
      ? `<div class="hw-salud-consejo">${consejo}</div>`
      : '';

    // Reemplazar el contenido completo en cada escaneo (no acumular filas de escaneos anteriores)
    panel.innerHTML = factoresHTML + consejoHTML;
  }

  // ── Renderizado de secciones ─────────────────────────────────────────────────

  /**
   * renderCpu(cpu, saludPct) — Actualiza la tarjeta de CPU con los datos del sidecar.
   * Modo básico: gauge uso + gauge salud + porcentaje.
   * Modo avanzado: ambos gauges + modelo, núcleos, frecuencia, temperatura + mini-gráfica.
   */
  function renderCpu(cpu, saludPct, saludFactores, saludConsejo) {
    actualizarGauge('hw-gauge-cpu', cpu.uso_pct);              // Gauge izquierdo: % de uso actual
    actualizarGaugeSalud('hw-gauge-cpu-salud', saludPct ?? null);  // Gauge derecho: salud/vida útil
    renderSaludDetalle('hw-salud-cpu', saludFactores, saludConsejo);  // Panel desplegable con factores

    // Texto de uso en el elemento básico de resumen
    const usoPct = document.getElementById('hw-cpu-uso');
    if (usoPct) usoPct.textContent = `${cpu.uso_pct}%`;  // Ej. "42%"

    // Datos del modo avanzado: solo visibles cuando body.modo-avanzado está activo
    const elModelo = document.getElementById('hw-cpu-modelo');
    if (elModelo) elModelo.textContent = cpu.modelo || '—';  // Ej. "Intel Core i7-10750H"

    const elNucFis = document.getElementById('hw-cpu-nucleos-fis');
    if (elNucFis) elNucFis.textContent = cpu.nucleos_fisicos;  // Ej. "6"

    const elNucLog = document.getElementById('hw-cpu-nucleos-log');
    if (elNucLog) elNucLog.textContent = cpu.nucleos_logicos;  // Ej. "12"

    const elFreq = document.getElementById('hw-cpu-freq');
    if (elFreq) {
      // Mostrar la frecuencia en GHz si supera 1000 MHz, en MHz si es menor
      const freq = cpu.frecuencia_mhz;
      elFreq.textContent = freq ? (freq >= 1000 ? `${(freq/1000).toFixed(2)} GHz` : `${freq} MHz`) : '—';
    }

    const elTemp = document.getElementById('hw-cpu-temp');
    if (elTemp) {
      if (cpu.temperatura_c == null) {
        // Temperatura no disponible en este sistema (WMI no expone el sensor)
        elTemp.textContent = t('hardware.temp_nd');
        elTemp.className = 'hw-meta-value';  // Sin clase de color
      } else {
        const c = cpu.temperatura_c;
        // Clasificar la temperatura y asignar la clase de color correspondiente
        const clase = c >= 85 ? 'hw-temp-hot' : c >= 70 ? 'hw-temp-warn' : 'hw-temp-ok';
        elTemp.textContent = `${c} °C`;    // Ej. "72 °C"
        elTemp.className   = `hw-meta-value ${clase}`;  // Color según nivel
      }
    }

    // Actualizar historial y redibujar mini-gráfica
    histCpu.push(cpu.uso_pct);                          // Añadir nueva muestra
    if (histCpu.length > HIST_MAX) histCpu.shift();     // Descartar la más antigua si hay más de HIST_MAX
    dibujarChart('hw-chart-cpu', histCpu);              // Redibujar la gráfica con el historial actualizado
  }

  /**
   * renderRam(ram, saludPct) — Actualiza la tarjeta de RAM.
   * saludPct mide la presión de memoria (uso de swap, fragmentación): no es degradación física.
   */
  function renderRam(ram, saludPct, saludFactores, saludConsejo) {
    actualizarGauge('hw-gauge-ram', ram.uso_pct);              // Gauge izquierdo: % de uso actual
    actualizarGaugeSalud('hw-gauge-ram-salud', saludPct ?? null);  // Gauge derecho: salud de uso de memoria
    renderSaludDetalle('hw-salud-ram', saludFactores, saludConsejo);  // Panel desplegable con factores

    const elTotal = document.getElementById('hw-ram-total');
    if (elTotal) elTotal.textContent = `${ram.total_gb} GB`;  // Ej. "16.0 GB"

    const elDisp = document.getElementById('hw-ram-disponible');
    if (elDisp) elDisp.textContent = `${ram.disponible_gb} GB`;  // Ej. "9.2 GB"

    const elVel = document.getElementById('hw-ram-vel');
    if (elVel) {
      // La velocidad puede ser null si WMI no la reporta (ej. en máquinas virtuales)
      elVel.textContent = ram.velocidad_mhz ? `${ram.velocidad_mhz} MHz` : '—';
    }

    histRam.push(ram.uso_pct);                          // Añadir nueva muestra al historial
    if (histRam.length > HIST_MAX) histRam.shift();     // Mantener máximo HIST_MAX muestras
    dibujarChart('hw-chart-ram', histRam);              // Redibujar la gráfica
  }

  /**
   * renderDisco(disco, saludPct, saludTxt) — Actualiza la tarjeta de almacenamiento.
   * Muestra badge de salud global del disco en la cabecera de la tarjeta.
   * saludPct y saludTxt vienen del análisis S.M.A.R.T. del sidecar Python.
   */
  function renderDisco(disco, saludPct, saludTxt, saludFactores, saludConsejo) {
    // Badge de salud del disco: solo se muestra si el sidecar pudo leer S.M.A.R.T.
    // (en VMs o algunos NVMe antiguos el atributo no está disponible y saludPct llega null)
    const badge  = document.getElementById('hw-disco-salud-badge');
    const infoBtn = document.getElementById('hw-disco-info-btn');
    if (badge && saludPct != null) {
      // Reutilizar el mismo umbral 80/50 que el gauge de salud para consistencia visual
      const cls = saludPct >= 80 ? 'salud-ok' : saludPct >= 50 ? 'salud-warn' : 'salud-danger';
      badge.className = `hw-disco-salud-badge ${cls}`;
      badge.textContent = `${saludTxt ?? '—'} · ${saludPct}%`;  // Ej. "Óptimo · 94%"
      badge.style.display = '';     // Hacer visible (por defecto está oculto hasta tener datos)
      if (infoBtn) infoBtn.style.display = '';  // Mostrar el botón ? junto al badge
    }
    renderSaludDetalle('hw-salud-disco', saludFactores, saludConsejo);  // Panel desplegable

    // Velocidades globales de I/O
    const elLec = document.getElementById('hw-disco-lectura');
    if (elLec) elLec.textContent = `${disco.lectura_mbs} MB/s`;  // Ej. "45.30 MB/s"

    const elEsc = document.getElementById('hw-disco-escritura');
    if (elEsc) elEsc.textContent = `${disco.escritura_mbs} MB/s`;

    // Lista de particiones: limpiar el contenedor y repoblar con los datos del sidecar
    const lista = document.getElementById('hw-disco-particiones');
    if (!lista) return;

    lista.innerHTML = '';  // Limpiar filas anteriores antes de redibujar

    disco.particiones.forEach(part => {
      const fila = document.createElement('div');      // Contenedor de cada fila de partición
      fila.className = 'hw-disco-fila';

      // Calcular el porcentaje de la barra de uso (limitado entre 0 y 100 para seguridad)
      const pct  = Math.min(100, Math.max(0, part.uso_pct));
      // Clase de color: verde normal, naranja si > 80 %, rojo si > 90 %
      const cls  = pct >= 90 ? 'danger' : pct >= 80 ? 'warn' : 'ok';

      fila.innerHTML = `
        <div class="hw-disco-unidad">${part.unidad}</div>
        <div class="hw-disco-bar-wrap">
          <div class="hw-disco-bar ${cls}" style="width:${pct}%"></div>
        </div>
        <div class="hw-disco-info">
          ${part.libre_gb} GB ${t('hardware.disponible')} / ${part.total_gb} GB
          <span class="hw-disco-tipo">${part.tipo}</span>
        </div>
      `;
      lista.appendChild(fila);  // Añadir la fila al contenedor
    });
  }

  /**
   * renderBateria(bateria, saludPct) — Actualiza la tarjeta de batería.
   * Muestra la carga actual (uso) y la vida útil restante (salud por desgaste de ciclos).
   */
  function renderBateria(bateria, saludPct, saludFactores, saludConsejo) {
    const cardBody = document.getElementById('hw-bat-body');
    if (!cardBody) return;

    if (!bateria.presente) {
      cardBody.innerHTML = `<span class="hw-bat-ausente">${t('hardware.bat_ausente')}</span>`;
      return;
    }

    const pct    = bateria.porcentaje;
    const barCls = pct < 15 ? 'low' : pct < 30 ? 'warn' : '';
    const icono  = bateria.cargando ? '⚡' : '🔋';

    const estadoTxt = bateria.cargando
      ? t('hardware.bat_cargando')
      : t('hardware.bat_descargando');

    const tiempoTxt = bateria.minutos_restantes != null
      ? `${bateria.minutos_restantes} min`
      : t('hardware.bat_sin_datos');

    // Bloque de vida útil: barra de desgaste basada en el ratio DesignCapacity/FullChargeCapacity de WMI.
    // Solo se renderiza si el sidecar pudo obtener el dato; en desktops o portátiles muy antiguos
    // WMI no expone DesignCapacity y saludPct llega null → el bloque queda omitido.
    let saludHTML = '';
    if (saludPct != null) {
      // Sin clase = verde (buena salud); salud-warn = naranja; salud-danger = rojo
      const saludCls = saludPct >= 80 ? '' : saludPct >= 50 ? 'salud-warn' : 'salud-danger';
      saludHTML = `
        <div class="hw-bat-salud-row">
          <span class="hw-bat-salud-label">Vida útil</span>
          <div class="hw-bat-salud-bar-wrap">
            <div class="hw-bat-salud-bar ${saludCls}" style="width:${saludPct}%"></div>
          </div>
          <span class="hw-bat-salud-pct">${saludPct}%</span>
        </div>`;
    }

    cardBody.innerHTML = `
      <div class="hw-bat-estado">
        <span class="hw-bat-icono">${icono}</span>
        <span class="hw-bat-pct">${pct}%</span>
        <span>${estadoTxt}</span>
      </div>
      <div class="hw-bat-bar-wrap">
        <div class="hw-bat-bar ${barCls}" style="width:${pct}%"></div>
      </div>
      <div class="hw-meta-list">
        <span class="hw-meta-label">${t('hardware.bat_restante')}</span>
        <span class="hw-meta-value">${tiempoTxt}</span>
      </div>
      ${saludHTML}
    `;

    // Panel de detalle de batería: se crea dinámicamente porque renderBateria() reconstruye
    // cardBody.innerHTML en cada escaneo, lo que destruiría un panel estático en el HTML.
    // La creación dinámica solo ocurre la primera vez (guarda verificación por ID).
    let detalleEl = document.getElementById('hw-salud-bateria');
    if (!detalleEl) {
      detalleEl = document.createElement('div');
      detalleEl.id        = 'hw-salud-bateria';
      detalleEl.className = 'hw-salud-detalle';
      detalleEl.hidden    = true;  // Oculto por defecto; el listener de delegación lo toglea
      document.getElementById('hw-card-bateria')?.appendChild(detalleEl);

      // Botón ? en el título de la tarjeta: solo si hay datos de salud disponibles.
      // Se verifica que no exista ya (idempotencia) por si lanzar() se llama dos veces.
      const titulo = document.querySelector('#hw-card-bateria .hw-card-titulo');
      if (titulo && saludPct != null && !document.getElementById('hw-bat-info-btn')) {
        const btn = document.createElement('button');
        btn.id        = 'hw-bat-info-btn';
        btn.className = 'hw-salud-info-btn';
        btn.dataset.target = 'hw-salud-bateria';  // El listener de delegación usa este atributo para saber qué panel mostrar
        btn.title     = '¿Por qué esta puntuación?';
        btn.textContent = '?';
        titulo.insertAdjacentElement('afterend', btn);  // Insertar justo después del título, no dentro
      }
    }
    renderSaludDetalle('hw-salud-bateria', saludFactores, saludConsejo);  // Rellenar el panel con los factores
  }

  /**
   * renderEventos(eventos) — Lista los eventos críticos del Event Log.
   * Cada evento tiene tipo, timestamp e inicio del mensaje.
   */
  function renderEventos(eventos) {
    const lista = document.getElementById('hw-eventos-lista');
    if (!lista) return;

    if (!eventos || eventos.length === 0) {
      // Sin eventos críticos recientes: mostrar mensaje tranquilizador
      lista.innerHTML = `<li class="hw-sin-eventos">${t('hardware.sin_eventos')}</li>`;
      return;
    }

    lista.innerHTML = '';  // Limpiar eventos anteriores antes de redibujar

    eventos.forEach(ev => {
      const li  = document.createElement('li');    // Cada evento es un <li>
      li.className = `hw-evento ${ev.tipo}`;        // Clase según tipo para el color del borde

      // Mapear el tipo de evento a su etiqueta i18n
      const tipoMap = {
        'reinicio_inesperado': t('hardware.ev_reinicio'),   // Kernel-Power ID 41
        'throttling_termico':  t('hardware.ev_throttling'), // Kernel-Processor-Power ID 37
      };
      const tipoLabel = tipoMap[ev.tipo] || t('hardware.ev_desconocido');

      // Formatear el timestamp para mostrar solo la parte de fecha y hora sin milisegundos
      const tsCorto = ev.timestamp ? ev.timestamp.replace('T', ' ').substring(0, 16) : '';

      li.innerHTML = `
        <div>
          <div class="hw-evento-tipo">${tipoLabel}</div>
          <div class="hw-evento-ts">${tsCorto}</div>
        </div>
        <div class="hw-evento-msg" title="${ev.mensaje}">${ev.mensaje}</div>
      `;
      lista.appendChild(li);  // Añadir el evento a la lista
    });
  }

  /**
   * renderSpecsTable(data) — Rellena la tabla de especificaciones en modo avanzado.
   * Se muestra solo cuando body.modo-avanzado está activo (controlado por CSS).
   */
  function renderSpecsTable(data) {
    const tbody = document.getElementById('hw-specs-tbody');
    if (!tbody) return;

    // Construir filas de especificaciones con los datos de CPU, RAM y disco
    const filas = [
      [t('hardware.modelo'),       data.cpu.modelo || '—'],
      [t('hardware.nucleos_fis'),  data.cpu.nucleos_fisicos],
      [t('hardware.nucleos_log'),  data.cpu.nucleos_logicos],
      [t('hardware.frecuencia'),   data.cpu.frecuencia_mhz ? `${(data.cpu.frecuencia_mhz/1000).toFixed(2)} GHz` : '—'],
      [t('hardware.temperatura'),  data.cpu.temperatura_c != null ? `${data.cpu.temperatura_c} °C` : t('hardware.temp_nd')],
      [t('hardware.total') + ' RAM', `${data.ram.total_gb} GB`],
      [t('hardware.velocidad_ram'), data.ram.velocidad_mhz ? `${data.ram.velocidad_mhz} MHz` : '—'],
    ];

    // Generar HTML de filas de la tabla
    tbody.innerHTML = filas.map(([label, val]) =>
      `<tr><td class="hw-meta-label">${label}</td><td class="hw-meta-value">${val}</td></tr>`
    ).join('');
  }

  // ── Modo demo ────────────────────────────────────────────────────────────────

  /**
   * datosDemo() — Genera datos ficticios plausibles para el modo demo de ESTICC.
   * Los valores oscilan ligeramente en cada llamada para simular actividad real.
   * Esto permite demostrar la UI sin depender del sidecar Python.
   */
  function datosDemo() {
    const aleatorio = (min, max) => Math.round(min + Math.random() * (max - min));  // Entero aleatorio en rango

    return {
      ok: true,
      data: {
        cpu: {
          modelo:          'Intel(R) Core(TM) i7-10750H CPU @ 2.60GHz',  // CPU ficticia de demostración
          nucleos_fisicos: 6,
          nucleos_logicos: 12,
          frecuencia_mhz:  aleatorio(2200, 4800),           // Frecuencia turbo aleatoria entre 2.2–4.8 GHz
          uso_pct:         aleatorio(10, 65),                // Uso entre 10 y 65 %
          temperatura_c:   aleatorio(45, 78),                // Temperatura entre 45 y 78 °C
        },
        ram: {
          total_gb:       16.0,
          disponible_gb:  parseFloat((16 - aleatorio(4, 10)).toFixed(1)),  // 6–12 GB disponibles
          uso_pct:        aleatorio(35, 70),
          velocidad_mhz:  3200,                              // DDR4-3200 frecuente en portátiles modernos
        },
        disco: {
          lectura_mbs:    parseFloat((aleatorio(0, 200) / 10).toFixed(2)),  // 0–20 MB/s
          escritura_mbs:  parseFloat((aleatorio(0, 80)  / 10).toFixed(2)),  // 0–8 MB/s
          particiones: [
            { unidad: 'C:\\', total_gb: 476.8, libre_gb: aleatorio(80, 200), uso_pct: aleatorio(40, 75), tipo: 'SSD' },
            { unidad: 'D:\\', total_gb: 931.5, libre_gb: aleatorio(200, 600), uso_pct: aleatorio(20, 50), tipo: 'HDD' },
          ],
        },
        bateria: {
          presente:          true,
          porcentaje:        aleatorio(30, 95),
          cargando:          Math.random() > 0.5,            // 50 % de probabilidad de estar cargando
          minutos_restantes: aleatorio(45, 180),             // Entre 45 min y 3 horas
        },
        eventos: [
          {
            tipo:      'reinicio_inesperado',
            timestamp: '2026-05-20T08:42:15',
            mensaje:   'The system has rebooted without cleanly shutting down first.',
          },
        ],
        salud: {
          cpu_pct:  aleatorio(72, 98),
          cpu_factores: [
            { tipo: 'ok',   texto: 'Temperatura en rango normal: 62 °C' },
            { tipo: 'warn', texto: '1 evento de reducción de velocidad por calor en el historial del sistema' },
          ],
          cpu_consejo: 'El procesador ha bajado su frecuencia para no sobrecalentarse. Considera limpiar los ventiladores o mejorar el flujo de aire del chasis.',

          ram_pct:  aleatorio(80, 99),
          ram_factores: [
            { tipo: 'ok', texto: 'Memoria de intercambio prácticamente sin uso: 3%' },
          ],
          ram_consejo: null,

          disco_pct:  aleatorio(60, 95),
          disco_txt:  'Óptimo',
          disco_factores: [
            { tipo: 'ok', texto: 'Samsung SSD 860 EVO (SSD): estado óptimo según S.M.A.R.T.' },
            { tipo: 'ok', texto: 'WD Blue 1TB (HDD): estado óptimo según S.M.A.R.T.' },
          ],
          disco_consejo: null,

          bateria_pct: aleatorio(55, 92),
          bateria_factores: [
            { tipo: 'warn', texto: 'Capacidad actual: 73% respecto a la original de fábrica (has perdido un 27%)' },
            { tipo: 'warn', texto: 'Degradación notable — la autonomía es significativamente menor que cuando era nueva' },
          ],
          bateria_consejo: 'La batería ha perdido capacidad. Evita cargarla al 100% constantemente y no la dejes descargarse completamente. Mantenerla entre el 20% y el 80% alarga su vida útil.',
        },
      },
      meta: {
        duracion_s: 3.1,
        timestamp: new Date().toISOString(),
      },
    };
  }

  // ── Lógica principal de escaneo ──────────────────────────────────────────────

  /**
   * escanear() — Ejecuta el escaneo de hardware y actualiza el panel.
   * Respeta el modo demo: si SIMULADOR.activo=true, usa datos ficticios en lugar de llamar al sidecar.
   * Actualiza el estado del botón de escaneo durante la operación para dar feedback visual.
   */
  async function escanear() {
    const btn    = document.getElementById('btn-hardware');        // Botón de escaneo del panel
    const panel  = document.getElementById(PANEL_ID);              // Panel raíz para el estado de carga

    if (!panel) return;  // Salida segura si el panel no está en el DOM (script cargado antes del HTML)

    // Actualizar el botón a estado "Analizando…" para feedback visual inmediato
    if (btn) {
      btn.disabled    = true;                          // Deshabilitar para evitar doble clic
      btn.textContent = t('estados.analizando');        // Cambiar etiqueta a "Analizando…"
    }

    try {
      let resp;
      if (window.SIMULADOR?.activo) {
        resp = datosDemo();  // Modo demo: datos ficticios sin llamar al sidecar Python
      } else {
        // Leer el tiempo de muestreo configurado (determina el tiempo que bloquea el escaneo de CPU)
        const cfg      = window.ESTICC_CONFIG?.cargar() || {};
        const muestreo = { rapido: 2, balanceado: 3, preciso: 5 }[cfg.tiempo_muestreo] || 3;
        resp = await invocarTauri('scan_hardware', { muestreo });  // Llamar al sidecar con el muestreo configurado
      }

      if (!resp?.ok) {
        // El sidecar devolvió ok=false: mostrar toast de error y salir
        if (typeof showToast === 'function') showToast(t('estados.error'), 'error', 4000);
        return;
      }

      const d = resp.data;
      const s = d.salud || {};

      renderCpu(d.cpu,     s.cpu_pct,     s.cpu_factores,     s.cpu_consejo);
      renderRam(d.ram,     s.ram_pct,     s.ram_factores,     s.ram_consejo);
      renderDisco(d.disco, s.disco_pct,   s.disco_txt,        s.disco_factores, s.disco_consejo);
      renderBateria(d.bateria, s.bateria_pct ?? null, s.bateria_factores, s.bateria_consejo);
      renderEventos(d.eventos);
      renderSpecsTable(d);

      // Actualizar el timestamp del último escaneo en el footer del panel
      const ts = document.getElementById('hw-timestamp');
      if (ts) {
        const fecha = new Date(resp.meta.timestamp);
        // Formatear la fecha con la localización activa para respetar el idioma del sistema
        ts.textContent = `${t('msgs.ultimo_analisis')} ${fecha.toLocaleString()}`;
      }

    } catch (err) {
      // Error de comunicación con el sidecar (no se pudo invocar Tauri o excepción en Python)
      if (typeof showToast === 'function') showToast(t('estados.error_com'), 'error', 4000);
    } finally {
      // Restaurar el botón siempre, incluso si hubo un error, para que el usuario pueda reintentar
      if (btn) {
        btn.disabled    = false;                        // Volver a habilitar
        btn.textContent = t('hardware.btn_escanear');   // Restaurar etiqueta original
      }
    }
  }

  // ── Inicialización tras carga del DOM ────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', () => {

    // Conectar el botón de escaneo del panel hardware
    const btn = document.getElementById('btn-hardware');
    if (btn) {
      btn.addEventListener('click', escanear);  // Lanzar escaneo al pulsar el botón
    }

    // Inicializar los gauges en 0 % para evitar que aparezcan vacíos antes del primer escaneo
    actualizarGauge('hw-gauge-cpu', 0);
    actualizarGauge('hw-gauge-ram', 0);

    // Listener de delegación para los botones de detalle de salud.
    // Se registra en el panel raíz en lugar de en cada botón individualmente
    // porque los botones de batería y disco se crean dinámicamente (no existen en el DOM al arrancar).
    // closest() sube por el árbol DOM hasta encontrar el botón aunque el clic sea en un hijo.
    const panelHw = document.getElementById('panel-hardware');
    if (panelHw) {
      panelHw.addEventListener('click', e => {
        const btn = e.target.closest('.hw-salud-info-btn');  // null si el clic no fue en un botón ?
        if (!btn) return;  // Ignorar clics que no sean en botones de info de salud
        const targetId = btn.dataset.target;          // ID del panel a mostrar/ocultar
        const detalle  = document.getElementById(targetId);
        if (!detalle) return;                          // El panel aún no existe (ej. sin batería)
        const abierto  = !detalle.hidden;              // Estado actual antes del clic
        detalle.hidden = abierto;                      // Invertir: si estaba abierto, cerrarlo y viceversa
        btn.classList.toggle('activo', !abierto);      // Colorear el botón cuando el panel está abierto
      });
    }
  });

  // ── API pública ──────────────────────────────────────────────────────────────

  /**
   * window.ESTICC_HW.escanear — Permite que background.js o window.escanearTodo()
   * lancen el escaneo de hardware sin necesidad de simular un clic en el botón.
   * También expone el historial para futuros módulos que quieran leer las métricas.
   */
  window.ESTICC_HW = {
    escanear,                          // Función de escaneo para llamadas externas
    getHistCpu: () => [...histCpu],    // Copia del historial de CPU (no expone la ref interna)
    getHistRam: () => [...histRam],    // Copia del historial de RAM
  };

})();  // IIFE: todo el estado interno (histCpu, histRam, constantes) queda aislado del namespace global
