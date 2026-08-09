[CmdletBinding()]
param(
  [switch]$LocalOnly,

  [string]$VerifiedBackupPath,

  [ValidateSet("pending", "accepted", "not_requested")]
  [string]$ExternalReplicationStatus = "pending",

  [string]$LocalBackupDirectory = [System.IO.Path]::Combine(
    [Environment]::GetFolderPath("MyDocuments"),
    "PhysiqueOS Backups"
  ),

  [Alias("BackupDestination")]
  [string]$ExternalBackupDirectory = "G:\My Drive\PhysiqueOS Backups",

  [switch]$SkipExternalReplication,

  [ValidateRange(1, 86400)]
  [int]$ExternalReplicationTimeoutSeconds = 900,

  [string]$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$startedAt = Get-Date
$repositoryRoot = (Resolve-Path -LiteralPath $RepositoryRoot).Path
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
  Write-Host "Auditing embedded repositories before staging..." -ForegroundColor Cyan
  & (Join-Path $PSScriptRoot "assertSafeEmbeddedRepositories.ps1") `
    -RepositoryRoot $repositoryRoot

  Write-Host ""
  Invoke-CheckedGit -Arguments @("-c", "color.status=always", "status")

  if ($LocalOnly) {
    $localOnlyChanges = @(& git status --porcelain=v1 -uall)
    if ($LASTEXITCODE -ne 0) {
      throw "Unable to inspect the working tree for local-only closeout."
    }
    if ($localOnlyChanges.Count -gt 0) {
      throw (
        "Local-only closeout requires a clean working tree and index; " +
        "commit or discard changes through a separately reviewed workflow."
      )
    }
  }

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
    if ($LocalOnly) {
      throw (
        "Local-only closeout cannot create an unpushed commit; " +
        "staged changes must be resolved before closeout."
      )
    }
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

  $fullCommitHash = (& git rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $fullCommitHash) {
    throw "Unable to resolve the current commit."
  }
  $commitHash = $fullCommitHash.Substring(0, [Math]::Min(7, $fullCommitHash.Length))
  Write-Host "Commit: $commitHash" -ForegroundColor Green

  $pushOccurred = $false
  $upstream = (& git rev-parse --abbrev-ref --symbolic-full-name "@{upstream}" 2>$null).Trim()
  $hasUpstream = $LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($upstream)
  if ($LocalOnly) {
    if (-not $hasUpstream) {
      throw "Local-only closeout requires a configured upstream tracking branch."
    }

    $divergenceText = (& git rev-list --left-right --count "$upstream...HEAD").Trim()
    if ($LASTEXITCODE -ne 0) {
      throw "Unable to determine local/upstream divergence for local-only closeout."
    }
    $divergence = @($divergenceText -split '\s+')
    if ($divergence.Count -ne 2) {
      throw "Unexpected local/upstream divergence result: $divergenceText"
    }
    [long]$behindCount = 0
    [long]$aheadCount = 0
    if (
      -not [long]::TryParse($divergence[0], [ref]$behindCount) -or
      -not [long]::TryParse($divergence[1], [ref]$aheadCount)
    ) {
      throw "Unable to parse local/upstream divergence: $divergenceText"
    }
    if ($aheadCount -ne 0 -or $behindCount -ne 0) {
      throw (
        "Local-only closeout requires synchronized local/upstream refs; " +
        "ahead=$aheadCount behind=$behindCount."
      )
    }

    Write-Host (
      "Remote tracking ref already synchronized with local HEAD (0 ahead / 0 behind)."
    ) -ForegroundColor Green
    Write-Host "Push skipped by explicit local-only mode." -ForegroundColor Green
  } elseif ($hasUpstream) {
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
  $acceptedBackupPath = $null
  $acceptedManifestHash = $null
  $acceptedBundleHash = $null
  $externalBackupPath = $null
  $externalReplicationResult = if ($LocalOnly) {
    $ExternalReplicationStatus
  } else {
    "pending"
  }
  if ($LocalOnly) {
    if ([string]::IsNullOrWhiteSpace($VerifiedBackupPath)) {
      throw "Local-only closeout requires -VerifiedBackupPath."
    }
    Write-Host "Validating supplied local backup..." -ForegroundColor Cyan
    $backupVerificationOutput = @(& node `
      (Join-Path $PSScriptRoot "verifyRepositoryBackup.mjs") `
      --backup $VerifiedBackupPath `
      --expected-head $fullCommitHash `
      --expected-branch $branch)
    if ($LASTEXITCODE -ne 0) {
      throw "Supplied local backup failed verification."
    }
    $backupIdentity = ($backupVerificationOutput -join "`n") | ConvertFrom-Json
    $acceptedBackupPath = $backupIdentity.backupPath
    $acceptedManifestHash = $backupIdentity.manifestSha256
    $acceptedBundleHash = $backupIdentity.bundleSha256
    Write-Host "Verified local backup accepted: $acceptedBackupPath" -ForegroundColor Green
    Write-Host "External replication status: $ExternalReplicationStatus" -ForegroundColor Yellow
  } else {
    Write-Host "Creating verified local PhysiqueOS backup..." -ForegroundColor Cyan
    $backupResult = & (Join-Path $PSScriptRoot "backupRepository.ps1") `
      -DestinationDirectory $LocalBackupDirectory `
      -RepositoryRoot $repositoryRoot `
      -PassThru
    if (-not $backupResult -or -not $backupResult.BackupPath) {
      throw "Local backup did not return a completed backup path."
    }

    $localVerificationOutput = @(& node `
      (Join-Path $PSScriptRoot "verifyRepositoryBackup.mjs") `
      --backup $backupResult.BackupPath `
      --expected-head $fullCommitHash `
      --expected-branch $branch)
    if ($LASTEXITCODE -ne 0) {
      throw "New local backup failed independent verification."
    }
    $backupIdentity = ($localVerificationOutput -join "`n") | ConvertFrom-Json
    $acceptedBackupPath = $backupIdentity.backupPath
    $acceptedManifestHash = $backupIdentity.manifestSha256
    $acceptedBundleHash = $backupIdentity.bundleSha256
    Write-Host "Local backup verified: $acceptedBackupPath" -ForegroundColor Green

    if ($SkipExternalReplication) {
      Write-Warning (
        "External replication skipped explicitly. " +
        "The verified local backup is retained; off-machine backup remains pending."
      )
    } else {
      Write-Host "Replicating verified backup to external storage..." -ForegroundColor Cyan
      $replicationOutput = @(& node `
        (Join-Path $PSScriptRoot "replicateRepositoryBackup.mjs") `
        --source $acceptedBackupPath `
        --external-root $ExternalBackupDirectory `
        --timeout-ms ($ExternalReplicationTimeoutSeconds * 1000))
      $replicationExitCode = $LASTEXITCODE
      try {
        $replication = ($replicationOutput -join "`n") | ConvertFrom-Json
      } catch {
        $replication = $null
      }

      if (
        $replicationExitCode -eq 0 -and
        $replication -and
        $replication.status -eq "verified"
      ) {
        $externalReplicationResult = "verified"
        $externalBackupPath = $replication.externalBackupPath
        Write-Host (
          "External backup replica verified: $externalBackupPath " +
          "(Robocopy exit code $($replication.robocopyExitCode))."
        ) -ForegroundColor Green
      } else {
        $externalReplicationResult = "failed"
        if ($replication) {
          $externalBackupPath = $replication.externalBackupPath
          $replicationDetail = $replication.message
          $robocopyExit = $replication.robocopyExitCode
        } else {
          $externalBackupPath = $ExternalBackupDirectory
          $replicationDetail = "Replication did not return a valid result."
          $robocopyExit = "unavailable"
        }
        Write-Warning (
          "External replication failed (Robocopy exit code $robocopyExit): " +
          "$replicationDetail. The verified local backup remains accepted and retained."
        )
      }
    }
  }

  $elapsed = (Get-Date) - $startedAt
  Write-Host ""
  Write-Host "Session summary" -ForegroundColor Cyan
  Write-Host "  Branch: $branch"
  Write-Host "  Commit: $commitHash"
  Write-Host "  Pushed: $(if ($pushOccurred) { 'yes' } else { 'no' })"
  Write-Host "  Local-only: $($LocalOnly.ToString().ToLowerInvariant())"
  Write-Host "  Local backup: $acceptedBackupPath"
  if ($acceptedManifestHash) {
    Write-Host "  Backup manifest SHA-256: $acceptedManifestHash"
  }
  if ($acceptedBundleHash) {
    Write-Host "  Bundle SHA-256: $acceptedBundleHash"
  }
  Write-Host "  External replication: $externalReplicationResult"
  if ($externalBackupPath) {
    Write-Host "  External backup: $externalBackupPath"
  }
  Write-Host "  Elapsed: $($elapsed.ToString('hh\:mm\:ss'))"
  Write-Host ""
  if ($LocalOnly) {
    Write-Host "Local repository closeout accepted." -ForegroundColor Green
    Write-Host "End Work Session Complete" -ForegroundColor Green
  } elseif ($externalReplicationResult -eq "verified") {
    Write-Host "Repository closeout accepted." -ForegroundColor Green
    Write-Host "Off-machine backup replica accepted." -ForegroundColor Green
    Write-Host "End Work Session Complete" -ForegroundColor Green
  } else {
    Write-Host "Repository closeout accepted locally." -ForegroundColor Green
    Write-Warning "Off-machine backup requires follow-up."
    Write-Host "End Work Session Complete (local backup only)" -ForegroundColor Yellow
  }
} catch {
  Write-Error $_
  exit 1
}
