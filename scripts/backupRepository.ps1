[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$DestinationDirectory,

  [switch]$IncludeRuntime
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$policyPath = Join-Path $repositoryRoot "config\embedded-repository-policy.json"
$completenessScript = Join-Path $PSScriptRoot "backupCompleteness.mjs"
$completenessReportPath = [System.IO.Path]::GetTempFileName()
$backupDirectory = $null
Set-Location -LiteralPath $repositoryRoot

if (-not (Test-Path -LiteralPath ".git")) {
  throw "Run this script from the PhysiqueOS repository."
}

try {
  $workingTreeChanges = @(& git status --porcelain=v1 -uall)
  if ($LASTEXITCODE -ne 0) {
    throw "Unable to inspect the working tree before backup."
  }
  if ($workingTreeChanges.Count -gt 0) {
    throw "Backup requires a clean, committed root working tree; uncommitted source cannot be represented by a Git bundle."
  }

  & node $completenessScript `
    --repository-root $repositoryRoot `
    --policy $policyPath `
    --output $completenessReportPath
  if ($LASTEXITCODE -ne 0) {
    throw "Backup completeness audit failed. No backup was created."
  }

  $completeness = Get-Content -LiteralPath $completenessReportPath -Raw | ConvertFrom-Json
  if (-not $completeness.passed) {
    throw "Backup completeness audit did not pass. No backup was created."
  }

  $destinationRoot = [System.IO.Path]::GetFullPath($DestinationDirectory)
  if (-not (Test-Path -LiteralPath $destinationRoot)) {
    New-Item -ItemType Directory -Path $destinationRoot | Out-Null
  }

  $timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
  $backupDirectory = Join-Path $destinationRoot "PhysiqueOS_Backup_$timestamp"
  if (Test-Path -LiteralPath $backupDirectory) {
    throw "Backup destination already exists: $backupDirectory"
  }
  New-Item -ItemType Directory -Path $backupDirectory | Out-Null

  $branch = (& git branch --show-current).Trim()
  $commit = (& git rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $commit) {
    throw "Unable to resolve the current Git commit."
  }

  $bundlePath = Join-Path $backupDirectory "physiqueos.bundle"
  & git bundle create $bundlePath --all
  if ($LASTEXITCODE -ne 0) {
    throw "Git bundle creation failed."
  }

  & git bundle verify $bundlePath | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Git bundle verification failed."
  }
  $bundleHash = (Get-FileHash -LiteralPath $bundlePath -Algorithm SHA256).Hash

  $completenessDestination = Join-Path $backupDirectory "backup-completeness.json"
  Copy-Item -LiteralPath $completenessReportPath -Destination $completenessDestination

  $nodeVersion = (& node --version).Trim()
  $npmVersion = (& npm.cmd --version).Trim()
  $frameworkVersion = (& node -p "require('./node_modules/next/package.json').version").Trim()
  $runtimePath = Join-Path $repositoryRoot "private\founder\runtime-store.json"
  $runtimeRevision = $null
  $runtimeLastCommitId = $null
  $runtimeBytes = $null
  $runtimeModifiedUtc = $null
  $runtimeHash = $null
  if (Test-Path -LiteralPath $runtimePath) {
    $runtimeFile = Get-Item -LiteralPath $runtimePath
    $runtimeRaw = Get-Content -LiteralPath $runtimePath -Raw
    $revisionMatch = [regex]::Match($runtimeRaw, '"revision"\s*:\s*(\d+)')
    $lastCommitMatch = [regex]::Match($runtimeRaw, '"lastCommitId"\s*:\s*"([^"]+)"')
    if ($revisionMatch.Success) { $runtimeRevision = [long]$revisionMatch.Groups[1].Value }
    if ($lastCommitMatch.Success) { $runtimeLastCommitId = $lastCommitMatch.Groups[1].Value }
    $runtimeBytes = $runtimeFile.Length
    $runtimeModifiedUtc = $runtimeFile.LastWriteTimeUtc.ToString("o")
    $runtimeHash = (Get-FileHash -LiteralPath $runtimePath -Algorithm SHA256).Hash
  }

  $runtimeIncluded = $false
  if ($IncludeRuntime) {
    if (-not (Test-Path -LiteralPath $runtimePath)) {
      throw "Founder runtime file is unavailable."
    }
    $runtimeExportDirectory = Join-Path $backupDirectory "optional-safe-runtime-export"
    New-Item -ItemType Directory -Path $runtimeExportDirectory | Out-Null
    Copy-Item -LiteralPath $runtimePath -Destination (Join-Path $runtimeExportDirectory "runtime-store.json")
    $runtimeIncluded = $true
  }

  $manifest = [ordered]@{
    schemaVersion = "physiqueos_backup_manifest_v2"
    createdAtUtc = (Get-Date).ToUniversalTime().ToString("o")
    repository = "physiqueos"
    branch = $branch
    commit = $commit
    bundle = [ordered]@{
      file = "physiqueos.bundle"
      sha256 = $bundleHash
      verificationStatus = "verified"
    }
    completeness = [ordered]@{
      passed = [bool]$completeness.passed
      reportFile = "backup-completeness.json"
      nestedRepositoryCount = [int]$completeness.nestedAudit.repositoryCount
      externalArtifacts = @($completeness.externalArtifacts)
    }
    founderRuntimeSnapshot = [ordered]@{
      present = (Test-Path -LiteralPath $runtimePath)
      included = $runtimeIncluded
      revision = $runtimeRevision
      lastCommitId = $runtimeLastCommitId
      bytes = $runtimeBytes
      modifiedUtc = $runtimeModifiedUtc
      sha256 = $runtimeHash
    }
    toolVersions = [ordered]@{
      node = $nodeVersion
      npm = $npmVersion
      next = $frameworkVersion
    }
  }
  $manifestJsonPath = Join-Path $backupDirectory "manifest.json"
  $manifest | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $manifestJsonPath -Encoding utf8

  $manifestTextPath = Join-Path $backupDirectory "manifest.txt"
  @(
    "Repository: physiqueos"
    "Branch: $branch"
    "Commit: $commit"
    "Bundle SHA-256: $bundleHash"
    "Bundle verification: verified"
    "Backup completeness: passed"
    "Founder runtime revision: $(if ($null -eq $runtimeRevision) { 'unavailable' } else { $runtimeRevision })"
    "Founder runtime SHA-256: $(if ($null -eq $runtimeHash) { 'unavailable' } else { $runtimeHash })"
    "Runtime data included: $($runtimeIncluded.ToString().ToLowerInvariant())"
  ) | Set-Content -LiteralPath $manifestTextPath -Encoding utf8

  $checksumPath = Join-Path $backupDirectory "checksums.txt"
  Get-ChildItem -LiteralPath $backupDirectory -File -Recurse |
    Where-Object { $_.FullName -ne $checksumPath } |
    Sort-Object FullName |
    ForEach-Object {
      $relativePath = $_.FullName.Substring($backupDirectory.Length).TrimStart([char[]]@("\", "/"))
      $hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
      "$hash  $relativePath"
    } | Set-Content -LiteralPath $checksumPath -Encoding utf8

  Write-Output "Backup created and verified: $backupDirectory"
} catch {
  if ($backupDirectory -and (Test-Path -LiteralPath $backupDirectory)) {
    Remove-Item -LiteralPath $backupDirectory -Recurse -Force
  }
  throw
} finally {
  if (Test-Path -LiteralPath $completenessReportPath) {
    Remove-Item -LiteralPath $completenessReportPath -Force
  }
}
