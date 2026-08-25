[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$AttemptId,
  [Parameter(Mandatory = $true)][string]$InvocationContractPath,
  [Parameter(Mandatory = $true)][string]$ExpectedInvocationContractSha256,
  [Parameter(Mandatory = $true)][string]$AuthorizationPath,
  [Parameter(Mandatory = $true)][string]$ExpectedAuthorizationSha256,
  [Parameter(Mandatory = $true)][string]$ReceiverAccountName,
  [Parameter(Mandatory = $true)][string]$LocalOutputRoot,
  [Parameter(Mandatory = $true)][string]$AgeExePath,
  [Parameter(Mandatory = $true)][string]$AgeKeygenPath
)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bIsolatedGuestContract.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2Contract.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2Orchestration.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bWindowsAgeIdentityBridge.psm1') -Force
$invocation=Assert-Phase7BWorkPackage2InvocationContract -LiteralPath $InvocationContractPath -ExpectedSha256 $ExpectedInvocationContractSha256 -ExpectedAttemptId $AttemptId
if ([string]$invocation.ageEncryptionMode -cne 'native-recipient-v1' -or
    [string]$invocation.ageRecipient -cnotmatch '^age1[023456789acdefghjklmnpqrstuvwxyz]{58}$' -or
    [string]$invocation.ageIdentityInputMode -cne 'stdin' -or -not [bool]$invocation.nativeRecipientRequired -or
    [bool]$invocation.agePluginRequired -or -not [bool]$invocation.decryptRoundTripRequired) { throw 'PHASE7B_WP2B_STAGE3_INVOCATION_REQUIREMENT_FAIL' }
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
    [string]$authorization.ageEncryptionMode -cne 'native-recipient-v1' -or
    [string]$authorization.ageRecipient -cne [string]$invocation.ageRecipient -or
    [string]$authorization.ageIdentityInputMode -cne 'stdin' -or -not [bool]$authorization.nativeRecipientRequired -or
    [bool]$authorization.agePluginRequired -or -not [bool]$authorization.decryptRoundTripRequired) { throw 'PHASE7B_WP2B_STAGE3_AUTHORIZATION_BINDING_FAIL' }
