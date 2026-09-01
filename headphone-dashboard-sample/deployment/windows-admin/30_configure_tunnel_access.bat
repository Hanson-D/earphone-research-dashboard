@echo off
setlocal EnableExtensions
call "%~dp0_load_connection.bat"
if errorlevel 1 goto :failed

echo This configures the restricted SSH tunnel group.
echo It does not create client accounts or restart the dashboard.
ssh.exe -tt -p "%REMOTE_SSH_PORT%" "%REMOTE_ROOT_USER%@%REMOTE_HOST%" "bash '%REMOTE_ROOT_SCRIPTS%/20-configure-tunnel-access.sh'"
if errorlevel 1 goto :failed

echo.
echo Tunnel access configuration completed.
pause
exit /b 0

:failed
echo.
echo Tunnel access configuration failed.
pause
exit /b 1
