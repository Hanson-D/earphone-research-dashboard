$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptDir "client-config.ps1")

$stateRoot = Join-Path $env:LOCALAPPDATA "EarphoneDashboardTunnel\$ClientId"
$pidPath = Join-Path $stateRoot "tunnel.pid"

if (-not (Test-Path -LiteralPath $pidPath)) {
  Write-Host "Tunnel is not running."
  exit 0
}

$tunnelPid = [int](Get-Content -LiteralPath $pidPath -Raw)
$process = Get-Process -Id $tunnelPid -ErrorAction SilentlyContinue
if ($process -and $process.ProcessName -eq "ssh") {
  Stop-Process -Id $tunnelPid
  Write-Host "Tunnel stopped. PID: $tunnelPid"
} else {
  Write-Host "Recorded SSH process is no longer running."
}

Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
