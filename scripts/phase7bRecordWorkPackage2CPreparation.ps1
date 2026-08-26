[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$PreparationContentRoot,[Parameter(Mandatory=$true)][string]$PreparationDescriptorSha256,
  [Parameter(Mandatory=$true)][string]$PreparationMediaPath,[Parameter(Mandatory=$true)][string]$PreparationMediaSha256,
  [Parameter(Mandatory=$true)][string]$ToolingMediaPath,
  [Parameter(Mandatory=$true)][string]$ReturnTextPath,
  [Parameter(Mandatory=$true)][string]$FounderReviewPath,[Parameter(Mandatory=$true)][string]$FounderReviewSha256,
  [Parameter(Mandatory=$true)][string]$VmxPath,[Parameter(Mandatory=$true)][string]$SnapshotMetadataPath,
  [Parameter(Mandatory=$true)][string]$OutputDirectory,[Parameter(Mandatory=$true)][switch]$FounderPreparationReviewed
)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bIsolatedGuestContract.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CContract.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CHost.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CMedia.psm1')
Assert-Phase7BWP2C $FounderPreparationReviewed.IsPresent 'PREPARATION_REVIEW_REQUIRED'
$carrier=Read-Phase7BWP2CPreparationContent $PreparationContentRoot $PreparationDescriptorSha256
$plan=$carrier.plan
Assert-Phase7BWP2CPublishedRepository (Split-Path -Parent $PSScriptRoot) $plan.bindings.toolingCommit
Assert-Phase7BWP2CFile $ToolingMediaPath $plan.bindings.toolingMedia
$media=Get-Phase7BWP2CIdentity $PreparationMediaPath
Assert-Phase7BWP2C ($media.sha256 -ceq $PreparationMediaSha256) 'PREPARATION_MEDIA_IDENTITY'
$label=Get-Phase7BIsoVolumeIdentity $PreparationMediaPath
Assert-Phase7BWP2C ($label.primaryVolumeLabel -ceq 'P7B_C_PREP' -and $label.jolietVolumeLabel -ceq 'P7B_C_PREP') 'PREPARATION_MEDIA_IDENTITY'
Assert-Phase7BWP2C ((Get-Item -LiteralPath $ReturnTextPath).Length -le 20000) 'PREPARATION_RETURN_TOO_LARGE'
$returned=ConvertFrom-Phase7BWP2CPreparationReturnText (Get-Content -LiteralPath $ReturnTextPath -Raw -ErrorAction Stop)
$review=Read-Phase7BWP2CBoundJson $FounderReviewPath $FounderReviewSha256
$observation=Get-Phase7BWP2CHostObservation $VmxPath $SnapshotMetadataPath
$result=New-Phase7BWP2CPreparationHandoffEvidence $plan $returned $review $observation $media $carrier.descriptorIdentity
[void](Assert-Phase7BWP2CLocalPath $OutputDirectory 'C:\Phase7B\host-evidence\379bb303\wp2c')
Assert-Phase7BWP2C (-not (Test-Path -LiteralPath $OutputDirectory)) 'PREPARATION_OUTPUT_COLLISION'
# All bytes/schema/context/host checks precede this first host evidence mutation.
# A partial write is retained for reconciliation, never silently overwritten.
New-Item -ItemType Directory -Path $OutputDirectory -ErrorAction Stop|Out-Null
$report=Write-Phase7BWP2CCreateNewJson (Join-Path $OutputDirectory 'guest-report.json') $result.report
$entry=Write-Phase7BWP2CCreateNewJson (Join-Path $OutputDirectory 'identity-entry-validation.json') $result.entry
$envelope=Write-Phase7BWP2CCreateNewJson (Join-Path $OutputDirectory 'preparation-return.json') $returned
$identity=Write-Phase7BWP2CCreateNewJson (Join-Path $OutputDirectory 'preparation.json') $result.preparation
[ordered]@{classification='PHASE7B_WP2C_PREPARATION_RECORDED_NONEXECUTABLE';identity=$identity;guestReport=$report;entryValidation=$entry;returnedEnvelope=$envelope;wp2cExecuted=$false;packetDecrypted=$false;executionClaimCreated=$false;authorizationConsumed=$false}|ConvertTo-Json -Depth 4
