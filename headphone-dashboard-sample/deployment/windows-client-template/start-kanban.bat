@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-kanban.ps1"
if errorlevel 1 (
  echo Dashboard tunnel failed to start.
  pause
)
