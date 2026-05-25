/**
 * auditoria.js — Capa de UI para el módulo de auditoría local.
 */

function invoke(cmd, args) {
  if (cmd === 'audit' && window.SIMULADOR?.activo) {
    return window.SIMULADOR.interceptar(args.action);
  }
  if (!window.__TAURI__) {
    return Promise.reject('window.__TAURI__ no disponible. ¿Falta withGlobalTauri en tauri.conf.json?');
  }
  return window.__TAURI__.tauri.invoke(cmd, args);
}

// ── Navegación sidebar ───────────────────────────────────────────────────────

document.querySelectorAll('#sidebar .nav-item[data-panel]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#sidebar .nav-item[data-panel]').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`panel-${btn.dataset.panel}`).classList.add('active');
  });
});

// ── Toggle Modo Básico / Avanzado ─────────────────────────────────────────────

document.getElementById('modo-checkbox').addEventListener('change', (e) => {
  const avanzado = e.target.checked;
  document.body.classList.toggle('modo-avanzado', avanzado);
  document.getElementById('modo-label').textContent = avanzado ? t('botones.modo_avanzado') : t('botones.modo_basico');
});

// ── Sistema de Toasts ─────────────────────────────────────────────────────────

let _toastLoadingEl = null;

function showToast(mensaje, tipo = 'loading', duracion = 0) {
  const container = document.getElementById('toast-container');
  if (!container) return null;

  const el = document.createElement('div');
  el.className = `toast toast-${tipo}`;

  if (tipo === 'loading') {
    el.innerHTML = `<div class="toast-spinner"></div><span>${mensaje}</span>`;
  } else {
    const icono = tipo === 'ok' ? '✅' : tipo === 'danger' ? '❌' : '⚠️';
    el.innerHTML = `<span>${icono}</span><span>${mensaje}</span>`;
  }

  container.appendChild(el);

  if (duracion > 0) {
    setTimeout(() => el.remove(), duracion);
  }

  return el;
}

function removeToast(el) {
  if (el && el.parentNode) el.remove();
}

function setLoading(on, texto = 'Analizando…') {
  if (on) {
    _toastLoadingEl = showToast(texto, 'loading');
  } else {
    removeToast(_toastLoadingEl);
    _toastLoadingEl = null;
  }
}

// ── Utilidades ────────────────────────────────────────────────────────────────

function badge(texto, tipo) {
  return `<span class="badge badge-${tipo}">${texto}</span>`;
}

function actualizarTimestamp() {
  document.getElementById('ultimo-analisis').textContent =
    `${t('msgs.ultimo_analisis')} ${new Date().toLocaleTimeString('es-ES')}`;
}

/** Formatea una cadena "IP:Puerto" con colores diferenciados. */
function formatAddr(addr) {
  if (!addr || addr === '—') return '—';
  const lastColon = addr.lastIndexOf(':');
  if (lastColon === -1) return `<span class="port-ip">${addr}</span>`;
  const ip   = addr.slice(0, lastColon);
  const port = addr.slice(lastColon + 1);
  return `<span class="port-ip">${ip}</span><span class="port-sep">:</span><span class="port-num">${port}</span>`;
}

// ── Función de render de escudos ──────────────────────────────────────────────

function escudo(icono, titulo, activo, desc) {
  const cls   = activo === true ? 'ok' : activo === false ? 'danger' : 'warn';
  const label = activo === true ? t('estados.activo') : activo === false ? t('estados.inactivo') : t('estados.desconocido');
  return `
    <div class="escudo ${cls}">
      <div class="escudo-icono">${icono}</div>
      <div class="escudo-titulo">${titulo}</div>
      <div class="escudo-estado">${label}</div>
      ${desc ? `<div class="escudo-desc">${desc}</div>` : ''}
    </div>`;
}

// ── Renderizadores por panel ──────────────────────────────────────────────────

