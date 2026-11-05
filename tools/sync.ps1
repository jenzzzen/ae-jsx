# Gleicht die veroeffentlichten Kopien in skripte/ mit den Originalen im
# Elternordner (Scripte_After_Effects) ab.
#
#   powershell -ExecutionPolicy Bypass -File tools/sync.ps1            # nur anzeigen
#   powershell -ExecutionPolicy Bypass -File tools/sync.ps1 -Apply     # geaenderte Skripte kopieren
#   powershell -ExecutionPolicy Bypass -File tools/sync.ps1 -Add X.jsx,Y.jsx   # neue Skripte aufnehmen
#
# Neue Skripte werden NIE automatisch veroeffentlicht - nur ueber -Add.

param(
    [switch]$Apply,
    [string[]]$Add = @()
)

$ErrorActionPreference = 'Stop'
$site    = Split-Path -Parent $PSScriptRoot
$source  = Split-Path -Parent $site
$publish = Join-Path $site 'skripte'

function Hash($p) { (Get-FileHash -Algorithm SHA256 -LiteralPath $p).Hash }

$published = @(Get-ChildItem -File -LiteralPath $publish -Filter *.jsx | ForEach-Object Name)
$originals = @(Get-ChildItem -File -LiteralPath $source  -Filter *.jsx | ForEach-Object Name)

$changed = @(); $missing = @(); $new = @()
foreach ($n in $published) {
    $o = Join-Path $source $n
    if (-not (Test-Path -LiteralPath $o)) { $missing += $n; continue }
    if ((Hash $o) -ne (Hash (Join-Path $publish $n))) { $changed += $n }
}
foreach ($n in $originals) { if ($published -notcontains $n) { $new += $n } }

foreach ($n in $changed) { Write-Host "GEAENDERT  $n" -ForegroundColor Yellow }
foreach ($n in $new)     { Write-Host "NEU        $n  (nicht veroeffentlicht)" -ForegroundColor Cyan }
foreach ($n in $missing) { Write-Host "FEHLT      $n  (Original nicht mehr im Ordner)" -ForegroundColor Red }
if (-not ($changed -or $new -or $missing)) { Write-Host 'Alles aktuell.' -ForegroundColor Green }

if ($Apply) {
    foreach ($n in $changed) {
        Copy-Item -LiteralPath (Join-Path $source $n) -Destination $publish -Force
        Write-Host "kopiert    $n" -ForegroundColor Green
    }
}
foreach ($n in $Add) {
    if ($originals -notcontains $n) { Write-Host "unbekannt  $n" -ForegroundColor Red; continue }
    Copy-Item -LiteralPath (Join-Path $source $n) -Destination $publish -Force
    Write-Host "aufgenommen $n" -ForegroundColor Green
}
