[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$AttemptId,
  [Parameter(Mandatory = $true)][string]$PendingDescriptorPath,
  [Parameter(Mandatory = $true)][string]$ExpectedPendingDescriptorSha256,
  [Parameter(Mandatory = $true)][string]$ReplicaReceiptPath,
  [Parameter(Mandatory = $true)][string]$ExpectedReplicaReceiptSha256,
  [Parameter(Mandatory = $true)][string]$PrimaryTeardownEvidencePath,
  [Parameter(Mandatory = $true)][string]$ExpectedPrimaryTeardownEvidenceSha256,
  [Parameter(Mandatory = $true)][string]$AuthorizationAcknowledgement,
  [Parameter(Mandatory = $true)][string]$OutputPath
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bBoundedReplicaTransport.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bIsolatedGuestContract.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2Contract.psm1') -Force
$stage = 'validate-input'
$mutationStarted = $false
try {
  if ($AttemptId -notmatch '^phase7b-wp2-[0-9a-f]{32}$' -or $ExpectedPendingDescriptorSha256 -notmatch '^[0-9a-f]{64}$' -or $ExpectedReplicaReceiptSha256 -notmatch '^[0-9a-f]{64}$' -or $ExpectedPrimaryTeardownEvidenceSha256 -notmatch '^[0-9a-f]{64}$' -or $AuthorizationAcknowledgement -ne 'WP2B_CAPTURE_FINALIZE_INDEPENDENT_REPLICA_EXACTLY_ONCE' -or (Test-Path -LiteralPath $OutputPath)) { throw 'PHASE7B_WP2_BOUNDED_REPLICA_FINALIZE_ARGUMENT_FAIL' }
  if ((Get-Phase7BSha256 -LiteralPath $PendingDescriptorPath) -ne $ExpectedPendingDescriptorSha256 -or (Get-Phase7BSha256 -LiteralPath $ReplicaReceiptPath) -ne $ExpectedReplicaReceiptSha256 -or (Get-Phase7BSha256 -LiteralPath $PrimaryTeardownEvidencePath) -ne $ExpectedPrimaryTeardownEvidenceSha256) { throw 'PHASE7B_WP2_BOUNDED_REPLICA_FINALIZE_INPUT_HASH_FAIL' }
  $pending = Get-Content -LiteralPath $PendingDescriptorPath -Raw | ConvertFrom-Json -ErrorAction Stop
  $receipt = Get-Content -LiteralPath $ReplicaReceiptPath -Raw | ConvertFrom-Json -ErrorAction Stop
  $primaryTeardown = Get-Content -LiteralPath $PrimaryTeardownEvidencePath -Raw | ConvertFrom-Json -ErrorAction Stop
  if ([string]$pending.classification -ne 'PHASE7B_WP2_ENCRYPTED_PACKET_REPLICA_COPY_PENDING_INDEPENDENT_READBACK' -or [string]$pending.attemptId -ne $AttemptId -or -not [bool]$pending.localEncryptedCopyPass -or [bool]$pending.independentEncryptedReplicaPass) { throw 'PHASE7B_WP2_BOUNDED_REPLICA_PENDING_DESCRIPTOR_FAIL' }
  $accepted = Test-Phase7BBoundedReplicaReceipt -Receipt $receipt -ExpectedAttemptId $AttemptId -ExpectedPacketSha256 ([string]$pending.packetSha256) -ExpectedPacketBytes ([int64]$pending.packetBytes)
  if (-not $accepted.pass) { throw $accepted.classification }
  $expectedShare = "P7B$($AttemptId.Substring($AttemptId.Length - 8))`$"
  if (-not (Test-Phase7BPrimaryReplicaSessionTeardownEvidence -Evidence $primaryTeardown -ExpectedAttemptId $AttemptId -ExpectedServerName 'LAPTOP-4G5U0U2R' -ExpectedShareName $expectedShare).pass) { throw 'PHASE7B_WP2_PRIMARY_REPLICA_SESSION_TEARDOWN_REJECTED' }
  $descriptor = [ordered]@{}
  foreach ($property in $pending.PSObject.Properties) { $descriptor[$property.Name] = $property.Value }
  $descriptor.schemaVersion = 1
  $descriptor.classification = 'PHASE7B_WP2_ENCRYPTED_PACKET_AND_REPLICA_PASS'
  $descriptor.independentEncryptedReplicaPass = $true
  $descriptor.independentLaptopReadbackRequired = $false
  $descriptor.ephemeralTransportTeardownRequired = $false
  $descriptor.replicaReceiptSha256 = $ExpectedReplicaReceiptSha256
  $descriptor.primarySessionTeardownEvidenceSha256 = $ExpectedPrimaryTeardownEvidenceSha256
  $bytes = (New-Object Text.UTF8Encoding($false)).GetBytes((ConvertTo-Phase7BCanonicalJson -InputObject $descriptor))
  $stream = New-Object IO.FileStream($OutputPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
  $mutationStarted = $true
  try { $stream.Write($bytes, 0, $bytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }
  [ordered]@{ classification = $descriptor.classification; pass = $true; attemptId = $AttemptId; descriptorFileName = Split-Path -Leaf $OutputPath; descriptorSha256 = Get-Phase7BSha256 -LiteralPath $OutputPath; packetSha256 = $descriptor.packetSha256; packetBytes = $descriptor.packetBytes; independentEncryptedReplicaPass = $true; sessionTornDown = $true; mutationPerformed = $true; automaticRetryAllowed = $false } | ConvertTo-Json -Depth 4
} catch {
  $safeCode = if ($_.Exception.Message -match '^PHASE7B_') { $_.Exception.Message } else { 'PHASE7B_WP2_BOUNDED_REPLICA_FINALIZE_EXCEPTION' }
  [ordered]@{ classification = 'PHASE7B_WP2_BOUNDED_REPLICA_FINALIZE_FAIL'; pass = $false; safeStage = $stage; safeErrorCode = $safeCode; mutationStarted = $mutationStarted; automaticRetryAllowed = $false; newFounderAuthorizationRequired = $mutationStarted } | ConvertTo-Json -Depth 4
  exit 1
}
