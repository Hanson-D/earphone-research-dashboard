@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-client.ps1"
if errorlevel 1 (
  echo Installation failed.
) else (
  echo Installation completed.
)
pause
