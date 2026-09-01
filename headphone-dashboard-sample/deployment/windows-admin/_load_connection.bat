@echo off
set "CONFIG_FILE=%~dp0.admin-connection.bat"

if not exist "%CONFIG_FILE%" (
  echo Connection configuration was not found.
  call "%~dp000_configure_connection.bat"
  if errorlevel 1 exit /b 1
)

call "%CONFIG_FILE%"

where ssh.exe >nul 2>nul
if errorlevel 1 (
  echo Windows OpenSSH Client was not found.
  echo Install the OpenSSH Client optional feature and try again.
  exit /b 1
)

where scp.exe >nul 2>nul
if errorlevel 1 (
  echo Windows SCP client was not found.
  echo Install the OpenSSH Client optional feature and try again.
  exit /b 1
)

exit /b 0
