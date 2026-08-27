[CmdletBinding()]
param(
  [ValidateSet('Inspect','Install','Session','Baseline')][string]$Operation='Inspect',
  [string]$PreparationOpticalRoot,[string]$PreparationDescriptorSha256,
  [string]$ExpectedGuestIdentitySha256,[string]$ExpectedToolingManifestSha256,
  [switch]$FounderPreparationApproved
)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bIsolatedGuestContract.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2Contract.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CContract.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CGuest.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CMedia.psm1')
Assert-Phase7BWP2C ($PSVersionTable.PSEdition -ceq 'Desktop' -and $PSVersionTable.PSVersion.Major -eq 5 -and $PSVersionTable.PSVersion.Minor -eq 1 -and [Environment]::Is64BitProcess) 'PS51_REQUIRED'
$machine=Get-CimInstance Win32_ComputerSystem -ErrorAction Stop
Assert-Phase7BWP2C ($machine.Manufacturer -ceq 'VMware, Inc.' -and $machine.Model -match '^VMware') 'WRONG_MACHINE'
if($Operation -in @('Install','Session','Baseline')){Assert-Phase7BWP2C $FounderPreparationApproved.IsPresent 'FOUNDER_PREPARATION_REQUIRED'}
if($Operation -in @('Baseline','Install')){
  # Before installation this entry must itself come from the exact tooling CD.
  $cd=$PSScriptRoot.TrimEnd('\')+'\'
  Assert-Phase7BWP2C ($cd -cmatch '^[A-Z]:\\$') 'TOOLING_OPTICAL_REQUIRED'
  $disks=@(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=5' -ErrorAction Stop|Where-Object {$_.DeviceID -ceq $cd.Substring(0,2) -and $_.VolumeName -ceq 'P7B_C_TOOLS'})
  Assert-Phase7BWP2C ($disks.Count -eq 1) 'TOOLING_OPTICAL_REQUIRED'
  $manifest=Get-Phase7BWP2CDependencyManifest $PSScriptRoot
  $baselineBinding=$null
  if(Test-Path -LiteralPath (Join-Path $PSScriptRoot 'wp2c-baseline-binding.json') -PathType Leaf){
    $baselineBinding=(Read-Phase7BWP2CBaselineBinding $PSScriptRoot).document
  }
  Assert-Phase7BWP2CExactFileSet $PSScriptRoot (Get-Phase7BWP2CToolingMediaFileNames $PSScriptRoot $manifest)
}
if($Operation -ceq 'Baseline'){
  Assert-Phase7BWP2C ((Get-Phase7BWP2CObjectHash $manifest) -ceq $ExpectedToolingManifestSha256) 'PREPARATION_TOOLING_MANIFEST'
  if($null -ne $baselineBinding){
    Assert-Phase7BWP2C ($baselineBinding.operation -ceq 'Baseline' -and
      $baselineBinding.toolingManifestSha256 -ceq $ExpectedToolingManifestSha256 -and
      $baselineBinding.guestIdentitySha256 -ceq $ExpectedGuestIdentitySha256) 'BASELINE_BINDING_ARGUMENTS'
  }
  $baseline=Get-Phase7BWP2CGuestPreparationBaseline $ExpectedGuestIdentitySha256
  $text=ConvertTo-Phase7BWP2CPreparationReturnText $baseline
  for($offset=0;$offset -lt $text.Length;$offset+=80){Write-Output $text.Substring($offset,[math]::Min(80,$text.Length-$offset))}
  return
}
# No arbitrary writable observation-plan path is accepted by this entry.
$carrier=Read-Phase7BWP2CPreparationOptical $PreparationOpticalRoot $PreparationDescriptorSha256
$plan=$carrier.plan;$b=$plan.bindings
if($Operation -ceq 'Install'){
  Assert-Phase7BWP2C ((Get-Phase7BWP2CObjectHash $manifest) -ceq $b.toolingManifestSha256) 'PREPARATION_TOOLING_MANIFEST'
  if($null -ne $baselineBinding){
    Assert-Phase7BWP2C ($baselineBinding.toolingManifestSha256 -ceq $b.toolingManifestSha256 -and
      $baselineBinding.guestIdentitySha256 -ceq $b.guestIdentitySha256) 'BASELINE_BINDING_ARGUMENTS'
  }
  & (Join-Path $PSScriptRoot 'phase7bInstallWorkPackage2GuestTooling.ps1') -OpticalRoot $cd -ManifestSha256 $b.toolingManifestSha256 -ExpectedGuestIdentitySha256 $b.guestIdentitySha256 -ExpectedMarkerSha256 $b.guestMarkerSha256 -AgeSha256 $b.age.sha256 -AgeBytes $b.age.bytes -AgeKeygenSha256 $b.ageKeygen.sha256 -AgeKeygenBytes $b.ageKeygen.bytes -FounderPreparationApproved
  return
}
$observation=Assert-Phase7BWP2CGuestPreMutation $plan
$report=[pscustomobject][ordered]@{schemaVersion=1;kind='wp2c-guest-preparation-observation';planSha256=$carrier.descriptor.plan.sha256;observation=$observation;observedAt=[datetime]::UtcNow.ToString('o');wp2cExecuted=$false;packetDecrypted=$false;executionClaimCreated=$false;authorizationConsumed=$false;reportPersisted=$false}
if($Operation -ceq 'Inspect'){$report|ConvertTo-Json -Depth 12;return}
$observations=@()
foreach($case in @('first-field','canary','interrupt')){
  Write-Host ('SYNTHETIC ONLY - '+$case+'. Follow the frozen operator checklist. No real identity. Stop on unexpected input.')
  [void](Read-Host 'Press Enter only when ready for this defined synthetic group')
  $raw=@(& (Join-Path $PSScriptRoot 'phase7bTestWorkPackage2GuestIdentityEntry.ps1') -Case $case -FounderSyntheticGuestTestApproved)
  $observations+=($raw -join "`n"|ConvertFrom-Json -ErrorAction Stop)
  Assert-Phase7BWP2C ((Read-Host 'Was there NO unexpected input or unsafe behavior? Type YES, otherwise STOP') -ceq 'YES') 'PREPARATION_SYNTHETIC_STOP'
}
# Observe again after the synthetic UI, before persisting the actual return.
$report=New-Phase7BWP2CPreparationGuestReport $plan $carrier.descriptor.plan.sha256
$returned=New-Phase7BWP2CPreparationReturn $plan $carrier.descriptorIdentity $report $observations
$fixed=Get-Phase7BIsolatedGuestContract
$output=Join-Path $fixed.isolatedRoot ('preparation-output\'+$b.preparedStateId)
[void](Assert-Phase7BWP2CLocalPath $output $fixed.isolatedRoot)
Assert-Phase7BWP2C (-not (Test-Path -LiteralPath $output)) 'PREPARATION_OUTPUT_COLLISION'
$text=ConvertTo-Phase7BWP2CPreparationReturnText $returned
New-Item -ItemType Directory -Path $output -ErrorAction Stop|Out-Null
[void](Write-Phase7BWP2CCreateNewJson (Join-Path $output 'preparation-return.json') $returned)
Write-Host 'STOP HOST CLIPBOARD OBSERVATION BEFORE TAKING/COPYING A NONSECRET SCREENSHOT.'
Write-Host 'Copy only the following WP2CP1 block through host Snipping Tool Text actions. Whitespace is ignored; altered characters fail checksum.'
for($offset=0;$offset -lt $text.Length;$offset+=80){Write-Output $text.Substring($offset,[math]::Min(80,$text.Length-$offset))}
Write-Host 'PHASE7B_WP2C_PREPARATION_RETURN_READY_NONEXECUTABLE - preserve output, then cleanly shut down. No restore occurred.'
