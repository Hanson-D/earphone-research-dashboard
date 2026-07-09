$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$defaultConfigPath = Join-Path $scriptDir "launcher-config.json"
$exampleConfigPath = Join-Path $scriptDir "launcher-config.example.json"

function Expand-ConfigPath {
  param([string]$PathValue)
  return [Environment]::ExpandEnvironmentVariables($PathValue)
}

function Write-LauncherLog {
  param([string]$Message)
  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  $line = "[$timestamp] $Message"
  Write-Host $line
  if ($script:LogPath) {
    Add-Content -LiteralPath $script:LogPath -Value $line -Encoding UTF8
  }
}

function Read-JsonFile {
  param([string]$Path)
  return Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
}

function Get-FreePort {
  param(
    [int]$PreferredPort,
    [int]$Limit
  )
  foreach ($port in $PreferredPort..($PreferredPort + $Limit - 1)) {
    $listener = $null
    try {
      $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse("127.0.0.1"), $port)
      $listener.Start()
      return $port
    } catch {
      if ($listener) {
        try { $listener.Stop() } catch {}
      }
    } finally {
      if ($listener) {
        try { $listener.Stop() } catch {}
      }
    }
  }
  throw "No available port was found between $PreferredPort and $($PreferredPort + $Limit - 1)."
}

function Copy-Version {
  param(
    [string]$SourcePath,
    [string]$TargetPath
  )
  $tempPath = "$TargetPath.tmp"
  if (Test-Path -LiteralPath $tempPath) {
    Remove-Item -LiteralPath $tempPath -Recurse -Force
  }
  New-Item -ItemType Directory -Path $tempPath -Force | Out-Null
  Copy-Item -Path (Join-Path $SourcePath "*") -Destination $tempPath -Recurse -Force
  if (Test-Path -LiteralPath $TargetPath) {
    Remove-Item -LiteralPath $TargetPath -Recurse -Force
  }
  Move-Item -LiteralPath $tempPath -Destination $TargetPath
}

function Find-LatestCachedVersion {
  param([string]$VersionsRoot)
  if (!(Test-Path -LiteralPath $VersionsRoot)) {
    return $null
  }
  $dirs = Get-ChildItem -LiteralPath $VersionsRoot -Directory | Sort-Object Name -Descending
  if ($dirs.Count -eq 0) {
    return $null
  }
  return $dirs[0].FullName
}

if (!(Test-Path -LiteralPath $defaultConfigPath)) {
  if (Test-Path -LiteralPath $exampleConfigPath) {
    Copy-Item -LiteralPath $exampleConfigPath -Destination $defaultConfigPath
  } else {
    throw "Missing launcher-config.json."
  }
}

$config = Read-JsonFile $defaultConfigPath
$localRoot = Expand-ConfigPath $config.localRoot
if (-not $localRoot) {
  $localRoot = Join-Path $env:LOCALAPPDATA "EarphoneDashboard"
}
$logsRoot = Join-Path $localRoot "logs"
$versionsRoot = Join-Path $localRoot "versions"
New-Item -ItemType Directory -Path $logsRoot, $versionsRoot -Force | Out-Null
$script:LogPath = Join-Path $logsRoot "launcher.log"

Write-LauncherLog "Launcher started."

$releaseRoot = Expand-ConfigPath $config.releaseRoot
$preferredPort = 7362
if ($config.preferredPort) {
  $preferredPort = [int]$config.preferredPort
}
$portSearchLimit = 100
if ($config.portSearchLimit) {
  $portSearchLimit = [int]$config.portSearchLimit
}
$selectedVersionPath = $null
$selectedVersion = $null

try {
  $latestPath = Join-Path $releaseRoot "latest.json"
  Write-LauncherLog "Checking release metadata: $latestPath"
  $latest = Read-JsonFile $latestPath
  $selectedVersion = [string]$latest.version
  if (-not $selectedVersion) {
    throw "latest.json does not contain version."
  }
  $sourcePath = Expand-ConfigPath $latest.path
  if (-not $sourcePath) {
    $sourcePath = Join-Path (Join-Path $releaseRoot "versions") $selectedVersion
  }
  if (!(Test-Path -LiteralPath $sourcePath)) {
    throw "Release version path does not exist: $sourcePath"
  }
  $targetPath = Join-Path $versionsRoot $selectedVersion
  if (!(Test-Path -LiteralPath $targetPath)) {
    Write-LauncherLog "Copying version $selectedVersion to local cache."
    Copy-Version -SourcePath $sourcePath -TargetPath $targetPath
  } else {
    Write-LauncherLog "Using cached version $selectedVersion."
  }
  $selectedVersionPath = $targetPath
} catch {
  Write-LauncherLog "Update check failed: $($_.Exception.Message)"
  $selectedVersionPath = Find-LatestCachedVersion $versionsRoot
  if (-not $selectedVersionPath) {
    throw "No cached dashboard version is available."
  }
  Write-LauncherLog "Falling back to cached version: $selectedVersionPath"
}

$appPath = Join-Path $selectedVersionPath "app"
if (!(Test-Path -LiteralPath $appPath)) {
  $appPath = $selectedVersionPath
}
if (!(Test-Path -LiteralPath (Join-Path $appPath "server\server.py"))) {
  throw "server/server.py was not found in selected version: $appPath"
}

$port = Get-FreePort -PreferredPort $preferredPort -Limit $portSearchLimit
$url = "http://127.0.0.1:$port"
Write-LauncherLog "Starting local dashboard service on port $port."

$pythonCommand = $null
if (Get-Command py -ErrorAction SilentlyContinue) {
  $pythonCommand = "py"
  $pythonArgs = @("-3", "server\server.py")
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
  $pythonCommand = "python"
  $pythonArgs = @("server\server.py")
} else {
  throw "Python 3 was not found."
}

$env:PORT = [string]$port
$process = Start-Process -FilePath $pythonCommand `
  -ArgumentList $pythonArgs `
  -WorkingDirectory $appPath `
  -WindowStyle Hidden `
  -PassThru

Start-Sleep -Seconds 1
for ($i = 0; $i -lt 20; $i++) {
  try {
    Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 $url | Out-Null
    break
  } catch {
    Start-Sleep -Milliseconds 300
  }
}

Write-LauncherLog "Opening browser: $url"
Start-Process $url
Write-LauncherLog "Launcher finished. Service PID: $($process.Id)"
