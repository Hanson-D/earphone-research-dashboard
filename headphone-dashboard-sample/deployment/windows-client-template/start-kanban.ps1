$ErrorActionPreference = "Stop"

$bundleDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $bundleDir "client-config.ps1")

$stateRoot = Join-Path $env:LOCALAPPDATA "EarphoneDashboardTunnel\$ClientId"
$stateConfig = Join-Path $stateRoot "client-config.ps1"
if (-not (Test-Path -LiteralPath $stateConfig)) {
  throw "Client is not installed. Run install-client.bat first."
}
. $stateConfig

$keyPath = Join-Path $stateRoot $KeyName
$knownHostsPath = Join-Path $stateRoot "known_hosts"
$pidPath = Join-Path $stateRoot "tunnel.pid"
$baseUrl = "http://127.0.0.1:$LocalPort/"
$url = "${baseUrl}?access_token=$([uri]::EscapeDataString($AccessToken))"

if (Test-Path -LiteralPath $pidPath) {
  $existingPid = [int](Get-Content -LiteralPath $pidPath -Raw)
  $existing = Get-Process -Id $existingPid -ErrorAction SilentlyContinue
  if ($existing -and $existing.ProcessName -eq "ssh") {
    Write-Host "Tunnel is already running. PID: $existingPid"
    Start-Process $url
    exit 0
  }
  Remove-Item -LiteralPath $pidPath -Force
}

$listener = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $LocalPort `
  -State Listen -ErrorAction SilentlyContinue
if ($listener) {
  throw "Local port $LocalPort is already in use."
}

$arguments = @(
  "-N",
  "-i", "`"$keyPath`"",
  "-p", "$SshPort",
  "-L", "${LocalPort}:127.0.0.1:${RemotePort}",
  "-o", "BatchMode=yes",
  "-o", "ExitOnForwardFailure=yes",
  "-o", "ServerAliveInterval=30",
  "-o", "ServerAliveCountMax=3",
  "-o", "StrictHostKeyChecking=yes",
  "-o", "UserKnownHostsFile=`"$knownHostsPath`"",
  "${SshUser}@${ServerHost}"
) -join " "

$process = Start-Process -FilePath "ssh.exe" -ArgumentList $arguments `
  -WindowStyle Hidden -PassThru
$process.Id | Set-Content -LiteralPath $pidPath -Encoding ASCII

$ready = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  Start-Sleep -Milliseconds 300
  if ($process.HasExited) {
    Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
    throw "SSH tunnel exited before it became ready. Exit code: $($process.ExitCode)"
  }
  $probe = New-Object System.Net.Sockets.TcpClient
  try {
    $pending = $probe.BeginConnect("127.0.0.1", $LocalPort, $null, $null)
    if ($pending.AsyncWaitHandle.WaitOne(250) -and $probe.Connected) {
      $probe.EndConnect($pending)
      $ready = $true
      break
    }
  } catch {
    # Keep waiting.
  } finally {
    $probe.Close()
  }
}

if (-not $ready) {
  Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
  throw "Tunnel started, but the dashboard health check did not pass."
}

Write-Host "Tunnel started. PID: $($process.Id)"
Write-Host "Dashboard URL: $baseUrl"
Start-Process $url
