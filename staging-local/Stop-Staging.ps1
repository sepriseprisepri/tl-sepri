# Stops only the local stack belonging to this directory.
[CmdletBinding()]
param()
$ErrorActionPreference = "Stop"
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not (Test-Path (Join-Path $dir "supabase/config.toml"))) { throw "Konfigurasi staging lokal belum dibuat." }
if (-not (Get-Command npx.cmd -ErrorAction SilentlyContinue)) { throw "Node.js/npm tidak ditemukan." }
Push-Location $dir
try {
  # Intentionally omit --all and --no-backup, to preserve local test data.
  & npx.cmd --yes "supabase@2.122.1" stop
  if ($LASTEXITCODE -ne 0) { throw "Gagal menghentikan staging lokal." }
  Write-Host "Staging lokal dihentikan; data uji lokal tetap disimpan." -ForegroundColor Green
} finally { Pop-Location }
