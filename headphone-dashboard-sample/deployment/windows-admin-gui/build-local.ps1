$ErrorActionPreference = "Stop"

$adminRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$deploymentRoot = Split-Path -Parent $adminRoot
$clientRoot = Join-Path $deploymentRoot "windows-client-gui"
$venvPython = Join-Path $adminRoot ".build-venv\Scripts\python.exe"
$artifactRoot = Join-Path $adminRoot "dist"

if (-not (Get-Command py.exe -ErrorAction SilentlyContinue)) {
  throw "Python launcher py.exe was not found. Install 64-bit Python 3.9 or newer."
}

if (-not (Test-Path -LiteralPath $venvPython)) {
  & py.exe -3 -m venv (Join-Path $adminRoot ".build-venv")
  if ($LASTEXITCODE -ne 0) { throw "Failed to create the build environment." }
}

& $venvPython -m pip install --requirement (Join-Path $adminRoot "requirements-build.txt")
if ($LASTEXITCODE -ne 0) { throw "Failed to install pinned build dependencies." }

& $venvPython (Join-Path $adminRoot "admin_core_test.py")
if ($LASTEXITCODE -ne 0) { throw "Admin core tests failed." }
& $venvPython (Join-Path $clientRoot "client_launcher_test.py")
if ($LASTEXITCODE -ne 0) { throw "Client launcher tests failed." }

Push-Location $clientRoot
try {
  & $venvPython -m PyInstaller --noconfirm --clean --onefile --windowed --name OpenKanban client_launcher.py
  if ($LASTEXITCODE -ne 0) { throw "OpenKanban.exe build failed." }
} finally {
  Pop-Location
}

$clientExe = Join-Path $clientRoot "dist\OpenKanban.exe"
if (-not (Test-Path -LiteralPath $clientExe)) {
  throw "OpenKanban.exe was not created."
}

Push-Location $adminRoot
try {
  $binarySpec = "${clientExe};client-runtime"
  & $venvPython -m PyInstaller --noconfirm --clean --onefile --windowed `
    --name EarphoneDashboardAdmin --collect-all paramiko `
    --add-binary $binarySpec dashboard_admin.py
  if ($LASTEXITCODE -ne 0) { throw "EarphoneDashboardAdmin.exe build failed." }
} finally {
  Pop-Location
}

$adminExe = Join-Path $artifactRoot "EarphoneDashboardAdmin.exe"
if (-not (Test-Path -LiteralPath $adminExe)) {
  throw "EarphoneDashboardAdmin.exe was not created."
}
Copy-Item -LiteralPath $clientExe -Destination (Join-Path $artifactRoot "OpenKanban.exe") -Force

$hashLines = foreach ($path in @($adminExe, (Join-Path $artifactRoot "OpenKanban.exe"))) {
  $hash = Get-FileHash -Algorithm SHA256 -LiteralPath $path
  "{0}  {1}" -f $hash.Hash.ToLowerInvariant(), (Split-Path -Leaf $path)
}
$hashPath = Join-Path $artifactRoot "SHA256SUMS.txt"
$hashLines | Set-Content -LiteralPath $hashPath -Encoding ASCII

Write-Host "Local Windows build completed."
Write-Host "Artifacts: $artifactRoot"
Get-Content -LiteralPath $hashPath
