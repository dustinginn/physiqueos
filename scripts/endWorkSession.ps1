[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$startedAt = Get-Date
$backupDestination = "G:\My Drive\PhysiqueOS Backups"
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location -LiteralPath $repositoryRoot

function Invoke-CheckedGit {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )

  & git @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Git command failed: git $($Arguments -join ' ')"
  }
}

try {
  Write-Host "Verifying repository..." -ForegroundColor Cyan
  $insideWorkTree = (& git rev-parse --is-inside-work-tree).Trim()
  if ($LASTEXITCODE -ne 0 -or $insideWorkTree -ne "true") {
    throw "The workspace is not a healthy Git working tree."
  }

  $branch = (& git branch --show-current).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $branch) {
    throw "End Work Session requires an active branch; detached HEAD is not supported."
  }

  $unmerged = @(& git diff --name-only --diff-filter=U)
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to inspect the repository for unresolved conflicts."
  }
  if ($unmerged.Count -gt 0) {
    throw "Resolve all merge conflicts before ending the work session."
  }

  Write-Host ""
  Invoke-CheckedGit -Arguments @("-c", "color.status=always", "status")

  Write-Host ""
  Write-Host "Staging tracked and untracked changes..." -ForegroundColor Cyan
  Invoke-CheckedGit -Arguments @("add", "-A")

  & (Join-Path $PSScriptRoot "assertSafeStagedFiles.ps1") `
    -RepositoryRoot $repositoryRoot

  & git diff --cached --quiet
  $stagedDiffExitCode = $LASTEXITCODE
  if ($stagedDiffExitCode -eq 0) {
    Write-Host "Working tree already clean." -ForegroundColor Green
  } elseif ($stagedDiffExitCode -eq 1) {
    $commitMessage = [Environment]::GetEnvironmentVariable(
      "PHYSIQUEOS_SESSION_COMMIT_MESSAGE"
    )
    if ([string]::IsNullOrWhiteSpace($commitMessage)) {
      $commitMessage = "End of work session - $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
    }
    Write-Host "Creating commit..." -ForegroundColor Cyan
    Invoke-CheckedGit -Arguments @("commit", "-m", $commitMessage)
  } else {
    throw "Unable to determine whether staged changes exist."
  }

  $commitHash = (& git rev-parse --short HEAD).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $commitHash) {
    throw "Unable to resolve the current commit."
  }
  Write-Host "Commit: $commitHash" -ForegroundColor Green

  $pushOccurred = $false
  & git rev-parse --abbrev-ref --symbolic-full-name "@{upstream}" 2>$null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "Pushing to the current branch upstream..." -ForegroundColor Cyan
    Invoke-CheckedGit -Arguments @("push")
    $pushOccurred = $true
  } else {
    Write-Host "No upstream is configured for '$branch'; push skipped." -ForegroundColor Yellow
  }

  Write-Host ""
  Invoke-CheckedGit -Arguments @("-c", "color.status=always", "status")
  $remainingChanges = @(& git status --porcelain)
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to verify the final working tree."
  }
  if ($remainingChanges.Count -gt 0) {
    throw "The working tree is not clean. Backup was not started."
  }
  Write-Host "Repository clean." -ForegroundColor Green

  Write-Host ""
  Write-Host "========================================"
  Write-Host "Running PhysiqueOS backup..." -ForegroundColor Cyan
  & (Join-Path $PSScriptRoot "backupRepository.ps1") -DestinationDirectory $backupDestination
  Write-Host "Backup verified." -ForegroundColor Green

  $elapsed = (Get-Date) - $startedAt
  Write-Host ""
  Write-Host "Session summary" -ForegroundColor Cyan
  Write-Host "  Branch: $branch"
  Write-Host "  Commit: $commitHash"
  Write-Host "  Pushed: $(if ($pushOccurred) { 'yes' } else { 'no' })"
  Write-Host "  Backup destination: $backupDestination"
  Write-Host "  Elapsed: $($elapsed.ToString('hh\:mm\:ss'))"
  Write-Host ""
  Write-Host "End Work Session Complete" -ForegroundColor Green
} catch {
  Write-Error $_
  exit 1
}
