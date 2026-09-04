@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
if exist "%SCRIPT_DIR%dist\EarphoneProjectBuilder\EarphoneProjectBuilder.exe" (
  "%SCRIPT_DIR%dist\EarphoneProjectBuilder\EarphoneProjectBuilder.exe" %*
  exit /b %errorlevel%
)
py.exe -3.11 "%SCRIPT_DIR%native_entry.py" %*
exit /b %errorlevel%
