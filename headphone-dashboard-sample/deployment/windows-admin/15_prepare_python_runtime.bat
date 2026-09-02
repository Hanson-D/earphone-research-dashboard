@echo off
setlocal EnableExtensions
call "%~dp0_load_connection.bat"
if errorlevel 1 goto :failed

echo This clones the root Anaconda environment into an isolated dashboard runtime.
echo Source: /root/anaconda3/bin/python3
echo Target: /opt/earphone-dashboard/python
echo It does not configure or start the dashboard service.
ssh.exe -tt -p "%REMOTE_SSH_PORT%" "%REMOTE_ROOT_USER%@%REMOTE_HOST%" "bash '%REMOTE_ROOT_SCRIPTS%/05-prepare-python-runtime.sh'"
if errorlevel 1 goto :failed

echo.
echo Dashboard Python runtime preparation completed.
pause
exit /b 0

:failed
echo.
echo Dashboard Python runtime preparation failed.
pause
exit /b 1
