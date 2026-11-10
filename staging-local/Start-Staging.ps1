# Samsung Kalteng LOCAL ONLY — no cloud project is linked or modified.
[CmdletBinding()]
param()
$ErrorActionPreference = "Stop"
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$network = "samsung-kalteng-local"
$cli = "supabase@2.122.1"
if (-not (Get-Command docker.exe -ErrorAction SilentlyContinue)) { throw "Docker Desktop belum terpasang. Instal Docker Desktop untuk Windows dan aktifkan WSL2." }
if (-not (Get-Command npx.cmd -ErrorAction SilentlyContinue)) { throw "Node.js/npm belum terpasang. Instal Node.js LTS terlebih dahulu." }
& docker.exe info *> $null
if ($LASTEXITCODE -ne 0) { throw "Docker Desktop belum berjalan. Jalankan Docker Desktop lalu ulangi." }
$existing = & docker.exe network ls --filter "name=^$network$" --format "{{.Name}}"
if ($LASTEXITCODE -ne 0) { throw "Gagal memeriksa jaringan Docker." }
if ($existing -notcontains $network) {
  & docker.exe network create -o "com.docker.network.bridge.host_binding_ipv4=127.0.0.1" $network
  if ($LASTEXITCODE -ne 0) { throw "Gagal membuat jaringan lokal tertutup." }
}
Push-Location $dir
try {
  if (-not (Test-Path (Join-Path $dir "supabase/config.toml"))) {
    & npx.cmd --yes $cli init
    if ($LASTEXITCODE -ne 0) { throw "Inisialisasi Supabase lokal gagal." }
  }
  & npx.cmd --yes $cli start --network-id $network
  if ($LASTEXITCODE -ne 0) { throw "Supabase lokal gagal dijalankan. Periksa Docker Desktop, memori, dan konflik port 54321-54324." }
  & npx.cmd --yes $cli status
  Write-Host "STAGING LOKAL AKTIF. Studio: http://127.0.0.1:54323" -ForegroundColor Green
  Write-Host "Tidak ada project cloud yang ditautkan. Gunakan HANYA data dummy." -ForegroundColor Yellow
} finally { Pop-Location }
