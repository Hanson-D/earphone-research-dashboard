@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-windows-exe.ps1"
if errorlevel 1 (
  echo.
  echo [ERROR] Windows EXE build failed.
  echo Full log: %~dp0build-windows-exe.log
  exit /b 1
)
exit /b 0
