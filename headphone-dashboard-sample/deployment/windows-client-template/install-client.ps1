$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptDir "client-config.ps1")

if (-not (Get-Command ssh.exe -ErrorAction SilentlyContinue)) {
  throw "Windows OpenSSH Client was not found. Install the OpenSSH Client optional feature."
}

$sourceKey = Join-Path $scriptDir "key\$KeyName"
$sourceKnownHosts = Join-Path $scriptDir "known_hosts"
if (-not (Test-Path -LiteralPath $sourceKnownHosts)) {
  throw "Known hosts file not found: $sourceKnownHosts"
}

$stateRoot = Join-Path $env:LOCALAPPDATA "EarphoneDashboardTunnel\$ClientId"
New-Item -ItemType Directory -Path $stateRoot -Force | Out-Null

$targetKey = Join-Path $stateRoot $KeyName
$targetKnownHosts = Join-Path $stateRoot "known_hosts"
$targetConfig = Join-Path $stateRoot "client-config.ps1"
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$sourceKeyAvailable = Test-Path -LiteralPath $sourceKey

if ($sourceKeyAvailable) {
  if (Test-Path -LiteralPath $targetKey) {
    & icacls.exe $targetKey /grant:r "${identity}:(F)" | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to unlock the previously installed private key for this Windows user."
    }
    Remove-Item -LiteralPath $targetKey -Force
  }
  Copy-Item -LiteralPath $sourceKey -Destination $targetKey -Force
} elseif (-not (Test-Path -LiteralPath $targetKey)) {
  throw "This update package has no private key, and no existing key was found for this Windows user. Ask the administrator to recreate the client."
}
Copy-Item -LiteralPath $sourceKnownHosts -Destination $targetKnownHosts -Force
Copy-Item -LiteralPath (Join-Path $scriptDir "client-config.ps1") -Destination $targetConfig -Force

& icacls.exe $targetKey /inheritance:r | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Failed to disable inherited permissions on the private key."
}
& icacls.exe $targetKey /grant:r "${identity}:(R)" | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Failed to restrict the private key ACL."
}

Write-Host "Client installed successfully."
Write-Host "Client ID: $ClientId"
Write-Host "State directory: $stateRoot"
Write-Host "Dashboard URL: http://127.0.0.1:$LocalPort/"
