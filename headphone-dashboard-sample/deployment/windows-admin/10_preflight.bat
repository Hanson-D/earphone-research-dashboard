@echo off
setlocal EnableExtensions
call "%~dp0_load_connection.bat"
if errorlevel 1 goto :failed

ssh.exe -tt -p "%REMOTE_SSH_PORT%" "%REMOTE_ROOT_USER%@%REMOTE_HOST%" "bash '%REMOTE_ROOT_SCRIPTS%/00-preflight.sh'"
if errorlevel 1 goto :failed

echo.
echo Preflight completed successfully.
pause
exit /b 0

:failed
echo.
echo Preflight reported a failure.
pause
exit /b 1
