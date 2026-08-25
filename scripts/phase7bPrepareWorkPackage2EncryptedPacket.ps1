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
Import-Module (Join-Path $PSScriptRoot "phase7bWorkPackage2OperatorLifecycle.psm1") -Force
Import-Module (Join-Path $PSScriptRoot "phase7bBoundedReplicaTransport.psm1") -Force
Import-Module (Join-Path $PSScriptRoot "phase7bWorkPackage2Contract.psm1") -Force
Import-Module (Join-Path $PSScriptRoot "phase7bIsolatedGuestContract.psm1") -Force
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
    independentLaptopReadbackRequired = $true
    persistentReplicaInfrastructureRequired = $false
    mutationPerformed = $false
  } | ConvertTo-Json -Depth 5
  $global:LASTEXITCODE = 0
  return
}

$mutationStarted = $false
$stage = "validate-input"
$plaintextRoot = $null
$plainZipPath = $null
$localPacketPath = $null
$replicaPacketPath = $null
$descriptorPath = $null
$localAttemptRoot = $null
$localAttemptRootCreated = $false
$replicaPacketCreated = $false
$descriptorCreated = $false
$authorizationConsumed = $false
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
  $ageVersionLines = @(& $AgeExePath --version 2>&1)
  if (-not (Test-Phase7BWorkPackage2AgeVersionOutput -OutputLines @($ageVersionLines | ForEach-Object { [string]$_ }) -ExitCode $LASTEXITCODE).pass) { throw "PHASE7B_WP2_AGE_VERSION_UNSUPPORTED" }
  if ($Host.Name -ne "ConsoleHost" -or -not [Environment]::UserInteractive) { throw "PHASE7B_WP2_INTERACTIVE_SECRET_CONSOLE_REQUIRED" }

  $source = (Resolve-Path -LiteralPath $SourceRoot -ErrorAction Stop).Path.TrimEnd('\')
  $sourceRootSha256 = Get-Phase7BSha256 -Text $source.ToLowerInvariant()
  $localBase = [IO.Path]::GetFullPath($LocalOutputDirectory).TrimEnd('\')
  $replicaIdentity = Get-Phase7BReplicaDirectoryIdentity -LiteralPath $ReplicaDirectory
  $replicaBase = $replicaIdentity.localPath
  $localOutputRootSha256 = Get-Phase7BSha256 -Text $localBase.ToLowerInvariant()
  $replicaRootSha256 = $replicaIdentity.providerRootSha256
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
  if ($ExpectedAuthorizationSha256 -notmatch '^[0-9a-fA-F]{64}$' -or (Get-Phase7BSha256 -LiteralPath $AuthorizationPath) -ne $ExpectedAuthorizationSha256.ToLowerInvariant()) { throw 'PHASE7B_WP2_AUTHORIZATION_HASH_MISMATCH' }
  $authorizationPreview = Get-Content -LiteralPath $AuthorizationPath -Raw | ConvertFrom-Json -ErrorAction Stop
  $toolingCommit = (& git -C (Resolve-Path (Join-Path $PSScriptRoot '..')).Path rev-parse HEAD).Trim().ToLowerInvariant()
  $authorization = Assert-Phase7BWorkPackage2CaptureAuthorization -LiteralPath $AuthorizationPath -ExpectedSha256 $ExpectedAuthorizationSha256 `
    -ExpectedAttemptId $AttemptId -ExpectedToolingCommit $toolingCommit -ExpectedInventorySha256 $inventory.inventorySha256 `
    -ExpectedSourceRootSha256 $sourceRootSha256 -ExpectedCapturePlanSha256 $ExpectedCapturePlanSha256 `
    -ExpectedLocalOutputRootSha256 $localOutputRootSha256 -ExpectedReplicaRootSha256 $replicaRootSha256 `
    -ExpectedAgeExeSha256 $ExpectedAgeExeSha256.ToLowerInvariant() -ExpectedQuiescenceEvidenceSha256 ([string]$authorizationPreview.quiescenceEvidenceSha256)
  if ((Split-Path -Leaf $CapturePlanPath) -cne [string]$authorization.capturePlanFileName) { throw 'PHASE7B_WP2_CAPTURE_PLAN_FILENAME_BINDING_MISMATCH' }
  $agePathSha256 = Get-Phase7BSha256 -Text ([IO.Path]::GetFullPath($AgeExePath).ToLowerInvariant())
  if ([string]$authorization.ageExePathSha256 -ne $agePathSha256) { throw 'PHASE7B_WP2_AGE_PATH_IDENTITY_MISMATCH' }
  if ([string]$authorization.replicaUncRoot -ne [string]$replicaIdentity.providerRoot) { throw 'PHASE7B_WP2_REPLICA_MAPPING_IDENTITY_FAIL' }
  $repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
  $branch = (& git -C $repositoryRoot branch --show-current).Trim()
  $delta = (& git -C $repositoryRoot rev-list --left-right --count 'HEAD...origin/combined-app-platform-cutover').Trim()
  $dirty = @(& git -C $repositoryRoot status --short --untracked-files=no)
  if ($branch -ne 'combined-app-platform-cutover' -or $delta -ne "0`t0" -or $dirty.Count -ne 0) { throw 'PHASE7B_WP2B_CAPTURE_REPOSITORY_IDENTITY_FAIL' }
  $quiescencePath = Join-Path (Split-Path -Parent ([IO.Path]::GetFullPath($AuthorizationPath))) ([string]$authorization.quiescenceEvidenceFileName)
  if (-not (Test-Path -LiteralPath $quiescencePath -PathType Leaf) -or
      (Get-Phase7BSha256 -LiteralPath $quiescencePath) -ne [string]$authorization.quiescenceEvidenceSha256) { throw 'PHASE7B_WP2B_CAPTURE_QUIESCENCE_EVIDENCE_FAIL' }
  $quiescence = Get-Content -LiteralPath $quiescencePath -Raw | ConvertFrom-Json -ErrorAction Stop
  if (-not (Test-Phase7BWorkPackage2QuiescenceEvidence -Evidence $quiescence -ExpectedToolingCommit ([string]$authorization.quiescenceEvidenceToolingCommit)).pass) { throw 'PHASE7B_WP2B_CAPTURE_QUIESCENCE_EVIDENCE_FAIL' }
  $monitorTask = Get-ScheduledTask -TaskName 'PhysiqueOS Runtime Monitor' -ErrorAction Stop
  if ([string]$monitorTask.State -ne 'Disabled') { throw 'PHASE7B_WP2B_CAPTURE_QUIESCENCE_NOT_ESTABLISHED' }

  $localAttemptRoot = Join-Path $localBase $AttemptId
  $replicaAttemptRoot = $replicaBase
  if ((Test-Path -LiteralPath $localAttemptRoot) -or -not (Test-Path -LiteralPath $replicaAttemptRoot -PathType Container) -or
      @(Get-ChildItem -LiteralPath $replicaAttemptRoot -Force -ErrorAction Stop).Count -ne 0) { throw "PHASE7B_WP2_ATTEMPT_OUTPUT_EXISTS_OR_REPLICA_NOT_EMPTY" }
  $mutationStarted = $true
  New-Item -ItemType Directory -Path $localAttemptRoot -ErrorAction Stop | Out-Null
  $localAttemptRootCreated = $true
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
  $stage = "build-encrypted-packet-reference-index"
  $nodeCandidates = @(Get-Command node.exe -CommandType Application -All -ErrorAction Stop | ForEach-Object { $_.Source } | Sort-Object -Unique)
  if ($nodeCandidates.Count -ne 1) { throw "PHASE7B_WP2_REFERENCE_NODE_IDENTITY_AMBIGUOUS" }
  $referenceBuilderPath = Join-Path $PSScriptRoot "phase7bBuildWorkPackage2ReferenceIndex.mjs"
  if (-not (Test-Path -LiteralPath $referenceBuilderPath -PathType Leaf)) { throw "PHASE7B_WP2_REFERENCE_BUILDER_MISSING" }
  $referenceInputPath = Join-Path $plaintextRoot ".reference-input.json"
  $referencePath = Join-Path $plaintextRoot "reference-index.json"
  $referenceInput = [ordered]@{
    schemaVersion = 1
    applicationCommit = $contract.applicationCommit
    observedAt = [DateTime]::UtcNow.ToString('o')
    missingReferencedMedia = @()
    files = @($inventory.files | ForEach-Object { [ordered]@{
      sourceRelativePath = $_.sourceRelativePath
      logicalPath = $_.logicalPath
      bytes = $_.bytes
      sha256 = $_.sha256
    } })
  }
  $referenceInputBytes = (New-Object Text.UTF8Encoding($false)).GetBytes((ConvertTo-Phase7BCanonicalJson -InputObject $referenceInput))
  $referenceInputStream = New-Object IO.FileStream($referenceInputPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
  try { $referenceInputStream.Write($referenceInputBytes, 0, $referenceInputBytes.Length); $referenceInputStream.Flush($true) } finally { $referenceInputStream.Dispose() }
  $priorErrorPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { $referenceOutput = @(& $nodeCandidates[0] --no-warnings $referenceBuilderPath $referenceInputPath $plaintextRoot $referencePath 2>&1) -join [Environment]::NewLine; $referenceExit = $LASTEXITCODE } finally { $ErrorActionPreference = $priorErrorPreference }
  if ($referenceExit -ne 0) {
    $referenceFailure = $null
    try { $referenceFailure = $referenceOutput | ConvertFrom-Json -ErrorAction Stop } catch { }
    if ($null -ne $referenceFailure -and [string]$referenceFailure.safeErrorCode -match '^PHASE7B_') {
      if ([string]$referenceFailure.safeErrorCode -eq 'PHASE7B_WP2_REFERENCE_INDEX_BUILD_FAIL' -and [string]$referenceFailure.safeStage -match '^[a-z-]+$') { throw "PHASE7B_WP2_REFERENCE_$(([string]$referenceFailure.safeStage).Replace('-', '_').ToUpperInvariant())_FAIL" }
      throw [string]$referenceFailure.safeErrorCode
    }
    if ($referenceOutput -match '"safeErrorCode"\s*:\s*"(?<code>PHASE7B_[A-Z0-9_:.-]+)"') { throw [string]$Matches.code }
    throw "PHASE7B_WP2_REFERENCE_INDEX_BUILD_FAIL"
  }
  $referenceResult = $referenceOutput | ConvertFrom-Json -ErrorAction Stop
  if (-not [bool]$referenceResult.pass -or [string]$referenceResult.referenceIndexSha256 -notmatch '^[0-9a-f]{64}$' -or
      -not (Test-Path -LiteralPath $referencePath -PathType Leaf)) { throw "PHASE7B_WP2_REFERENCE_INDEX_ACCEPTANCE_FAIL" }
  Remove-Item -LiteralPath $referenceInputPath -Force
  $referenceFileSha256 = Get-Phase7BSha256 -LiteralPath $referencePath
  $referenceFileBytes = [int64](Get-Item -LiteralPath $referencePath).Length
  $packetManifest = [ordered]@{
    schemaVersion = 2
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
    referenceIndex = [ordered]@{
      fileName = 'reference-index.json'
      version = 'phase7b-wp2-reference-index-v1'
      semanticSha256 = [string]$referenceResult.referenceIndexSha256
      fileSha256 = $referenceFileSha256
      bytes = $referenceFileBytes
      collectionCount = [int]$referenceResult.collectionCount
      recordCount = [int]$referenceResult.recordCount
      mediaCount = [int]$referenceResult.mediaCount
      relationshipCount = [int]$referenceResult.relationshipCount
    }
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
  $zipFiles = @($inventory.files | ForEach-Object { [pscustomobject]@{ logicalPath = $_.logicalPath } }) + @([pscustomobject]@{ logicalPath = 'reference-index.json' })
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
  $replica = Copy-Phase7BBoundedEncryptedReplica -SourcePath $localPacketPath -DestinationPath $replicaPacketPath -ExpectedSha256 $packetSha -ExpectedBytes $packet.packetBytes
  $replicaPacketCreated = $true
  if (-not $replica.pass) { throw $replica.classification }

  $descriptor = [ordered]@{
    schemaVersion = 1
    classification = "PHASE7B_WP2_ENCRYPTED_PACKET_REPLICA_COPY_PENDING_INDEPENDENT_READBACK"
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
    ageFileName = $contract.ageMediaFileName
    ageExeSha256 = $ExpectedAgeExeSha256.ToLowerInvariant()
    referenceIndexVersion = 'phase7b-wp2-reference-index-v1'
    referenceIndexSha256 = [string]$referenceResult.referenceIndexSha256
    referenceIndexFileSha256 = $referenceFileSha256
    localEncryptedCopyPass = $true
    independentEncryptedReplicaPass = $false
    independentLaptopReadbackRequired = $true
    ephemeralTransportTeardownRequired = $true
    plaintextSecretPersisted = $false
    automaticRetryAllowed = $false
  }
  $descriptorPath = Join-Path $localAttemptRoot "$AttemptId-pending-descriptor.json"
  $descriptorBytes = (New-Object Text.UTF8Encoding($false)).GetBytes((ConvertTo-Phase7BCanonicalJson -InputObject $descriptor))
  $descriptorStream = New-Object IO.FileStream($descriptorPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
  $descriptorCreated = $true
  try {
    $descriptorStream.Write($descriptorBytes, 0, $descriptorBytes.Length)
    $descriptorStream.Flush($true)
  } finally {
    $descriptorStream.Dispose()
  }
  $stage = 'consume-authorization-after-complete-capture'
  $markerPath = Join-Path (Split-Path -Parent ([IO.Path]::GetFullPath($AuthorizationPath))) ([string]$authorization.consumptionMarkerFileName)
  if ((Get-Phase7BSha256 -LiteralPath $AuthorizationPath) -cne $ExpectedAuthorizationSha256.ToLowerInvariant() -or
      (Test-Path -LiteralPath $markerPath)) { throw 'PHASE7B_WP2B_CAPTURE_AUTHORIZATION_CHANGED_OR_CONCURRENTLY_USED' }
  [void](Use-Phase7BWorkPackage2CaptureAuthorization -AuthorizationPath $AuthorizationPath -Authorization $authorization)
  $authorizationConsumed = $true
  $accepted = $true
  $global:LASTEXITCODE = 0
  [ordered]@{
    classification = $descriptor.classification
    pass = $true
    attemptId = $AttemptId
    packetFileName = $descriptor.packetFileName
    packetSha256 = $packetSha
    packetBytes = $packet.packetBytes
    referenceIndexSha256 = [string]$referenceResult.referenceIndexSha256
    referenceIndexRecordCount = [int]$referenceResult.recordCount
    descriptorFileName = Split-Path -Leaf $descriptorPath
    descriptorSha256 = Get-Phase7BSha256 -LiteralPath $descriptorPath
    sourceInventorySha256 = $inventory.inventorySha256
    fileCount = $inventory.fileCount
    replicaCopyPass = $true
    independentReplicaPass = $false
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
    authorizationConsumed = $authorizationConsumed
    exactSameAuthorizationReusableAfterCleanup = [bool](-not $authorizationConsumed)
    newFounderAuthorizationRequired = $authorizationConsumed
  } | ConvertTo-Json -Depth 4
  $global:LASTEXITCODE = 1
  return
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
  if (-not $accepted) {
    foreach ($failedOutput in @(
        [pscustomobject]@{ path = $descriptorPath; created = $descriptorCreated },
        [pscustomobject]@{ path = $replicaPacketPath; created = $replicaPacketCreated })) {
      if ($failedOutput.created -and -not [string]::IsNullOrWhiteSpace([string]$failedOutput.path) -and (Test-Path -LiteralPath ([string]$failedOutput.path) -PathType Leaf)) {
        Remove-Item -LiteralPath ([string]$failedOutput.path) -Force
      }
    }
    if ($localAttemptRootCreated -and -not [string]::IsNullOrWhiteSpace($localAttemptRoot) -and
        (Test-Path -LiteralPath $localAttemptRoot -PathType Container) -and
        @(Get-ChildItem -LiteralPath $localAttemptRoot -Force).Count -eq 0) {
      Remove-Item -LiteralPath $localAttemptRoot -Force
    }
  }
}