function renderDefensas(data) {
  const fw = data.firewall;
  const av = data.antivirus;
  const bl = data.bitlocker;

  const estadoBadge = (ok) => ok === true
    ? badge(t('estados.activo'), 'ok')
    : ok === false
      ? badge(t('estados.inactivo'), 'danger')
      : badge(t('estados.desconocido'), 'warn');

  const basico = `
    <div class="vista-basica">
      <div class="escudos">
        ${escudo('🛡️', t('escudos.firewall'), fw.activo,
            (fw.perfiles || []).map(p => `${p.nombre}: ${p.habilitado ? '✓' : '✗'}`).join(' · '))}
        ${escudo('🦠', t('escudos.antivirus'), av.activo, 'Windows Defender')}
        ${escudo('🔒', t('escudos.bitlocker'), bl.activo,
            bl.nota || (bl.volumenes || []).map(v => v.unidad).join(', '))}
      </div>
      <div style="margin-top:14px;">
        ${data.todas_defensas_activas
          ? badge(t('msgs.defensas_ok'), 'ok')
          : badge(t('msgs.defensas_warn'), 'danger')}
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
      <div style="margin-top:14px;">
        ${data.todas_defensas_activas
          ? badge(t('msgs.defensas_ok'), 'ok')
          : badge(t('msgs.defensas_warn'), 'danger')}
      </div>
    </div>`;

  return basico + avanzado;
}

function renderPuertos(data) {
  if (!data.length) return `
    <div class="empty-state">
      <div class="empty-state-icon">🌐</div>
      ${t('msgs.sin_puertos')}
    </div>`;

  const establecidas = data.filter(c => c.estado === 'ESTABLISHED').length;
  const escuchando   = data.filter(c => c.estado === 'LISTEN').length;
  const sospechosos  = data.filter(c => {
    const port = parseInt((c.local || '').split(':').at(-1));
    return [4444,31337,1337,9999,6666,6667,1080,4899,5900,5555,7777].includes(port);
  }).length;

  const nivelSosp = sospechosos > 0 ? 'danger' : 'ok';
  const nivelEst  = establecidas > 30 ? 'warn' : 'ok';

  const basico = `
    <div class="vista-basica">
      <div class="escudos">
        <div class="escudo ${nivelEst}">
          <div class="escudo-icono">📡</div>
          <div class="escudo-titulo">${t('escudos.conexiones')}</div>
          <div class="escudo-estado" style="font-size:22px;">${establecidas}</div>
          <div class="escudo-desc">${escuchando} en escucha · ${data.length} sockets totales</div>
        </div>
        <div class="escudo ${nivelSosp}">
          <div class="escudo-icono">${sospechosos > 0 ? '⚠️' : '✅'}</div>
          <div class="escudo-titulo">${t('escudos.puertos_sosp')}</div>
          <div class="escudo-estado" style="font-size:22px;">${sospechosos}</div>
          <div class="escudo-desc">${sospechosos > 0 ? t('msgs.sosp_investiga') : t('msgs.sosp_ninguno')}</div>
        </div>
      </div>
      ${sospechosos > 0 ? `<div style="margin-top:12px;">${badge(`${sospechosos} ${t('msgs.sosp_badge')}(s) — ${t('msgs.sosp_investiga')}`, 'danger')}</div>` : ''}
    </div>`;

  const filas = data.map(c => {
    const port = parseInt((c.local || '').split(':').at(-1));
    const esSosp = [4444,31337,1337,9999,6666,6667,1080,4899,5900,5555,7777].includes(port);
    return `<tr${esSosp ? ' style="background:rgba(248,81,73,0.07);"' : ''}>
      <td>${c.proceso || '—'}</td>
      <td>${c.pid || '—'}</td>
      <td>${formatAddr(c.local)}</td>
      <td>${c.remoto ? formatAddr(c.remoto) : '—'}</td>
      <td>${c.estado}${esSosp ? ' ' + badge('⚠ ' + t('msgs.sosp_badge'), 'danger') : ''}</td>
    </tr>`;
  }).join('');

  const avanzado = `
    <div class="vista-avanzada">
      <table>
        <thead><tr>
          <th>${t('tabla.proceso')}</th><th>${t('tabla.pid')}</th><th>${t('tabla.local')}</th><th>${t('tabla.remoto')}</th><th>${t('tabla.estado')}</th>
        </tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </div>`;

  return basico + avanzado;
}

