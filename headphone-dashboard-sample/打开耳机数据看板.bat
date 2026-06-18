@echo off
setlocal

cd /d "%~dp0"

if "%PORT%"=="" set "PORT=8000"
set "URL=http://127.0.0.1:%PORT%"

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
echo Keep this window open while using the dashboard.
echo.
start "" powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command "Start-Sleep -Seconds 1; Start-Process '%URL%'"
%PYTHON_CMD% server.py
pause
