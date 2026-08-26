[CmdletBinding()]
param([Parameter(Mandatory=$true)][ValidateSet('Tooling','Recovery','Control','Preparation')][string]$Kind,[Parameter(Mandatory=$true)][string]$InputsPath,[Parameter(Mandatory=$true)][string]$OutputPath,[Parameter(Mandatory=$true)][switch]$FounderMediaPreparationApproved)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CContract.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CMedia.psm1')
Assert-Phase7BWP2C $FounderMediaPreparationApproved.IsPresent 'FOUNDER_MEDIA_PREPARATION_REQUIRED'
$inputs=Get-Content -LiteralPath $InputsPath -Raw -ErrorAction Stop | ConvertFrom-Json
$content=$OutputPath+'.content'
Assert-Phase7BWP2C (-not (Test-Path -LiteralPath $OutputPath) -and -not (Test-Path -LiteralPath $content)) 'MEDIA_DESTINATION_EXISTS'
switch($Kind){
  'Preparation' {
    $result=New-Phase7BWP2CPreparationContent $inputs.planPath $inputs.planSha256 $content
    $label='P7B_C_PREP'
  }
  'Tooling' {
    Assert-Phase7BWP2CFile $inputs.agePath $inputs.age
    Assert-Phase7BWP2CFile $inputs.ageKeygenPath $inputs.ageKeygen
    $result=New-Phase7BWP2CToolingContent $PSScriptRoot $inputs.agePath $inputs.ageKeygenPath $content
    $label='P7B_C_TOOLS'
  }
  'Recovery' {
    $result=New-Phase7BWP2CRecoveryContent $inputs.packetPath $inputs.descriptorPath $inputs.descriptorSha256 $content
    $label='P7B_C_RESTORE'
  }
  'Control' {
    $result=New-Phase7BWP2CControlContent $inputs.invocationPath $inputs.invocationSha256 $inputs.authorizationPath $inputs.authorizationSha256 $inputs.hostClaimPath $inputs.hostClaimSha256 $inputs.preparationPath $inputs.entryValidationPath $content
    $label='P7B_C_CONTROL'
  }
}
$identity=New-Phase7BWP2COpticalImage $content $label $OutputPath
[ordered]@{classification='PHASE7B_WP2C_MEDIA_CREATED';kind=$Kind;identity=$identity;content=$result;wp2cExecuted=$false;secretIncluded=$false;automaticRetryAllowed=$false}|ConvertTo-Json -Depth 12
# Nonsecret content retained for byte-level review. No broad finally deletion.
