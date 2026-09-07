$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Invoke-CheckedNative {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$ArgumentList = @(),
        [Parameter(Mandatory = $true)][string]$Step
    )

    Write-Host ""
    Write-Host "==> $Step" -ForegroundColor Cyan
    & $FilePath @ArgumentList
    if ($LASTEXITCODE -ne 0) {
        throw "$Step failed with exit code $LASTEXITCODE"
    }
}

$log = Join-Path $PSScriptRoot "build-windows-exe.log"
$transcriptStarted = $false
$failure = $null

try {
    Start-Transcript -Path $log -Force | Out-Null
    $transcriptStarted = $true

    $launcher = Get-Command py.exe -ErrorAction SilentlyContinue
    if (-not $launcher) {
        throw "Python Launcher (py.exe) was not found. Install Python 3.11 x64 from python.org and enable the launcher."
    }

    # PySide6 contains deeply nested QML resources. Keeping the virtual
    # environment below a long clone path can exceed legacy MAX_PATH during
    # pip extraction and misleadingly report a missing PageIndicatorDelegate
    # asset. Use a short, builder-specific location instead.
    $venv = Join-Path ([System.IO.Path]::GetTempPath()) "EPB-py311-x64"
    $python = Join-Path $venv "Scripts\python.exe"
    Write-Host "Build environment: $venv"
    if (-not (Test-Path $python)) {
        Invoke-CheckedNative -FilePath $launcher.Source -ArgumentList @("-3.11", "-m", "venv", $venv) -Step "Create Python 3.11 build environment"
    }

    Invoke-CheckedNative -FilePath $python -ArgumentList @(
        "-c",
        "import platform, sys; assert sys.version_info[:2] == (3, 11), sys.version; assert platform.architecture()[0] == '64bit', platform.architecture(); print(sys.version); print(platform.architecture()[0])"
    ) -Step "Validate Python 3.11 x64"
    Invoke-CheckedNative -FilePath $python -ArgumentList @(
        "-m", "pip", "install", "--disable-pip-version-check", "--requirement", "requirements-build.txt"
    ) -Step "Install pinned build dependencies"

    $env:PYTHONPATH = $PSScriptRoot
    Invoke-CheckedNative -FilePath $python -ArgumentList @(
        "-m", "unittest", "discover", "-s", "tests", "-v"
    ) -Step "Run Python tests"
    Invoke-CheckedNative -FilePath $python -ArgumentList @(
        "-m", "PyInstaller", "--noconfirm", "--clean", "native-builder.spec"
    ) -Step "Package EarphoneProjectBuilder"

    $exe = Join-Path $PSScriptRoot "dist\EarphoneProjectBuilder\EarphoneProjectBuilder.exe"
    if (-not (Test-Path $exe)) {
        throw "PyInstaller returned success but did not produce $exe"
    }

    $smoke = Join-Path ([System.IO.Path]::GetTempPath()) ("EarphoneProjectBuilder-self-check-{0}.json" -f $PID)
    if (Test-Path $smoke) {
        Remove-Item -LiteralPath $smoke -Force
    }
    $smokeArgument = '--self-check="{0}"' -f $smoke.Replace('"', '\"')
    Write-Host ""
    Write-Host "==> Smoke test packaged Windows application" -ForegroundColor Cyan
    $process = Start-Process -FilePath $exe -ArgumentList $smokeArgument -Wait -PassThru
    if ($process.ExitCode -ne 0) {
        throw "Packaged EXE self-check failed with exit code $($process.ExitCode)"
    }
    if (-not (Test-Path $smoke)) {
        throw "Packaged EXE exited without producing its self-check result"
    }
    $smokeResult = Get-Content -LiteralPath $smoke -Raw | ConvertFrom-Json
    Remove-Item -LiteralPath $smoke -Force
    if ($smokeResult.status -ne "ok") {
        throw "Packaged EXE returned an invalid self-check result"
    }

    $hash = (Get-FileHash -Algorithm SHA256 $exe).Hash
    $size = (Get-Item $exe).Length
    Write-Host ""
    Write-Host "Local Windows build verified." -ForegroundColor Green
    Write-Host "Artifact: $exe"
    Write-Host "Bytes: $size"
    Write-Host "SHA256: $hash"
}
catch {
    $failure = $_
}
finally {
    if ($transcriptStarted) {
        Stop-Transcript | Out-Null
    }
}

if ($null -ne $failure) {
    Write-Host ""
    Write-Host "Windows EXE build failed: $($failure.Exception.Message)" -ForegroundColor Red
    Write-Host "Full log: $log" -ForegroundColor Yellow
    throw $failure
}

Write-Host "Build log: $log"
