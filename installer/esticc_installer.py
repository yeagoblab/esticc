#!/usr/bin/env python3
"""
ESTICC Installer
================
Instalador gráfico para Windows que:
  1. Comprueba los requisitos del sistema (SO, RAM, disco, Internet, WebView2).
  2. Descarga la última versión de ESTICC desde GitHub Releases.
  3. Extrae los archivos en %LOCALAPPDATA%\\ESTICC\\ (sin permisos de administrador).
  4. Crea accesos directos en el Escritorio y en el Menú de Inicio.

Todo el código usa únicamente la biblioteca estándar de Python (stdlib),
por lo que no hace falta instalar ningún paquete adicional antes de compilar
con PyInstaller.
"""

# ── Importaciones de la biblioteca estándar ──────────────────────────────────

import tkinter as tk                  # Framework de interfaz gráfica incluido en Python
from tkinter import ttk, messagebox   # Widgets temáticos (barra de progreso) y diálogos
import threading                      # Hilo de fondo para no bloquear la UI durante la instalación
import sys                            # Información del intérprete y del sistema operativo Windows
import os                             # Variables de entorno (LOCALAPPDATA, APPDATA, etc.)
import subprocess                     # Ejecutar comandos externos (PowerShell, msiexec)
import ctypes                         # Llamadas a la API Win32 para leer la RAM del sistema
import ctypes.wintypes                # Tipos de datos de Windows usados con ctypes
import tempfile                       # Crear carpetas temporales para la descarga
import urllib.request                 # Descargar archivos y consultar la API de GitHub
import urllib.error                   # Capturar errores HTTP (404, timeout, etc.)
import json                           # Parsear la respuesta JSON de la API de GitHub Releases
import shutil                         # Copiar archivos, calcular espacio en disco, borrar carpetas
import time                           # Calcular la velocidad de descarga (bytes / segundos)
import winreg                         # Leer el Registro de Windows para detectar WebView2
import zipfile                        # Descomprimir el archivo ZIP descargado de GitHub
from pathlib import Path              # Rutas de ficheros orientadas a objetos (más seguras que strings)


# ── Constantes de la aplicación ──────────────────────────────────────────────

APP_NAME       = "ESTICC"                                          # Nombre de la aplicación, usado en títulos y mensajes
APP_VERSION    = "1.0"                                             # Versión del propio instalador (no de ESTICC)
GITHUB_REPO    = "yeagoblab/esticc"                                # Repositorio GitHub en formato usuario/repositorio
GITHUB_API_URL = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"  # Endpoint REST para obtener la última release

# Variables de entorno de Windows con valores de respaldo para sistemas no estándar
LOCALAPPDATA = Path(os.environ.get("LOCALAPPDATA", r"C:\Users\Default\AppData\Local"))
APPDATA      = Path(os.environ.get("APPDATA",      r"C:\Users\Default\AppData\Roaming"))
USERPROFILE  = Path(os.environ.get("USERPROFILE",  r"C:\Users\Default"))

INSTALL_DIR    = LOCALAPPDATA / "ESTICC"                           # Carpeta de instalación: no requiere permisos de admin
START_MENU_DIR = APPDATA / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "ESTICC"  # Carpeta del Menú de Inicio del usuario actual
DESKTOP_DIR    = USERPROFILE / "Desktop"                           # Escritorio del usuario actual

MIN_RAM_GB    = 2                                                  # RAM mínima requerida en gigabytes
MIN_DISK_GB   = 0.5                                                # Espacio libre mínimo en disco en gigabytes
MIN_WIN_BUILD = 17763                                              # Build mínima de Windows 10 (versión 1809, octubre 2018)

# Claves del Registro donde Windows registra el WebView2 Runtime (motor web de Tauri)
WEBVIEW2_KEYS = [
    (winreg.HKEY_LOCAL_MACHINE,                                    # Primero buscamos en la instalación global (para todos los usuarios)
     r"SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"),
    (winreg.HKEY_CURRENT_USER,                                     # Si no está global, buscamos en la instalación solo para este usuario
     r"SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"),
]


# ── Paleta de colores del tema visual de ESTICC ──────────────────────────────

BG       = "#0d1117"   # Fondo principal: negro azulado oscuro (idéntico al tema de GitHub Dark)
BG2      = "#161b22"   # Fondo secundario: usado en la cabecera y la barra de scroll
BG3      = "#21262d"   # Fondo terciario: área del log de mensajes
ACCENT   = "#1f6feb"   # Azul de acento: botón principal, barra de progreso, título
SUCCESS  = "#3fb950"   # Verde éxito: mensajes ✓ y botón "Cerrar" al finalizar
ERR_COL  = "#f85149"   # Rojo error: mensajes de fallo y estado de error
WARN_COL = "#d29922"   # Amarillo advertencia: mensajes no fatales (p. ej. WebView2 ausente)
TEXT     = "#e6edf3"   # Texto principal claro sobre fondo oscuro
TEXT_DIM = "#8b949e"   # Texto secundario atenuado: log informativo, subtítulo de cabecera


# ── Excepción personalizada ───────────────────────────────────────────────────

class InstallError(Exception):
    """
    Se lanza cuando un paso de la instalación falla de forma controlada.
    El mensaje que se pasa al constructor es el texto que verá el usuario
    en el diálogo de error, así que debe estar redactado de forma clara y
    sin jerga técnica.
    """


# ── Clase principal del instalador ───────────────────────────────────────────

