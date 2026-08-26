[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$BindingsPlanPath,[Parameter(Mandatory=$true)][string]$BindingsPlanSha256,[Parameter(Mandatory=$true)][string]$GuestReportPath,[Parameter(Mandatory=$true)][string]$GuestReportSha256,[Parameter(Mandatory=$true)][string]$EntryEvidencePath,[Parameter(Mandatory=$true)][string]$EntryEvidenceSha256,[Parameter(Mandatory=$true)][string]$VmxPath,[Parameter(Mandatory=$true)][string]$SnapshotMetadataPath,[Parameter(Mandatory=$true)][string]$OutputPath,[Parameter(Mandatory=$true)][switch]$FounderPreparationReviewed)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CContract.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CHost.psm1')
Assert-Phase7BWP2C $FounderPreparationReviewed.IsPresent 'PREPARATION_REVIEW_REQUIRED'
$b=Read-Phase7BWP2CBoundJson $BindingsPlanPath $BindingsPlanSha256
$g=Read-Phase7BWP2CBoundJson $GuestReportPath $GuestReportSha256
$e=Read-Phase7BWP2CBoundJson $EntryEvidencePath $EntryEvidenceSha256
Assert-Phase7BWP2C ($b.identityEntryValidationSha256 -ceq $EntryEvidenceSha256) 'PREPARATION_ENTRY_BINDING'
$observation=Get-Phase7BWP2CHostObservation $VmxPath $SnapshotMetadataPath
$document=New-Phase7BWP2CPreparationEvidence $b $observation $g $e -FounderReviewed
$identity=Write-Phase7BWP2CCreateNewJson $OutputPath $document
[ordered]@{classification='PHASE7B_WP2C_PREPARATION_RECORDED_NONEXECUTABLE';identity=$identity;wp2cExecuted=$false;packetDecrypted=$false;executionClaimCreated=$false;authorizationConsumed=$false}|ConvertTo-Json -Depth 4
