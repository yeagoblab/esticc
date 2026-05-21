/**
 * auditoria.js — Capa de UI para el módulo de auditoría local.
 * Comunica con el sidecar Python vía Tauri command `audit` (Rust → stdin/stdout).
 */

/**
 * invoke() — Wrapper seguro alrededor de window.__TAURI__.tauri.invoke().
 * Intercepta las llamadas cuando el simulador está activo para devolver datos ficticios.
 * Si Tauri no está disponible (apertura directa en navegador), rechaza la promesa con mensaje útil.
 */
function invoke(cmd, args) {
  // Si el simulador está activo, redirigir la llamada a los datos ficticios del escenario
  if (cmd === 'audit' && window.SIMULADOR?.activo) {
    return window.SIMULADOR.interceptar(args.action);  // Devuelve una Promise con datos de demo
  }
  // Comprobar que Tauri está disponible (requiere withGlobalTauri: true en tauri.conf.json)
  if (!window.__TAURI__) {
    return Promise.reject('window.__TAURI__ no disponible. ¿Falta withGlobalTauri en tauri.conf.json?');
  }
  // Llamada real al comando Rust 'audit' con los argumentos proporcionados
  return window.__TAURI__.tauri.invoke(cmd, args);
}

// ── Navegación entre paneles ──────────────────────────────────────────────────

// Asignar un listener de click a cada botón de la barra de navegación
document.querySelectorAll('nav button').forEach(btn => {
  btn.addEventListener('click', () => {
    // Desactivar todos los botones y paneles antes de activar el seleccionado
    document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));

    btn.classList.add('active');  // Marcar este botón como activo (cambia su estilo CSS)

    // Activar el panel correspondiente usando la convención panel-{data-panel}
    document.getElementById(`panel-${btn.dataset.panel}`).classList.add('active');
  });
});

// ── Toggle Modo Básico / Avanzado ─────────────────────────────────────────────

// El toggle cambia la clase 'modo-avanzado' en <body>
// El CSS usa selectores body.modo-avanzado .vista-avanzada { display: block } para cambiar las vistas
document.getElementById('modo-checkbox').addEventListener('change', (e) => {
  const avanzado = e.target.checked;  // true si el checkbox está marcado
  document.body.classList.toggle('modo-avanzado', avanzado);  // Añadir/quitar clase según estado
  document.getElementById('modo-label').textContent = avanzado ? 'Modo Avanzado' : 'Modo Básico';
});

// ── Utilidades de render ──────────────────────────────────────────────────────

const loading = document.getElementById('loading');  // Indicador de carga en la esquina inferior derecha

/** Muestra u oculta el indicador de carga global. */
function setLoading(on) {
  loading.style.display = on ? 'block' : 'none';
}

/**
 * Genera un badge HTML coloreado según el tipo.
 * @param {string} texto - Texto visible del badge
 * @param {string} tipo  - 'ok' (verde), 'warn' (amarillo), 'danger' (rojo)
 */
function badge(texto, tipo) {
  return `<span class="badge badge-${tipo}">${texto}</span>`;
}

/** Actualiza el timestamp del último análisis en la cabecera. */
function actualizarTimestamp() {
  document.getElementById('ultimo-analisis').textContent =
    `Último análisis: ${new Date().toLocaleTimeString('es-ES')}`;
}

// ── Función de render de escudos (vista básica) ────────────────────────────────

/**
 * Genera el HTML de un "escudo" visual para la vista básica.
 * El color del borde depende del estado: verde (ok), rojo (danger), amarillo (warn).
 */
function escudo(icono, titulo, activo, desc) {
  // activo===true → ok (verde), activo===false → danger (rojo), activo===null/undefined → warn (amarillo)
  const cls   = activo === true ? 'ok' : activo === false ? 'danger' : 'warn';
  const label = activo === true ? 'ACTIVO' : activo === false ? 'INACTIVO' : 'DESCONOCIDO';
  return `
    <div class="escudo ${cls}">
      <div class="escudo-icono">${icono}</div>
      <div class="escudo-titulo">${titulo}</div>
      <div class="escudo-estado">${label}</div>
      ${desc ? `<div class="escudo-desc">${desc}</div>` : ''}
    </div>`;
}

// ── Renderizadores por panel ──────────────────────────────────────────────────
// Cada función recibe data (la salida del escáner Python) y devuelve HTML completo
// con ambas vistas: <div class="vista-basica"> + <div class="vista-avanzada">
// El CSS oculta/muestra una u otra según si body tiene la clase "modo-avanzado"

