@echo off
setlocal EnableExtensions
call "%~dp0_load_connection.bat"
if errorlevel 1 goto :failed

ssh.exe -tt -p "%REMOTE_SSH_PORT%" "%REMOTE_ROOT_USER%@%REMOTE_HOST%" "bash '%REMOTE_ROOT_SCRIPTS%/50-manage-client-access.sh' migrate"
if errorlevel 1 goto :failed

pause
exit /b 0

:failed
echo.
echo Existing client migration failed.
pause
exit /b 1
