/**
 * background.js — Orquestador de avisos temporales y escaneo silencioso.
 *
 * Implementa dos comportamientos al iniciar la aplicación:
 *
 *  1. AUTO-SCAN (si autoscan_inicio = true en config):
 *     Espera a que auditoria.js registre window.escanearTodo y lo llama automáticamente.
 *     El usuario ve un toast de "Iniciando análisis automático…" y los paneles se rellenan
 *     solos sin necesidad de pulsar ningún botón.
 *
 *  2. RECORDATORIO (si autoscan_inicio = false):
 *     Calcula los días desde el último escaneo (guardado en localStorage por auditoria.js).
 *     Si supera el umbral configurado (recordatorio_dias), muestra un banner amarillo no
 *     intrusivo en la parte superior del área de contenido con un botón "Analizar ahora".
 *
 *  Comprobación periódica: cada 30 minutos mientras la app esté abierta, repite la
 *  comprobación del recordatorio por si el usuario la tiene abierta todo el día.
 */

(function () {
  'use strict';  // Modo estricto: evita errores silenciosos como variables no declaradas

  // ── Constantes ───────────────────────────────────────────────────────────────

  const STORAGE_LAST_SCAN = 'esticc_last_scan';  // Clave localStorage con la fecha ISO del último escaneo
  const CONFIG_KEY        = 'esticc_config';      // Clave localStorage de la configuración del usuario
  const CHECK_INTERVAL_MS = 30 * 60 * 1000;       // 30 min en ms: intervalo de comprobación periódica

  // ── Helpers de acceso a datos persistentes ───────────────────────────────────

  /**
   * leerConfig() — Lee y parsea la configuración del usuario desde localStorage.
   * Devuelve {} si no hay config (primera vez) o si el JSON está corrupto.
   * background.js usa su propio lector en lugar de depender de config.js para
   * poder cargarse de forma independiente y sin acoplamiento circular.
   */
  function leerConfig() {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);  // Leer el string JSON guardado
      return raw ? JSON.parse(raw) : {};              // Parsear o devolver objeto vacío
    } catch (_) { return {}; }  // SyntaxError si el JSON está corrupto: fallback a vacío
  }

  /**
   * leerUltimoEscaneo() — Devuelve la fecha ISO del último escaneo exitoso, o null.
   * Este valor lo escribe window.ESTICC_BG.registrarEscaneo() cada vez que auditoria.js
   * completa un escaneo correctamente.
   */
  function leerUltimoEscaneo() {
    return localStorage.getItem(STORAGE_LAST_SCAN) || null;  // null si nunca se ha escaneado
  }

  /**
   * diasDesde(isoStr) — Calcula los días transcurridos desde una fecha ISO.
   * Devuelve Infinity si isoStr es null/undefined, lo que garantiza que la
   * condición "dias > umbral" siempre sea verdadera cuando nunca se ha escaneado.
   * Divide los milisegundos entre el número de ms en un día (1000 * 60 * 60 * 24).
   */
  function diasDesde(isoStr) {
    if (!isoStr) return Infinity;                              // Sin fecha → tiempo infinito
    const ms = Date.now() - new Date(isoStr).getTime();        // Diferencia en milisegundos
    return ms / (1000 * 60 * 60 * 24);                        // Convertir a días decimales
  }

  // ── Banner de recordatorio ───────────────────────────────────────────────────

  // Flag para no mostrar el banner múltiples veces en la misma sesión si comprobar()
  // se llama varias veces (comprobación periódica + comprobación inicial).
  let bannerYaMostrado = false;

  /**
   * mostrarBannerRecordatorio(dias) — Rellena y hace visible el banner amarillo.
   * El banner HTML ya existe en index.html con display:none; este método lo activa.
   * El mensaje usa t() para respetar el idioma activo: "Hace 7 días sin analizar el sistema."
   */
  function mostrarBannerRecordatorio(dias) {
    if (bannerYaMostrado) return;  // Evitar mostrar el banner dos veces en la misma sesión

    const banner = document.getElementById('banner-recordatorio');  // El div del banner en el HTML
    if (!banner) return;  // Salida segura si el panel de recordatorio no existe en el DOM

    const diasEntero = Math.floor(dias);  // Redondear hacia abajo: "Hace 7 días" en vez de "7.3 días"
    const msg = document.getElementById('banner-rec-msg');  // El <span> donde se escribe el mensaje
    if (msg) {
      // Construir el mensaje a partir de las cadenas del sistema i18n para respetar el idioma activo
      msg.textContent = `${t('bg.banner_hace')} ${diasEntero} ${t('bg.banner_dias_sin')}`;
    }

    banner.style.display = 'flex';   // Hacer visible el banner (flex para alinear sus hijos)
    bannerYaMostrado = true;          // Marcar como mostrado para no repetirlo en esta sesión
  }

  /**
   * ocultarBannerRecordatorio() — Oculta el banner sin eliminarlo del DOM.
   * Se llama cuando el usuario pulsa "Ignorar", "Analizar ahora" o cuando
   * registrarEscaneo() confirma que el usuario ya ha analizado.
   */
  function ocultarBannerRecordatorio() {
    const banner = document.getElementById('banner-recordatorio');
    if (banner) banner.style.display = 'none';  // Ocultar pero mantener en el DOM para reutilizar
  }

  // ── Escaneo automático completo ──────────────────────────────────────────────

  /**
   * lanzarAutoScan() — Llama a window.escanearTodo() para ejecutar los 5 escáneres en secuencia.
   *
   * Por qué esperar con un bucle:
   * background.js se carga ANTES de auditoria.js en el HTML (es necesario para escuchar
   * DOMContentLoaded antes de que auditoria.js conecte sus botones). Pero window.escanearTodo
   * lo define auditoria.js al final de su carga. El bucle de polling (máx 2 segundos = 20 × 100ms)
   * garantiza que cuando el DOMContentLoaded + setTimeout(800ms) se dispara, auditoria.js ya
   * haya tenido tiempo de registrar la función.
   */
  async function lanzarAutoScan() {
    let intentos = 0;
    // Esperar hasta que auditoria.js registre window.escanearTodo (máximo 2 segundos)
    while (typeof window.escanearTodo !== 'function' && intentos < 20) {
      await new Promise(r => setTimeout(r, 100));  // Esperar 100 ms entre comprobaciones
      intentos++;
    }
    if (typeof window.escanearTodo !== 'function') return;  // Timeout: no se puede auto-escanear

    // Mostrar toast de inicio solo si auditoria.js ya ha definido showToast
    if (typeof showToast === 'function') {
      showToast(t('bg.autoscan_inicio'), 'loading', 0);  // Toast sin auto-cierre (duracion=0)
    }

    try {
      await window.escanearTodo();  // Ejecutar los 5 escáneres en secuencia y esperar a que terminen

      // Mostrar toast de éxito cuando todos los escáneres han completado
      if (typeof showToast === 'function') {
        showToast(t('bg.autoscan_ok'), 'ok', 3000);  // Auto-cierre en 3 segundos
      }
    } catch (_) {}  // Silenciar errores: escanear() ya los maneja y muestra su propio toast de error
  }

  // ── Comprobación de recordatorio ─────────────────────────────────────────────

  /**
   * comprobar() — Evalúa si hay que mostrar el banner de recordatorio.
   * Se llama en dos momentos: al iniciar la app y periódicamente cada 30 minutos.
   * El modo demo queda excluido: no tiene sentido recordar análisis reales en él.
   * Convierte recordatorioDias a Number() porque puede llegar como string desde el <select>.
   */
  function comprobar() {
    if (window.SIMULADOR?.activo) return;  // No interrumpir sesiones de demostración educativa

    const cfg              = leerConfig();                  // Leer config actual del usuario
    const recordatorioDias = cfg.recordatorio_dias ?? 7;    // Umbral configurado (7 días por defecto)
    const lastScan         = leerUltimoEscaneo();           // Fecha ISO del último escaneo (o null)
    const dias             = diasDesde(lastScan);           // Días transcurridos (Infinity si nunca)

    // Solo mostrar banner si el recordatorio no está desactivado ('nunca') Y se ha superado el umbral
    if (recordatorioDias !== 'nunca' && dias > Number(recordatorioDias)) {
      mostrarBannerRecordatorio(dias);  // Mostrar banner con el número de días exacto
    }
  }

  // ── Inicialización tras carga del DOM ────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', () => {
    const cfg = leerConfig();  // Leer configuración para decidir el comportamiento de inicio

    // ── Botón "Analizar ahora" del banner ────────────────────────────────────────
    const btnAnalizar = document.getElementById('btn-banner-rec-analizar');
    if (btnAnalizar) {
      btnAnalizar.addEventListener('click', () => {
        ocultarBannerRecordatorio();   // Ocultar el banner inmediatamente al pulsar
        bannerYaMostrado = false;      // Resetear el flag para que pueda aparecer de nuevo si es necesario

        // Lanzar escaneo completo o, si no está disponible, activar solo el primer botón
        if (typeof window.escanearTodo === 'function') {
          window.escanearTodo();  // Escaneo completo de los 5 módulos
        } else {
          const btn = document.getElementById('btn-defensas');  // Fallback: solo defensas
          if (btn) btn.click();
        }
      });
    }

    // ── Botón "Ignorar" del banner ───────────────────────────────────────────────
    const btnCerrar = document.getElementById('btn-banner-rec-cerrar');
    if (btnCerrar) {
      btnCerrar.addEventListener('click', () => {
        ocultarBannerRecordatorio();  // Simplemente ocultar; no reseteamos bannerYaMostrado
        // Nota: bannerYaMostrado sigue en true, así que no volverá a aparecer
        // hasta la próxima comprobación periódica (30 min) que lo reseteará en comprobar()
      });
    }

    // ── Decisión de inicio (tras 800ms para que todos los scripts se registren) ──
    // El setTimeout garantiza que auditoria.js, config.js y radar.js hayan terminado
    // de ejecutar su propio DOMContentLoaded y registrado sus funciones globales.
    setTimeout(() => {
      if (cfg.autoscan_inicio && !window.SIMULADOR?.activo) {
        lanzarAutoScan();  // Modo automático: lanzar los 5 escáneres sin interacción del usuario
      } else {
        comprobar();       // Modo normal: verificar si hay que mostrar el recordatorio
      }
    }, 800);  // 800ms de margen: suficiente para scripts síncronos, mínimo para el usuario

    // ── Comprobación periódica durante la sesión ─────────────────────────────────
    // Para sesiones largas (el usuario deja la app abierta todo el día), repetir la
    // comprobación cada 30 minutos por si el umbral se supera durante la sesión.
    setInterval(comprobar, CHECK_INTERVAL_MS);
  });

  // ── API pública: window.ESTICC_BG ────────────────────────────────────────────

  /**
   * window.ESTICC_BG.registrarEscaneo() — Llamado por auditoria.js tras cada escaneo exitoso.
   * Guarda la fecha y hora actual en localStorage como marca temporal del último análisis.
   * Además oculta el banner si estaba visible, ya que el usuario acaba de cumplir con el análisis.
   * new Date().toISOString() produce un string como "2026-05-25T14:30:00.000Z" que diasDesde() puede parsear.
   */
  window.ESTICC_BG = {
    registrarEscaneo() {
      localStorage.setItem(STORAGE_LAST_SCAN, new Date().toISOString());  // Guardar timestamp en ISO 8601
      ocultarBannerRecordatorio();  // Ocultar el banner porque ya se ha analizado
      bannerYaMostrado = false;     // Resetear el flag para que pueda reaparecer en la próxima sesión
    },
  };

})();  // IIFE: aisla el estado interno (bannerYaMostrado, constantes) del namespace global