class ESICCInstaller:
    """
    Controla toda la interfaz gráfica y el flujo de instalación.

    La UI se construye en el hilo principal (requerimiento de tkinter).
    La instalación (comprobaciones, descarga, extracción, accesos directos)
    se ejecuta en un hilo de fondo para que la ventana nunca se congele.
    Todos los métodos que actualizan la UI desde ese hilo de fondo usan
    self.root.after(0, ...) para delegar la actualización al hilo principal.
    """

    def __init__(self):
        """Inicializa la ventana principal y todas las variables de estado."""

        self.root = tk.Tk()                                   # Crea la ventana raíz de tkinter
        self.root.title(f"{APP_NAME} — Instalador")           # Título de la barra de la ventana
        self.root.geometry("640x500")                         # Tamaño fijo de la ventana en píxeles
        self.root.resizable(False, False)                     # Impide que el usuario cambie el tamaño
        self.root.configure(bg=BG)                            # Color de fondo de la ventana
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)  # Intercepta el botón X para preguntar si cancelar

        # Centrar la ventana en la pantalla
        self.root.update_idletasks()                          # Fuerza el cálculo de las dimensiones reales
        sw = self.root.winfo_screenwidth()                    # Ancho total de la pantalla en píxeles
        sh = self.root.winfo_screenheight()                   # Alto total de la pantalla en píxeles
        self.root.geometry(f"640x500+{(sw-640)//2}+{(sh-500)//2}")  # Reposiciona la ventana en el centro exacto

        # Variables de estado del proceso de instalación
        self._installing = False   # True mientras el hilo de instalación está activo
        self._cancel     = False   # Se pone a True cuando el usuario cancela; el hilo lo comprueba
        self._tmp_dir    = None    # Path a la carpeta temporal de descarga; se borra al terminar

        self._build_ui()           # Construye todos los widgets de la interfaz gráfica


    # ── Construcción de la interfaz ───────────────────────────────────────────

    def _build_ui(self):
        """
        Construye todos los widgets de la ventana:
        cabecera, etiqueta de estado, barra de progreso, área de log y botones.
        """

        # ── Cabecera ──────────────────────────────────────────────────────────
        hdr = tk.Frame(self.root, bg=BG2, height=76)          # Frame de fondo oscuro para la cabecera
        hdr.pack(fill=tk.X)                                   # Ocupa todo el ancho de la ventana
        hdr.pack_propagate(False)                             # Respeta la altura fija de 76 px aunque los hijos sean más pequeños

        tk.Label(hdr, text="ESTICC", font=("Segoe UI", 22, "bold"),
                 bg=BG2, fg=ACCENT).pack(side=tk.LEFT, padx=22, pady=18)   # Logotipo textual en azul acento

        tk.Label(hdr, text="Panel de Seguridad  ·  Instalador",
                 font=("Segoe UI", 10), bg=BG2, fg=TEXT_DIM).pack(side=tk.LEFT, pady=30)  # Subtítulo atenuado

        # ── Cuerpo principal ──────────────────────────────────────────────────
        body = tk.Frame(self.root, bg=BG, padx=24, pady=14)   # Contenedor central con margen interior
        body.pack(fill=tk.BOTH, expand=True)                  # Ocupa todo el espacio disponible entre cabecera y botones

        # Etiqueta de estado: muestra la acción en curso ("Descargando...", "Instalando...", etc.)
        self._status_var = tk.StringVar(value="Listo para instalar ESTICC en tu equipo.")  # Variable de texto observable
        self._status_lbl = tk.Label(
            body, textvariable=self._status_var,              # Se actualiza automáticamente al cambiar _status_var
            font=("Segoe UI", 11), bg=BG, fg=TEXT,
            anchor="w",                                       # Alineación a la izquierda
            wraplength=580,                                   # Salto de línea automático si el texto supera 580 px
            justify=tk.LEFT
        )
        self._status_lbl.pack(fill=tk.X, pady=(0, 8))

        # ── Barra de progreso ─────────────────────────────────────────────────
        sty = ttk.Style()
        sty.theme_use("clam")                                 # "clam" permite personalizar colores en ttk
        sty.configure(
            "E.Horizontal.TProgressbar",                      # Nombre del estilo personalizado
            troughcolor=BG2,                                  # Color del fondo (parte vacía) de la barra
            background=ACCENT,                                # Color del relleno (parte llena) de la barra
            bordercolor=BG2,                                  # Sin borde visible
            lightcolor=ACCENT,                                # Evita el degradado claro de ttk por defecto
            darkcolor=ACCENT                                  # Evita el degradado oscuro de ttk por defecto
        )
        self._pb = ttk.Progressbar(
            body, style="E.Horizontal.TProgressbar",
            length=590,                                       # Anchura en píxeles
            mode="determinate"                                # Modo determinado: muestra porcentaje 0-100
        )
        self._pb.pack(fill=tk.X)

        self._pb_lbl = tk.Label(body, text="", font=("Segoe UI", 9), bg=BG, fg=TEXT_DIM)
        self._pb_lbl.pack(anchor="e", pady=(2, 10))           # Etiqueta de detalle (MB/s, contador) alineada a la derecha

        # ── Área de log ───────────────────────────────────────────────────────
        log_frame = tk.Frame(body, bg=BG3)                    # Contenedor del log con fondo ligeramente más claro
        log_frame.pack(fill=tk.BOTH, expand=True)

        sb = tk.Scrollbar(log_frame, bg=BG2, troughcolor=BG)  # Barra de desplazamiento vertical
        sb.pack(side=tk.RIGHT, fill=tk.Y)

        self._log_txt = tk.Text(
            log_frame, bg=BG3, fg=TEXT_DIM,
            font=("Consolas", 9),                             # Fuente monoespaciada para el log
            height=9,                                         # Altura inicial en líneas de texto
            bd=0, relief=tk.FLAT,                             # Sin borde decorativo
            state=tk.DISABLED,                                # Solo lectura: el usuario no puede editar el log
            yscrollcommand=sb.set,                            # Sincroniza el scroll con la barra
            padx=10, pady=8
        )
        self._log_txt.pack(fill=tk.BOTH, expand=True)
        sb.config(command=self._log_txt.yview)                # Sincroniza el yview del texto con la barra

        # Colores de las diferentes categorías de mensajes en el log
        self._log_txt.tag_config("ok",   foreground=SUCCESS)  # Verde: operación exitosa
        self._log_txt.tag_config("err",  foreground=ERR_COL)  # Rojo: error fatal
        self._log_txt.tag_config("warn", foreground=WARN_COL) # Amarillo: advertencia no fatal
        self._log_txt.tag_config("info", foreground=TEXT_DIM) # Gris: mensaje informativo neutral
        self._log_txt.tag_config("hdr",  foreground=TEXT)     # Blanco: cabecera de sección

        # ── Fila de botones ───────────────────────────────────────────────────
        btn_row = tk.Frame(self.root, bg=BG, padx=24, pady=10)
        btn_row.pack(fill=tk.X)                               # Fija la fila de botones en la parte inferior

        self._install_btn = tk.Button(
            btn_row, text="  Instalar ESTICC  ",
            font=("Segoe UI", 10, "bold"),
            bg=ACCENT, fg="white",
            activebackground="#388bfd", activeforeground="white",  # Color al pasar el ratón por encima
            bd=0, padx=14, pady=8,
            cursor="hand2",                                   # Cursor de mano al posicionarse sobre el botón
            command=self._start_install                       # Inicia el proceso cuando se hace clic
        )
        self._install_btn.pack(side=tk.LEFT)

        self._cancel_btn = tk.Button(
            btn_row, text="Cancelar",
            font=("Segoe UI", 10),
            bg=BG2, fg=TEXT_DIM,
            activebackground=BG3, activeforeground=TEXT,
            bd=0, padx=14, pady=8,
            cursor="hand2",
            command=self._on_close                            # Pide confirmación y cierra si el usuario acepta
        )
        self._cancel_btn.pack(side=tk.LEFT, padx=8)

        # Mensajes iniciales en el log al arrancar el instalador
        self._log(
            f"Sistema detectado: Windows {sys.getwindowsversion().major}"
            f".{sys.getwindowsversion().minor} (build {sys.getwindowsversion().build})",
            "info"
        )
        self._log(f"Instalación en: {INSTALL_DIR}", "info")
        self._log("Haz clic en 'Instalar ESTICC' para comenzar.", "info")


    # ── Métodos auxiliares de UI (seguros desde hilos de fondo) ──────────────

    def _log(self, msg: str, tag: str = "info"):
        """
        Añade una línea de texto al área de log.

        Usa root.after(0, ...) para que la actualización del widget
        siempre se ejecute en el hilo principal de tkinter, incluso cuando
        se llama desde el hilo de instalación en segundo plano.

        Args:
            msg: Texto a mostrar.
            tag: Categoría de color ("ok", "err", "warn", "info", "hdr").
        """
        def _do():
            self._log_txt.config(state=tk.NORMAL)             # Desbloquea el widget para poder escribir
            self._log_txt.insert(tk.END, f"  {msg}\n", tag)  # Inserta el mensaje al final con el color del tag
            self._log_txt.see(tk.END)                         # Desplaza el scroll hasta la última línea
            self._log_txt.config(state=tk.DISABLED)           # Vuelve a bloquear el widget (solo lectura)
        self.root.after(0, _do)                               # Encola la función en el bucle de eventos de tkinter

    def _set_status(self, msg: str, color: str = TEXT):
        """
        Actualiza el texto y el color de la etiqueta de estado principal.

        Args:
            msg:   Texto descriptivo de la acción en curso.
            color: Color hexadecimal del texto (por defecto blanco claro).
        """
        self.root.after(0, lambda: (
            self._status_var.set(msg),                        # Cambia el texto de la etiqueta
            self._status_lbl.config(fg=color)                 # Cambia el color (verde en éxito, rojo en error)
        ))

    def _set_pb(self, value: float, label: str = ""):
        """
        Actualiza el valor de la barra de progreso y su etiqueta de detalle.

        Args:
            value: Porcentaje de progreso de 0 a 100.
            label: Texto descriptivo (p. ej. "12.3 / 45.0 MB · 3.2 MB/s").
        """
        def _do():
            self._pb["value"] = value                         # Mueve la barra al porcentaje indicado
            self._pb_lbl.config(text=label)                   # Actualiza el texto de detalle bajo la barra
        self.root.after(0, _do)


    # ── Inicio y coordinación del flujo de instalación ────────────────────────

    def _start_install(self):
        """
        Se ejecuta al pulsar el botón "Instalar ESTICC".
        Desactiva el botón para evitar doble clic y lanza el hilo de instalación.
        """
        if self._installing:                                  # Evita iniciar una segunda instalación simultánea
            return
        self._installing = True                               # Marca que la instalación está en curso
        self.root.after(0, lambda: self._install_btn.config(
            state=tk.DISABLED, bg="#333940"                   # Oscurece el botón para indicar que está desactivado
        ))
        threading.Thread(
            target=self._install_flow,                        # Función que ejecuta el hilo de fondo
            daemon=True                                       # El hilo se termina automáticamente si se cierra la ventana
        ).start()

    def _install_flow(self):
        """
        Orquesta todas las fases de la instalación en el hilo de fondo.
        Si cualquier fase lanza InstallError, se muestra el error al usuario.
        Si se lanza cualquier otra excepción inesperada, también se captura y muestra.
        El bloque finally garantiza que _installing vuelve a False pase lo que pase.
        """
        try:
            self._phase_checks()                              # Fase 1: comprobar requisitos del sistema
            if self._cancel:                                  # Comprobar cancelación entre fases
                return
            zip_path = self._phase_download()                 # Fase 2: descargar el archivo de GitHub
            if self._cancel or not zip_path:                  # Comprobar cancelación y que la descarga tuvo éxito
                return
            self._phase_extract(zip_path)                     # Fase 3: extraer o ejecutar el instalador descargado
            if self._cancel:
                return
            self._phase_shortcuts()                           # Fase 4: crear accesos directos en Escritorio y Menú de Inicio
            self._on_success()                                # Mostrar pantalla de instalación completada
        except InstallError as exc:
            self._on_error(str(exc))                          # Error controlado: mostrar mensaje legible al usuario
        except Exception as exc:
            self._on_error(f"Error inesperado durante la instalación:\n{exc}")  # Error no previsto: mostrar detalle técnico
        finally:
            self._installing = False                          # Libera la bandera para permitir reintentos


    # ── Fase 1 — Comprobaciones del sistema (progreso 0 → 30 %) ──────────────

    def _phase_checks(self):
        """
        Ejecuta en secuencia todas las comprobaciones de requisitos.
        Cada comprobación devuelve (ok, detalle, es_fatal).
        Si es_fatal=True y ok=False, lanza InstallError y detiene la instalación.
        Si es_fatal=False y ok=False, solo muestra un aviso y continúa.
        """
        self._set_status("Verificando requisitos del sistema...")
        self._log("── Comprobando requisitos ──────────────────────────────", "hdr")

        # Lista de comprobaciones: (etiqueta, función, porcentaje de barra al completar)
        checks = [
            ("Windows 10 o superior",                  self._chk_windows,  6),
            (f"RAM disponible (mín. {MIN_RAM_GB} GB)", self._chk_ram,     12),
            (f"Espacio en disco (mín. {MIN_DISK_GB} GB)", self._chk_disk, 18),
            ("Conexión a Internet",                    self._chk_internet, 24),
            ("WebView2 Runtime (Tauri)",               self._chk_webview2, 30),
        ]

        for label, fn, pct in checks:
            if self._cancel:                                  # Salir si el usuario canceló mientras se comprobaba
                return
            self._log(f"  Verificando: {label}...", "info")
            ok, detail, fatal = fn()                          # Ejecutar la comprobación y obtener sus tres valores
            if ok:
                self._log(f"  ✓ {label}: {detail}", "ok")    # Requisito cumplido
            elif fatal:
                self._log(f"  ✗ {label}: {detail}", "err")   # Requisito no cumplido y bloqueante
                raise InstallError(
                    f"Requisito no cumplido: {label}\n\n{detail}"
                )
            else:
                self._log(f"  ! {label}: {detail}", "warn")  # Requisito no cumplido pero no bloqueante (aviso)
            self._set_pb(pct, f"{pct}%")                      # Avanzar la barra de progreso

        self._log("  Comprobación completada.", "ok")

    def _chk_windows(self):
        """
        Comprueba que el sistema operativo es Windows 10 build 17763 o superior.
        Windows 10 1809 es el mínimo porque es cuando WebView2 quedó bien integrado.
        Devuelve (ok, mensaje, es_fatal).
        """
        v = sys.getwindowsversion()                           # Obtiene major, minor y build del SO actual
        if v.major < 10:                                      # Windows 7, 8 o 8.1 no están soportados
            return False, (
                f"Windows {v.major} no está soportado. Se requiere Windows 10 (build {MIN_WIN_BUILD}+).\n"
                "Actualiza el sistema operativo antes de instalar ESTICC."
            ), True                                           # Fatal: no se puede instalar en versiones antiguas
        if v.build < MIN_WIN_BUILD:                           # Windows 10 demasiado antiguo (anterior a 1809)
            return False, (
                f"Build {v.build} demasiado antigua. Actualiza Windows "
                f"(mín. build {MIN_WIN_BUILD}, versión 1809)."
            ), True
        return True, f"Windows {v.major}.{v.minor} build {v.build}", False  # Todo correcto

    def _chk_ram(self):
        """
        Comprueba la RAM física total del sistema usando la API Win32 GlobalMemoryStatusEx.
        No usa psutil para evitar dependencias externas.
        Devuelve (ok, mensaje, es_fatal).
        """
        try:
            # Estructura C que rellena GlobalMemoryStatusEx con información de memoria
            class _MEM(ctypes.Structure):
                _fields_ = [
                    ("dwLength",                ctypes.c_ulong),      # Tamaño de la estructura (se rellena manualmente)
                    ("dwMemoryLoad",            ctypes.c_ulong),      # Porcentaje de memoria en uso
                    ("ullTotalPhys",            ctypes.c_ulonglong),  # RAM física total en bytes
                    ("ullAvailPhys",            ctypes.c_ulonglong),  # RAM física disponible en bytes
                    ("ullTotalPageFile",        ctypes.c_ulonglong),  # Tamaño total del archivo de paginación
                    ("ullAvailPageFile",        ctypes.c_ulonglong),  # Espacio disponible en el archivo de paginación
                    ("ullTotalVirtual",         ctypes.c_ulonglong),  # Espacio de direcciones virtuales total
                    ("ullAvailVirtual",         ctypes.c_ulonglong),  # Espacio de direcciones virtuales disponible
                    ("ullAvailExtendedVirtual", ctypes.c_ulonglong),  # Reservado, siempre 0
                ]
            m = _MEM()
            m.dwLength = ctypes.sizeof(m)                             # GlobalMemoryStatusEx requiere que este campo valga el tamaño de la estructura
            ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(m))  # Llama a la API Win32 y rellena la estructura
            gb = m.ullTotalPhys / (1024 ** 3)                         # Convierte bytes a gigabytes
            if gb < MIN_RAM_GB:
                return False, (
                    f"Solo {gb:.1f} GB de RAM. ESTICC requiere al menos {MIN_RAM_GB} GB."
                ), True                                               # Fatal: el sistema no tiene RAM suficiente
            return True, f"{gb:.1f} GB de RAM", False
        except Exception as exc:
            # Si la API falla por algún motivo, no bloqueamos la instalación
            return True, f"No se pudo verificar (se asume OK): {exc}", False

    def _chk_disk(self):
        """
        Comprueba el espacio libre en la unidad del sistema (normalmente C:).
        Devuelve (ok, mensaje, es_fatal).
        """
        try:
            drive = Path(os.environ.get("SystemDrive", "C:") + "\\")  # Obtiene la letra de la unidad del sistema
            total, used, free = shutil.disk_usage(drive)               # total, usado, libre en bytes
            gb = free / (1024 ** 3)                                    # Convierte bytes a gigabytes
            if gb < MIN_DISK_GB:
                return False, (
                    f"Solo {gb:.1f} GB libres en {drive}. "
                    f"Se necesitan al menos {MIN_DISK_GB:.0f} GB."
                ), True
            return True, f"{gb:.1f} GB libres en {drive}", False
        except Exception as exc:
            return True, f"No se pudo verificar (se asume OK): {exc}", False

    def _chk_internet(self):
        """
        Comprueba la conectividad a Internet intentando llegar a api.github.com.
        Si el servidor responde en menos de 6 segundos, hay conexión.
        Devuelve (ok, mensaje, es_fatal).
        """
        try:
            req = urllib.request.Request(
                "https://api.github.com",
                headers={"User-Agent": "ESTICC-Installer/1.0"}  # GitHub requiere User-Agent para no rechazar la petición
            )
            urllib.request.urlopen(req, timeout=6)              # Lanza excepción si no hay respuesta en 6 segundos
            return True, "Conexión disponible", False
        except Exception:
            return False, (
                "No hay conexión a GitHub. Comprueba tu conexión a Internet "
                "y que ningún cortafuegos bloquee la descarga."
            ), True                                             # Fatal: sin Internet no se puede descargar ESTICC

    def _chk_webview2(self):
        """
        Comprueba si WebView2 Runtime está instalado buscando su clave en el Registro.
        WebView2 es el motor de navegador que usa Tauri para mostrar la interfaz de ESTICC.
        En Windows 11 siempre está presente. En Windows 10 puede faltar si nunca se instaló Edge.
        No es fatal: la instalación continúa pero se avisa al usuario.
        Devuelve (ok, mensaje, es_fatal).
        """
        for hive, path in WEBVIEW2_KEYS:                       # Comprueba primero la clave global y luego la de usuario
            try:
                with winreg.OpenKey(hive, path):               # Si la clave existe, WebView2 está instalado
                    return True, "WebView2 Runtime instalado", False
            except FileNotFoundError:
                continue                                        # La clave no existe en este hive, probar el siguiente
            except Exception:
                continue                                        # Error de acceso al Registro; probar el siguiente
        # No se encontró WebView2 en ninguna clave conocida
        return False, (
            "WebView2 Runtime no detectado. ESTICC podría no abrirse correctamente.\n"
            "Descárgalo gratis desde: https://developer.microsoft.com/microsoft-edge/webview2/\n"
            "(La instalación continuará, pero instala WebView2 si ESTICC no arranca.)"
        ), False                                                # No es fatal porque Windows 11 siempre lo tiene


    # ── Fase 2 — Descarga desde GitHub Releases (progreso 30 → 80 %) ─────────

    def _phase_download(self) -> Path:
        """
        Consulta la API de GitHub para obtener los datos de la última release
        y descarga el asset (ZIP o instalador) más adecuado para Windows.
        Actualiza la barra de progreso en tiempo real con MB descargados y velocidad.
        Devuelve la ruta local al archivo descargado.
        Lanza InstallError si no hay release publicada, si el asset no existe
        o si la descarga falla.
        """
        self._set_status("Consultando la última versión en GitHub...")
        self._log("── Descargando ESTICC ──────────────────────────────────", "hdr")
        self._log("  Obteniendo información de la última versión...", "info")

        # Llamada a la API REST de GitHub para obtener los metadatos de la última release
        try:
            req = urllib.request.Request(
                GITHUB_API_URL,
                headers={
                    "User-Agent": "ESTICC-Installer/1.0",
                    "Accept": "application/vnd.github+json"   # Cabecera recomendada por GitHub para la API v3
                }
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                release = json.loads(resp.read())              # Parsea el JSON de respuesta a un diccionario Python
        except urllib.error.HTTPError as exc:
            if exc.code == 404:                               # 404 significa que no existe ninguna release publicada
                raise InstallError(
                    "No se encontró ninguna versión publicada de ESTICC.\n\n"
                    f"Visita https://github.com/{GITHUB_REPO}/releases para más información."
                )
            raise InstallError(f"Error al consultar GitHub (HTTP {exc.code}): {exc.reason}")
        except Exception as exc:
            raise InstallError(f"No se pudo conectar con GitHub:\n{exc}")

        version = release.get("tag_name", "desconocida")      # Etiqueta de versión (p. ej. "v0.2.0")
        self._log(f"  Versión disponible: {version}", "ok")

        # Seleccionar el asset más apropiado de entre todos los adjuntos de la release
        assets = release.get("assets", [])                    # Lista de archivos adjuntos publicados en la release
        asset  = _pick_asset(assets)                          # Función auxiliar que elige el mejor asset para Windows

        if not asset:
            raise InstallError(
                f"La versión {version} no contiene un instalador binario para Windows.\n\n"
                f"Visita https://github.com/{GITHUB_REPO}/releases y descarga el ZIP manualmente."
            )

        dl_url  = asset["browser_download_url"]               # URL directa de descarga del asset
        dl_name = asset["name"]                               # Nombre del archivo (p. ej. "ESTICC_portable_win64.zip")
        dl_size = asset.get("size", 0)                        # Tamaño en bytes (0 si la API no lo informa)
        self._log(f"  Archivo: {dl_name}  ({dl_size/1024/1024:.1f} MB)", "info")

        # Crear carpeta temporal donde guardar el archivo descargado
        self._tmp_dir = Path(tempfile.mkdtemp(prefix="esticc_install_"))  # p. ej. C:\Users\...\AppData\Local\Temp\esticc_install_abc123
        dest = self._tmp_dir / dl_name                        # Ruta completa del archivo descargado

        self._log("  Descargando...", "info")
        self._set_status(f"Descargando ESTICC {version}...")

        downloaded = [0]                                      # Lista de un elemento para poder modificarlo desde la closure _hook
        t0 = time.time()                                      # Marca de tiempo de inicio para calcular la velocidad

        def _hook(count, block, total):
            """
            Callback que urlretrieve llama tras descargar cada bloque.
            Calcula el progreso y la velocidad y actualiza la barra de progreso.

            Args:
                count: Número de bloques descargados hasta ahora.
                block: Tamaño de cada bloque en bytes (normalmente 8 KB).
                total: Tamaño total del archivo en bytes (-1 si desconocido).
            """
            downloaded[0] = count * block                     # Bytes totales descargados hasta este momento
            if self._cancel:                                  # Si el usuario canceló, interrumpir la descarga
                raise InstallError("Instalación cancelada por el usuario.")
            elapsed = time.time() - t0 or 0.001              # Segundos transcurridos (mínimo 1 ms para evitar división por cero)
            mbps    = downloaded[0] / elapsed / 1024 / 1024  # Velocidad en MB/s
            if total > 0:                                     # Si conocemos el tamaño total, mostramos porcentaje
                pct      = min(downloaded[0] / total, 1.0)   # Fracción de 0.0 a 1.0, recortada en 1.0
                fill_pct = 30 + pct * 50                     # Mapear 0-100% de la descarga al rango 30-80% de la barra global
                label    = (f"{downloaded[0]/1024/1024:.1f} / "
                            f"{total/1024/1024:.1f} MB  ·  {mbps:.1f} MB/s")
            else:                                             # Si el tamaño es desconocido, mostrar solo lo descargado
                fill_pct = 55
                label    = f"{downloaded[0]/1024/1024:.1f} MB descargados  ·  {mbps:.1f} MB/s"
            self._set_pb(fill_pct, label)

        # Descargar el archivo; _hook se llama automáticamente cada bloque
        try:
            urllib.request.urlretrieve(dl_url, dest, _hook)
        except InstallError:
            raise                                             # Re-lanzar InstallError (cancelación del usuario)
        except Exception as exc:
            raise InstallError(
                f"Error durante la descarga:\n{exc}\n\n"
                "Comprueba tu conexión e inténtalo de nuevo."
            )

        self._log(f"  ✓ Descarga completada ({dest.stat().st_size/1024/1024:.1f} MB)", "ok")
        self._set_pb(80, "80%")
        return dest                                           # Devuelve la ruta al archivo descargado para la siguiente fase


    # ── Fase 3 — Extracción o ejecución del instalador (progreso 80 → 92 %) ──

    def _phase_extract(self, src: Path):
        """
        Instala los archivos de ESTICC a partir del archivo descargado.
        Soporta tres formatos:
          - .zip   → extrae directamente en INSTALL_DIR, detectando y aplanando la carpeta raíz.
          - .exe   → ejecuta el instalador NSIS en modo silencioso.
          - .msi   → ejecuta msiexec en modo silencioso.

        Args:
            src: Ruta local al archivo descargado por _phase_download.
        """
        self._set_status("Instalando archivos...")
        self._log("── Instalando archivos ─────────────────────────────────", "hdr")

        ext = src.suffix.lower()                              # Extensión del archivo: ".zip", ".exe" o ".msi"

        if ext == ".zip":
            # ── Extracción del ZIP portable ───────────────────────────────────
            self._log(f"  Extrayendo en {INSTALL_DIR} ...", "info")
            INSTALL_DIR.mkdir(parents=True, exist_ok=True)    # Crea la carpeta de instalación si no existe

            with zipfile.ZipFile(src, "r") as zf:
                members = zf.namelist()                       # Lista de todos los archivos y carpetas dentro del ZIP
                common  = _zip_root(members)                  # Detecta si hay una carpeta raíz común para aplanarla
                total   = len(members)                        # Número total de entradas para calcular el progreso

                for i, member in enumerate(members, 1):
                    if self._cancel:
                        raise InstallError("Instalación cancelada.")

                    rel = member[len(common):] if common else member  # Elimina el prefijo de la carpeta raíz común
                    if not rel:                               # La entrada era la propia carpeta raíz; saltar
                        continue

                    dest = INSTALL_DIR / rel                  # Ruta de destino final dentro de INSTALL_DIR

                    if member.endswith("/"):                  # Es una carpeta dentro del ZIP
                        dest.mkdir(parents=True, exist_ok=True)
                    else:                                     # Es un archivo
                        dest.parent.mkdir(parents=True, exist_ok=True)  # Asegura que la carpeta padre existe
                        with zf.open(member) as src_f, open(dest, "wb") as dst_f:
                            shutil.copyfileobj(src_f, dst_f) # Copia el contenido en bloques eficientemente

                    pct = 80 + (i / total) * 12              # Progresa del 80% al 92% a medida que se extraen archivos
                    self._set_pb(pct, f"Extrayendo  {i}/{total}")

            self._log(f"  ✓ Archivos extraídos en {INSTALL_DIR}", "ok")

        elif ext in (".exe", ".msi"):
            # ── Ejecución de instalador NSIS o MSI ───────────────────────────
            self._log(f"  Ejecutando instalador {src.name} ...", "info")
            if ext == ".msi":
                # /i      = instalar, /qb! = interfaz mínima sin preguntas, /norestart = no reiniciar sin avisar
                cmd = ["msiexec", "/i", str(src), "/qb!", "/norestart",
                       f"INSTALLDIR={INSTALL_DIR}"]
            else:
                # /S = silent (NSIS estándar), /D = directorio de instalación (debe ir al final y sin comillas)
                cmd = [str(src), "/S", f"/D={INSTALL_DIR}"]
            try:
                res = subprocess.run(cmd, capture_output=True, text=True, timeout=300)  # Espera hasta 5 minutos
                if res.returncode not in (0, 3010):           # 0 = éxito, 3010 = éxito pero requiere reinicio
                    detail = res.stderr.strip() or "(sin detalle)"
                    raise InstallError(
                        f"El instalador terminó con error (código {res.returncode}).\n\n"
                        f"Detalle técnico: {detail}\n\n"
                        "Intenta ejecutar el instalador manualmente o contacta con soporte."
                    )
                if res.returncode == 3010:                    # Instalación correcta, pero Windows necesita reiniciarse
                    self._log("  ! Se requiere reiniciar el equipo para finalizar.", "warn")
            except subprocess.TimeoutExpired:
                raise InstallError(
                    "La instalación tardó demasiado tiempo.\n"
                    "Puede que el instalador esté esperando una respuesta. "
                    "Revisa si hay ventanas ocultas en la barra de tareas."
                )
            self._log("  ✓ Instalador ejecutado correctamente.", "ok")

        else:
            raise InstallError(
                f"Tipo de archivo no reconocido: {ext}\n"
                "Solo se admiten .zip, .exe y .msi."
            )

        self._set_pb(92, "92%")


    # ── Fase 4 — Accesos directos (progreso 92 → 100 %) ──────────────────────

    def _phase_shortcuts(self):
        """
        Crea un acceso directo de ESTICC en el Escritorio y en el Menú de Inicio
        usando PowerShell y el objeto COM WScript.Shell (nativo de Windows).
        No requiere permisos de administrador porque usa las rutas del usuario actual.
        Si la creación de un acceso directo falla, muestra un aviso pero no detiene la instalación.
        """
        self._set_status("Creando accesos directos...")
        self._log("── Creando accesos directos ────────────────────────────", "hdr")

        # Buscar el ejecutable principal de ESTICC en la carpeta de instalación
        exe_path = INSTALL_DIR / "ESTICC.exe"
        if not exe_path.exists():                             # Si el nombre exacto no coincide, buscar cualquier .exe
            exes = list(INSTALL_DIR.glob("*.exe"))
            if exes:
                exe_path = exes[0]                            # Usar el primer .exe encontrado
            else:
                self._log("  ! No se encontró el ejecutable para crear accesos directos.", "warn")
                return                                        # Sin ejecutable no se pueden crear accesos directos

        icon_path = str(exe_path)                             # El icono se extrae del propio .exe (recurso incrustado por Tauri)

        # Pares (ruta del .lnk, descripción del acceso directo)
        targets = [
            (DESKTOP_DIR    / "ESTICC.lnk", "Panel de Seguridad ESTICC"),  # Escritorio del usuario
            (START_MENU_DIR / "ESTICC.lnk", "Panel de Seguridad ESTICC"),  # Menú de Inicio del usuario
        ]
        START_MENU_DIR.mkdir(parents=True, exist_ok=True)    # Crea la subcarpeta del Menú de Inicio si no existe

        # Plantilla del comando PowerShell que crea el acceso directo vía COM
        ps_template = (
            '$ws = New-Object -ComObject WScript.Shell; '    # Crea el objeto Shell de Windows
            '$s = $ws.CreateShortcut("{lnk}"); '             # Indica la ruta del archivo .lnk a crear
            '$s.TargetPath = "{target}"; '                   # Ejecutable al que apunta el acceso directo
            '$s.Description = "{desc}"; '                    # Descripción (aparece en el tooltip al pasar el ratón)
            '$s.IconLocation = "{icon}"; '                   # Ruta del icono (toma el icono incrustado en el .exe)
            '$s.Save()'                                       # Guarda el archivo .lnk en disco
        )

        for lnk, desc in targets:
            # Construir el comando con las rutas concretas, escapando las barras invertidas para PowerShell
            ps_cmd = ps_template.format(
                lnk    = str(lnk).replace("\\", "\\\\"),
                target = str(exe_path).replace("\\", "\\\\"),
                desc   = desc,
                icon   = icon_path.replace("\\", "\\\\"),
            )
            try:
                subprocess.run(
                    ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_cmd],
                    capture_output=True, timeout=15           # 15 segundos es más que suficiente para crear un .lnk
                )
                self._log(f"  ✓ {lnk.name}  →  {lnk.parent}", "ok")
            except Exception as exc:
                self._log(f"  ! No se pudo crear {lnk.name}: {exc}", "warn")  # Aviso, no error fatal

        self._set_pb(100, "100%")                             # Instalación completa al 100%


    # ── Métodos de resultado ──────────────────────────────────────────────────

    def _on_success(self):
        """
        Se llama cuando todas las fases terminan correctamente.
        Actualiza la UI al estado de éxito y limpia los archivos temporales.
        """
        self._set_status("¡ESTICC instalado correctamente!", SUCCESS)  # Mensaje verde en la etiqueta de estado
        self._log("", "info")
        self._log("  ESTICC está listo. Encuéntralo en el Escritorio o en el Menú de Inicio.", "ok")
        self._log(f"  Ruta de instalación: {INSTALL_DIR}", "info")
        _cleanup(self._tmp_dir)                               # Borra la carpeta temporal de descarga

        # Cambia el botón de "Instalar" a "Cerrar" con color verde
        self.root.after(0, lambda: self._install_btn.config(
            text="  Cerrar  ", state=tk.NORMAL, bg=SUCCESS,
            command=self.root.destroy                         # Al pulsar "Cerrar" se cierra la ventana
        ))

    def _on_error(self, message: str):
        """
        Se llama cuando cualquier fase lanza una excepción.
        Muestra el error en el log, actualiza el estado y abre un diálogo de error.
        Ofrece el botón "Reintentar" para volver a empezar.

        Args:
            message: Mensaje de error completo (puede tener varias líneas).
        """
        self._set_status("Error en la instalación", ERR_COL)
        first_line = message.split("\n")[0]                   # Solo la primera línea para el log (más concisa)
        self._log("", "info")
        self._log(f"  ERROR: {first_line}", "err")
        _cleanup(self._tmp_dir)                               # Borra archivos temporales aunque haya habido error

        def _show():
            # Abre el diálogo modal de error con el mensaje completo
            messagebox.showerror(
                f"{APP_NAME} — Error de instalación",
                message,
                parent=self.root
            )
            # Transforma el botón en "Reintentar" para que el usuario pueda volver a intentarlo
            self._install_btn.config(
                text="  Reintentar  ", state=tk.NORMAL, bg=ACCENT,
                command=self._retry
            )

        self.root.after(0, _show)                             # Ejecutar en el hilo principal (tkinter lo requiere)

    def _retry(self):
        """
        Reinicia la interfaz al estado inicial para permitir un nuevo intento.
        Limpia el log, restablece la barra de progreso y el estado de las variables.
        """
        self._installing = False                              # Permite iniciar una nueva instalación
        self._cancel     = False                              # Limpia la señal de cancelación
        self._tmp_dir    = None                               # Elimina la referencia a la carpeta temporal anterior

        # Restablecer todos los widgets al estado inicial (ejecutado en el hilo principal)
        self.root.after(0, lambda: (
            self._log_txt.config(state=tk.NORMAL),
            self._log_txt.delete("1.0", tk.END),              # Borrar todo el contenido del log
            self._log_txt.config(state=tk.DISABLED),
            self._set_pb(0, ""),                              # Volver la barra al 0%
            self._set_status("Listo para instalar ESTICC en tu equipo."),
            self._status_lbl.config(fg=TEXT),                 # Restablecer el color a blanco claro
            self._install_btn.config(text="  Instalar ESTICC  ", command=self._start_install),
        ))
        # Volver a mostrar los mensajes de bienvenida en el log
        self._log(
            f"Sistema detectado: Windows {sys.getwindowsversion().major}"
            f".{sys.getwindowsversion().minor} "
            f"(build {sys.getwindowsversion().build})",
            "info"
        )
        self._log(f"Instalación en: {INSTALL_DIR}", "info")
        self._log("Haz clic en 'Instalar ESTICC' para comenzar.", "info")

    def _on_close(self):
        """
        Intercepta el evento de cierre de la ventana (botón X o botón Cancelar).
        Si hay una instalación en curso, pide confirmación antes de cancelar.
        Si el usuario confirma (o no había instalación activa), limpia y cierra.
        """
        if self._installing:
            if not messagebox.askyesno(
                "Cancelar instalación",
                "La instalación está en curso.\n¿Deseas cancelarla y salir?",
                parent=self.root
            ):
                return                                        # El usuario eligió no cancelar; volver a la instalación
        self._cancel = True                                   # Señaliza al hilo de fondo que debe detenerse
        _cleanup(self._tmp_dir)                               # Borra archivos temporales antes de salir
        self.root.destroy()                                   # Cierra la ventana y termina el proceso

    def run(self):
        """Inicia el bucle principal de eventos de tkinter (bloquea hasta que se cierra la ventana)."""
        self.root.mainloop()


