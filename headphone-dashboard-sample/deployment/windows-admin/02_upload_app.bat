@echo off
setlocal EnableExtensions
call "%~dp0_load_connection.bat"
if errorlevel 1 goto :failed

where tar.exe >nul 2>nul
if errorlevel 1 (
  echo Windows tar.exe was not found.
  goto :failed
)

set "LOCAL_APP_ROOT=%~dp0..\.."
echo Local application: %LOCAL_APP_ROOT%
echo Remote application: %REMOTE_HOST%:%REMOTE_APP_ROOT%
echo Existing remote files may be overwritten, but remote-only files are not deleted.
set /p "CONFIRM_UPLOAD=Continue with upload? [y/N]: "
if /i not "%CONFIRM_UPLOAD%"=="y" (
  echo Upload cancelled.
  pause
  exit /b 0
)

echo Authenticate once to upload and verify the application.
tar.exe --exclude=.git --exclude=projects --exclude=.cache --exclude=.pycache --exclude=__pycache__ --exclude=*.pyc --exclude=.DS_Store --exclude=.admin-connection.bat --exclude=deployment/windows-admin/downloads --exclude=downloads -C "%LOCAL_APP_ROOT%" -cf - . | ssh.exe -p "%REMOTE_SSH_PORT%" "%REMOTE_ROOT_USER%@%REMOTE_HOST%" "command -v tar >/dev/null 2>&1 || { echo 'Remote tar command was not found.' >&2; exit 127; }; mkdir -p '%REMOTE_APP_ROOT%' && tar -C '%REMOTE_APP_ROOT%' -xf - && test -f '%REMOTE_APP_ROOT%/server/server.py' && test -f '%REMOTE_APP_ROOT%/deployment/linux/root/10-configure-dashboard-service.sh' && echo 'Upload received and verified.'"
if errorlevel 1 goto :failed

echo.
echo Upload completed.
pause
exit /b 0

:failed
echo.
echo Upload failed.
pause
exit /b 1
