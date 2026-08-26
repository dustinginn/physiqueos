[CmdletBinding()] param(
  [Parameter(Mandatory=$true)][string]$AttemptId,
  [Parameter(Mandatory=$true)][string]$CaptureInvocationContractPath,
  [Parameter(Mandatory=$true)][string]$ExpectedCaptureInvocationContractSha256,
  [Parameter(Mandatory=$true)][string]$CaptureAuthorizationPath,
  [Parameter(Mandatory=$true)][string]$ExpectedCaptureAuthorizationSha256,
  [Parameter(Mandatory=$true)][string]$PendingDescriptorPath,
  [Parameter(Mandatory=$true)][string]$ExpectedPendingDescriptorSha256,
  [Parameter(Mandatory=$true)][string]$PacketPath,
  [Parameter(Mandatory=$true)][string]$ReceiptTransportPath,
  [Parameter(Mandatory=$true)][string]$ExpectedReceiptSha256,
  [Parameter(Mandatory=$true)][string]$ExpectedReceiptNonce,
  [Parameter(Mandatory=$true)][string]$OutputPath,
  [Parameter(Mandatory=$true)][string]$Acknowledgement
)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bIsolatedGuestContract.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bBoundedReplicaTransport.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2Orchestration.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2Stage5Continuation.psm1') -Force
$repo=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$head=(& git -C $repo rev-parse HEAD).Trim()
$branch=(& git -C $repo branch --show-current).Trim()
$parity=(& git -C $repo rev-list --left-right --count HEAD...origin/combined-app-platform-cutover).Trim()
$dirty=@(& git -C $repo status --short --untracked-files=no)
$output=[IO.Path]::GetFullPath($OutputPath);$allowed=[IO.Path]::GetFullPath((Join-Path $repo '.tmp')).TrimEnd('\')+'\'
if($Acknowledgement -cne 'WP2B_STAGE5_PREPARE_NONEXECUTABLE_CONTINUATION_BINDING_ONLY' -or $head -cnotmatch '^[0-9a-f]{40}$' -or
    $branch -cne 'combined-app-platform-cutover' -or $parity -cne "0`t0" -or $dirty.Count -ne 0 -or
    -not $output.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase) -or
    (Split-Path -Leaf $output) -cne "$AttemptId-stage5-continuation-$head.json" -or (Test-Path -LiteralPath $output)){
  throw 'PHASE7B_WP2_STAGE5_BINDING_PREPARATION_GATE_FAIL'
}
$inv=Assert-Phase7BWorkPackage2InvocationContract -LiteralPath $CaptureInvocationContractPath -ExpectedSha256 $ExpectedCaptureInvocationContractSha256 -ExpectedAttemptId $AttemptId
$stage3=@($inv.artifacts|Where-Object{$_.relativePath -ceq 'scripts/phase7bRunWorkPackage2Stage3.ps1'})
if($stage3.Count -ne 1){throw 'PHASE7B_WP2_STAGE5_CAPTURE_STAGE3_IDENTITY_FAIL'}
$inputs=@{AttemptId=$AttemptId;PendingDescriptorPath=$PendingDescriptorPath;ExpectedPendingDescriptorSha256=$ExpectedPendingDescriptorSha256;
  InvocationContractPath=$CaptureInvocationContractPath;ExpectedInvocationContractSha256=$ExpectedCaptureInvocationContractSha256;
  CaptureAuthorizationPath=$CaptureAuthorizationPath;ExpectedCaptureAuthorizationSha256=$ExpectedCaptureAuthorizationSha256;
  ExpectedToolingCommit=[string]$inv.toolingCommit;ExpectedStage3LauncherSha256=[string]$stage3[0].sha256;
  ExpectedPacketSha256=(Get-Phase7BSha256 -LiteralPath $PacketPath);ExpectedPacketBytes=[int64](Get-Item -LiteralPath $PacketPath).Length}
$binding=New-Phase7BStage5ContinuationBindingDocument -CaptureInputs $inputs -PacketPath $PacketPath -ReceiptTransportPath $ReceiptTransportPath `
  -ExpectedReceiptSha256 $ExpectedReceiptSha256 -ExpectedReceiptNonce $ExpectedReceiptNonce -FinalizationToolingCommit $head
$persisted=Write-Phase7BSafeEvidenceFile -LiteralPath $output -Evidence $binding
[ordered]@{classification='PHASE7B_WP2_STAGE5_NONEXECUTABLE_BINDING_CREATED';pass=$true;bindingPath=$output;bindingSha256=$persisted.sha256;
  captureToolingCommit=$inv.toolingCommit;finalizationToolingCommit=$head;executionAuthorized=$false;founderExecutionAuthorizationRequired=$true;
  captureAuthorizationModified=$false;automaticRetryAllowed=$false;wp2cAuthorized=$false}|ConvertTo-Json -Depth 4
