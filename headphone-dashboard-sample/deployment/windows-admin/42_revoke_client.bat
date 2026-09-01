@echo off
setlocal EnableExtensions
call "%~dp0_load_connection.bat"
if errorlevel 1 goto :failed

set /p "CLIENT_ID=Client ID to revoke: "
set "CHECK_VALUE=%CLIENT_ID%"
powershell.exe -NoProfile -Command "if ($env:CHECK_VALUE -match '^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$') { exit 0 } else { exit 1 }"
if errorlevel 1 (
  echo Invalid client ID.
  goto :failed
)

ssh.exe -tt -p "%REMOTE_SSH_PORT%" "%REMOTE_ROOT_USER%@%REMOTE_HOST%" "bash '%REMOTE_ROOT_SCRIPTS%/33-revoke-client.sh' '%CLIENT_ID%'"
if errorlevel 1 goto :failed

echo.
echo Client revoked.
pause
exit /b 0

:failed
echo.
echo Client revocation failed or was cancelled.
pause
exit /b 1
