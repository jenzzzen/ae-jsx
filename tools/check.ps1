# Konsistenzpruefung fuer ae-jsx. Aufruf aus dem Projekt-Root:
#   powershell -ExecutionPolicy Bypass -File tools/check.ps1
# Exit-Code 0 = alles ok, 1 = Fehler gefunden.

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$errors = 0
$warnings = 0
function Fail($msg) { Write-Host "FEHLER  $msg" -ForegroundColor Red; $script:errors++ }
function Warn($msg) { Write-Host "WARNUNG $msg" -ForegroundColor Yellow; $script:warnings++ }
function Ok($msg)   { Write-Host "ok      $msg" -ForegroundColor Green }

# --- 1. Landingpage: Links, Kartenanzahl -----------------------------------
$html = [IO.File]::ReadAllText((Join-Path $root 'index.html'))
$linked = [regex]::Matches($html, 'href="skripte/([^"/]+\.jsx)"') | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique
foreach ($f in $linked) {
    if (Test-Path (Join-Path $root "skripte/$f")) { Ok "verlinkt + vorhanden: $f" } else { Fail "index.html verlinkt $f, Datei fehlt" }
}

$cards = ([regex]::Matches($html, '<details class="card"')).Count
$m = [regex]::Match($html, '<h2>Skripte\s+(?:&mdash;|\W)\s*(\d+)')
if (-not $m.Success) { Warn 'Ueberschrift "Skripte - N" nicht gefunden' }
elseif ([int]$m.Groups[1].Value -ne $cards) { Fail "Ueberschrift sagt $($m.Groups[1].Value), es gibt aber $cards Karten" }
else { Ok "Kartenanzahl = Ueberschrift ($cards)" }

$unlisted = Get-ChildItem -File skripte/*.jsx | Where-Object { $linked -notcontains $_.Name } | ForEach-Object Name
if ($unlisted) { Write-Host "info    ohne Karte auf der Seite: $($unlisted -join ', ')" -ForegroundColor DarkGray }

# --- 2. Skripte: ASCII, BOM, Zeilenenden ------------------------------------
foreach ($file in Get-ChildItem -File skripte/*.jsx) {
    $bytes = [IO.File]::ReadAllBytes($file.FullName)
    $text  = [Text.Encoding]::UTF8.GetString($bytes)
    if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) { Warn "$($file.Name): UTF-8-BOM" }
    if ($text.Contains("`r`n")) { Warn "$($file.Name): CRLF-Zeilenenden" }
    $lines = $text -split "`n"
    for ($i = 0; $i -lt $lines.Length; $i++) {
        if ($lines[$i] -match '[^\x00-\x7F]') {
            Warn "$($file.Name):$($i + 1): Nicht-ASCII-Zeichen (Konvention: nur ASCII)"
        }
    }
}

# --- 3. Abgleich mit den Originalen im Elternordner --------------------------
$source = Split-Path -Parent $root
foreach ($file in Get-ChildItem -File skripte/*.jsx) {
    $orig = Join-Path $source $file.Name
    if (-not (Test-Path -LiteralPath $orig)) { Warn "$($file.Name): kein Original mehr in $source" }
    elseif ((Get-FileHash -LiteralPath $orig).Hash -ne (Get-FileHash -LiteralPath $file.FullName).Hash) {
        Warn "$($file.Name): Original ist neuer/anders - tools/sync.ps1 -Apply ausfuehren"
    }
}

# --- 4. Git: nichts Internes im Index ---------------------------------------
if (Get-Command git -ErrorAction SilentlyContinue) {
    if (Test-Path (Join-Path $root '.git')) {
        $tracked = & git ls-files
        $bad = $tracked | Where-Object { $_ -match '^(Automatisierung_Midterms|Script_BackUps|docs)/' }
        if ($bad) { Fail "Interne Dateien im Git-Index: $($bad -join ', ')" } else { Ok 'Git-Index frei von internen Ordnern' }
    }
} else {
    Warn 'git nicht installiert - Index-Pruefung uebersprungen'
}

Write-Host ""
Write-Host "$errors Fehler, $warnings Warnungen"
if ($errors -gt 0) { exit 1 } else { exit 0 }
