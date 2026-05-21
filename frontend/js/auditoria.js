/**
 * auditoria.js — Capa de UI para el módulo de auditoría local.
 * Comunica con el sidecar Python vía Tauri command `audit` (Rust → stdin/stdout).
 */

function invoke(cmd, args) {
  if (!window.__TAURI__) {
    return Promise.reject('window.__TAURI__ no disponible. ¿Falta withGlobalTauri en tauri.conf.json?');
  }
  return window.__TAURI__.tauri.invoke(cmd, args);
}

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

function escudo(icono, titulo, activo, desc) {
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

function renderDefensas(data) {
  const fw  = data.firewall;
  const av  = data.antivirus;
  const bl  = data.bitlocker;

  const estadoBadge = (ok) => ok === true
    ? badge('Activo', 'ok')
    : ok === false
      ? badge('INACTIVO', 'danger')
      : badge('Desconocido', 'warn');

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

  return basico + avanzado;
}

function renderPuertos(data) {
  if (!data.length) return '<p style="color:var(--text-dim);margin-top:12px;">No se encontraron conexiones TCP activas.</p>';

  const establecidas = data.filter(c => c.estado === 'ESTABLISHED').length;
  const escuchando   = data.filter(c => c.estado === 'LISTEN').length;
  const nivelCls     = establecidas > 20 ? 'warn' : 'ok';

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

  const top   = data.slice(0, 50);
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
  const reg    = data.registro || [];
  const tareas = data.tareas_programadas || [];
  const total  = reg.length;
  const nivelCls = total > 15 ? 'warn' : 'ok';

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

// ── Conexión de botones ───────────────────────────────────────────────────────

async function escanear(action, btnId, resultadoId, renderer) {
  const btn = document.getElementById(btnId);
  const div = document.getElementById(resultadoId);
  btn.disabled = true;
  setLoading(true);
  try {
    // Rust gestiona el sidecar; aquí solo invocamos el command `audit`.
    const resultado = await invoke('audit', { action });
    if (!resultado.ok) {
      div.innerHTML = `<p style="color:var(--danger);">Error del escáner: ${resultado.error}</p>`;
    } else {
      div.innerHTML = renderer(resultado.data);
      actualizarTimestamp();
    }
  } catch (e) {
    div.innerHTML = `<p style="color:var(--danger);">Error de comunicación: ${e}</p>`;
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