# ── Funciones auxiliares (independientes de la clase) ────────────────────────

def _pick_asset(assets: list) -> dict | None:
    """
    Elige el asset más adecuado para Windows de entre todos los adjuntos de una release.
    Evalúa los candidatos en orden de prioridad descendente:
      1. ZIP que mencione "portable", "win64" o "windows" en el nombre (nuestro formato de release)
      2. Cualquier ZIP (puede ser el portable sin el nombre esperado)
      3. Instalador NSIS (_x64-setup.exe o *setup*.exe) generado por `tauri build`
      4. Instalador MSI generado por `tauri build`
      5. Cualquier .exe (último recurso)

    Args:
        assets: Lista de diccionarios de assets tal como devuelve la API de GitHub.

    Returns:
        El diccionario del asset elegido, o None si no hay ninguno compatible.
    """
    priorities = [
        lambda n: n.endswith(".zip") and ("portable" in n or "win64" in n or "windows" in n),
        lambda n: n.endswith(".zip"),
        lambda n: n.endswith("_x64-setup.exe") or (n.endswith(".exe") and "setup" in n),
        lambda n: n.endswith(".msi"),
        lambda n: n.endswith(".exe"),
    ]
    for pred in priorities:                                   # Probar cada nivel de prioridad
        for a in assets:
            if pred(a["name"].lower()):                       # Comparar en minúsculas para ignorar el case
                return a                                      # Devolver el primer asset que cumpla esta prioridad
    return None                                               # No se encontró ningún asset compatible


