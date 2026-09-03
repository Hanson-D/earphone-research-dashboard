@echo off
setlocal EnableExtensions
cd /d "%~dp0"

where py.exe >nul 2>&1
if errorlevel 1 (
  echo Python launcher py.exe was not found.
  echo Install 64-bit Python 3.9 or newer for Windows, then run this file again.
  pause
  exit /b 1
)

py -3 -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 9) else 1)"
if errorlevel 1 (
  echo Python 3.9 or newer is required.
  pause
  exit /b 1
)

if not exist ".build-venv\Scripts\python.exe" (
  echo Creating build environment...
  py -3 -m venv .build-venv
  if errorlevel 1 goto :failed
)

call ".build-venv\Scripts\activate.bat"
python -m pip install --upgrade pip
if errorlevel 1 goto :failed
python -m pip install --requirement requirements-build.txt
if errorlevel 1 goto :failed

python -m PyInstaller --noconfirm --clean --onefile --windowed --name EarphoneDashboardAdmin --collect-all paramiko dashboard_admin.py
if errorlevel 1 goto :failed

echo.
echo Build completed:
echo %CD%\dist\EarphoneDashboardAdmin.exe
pause
exit /b 0

:failed
echo.
echo Build failed. Review the messages above.
pause
exit /b 1