function renderDefensas(data) {
  const fw = data.firewall;   // Estado del Firewall (objeto con campo 'activo' y 'perfiles')
  const av = data.antivirus;  // Estado de Windows Defender
  const bl = data.bitlocker;  // Estado de BitLocker

  // Helper local para generar el badge de estado en la vista avanzada
  const estadoBadge = (ok) => ok === true
    ? badge('Activo', 'ok')
    : ok === false
      ? badge('INACTIVO', 'danger')
      : badge('Desconocido', 'warn');

  // Vista básica: 3 escudos grandes con estado visual inmediato
  const basico = `
    <div class="vista-basica">
      <div class="escudos">
        ${escudo('🛡️', 'Firewall', fw.activo,
            (fw.perfiles || []).map(p => `${p.nombre}: ${p.habilitado ? '✓' : '✗'}`).join(' · '))}
        ${escudo('🦠', 'Antivirus', av.activo, 'Windows Defender')}
        ${escudo('🔒', 'BitLocker',  bl.activo,
            bl.nota || (bl.volumenes || []).map(v => v.unidad).join(', '))}
      </div>
      <div style="margin-top:16px;">
        ${data.todas_defensas_activas
          ? badge('Todas las defensas están activas', 'ok')
          : badge('Una o más defensas requieren atención', 'danger')}
      </div>
    </div>`;

  // Vista avanzada: filas con detalle de cada defensa y su estado exacto
  const avanzado = `
    <div class="vista-avanzada">
      <div class="status-row">
        <div>
          <div class="status-label">🛡️ Firewall</div>
          <div class="status-desc">${(fw.perfiles || []).map(p => `${p.nombre}: ${p.habilitado ? '✓' : '✗'}`).join(' · ')}</div>
        </div>
        ${estadoBadge(fw.activo)}
      </div>
      <div class="status-row">
        <div><div class="status-label">🦠 Antivirus (Windows Defender)</div></div>
        ${estadoBadge(av.activo)}
      </div>
      <div class="status-row">
        <div>
          <div class="status-label">🔒 Cifrado de disco (BitLocker)</div>
          <div class="status-desc">${bl.nota || (bl.volumenes || []).map(v => `${v.unidad} ${v.protegido ? '✓' : '✗'}`).join(' ')}</div>
        </div>
        ${estadoBadge(bl.activo)}
      </div>
      <div style="margin-top:16px;">
        ${data.todas_defensas_activas
          ? badge('Todas las defensas están activas', 'ok')
          : badge('Una o más defensas requieren atención', 'danger')}
      </div>
    </div>`;

  return basico + avanzado;  // Ambas vistas en el DOM; el CSS decide cuál mostrar
}

function renderPuertos(data) {
  if (!data.length) return '<p style="color:var(--text-dim);margin-top:12px;">No se encontraron conexiones TCP activas.</p>';

  const establecidas = data.filter(c => c.estado === 'ESTABLISHED').length;  // Conexiones activas
  const escuchando   = data.filter(c => c.estado === 'LISTEN').length;        // Puertos en escucha
  const nivelCls     = establecidas > 20 ? 'warn' : 'ok';  // Umbral: >20 conexiones simultáneas es inusual

  const basico = `
    <div class="vista-basica">
      <div class="escudos">
        ${escudo('🌐', 'Puertos abiertos', establecidas === 0, `${data.length} sockets totales`)}
        <div class="escudo ${nivelCls}">
          <div class="escudo-icono">📡</div>
          <div class="escudo-titulo">Conexiones activas</div>
          <div class="escudo-estado" style="font-size:22px;">${establecidas}</div>
          <div class="escudo-desc">${escuchando} en escucha</div>
        </div>
      </div>
    </div>`;

  // Vista avanzada: tabla completa con todos los sockets y sus detalles
  const filas = data.map(c => `
    <tr>
      <td>${c.proceso || '—'}</td>
      <td>${c.pid || '—'}</td>
      <td>${c.local}</td>
      <td>${c.remoto || '—'}</td>
      <td>${c.estado}</td>
    </tr>`).join('');

  const avanzado = `
    <div class="vista-avanzada">
      <table>
        <thead><tr>
          <th>Proceso</th><th>PID</th><th>Local</th><th>Remoto</th><th>Estado</th>
        </tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </div>`;

  return basico + avanzado;
}

