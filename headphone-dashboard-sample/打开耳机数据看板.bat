@echo off
setlocal

cd /d "%~dp0"

if "%PORT%"=="" (
  for /f %%P in ('powershell -NoProfile -ExecutionPolicy Bypass -Command "$listener=$null; foreach($p in 7362..7461){ try { $listener=[System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $p); $listener.Start(); $listener.Stop(); Write-Output $p; exit 0 } catch { if($listener){ try { $listener.Stop() } catch {} } } }; exit 1"') do set "PORT=%%P"
)

if "%PORT%"=="" (
  echo No available local port was found between 7362 and 7461.
  echo Please ask IT to allow localhost access for Python, or set PORT manually.
  pause
  exit /b 1
)

set "URL=http://127.0.0.1:%PORT%"
if "%HOST%"=="" set "HOST=0.0.0.0"

powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 1 '%URL%' | Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul
if not errorlevel 1 (
  start "" "%URL%"
  exit /b 0
)

where py >nul 2>nul
if not errorlevel 1 (
  set "PYTHON_CMD=py -3"
  goto run_server
)

where python >nul 2>nul
if not errorlevel 1 (
  set "PYTHON_CMD=python"
  goto run_server
)

echo Python 3 was not found.
echo Please install Python 3 first, then double-click this file again.
pause
exit /b 1

:run_server
echo Starting Earphone Research Dashboard...
echo Browser will open: %URL%
echo Other devices on the same LAN can open: http://YOUR_COMPUTER_IP:%PORT%
echo Keep this window open while using the dashboard.
echo.
start "" powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command "Start-Sleep -Seconds 1; Start-Process '%URL%'"
set "PORT=%PORT%"
%PYTHON_CMD% server\server.py
pause
