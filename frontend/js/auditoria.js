/**
 * auditoria.js — Capa de UI para el módulo de auditoría local.
 * Se comunica con el sidecar Python a través de la API de Tauri.
 */

const { invoke } = window.__TAURI__.tauri;

// ── Navegación ────────────────────────────────────────────────────────────────

document.querySelectorAll('nav button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`panel-${btn.dataset.panel}`).classList.add('active');
  });
});

// ── Modo Básico / Avanzado ────────────────────────────────────────────────────

document.getElementById('modo-checkbox').addEventListener('change', (e) => {
  const avanzado = e.target.checked;
  document.body.classList.toggle('modo-avanzado', avanzado);
  document.getElementById('modo-label').textContent = avanzado ? 'Modo Avanzado' : 'Modo Básico';
});

// ── IPC con sidecar ───────────────────────────────────────────────────────────

let _sidecar = null;
let _pendientes = {};
let _buffer = '';

async function getSidecar() {
  if (_sidecar) return _sidecar;
  const { Command } = window.__TAURI__.shell;
  _sidecar = Command.sidecar('backend/main');

  _sidecar.stdout.on('data', chunk => {
    _buffer += chunk;
    const lineas = _buffer.split('\n');
    _buffer = lineas.pop();
    for (const linea of lineas) {
      if (!linea.trim()) continue;
      try {
        const msg = JSON.parse(linea);
        const resolver = _pendientes[msg.id];
        if (resolver) {
          delete _pendientes[msg.id];
          resolver(msg);
        }
      } catch (_) {}
    }
  });

  await _sidecar.spawn();
  return _sidecar;
}

function uuid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function llamarBackend(action) {
  const sidecar = await getSidecar();
  const id = uuid();
  const promesa = new Promise((resolve, reject) => {
    _pendientes[id] = resolve;
    setTimeout(() => {
      if (_pendientes[id]) {
        delete _pendientes[id];
        reject(new Error('Timeout esperando respuesta del sidecar.'));
      }
    }, 60000);
  });
  await sidecar.stdin.write(JSON.stringify({ id, action }) + '\n');
  return promesa;
}

// ── Utilidades de render ──────────────────────────────────────────────────────

const loading = document.getElementById('loading');

function setLoading(on) {
  loading.style.display = on ? 'block' : 'none';
}

function badge(texto, tipo) {
  return `<span class="badge badge-${tipo}">${texto}</span>`;
}

function actualizarTimestamp() {
  document.getElementById('ultimo-analisis').textContent =
    `Último análisis: ${new Date().toLocaleTimeString('es-ES')}`;
}

// ── Renderizadores por panel ──────────────────────────────────────────────────

function renderDefensas(data) {
  const fw  = data.firewall;
  const av  = data.antivirus;
  const bl  = data.bitlocker;

  const estado = (ok) => ok === true
    ? badge('Activo', 'ok')
    : ok === false
      ? badge('INACTIVO', 'danger')
      : badge('Desconocido', 'warn');

  return `
    <div class="status-row">
      <div>
        <div class="status-label">🛡️ Firewall</div>
        <div class="status-desc modo-avanzado-only" style="display:none;">
          ${(fw.perfiles || []).map(p => `${p.nombre}: ${p.habilitado ? '✓' : '✗'}`).join(' · ')}
        </div>
      </div>
      ${estado(fw.activo)}
    </div>
    <div class="status-row">
      <div>
        <div class="status-label">🦠 Antivirus (Windows Defender)</div>
      </div>
      ${estado(av.activo)}
    </div>
    <div class="status-row">
      <div>
        <div class="status-label">🔒 Cifrado de disco (BitLocker)</div>
        <div class="status-desc" style="color:var(--text-dim);font-size:12px;">
          ${bl.nota || (bl.volumenes || []).map(v => `${v.unidad} ${v.protegido ? '✓' : '✗'}`).join(' ')}
        </div>
      </div>
      ${estado(bl.activo)}
    </div>
    <div style="margin-top:16px;">
      ${data.todas_defensas_activas
        ? badge('Todas las defensas están activas', 'ok')
        : badge('Una o más defensas requieren atención', 'danger')}
    </div>`;
}