function renderProcesos(data) {
  if (!data.length) return '<p style="color:var(--text-dim);margin-top:12px;">Sin procesos detectados.</p>';

  // Contar procesos con al menos una alerta (CPU elevada, RAM elevada, o sin ruta)
  const alertas  = data.filter(p => p.alerta_cpu || p.alerta_ram || p.sin_ruta).length;
  const nivelCls = alertas > 5 ? 'danger' : alertas > 0 ? 'warn' : 'ok';

  const basico = `
    <div class="vista-basica">
      <div class="escudos">
        <div class="escudo ${nivelCls}">
          <div class="escudo-icono">⚙️</div>
          <div class="escudo-titulo">Procesos activos</div>
          <div class="escudo-estado" style="font-size:22px;">${data.length}</div>
          <div class="escudo-desc">en ejecución ahora</div>
        </div>
        <div class="escudo ${alertas === 0 ? 'ok' : nivelCls}">
          <div class="escudo-icono">${alertas === 0 ? '✅' : '⚠️'}</div>
          <div class="escudo-titulo">Procesos a revisar</div>
          <div class="escudo-estado" style="font-size:22px;">${alertas}</div>
          <div class="escudo-desc">CPU o RAM elevada / sin ruta</div>
        </div>
      </div>
    </div>`;

  // Vista avanzada: tabla con los 50 procesos de mayor consumo de CPU
  const top   = data.slice(0, 50);  // Ya vienen ordenados por CPU descendente desde el escáner
  const filas = top.map(p => {
    const alerta = p.alerta_cpu || p.alerta_ram || p.sin_ruta;  // Cualquier alerta activa
    return `<tr style="${alerta ? 'color:var(--warn)' : ''}">
      <td>${p.nombre}</td>
      <td>${p.pid}</td>
      <td>${p.cpu_pct.toFixed(1)}%</td>
      <td>${p.ram_mb} MB</td>
      <td>${alerta ? badge('Revisar', 'warn') : ''}</td>
    </tr>`;
  }).join('');

  const avanzado = `
    <div class="vista-avanzada">
      <table>
        <thead><tr>
          <th>Proceso</th><th>PID</th><th>CPU</th><th>RAM</th><th>Alerta</th>
        </tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </div>`;

  return basico + avanzado;
}

function renderAutoinicio(data) {
  const reg    = data.registro || [];             // Entradas del registro Run/RunOnce
  const tareas = data.tareas_programadas || [];   // Tareas del Programador de tareas
  const total  = reg.length;
  const nivelCls = total > 15 ? 'warn' : 'ok';   // Umbral: >15 entradas en Run es inusual

  const basico = `
    <div class="vista-basica">
      <div class="escudos">
        <div class="escudo ${nivelCls}">
          <div class="escudo-icono">🚀</div>
          <div class="escudo-titulo">Programas de autoinicio</div>
          <div class="escudo-estado" style="font-size:22px;">${total}</div>
          <div class="escudo-desc">entradas en el registro</div>
        </div>
        <div class="escudo ok">
          <div class="escudo-icono">🗓️</div>
          <div class="escudo-titulo">Tareas programadas</div>
          <div class="escudo-estado" style="font-size:22px;">${tareas.length}</div>
          <div class="escudo-desc">en el sistema</div>
        </div>
      </div>
    </div>`;

  // Vista avanzada: dos tablas separadas (registro y tareas programadas)
  const filasReg = reg.length
    ? reg.map(e => `<tr><td>${e.origen}</td><td>${e.nombre}</td><td style="word-break:break-all;">${e.comando}</td></tr>`).join('')
    : '<tr><td colspan="3" style="color:var(--text-dim);">Sin entradas en el registro.</td></tr>';

  const filasTareas = tareas.slice(0, 30).map(t =>
    `<tr><td>${t.nombre}</td><td>${t.estado}</td><td>${t.siguiente_ejecucion}</td></tr>`
  ).join('');

  const avanzado = `
    <div class="vista-avanzada">
      <h3 style="margin:8px 0 8px;font-size:13px;color:var(--text-dim);">Registro (Run / RunOnce)</h3>
      <table>
        <thead><tr><th>Origen</th><th>Nombre</th><th>Comando</th></tr></thead>
        <tbody>${filasReg}</tbody>
      </table>
      <h3 style="margin:16px 0 8px;font-size:13px;color:var(--text-dim);">Tareas Programadas</h3>
      <table>
        <thead><tr><th>Nombre</th><th>Estado</th><th>Próxima ejecución</th></tr></thead>
        <tbody>${filasTareas || '<tr><td colspan="3" style="color:var(--text-dim);">Sin tareas.</td></tr>'}</tbody>
      </table>
    </div>`;

  return basico + avanzado;
}

