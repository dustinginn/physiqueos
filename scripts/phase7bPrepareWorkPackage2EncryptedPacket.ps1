[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidateSet("Inspect", "CaptureEncryptReplicate")][string]$Operation,
  [Parameter()][string]$AttemptId,
  [Parameter()][string]$AuthorizationPath,
  [Parameter()][string]$ExpectedAuthorizationSha256,
  [Parameter()][string]$CapturePlanPath,
  [Parameter()][string]$ExpectedCapturePlanSha256,
  [Parameter()][string]$SourceRoot,
  [Parameter()][string]$LocalOutputDirectory,
  [Parameter()][string]$ReplicaDirectory,
  [Parameter()][string]$AgeExePath,
  [Parameter()][string]$ExpectedAgeExeSha256
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot "phase7bIsolatedGuestContract.psm1") -Force
Import-Module (Join-Path $PSScriptRoot "phase7bWorkPackage2Contract.psm1") -Force
$contract = Get-Phase7BWorkPackage2Contract

if ($Operation -eq "Inspect") {
  [ordered]@{
    classification = "PHASE7B_WP2_CAPTURE_TOOLING_READY_INERT"
    pass = $true
    applicationCommit = $contract.applicationCommit
    environmentId = $contract.environmentId
    vmDisplayName = $contract.vmDisplayName
    authorizationStage = "WP2B_CAPTURE"
    interactiveSecretPromptRequired = $true
    plaintextSecretFilePermitted = $false
    commandLineSecretPermitted = $false
    clipboardSecretPermitted = $false
    automaticRetryAllowed = $false
    mutationPerformed = $false
  } | ConvertTo-Json -Depth 5
  exit 0
}

