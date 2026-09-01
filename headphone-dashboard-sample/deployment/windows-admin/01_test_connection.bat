@echo off
setlocal EnableExtensions
call "%~dp0_load_connection.bat"
if errorlevel 1 goto :failed

echo Testing SSH connection to %REMOTE_ROOT_USER%@%REMOTE_HOST%:%REMOTE_SSH_PORT%...
ssh.exe -p "%REMOTE_SSH_PORT%" "%REMOTE_ROOT_USER%@%REMOTE_HOST%" "id && test -f '%REMOTE_APP_ROOT%/server/server.py' && echo Application found"
if errorlevel 1 goto :failed

echo.
echo Connection test passed.
pause
exit /b 0

:failed
echo.
echo Connection test failed.
pause
exit /b 1
