[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$OpticalRoot,[Parameter(Mandatory=$true)][string]$ManifestSha256,[Parameter(Mandatory=$true)][string]$ExpectedGuestIdentitySha256,[Parameter(Mandatory=$true)][string]$ExpectedMarkerSha256,[Parameter(Mandatory=$true)][string]$AgeSha256,[Parameter(Mandatory=$true)][int64]$AgeBytes,[Parameter(Mandatory=$true)][string]$AgeKeygenSha256,[Parameter(Mandatory=$true)][int64]$AgeKeygenBytes,[Parameter(Mandatory=$true)][switch]$FounderPreparationApproved)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bIsolatedGuestContract.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CContract.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CMedia.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bIsolatedGuestReconciliation.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CGuest.psm1')
Assert-Phase7BWP2C $FounderPreparationApproved.IsPresent 'FOUNDER_PREPARATION_REQUIRED'
Assert-Phase7BWP2C ($PSVersionTable.PSEdition -ceq 'Desktop' -and $PSVersionTable.PSVersion.Major -eq 5 -and $PSVersionTable.PSVersion.Minor -eq 1) 'PS51_REQUIRED'
$principal=New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
Assert-Phase7BWP2C ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) 'ADMIN_REQUIRED'
$computer=Get-CimInstance Win32_ComputerSystem -ErrorAction Stop
Assert-Phase7BWP2C ($computer.Manufacturer -ceq 'VMware, Inc.' -and $computer.Model -match '^VMware') 'WRONG_MACHINE'
$uuid=(Get-CimInstance Win32_ComputerSystemProduct -ErrorAction Stop).UUID
Assert-Phase7BWP2C ((Get-Phase7BWP2CObjectHash ([string]$uuid).ToLowerInvariant()) -ceq $ExpectedGuestIdentitySha256) 'WRONG_GUEST'
$fixed=Get-Phase7BIsolatedGuestContract
Assert-Phase7BWP2C ((Get-Phase7BSha256 -LiteralPath (Join-Path $fixed.isolatedRoot 'guest-identity-marker.json')) -ceq $ExpectedMarkerSha256) 'WRONG_GUEST_MARKER'
Assert-Phase7BWP2C ($OpticalRoot -cmatch '^[A-Z]:\\$') 'OPTICAL_ROOT_REQUIRED'
$optical=@(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=5' -ErrorAction Stop | Where-Object {$_.DeviceID -ceq $OpticalRoot.Substring(0,2) -and $_.VolumeName -ceq 'P7B_C_TOOLS'})
Assert-Phase7BWP2C ($optical.Count -eq 1) 'TOOLING_OPTICAL_REQUIRED'
Assert-Phase7BWP2C (@(Get-NetAdapter -IncludeHidden -ErrorAction Stop | Where-Object {$_.Status -eq 'Up'}).Count -eq 0) 'NETWORK_NOT_DISCONNECTED'
$manifest=Read-Phase7BWP2CBoundJson (Join-Path $OpticalRoot 'wp2c-tooling-manifest.json') $ManifestSha256
$actual=Get-Phase7BWP2CDependencyManifest $OpticalRoot
Assert-Phase7BWP2C ((Get-Phase7BWP2CObjectHash $actual) -ceq $ManifestSha256) 'TOOLING_CLOSURE'
$opticalNames=Get-Phase7BWP2CToolingMediaFileNames $OpticalRoot $manifest
Assert-Phase7BWP2CExactFileSet $OpticalRoot $opticalNames
if('wp2c-baseline-binding.json' -cin $opticalNames){
  $baselineBinding=(Read-Phase7BWP2CBaselineBinding $OpticalRoot).document
  Assert-Phase7BWP2C ($baselineBinding.toolingManifestSha256 -ceq $ManifestSha256 -and
    $baselineBinding.guestIdentitySha256 -ceq $ExpectedGuestIdentitySha256) 'BASELINE_BINDING_ARGUMENTS'
}
Assert-Phase7BWP2CFile (Join-Path $OpticalRoot 'age.exe') ([pscustomobject]@{sha256=$AgeSha256;bytes=$AgeBytes})
Assert-Phase7BWP2CFile (Join-Path $OpticalRoot 'age-keygen.exe') ([pscustomobject]@{sha256=$AgeKeygenSha256;bytes=$AgeKeygenBytes})
$tasks=@(foreach($name in @($fixed.productionTaskName,$fixed.monitorTaskName,$fixed.ngrokTaskName)){Get-ScheduledTask -TaskName $name -ErrorAction Stop})
Assert-Phase7BWP2C (Test-Phase7BInertTaskSet -TaskProjections @($tasks|ForEach-Object {Get-Phase7BReconciliationTaskProjection -TaskName $_.TaskName -Task @($_)}) -Contract $fixed).pass 'PREPARATION_TASKS_NOT_INERT'
Assert-Phase7BWP2C (@(Get-Process -ErrorAction Stop|Where-Object {$_.ProcessName -in @('node','ngrok','postgres','mysqld','sqlservr','mongod')}).Count -eq 0) 'PREPARATION_RUNTIME_ACTIVE'
Assert-Phase7BWP2C (@(Get-NetTCPConnection -ErrorAction Stop|Where-Object {$_.LocalPort -eq 3000 -and $_.State -eq 'Listen'}).Count -eq 0) 'PREPARATION_LISTENER_ACTIVE'
$hgfsObservation=Get-Phase7BWP2CHgfsObservation $computer
Assert-Phase7BWP2C (Test-Phase7BWP2CHgfsObservation $hgfsObservation) 'PREPARATION_HGFS'
$disk=Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'" -ErrorAction Stop
$needed=[int64]$AgeBytes+$AgeKeygenBytes+1GB;foreach($file in $manifest.files){$needed+=[int64]$file.bytes}
Assert-Phase7BWP2C ($disk.DriveType -eq 3 -and $disk.FileSystem -ceq 'NTFS' -and $disk.FreeSpace -ge $needed) 'TOOLING_CAPACITY'
$roots=@((Join-Path $fixed.isolatedRoot 'incoming'),(Join-Path $fixed.isolatedRoot 'restore\canonical'),(Join-Path $fixed.isolatedRoot 'wp2c-state'))
foreach($root in $roots){[void](Assert-Phase7BWP2CLocalPath $root $fixed.isolatedRoot);if(Test-Path -LiteralPath $root){Assert-Phase7BWP2C (@(Get-ChildItem -LiteralPath $root -Force).Count -eq 0) 'PREPARATION_ROOT_COLLISION'}}
$target=Join-Path $fixed.isolatedRoot ('tooling\'+$ManifestSha256)
[void](Assert-Phase7BWP2CLocalPath $target $fixed.isolatedRoot)
Assert-Phase7BWP2C (-not (Test-Path -LiteralPath $target)) 'TOOLING_INSTALL_COLLISION'
New-Item -ItemType Directory -Path $target -ErrorAction Stop | Out-Null
foreach($name in $names){[IO.File]::Copy((Join-Path $OpticalRoot $name),(Join-Path $target $name),$false);Assert-Phase7BWP2CFile (Join-Path $target $name) (Get-Phase7BWP2CIdentity (Join-Path $OpticalRoot $name))}
Assert-Phase7BWP2CExactFileSet $target $names
foreach($root in $roots){if(-not (Test-Path -LiteralPath $root)){New-Item -ItemType Directory -Path $root -ErrorAction Stop|Out-Null}}
[ordered]@{classification='PHASE7B_WP2C_TOOLING_INSTALLED';toolingRoot=$target;toolingManifestSha256=$ManifestSha256;wp2cExecuted=$false;packetDecrypted=$false;executionClaimCreated=$false;authorizationConsumed=$false;automaticRetryAllowed=$false}|ConvertTo-Json
