[CmdletBinding()]
param(
  [Parameter(Mandatory = $false)]
  [string]$RepositoryRoot = (Get-Location).Path,

  [Parameter(Mandatory = $false)]
  [string]$PolicyPath,

  [Parameter(Mandatory = $false)]
  [string]$OutputPath
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$resolvedRoot = (Resolve-Path -LiteralPath $RepositoryRoot).Path
if ([string]::IsNullOrWhiteSpace($PolicyPath)) {
  $PolicyPath = Join-Path $resolvedRoot "config\embedded-repository-policy.json"
}
$resolvedPolicy = (Resolve-Path -LiteralPath $PolicyPath).Path
$temporaryOutput = [string]::IsNullOrWhiteSpace($OutputPath)
if ($temporaryOutput) {
  $OutputPath = Join-Path $env:TEMP "physiqueos-embedded-audit-$([guid]::NewGuid().ToString('N')).json"
}

try {
  & node (Join-Path $PSScriptRoot "auditEmbeddedRepositories.mjs") `
    --repository-root $resolvedRoot `
    --policy $resolvedPolicy `
    --output $OutputPath
  $auditExit = $LASTEXITCODE
  if (-not (Test-Path -LiteralPath $OutputPath)) {
    throw "Embedded-repository audit did not produce a report."
  }
  $report = Get-Content -Raw -LiteralPath $OutputPath | ConvertFrom-Json
  if ($auditExit -ne 0 -or -not $report.passed) {
    Write-Host "Embedded-repository audit blocked staging:" -ForegroundColor Red
    foreach ($violation in $report.violations) {
      Write-Host "  $violation" -ForegroundColor Red
    }
    throw "Embedded-repository audit failed before staging. No nested repository was cleaned, staged, or changed."
  }
  Write-Host "Embedded-repository audit passed ($($report.repositoryCount) configured repositories)." -ForegroundColor Green
} finally {
  if ($temporaryOutput -and (Test-Path -LiteralPath $OutputPath)) {
    Remove-Item -LiteralPath $OutputPath -Force
  }
}