function renderPuertos(data) {
  if (!data.length) return '<p style="color:var(--text-dim);margin-top:12px;">No se encontraron conexiones TCP activas.</p>';

  const filas = data.map(c => `
    <tr>
      <td>${c.proceso || '—'}</td>
      <td>${c.pid || '—'}</td>
      <td>${c.local}</td>
      <td>${c.remoto || '—'}</td>
      <td>${c.estado}</td>
    </tr>`).join('');

  return `
    <table>
      <thead><tr>
        <th>Proceso</th><th>PID</th><th>Local</th><th>Remoto</th><th>Estado</th>
      </tr></thead>
      <tbody>${filas}</tbody>
    </table>`;
}

function renderProcesos(data) {
  if (!data.length) return '<p style="color:var(--text-dim);margin-top:12px;">Sin procesos detectados.</p>';

  const top = data.slice(0, 50);
  const filas = top.map(p => {
    const alerta = p.alerta_cpu || p.alerta_ram || p.sin_ruta;
    return `<tr style="${alerta ? 'color:var(--warn)' : ''}">
      <td>${p.nombre}</td>
      <td>${p.pid}</td>
      <td>${p.cpu_pct.toFixed(1)}%</td>
      <td>${p.ram_mb} MB</td>
      <td>${alerta ? badge('Revisar', 'warn') : ''}</td>
    </tr>`;
  }).join('');

  return `
    <table>
      <thead><tr>
        <th>Proceso</th><th>PID</th><th>CPU</th><th>RAM</th><th>Alerta</th>
      </tr></thead>
      <tbody>${filas}</tbody>
    </table>`;
}

function renderAutoinicio(data) {
  const reg = data.registro || [];
  const tareas = data.tareas_programadas || [];

  const filasReg = reg.length
    ? reg.map(e => `<tr><td>${e.origen}</td><td>${e.nombre}</td><td style="word-break:break-all;">${e.comando}</td></tr>`).join('')
    : '<tr><td colspan="3" style="color:var(--text-dim);">Sin entradas en el registro.</td></tr>';

  const filasTareas = tareas.slice(0, 30).map(t =>
    `<tr><td>${t.nombre}</td><td>${t.estado}</td><td>${t.siguiente_ejecucion}</td></tr>`
  ).join('');

  return `
    <h3 style="margin:8px 0 8px;font-size:13px;color:var(--text-dim);">Registro (Run / RunOnce)</h3>
    <table>
      <thead><tr><th>Origen</th><th>Nombre</th><th>Comando</th></tr></thead>
      <tbody>${filasReg}</tbody>
    </table>
    <h3 style="margin:16px 0 8px;font-size:13px;color:var(--text-dim);">Tareas Programadas</h3>
    <table>
      <thead><tr><th>Nombre</th><th>Estado</th><th>Próxima ejecución</th></tr></thead>
      <tbody>${filasTareas || '<tr><td colspan="3" style="color:var(--text-dim);">Sin tareas.</td></tr>'}</tbody>
    </table>`;
}

function renderParches(data) {
  const pendientes = data.actualizaciones_pendientes || [];
  return `
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
      </table>` : ''}`;
}

// ── Conexión de botones ───────────────────────────────────────────────────────

async function escanear(action, btnId, resultadoId, renderer) {
  const btn = document.getElementById(btnId);
  const div = document.getElementById(resultadoId);
  btn.disabled = true;
  setLoading(true);
  try {
    const msg = await llamarBackend(action);
    if (msg.error) {
      div.innerHTML = `<p style="color:var(--danger);">Error: ${msg.error}</p>`;
    } else if (!msg.result.ok) {
      div.innerHTML = `<p style="color:var(--danger);">Error: ${msg.result.error}</p>`;
    } else {
      div.innerHTML = renderer(msg.result.data);
      actualizarTimestamp();
    }
  } catch (e) {
    div.innerHTML = `<p style="color:var(--danger);">Error de comunicación: ${e.message}</p>`;
  } finally {
    btn.disabled = false;
    setLoading(false);
  }
}

document.getElementById('btn-defensas').addEventListener('click',  () => escanear('scan_defenses', 'btn-defensas',  'resultado-defensas',  renderDefensas));
document.getElementById('btn-puertos').addEventListener('click',   () => escanear('scan_ports',    'btn-puertos',   'resultado-puertos',   renderPuertos));
document.getElementById('btn-procesos').addEventListener('click',  () => escanear('scan_processes','btn-procesos',  'resultado-procesos',  renderProcesos));
document.getElementById('btn-autoinicio').addEventListener('click',() => escanear('scan_startup',  'btn-autoinicio','resultado-autoinicio', renderAutoinicio));
document.getElementById('btn-parches').addEventListener('click',   () => escanear('scan_patches',  'btn-parches',   'resultado-parches',   renderParches));
