[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$AttemptId,
  [Parameter(Mandatory = $true)][string]$InvocationContractPath,
  [Parameter(Mandatory = $true)][string]$ExpectedInvocationContractSha256,
  [Parameter(Mandatory = $true)][string]$AuthorizationPath,
  [Parameter(Mandatory = $true)][string]$ExpectedAuthorizationSha256,
  [Parameter(Mandatory = $true)][string]$ReceiverAccountName,
  [Parameter(Mandatory = $true)][string]$LocalOutputRoot,
  [Parameter(Mandatory = $true)][string]$AgeExePath
)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bIsolatedGuestContract.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2Contract.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2Orchestration.psm1') -Force
$invocation=Assert-Phase7BWorkPackage2InvocationContract -LiteralPath $InvocationContractPath -ExpectedSha256 $ExpectedInvocationContractSha256 -ExpectedAttemptId $AttemptId
if (-not [bool]$invocation.securePassphraseBridgeRequired -or -not [bool]$invocation.decryptRoundTripRequired) { throw 'PHASE7B_WP2B_STAGE3_INVOCATION_REQUIREMENT_FAIL' }
$repositoryRoot=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$head=(& git -C $repositoryRoot rev-parse HEAD).Trim().ToLowerInvariant()
$parity=(& git -C $repositoryRoot rev-list --left-right --count 'HEAD...origin/combined-app-platform-cutover').Trim()
$dirty=@(& git -C $repositoryRoot status --short --untracked-files=no)
if ($head -cne [string]$invocation.toolingCommit -or $parity -cne "0`t0" -or $dirty.Count -ne 0) { throw 'PHASE7B_WP2B_STAGE3_REPOSITORY_FAIL' }
$self=@($invocation.artifacts|Where-Object{$_.relativePath -ceq 'scripts/phase7bRunWorkPackage2Stage3.ps1'})
if ($self.Count -ne 1 -or (Get-Phase7BSha256 -LiteralPath $PSCommandPath) -cne [string]$self[0].sha256) { throw 'PHASE7B_WP2B_STAGE3_SELF_IDENTITY_FAIL' }
if ((Get-Phase7BSha256 -LiteralPath $AuthorizationPath) -cne $ExpectedAuthorizationSha256) { throw 'PHASE7B_WP2B_STAGE3_AUTHORIZATION_HASH_FAIL' }
$authorization=Assert-Phase7BWorkPackage2Authorization -LiteralPath $AuthorizationPath -ExpectedSha256 $ExpectedAuthorizationSha256 -ExpectedStage 'WP2B_CAPTURE' -ExpectedAttemptId $AttemptId
if ([string]$authorization.attemptId -cne $AttemptId -or [string]$authorization.toolingCommit -cne $head -or
    [string]$authorization.invocationContractSha256 -cne $ExpectedInvocationContractSha256 -or
    [string]$authorization.stage3LauncherSha256 -cne [string]$self[0].sha256 -or
    -not [bool]$authorization.securePassphraseBridgeRequired -or -not [bool]$authorization.decryptRoundTripRequired) { throw 'PHASE7B_WP2B_STAGE3_AUTHORIZATION_BINDING_FAIL' }
$markerPath=Join-Path (Split-Path -Parent $AuthorizationPath) ([string]$authorization.consumptionMarkerFileName)
if (Test-Path -LiteralPath $markerPath) { throw 'PHASE7B_WP2B_STAGE3_AUTHORIZATION_ALREADY_USED' }
$planPath=Join-Path (Split-Path -Parent $AuthorizationPath) ([string]$authorization.capturePlanFileName)
$ageSha=Get-Phase7BSha256 -LiteralPath $AgeExePath
if ($ReceiverAccountName -cnotmatch '^[A-Za-z0-9._-]{1,64}$' -or $ageSha -cne [string]$authorization.ageExeSha256) { throw 'PHASE7B_WP2B_STAGE3_RECEIVER_OR_AGE_IDENTITY_FAIL' }
if (@(Get-PSDrive -Name P7BR -ErrorAction SilentlyContinue).Count -ne 0) { throw 'PHASE7B_WP2B_STAGE3_PSDRIVE_PREEXISTS' }
$credential=Get-Credential -UserName "LAPTOP-4G5UOU2R\$ReceiverAccountName" -Message 'Enter the existing laptop account password. It remains in memory only.'
try {
  [void](New-PSDrive -Name P7BR -PSProvider FileSystem -Root ([string]$authorization.replicaUncRoot) -Credential $credential -Scope Global -ErrorAction Stop)
  $lines=@(& (Join-Path $PSScriptRoot 'phase7bPrepareWorkPackage2EncryptedPacket.ps1') -Operation CaptureEncryptReplicate -AttemptId $AttemptId `
    -AuthorizationPath $AuthorizationPath -ExpectedAuthorizationSha256 $ExpectedAuthorizationSha256 -CapturePlanPath $planPath `
    -ExpectedInvocationContractSha256 $ExpectedInvocationContractSha256 -ExpectedStage3LauncherSha256 ([string]$self[0].sha256) `
    -ExpectedCapturePlanSha256 ([string]$authorization.capturePlanSha256) -SourceRoot $repositoryRoot -LocalOutputDirectory $LocalOutputRoot `
    -ReplicaDirectory 'P7BR:\' -AgeExePath $AgeExePath -ExpectedAgeExeSha256 $ageSha 2>&1)
  $exitCode=$LASTEXITCODE;$text=$lines -join [Environment]::NewLine;$result=$text|ConvertFrom-Json -ErrorAction Stop
  if ($exitCode -ne 0 -or -not [bool]$result.pass -or -not [bool]$result.decryptRoundTripPass -or [bool]$result.captureAuthorizationConsumed) { Write-Host $text;throw 'PHASE7B_WP2B_STAGE3_CAPTURE_STOP' }
} finally {
  if (@(Get-PSDrive -Name P7BR -ErrorAction SilentlyContinue).Count -gt 0) { Remove-PSDrive -Name P7BR -Force -ErrorAction SilentlyContinue }
  if ($null -ne $credential -and $null -ne $credential.Password) { $credential.Password.Dispose() };Remove-Variable credential -ErrorAction SilentlyContinue
}
[ordered]@{classification='PHASE7B_WP2B_PRIMARY_CAPTURE_ENCRYPT_TRANSFER_PASS';pass=$true;attemptId=$AttemptId;packetSha256=[string]$result.packetSha256;packetBytes=[int64]$result.packetBytes;plaintextZipSha256=[string]$result.plaintextZipSha256;plaintextZipBytes=[int64]$result.plaintextZipBytes;decryptedStreamSha256=[string]$result.decryptedStreamSha256;decryptedStreamBytes=[int64]$result.decryptedStreamBytes;decryptRoundTripPass=$true;pendingDescriptorSha256=[string]$result.descriptorSha256;captureAuthorizationConsumed=$false;primaryPsDriveRemoved=$true;automaticRetryAllowed=$false;wp2cAuthorized=$false}|ConvertTo-Json -Depth 4
