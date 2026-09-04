$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Get-Command py.exe -ErrorAction SilentlyContinue)) {
    throw "Python 3.11 x64 is required. Install it locally on Windows before packaging."
}

$venv = Join-Path $PSScriptRoot ".venv-build"
$python = Join-Path $venv "Scripts\python.exe"
if (-not (Test-Path $python)) {
    py.exe -3.11 -m venv $venv
}

& $python -m pip install --disable-pip-version-check --upgrade pip
& $python -m pip install --disable-pip-version-check -r requirements-build.txt
$env:PYTHONPATH = $PSScriptRoot
& $python -m unittest discover -s tests -v
& $python -m PyInstaller --noconfirm --clean native-builder.spec

$exe = Join-Path $PSScriptRoot "dist\EarphoneProjectBuilder\EarphoneProjectBuilder.exe"
if (-not (Test-Path $exe)) {
    throw "Build completed without producing $exe"
}

& $exe --help
if ($LASTEXITCODE -ne 0) {
    throw "Packaged EXE failed the --help smoke test with exit code $LASTEXITCODE"
}

$hash = (Get-FileHash -Algorithm SHA256 $exe).Hash
$size = (Get-Item $exe).Length
Write-Host ""
Write-Host "Local Windows build verified." -ForegroundColor Green
Write-Host "Artifact: $exe"
Write-Host "Bytes: $size"
Write-Host "SHA256: $hash"
