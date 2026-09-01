$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptDir "client-config.ps1")

$stateRoot = Join-Path $env:LOCALAPPDATA "EarphoneDashboardTunnel\$ClientId"
$pidPath = Join-Path $stateRoot "tunnel.pid"
$url = "http://127.0.0.1:$LocalPort/"

Write-Host "Client ID: $ClientId"
Write-Host "Server: ${ServerHost}:$SshPort"
Write-Host "Dashboard URL: $url"

$running = $false
if (Test-Path -LiteralPath $pidPath) {
  $tunnelPid = [int](Get-Content -LiteralPath $pidPath -Raw)
  $process = Get-Process -Id $tunnelPid -ErrorAction SilentlyContinue
  if ($process -and $process.ProcessName -eq "ssh") {
    $running = $true
    Write-Host "Tunnel process: running (PID $tunnelPid)"
  }
}

if (-not $running) {
  Write-Host "Tunnel process: stopped"
}

try {
  Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2 | Out-Null
  Write-Host "Dashboard health: reachable"
} catch {
  Write-Host "Dashboard health: unavailable"
}