function renderProcesos(data) {
  if (!data.length) return `
    <div class="empty-state">
      <div class="empty-state-icon">⚙️</div>
      ${t('msgs.sin_procesos')}
    </div>`;

  // Filtrar System Idle Process para los conteos de alertas
  const sinIdle    = data.filter(p => p.nombre !== 'System Idle Process' && p.nombre !== 'Idle');
  const alertas    = sinIdle.filter(p => p.alerta_cpu || p.alerta_ram || p.sin_ruta).length;
  const nivelCls   = alertas > 5 ? 'danger' : alertas > 0 ? 'warn' : 'ok';

  // Top 10 procesos por CPU para vista básica (sin System Idle)
  const top10 = sinIdle.slice(0, 10);

  const topItems = top10.map(p => {
    const alerta = p.alerta_cpu || p.alerta_ram || p.sin_ruta;
    const cpuCls = p.alerta_cpu ? 'alerta' : p.cpu_pct > 10 ? 'warn' : 'normal';
    return `<div class="proc-top-item">
      <span class="proc-top-name" title="${p.nombre}">${p.nombre}</span>
      ${alerta ? badge(p.sin_ruta ? t('msgs.sin_ruta') : t('msgs.revisar'), 'danger') : ''}
      <span class="proc-top-cpu ${cpuCls}">${p.cpu_pct.toFixed(1)}%</span>
    </div>`;
  }).join('');

  const basico = `
    <div class="vista-basica">
      <div class="escudos">
        <div class="escudo ${nivelCls}">
          <div class="escudo-icono">⚙️</div>
          <div class="escudo-titulo">${t('escudos.procesos')}</div>
          <div class="escudo-estado" style="font-size:22px;">${sinIdle.length}</div>
          <div class="escudo-desc">${t('msgs.cpu_desc')}</div>
        </div>
        <div class="escudo ${alertas === 0 ? 'ok' : nivelCls}">
          <div class="escudo-icono">${alertas === 0 ? '✅' : '⚠️'}</div>
          <div class="escudo-titulo">${t('escudos.a_revisar')}</div>
          <div class="escudo-estado" style="font-size:22px;">${alertas}</div>
          <div class="escudo-desc">${t('msgs.proc_desc')}</div>
        </div>
      </div>
      <div class="proc-top-list">
        <div class="proc-top-title">${t('msgs.proc_top')}</div>
        ${topItems}
      </div>
    </div>`;

  const filas = sinIdle.slice(0, 50).map(p => {
    const alerta = p.alerta_cpu || p.alerta_ram || p.sin_ruta;
    const rowStyle = p.alerta_cpu ? 'color:var(--danger)' : alerta ? 'color:var(--warn)' : '';
    return `<tr${rowStyle ? ` style="${rowStyle}"` : ''}>
      <td title="${p.nombre}">${p.nombre}</td>
      <td>${p.pid}</td>
      <td>${p.cpu_pct.toFixed(1)}%</td>
      <td>${p.ram_mb} MB</td>
      <td>${p.sin_ruta ? badge(t('msgs.sin_ruta'), 'danger') : alerta ? badge(t('msgs.revisar'), 'warn') : ''}</td>
    </tr>`;
  }).join('');

  const avanzado = `
    <div class="vista-avanzada">
      <table>
        <thead><tr>
          <th>${t('tabla.proceso')}</th><th>${t('tabla.pid')}</th><th>${t('tabla.cpu')}</th><th>${t('tabla.ram')}</th><th>${t('tabla.alerta')}</th>
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

  // Función para calcular impacto estimado de una entrada de autoinicio
  function impactoEntrada(entrada) {
    const cmd = (entrada.comando || '').toLowerCase();
    if (cmd.includes('powershell') || cmd.includes('wscript') || cmd.includes('cscript') || cmd.includes('cmd.exe')) return 'alto';
    if (cmd.includes('update') || cmd.includes('cloud') || cmd.includes('sync')) return 'medio';
    return 'bajo';
  }

  const basico = `
    <div class="vista-basica">
      <div class="escudos">
        <div class="escudo ${nivelCls}">
          <div class="escudo-icono">🚀</div>
          <div class="escudo-titulo">${t('escudos.autoinicio')}</div>
          <div class="escudo-estado" style="font-size:22px;">${total}</div>
          <div class="escudo-desc">${t('msgs.reg_entries')}</div>
        </div>
        <div class="escudo ok">
          <div class="escudo-icono">🗓️</div>
          <div class="escudo-titulo">${t('escudos.tareas')}</div>
          <div class="escudo-estado" style="font-size:22px;">${tareas.length}</div>
          <div class="escudo-desc">${t('msgs.en_sistema')}</div>
        </div>
      </div>
      ${total === 0 ? `
        <div class="empty-state" style="margin-top:12px;">
          <div class="empty-state-icon">✅</div>
          ${t('msgs.sin_autoinicio')}
        </div>` : ''}
    </div>`;

  const filasReg = reg.length
    ? reg.map(e => {
        const impacto = impactoEntrada(e);
        return `<tr>
          <td>${e.origen}</td>
          <td>${e.nombre}</td>
          <td class="cmd-cell"><span class="cmd-short" title="${e.comando}">${e.comando}</span></td>
          <td>${badge(impacto, impacto === 'alto' ? 'danger' : impacto === 'medio' ? 'warn' : 'ok')}</td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="4">
        <div class="empty-state" style="border:none;padding:16px;">
          <div class="empty-state-icon">✅</div>
          ${t('msgs.sin_autoinicio')}
        </div>
      </td></tr>`;

  const filasTareas = tareas.slice(0, 30).map(t =>
    `<tr><td>${t.nombre}</td><td>${t.estado}</td><td>${t.siguiente_ejecucion || '—'}</td></tr>`
  ).join('');

  const avanzado = `
    <div class="vista-avanzada">
      <h3 style="margin:0 0 8px;font-size:13px;color:var(--text-dim);">${t('tabla.reg_title')}</h3>
      <table>
        <thead><tr><th>${t('tabla.origen')}</th><th>${t('tabla.nombre')}</th><th>${t('tabla.comando')}</th><th>${t('tabla.impacto')}</th></tr></thead>
        <tbody>${filasReg}</tbody>
      </table>
      <h3 style="margin:16px 0 8px;font-size:13px;color:var(--text-dim);">${t('tabla.tareas_title')}</h3>
      <table>
        <thead><tr><th>${t('tabla.nombre')}</th><th>${t('tabla.estado')}</th><th>${t('tabla.prox_ejec')}</th></tr></thead>
        <tbody>${filasTareas || `<tr><td colspan="3">
          <div class="empty-state" style="border:none;padding:14px;">
            <div class="empty-state-icon">🗓️</div>
            ${t('msgs.sin_tareas')}
          </div>
        </td></tr>`}</tbody>
      </table>
    </div>`;

  return basico + avanzado;
}

function renderParches(data) {
  const pendientes  = data.actualizaciones_pendientes || [];
  const nivelCls    = data.sistema_actualizado ? 'ok' : pendientes.length > 5 ? 'danger' : 'warn';
  const timestamp   = new Date().toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });

  const basico = `
    <div class="vista-basica">
      <div class="escudos">
        ${escudo(
          data.sistema_actualizado ? '✅' : pendientes.length > 5 ? '🔴' : '⚠️',
          t('escudos.win_update'),
          data.sistema_actualizado,
          data.sistema_actualizado
            ? `${t('estados.actualizado')} · ${data.ultima_actualizacion_exitosa || ''}`
            : `${pendientes.length} ${t('msgs.pendientes')}`
        )}
      </div>
      <div class="scan-ts">${t('msgs.consultado')} ${timestamp}</div>
    </div>`;

  const avanzado = `
    <div class="vista-avanzada">
      <div class="status-row">
        <div>
          <div class="status-label">${t('escudos.win_update')}</div>
          <div class="status-desc">${t('msgs.ultima_act')} ${data.ultima_actualizacion_exitosa || '—'}</div>
        </div>
        ${data.sistema_actualizado
          ? badge(t('estados.actualizado'), 'ok')
          : badge(`${pendientes.length} ${t('msgs.pendientes')}`, 'warn')}
      </div>
      ${pendientes.length ? `
        <table style="margin-top:12px;">
          <thead><tr><th>${t('tabla.kb')}</th><th>${t('tabla.titulo')}</th><th>${t('tabla.reinicio')}</th></tr></thead>
          <tbody>${pendientes.map(p => `
            <tr>
              <td>${p.kb || '—'}</td>
              <td>${p.titulo || p.title || '—'}</td>
              <td>${p.reinicio_requerido || p.obligatoria ? badge(t('tabla.reinicio_req'), 'warn') : '—'}</td>
            </tr>`).join('')}
          </tbody>
        </table>` : `
        <div class="empty-state">
          <div class="empty-state-icon">✅</div>
          ${t('msgs.sin_parches')}
        </div>`}
      <div class="scan-ts">${t('msgs.consultado')} ${timestamp}</div>
    </div>`;

  return basico + avanzado;
}

// ── Función principal de escaneo ──────────────────────────────────────────────

async function escanear(action, btnId, resultadoId, renderer) {
  const btn = document.getElementById(btnId);
  const div = document.getElementById(resultadoId);
  btn.disabled = true;
  setLoading(true, t('estados.analizando'));
  try {
    const resultado = await invoke('audit', { action });

    if (!resultado.ok) {
      div.innerHTML = `<p style="color:var(--danger);margin-top:10px;">Error del escáner: ${resultado.error}</p>`;
      showToast(t('estados.error'), 'danger', 3000);
    } else {
      window.ULTIMO_SCAN = window.ULTIMO_SCAN || {};
      if (action === 'scan_ports')     window.ULTIMO_SCAN.puertos  = resultado.data;
      if (action === 'scan_processes') window.ULTIMO_SCAN.procesos = resultado.data;

      const tarjetaInfo = window.SIMULADOR?.activo ? window.SIMULADOR.tarjeta(action) : null;
      const tarjetaHtml = tarjetaInfo ? window.SIMULADOR.renderTarjeta(tarjetaInfo) : '';

      div.innerHTML = renderer(resultado.data) + tarjetaHtml;
      actualizarTimestamp();
      showToast(t('estados.completado'), 'ok', 2500);
      // Notificar a background.js que se ha completado un escaneo real para actualizar
      // el timestamp de último análisis en localStorage y ocultar el banner de recordatorio
      if (window.ESTICC_BG) window.ESTICC_BG.registrarEscaneo();
    }
  } catch (e) {
    div.innerHTML = `<p style="color:var(--danger);margin-top:10px;">Error de comunicación: ${e}</p>`;
    showToast(t('estados.error_com'), 'danger', 3500);
  } finally {
    btn.disabled = false;
    setLoading(false);
  }
}

// ── Conexión de botones ───────────────────────────────────────────────────────

document.getElementById('btn-defensas').addEventListener('click',  () => escanear('scan_defenses', 'btn-defensas',  'resultado-defensas',  renderDefensas));
document.getElementById('btn-puertos').addEventListener('click',   () => escanear('scan_ports',    'btn-puertos',   'resultado-puertos',   renderPuertos));
document.getElementById('btn-procesos').addEventListener('click',  () => escanear('scan_processes','btn-procesos',  'resultado-procesos',  renderProcesos));
document.getElementById('btn-autoinicio').addEventListener('click',() => escanear('scan_startup',  'btn-autoinicio','resultado-autoinicio', renderAutoinicio));
document.getElementById('btn-parches').addEventListener('click',   () => escanear('scan_patches',  'btn-parches',   'resultado-parches',   renderParches));

/**
 * window.escanearTodo() — Ejecuta los 5 escáneres en secuencia usando await.
 * Es necesario usar await en cada llamada para que el sidecar Python reciba
 * una petición a la vez y no se saturen los pipes de comunicación IPC.
 * background.js llama a esta función cuando autoscan_inicio = true en la config.
 * Al ser async, el llamante puede hacer: await window.escanearTodo() para saber
 * cuándo han terminado todos los escáneres.
 */
window.escanearTodo = async function () {
  await escanear('scan_defenses', 'btn-defensas',  'resultado-defensas',  renderDefensas);   // 1. Defensas (Firewall, AV, BitLocker)
  await escanear('scan_ports',    'btn-puertos',   'resultado-puertos',   renderPuertos);    // 2. Puertos TCP abiertos
  await escanear('scan_processes','btn-procesos',  'resultado-procesos',  renderProcesos);   // 3. Procesos activos (CPU/RAM)
  await escanear('scan_startup',  'btn-autoinicio','resultado-autoinicio', renderAutoinicio); // 4. Registro Run/RunOnce + tareas
  await escanear('scan_patches',  'btn-parches',   'resultado-parches',   renderParches);    // 5. Actualizaciones pendientes
};