function renderParches(data) {
  const pendientes = data.actualizaciones_pendientes || [];
  const nivelCls   = data.sistema_actualizado ? 'ok' : pendientes.length > 5 ? 'danger' : 'warn';

  const basico = `
    <div class="vista-basica">
      <div class="escudos">
        ${escudo(
          data.sistema_actualizado ? '✅' : '⚠️',
          'Windows Update',
          data.sistema_actualizado,
          data.sistema_actualizado
            ? `Actualizado · ${data.ultima_actualizacion_exitosa || ''}`
            : `${pendientes.length} actualización(es) pendiente(s)`
        )}
      </div>
    </div>`;

  // Vista avanzada: tabla con el número KB, título y si requiere reinicio
  const avanzado = `
    <div class="vista-avanzada">
      <div class="status-row">
        <div>
          <div class="status-label">Sistema operativo</div>
          <div class="status-desc">Última actualización exitosa: ${data.ultima_actualizacion_exitosa || '—'}</div>
        </div>
        ${data.sistema_actualizado
          ? badge('Actualizado', 'ok')
          : badge(`${pendientes.length} actualización(es) pendiente(s)`, 'warn')}
      </div>
      ${pendientes.length ? `
        <table style="margin-top:12px;">
          <thead><tr><th>KB</th><th>Título</th><th>Reinicio</th></tr></thead>
          <tbody>${pendientes.map(p => `
            <tr>
              <td>${p.kb || '—'}</td>
              <td>${p.titulo || p.title || '—'}</td>
              <td>${p.reinicio_requerido || p.obligatoria ? badge('Sí', 'warn') : '—'}</td>
            </tr>`).join('')}
          </tbody>
        </table>` : ''}
    </div>`;

  return basico + avanzado;
}

// ── Función principal de escaneo ──────────────────────────────────────────────

/**
 * escanear() — Ejecuta un escáner, actualiza la UI con los resultados y muestra la tarjeta educativa.
 * @param {string}   action      - Nombre de la acción IPC (ej: 'scan_ports')
 * @param {string}   btnId       - ID del botón que lanzó el escaneo (para deshabilitarlo mientras carga)
 * @param {string}   resultadoId - ID del div donde se renderizará el resultado
 * @param {Function} renderer    - Función que convierte data → HTML (una de las render* de arriba)
 */
async function escanear(action, btnId, resultadoId, renderer) {
  const btn = document.getElementById(btnId);       // Referencia al botón de escaneo
  const div = document.getElementById(resultadoId); // Referencia al contenedor de resultados
  btn.disabled = true;   // Deshabilitar el botón para evitar clics repetidos durante el escaneo
  setLoading(true);      // Mostrar el indicador de carga global
  try {
    const resultado = await invoke('audit', { action });  // Llamada IPC al sidecar Python

    if (!resultado.ok) {
      // El escáner devolvió un error explícito (ej: permisos insuficientes)
      div.innerHTML = `<p style="color:var(--danger);">Error del escáner: ${resultado.error}</p>`;
    } else {
      // Guardar los datos crudos de puertos/procesos para que el Radar OSINT pueda correlacionar
      // Si el usuario escanea puertos y luego abre el radar, tendrá datos reales para correlacionar
      window.ULTIMO_SCAN = window.ULTIMO_SCAN || {};
      if (action === 'scan_ports')     window.ULTIMO_SCAN.puertos  = resultado.data;  // Array de conexiones
      if (action === 'scan_processes') window.ULTIMO_SCAN.procesos = resultado.data;  // Array de procesos

      // En modo demo, obtener la tarjeta educativa del escenario activo
      const tarjetaInfo = window.SIMULADOR?.activo ? window.SIMULADOR.tarjeta(action) : null;
      const tarjetaHtml = tarjetaInfo ? window.SIMULADOR.renderTarjeta(tarjetaInfo) : '';

      // Renderizar: HTML del escáner + tarjeta educativa (si hay) en el contenedor
      div.innerHTML = renderer(resultado.data) + tarjetaHtml;
      actualizarTimestamp();  // Actualizar el timestamp del header
    }
  } catch (e) {
    // Error de comunicación IPC (sidecar caído, pipe roto, Tauri no disponible...)
    div.innerHTML = `<p style="color:var(--danger);">Error de comunicación: ${e}</p>`;
  } finally {
    // Siempre restaurar el botón y ocultar el loading, aunque haya habido error
    btn.disabled = false;
    setLoading(false);
  }
}

// ── Conexión de botones con sus escáneres ─────────────────────────────────────

// Cada botón dispara escanear() con la acción, IDs y renderer correspondientes
document.getElementById('btn-defensas').addEventListener('click',  () => escanear('scan_defenses', 'btn-defensas',  'resultado-defensas',  renderDefensas));
document.getElementById('btn-puertos').addEventListener('click',   () => escanear('scan_ports',    'btn-puertos',   'resultado-puertos',   renderPuertos));
document.getElementById('btn-procesos').addEventListener('click',  () => escanear('scan_processes','btn-procesos',  'resultado-procesos',  renderProcesos));
document.getElementById('btn-autoinicio').addEventListener('click',() => escanear('scan_startup',  'btn-autoinicio','resultado-autoinicio', renderAutoinicio));
document.getElementById('btn-parches').addEventListener('click',   () => escanear('scan_patches',  'btn-parches',   'resultado-parches',   renderParches));
