[CmdletBinding()]
param()
$ErrorActionPreference = "Stop"
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not (Test-Path (Join-Path $dir "supabase/config.toml"))) { throw "Staging lokal belum diinisialisasi. Jalankan Start-Staging.ps1." }
Push-Location $dir
try {
  & npx.cmd --yes "supabase@2.122.1" status
  if ($LASTEXITCODE -ne 0) { throw "Supabase lokal belum aktif atau Docker Desktop belum berjalan." }
} finally { Pop-Location }
