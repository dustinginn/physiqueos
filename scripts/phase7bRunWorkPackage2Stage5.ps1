[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$AttemptId,
  [Parameter(Mandatory = $true)][string]$InvocationContractPath,
  [Parameter(Mandatory = $true)][string]$ExpectedInvocationContractSha256,
  [Parameter(Mandatory = $true)][string]$AuthorizationPath,
  [Parameter(Mandatory = $true)][string]$ExpectedAuthorizationSha256,
  [Parameter(Mandatory = $true)][string]$LocalOutputRoot,
  [Parameter(Mandatory = $true)][string]$EvidenceNonce,
  [Parameter(Mandatory = $true)][string]$ExpectedEvidenceSha256
)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2Contract.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2Orchestration.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bBoundedReplicaTransport.psm1') -Force
$invocation=Assert-Phase7BWorkPackage2InvocationContract -LiteralPath $InvocationContractPath -ExpectedSha256 $ExpectedInvocationContractSha256 -ExpectedAttemptId $AttemptId
$repositoryRoot=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$head=(& git -C $repositoryRoot rev-parse HEAD).Trim().ToLowerInvariant()
$self=@($invocation.artifacts|Where-Object{$_.relativePath -ceq 'scripts/phase7bRunWorkPackage2Stage5.ps1'})
if($head -cne [string]$invocation.toolingCommit -or $self.Count -ne 1 -or (Get-Phase7BSha256 -LiteralPath $PSCommandPath) -cne [string]$self[0].sha256 -or
   (Get-Phase7BSha256 -LiteralPath $AuthorizationPath) -cne $ExpectedAuthorizationSha256 -or $EvidenceNonce -cnotmatch '^[0-9a-f]{32}$' -or $ExpectedEvidenceSha256 -cnotmatch '^[0-9a-f]{64}$'){throw 'PHASE7B_WP2B_STAGE5_IDENTITY_FAIL'}
