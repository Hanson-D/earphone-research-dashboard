@echo off
setlocal
call "%~dp0_load_connection.bat"
if errorlevel 1 goto :failed
echo Press Ctrl+C to stop following logs.
ssh.exe -tt -p "%REMOTE_SSH_PORT%" "%REMOTE_ROOT_USER%@%REMOTE_HOST%" "bash '%REMOTE_ROOT_SCRIPTS%/40-service-control.sh' logs"
exit /b %ERRORLEVEL%
:failed
echo Unable to open service logs.
pause
exit /b 1
