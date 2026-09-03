@echo off
setlocal EnableExtensions
cd /d "%~dp0"

if not exist ".build-venv\Scripts\python.exe" (
  echo Run build-admin-tool.bat first to create the environment.
  pause
  exit /b 1
)

call ".build-venv\Scripts\activate.bat"
python dashboard_admin.py
if errorlevel 1 pause
