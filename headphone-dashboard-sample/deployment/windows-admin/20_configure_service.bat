@echo off
setlocal EnableExtensions
call "%~dp0_load_connection.bat"
if errorlevel 1 goto :failed

echo This configures the dashboard account, directories, and systemd unit.
echo It does not enable or start the service.
ssh.exe -tt -p "%REMOTE_SSH_PORT%" "%REMOTE_ROOT_USER%@%REMOTE_HOST%" "bash '%REMOTE_ROOT_SCRIPTS%/10-configure-dashboard-service.sh'"
if errorlevel 1 goto :failed

echo.
echo Dashboard service configuration completed.
pause
exit /b 0

:failed
echo.
echo Dashboard service configuration failed.
pause
exit /b 1
