@echo off
setlocal

cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0launcher.ps1"

if errorlevel 1 (
  echo.
  echo Earphone Research Dashboard failed to start.
  echo Please send the log file to the project maintainer:
  echo %LOCALAPPDATA%\EarphoneDashboard\logs\launcher.log
  echo.
  pause
)
