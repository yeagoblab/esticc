# package_release.ps1
# Empaqueta ESTICC_portable/ en un ZIP listo para subir a GitHub Releases.
# El instalador (ESTICC_Installer.exe) buscará este ZIP como asset de la release.
#
# Uso: cd scripts && .\package_release.ps1
# Salida: ESTICC_portable_win64.zip en la raíz del proyecto

$ErrorActionPreference = "Stop"
$Root    = Split-Path $PSScriptRoot -Parent
$SrcDir  = Join-Path $Root "ESTICC_portable"
$OutZip  = Join-Path $Root "ESTICC_portable_win64.zip"

Write-Host ""
Write-Host "=== ESTICC Release Packager ===" -ForegroundColor Cyan

# Verificar fuente
if (-not (Test-Path $SrcDir)) {
    Write-Host "[ERROR] No se encontró la carpeta: $SrcDir" -ForegroundColor Red
    Write-Host "        Asegúrate de haber compilado el proyecto con 'cargo tauri build'" `
               "y de que ESTICC_portable/ contenga ESTICC.exe y backend.exe."
    exit 1
}

$files = Get-ChildItem $SrcDir
if ($files.Count -eq 0) {
    Write-Host "[ERROR] La carpeta ESTICC_portable/ está vacía." -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Carpeta fuente: $SrcDir" -ForegroundColor Green
Write-Host "     Archivos encontrados:"
foreach ($f in $files) {
    $mb = [math]::Round($f.Length / 1MB, 1)
    Write-Host "       · $($f.Name)  ($mb MB)"
}

# Eliminar ZIP previo si existe
if (Test-Path $OutZip) {
    Remove-Item $OutZip -Force
    Write-Host "[INFO] ZIP previo eliminado." -ForegroundColor DarkGray
}

# Crear ZIP
Write-Host ""
Write-Host "[1/1] Creando $OutZip ..." -ForegroundColor Yellow

Compress-Archive -Path "$SrcDir\*" -DestinationPath $OutZip -CompressionLevel Optimal

if (-not (Test-Path $OutZip)) {
    Write-Host "[ERROR] No se pudo crear el ZIP." -ForegroundColor Red
    exit 1
}

$zipMB = [math]::Round((Get-Item $OutZip).Length / 1MB, 1)
Write-Host ""
Write-Host "=== Empaquetado exitoso ===" -ForegroundColor Green
Write-Host "  Archivo: $OutZip"          -ForegroundColor White
Write-Host "  Tamaño:  $zipMB MB"        -ForegroundColor White
Write-Host ""
Write-Host "Sube estos archivos a la release de GitHub:" -ForegroundColor Cyan
Write-Host "  · ESTICC_portable_win64.zip   (este archivo)"
Write-Host "  · installer\dist\ESTICC_Installer.exe   (compilado con build_installer.ps1)"
Write-Host ""
Write-Host "El instalador buscará automáticamente 'ESTICC_portable_win64.zip' en los assets."