def _zip_root(members: list[str]) -> str:
    """
    Detecta si todos los archivos de un ZIP están dentro de una única carpeta raíz común.
    Si es así, devuelve esa carpeta para aplanarla al extraer (evitar un nivel extra de anidamiento).

    Ejemplo: si el ZIP contiene "ESTICC_portable/ESTICC.exe" y "ESTICC_portable/backend.exe",
    devuelve "ESTICC_portable/" para que los archivos se extraigan directamente en INSTALL_DIR
    en lugar de en INSTALL_DIR/ESTICC_portable/.

    Args:
        members: Lista de rutas dentro del ZIP (resultado de ZipFile.namelist()).

    Returns:
        El prefijo de la carpeta raíz común (p. ej. "ESTICC_portable/"), o "" si no hay carpeta raíz única.
    """
    dirs = {m.split("/")[0] + "/" for m in members if "/" in m}  # Obtiene el conjunto de carpetas raíz distintas
    if len(dirs) == 1:                                        # Solo hay una carpeta raíz
        root = next(iter(dirs))
        if all(m.startswith(root) for m in members):          # Todos los miembros están dentro de esa carpeta
            return root                                       # Devolver el prefijo a eliminar
    return ""                                                 # No hay carpeta raíz común; no aplanar


def _cleanup(tmp: Path | None):
    """
    Elimina la carpeta temporal de descarga y todo su contenido.
    Es seguro llamar a esta función aunque tmp sea None o la carpeta no exista.

    Args:
        tmp: Ruta a la carpeta temporal, o None si nunca se creó.
    """
    if tmp and tmp.exists():
        shutil.rmtree(tmp, ignore_errors=True)                # ignore_errors=True para no propagar errores de borrado


# ── Punto de entrada ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    # Solo se ejecuta cuando se lanza el script directamente (no cuando se importa como módulo)
    ESICCInstaller().run()                                    # Crear la ventana del instalador e iniciar el bucle de eventos
