param(
  [Parameter(Mandatory = $true)]
  [string]$Tag
)

$ErrorActionPreference = "Stop"
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$artifactRoot = Join-Path $scriptRoot "dist"
$artifacts = @(
  (Join-Path $artifactRoot "EarphoneDashboardAdmin.exe"),
  (Join-Path $artifactRoot "OpenKanban.exe"),
  (Join-Path $artifactRoot "SHA256SUMS.txt")
)

foreach ($artifact in $artifacts) {
  if (-not (Test-Path -LiteralPath $artifact)) {
    throw "Missing local build artifact: $artifact. Run build-admin-tool.bat first."
  }
}
if (-not (Get-Command gh.exe -ErrorAction SilentlyContinue)) {
  throw "GitHub CLI gh.exe was not found."
}

& gh.exe auth status
if ($LASTEXITCODE -ne 0) { throw "GitHub CLI is not authenticated." }

& gh.exe release view $Tag *> $null
if ($LASTEXITCODE -ne 0) {
  & gh.exe release create $Tag --title $Tag --notes "Locally built Windows executables."
  if ($LASTEXITCODE -ne 0) { throw "Failed to create GitHub release $Tag." }
}

& gh.exe release upload $Tag @artifacts --clobber
if ($LASTEXITCODE -ne 0) { throw "Failed to upload local Windows artifacts." }
& gh.exe release view $Tag --web
