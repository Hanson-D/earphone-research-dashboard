@echo off
setlocal
call "%~dp0_load_connection.bat"
if errorlevel 1 goto :failed
ssh.exe -tt -p "%REMOTE_SSH_PORT%" "%REMOTE_ROOT_USER%@%REMOTE_HOST%" "bash '%REMOTE_ROOT_SCRIPTS%/40-service-control.sh' start"
if errorlevel 1 goto :failed
echo Service started.
pause
exit /b 0
:failed
echo Service start failed.
pause
exit /b 1
