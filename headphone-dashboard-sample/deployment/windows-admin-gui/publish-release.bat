@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "RELEASE_TAG=%~1"
if not defined RELEASE_TAG set /p "RELEASE_TAG=GitHub release tag: "
if not defined RELEASE_TAG (
  echo Release tag is required.
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0publish-release.ps1" -Tag "%RELEASE_TAG%"
if errorlevel 1 (
  echo.
  echo Publish failed. Review the error above.
  pause
  exit /b 1
)

echo.
echo Local build artifacts were uploaded to GitHub release %RELEASE_TAG%.
pause
