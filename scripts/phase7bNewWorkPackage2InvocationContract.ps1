[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$AttemptId,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [Parameter(Mandatory = $true)][string]$AgeRecipient,
  [Parameter(Mandatory = $true)][string]$AgeExePath,
  [Parameter(Mandatory = $true)][string]$ExpectedAgeExeSha256,
  [Parameter(Mandatory = $true)][string]$AgeKeygenPath,
  [Parameter(Mandatory = $true)][string]$ExpectedAgeKeygenSha256
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bIsolatedGuestContract.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bBoundedReplicaTransport.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2Contract.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2Orchestration.psm1') -Force
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$head = (& git -C $repositoryRoot rev-parse HEAD).Trim().ToLowerInvariant()
$branch = (& git -C $repositoryRoot branch --show-current).Trim()
$parity = (& git -C $repositoryRoot rev-list --left-right --count 'HEAD...origin/combined-app-platform-cutover').Trim()
$dirty = @(& git -C $repositoryRoot status --short --untracked-files=no)
if ($head -cnotmatch '^[0-9a-f]{40}$' -or $branch -cne 'combined-app-platform-cutover' -or $parity -cne "0`t0" -or $dirty.Count -ne 0 -or
    (Test-Path -LiteralPath $OutputPath)) { throw 'PHASE7B_WP2B_INVOCATION_CONTRACT_REPOSITORY_OR_OUTPUT_FAIL' }
$names = @(
  'phase7bRunWorkPackage2Stage3.ps1','phase7bRunWorkPackage2Stage4.ps1','phase7bRunWorkPackage2Stage5.ps1',
  'phase7bPrepareWorkPackage2EncryptedPacket.ps1','phase7bVerifyAndCloseBoundedReplicaReceiver.ps1',
  'phase7bImportBoundedReplicaReceipt.ps1','phase7bVerifyPrimaryReplicaSessionClosed.ps1',
  'phase7bFinalizeBoundedReplicaDescriptor.ps1','phase7bBoundedReplicaTransport.psm1',
  'phase7bWorkPackage2Contract.psm1','phase7bWorkPackage2OperatorLifecycle.psm1',
  'phase7bWorkPackage2AuthorizationEligibility.psm1','phase7bWorkPackage2Orchestration.psm1',
  'phase7bWindowsAgeIdentityBridge.psm1','phase7bIsolatedGuestContract.psm1','phase7bSecondComputerReplicaContract.psm1'
)
$artifacts = @($names | ForEach-Object {
  $path = Join-Path $PSScriptRoot $_
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw 'PHASE7B_WP2B_INVOCATION_CONTRACT_SOURCE_MISSING' }
  [pscustomobject]@{ relativePath="scripts/$_";sha256=Get-Phase7BSha256 -LiteralPath $path;bytes=[int64](Get-Item -LiteralPath $path).Length }
})
$applicationCommit = [string](Get-Phase7BWorkPackage2Contract).applicationCommit
if ($AgeRecipient -cnotmatch '^age1[023456789acdefghjklmnpqrstuvwxyz]{58}$' -or
    $ExpectedAgeExeSha256 -cnotmatch '^[0-9a-f]{64}$' -or $ExpectedAgeKeygenSha256 -cnotmatch '^[0-9a-f]{64}$' -or
    -not (Test-Path -LiteralPath $AgeExePath -PathType Leaf) -or -not (Test-Path -LiteralPath $AgeKeygenPath -PathType Leaf) -or
    (Get-Phase7BSha256 -LiteralPath $AgeExePath) -cne $ExpectedAgeExeSha256 -or
    (Get-Phase7BSha256 -LiteralPath $AgeKeygenPath) -cne $ExpectedAgeKeygenSha256) {
  throw 'PHASE7B_WP2B_INVOCATION_CONTRACT_AGE_BINDING_FAIL'
}
$ageExePathSha256 = Get-Phase7BSha256 -Text ([IO.Path]::GetFullPath($AgeExePath).ToLowerInvariant())
$ageKeygenPathSha256 = Get-Phase7BSha256 -Text ([IO.Path]::GetFullPath($AgeKeygenPath).ToLowerInvariant())
$ageVersionLines = @(& $AgeExePath --version 2>&1)
$ageVersion = Test-Phase7BWorkPackage2AgeVersionOutput -OutputLines @($ageVersionLines | ForEach-Object { [string]$_ }) -ExitCode $LASTEXITCODE
$ageKeygenVersionLines = @(& $AgeKeygenPath --version 2>&1)
$ageKeygenVersion = Test-Phase7BWorkPackage2AgeVersionOutput -OutputLines @($ageKeygenVersionLines | ForEach-Object { [string]$_ }) -ExitCode $LASTEXITCODE
if (-not $ageVersion.pass -or -not $ageKeygenVersion.pass) { throw 'PHASE7B_WP2B_INVOCATION_CONTRACT_AGE_VERSION_FAIL' }
$document = New-Phase7BWorkPackage2InvocationContractDocument -AttemptId $AttemptId -ToolingCommit $head -ApplicationCommit $applicationCommit -Artifacts $artifacts `
  -AgeRecipient $AgeRecipient -AgeExePathSha256 $ageExePathSha256 -AgeExeSha256 $ExpectedAgeExeSha256 -AgeVersion ([string]$ageVersion.normalizedVersion) `
  -AgeKeygenPathSha256 $ageKeygenPathSha256 -AgeKeygenSha256 $ExpectedAgeKeygenSha256 -AgeKeygenVersion ([string]$ageKeygenVersion.normalizedVersion)
$persisted = Write-Phase7BSafeEvidenceFile -LiteralPath $OutputPath -Evidence $document
[ordered]@{classification='PHASE7B_WP2B_INVOCATION_CONTRACT_CREATED';pass=$true;attemptId=$AttemptId;toolingCommit=$head;fileName=$persisted.fileName;sha256=$persisted.sha256;artifactCount=$artifacts.Count;mutationPerformed=$true;automaticRetryAllowed=$false;wp2cAuthorized=$false}|ConvertTo-Json -Depth 4
