@echo off
setlocal EnableExtensions

set "CONFIG_FILE=%~dp0.admin-connection.bat"

echo Earphone Dashboard remote administration setup
echo.
set /p "REMOTE_HOST=Linux server IP or DNS name: "
if not defined REMOTE_HOST (
  echo Server host is required.
  pause
  exit /b 1
)

set "CHECK_VALUE=%REMOTE_HOST%"
powershell.exe -NoProfile -Command "if ($env:CHECK_VALUE -match '^[A-Za-z0-9][A-Za-z0-9._:-]{0,252}$') { exit 0 } else { exit 1 }"
if errorlevel 1 (
  echo Server host contains unsupported characters.
  pause
  exit /b 1
)

set /p "REMOTE_SSH_PORT=SSH port [22]: "
if not defined REMOTE_SSH_PORT set "REMOTE_SSH_PORT=22"
set "CHECK_VALUE=%REMOTE_SSH_PORT%"
powershell.exe -NoProfile -Command "$p=0; if ([int]::TryParse($env:CHECK_VALUE,[ref]$p) -and $p -ge 1 -and $p -le 65535) { exit 0 } else { exit 1 }"
if errorlevel 1 (
  echo SSH port must be between 1 and 65535.
  pause
  exit /b 1
)

set /p "REMOTE_ROOT_USER=Linux administrator account [root]: "
if not defined REMOTE_ROOT_USER set "REMOTE_ROOT_USER=root"
set "CHECK_VALUE=%REMOTE_ROOT_USER%"
powershell.exe -NoProfile -Command "if ($env:CHECK_VALUE -match '^[A-Za-z_][A-Za-z0-9_-]{0,31}$') { exit 0 } else { exit 1 }"
if errorlevel 1 (
  echo Linux account name contains unsupported characters.
  pause
  exit /b 1
)

(
  echo @echo off
  echo set "REMOTE_HOST=%REMOTE_HOST%"
  echo set "REMOTE_SSH_PORT=%REMOTE_SSH_PORT%"
  echo set "REMOTE_ROOT_USER=%REMOTE_ROOT_USER%"
  echo set "REMOTE_APP_ROOT=/home/earphone/kanban/app"
  echo set "REMOTE_ROOT_SCRIPTS=/home/earphone/kanban/app/deployment/linux/root"
) >"%CONFIG_FILE%"

echo.
echo Connection configuration saved:
echo   Server: %REMOTE_HOST%:%REMOTE_SSH_PORT%
echo   Account: %REMOTE_ROOT_USER%
echo   Application: /home/earphone/kanban/app
echo.
pause
