[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$AttemptId,
  [Parameter(Mandatory = $true)][string]$PendingDescriptorPath,
  [Parameter(Mandatory = $true)][string]$ExpectedPendingDescriptorSha256,
  [Parameter(Mandatory = $true)][string]$ReplicaReceiptPath,
  [Parameter(Mandatory = $true)][string]$ExpectedReplicaReceiptSha256,
  [Parameter(Mandatory = $true)][string]$PrimaryTeardownEvidencePath,
  [Parameter(Mandatory = $true)][string]$ExpectedPrimaryTeardownEvidenceSha256,
  [Parameter(Mandatory = $true)][string]$CaptureAuthorizationPath,
  [Parameter(Mandatory = $true)][string]$ExpectedCaptureAuthorizationSha256,
  [Parameter(Mandatory = $true)][string]$ExpectedToolingCommit,
  [Parameter(Mandatory = $true)][string]$InvocationContractPath,
  [Parameter(Mandatory = $true)][string]$ExpectedInvocationContractSha256,
  [Parameter(Mandatory = $true)][string]$ExpectedStage3LauncherSha256,
  [Parameter(Mandatory = $true)][string]$ExpectedPacketSha256,
  [Parameter(Mandatory = $true)][int64]$ExpectedPacketBytes,
  [Parameter(Mandatory = $true)][string]$AuthorizationAcknowledgement,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [Parameter()][string]$ExactExistingDescriptorResumeAcknowledgement
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bBoundedReplicaTransport.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2Contract.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bIsolatedGuestContract.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2OperatorLifecycle.psm1') -Force
$stage = 'validate-input'
$mutationStarted = $false
try {
  if ($AttemptId -notmatch '^phase7b-wp2-[0-9a-f]{32}$' -or $ExpectedPendingDescriptorSha256 -notmatch '^[0-9a-f]{64}$' -or $ExpectedReplicaReceiptSha256 -notmatch '^[0-9a-f]{64}$' -or $ExpectedPrimaryTeardownEvidenceSha256 -notmatch '^[0-9a-f]{64}$' -or $ExpectedCaptureAuthorizationSha256 -notmatch '^[0-9a-f]{64}$' -or $ExpectedToolingCommit -notmatch '^[0-9a-f]{40}$' -or $ExpectedInvocationContractSha256 -notmatch '^[0-9a-f]{64}$' -or $ExpectedStage3LauncherSha256 -notmatch '^[0-9a-f]{64}$' -or $AuthorizationAcknowledgement -ne 'WP2B_CAPTURE_FINALIZE_INDEPENDENT_REPLICA_EXACTLY_ONCE') { throw 'PHASE7B_WP2_BOUNDED_REPLICA_FINALIZE_ARGUMENT_FAIL' }
  $resumeExisting = Test-Path -LiteralPath $OutputPath -PathType Leaf
  if ($resumeExisting -and $ExactExistingDescriptorResumeAcknowledgement -cne 'WP2B_CAPTURE_RESUME_EXACT_EXISTING_FINAL_DESCRIPTOR_READ_ONLY') { throw 'PHASE7B_WP2_BOUNDED_REPLICA_FINALIZE_EXISTING_REJECTED' }
  if (-not $resumeExisting -and -not [string]::IsNullOrEmpty($ExactExistingDescriptorResumeAcknowledgement)) { throw 'PHASE7B_WP2_BOUNDED_REPLICA_FINALIZE_RESUME_NOT_APPLICABLE' }
  if ((Get-Phase7BSha256 -LiteralPath $PendingDescriptorPath) -ne $ExpectedPendingDescriptorSha256 -or (Get-Phase7BSha256 -LiteralPath $ReplicaReceiptPath) -ne $ExpectedReplicaReceiptSha256 -or (Get-Phase7BSha256 -LiteralPath $PrimaryTeardownEvidencePath) -ne $ExpectedPrimaryTeardownEvidenceSha256) { throw 'PHASE7B_WP2_BOUNDED_REPLICA_FINALIZE_INPUT_HASH_FAIL' }
  $validated = Assert-Phase7BWorkPackage2PendingFinalizationInput -AttemptId $AttemptId `
    -PendingDescriptorPath $PendingDescriptorPath -ExpectedPendingDescriptorSha256 $ExpectedPendingDescriptorSha256 `
    -InvocationContractPath $InvocationContractPath -ExpectedInvocationContractSha256 $ExpectedInvocationContractSha256 `
    -CaptureAuthorizationPath $CaptureAuthorizationPath -ExpectedCaptureAuthorizationSha256 $ExpectedCaptureAuthorizationSha256 `
    -ExpectedToolingCommit $ExpectedToolingCommit -ExpectedStage3LauncherSha256 $ExpectedStage3LauncherSha256 `
    -ExpectedPacketSha256 $ExpectedPacketSha256 -ExpectedPacketBytes $ExpectedPacketBytes
  $pending = $validated.pending
  $authorization = $validated.authorization
  $receipt = Get-Content -LiteralPath $ReplicaReceiptPath -Raw | ConvertFrom-Json -ErrorAction Stop
  $primaryTeardown = Get-Content -LiteralPath $PrimaryTeardownEvidencePath -Raw | ConvertFrom-Json -ErrorAction Stop
  $accepted = Test-Phase7BBoundedReplicaReceipt -Receipt $receipt -ExpectedAttemptId $AttemptId -ExpectedPacketSha256 ([string]$pending.packetSha256) -ExpectedPacketBytes ([int64]$pending.packetBytes)
  if (-not $accepted.pass) { throw $accepted.classification }
  $expectedShare = "P7B$($AttemptId.Substring($AttemptId.Length - 8))`$"
  if (-not (Test-Phase7BPrimaryReplicaSessionTeardownEvidence -Evidence $primaryTeardown -ExpectedAttemptId $AttemptId -ExpectedServerName 'LAPTOP-4G5UOU2R' -ExpectedShareName $expectedShare).pass) { throw 'PHASE7B_WP2_PRIMARY_REPLICA_SESSION_TEARDOWN_REJECTED' }
  $descriptor = [ordered]@{}
  foreach ($property in $pending.PSObject.Properties) { $descriptor[$property.Name] = $property.Value }
  foreach ($name in $validated.authoritativeBindings.Keys) { $descriptor[$name] = $validated.authoritativeBindings[$name] }
  $descriptor.schemaVersion = 1
  $descriptor.classification = 'PHASE7B_WP2_ENCRYPTED_PACKET_AND_REPLICA_PASS'
  $descriptor.independentEncryptedReplicaPass = $true
  $descriptor.independentLaptopReadbackRequired = $false
  $descriptor.ephemeralTransportTeardownRequired = $false
  $descriptor.replicaReceiptSha256 = $ExpectedReplicaReceiptSha256
  $descriptor.primarySessionTeardownEvidenceSha256 = $ExpectedPrimaryTeardownEvidenceSha256
  $bytes = (New-Object Text.UTF8Encoding($false)).GetBytes((ConvertTo-Phase7BCanonicalJson -InputObject $descriptor))
  if ($resumeExisting) {
    $existingBytes = [IO.File]::ReadAllBytes([IO.Path]::GetFullPath($OutputPath))
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
      $expectedOutputSha = ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
    } finally { $sha.Dispose() }
    if ($existingBytes.Length -ne $bytes.Length -or (Get-Phase7BSha256 -LiteralPath $OutputPath) -cne $expectedOutputSha) { throw 'PHASE7B_WP2_BOUNDED_REPLICA_FINAL_DESCRIPTOR_MISMATCH' }
    $markerPath = Join-Path (Split-Path -Parent ([IO.Path]::GetFullPath($CaptureAuthorizationPath))) ([string]$authorization.consumptionMarkerFileName)
    if (Test-Path -LiteralPath $markerPath -PathType Leaf) { throw 'PHASE7B_WP2B_CAPTURE_AUTHORIZATION_ALREADY_USED' }
    $stage = 'consume-authorization-after-exact-descriptor-recovery'
    $mutationStarted = $true
    [void](Use-Phase7BWorkPackage2CaptureAuthorization -AuthorizationPath $CaptureAuthorizationPath -Authorization $authorization)
    [ordered]@{ classification = $descriptor.classification; pass = $true; attemptId = $AttemptId; descriptorFileName = Split-Path -Leaf $OutputPath; descriptorSha256 = Get-Phase7BSha256 -LiteralPath $OutputPath; packetSha256 = $descriptor.packetSha256; packetBytes = $descriptor.packetBytes; decryptRoundTripPass = $true; independentEncryptedReplicaPass = $true; sessionTornDown = $true; captureAuthorizationConsumed = $true; exactExistingDescriptorReused = $true; mutationPerformed = $true; automaticRetryAllowed = $false } | ConvertTo-Json -Depth 4
    $global:LASTEXITCODE = 0
    return
  }
  $mutationStarted = $true
  $persisted = Write-Phase7BSafeEvidenceFile -LiteralPath $OutputPath -Evidence $descriptor
  [void](Use-Phase7BWorkPackage2CaptureAuthorization -AuthorizationPath $CaptureAuthorizationPath -Authorization $authorization)
  $global:LASTEXITCODE = 0
  [ordered]@{ classification = $descriptor.classification; pass = $true; attemptId = $AttemptId; descriptorFileName = $persisted.fileName; descriptorSha256 = $persisted.sha256; packetSha256 = $descriptor.packetSha256; packetBytes = $descriptor.packetBytes; decryptRoundTripPass = $true; independentEncryptedReplicaPass = $true; sessionTornDown = $true; captureAuthorizationConsumed = $true; exactExistingDescriptorReused = $false; mutationPerformed = $true; automaticRetryAllowed = $false } | ConvertTo-Json -Depth 4
} catch {
  $safeCode = if ($_.Exception.Message -match '^PHASE7B_') { $_.Exception.Message } else { 'PHASE7B_WP2_BOUNDED_REPLICA_FINALIZE_EXCEPTION' }
  [ordered]@{ classification = 'PHASE7B_WP2_BOUNDED_REPLICA_FINALIZE_FAIL'; pass = $false; safeStage = $stage; safeErrorCode = $safeCode; mutationStarted = $mutationStarted; automaticRetryAllowed = $false; newFounderAuthorizationRequired = $mutationStarted } | ConvertTo-Json -Depth 4
  $global:LASTEXITCODE = 1
  return
}
