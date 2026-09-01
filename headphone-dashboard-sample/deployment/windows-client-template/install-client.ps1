$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptDir "client-config.ps1")

if (-not (Get-Command ssh.exe -ErrorAction SilentlyContinue)) {
  throw "Windows OpenSSH Client was not found. Install the OpenSSH Client optional feature."
}

$sourceKey = Join-Path $scriptDir "key\$KeyName"
$sourceKnownHosts = Join-Path $scriptDir "known_hosts"
if (-not (Test-Path -LiteralPath $sourceKey)) {
  throw "Private key not found: $sourceKey"
}
if (-not (Test-Path -LiteralPath $sourceKnownHosts)) {
  throw "Known hosts file not found: $sourceKnownHosts"
}

$stateRoot = Join-Path $env:LOCALAPPDATA "EarphoneDashboardTunnel\$ClientId"
New-Item -ItemType Directory -Path $stateRoot -Force | Out-Null

$targetKey = Join-Path $stateRoot $KeyName
$targetKnownHosts = Join-Path $stateRoot "known_hosts"
$targetConfig = Join-Path $stateRoot "client-config.ps1"

Copy-Item -LiteralPath $sourceKey -Destination $targetKey -Force
Copy-Item -LiteralPath $sourceKnownHosts -Destination $targetKnownHosts -Force
Copy-Item -LiteralPath (Join-Path $scriptDir "client-config.ps1") -Destination $targetConfig -Force

$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $targetKey /inheritance:r | Out-Null
& icacls.exe $targetKey /grant:r "${identity}:(R)" | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Failed to restrict the private key ACL."
}

Write-Host "Client installed successfully."
Write-Host "Client ID: $ClientId"
Write-Host "State directory: $stateRoot"
Write-Host "Dashboard URL: http://127.0.0.1:$LocalPort/"
