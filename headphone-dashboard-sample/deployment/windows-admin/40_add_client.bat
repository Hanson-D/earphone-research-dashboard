@echo off
setlocal EnableExtensions
call "%~dp0_load_connection.bat"
if errorlevel 1 goto :failed

set /p "CLIENT_ID=Client ID, for example win1: "
set "CHECK_VALUE=%CLIENT_ID%"
powershell.exe -NoProfile -Command "if ($env:CHECK_VALUE -match '^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$') { exit 0 } else { exit 1 }"
if errorlevel 1 (
  echo Invalid client ID.
  goto :failed
)

set /p "CLIENT_SERVER_HOST=Server IP or DNS name for this client: "
set "CHECK_VALUE=%CLIENT_SERVER_HOST%"
powershell.exe -NoProfile -Command "if ($env:CHECK_VALUE -match '^[A-Za-z0-9][A-Za-z0-9._:-]{0,252}$') { exit 0 } else { exit 1 }"
if errorlevel 1 (
  echo Invalid server IP or DNS name.
  goto :failed
)

set /p "CLIENT_LOCAL_PORT=Windows local port [automatic]: "
set "PORT_ARGUMENT="
if defined CLIENT_LOCAL_PORT (
  set "CHECK_VALUE=%CLIENT_LOCAL_PORT%"
  powershell.exe -NoProfile -Command "$p=0; if ([int]::TryParse($env:CHECK_VALUE,[ref]$p) -and $p -ge 1 -and $p -le 65535) { exit 0 } else { exit 1 }"
  if errorlevel 1 (
    echo Invalid local port.
    goto :failed
  )
  set "PORT_ARGUMENT=--local-port '%CLIENT_LOCAL_PORT%'"
)

ssh.exe -tt -p "%REMOTE_SSH_PORT%" "%REMOTE_ROOT_USER%@%REMOTE_HOST%" "bash '%REMOTE_ROOT_SCRIPTS%/30-add-client.sh' --client-id '%CLIENT_ID%' --server-host '%CLIENT_SERVER_HOST%' --ssh-port '%REMOTE_SSH_PORT%' %PORT_ARGUMENT%"
if errorlevel 1 goto :failed

set "DOWNLOAD_ROOT=%~dp0downloads"
if not exist "%DOWNLOAD_ROOT%" mkdir "%DOWNLOAD_ROOT%"

scp.exe -r -P "%REMOTE_SSH_PORT%" "%REMOTE_ROOT_USER%@%REMOTE_HOST%:/root/kanban-export/%CLIENT_ID%" "%DOWNLOAD_ROOT%\"
if errorlevel 1 goto :failed

echo.
echo Client created and downloaded:
echo   %DOWNLOAD_ROOT%\%CLIENT_ID%
echo.
echo Copy this directory to the assigned Windows computer.
pause
exit /b 0

:failed
echo.
echo Client creation failed.
pause
exit /b 1
