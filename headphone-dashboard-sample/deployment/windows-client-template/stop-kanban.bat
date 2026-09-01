@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0stop-kanban.ps1"
if errorlevel 1 (
  echo Dashboard tunnel failed to stop cleanly.
)
pause
