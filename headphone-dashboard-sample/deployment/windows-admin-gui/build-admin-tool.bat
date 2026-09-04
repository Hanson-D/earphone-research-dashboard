@echo off
setlocal EnableExtensions
cd /d "%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-local.ps1"
if errorlevel 1 goto :failed

echo.
echo Build completed:
echo %CD%\dist\EarphoneDashboardAdmin.exe
echo %CD%\dist\OpenKanban.exe
echo %CD%\dist\SHA256SUMS.txt
pause
exit /b 0

:failed
echo.
echo Build failed. Review the messages above.
pause
exit /b 1
