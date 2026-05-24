# build_installer.ps1
# Compila esticc_installer.py → ESTICC_Installer.exe (standalone, ~15 MB)
# Requiere Python + PyInstaller instalados.
#
# Uso: cd installer && .\build_installer.ps1

$ErrorActionPreference = "Stop"
$Root    = Split-Path $PSScriptRoot -Parent
$IconIco = Join-Path $Root "src-tauri\icons\icon.ico"

Write-Host ""
Write-Host "=== ESTICC Installer Builder ===" -ForegroundColor Cyan

# ── Verificar Python ────────────────────────────────────────────────────────
$py = $null
foreach ($cmd in @("python", "py")) {
    if (Get-Command $cmd -ErrorAction SilentlyContinue) {
        $py = $cmd; break
    }
}
if (-not $py) {
    Write-Host "[ERROR] Python no encontrado. Instala Python 3.8+ desde https://www.python.org/" -ForegroundColor Red
    exit 1
}
$pyVer = & $py --version 2>&1
Write-Host "[OK] $pyVer" -ForegroundColor Green

# ── Verificar / instalar PyInstaller ────────────────────────────────────────
$piOk = & $py -c "import PyInstaller" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[INFO] Instalando PyInstaller..." -ForegroundColor Yellow
    & $py -m pip install pyinstaller --quiet
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] No se pudo instalar PyInstaller." -ForegroundColor Red
        exit 1
    }
}
Write-Host "[OK] PyInstaller disponible." -ForegroundColor Green

# ── Compilar ────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[1/1] Compilando esticc_installer.py..." -ForegroundColor Yellow

$pyiArgs = @(
    "--onefile",          # Un solo .exe
    "--noconsole",        # Sin ventana de consola
    "--name", "ESTICC_Installer",
    "--clean"             # Limpiar caché previa
)

if (Test-Path $IconIco) {
    $pyiArgs += "--icon", $IconIco
    Write-Host "      Usando icono: $IconIco" -ForegroundColor DarkGray
} else {
    Write-Host "      [AVISO] Icono no encontrado, se usará el icono por defecto." -ForegroundColor DarkYellow
}

$pyiArgs += "esticc_installer.py"

& $py -m PyInstaller @pyiArgs

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "[ERROR] La compilación falló. Revisa los mensajes anteriores." -ForegroundColor Red
    exit 1
}

# ── Resultado ────────────────────────────────────────────────────────────────
$exe = Join-Path $PSScriptRoot "dist\ESTICC_Installer.exe"
if (Test-Path $exe) {
    $sizeMB = [math]::Round((Get-Item $exe).Length / 1MB, 1)
    Write-Host ""
    Write-Host "=== Compilación exitosa ===" -ForegroundColor Green
    Write-Host "  Ejecutable: $exe"          -ForegroundColor White
    Write-Host "  Tamaño:     $sizeMB MB"    -ForegroundColor White
    Write-Host ""
    Write-Host "Próximos pasos:" -ForegroundColor Cyan
    Write-Host "  1. Ejecuta ..\scripts\package_release.ps1 para empaquetar ESTICC_portable.zip"
    Write-Host "  2. Sube ambos archivos a GitHub Releases:"
    Write-Host "       · ESTICC_Installer.exe  (instalador)"
    Write-Host "       · ESTICC_portable_win64.zip  (aplicación)"
} else {
    Write-Host "[ERROR] No se encontró el ejecutable de salida." -ForegroundColor Red
    exit 1
}