$markerPath=Join-Path (Split-Path -Parent $AuthorizationPath) ([string]$authorization.consumptionMarkerFileName)
if (Test-Path -LiteralPath $markerPath) { throw 'PHASE7B_WP2B_STAGE3_AUTHORIZATION_ALREADY_USED' }
$planPath=Join-Path (Split-Path -Parent $AuthorizationPath) ([string]$authorization.capturePlanFileName)
$ageSha=Get-Phase7BSha256 -LiteralPath $AgeExePath
$ageKeygenSha=Get-Phase7BSha256 -LiteralPath $AgeKeygenPath
$agePathSha=Get-Phase7BSha256 -Text ([IO.Path]::GetFullPath($AgeExePath).ToLowerInvariant())
$ageKeygenPathSha=Get-Phase7BSha256 -Text ([IO.Path]::GetFullPath($AgeKeygenPath).ToLowerInvariant())
$ageVersionLines=@(& $AgeExePath --version 2>&1);$ageVersion=Test-Phase7BWorkPackage2AgeVersionOutput -OutputLines @($ageVersionLines|ForEach-Object{[string]$_}) -ExitCode $LASTEXITCODE
$ageKeygenVersionLines=@(& $AgeKeygenPath --version 2>&1);$ageKeygenVersion=Test-Phase7BWorkPackage2AgeVersionOutput -OutputLines @($ageKeygenVersionLines|ForEach-Object{[string]$_}) -ExitCode $LASTEXITCODE
if ($ReceiverAccountName -cnotmatch '^[A-Za-z0-9._-]{1,64}$' -or $ageSha -cne [string]$authorization.ageExeSha256 -or
    $ageKeygenSha -cne [string]$authorization.ageKeygenSha256 -or $agePathSha -cne [string]$authorization.ageExePathSha256 -or
    $ageKeygenPathSha -cne [string]$authorization.ageKeygenPathSha256 -or
    $ageSha -cne [string]$invocation.ageExeSha256 -or $ageKeygenSha -cne [string]$invocation.ageKeygenSha256 -or
    $agePathSha -cne [string]$invocation.ageExePathSha256 -or $ageKeygenPathSha -cne [string]$invocation.ageKeygenPathSha256 -or
    -not $ageVersion.pass -or -not $ageKeygenVersion.pass -or [string]$ageVersion.normalizedVersion -cne [string]$invocation.ageVersion -or
    [string]$ageKeygenVersion.normalizedVersion -cne [string]$invocation.ageKeygenVersion -or
    [string]$authorization.ageVersion -cne [string]$invocation.ageVersion -or [string]$authorization.ageKeygenVersion -cne [string]$invocation.ageKeygenVersion) {
  throw 'PHASE7B_WP2B_STAGE3_RECEIVER_OR_AGE_IDENTITY_FAIL'
}
if (@(Get-PSDrive -Name P7BR -ErrorAction SilentlyContinue).Count -ne 0) { throw 'PHASE7B_WP2B_STAGE3_PSDRIVE_PREEXISTS' }
$verifiedIdentity=$null
$credential=$null
try {
  $verifiedIdentity=Request-Phase7BVerifiedAgeIdentity -AgeKeygenPath $AgeKeygenPath -ExpectedAgeRecipient ([string]$invocation.ageRecipient)
  if (-not [bool]$verifiedIdentity.pass -or [string]$verifiedIdentity.ageRecipient -cne [string]$authorization.ageRecipient) {
    throw 'PHASE7B_WP2B_STAGE3_AGE_IDENTITY_VERIFICATION_FAIL'
  }
  $credential=Get-Credential -UserName "LAPTOP-4G5UOU2R\$ReceiverAccountName" -Message 'Enter the existing laptop account password. It remains in memory only.'
  [void](New-PSDrive -Name P7BR -PSProvider FileSystem -Root ([string]$authorization.replicaUncRoot) -Credential $credential -Scope Global -ErrorAction Stop)
  $lines=@(& (Join-Path $PSScriptRoot 'phase7bPrepareWorkPackage2EncryptedPacket.ps1') -Operation CaptureEncryptReplicate -AttemptId $AttemptId `
    -AuthorizationPath $AuthorizationPath -ExpectedAuthorizationSha256 $ExpectedAuthorizationSha256 -CapturePlanPath $planPath `
    -ExpectedInvocationContractSha256 $ExpectedInvocationContractSha256 -ExpectedStage3LauncherSha256 ([string]$self[0].sha256) `
    -ExpectedCapturePlanSha256 ([string]$authorization.capturePlanSha256) -SourceRoot $repositoryRoot -LocalOutputDirectory $LocalOutputRoot `
    -ReplicaDirectory 'P7BR:\' -AgeExePath $AgeExePath -ExpectedAgeExeSha256 $ageSha -AgeKeygenPath $AgeKeygenPath `
    -ExpectedAgeKeygenSha256 $ageKeygenSha -AgeRecipient ([string]$invocation.ageRecipient) -AgeIdentity $verifiedIdentity.identity 2>&1)
  $exitCode=$LASTEXITCODE;$text=$lines -join [Environment]::NewLine;$result=$text|ConvertFrom-Json -ErrorAction Stop
  if ($exitCode -ne 0 -or -not [bool]$result.pass -or -not [bool]$result.decryptRoundTripPass -or [bool]$result.captureAuthorizationConsumed) { Write-Host $text;throw 'PHASE7B_WP2B_STAGE3_CAPTURE_STOP' }
} finally {
  if (@(Get-PSDrive -Name P7BR -ErrorAction SilentlyContinue).Count -gt 0) { Remove-PSDrive -Name P7BR -Force -ErrorAction SilentlyContinue }
  if ($null -ne $credential -and $null -ne $credential.Password) { $credential.Password.Dispose() };Remove-Variable credential -ErrorAction SilentlyContinue
  if ($null -ne $verifiedIdentity -and $null -ne $verifiedIdentity.identity) { $verifiedIdentity.identity.Dispose() };Remove-Variable verifiedIdentity -ErrorAction SilentlyContinue
}
[ordered]@{classification='PHASE7B_WP2B_PRIMARY_CAPTURE_ENCRYPT_TRANSFER_PASS';pass=$true;attemptId=$AttemptId;packetSha256=[string]$result.packetSha256;packetBytes=[int64]$result.packetBytes;plaintextZipSha256=[string]$result.plaintextZipSha256;plaintextZipBytes=[int64]$result.plaintextZipBytes;decryptedStreamSha256=[string]$result.decryptedStreamSha256;decryptedStreamBytes=[int64]$result.decryptedStreamBytes;decryptRoundTripPass=$true;pendingDescriptorSha256=[string]$result.descriptorSha256;captureAuthorizationConsumed=$false;primaryPsDriveRemoved=$true;automaticRetryAllowed=$false;wp2cAuthorized=$false}|ConvertTo-Json -Depth 4
