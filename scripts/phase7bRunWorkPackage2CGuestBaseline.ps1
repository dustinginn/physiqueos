[CmdletBinding()]
param([Parameter(Mandatory=$true)][switch]$FounderPreparationApproved)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CContract.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CMedia.psm1')

Assert-Phase7BWP2C ($PSVersionTable.PSEdition -ceq 'Desktop' -and
  $PSVersionTable.PSVersion.Major -eq 5 -and $PSVersionTable.PSVersion.Minor -eq 1 -and
  [Environment]::Is64BitProcess -and $Host.Name -ceq 'ConsoleHost') 'BASELINE_LAUNCHER_PS51_CONSOLEHOST'
Assert-Phase7BWP2C ((Get-ExecutionPolicy -Scope Process) -ceq 'Bypass') 'BASELINE_LAUNCHER_PROCESS_POLICY'
$principal=New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
Assert-Phase7BWP2C ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) 'BASELINE_LAUNCHER_ADMIN'
Assert-Phase7BWP2C $FounderPreparationApproved.IsPresent 'FOUNDER_PREPARATION_REQUIRED'

$volumes=@(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=5' -ErrorAction Stop|
  Where-Object {$_.VolumeName -ceq 'P7B_C_TOOLS'})
Assert-Phase7BWP2C ($volumes.Count -eq 1) 'BASELINE_LAUNCHER_TOOLING_VOLUME'
$root=$volumes[0].DeviceID+'\'
Assert-Phase7BWP2C ($root -cmatch '^[A-Z]:\\$' -and
  $PSScriptRoot.TrimEnd('\') -ceq $root.TrimEnd('\')) 'BASELINE_LAUNCHER_TOOLING_ROOT'

$bound=Read-Phase7BWP2CBaselineBinding $root
$binding=$bound.document
$manifest=Read-Phase7BWP2CBoundJson (Join-Path $root 'wp2c-tooling-manifest.json') $binding.toolingManifestSha256
$actual=Get-Phase7BWP2CDependencyManifest $root
Assert-Phase7BWP2C ((Get-Phase7BWP2CObjectHash $actual) -ceq $binding.toolingManifestSha256 -and
  (Get-Phase7BWP2CObjectHash $manifest) -ceq $binding.toolingManifestSha256) 'BASELINE_LAUNCHER_TOOLING_MANIFEST'
Assert-Phase7BWP2CExactFileSet $root (Get-Phase7BWP2CToolingMediaFileNames $root $manifest)

& (Join-Path $root 'phase7bInspectWorkPackage2CGuestPreparation.ps1') -Operation Baseline `
  -ExpectedGuestIdentitySha256 $binding.guestIdentitySha256 `
  -ExpectedToolingManifestSha256 $binding.toolingManifestSha256 `
  -FounderPreparationApproved
