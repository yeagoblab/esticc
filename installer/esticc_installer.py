#!/usr/bin/env python3
"""ESTICC Installer — descarga e instala ESTICC Panel de Seguridad en Windows."""

import tkinter as tk
from tkinter import ttk, messagebox
import threading
import sys
import os
import subprocess
import ctypes
import ctypes.wintypes
import tempfile
import urllib.request
import urllib.error
import json
import shutil
import time
import winreg
import zipfile
from pathlib import Path

# ── Constantes ──────────────────────────────────────────────────────────────
APP_NAME       = "ESTICC"
APP_VERSION    = "1.0"
GITHUB_REPO    = "yeagoblab/esticc"
GITHUB_API_URL = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"

LOCALAPPDATA   = Path(os.environ.get("LOCALAPPDATA", r"C:\Users\Default\AppData\Local"))
APPDATA        = Path(os.environ.get("APPDATA", r"C:\Users\Default\AppData\Roaming"))
USERPROFILE    = Path(os.environ.get("USERPROFILE", r"C:\Users\Default"))

INSTALL_DIR    = LOCALAPPDATA / "ESTICC"
START_MENU_DIR = APPDATA / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "ESTICC"
DESKTOP_DIR    = USERPROFILE / "Desktop"

MIN_RAM_GB        = 2
MIN_DISK_GB       = 0.5
MIN_WIN_BUILD     = 17763   # Windows 10 1809

WEBVIEW2_KEYS = [
    (winreg.HKEY_LOCAL_MACHINE,
     r"SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"),
    (winreg.HKEY_CURRENT_USER,
     r"SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"),
]

# ── Tema visual ──────────────────────────────────────────────────────────────
BG        = "#0d1117"
BG2       = "#161b22"
BG3       = "#21262d"
ACCENT    = "#1f6feb"
SUCCESS   = "#3fb950"
ERR_COL   = "#f85149"
WARN_COL  = "#d29922"
TEXT      = "#e6edf3"
TEXT_DIM  = "#8b949e"


class InstallError(Exception):
    """Error con mensaje legible para el usuario final."""


