$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js 18 or newer is required to build the Windows executable."
}

New-Item -ItemType Directory -Force -Path "dist" | Out-Null
npx.cmd --yes "@yao-pkg/pkg@6.22.0" package.json --targets node22-win-x64 --output "dist/dashboard-project-builder.exe" --compress GZip

if (-not (Test-Path "dist/dashboard-project-builder.exe")) {
    throw "Build completed without producing dist/dashboard-project-builder.exe"
}

Write-Host ""
Write-Host "Built: $PSScriptRoot\dist\dashboard-project-builder.exe" -ForegroundColor Green
