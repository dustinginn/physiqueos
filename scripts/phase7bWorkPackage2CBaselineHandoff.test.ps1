[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$AgeExePath,[Parameter(Mandatory=$true)][string]$AgeKeygenPath)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
if($PSVersionTable.PSEdition -cne 'Desktop' -or $PSVersionTable.PSVersion -lt [version]'5.1'){throw 'WINDOWS_PS51_REQUIRED'}
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CContract.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CMedia.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bIsolatedGuestContract.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2Contract.psm1') -Force
$assertions=0
function Check([bool]$Value,[string]$Label){if(-not $Value){throw ('BASELINE_HANDOFF_TEST:'+ $Label)};$script:assertions++}
function Reject([scriptblock]$Action,[string]$Label){$failed=$false;try{& $Action|Out-Null}catch{$failed=$true};Check $failed $Label}
function Clone($Value){ConvertTo-Phase7BCanonicalJson $Value|ConvertFrom-Json}
$root=Join-Path ([IO.Path]::GetTempPath()) ('bh-'+[guid]::NewGuid().ToString('N').Substring(0,8))
try {
  [void](New-Item -ItemType Directory -Path $root)
  $source=Join-Path $root 'source';[void](New-Item -ItemType Directory -Path $source)
  $closure=Get-Phase7BWP2CDependencyManifest $PSScriptRoot
  foreach($file in $closure.files){[IO.File]::Copy((Join-Path $PSScriptRoot $file.name),(Join-Path $source $file.name))}
  # The actual launcher is exercised. Only its downstream Baseline collector is
  # replaced at the synthetic OS boundary so the test never inspects a real VM.
  $stub=@'
[CmdletBinding()]
param([Parameter(Mandatory=$true)][ValidateSet('Baseline')][string]$Operation,
  [Parameter(Mandatory=$true)][string]$ExpectedGuestIdentitySha256,
  [Parameter(Mandatory=$true)][string]$ExpectedToolingManifestSha256,
  [Parameter(Mandatory=$true)][switch]$FounderPreparationApproved)
$global:phase7bBaselineHandoffInvocationCount++
$global:phase7bBaselineHandoffArguments=[pscustomobject]@{operation=$Operation;guest=$ExpectedGuestIdentitySha256;manifest=$ExpectedToolingManifestSha256;approved=$FounderPreparationApproved.IsPresent}
if($ExpectedGuestIdentitySha256 -cne $global:phase7bBaselineHandoffExpectedGuest){throw 'SYNTHETIC_WRONG_GUEST'}
[pscustomobject]@{classification='PHASE7B_WP2C_GUEST_PREPARATION_BASELINE_COLLECTED';pass=$true;wp2cExecuted=$false}|ConvertTo-Json -Compress
'@
  [IO.File]::WriteAllText((Join-Path $source 'phase7bInspectWorkPackage2CGuestPreparation.ps1'),$stub,(New-Object Text.UTF8Encoding($false)))
  $manifest=Get-Phase7BWP2CDependencyManifest $source
  $fixed=Get-Phase7BIsolatedGuestContract
  $binding=[pscustomobject][ordered]@{
    schemaVersion=1;kind='wp2c-guest-baseline-binding';classification='PHASE7B_WP2C_GUEST_BASELINE_BINDING_NONEXECUTABLE'
    applicationCommit=$fixed.applicationCommit;environmentId=$fixed.environmentId
    preparedStateId=('wp2c-prepared-'+('a'*32));operation='Baseline';toolingCommit=('b'*40)
    toolingManifestSha256=Get-Phase7BWP2CObjectHash $manifest;guestIdentitySha256=('c'*64)
    semanticVm=[pscustomobject][ordered]@{mode='wp2c-semantic-vmx-v2';sha256=('d'*64)}
    parentBridge=[pscustomobject][ordered]@{sha256=('e'*64);bytes=[int64]6119}
    founderPreparationApprovalRequired=$true;nonExecutable=$true;preparationOnly=$true
    restoreAuthorized=$false;wp2cExecutionAuthorized=$false;laterMigrationAuthorized=$false
  }
  Assert-Phase7BWP2CBaselineBinding $binding;Check $true 'source-produced binding accepted'
  $media=Join-Path $root 'media'
  $made=New-Phase7BWP2CToolingContent $source $AgeExePath $AgeKeygenPath $media $binding
  Check (@($made.manifest.files).Count -eq 13) 'current closure has thirteen PowerShell files'
  Check (@(Get-ChildItem -LiteralPath $media).Count -eq 17) 'bound tooling media has exact seventeen-file inventory'
  Check ($made.manifestIdentity.sha256 -ceq $binding.toolingManifestSha256) 'binding manifest pin is independently producer-derived'
  $read=Read-Phase7BWP2CBaselineBinding $media $made.baselineBindingIdentity.sha256
  Check ($read.document.guestIdentitySha256 -ceq ('c'*64) -and $read.document.operation -ceq 'Baseline') 'binding preserves authoritative guest and operation pins'
  Check (-not $read.document.restoreAuthorized -and -not $read.document.wp2cExecutionAuthorized -and -not $read.document.laterMigrationAuthorized) 'binding grants no restore execution or later authority'
  Check ($read.document.nonExecutable -and $read.document.preparationOnly -and $read.document.founderPreparationApprovalRequired) 'binding remains non-executable preparation-only data'
  Check ((ConvertTo-Phase7BCanonicalJson $read.document) -notmatch '(?i)AGE-SECRET-KEY-|password|passphrase|credential') 'binding contains no secret channel'
  $mediaAgain=Join-Path $root 'media-again';$madeAgain=New-Phase7BWP2CToolingContent $source $AgeExePath $AgeKeygenPath $mediaAgain $binding
  Check ($madeAgain.manifestIdentity.sha256 -ceq $made.manifestIdentity.sha256 -and $madeAgain.baselineBindingIdentity.sha256 -ceq $made.baselineBindingIdentity.sha256) 'manifest and binding regenerate deterministically'
  Reject {New-Phase7BWP2CToolingContent $source $AgeExePath $AgeKeygenPath $media $binding} 'bound media create-new collision rejected'

  $bindingBytes=[IO.File]::ReadAllBytes($read.path)
  $bad=Clone $binding;$bad.operation='Restore';[IO.File]::WriteAllText($read.path,(ConvertTo-Phase7BCanonicalJson $bad),(New-Object Text.UTF8Encoding($false)))
  Reject {Read-Phase7BWP2CBaselineBinding $media} 'wrong operation rejected';[IO.File]::WriteAllBytes($read.path,$bindingBytes)
  $bad=Clone $binding;$bad|Add-Member NoteProperty unexpected 'x';[IO.File]::WriteAllText($read.path,(ConvertTo-Phase7BCanonicalJson $bad),(New-Object Text.UTF8Encoding($false)))
  Reject {Read-Phase7BWP2CBaselineBinding $media} 'unexpected binding field rejected';[IO.File]::WriteAllBytes($read.path,$bindingBytes)
  $bad=Clone $binding;$bad.wp2cExecutionAuthorized=$true;[IO.File]::WriteAllText($read.path,(ConvertTo-Phase7BCanonicalJson $bad),(New-Object Text.UTF8Encoding($false)))
  Reject {Read-Phase7BWP2CBaselineBinding $media} 'execution authority rejected';[IO.File]::WriteAllBytes($read.path,$bindingBytes)
  $manifestPath=Join-Path $media 'wp2c-tooling-manifest.json';$manifestBytes=[IO.File]::ReadAllBytes($manifestPath)
  [IO.File]::AppendAllText($manifestPath,' ');Reject {Read-Phase7BWP2CBoundJson $manifestPath $binding.toolingManifestSha256} 'wrong tooling manifest rejected';[IO.File]::WriteAllBytes($manifestPath,$manifestBytes)
  $duplicate=Join-Path $media 'wp2c-baseline-binding-copy.json';[IO.File]::WriteAllBytes($duplicate,$bindingBytes)
  Reject {Assert-Phase7BWP2CExactFileSet $media (Get-Phase7BWP2CToolingMediaFileNames $media $manifest)} 'duplicate binding rejected';Remove-Item -LiteralPath $duplicate
  Remove-Item -LiteralPath $read.path
  Reject {Read-Phase7BWP2CBaselineBinding $media} 'missing binding rejected';[IO.File]::WriteAllBytes($read.path,$bindingBytes)

  $launcherPath=Join-Path $PSScriptRoot 'phase7bRunWorkPackage2CGuestBaseline.ps1'
  $tokens=$null;$errors=$null;$ast=[Management.Automation.Language.Parser]::ParseFile($launcherPath,[ref]$tokens,[ref]$errors)
  Check (@($errors).Count -eq 0) 'launcher parses under Windows PowerShell 5.1'
  Check (@($ast.FindAll({param($n)$n -is [Management.Automation.Language.ExitStatementAst]},$true)).Count -eq 0) 'launcher has no raw exit'
  $text=$ast.Extent.Text
  Check ($text -match "VolumeName -ceq 'P7B_C_TOOLS'" -and $text -match '\$volumes\.Count -eq 1') 'launcher discovers exactly one tooling volume with explicit array semantics'
  Check ($text -match "PSEdition -ceq 'Desktop'" -and $text -match "Host\.Name -ceq 'ConsoleHost'" -and $text -match 'WindowsBuiltInRole]::Administrator') 'launcher requires PS5.1 ConsoleHost and Administrator'
  Check ($text -match "Get-ExecutionPolicy -Scope Process" -and $text -match "-ceq 'Bypass'") 'launcher requires process-only bypass'
  Check (@([regex]::Matches($text,"phase7bInspectWorkPackage2CGuestPreparation\.ps1")).Count -eq 1 -and $text -match '-Operation Baseline') 'launcher invokes Baseline entry exactly once'
  Check ($text -notmatch '(?i)Restore|AGE-SECRET-KEY|Invoke-WebRequest|Invoke-RestMethod|Get-Clipboard|Set-Clipboard|\\\\[A-Za-z0-9]|New-PSDrive') 'launcher has no restore secret network clipboard share path'

  $driveName='Q';$existing=Get-PSDrive -Name $driveName -ErrorAction SilentlyContinue
  if($existing){throw 'SYNTHETIC_DRIVE_COLLISION'}
  & "$env:SystemRoot\System32\subst.exe" ($driveName+':') $media
  if($LASTEXITCODE -ne 0){throw 'SYNTHETIC_SUBST_CREATE'}
  try {
    $global:phase7bBaselineHandoffInvocationCount=0
    $global:phase7bBaselineHandoffArguments=$null
    $global:phase7bBaselineHandoffExpectedGuest='c'*64
    function Get-CimInstance {param($ClassName,$Filter,$ErrorAction);[pscustomobject]@{DeviceID='Q:';VolumeName='P7B_C_TOOLS'}}
    function New-Object {
      param($TypeName,$ArgumentList)
      if($TypeName -ceq 'Security.Principal.WindowsPrincipal'){
        $principal=[pscustomobject]@{};$principal|Add-Member ScriptMethod IsInRole {$true};return $principal
      }
      Microsoft.PowerShell.Utility\New-Object @PSBoundParameters
    }
    $output=@(& 'Q:\phase7bRunWorkPackage2CGuestBaseline.ps1' -FounderPreparationApproved)
    Check ($global:phase7bBaselineHandoffInvocationCount -eq 1) 'actual launcher invokes synthetic Baseline boundary exactly once'
    Check ($global:phase7bBaselineHandoffArguments.operation -ceq 'Baseline' -and $global:phase7bBaselineHandoffArguments.guest -ceq ('c'*64) -and $global:phase7bBaselineHandoffArguments.manifest -ceq $binding.toolingManifestSha256 -and $global:phase7bBaselineHandoffArguments.approved) 'actual launcher forwards exact immutable pins and approval'
    Check (($output -join "`n") -match 'PHASE7B_WP2C_GUEST_PREPARATION_BASELINE_COLLECTED') 'source-produced WP2CP1 Baseline behavior remains downstream'
    function Get-CimInstance {param($ClassName,$Filter,$ErrorAction);@()}
    Reject {& 'Q:\phase7bRunWorkPackage2CGuestBaseline.ps1' -FounderPreparationApproved} 'zero tooling volumes rejected'
    function Get-CimInstance {param($ClassName,$Filter,$ErrorAction);@([pscustomobject]@{DeviceID='Q:';VolumeName='P7B_C_TOOLS'},[pscustomobject]@{DeviceID='R:';VolumeName='P7B_C_TOOLS'})}
    Reject {& 'Q:\phase7bRunWorkPackage2CGuestBaseline.ps1' -FounderPreparationApproved} 'multiple tooling volumes rejected'
  } finally {
    & "$env:SystemRoot\System32\subst.exe" ($driveName+':') /D
    if($LASTEXITCODE -ne 0){throw 'SYNTHETIC_SUBST_REMOVE'}
    Remove-Variable phase7bBaselineHandoffInvocationCount,phase7bBaselineHandoffArguments,phase7bBaselineHandoffExpectedGuest -Scope Global -ErrorAction SilentlyContinue
  }
  [ordered]@{classification='PHASE7B_WP2C_BASELINE_HANDOFF_TESTS_PASS';pass=$true;assertions=$assertions;actualLauncherExecuted=$true;actualGuestAccess=$false;liveMediaCreated=$false;vmBooted=$false;wp2cExecuted=$false}|ConvertTo-Json -Compress
} finally {
  if(Test-Path -LiteralPath $root){$resolved=(Resolve-Path -LiteralPath $root).Path;if((Split-Path -Parent $resolved) -cne ([IO.Path]::GetTempPath().TrimEnd('\')) -or (Split-Path -Leaf $resolved) -cnotmatch '^bh-[0-9a-f]{8}$'){throw 'SYNTHETIC_CLEANUP_BOUNDARY'};Remove-Item -LiteralPath $resolved -Recurse -Force}
}
