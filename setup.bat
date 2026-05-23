@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title ESTICC - Configuracion

echo.
echo ============================================================
echo   ESTICC - Panel de Seguridad Local  |  Configuracion
echo ============================================================
echo.

:: ─── Python ──────────────────────────────────────────────────
set PYTHON_CMD=

python --version >nul 2>&1 && set PYTHON_CMD=python
if "!PYTHON_CMD!"=="" (
    py --version >nul 2>&1 && set PYTHON_CMD=py
)
if "!PYTHON_CMD!"=="" (
    echo [ERROR] Python no encontrado.
    echo         Instala Python 3.8+ desde: https://www.python.org/downloads/
    echo         Asegurate de marcar "Add Python to PATH" durante la instalacion.
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('!PYTHON_CMD! --version 2^>^&1') do set PY_VER=%%v
echo [OK] %PY_VER% encontrado.

:: ─── Entorno virtual Python ───────────────────────────────────
echo.
echo [1/4] Creando entorno virtual Python en backend\.venv ...
if exist "backend\.venv\" (
    echo      Ya existe, omitiendo creacion.
) else (
    !PYTHON_CMD! -m venv backend\.venv
    if errorlevel 1 (
        echo [ERROR] No se pudo crear el entorno virtual.
        pause & exit /b 1
    )
    echo [OK] Entorno virtual creado.
)

:: ─── Dependencias Python ──────────────────────────────────────
echo.
echo [2/4] Instalando dependencias Python ...
backend\.venv\Scripts\pip install -r backend\requirements.txt --quiet
if errorlevel 1 (
    echo [ERROR] Fallo al instalar dependencias Python.
    pause & exit /b 1
)
echo [OK] psutil y feedparser instalados en el entorno virtual.

:: ─── Rust / Cargo ────────────────────────────────────────────
echo.
echo [3/4] Verificando Rust / Cargo ...
cargo --version >nul 2>&1
if errorlevel 1 (
    echo [AVISO] Cargo no encontrado.
    echo         Instala Rust desde: https://rustup.rs
    echo         Despues de instalar, cierra y vuelve a abrir esta ventana y ejecuta setup.bat de nuevo.
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('cargo --version 2^>^&1') do set CARGO_VER=%%v
echo [OK] %CARGO_VER% encontrado.

:: ─── Tauri CLI ───────────────────────────────────────────────
echo.
echo [4/4] Verificando Tauri CLI ...
cargo tauri --version >nul 2>&1
if errorlevel 1 (
    echo      Tauri CLI no encontrado. Instalando ^(puede tardar varios minutos^)...
    cargo install tauri-cli --version "^1.0"
    if errorlevel 1 (
        echo [ERROR] No se pudo instalar Tauri CLI.
        pause & exit /b 1
    )
)
echo [OK] Tauri CLI listo.

:: ─── Fin ─────────────────────────────────────────────────────
echo.
echo ============================================================
echo   Configuracion completada con exito.
echo.
echo   Para iniciar ESTICC en modo desarrollo, ejecuta:
echo      .\run.bat         ^(en PowerShell^)
echo      run.bat           ^(en CMD^)
echo.
echo   Nota: la primera compilacion de Rust puede tardar
echo   varios minutos. Las siguientes seran mucho mas rapidas.
echo ============================================================
echo.
pause
