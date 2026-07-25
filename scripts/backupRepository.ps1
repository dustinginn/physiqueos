[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$DestinationDirectory,

  [switch]$IncludeRuntime
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location -LiteralPath $repositoryRoot

if (-not (Test-Path -LiteralPath ".git")) {
  throw "Run this script from the PhysiqueOS repository."
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

try {
  $bundlePath = Join-Path $backupDirectory "physiqueos.bundle"
  & git bundle create $bundlePath --all
  if ($LASTEXITCODE -ne 0) {
    throw "Git bundle creation failed."
  }

  & git bundle verify $bundlePath | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Git bundle verification failed."
  }

  $branch = (& git branch --show-current).Trim()
  $commit = (& git rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $commit) {
    throw "Unable to resolve the current Git commit."
  }

  $nodeVersion = (& node --version).Trim()
  $npmVersion = (& npm.cmd --version).Trim()
  $frameworkVersion = (& node -p "require('./node_modules/next/package.json').version").Trim()
  $runtimePath = Join-Path $repositoryRoot "private\founder\runtime-store.json"
  $runtimeRevision = "unavailable"
  $runtimeHash = "unavailable"
  if (Test-Path -LiteralPath $runtimePath) {
    $runtime = Get-Content -LiteralPath $runtimePath -Raw | ConvertFrom-Json
    $runtimeRevision = [string]$runtime.revision
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

  $manifestPath = Join-Path $backupDirectory "manifest.txt"
  @(
    "Timestamp: $timestamp"
    "Repository: physiqueos"
    "Branch: $branch"
    "Commit: $commit"
    "Node: $nodeVersion"
    "npm: $npmVersion"
    "Next.js: $frameworkVersion"
    "Founder runtime revision: $runtimeRevision"
    "Founder runtime SHA-256: $runtimeHash"
    "Runtime data included: $($runtimeIncluded.ToString().ToLowerInvariant())"
  ) | Set-Content -LiteralPath $manifestPath -Encoding utf8

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
  if (Test-Path -LiteralPath $backupDirectory) {
    Remove-Item -LiteralPath $backupDirectory -Recurse -Force
  }
  throw
}
