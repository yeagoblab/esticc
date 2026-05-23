@echo off
title ESTICC — Modo Desarrollo

if not exist "backend\.venv\" (
    echo [AVISO] No se encontro el entorno virtual Python.
    echo         Ejecuta primero setup.bat para configurar el entorno.
    echo.
    pause
    exit /b 1
)

echo Iniciando ESTICC en modo desarrollo...
echo La primera compilacion puede tardar varios minutos.
echo.
cargo tauri dev
