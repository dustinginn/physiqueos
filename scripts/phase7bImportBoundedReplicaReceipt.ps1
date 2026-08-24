[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$AttemptId,
  [Parameter(Mandatory = $true)][string]$ExpectedEvidenceNonce,
  [Parameter(Mandatory = $true)][string]$ExpectedEvidenceSha256,
  [Parameter(Mandatory = $true)][string]$ExpectedPacketSha256,
  [Parameter(Mandatory = $true)][int64]$ExpectedPacketBytes,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [Parameter(Mandatory = $true)][string]$AuthorizationAcknowledgement,
  [Parameter()][string]$ExactExistingReceiptResumeAcknowledgement
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bBoundedReplicaTransport.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2Contract.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bIsolatedGuestContract.psm1') -Force
$stage = 'validate-input'
try {
  if ($AttemptId -notmatch '^phase7b-wp2-[0-9a-f]{32}$' -or $ExpectedEvidenceNonce -notmatch '^[0-9a-f]{32}$' -or
      $ExpectedEvidenceSha256 -notmatch '^[0-9a-f]{64}$' -or $ExpectedPacketSha256 -notmatch '^[0-9a-f]{64}$' -or
      $ExpectedPacketBytes -le 0 -or $AuthorizationAcknowledgement -ne 'WP2B_CAPTURE_IMPORT_SAFE_REPLICA_RECEIPT_EXACTLY_ONCE' -or
      (Split-Path -Leaf $OutputPath) -cne "$AttemptId-replica-receipt-$ExpectedEvidenceNonce.json") {
    throw 'PHASE7B_WP2B_REPLICA_RECEIPT_IMPORT_ARGUMENT_FAIL'
  }
  $resumeExisting = Test-Path -LiteralPath $OutputPath -PathType Leaf
  if ($resumeExisting) {
    if ($ExactExistingReceiptResumeAcknowledgement -cne 'WP2B_CAPTURE_RESUME_EXACT_EXISTING_SAFE_RECEIPT_READ_ONLY' -or
        (Get-Phase7BSha256 -LiteralPath $OutputPath) -cne $ExpectedEvidenceSha256) { throw 'PHASE7B_WP2B_REPLICA_RECEIPT_IMPORT_EXISTING_REJECTED' }
    $receipt = Get-Content -LiteralPath $OutputPath -Raw | ConvertFrom-Json -ErrorAction Stop
    if ([string]$receipt.evidenceNonce -cne $ExpectedEvidenceNonce -or [string]$receipt.evidenceFileName -cne (Split-Path -Leaf $OutputPath) -or
        -not (Test-Phase7BBoundedReplicaReceipt -Receipt $receipt -ExpectedAttemptId $AttemptId -ExpectedPacketSha256 $ExpectedPacketSha256 -ExpectedPacketBytes $ExpectedPacketBytes).pass) {
      throw 'PHASE7B_WP2B_REPLICA_RECEIPT_IMPORT_EXISTING_BINDING_FAIL'
    }
    [ordered]@{ classification = 'PHASE7B_WP2B_SAFE_REPLICA_RECEIPT_IMPORT_PASS'; pass = $true; attemptId = $AttemptId; evidenceNonce = $ExpectedEvidenceNonce; evidenceFileName = Split-Path -Leaf $OutputPath; evidenceSha256 = $ExpectedEvidenceSha256; packetSha256 = $ExpectedPacketSha256; packetBytes = $ExpectedPacketBytes; exactExistingReceiptReused = $true; mutationPerformed = $false; plaintextFounderDataImported = $false; credentialsImported = $false; automaticRetryAllowed = $false } | ConvertTo-Json -Depth 4
    $global:LASTEXITCODE = 0
    return
  }
  if (-not [string]::IsNullOrEmpty($ExactExistingReceiptResumeAcknowledgement)) { throw 'PHASE7B_WP2B_REPLICA_RECEIPT_IMPORT_RESUME_NOT_APPLICABLE' }
  if ($Host.Name -ne 'ConsoleHost' -or -not [Environment]::UserInteractive) { throw 'PHASE7B_WP2B_REPLICA_RECEIPT_IMPORT_INTERACTIVE_CONSOLE_REQUIRED' }
  $stage = 'read-safe-transport'
  $encoded = Read-Host 'Paste evidenceTransportBase64 from the accepted laptop safe projection'
  $bytes = [Convert]::FromBase64String($encoded)
  $sha = [Security.Cryptography.SHA256]::Create()
  try { $actualSha = ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant() } finally { $sha.Dispose() }
  if ($actualSha -ne $ExpectedEvidenceSha256) { throw 'PHASE7B_WP2B_REPLICA_RECEIPT_IMPORT_HASH_FAIL' }
  $json = (New-Object Text.UTF8Encoding($false)).GetString($bytes)
  $receipt = $json | ConvertFrom-Json -ErrorAction Stop
  if ([string]$receipt.evidenceNonce -ne $ExpectedEvidenceNonce -or [string]$receipt.evidenceFileName -cne (Split-Path -Leaf $OutputPath) -or
      -not (Test-Phase7BBoundedReplicaReceipt -Receipt $receipt -ExpectedAttemptId $AttemptId -ExpectedPacketSha256 $ExpectedPacketSha256 -ExpectedPacketBytes $ExpectedPacketBytes).pass) {
    throw 'PHASE7B_WP2B_REPLICA_RECEIPT_IMPORT_BINDING_FAIL'
  }
  $persisted = Write-Phase7BSafeEvidenceFile -LiteralPath $OutputPath -Evidence $receipt
  if ($persisted.sha256 -ne $ExpectedEvidenceSha256) { throw 'PHASE7B_WP2B_REPLICA_RECEIPT_IMPORT_READBACK_FAIL' }
  $global:LASTEXITCODE = 0
  [ordered]@{ classification = 'PHASE7B_WP2B_SAFE_REPLICA_RECEIPT_IMPORT_PASS'; pass = $true; attemptId = $AttemptId; evidenceNonce = $ExpectedEvidenceNonce; evidenceFileName = $persisted.fileName; evidenceSha256 = $persisted.sha256; packetSha256 = $ExpectedPacketSha256; packetBytes = $ExpectedPacketBytes; exactExistingReceiptReused = $false; mutationPerformed = $true; plaintextFounderDataImported = $false; credentialsImported = $false; automaticRetryAllowed = $false } | ConvertTo-Json -Depth 4
} catch {
  $safeCode = if ($_.Exception.Message -match '^PHASE7B_') { $_.Exception.Message } else { 'PHASE7B_WP2B_REPLICA_RECEIPT_IMPORT_EXCEPTION' }
  [ordered]@{ classification = 'PHASE7B_WP2B_SAFE_REPLICA_RECEIPT_IMPORT_FAIL'; pass = $false; safeStage = $stage; safeErrorCode = $safeCode; safeExceptionType = $_.Exception.GetType().Name; safeLine = $_.InvocationInfo.ScriptLineNumber; automaticRetryAllowed = $false } | ConvertTo-Json -Depth 4
  $global:LASTEXITCODE = 1
  return
}
