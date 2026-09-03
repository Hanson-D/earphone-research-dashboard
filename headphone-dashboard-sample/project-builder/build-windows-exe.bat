@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-windows-exe.ps1"
if errorlevel 1 (
  echo.
  echo [ERROR] Windows EXE build failed.
  exit /b 1
)
exit /b 0
