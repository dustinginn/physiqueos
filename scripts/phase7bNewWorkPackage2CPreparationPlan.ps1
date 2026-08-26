[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$BaselinePath,[Parameter(Mandatory=$true)][string]$BaselineSha256,
  [Parameter(Mandatory=$true)][string]$DescriptorPath,[Parameter(Mandatory=$true)][string]$DescriptorSha256,
  [Parameter(Mandatory=$true)][string]$ToolingMediaPath,[Parameter(Mandatory=$true)][string]$ToolingMediaSha256,
  [Parameter(Mandatory=$true)][string]$AgePath,[Parameter(Mandatory=$true)][string]$AgeKeygenPath,
  [Parameter(Mandatory=$true)][string]$ToolingCommit,[Parameter(Mandatory=$true)][string]$PreparedStateId,
  [Parameter(Mandatory=$true)][string]$VmxPath,[Parameter(Mandatory=$true)][string]$SnapshotMetadataPath,
  [Parameter(Mandatory=$true)][string]$OutputPath,[Parameter(Mandatory=$true)][switch]$FounderPreparationApproved
)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bIsolatedGuestContract.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2Contract.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CContract.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CHost.psm1')
Assert-Phase7BWP2C $FounderPreparationApproved.IsPresent 'FOUNDER_PREPARATION_REQUIRED'
Assert-Phase7BWP2CPublishedRepository (Split-Path -Parent $PSScriptRoot) $ToolingCommit
$baseline=Read-Phase7BWP2CBoundJson $BaselinePath $BaselineSha256
$descriptor=Read-Phase7BWP2CBoundJson $DescriptorPath $DescriptorSha256
$tooling=Get-Phase7BWP2CIdentity $ToolingMediaPath
Assert-Phase7BWP2C ($tooling.sha256 -ceq $ToolingMediaSha256) 'PREPARATION_TOOLING_MEDIA'
$volume=Get-Phase7BIsoVolumeIdentity $ToolingMediaPath
Assert-Phase7BWP2C ($volume.primaryVolumeLabel -ceq 'P7B_C_TOOLS' -and $volume.jolietVolumeLabel -ceq 'P7B_C_TOOLS') 'PREPARATION_TOOLING_MEDIA'
foreach($path in @($AgePath,$AgeKeygenPath)){
  [void](Assert-Phase7BWP2CLocalPath $path)
  $lines=@(& $path --version 2>&1)
  Assert-Phase7BWP2C (Test-Phase7BWorkPackage2AgeVersionOutput @($lines|ForEach-Object {[string]$_}) $LASTEXITCODE).pass 'AGE_VERSION'
}
Assert-Phase7BWP2C ((Get-Phase7BWP2CIdentity $AgePath).sha256 -ceq $descriptor.ageExeSha256 -and (Get-Phase7BWP2CIdentity $AgeKeygenPath).sha256 -ceq $descriptor.ageKeygenSha256) 'PREPARATION_PINNED_AGE'
$cold=Get-Phase7BWP2CHostObservation $VmxPath $SnapshotMetadataPath
Assert-Phase7BWP2C (Test-Phase7BWP2CHostObservation $cold $cold).pass 'PREPARATION_HOST_ISOLATION'
Assert-Phase7BWP2C ($baseline.guestIdentitySha256 -ceq (Get-Phase7BWP2CExpectedGuestIdentity (Read-Phase7BVmx $VmxPath))) 'WRONG_GUEST'
$plan=New-Phase7BWP2CPreparationPlan $baseline $descriptor (Get-Phase7BWP2CIdentity $DescriptorPath) $tooling (Get-Phase7BWP2CIdentity $AgePath) (Get-Phase7BWP2CIdentity $AgeKeygenPath) $PSScriptRoot $ToolingCommit $PreparedStateId $cold.hostIdentitySha256 $cold.vmConfigSha256 $cold.snapshotSha256
$identity=Write-Phase7BWP2CCreateNewJson $OutputPath $plan
[ordered]@{classification='PHASE7B_WP2C_PREPARATION_PLAN_CREATED_NONEXECUTABLE';identity=$identity;preparedStateId=$PreparedStateId;wp2cExecuted=$false;executionClaimCreated=$false}|ConvertTo-Json -Depth 4
