@echo off
setlocal

cd /d "%~dp0\.."

if "%PORT%"=="" (
  for /f %%P in ('powershell -NoProfile -ExecutionPolicy Bypass -Command "$listener=$null; foreach($p in 7362..7461){ try { $listener=[System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $p); $listener.Start(); $listener.Stop(); Write-Output $p; exit 0 } catch { if($listener){ try { $listener.Stop() } catch {} } } }; exit 1"') do set "PORT=%%P"
)

if "%PORT%"=="" (
  echo No available local port was found between 7362 and 7461.
  echo Please set PORT manually or stop the program using these ports.
  pause
  exit /b 1
)

if "%HOST%"=="" set "HOST=0.0.0.0"
set "URL=http://127.0.0.1:%PORT%"

where py >nul 2>nul
if not errorlevel 1 (
  set "PYTHON_CMD=py -3"
  goto ensure_pillow
)

where python >nul 2>nul
if not errorlevel 1 (
  set "PYTHON_CMD=python"
  goto ensure_pillow
)

echo Python 3 was not found.
echo Please install Python 3 first, then run this file again.
pause
exit /b 1

:ensure_pillow
%PYTHON_CMD% -c "import PIL" >nul 2>nul
if errorlevel 1 (
  echo Installing Pillow for faster photo thumbnails...
  %PYTHON_CMD% -m pip install Pillow
  if errorlevel 1 (
    echo Pillow installation failed. The dashboard will still run, but thumbnails may load more slowly.
  )
)

:run_server
echo Starting Earphone Research Dashboard...
echo Local test entry: %URL%
echo LAN users should open: http://SERVER_IP:%PORT%
echo.
start "" powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command "Start-Sleep -Seconds 1; Start-Process '%URL%'"
set "PORT=%PORT%"
%PYTHON_CMD% server\server.py
pause
