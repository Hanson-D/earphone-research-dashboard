@echo off
setlocal EnableExtensions
call "%~dp0_load_connection.bat"
if errorlevel 1 goto :failed

ssh.exe -tt -p "%REMOTE_SSH_PORT%" "%REMOTE_ROOT_USER%@%REMOTE_HOST%" "bash '%REMOTE_ROOT_SCRIPTS%/11-initialize-dashboard.sh'"
if errorlevel 1 goto :failed

echo.
echo Dashboard data initialization completed.
pause
exit /b 0

:failed
echo.
echo Dashboard data initialization failed.
pause
exit /b 1