$mutationStarted = $false
$stage = "validate-input"
$plaintextRoot = $null
$plainZipPath = $null
$localPacketPath = $null
$accepted = $false
try {
  foreach ($requiredValue in @($AttemptId, $AuthorizationPath, $ExpectedAuthorizationSha256, $CapturePlanPath,
      $ExpectedCapturePlanSha256, $SourceRoot, $LocalOutputDirectory, $ReplicaDirectory, $AgeExePath, $ExpectedAgeExeSha256)) {
    if ([string]::IsNullOrWhiteSpace($requiredValue)) { throw "PHASE7B_WP2_CAPTURE_ARGUMENT_REQUIRED" }
  }
  if ($ExpectedCapturePlanSha256 -notmatch '^[0-9a-fA-F]{64}$' -or $ExpectedAgeExeSha256 -notmatch '^[0-9a-fA-F]{64}$') { throw "PHASE7B_WP2_CAPTURE_HASH_ARGUMENT_INVALID" }
  if (-not (Test-Path -LiteralPath $CapturePlanPath -PathType Leaf) -or
      (Get-Phase7BSha256 -LiteralPath $CapturePlanPath) -ne $ExpectedCapturePlanSha256.ToLowerInvariant()) { throw "PHASE7B_WP2_CAPTURE_PLAN_HASH_MISMATCH" }
  if (-not (Test-Path -LiteralPath $AgeExePath -PathType Leaf) -or
      (Get-Phase7BSha256 -LiteralPath $AgeExePath) -ne $ExpectedAgeExeSha256.ToLowerInvariant()) { throw "PHASE7B_WP2_AGE_IDENTITY_MISMATCH" }
  $ageVersion = @(& $AgeExePath --version 2>&1) -join " "
  if ($LASTEXITCODE -ne 0 -or $ageVersion -notmatch '(?i)\bage\s+v?1\.(?:3|[4-9]|[1-9][0-9])\.') { throw "PHASE7B_WP2_AGE_VERSION_UNSUPPORTED" }
  if ($Host.Name -ne "ConsoleHost" -or -not [Environment]::UserInteractive) { throw "PHASE7B_WP2_INTERACTIVE_SECRET_CONSOLE_REQUIRED" }

  $source = (Resolve-Path -LiteralPath $SourceRoot -ErrorAction Stop).Path.TrimEnd('\')
  $sourceRootSha256 = Get-Phase7BSha256 -Text $source.ToLowerInvariant()
  $localBase = [IO.Path]::GetFullPath($LocalOutputDirectory).TrimEnd('\')
  $replicaBase = [IO.Path]::GetFullPath($ReplicaDirectory).TrimEnd('\')
  $localOutputRootSha256 = Get-Phase7BSha256 -Text $localBase.ToLowerInvariant()
  $replicaRootSha256 = Get-Phase7BSha256 -Text $replicaBase.ToLowerInvariant()
  foreach ($destination in @($localBase, $replicaBase)) {
    if ($destination.Equals($source, [StringComparison]::OrdinalIgnoreCase) -or
        $destination.StartsWith($source + '\', [StringComparison]::OrdinalIgnoreCase)) { throw "PHASE7B_WP2_OUTPUT_INSIDE_SOURCE_REJECTED" }
  }
  if ($localBase.Equals($replicaBase, [StringComparison]::OrdinalIgnoreCase) -or
      $localBase.StartsWith($replicaBase + '\', [StringComparison]::OrdinalIgnoreCase) -or
      $replicaBase.StartsWith($localBase + '\', [StringComparison]::OrdinalIgnoreCase)) { throw "PHASE7B_WP2_REPLICA_NOT_INDEPENDENT" }

  $plan = Get-Content -LiteralPath $CapturePlanPath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
  if ([int]$plan.schemaVersion -ne 1 -or [string]$plan.classification -ne "PHASE7B_WP2_CAPTURE_PLAN" -or
      [string]$plan.attemptId -ne $AttemptId -or
      [string]$plan.applicationCommit -ne $contract.applicationCommit -or [string]$plan.environmentId -ne $contract.environmentId -or
      [string]$plan.vmDisplayName -ne $contract.vmDisplayName -or [string]$plan.windowsHostId -ne $contract.windowsHostId -or
      [string]$plan.manifestDigest -ne $contract.manifestDigest -or [string]$plan.sourceRootSha256 -ne $sourceRootSha256) {
    throw "PHASE7B_WP2_CAPTURE_PLAN_BINDING_MISMATCH"
  }
  $inventory = New-Phase7BWorkPackage2Inventory -SourceRoot $source -Entries @($plan.files)
  if ([string]$plan.sourceInventorySha256 -ne $inventory.inventorySha256 -or [int]$plan.fileCount -ne $inventory.fileCount -or
      [int64]$plan.totalBytes -ne $inventory.totalBytes) { throw "PHASE7B_WP2_CAPTURE_PLAN_INVENTORY_MISMATCH" }
  [void](Assert-Phase7BWorkPackage2Authorization -LiteralPath $AuthorizationPath -ExpectedSha256 $ExpectedAuthorizationSha256 `
    -ExpectedStage "WP2B_CAPTURE" -ExpectedAttemptId $AttemptId -ExpectedSourceInventorySha256 $inventory.inventorySha256 `
    -ExpectedSourceRootSha256 $sourceRootSha256 -ExpectedCapturePlanSha256 $ExpectedCapturePlanSha256 `
    -ExpectedLocalOutputRootSha256 $localOutputRootSha256 -ExpectedReplicaRootSha256 $replicaRootSha256)

  $localAttemptRoot = Join-Path $localBase $AttemptId
  $replicaAttemptRoot = Join-Path $replicaBase $AttemptId
  if ((Test-Path -LiteralPath $localAttemptRoot) -or (Test-Path -LiteralPath $replicaAttemptRoot)) { throw "PHASE7B_WP2_ATTEMPT_OUTPUT_EXISTS" }
  New-Item -ItemType Directory -Path $localAttemptRoot -ErrorAction Stop | Out-Null
  New-Item -ItemType Directory -Path $replicaAttemptRoot -ErrorAction Stop | Out-Null
  $mutationStarted = $true
  $plaintextRoot = Join-Path $localAttemptRoot ".plaintext-incomplete"
  New-Item -ItemType Directory -Path $plaintextRoot -ErrorAction Stop | Out-Null

  $stage = "capture-stable-source"
  foreach ($file in @($inventory.files)) {
    $sourcePath = Join-Path $source (([string]$file.sourceRelativePath).Replace('/', '\'))
    $destinationPath = Join-Path $plaintextRoot (([string]$file.logicalPath).Replace('/', '\'))
    $destinationParent = Split-Path -Parent $destinationPath
    if (-not (Test-Path -LiteralPath $destinationParent -PathType Container)) { New-Item -ItemType Directory -Path $destinationParent -Force | Out-Null }
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) { throw "PHASE7B_WP2_SOURCE_MISSING_BEFORE_COPY" }
    if (-not (Test-Path -LiteralPath $destinationParent -PathType Container)) { throw "PHASE7B_WP2_DESTINATION_PARENT_CREATE_FAIL" }
    [IO.File]::Copy($sourcePath, $destinationPath, $false)
    if ((Get-Phase7BSha256 -LiteralPath $sourcePath) -ne [string]$file.sha256 -or
        (Get-Phase7BSha256 -LiteralPath $destinationPath) -ne [string]$file.sha256) { throw "PHASE7B_WP2_SOURCE_CHANGED_OR_COPY_MISMATCH" }
  }
  $publicFiles = @($inventory.files | ForEach-Object { [ordered]@{ logicalPath = $_.logicalPath; bytes = $_.bytes; sha256 = $_.sha256 } })
  $packetManifest = [ordered]@{
    schemaVersion = 1
    classification = "PHASE7B_WP2_DECRYPTED_PACKET_MANIFEST"
    attemptId = $AttemptId
    applicationCommit = $contract.applicationCommit
    environmentId = $contract.environmentId
    vmDisplayName = $contract.vmDisplayName
    windowsHostId = $contract.windowsHostId
    manifestDigest = $contract.manifestDigest
    sourceInventorySha256 = $inventory.inventorySha256
    sourceRootSha256 = $sourceRootSha256
    capturePlanSha256 = $ExpectedCapturePlanSha256.ToLowerInvariant()
    localOutputRootSha256 = $localOutputRootSha256
    replicaRootSha256 = $replicaRootSha256
    replicaClassification = 'OFF_MACHINE_OR_INDEPENDENT_STORAGE'
    fileCount = $inventory.fileCount
    totalBytes = $inventory.totalBytes
    files = $publicFiles
  }
  $manifestJson = ConvertTo-Phase7BCanonicalJson -InputObject $packetManifest
  $manifestPath = Join-Path $plaintextRoot "packet-manifest.json.source"
  $manifestBytes = (New-Object Text.UTF8Encoding($false)).GetBytes($manifestJson)
  $manifestStream = New-Object IO.FileStream($manifestPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
  try {
    $manifestStream.Write($manifestBytes, 0, $manifestBytes.Length)
    $manifestStream.Flush($true)
  } finally {
    $manifestStream.Dispose()
  }
  $plainZipPath = Join-Path $localAttemptRoot "$AttemptId.zip"
  $zipFiles = @($inventory.files | ForEach-Object { [pscustomobject]@{ logicalPath = $_.logicalPath } })
  [void](New-Phase7BDeterministicPacketZip -SourceRoot $plaintextRoot -Files $zipFiles -ManifestPath $manifestPath -OutputPath $plainZipPath)

  $stage = "interactive-age-encryption"
  $localPacketPath = Join-Path $localAttemptRoot "$AttemptId$($contract.packetExtension)"
  Write-Host "PHASE7B_WP2_ENTER_PASSPHRASE_IN_AGE_TTY"
  & $AgeExePath -p -o $localPacketPath $plainZipPath
  if ($LASTEXITCODE -ne 0) { throw "PHASE7B_WP2_AGE_ENCRYPTION_FAILED" }
  $packetSha = Get-Phase7BSha256 -LiteralPath $localPacketPath
  $packet = Test-Phase7BEncryptedPacket -LiteralPath $localPacketPath -ExpectedSha256 $packetSha
  if (-not $packet.pass) { throw $packet.classification }

  $stage = "replicate-and-verify"
  $replicaPacketPath = Join-Path $replicaAttemptRoot (Split-Path -Leaf $localPacketPath)
  [IO.File]::Copy($localPacketPath, $replicaPacketPath, $false)
  $replica = Test-Phase7BPacketReplica -LocalPacketPath $localPacketPath -ReplicaPacketPath $replicaPacketPath -ExpectedSha256 $packetSha
  if (-not $replica.pass) { throw $replica.classification }

  $descriptor = [ordered]@{
    schemaVersion = 1
    classification = "PHASE7B_WP2_ENCRYPTED_PACKET_AND_REPLICA_PASS"
    attemptId = $AttemptId
    applicationCommit = $contract.applicationCommit
    environmentId = $contract.environmentId
    vmDisplayName = $contract.vmDisplayName
    windowsHostId = $contract.windowsHostId
    manifestDigest = $contract.manifestDigest
    sourceInventorySha256 = $inventory.inventorySha256
    sourceRootSha256 = $sourceRootSha256
    capturePlanSha256 = $ExpectedCapturePlanSha256.ToLowerInvariant()
    localOutputRootSha256 = $localOutputRootSha256
    replicaRootSha256 = $replicaRootSha256
    replicaClassification = 'OFF_MACHINE_OR_INDEPENDENT_STORAGE'
    packetFileName = Split-Path -Leaf $localPacketPath
    packetSha256 = $packetSha
    packetBytes = $packet.packetBytes
    localEncryptedCopyPass = $true
    independentEncryptedReplicaPass = $true
    plaintextSecretPersisted = $false
    automaticRetryAllowed = $false
  }
  $descriptorPath = Join-Path $localAttemptRoot "$AttemptId-descriptor.json"
  $descriptorBytes = (New-Object Text.UTF8Encoding($false)).GetBytes((ConvertTo-Phase7BCanonicalJson -InputObject $descriptor))
  $descriptorStream = New-Object IO.FileStream($descriptorPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
  try {
    $descriptorStream.Write($descriptorBytes, 0, $descriptorBytes.Length)
    $descriptorStream.Flush($true)
  } finally {
    $descriptorStream.Dispose()
  }
  $accepted = $true
  [ordered]@{
    classification = $descriptor.classification
    pass = $true
    attemptId = $AttemptId
    packetFileName = $descriptor.packetFileName
    packetSha256 = $packetSha
    packetBytes = $packet.packetBytes
    descriptorFileName = Split-Path -Leaf $descriptorPath
    descriptorSha256 = Get-Phase7BSha256 -LiteralPath $descriptorPath
    sourceInventorySha256 = $inventory.inventorySha256
    fileCount = $inventory.fileCount
    replicaPass = $true
    plaintextSecretPersisted = $false
    automaticRetryAllowed = $false
  } | ConvertTo-Json -Depth 5
} catch {
  $safeCode = if ($_.Exception.Message -match '^PHASE7B_') { $_.Exception.Message } else { "PHASE7B_WP2_CAPTURE_EXCEPTION" }
  [ordered]@{
    classification = "PHASE7B_WP2_CAPTURE_FAIL"
    pass = $false
    safeStage = $stage
    safeErrorCode = $safeCode
    safeExceptionType = $_.Exception.GetType().Name
    safeLine = $_.InvocationInfo.ScriptLineNumber
    mutationStarted = $mutationStarted
    automaticRetryAllowed = $false
    newFounderAuthorizationRequired = $mutationStarted
  } | ConvertTo-Json -Depth 4
  exit 1
} finally {
  foreach ($plaintextPath in @($plainZipPath, $plaintextRoot)) {
    if (-not [string]::IsNullOrWhiteSpace($plaintextPath) -and (Test-Path -LiteralPath $plaintextPath)) {
      $full = [IO.Path]::GetFullPath($plaintextPath)
      if ($full -match [regex]::Escape($AttemptId)) { Remove-Item -LiteralPath $full -Recurse -Force }
    }
  }
  if (-not $accepted -and -not [string]::IsNullOrWhiteSpace($localPacketPath) -and (Test-Path -LiteralPath $localPacketPath)) {
    $fullPacket = [IO.Path]::GetFullPath($localPacketPath)
    if ($fullPacket -match [regex]::Escape($AttemptId)) { Remove-Item -LiteralPath $fullPacket -Force }
  }
}
