[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$AttemptId,
  [Parameter(Mandatory = $true)][string]$AuthorizationPath,
  [Parameter(Mandatory = $true)][string]$ExpectedAuthorizationSha256,
  [Parameter(Mandatory = $true)][string]$ExpectedToolingCommit,
  [Parameter(Mandatory = $true)][string]$ExpectedCapturePlanSha256,
  [Parameter(Mandatory = $true)][string]$LocalOutputRoot
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2Contract.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bIsolatedGuestContract.psm1') -Force
$stage = 'validate-input'
try {
  if ($AttemptId -notmatch '^phase7b-wp2-[0-9a-f]{32}$' -or $ExpectedAuthorizationSha256 -notmatch '^[0-9a-f]{64}$' -or
      $ExpectedToolingCommit -notmatch '^[0-9a-f]{40}$' -or $ExpectedCapturePlanSha256 -notmatch '^[0-9a-f]{64}$') {
    throw 'PHASE7B_WP2B_COMPLETED_CAPTURE_RESUME_ARGUMENT_FAIL'
  }
  $localBase = [IO.Path]::GetFullPath($LocalOutputRoot).TrimEnd('\')
  $localRootSha = Get-Phase7BSha256 -Text $localBase.ToLowerInvariant()
  if (-not (Test-Path -LiteralPath $AuthorizationPath -PathType Leaf) -or (Get-Phase7BSha256 -LiteralPath $AuthorizationPath) -cne $ExpectedAuthorizationSha256) {
    throw 'PHASE7B_WP2B_COMPLETED_CAPTURE_RESUME_AUTHORIZATION_HASH_FAIL'
  }
  $authorization = Get-Content -LiteralPath $AuthorizationPath -Raw | ConvertFrom-Json -ErrorAction Stop
  $authorizedStages = @($authorization.authorizedStages)
  if ([int]$authorization.schemaVersion -ne 1 -or [string]$authorization.classification -cne 'PHASE7B_WP2_STAGE_AUTHORIZATION' -or
      $authorizedStages.Count -ne 1 -or [string]$authorizedStages[0].stage -cne 'WP2B_CAPTURE' -or [int]$authorizedStages[0].mutationBudget -ne 1 -or
      [string]$authorization.attemptId -cne $AttemptId -or [string]$authorization.capturePlanSha256 -cne $ExpectedCapturePlanSha256 -or
      [string]$authorization.localOutputRootSha256 -cne $localRootSha -or [string]$authorization.toolingCommit -cne $ExpectedToolingCommit -or -not [bool]$authorization.oneUseOnly -or
      [bool]$authorization.automaticRetryAllowed -or [bool]$authorization.wp2cAuthorized) {
    throw 'PHASE7B_WP2B_COMPLETED_CAPTURE_RESUME_AUTHORIZATION_FAIL'
  }
  $attemptRoot = Join-Path $localBase $AttemptId
  $packetPath = Join-Path $attemptRoot "$AttemptId.zip.age"
  $descriptorPath = Join-Path $attemptRoot "$AttemptId-pending-descriptor.json"
  $markerPath = Join-Path (Split-Path -Parent ([IO.Path]::GetFullPath($AuthorizationPath))) ([string]$authorization.consumptionMarkerFileName)
  $stage = 'validate-complete-capture-tuple'
  if (-not (Test-Path -LiteralPath $packetPath -PathType Leaf) -or -not (Test-Path -LiteralPath $descriptorPath -PathType Leaf) -or
      (Test-Path -LiteralPath $markerPath -PathType Leaf)) { throw 'PHASE7B_WP2B_COMPLETED_CAPTURE_RESUME_INPUT_MISSING_OR_ALREADY_CONSUMED' }
  $descriptor = Get-Content -LiteralPath $descriptorPath -Raw | ConvertFrom-Json -ErrorAction Stop
  $packetSha = Get-Phase7BSha256 -LiteralPath $packetPath
  $packetBytes = [int64](Get-Item -LiteralPath $packetPath).Length
  if ([string]$descriptor.classification -cne 'PHASE7B_WP2_ENCRYPTED_PACKET_REPLICA_COPY_PENDING_INDEPENDENT_READBACK' -or
      [string]$descriptor.attemptId -cne $AttemptId -or [string]$descriptor.capturePlanSha256 -cne $ExpectedCapturePlanSha256 -or
      [string]$descriptor.packetSha256 -cne $packetSha -or [int64]$descriptor.packetBytes -ne $packetBytes -or
      [string]$descriptor.referenceIndexSha256 -notmatch '^[0-9a-f]{64}$' -or [bool]$descriptor.automaticRetryAllowed -or
      [string]$descriptor.plaintextZipSha256 -notmatch '^[0-9a-f]{64}$' -or [int64]$descriptor.plaintextZipBytes -lt 1 -or
      [string]$descriptor.decryptedStreamSha256 -cne [string]$descriptor.plaintextZipSha256 -or
      [int64]$descriptor.decryptedStreamBytes -ne [int64]$descriptor.plaintextZipBytes -or -not [bool]$descriptor.decryptRoundTripPass) {
    throw 'PHASE7B_WP2B_COMPLETED_CAPTURE_RESUME_BINDING_FAIL'
  }
  $global:LASTEXITCODE = 0
  [ordered]@{
    classification = 'PHASE7B_WP2B_COMPLETED_CAPTURE_ACCEPTANCE_RESUME_PASS'
    pass = $true
    attemptId = $AttemptId
    packetPath = $packetPath
    packetSha256 = $packetSha
    packetBytes = $packetBytes
    pendingDescriptorPath = $descriptorPath
    pendingDescriptorSha256 = Get-Phase7BSha256 -LiteralPath $descriptorPath
    referenceSemanticSha256 = [string]$descriptor.referenceIndexSha256
    captureAuthorizationId = [string]$authorization.authorizationId
    decryptRoundTripPass = $true
    captureAuthorizationConsumed = $false
    captureMutationPerformed = $false
    exactCompletedCaptureReused = $true
    automaticRetryAllowed = $false
    wp2cAuthorized = $false
  } | ConvertTo-Json -Depth 4
} catch {
  $safeCode = if ($_.Exception.Message -match '^PHASE7B_') { $_.Exception.Message } else { 'PHASE7B_WP2B_COMPLETED_CAPTURE_RESUME_EXCEPTION' }
  [ordered]@{ classification = 'PHASE7B_WP2B_COMPLETED_CAPTURE_ACCEPTANCE_RESUME_FAIL'; pass = $false; safeStage = $stage; safeErrorCode = $safeCode; mutationPerformed = $false; automaticRetryAllowed = $false; wp2cAuthorized = $false } | ConvertTo-Json -Depth 4
  $global:LASTEXITCODE = 1
  return
}
