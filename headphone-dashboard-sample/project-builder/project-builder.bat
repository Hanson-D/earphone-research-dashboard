@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js 18 or newer is required.
  exit /b 1
)
node "%SCRIPT_DIR%cli.js" %*
exit /b %errorlevel%
