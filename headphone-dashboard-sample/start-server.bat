@echo off
setlocal

cd /d "%~dp0"

if "%PORT%"=="" set "PORT=8000"
if "%HOST%"=="" set "HOST=0.0.0.0"
set "DASHBOARD_LEGACY_PATHS=0"
set "URL=http://127.0.0.1:%PORT%/server.html"

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
echo Please install Python 3 first, then run this file again.
pause
exit /b 1

:run_server
echo Starting Earphone Research Dashboard server mode...
echo Local test entry: %URL%
echo LAN users should open: http://SERVER_IP:%PORT%/server.html
echo.
%PYTHON_CMD% server.py
pause
