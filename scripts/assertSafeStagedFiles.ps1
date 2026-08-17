[CmdletBinding()]
param(
  [Parameter(Mandatory = $false)]
  [string]$RepositoryRoot = (Get-Location).Path
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$maximumBlobBytes = 100MB
$warningBlobBytes = 50MB
# Keep this artifact-family word list aligned with RECOVERY_NAME in scripts/providerBuildSafety.mjs.
$prohibitedGeneratedPath =
  '^(?:\.next(?:/|$)|\.next\.(?:failed|rollback|release|fallback|recovery|staging|stage)-[^/]+(?:/|$)|node_modules(?:/|$))'

function Invoke-CheckedGit {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )

  $output = @(& git @Arguments)
  if ($LASTEXITCODE -ne 0) {
    throw "Git command failed: git $($Arguments -join ' ')"
  }
  return $output
}

Set-Location -LiteralPath (Resolve-Path -LiteralPath $RepositoryRoot).Path

$insideWorkTree = (Invoke-CheckedGit -Arguments @(
  "rev-parse", "--is-inside-work-tree"
)).Trim()
if ($insideWorkTree -ne "true") {
  throw "Staged-file preflight requires a Git working tree."
}

$stagedPaths = @(Invoke-CheckedGit -Arguments @(
  "-c", "core.quotepath=false", "diff", "--cached", "--name-only",
  "--diff-filter=ACMR"
))
$violations = [System.Collections.Generic.List[string]]::new()

foreach ($path in $stagedPaths) {
  if ([string]::IsNullOrWhiteSpace($path)) {
    continue
  }

  $sizeText = (Invoke-CheckedGit -Arguments @("cat-file", "-s", ":$path")).Trim()
  [long]$sizeBytes = 0
  if (-not [long]::TryParse($sizeText, [ref]$sizeBytes)) {
    throw "Unable to determine the staged blob size for '$path'."
  }

  $sizeMiB = [Math]::Round($sizeBytes / 1MB, 2)
  if ($path -match $prohibitedGeneratedPath) {
    $violations.Add(
      "Prohibited generated path: $path ($sizeBytes bytes; $sizeMiB MiB)"
    )
  }
  if ($sizeBytes -gt $maximumBlobBytes) {
    $violations.Add(
      "Blob exceeds the 100 MiB GitHub limit: $path ($sizeBytes bytes; $sizeMiB MiB)"
    )
  } elseif ($sizeBytes -gt $warningBlobBytes) {
    Write-Warning (
      "Large staged blob requires review: $path ($sizeBytes bytes; $sizeMiB MiB)"
    )
  }
}

if ($violations.Count -gt 0) {
  Write-Host "Staged-file preflight rejected the following entries:" `
    -ForegroundColor Red
  foreach ($violation in $violations) {
    Write-Host "  $violation" -ForegroundColor Red
  }
  throw "Staged-file preflight failed; no files were deleted or unstaged."
}

Write-Host "Staged-file preflight passed." -ForegroundColor Green