$authorization=Get-Content -LiteralPath $AuthorizationPath -Raw|ConvertFrom-Json -ErrorAction Stop
if([string]$authorization.attemptId -cne $AttemptId -or [string]$authorization.toolingCommit -cne $head){throw 'PHASE7B_WP2B_STAGE5_AUTHORIZATION_BINDING_FAIL'}
$attemptRoot=Join-Path ([IO.Path]::GetFullPath($LocalOutputRoot).TrimEnd('\')) $AttemptId
$packetPath=Join-Path $attemptRoot "$AttemptId.zip.age";$pendingPath=Join-Path $attemptRoot "$AttemptId-pending-descriptor.json"
if(-not(Test-Path -LiteralPath $packetPath -PathType Leaf)-or -not(Test-Path -LiteralPath $pendingPath -PathType Leaf)){throw 'PHASE7B_WP2B_STAGE5_CAPTURE_INPUT_MISSING'}
$packetSha=Get-Phase7BSha256 -LiteralPath $packetPath;$packetBytes=[int64](Get-Item -LiteralPath $packetPath).Length
$pending=Get-Content -LiteralPath $pendingPath -Raw|ConvertFrom-Json -ErrorAction Stop
if(-not [bool]$pending.decryptRoundTripPass -or [string]$pending.decryptedStreamSha256 -cne [string]$pending.plaintextZipSha256 -or [int64]$pending.decryptedStreamBytes -ne [int64]$pending.plaintextZipBytes){throw 'PHASE7B_WP2B_STAGE5_ROUND_TRIP_BINDING_FAIL'}
$shareName="P7B$($AttemptId.Substring($AttemptId.Length-8))`$";$connections=@(Get-SmbConnection -ServerName 'LAPTOP-4G5UOU2R' -ErrorAction SilentlyContinue|Where-Object{$_.ShareName -eq $shareName})
if($connections.Count -ne 0){throw 'PHASE7B_WP2B_STAGE5_SMB_RESIDUE_STOP'}
$teardownPath=Join-Path $attemptRoot "$AttemptId-primary-teardown-$([guid]::NewGuid().ToString('N')).json"
$teardownLines=@(& (Join-Path $PSScriptRoot 'phase7bVerifyPrimaryReplicaSessionClosed.ps1') -AttemptId $AttemptId -ReceiverUncRoot ([string]$authorization.replicaUncRoot) -EvidenceNonce ([IO.Path]::GetFileNameWithoutExtension($teardownPath).Split('-')[-1]) -EvidenceOutputPath $teardownPath 2>&1)
$teardownExit=$LASTEXITCODE;$teardown=(($teardownLines -join [Environment]::NewLine)|ConvertFrom-Json -ErrorAction Stop)
if($teardownExit -ne 0 -or -not [bool]$teardown.pass){throw 'PHASE7B_WP2B_STAGE5_PRIMARY_TEARDOWN_STOP'}
$receiptPath=Join-Path $attemptRoot "$AttemptId-replica-receipt-$EvidenceNonce.json"
$importLines=@(& (Join-Path $PSScriptRoot 'phase7bImportBoundedReplicaReceipt.ps1') -AttemptId $AttemptId -ExpectedEvidenceNonce $EvidenceNonce -ExpectedEvidenceSha256 $ExpectedEvidenceSha256 -ExpectedPacketSha256 $packetSha -ExpectedPacketBytes $packetBytes -OutputPath $receiptPath -AuthorizationAcknowledgement 'WP2B_CAPTURE_IMPORT_SAFE_REPLICA_RECEIPT_EXACTLY_ONCE' 2>&1)
$importExit=$LASTEXITCODE;$import=(($importLines -join [Environment]::NewLine)|ConvertFrom-Json -ErrorAction Stop)
if($importExit -ne 0 -or -not [bool]$import.pass){throw 'PHASE7B_WP2B_STAGE5_RECEIPT_IMPORT_STOP'}
$finalPath=Join-Path $attemptRoot "$AttemptId-descriptor.json"
$finalLines=@(& (Join-Path $PSScriptRoot 'phase7bFinalizeBoundedReplicaDescriptor.ps1') -AttemptId $AttemptId -PendingDescriptorPath $pendingPath `
  -ExpectedPendingDescriptorSha256 (Get-Phase7BSha256 -LiteralPath $pendingPath) -ReplicaReceiptPath $receiptPath -ExpectedReplicaReceiptSha256 $ExpectedEvidenceSha256 `
  -PrimaryTeardownEvidencePath $teardownPath -ExpectedPrimaryTeardownEvidenceSha256 (Get-Phase7BSha256 -LiteralPath $teardownPath) `
  -CaptureAuthorizationPath $AuthorizationPath -ExpectedCaptureAuthorizationSha256 $ExpectedAuthorizationSha256 -ExpectedToolingCommit $head `
  -AuthorizationAcknowledgement 'WP2B_CAPTURE_FINALIZE_INDEPENDENT_REPLICA_EXACTLY_ONCE' -OutputPath $finalPath 2>&1)
$finalExit=$LASTEXITCODE;$final=(($finalLines -join [Environment]::NewLine)|ConvertFrom-Json -ErrorAction Stop)
if($finalExit -ne 0 -or -not [bool]$final.pass -or -not [bool]$final.decryptRoundTripPass -or -not [bool]$final.captureAuthorizationConsumed){throw 'PHASE7B_WP2B_STAGE5_FINALIZE_STOP'}
[ordered]@{classification='PHASE7B_WP2B_CAPTURE_LIFECYCLE_PASS';pass=$true;toolingCommit=$head;attemptId=$AttemptId;packetSha256=$packetSha;packetBytes=$packetBytes;plaintextZipSha256=[string]$pending.plaintextZipSha256;plaintextZipBytes=[int64]$pending.plaintextZipBytes;decryptedStreamSha256=[string]$pending.decryptedStreamSha256;decryptedStreamBytes=[int64]$pending.decryptedStreamBytes;decryptRoundTripPass=$true;boundedDescriptorPath=$finalPath;boundedDescriptorSha256=Get-Phase7BSha256 -LiteralPath $finalPath;captureAuthorizationConsumedExactlyOnce=$true;automaticRetryAllowed=$false;wp2cAuthorized=$false}|ConvertTo-Json -Depth 4