# ────────────────────────────────────────────────────────────────────────────
class ESICCInstaller:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title(f"{APP_NAME} — Instalador")
        self.root.geometry("640x500")
        self.root.resizable(False, False)
        self.root.configure(bg=BG)
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)

        # Centrar ventana
        self.root.update_idletasks()
        sw = self.root.winfo_screenwidth()
        sh = self.root.winfo_screenheight()
        self.root.geometry(f"640x500+{(sw-640)//2}+{(sh-500)//2}")

        self._installing = False
        self._cancel     = False
        self._tmp_dir    = None

        self._build_ui()

    # ── UI ──────────────────────────────────────────────────────────────────
    def _build_ui(self):
        # Cabecera
        hdr = tk.Frame(self.root, bg=BG2, height=76)
        hdr.pack(fill=tk.X)
        hdr.pack_propagate(False)
        tk.Label(hdr, text="ESTICC", font=("Segoe UI", 22, "bold"),
                 bg=BG2, fg=ACCENT).pack(side=tk.LEFT, padx=22, pady=18)
        tk.Label(hdr, text="Panel de Seguridad  ·  Instalador",
                 font=("Segoe UI", 10), bg=BG2, fg=TEXT_DIM).pack(side=tk.LEFT, pady=30)

        # Cuerpo principal
        body = tk.Frame(self.root, bg=BG, padx=24, pady=14)
        body.pack(fill=tk.BOTH, expand=True)

        # Estado
        self._status_var = tk.StringVar(value="Listo para instalar ESTICC en tu equipo.")
        self._status_lbl = tk.Label(body, textvariable=self._status_var,
                                    font=("Segoe UI", 11), bg=BG, fg=TEXT,
                                    anchor="w", wraplength=580, justify=tk.LEFT)
        self._status_lbl.pack(fill=tk.X, pady=(0, 8))

        # Barra de progreso
        sty = ttk.Style()
        sty.theme_use("clam")
        sty.configure("E.Horizontal.TProgressbar",
                       troughcolor=BG2, background=ACCENT,
                       bordercolor=BG2, lightcolor=ACCENT, darkcolor=ACCENT)
        self._pb = ttk.Progressbar(body, style="E.Horizontal.TProgressbar",
                                    length=590, mode="determinate")
        self._pb.pack(fill=tk.X)

        self._pb_lbl = tk.Label(body, text="", font=("Segoe UI", 9),
                                 bg=BG, fg=TEXT_DIM)
        self._pb_lbl.pack(anchor="e", pady=(2, 10))

        # Log
        log_frame = tk.Frame(body, bg=BG3, padx=0, pady=0)
        log_frame.pack(fill=tk.BOTH, expand=True)

        sb = tk.Scrollbar(log_frame, bg=BG2, troughcolor=BG)
        sb.pack(side=tk.RIGHT, fill=tk.Y)

        self._log_txt = tk.Text(log_frame, bg=BG3, fg=TEXT_DIM,
                                 font=("Consolas", 9), height=9,
                                 bd=0, relief=tk.FLAT, state=tk.DISABLED,
                                 yscrollcommand=sb.set, padx=10, pady=8)
        self._log_txt.pack(fill=tk.BOTH, expand=True)
        sb.config(command=self._log_txt.yview)

        self._log_txt.tag_config("ok",   foreground=SUCCESS)
        self._log_txt.tag_config("err",  foreground=ERR_COL)
        self._log_txt.tag_config("warn", foreground=WARN_COL)
        self._log_txt.tag_config("info", foreground=TEXT_DIM)
        self._log_txt.tag_config("hdr",  foreground=TEXT)

        # Botones
        btn_row = tk.Frame(self.root, bg=BG, padx=24, pady=10)
        btn_row.pack(fill=tk.X)

        self._install_btn = tk.Button(btn_row, text="  Instalar ESTICC  ",
                                       font=("Segoe UI", 10, "bold"),
                                       bg=ACCENT, fg="white",
                                       activebackground="#388bfd", activeforeground="white",
                                       bd=0, padx=14, pady=8, cursor="hand2",
                                       command=self._start_install)
        self._install_btn.pack(side=tk.LEFT)

        self._cancel_btn = tk.Button(btn_row, text="Cancelar",
                                      font=("Segoe UI", 10),
                                      bg=BG2, fg=TEXT_DIM,
                                      activebackground=BG3, activeforeground=TEXT,
                                      bd=0, padx=14, pady=8, cursor="hand2",
                                      command=self._on_close)
        self._cancel_btn.pack(side=tk.LEFT, padx=8)

        # Mensaje inicial
        self._log(f"Sistema detectado: Windows {sys.getwindowsversion().major}"
                  f".{sys.getwindowsversion().minor} (build {sys.getwindowsversion().build})", "info")
        self._log(f"Instalación en: {INSTALL_DIR}", "info")
        self._log("Haz clic en 'Instalar ESTICC' para comenzar.", "info")

    # ── Helpers UI (thread-safe) ─────────────────────────────────────────────
    def _log(self, msg: str, tag: str = "info"):
        def _do():
            self._log_txt.config(state=tk.NORMAL)
            self._log_txt.insert(tk.END, f"  {msg}\n", tag)
            self._log_txt.see(tk.END)
            self._log_txt.config(state=tk.DISABLED)
        self.root.after(0, _do)

    def _set_status(self, msg: str, color: str = TEXT):
        self.root.after(0, lambda: (
            self._status_var.set(msg),
            self._status_lbl.config(fg=color)
        ))

    def _set_pb(self, value: float, label: str = ""):
        def _do():
            self._pb["value"] = value
            self._pb_lbl.config(text=label)
        self.root.after(0, _do)

    # ── Flujo de instalación ─────────────────────────────────────────────────
    def _start_install(self):
        if self._installing:
            return
        self._installing = True
        self.root.after(0, lambda: self._install_btn.config(
            state=tk.DISABLED, bg="#333940"))
        threading.Thread(target=self._install_flow, daemon=True).start()

    def _install_flow(self):
        try:
            self._phase_checks()
            if self._cancel:
                return
            zip_path = self._phase_download()
            if self._cancel or not zip_path:
                return
            self._phase_extract(zip_path)
            if self._cancel:
                return
            self._phase_shortcuts()
            self._on_success()
        except InstallError as exc:
            self._on_error(str(exc))
        except Exception as exc:
            self._on_error(f"Error inesperado durante la instalación:\n{exc}")
        finally:
            self._installing = False

    # ── Fase 1 — Comprobaciones (0 → 30 %) ──────────────────────────────────
    def _phase_checks(self):
        self._set_status("Verificando requisitos del sistema...")
        self._log("── Comprobando requisitos ──────────────────────────────", "hdr")

        checks = [
            ("Windows 10 o superior",          self._chk_windows,  6),
            (f"RAM disponible (mín. {MIN_RAM_GB} GB)",  self._chk_ram,    12),
            (f"Espacio en disco (mín. {MIN_DISK_GB} GB)", self._chk_disk,  18),
            ("Conexión a Internet",             self._chk_internet, 24),
            ("WebView2 Runtime (Tauri)",        self._chk_webview2, 30),
        ]

        for label, fn, pct in checks:
            if self._cancel:
                return
            self._log(f"  Verificando: {label}...", "info")
            ok, detail, fatal = fn()
            if ok:
                self._log(f"  ✓ {label}: {detail}", "ok")
            elif fatal:
                self._log(f"  ✗ {label}: {detail}", "err")
                raise InstallError(
                    f"Requisito no cumplido: {label}\n\n{detail}"
                )
            else:
                self._log(f"  ! {label}: {detail}", "warn")
            self._set_pb(pct, f"{pct}%")

        self._log("  Comprobación completada.", "ok")

    def _chk_windows(self):
        v = sys.getwindowsversion()
        if v.major < 10:
            return False, (
                f"Windows {v.major} no está soportado. Se requiere Windows 10 (build {MIN_WIN_BUILD}+).\n"
                "Actualiza el sistema operativo antes de instalar ESTICC."
            ), True
        if v.build < MIN_WIN_BUILD:
            return False, (
                f"Build {v.build} demasiado antigua. Actualiza Windows "
                f"(mín. build {MIN_WIN_BUILD}, versión 1809)."
            ), True
        return True, f"Windows {v.major}.{v.minor} build {v.build}", False

    def _chk_ram(self):
        try:
            class _MEM(ctypes.Structure):
                _fields_ = [
                    ("dwLength",                ctypes.c_ulong),
                    ("dwMemoryLoad",            ctypes.c_ulong),
                    ("ullTotalPhys",            ctypes.c_ulonglong),
                    ("ullAvailPhys",            ctypes.c_ulonglong),
                    ("ullTotalPageFile",        ctypes.c_ulonglong),
                    ("ullAvailPageFile",        ctypes.c_ulonglong),
                    ("ullTotalVirtual",         ctypes.c_ulonglong),
                    ("ullAvailVirtual",         ctypes.c_ulonglong),
                    ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
                ]
            m = _MEM()
            m.dwLength = ctypes.sizeof(m)
            ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(m))
            gb = m.ullTotalPhys / (1024 ** 3)
            if gb < MIN_RAM_GB:
                return False, (
                    f"Solo {gb:.1f} GB de RAM. ESTICC requiere al menos {MIN_RAM_GB} GB."
                ), True
            return True, f"{gb:.1f} GB de RAM", False
        except Exception as exc:
            return True, f"No se pudo verificar (se asume OK): {exc}", False

    def _chk_disk(self):
        try:
            drive = Path(os.environ.get("SystemDrive", "C:") + "\\")
            total, used, free = shutil.disk_usage(drive)
            gb = free / (1024 ** 3)
            if gb < MIN_DISK_GB:
                return False, (
                    f"Solo {gb:.1f} GB libres en {drive}. "
                    f"Se necesitan al menos {MIN_DISK_GB:.0f} GB."
                ), True
            return True, f"{gb:.1f} GB libres en {drive}", False
        except Exception as exc:
            return True, f"No se pudo verificar (se asume OK): {exc}", False

    def _chk_internet(self):
        try:
            req = urllib.request.Request(
                "https://api.github.com",
                headers={"User-Agent": "ESTICC-Installer/1.0"})
            urllib.request.urlopen(req, timeout=6)
            return True, "Conexión disponible", False
        except Exception:
            return False, (
                "No hay conexión a GitHub. Comprueba tu conexión a Internet "
                "y que ningún cortafuegos bloquee la descarga."
            ), True

    def _chk_webview2(self):
        for hive, path in WEBVIEW2_KEYS:
            try:
                with winreg.OpenKey(hive, path):
                    return True, "WebView2 Runtime instalado", False
            except FileNotFoundError:
                continue
            except Exception:
                continue
        return False, (
            "WebView2 Runtime no detectado. ESTICC podría no abrirse correctamente.\n"
            "Descárgalo gratis desde: https://developer.microsoft.com/microsoft-edge/webview2/\n"
            "(La instalación continuará, pero instala WebView2 si ESTICC no arranca.)"
        ), False   # No es fatal — Windows 11 siempre lo tiene

    # ── Fase 2 — Descarga (30 → 80 %) ───────────────────────────────────────
    def _phase_download(self) -> Path:
        self._set_status("Consultando la última versión en GitHub...")
        self._log("── Descargando ESTICC ──────────────────────────────────", "hdr")

        # Consultar API
        self._log("  Obteniendo información de la última versión...", "info")
        try:
            req = urllib.request.Request(GITHUB_API_URL,
                headers={"User-Agent": "ESTICC-Installer/1.0",
                         "Accept": "application/vnd.github+json"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                release = json.loads(resp.read())
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                raise InstallError(
                    "No se encontró ninguna versión publicada de ESTICC.\n\n"
                    f"Visita https://github.com/{GITHUB_REPO}/releases para más información."
                )
            raise InstallError(f"Error al consultar GitHub (HTTP {exc.code}): {exc.reason}")
        except Exception as exc:
            raise InstallError(f"No se pudo conectar con GitHub:\n{exc}")

        version = release.get("tag_name", "desconocida")
        self._log(f"  Versión disponible: {version}", "ok")

        # Buscar asset descargable
        assets = release.get("assets", [])
        asset  = _pick_asset(assets)

        if not asset:
            raise InstallError(
                f"La versión {version} no contiene un instalador binario para Windows.\n\n"
                f"Visita https://github.com/{GITHUB_REPO}/releases y descarga el ZIP manualmente."
            )

        dl_url  = asset["browser_download_url"]
        dl_name = asset["name"]
        dl_size = asset.get("size", 0)
        self._log(f"  Archivo: {dl_name}  ({dl_size/1024/1024:.1f} MB)", "info")

        # Descargar
        self._tmp_dir = Path(tempfile.mkdtemp(prefix="esticc_install_"))
        dest = self._tmp_dir / dl_name
        self._log("  Descargando...", "info")
        self._set_status(f"Descargando ESTICC {version}...")

        downloaded = [0]
        t0 = time.time()

        def _hook(count, block, total):
            downloaded[0] = count * block
            if self._cancel:
                raise InstallError("Instalación cancelada por el usuario.")
            elapsed = time.time() - t0 or 0.001
            mbps    = downloaded[0] / elapsed / 1024 / 1024
            if total > 0:
                pct      = min(downloaded[0] / total, 1.0)
                fill_pct = 30 + pct * 50   # 30 → 80
                label    = (f"{downloaded[0]/1024/1024:.1f} / "
                            f"{total/1024/1024:.1f} MB  ·  {mbps:.1f} MB/s")
            else:
                fill_pct = 55
                label    = f"{downloaded[0]/1024/1024:.1f} MB descargados  ·  {mbps:.1f} MB/s"
            self._set_pb(fill_pct, label)

        try:
            urllib.request.urlretrieve(dl_url, dest, _hook)
        except InstallError:
            raise
        except Exception as exc:
            raise InstallError(
                f"Error durante la descarga:\n{exc}\n\n"
                "Comprueba tu conexión e inténtalo de nuevo."
            )

        self._log(f"  ✓ Descarga completada ({dest.stat().st_size/1024/1024:.1f} MB)", "ok")
        self._set_pb(80, "80%")
        return dest

    # ── Fase 3 — Extracción / instalación (80 → 92 %) ───────────────────────
    def _phase_extract(self, src: Path):
        self._set_status("Instalando archivos...")
        self._log("── Instalando archivos ─────────────────────────────────", "hdr")

        ext = src.suffix.lower()

        if ext == ".zip":
            self._log(f"  Extrayendo en {INSTALL_DIR} ...", "info")
            INSTALL_DIR.mkdir(parents=True, exist_ok=True)
            with zipfile.ZipFile(src, "r") as zf:
                members = zf.namelist()
                # Detectar si hay una carpeta raíz común en el ZIP
                common = _zip_root(members)
                total  = len(members)
                for i, member in enumerate(members, 1):
                    if self._cancel:
                        raise InstallError("Instalación cancelada.")
                    rel = member[len(common):] if common else member
                    if not rel:
                        continue
                    dest = INSTALL_DIR / rel
                    if member.endswith("/"):
                        dest.mkdir(parents=True, exist_ok=True)
                    else:
                        dest.parent.mkdir(parents=True, exist_ok=True)
                        with zf.open(member) as src_f, open(dest, "wb") as dst_f:
                            shutil.copyfileobj(src_f, dst_f)
                    pct = 80 + (i / total) * 12
                    self._set_pb(pct, f"Extrayendo  {i}/{total}")
            self._log(f"  ✓ Archivos extraídos en {INSTALL_DIR}", "ok")

        elif ext in (".exe", ".msi"):
            # Instalador NSIS/MSI externo
            self._log(f"  Ejecutando instalador {src.name} ...", "info")
            if ext == ".msi":
                cmd = ["msiexec", "/i", str(src), "/qb!", "/norestart",
                       f"INSTALLDIR={INSTALL_DIR}"]
            else:
                cmd = [str(src), "/S", f"/D={INSTALL_DIR}"]
            try:
                res = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
                if res.returncode not in (0, 3010):
                    detail = res.stderr.strip() or "(sin detalle)"
                    raise InstallError(
                        f"El instalador terminó con error (código {res.returncode}).\n\n"
                        f"Detalle técnico: {detail}\n\n"
                        "Intenta ejecutar el instalador manualmente o contacta con soporte."
                    )
                if res.returncode == 3010:
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

    # ── Fase 4 — Accesos directos (92 → 100 %) ──────────────────────────────
    def _phase_shortcuts(self):
        self._set_status("Creando accesos directos...")
        self._log("── Creando accesos directos ────────────────────────────", "hdr")

        exe_path = INSTALL_DIR / "ESTICC.exe"
        if not exe_path.exists():
            # Buscar el .exe si el nombre varía
            exes = list(INSTALL_DIR.glob("*.exe"))
            if exes:
                exe_path = exes[0]
            else:
                self._log("  ! No se encontró el ejecutable para crear accesos directos.", "warn")
                return

        icon_path = str(exe_path)

        targets = [
            (DESKTOP_DIR / "ESTICC.lnk",                       "Panel de Seguridad ESTICC"),
            (START_MENU_DIR / "ESTICC.lnk",                    "Panel de Seguridad ESTICC"),
        ]
        START_MENU_DIR.mkdir(parents=True, exist_ok=True)

        ps_template = (
            '$ws = New-Object -ComObject WScript.Shell; '
            '$s = $ws.CreateShortcut("{lnk}"); '
            '$s.TargetPath = "{target}"; '
            '$s.Description = "{desc}"; '
            '$s.IconLocation = "{icon}"; '
            '$s.Save()'
        )

        for lnk, desc in targets:
            ps_cmd = ps_template.format(
                lnk    = str(lnk).replace("\\", "\\\\"),
                target = str(exe_path).replace("\\", "\\\\"),
                desc   = desc,
                icon   = icon_path.replace("\\", "\\\\"),
            )
            try:
                subprocess.run(
                    ["powershell", "-NoProfile", "-NonInteractive",
                     "-Command", ps_cmd],
                    capture_output=True, timeout=15
                )
                self._log(f"  ✓ {lnk.name}  →  {lnk.parent}", "ok")
            except Exception as exc:
                self._log(f"  ! No se pudo crear {lnk.name}: {exc}", "warn")

        self._set_pb(100, "100%")

    # ── Resultado ────────────────────────────────────────────────────────────
    def _on_success(self):
        self._set_status("¡ESTICC instalado correctamente!", SUCCESS)
        self._log("", "info")
        self._log("  ESTICC está listo. Encuéntralo en el Escritorio o en el Menú de Inicio.", "ok")
        self._log(f"  Ruta de instalación: {INSTALL_DIR}", "info")
        _cleanup(self._tmp_dir)

        self.root.after(0, lambda: self._install_btn.config(
            text="  Cerrar  ", state=tk.NORMAL, bg=SUCCESS,
            command=self.root.destroy
        ))

    def _on_error(self, message: str):
        self._set_status("Error en la instalación", ERR_COL)
        first_line = message.split("\n")[0]
        self._log("", "info")
        self._log(f"  ERROR: {first_line}", "err")
        _cleanup(self._tmp_dir)

        def _show():
            messagebox.showerror(
                f"{APP_NAME} — Error de instalación",
                message,
                parent=self.root
            )
            self._install_btn.config(
                text="  Reintentar  ", state=tk.NORMAL, bg=ACCENT,
                command=self._retry
            )

        self.root.after(0, _show)

    def _retry(self):
        self._installing = False
        self._cancel     = False
        self._tmp_dir    = None
        self.root.after(0, lambda: (
            self._log_txt.config(state=tk.NORMAL),
            self._log_txt.delete("1.0", tk.END),
            self._log_txt.config(state=tk.DISABLED),
            self._set_pb(0, ""),
            self._set_status("Listo para instalar ESTICC en tu equipo."),
            self._status_lbl.config(fg=TEXT),
            self._install_btn.config(text="  Instalar ESTICC  ", command=self._start_install),
        ))
        self._log(f"Sistema detectado: Windows {sys.getwindowsversion().major}"
                  f".{sys.getwindowsversion().minor} "
                  f"(build {sys.getwindowsversion().build})", "info")
        self._log(f"Instalación en: {INSTALL_DIR}", "info")
        self._log("Haz clic en 'Instalar ESTICC' para comenzar.", "info")

    def _on_close(self):
        if self._installing:
            if not messagebox.askyesno(
                "Cancelar instalación",
                "La instalación está en curso.\n¿Deseas cancelarla y salir?",
                parent=self.root
            ):
                return
        self._cancel = True
        _cleanup(self._tmp_dir)
        self.root.destroy()

    def run(self):
        self.root.mainloop()


# ── Utilidades ───────────────────────────────────────────────────────────────
def _pick_asset(assets: list) -> dict | None:
    """Selecciona el asset más adecuado para Windows en orden de prioridad."""
    priorities = [
        lambda n: n.endswith(".zip") and ("portable" in n or "win64" in n or "windows" in n),
        lambda n: n.endswith(".zip"),
        lambda n: n.endswith("_x64-setup.exe") or (n.endswith(".exe") and "setup" in n),
        lambda n: n.endswith(".msi"),
        lambda n: n.endswith(".exe"),
    ]
    for pred in priorities:
        for a in assets:
            if pred(a["name"].lower()):
                return a
    return None


def _zip_root(members: list[str]) -> str:
    """Detecta la carpeta raíz común en un ZIP para aplanarla al extraer."""
    dirs = {m.split("/")[0] + "/" for m in members if "/" in m}
    if len(dirs) == 1:
        root = next(iter(dirs))
        if all(m.startswith(root) for m in members):
            return root
    return ""


def _cleanup(tmp: Path | None):
    if tmp and tmp.exists():
        shutil.rmtree(tmp, ignore_errors=True)


# ── Punto de entrada ─────────────────────────────────────────────────────────
if __name__ == "__main__":
    ESICCInstaller().run()
