[CmdletBinding()]
param([switch]$ReproducePublishedDefect)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
if($PSVersionTable.PSEdition -cne 'Desktop' -or $PSVersionTable.PSVersion -lt [version]'5.1'){throw 'WINDOWS_PS51_REQUIRED'}
Import-Module (Join-Path $PSScriptRoot 'phase7bIsolatedGuestContract.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CContract.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CGuest.psm1')
$guestModule=Get-Module phase7bWorkPackage2CGuest
$contractModule=Get-Module phase7bWorkPackage2CContract
$fixed=Get-Phase7BIsolatedGuestContract
$script:assertions=0
function Check([bool]$Value,[string]$Label){if(-not $Value){throw "COLLECTOR_TEST:$Label"};$script:assertions++}
function Reject([scriptblock]$Action,[string]$Code){
  $message='';try {& $Action | Out-Null}catch{$message=$_.Exception.Message}
  Check ($message -ceq ('PHASE7B_WP2C_'+$Code)) ('expected '+$Code+', received '+$message)
}
function Clone($Value){$Value|ConvertTo-Json -Depth 30|ConvertFrom-Json}

# Only the OS/filesystem/native-command boundaries are substituted. The actual
# collector, ownership validators, observation evaluator, inspector and entry
# gate execute unchanged. No VM, real guest paths, environment values, secret UI,
# network, live evidence or native guest tools are accessed by these fixtures.
$fixture=@{
  fixed=Clone $fixed;missing=@();reparse=@();resolved=@{};providers=@{};files=@();directories=@{}
  manufacturer='VMware, Inc.';computerName='WP2C-SYNTHETIC';uuid='synthetic-collector-uuid'
  head=$fixed.applicationCommit;dirty=$false;marker=Clone $fixed;markerHash='6'*64
  reads=New-Object 'Collections.Generic.List[string]';nativeCalls=0;installedChecks=0
}
$fixture.marker.schemaVersion=1
$bindings=[pscustomobject]@{
  guestComputerName=$fixture.computerName;guestIdentitySha256=Get-Phase7BWP2CObjectHash $fixture.uuid
  applicationCommit=$fixed.applicationCommit;guestMarkerSha256=$fixture.markerHash;toolingManifestSha256='7'*64
  guestOsBuild='26200';guestOsCaption='Microsoft Windows 11 Enterprise Evaluation';vmwareToolsVersion='synthetic-tools'
  incomingRoot=Join-Path $fixed.isolatedRoot 'incoming';restoreRoot=Join-Path $fixed.isolatedRoot 'restore\canonical'
  stateRoot=Join-Path $fixed.isolatedRoot 'wp2c-state';toolingRoot=Join-Path $fixed.isolatedRoot ('tooling\'+('7'*64))
  packet=[pscustomobject]@{bytes=[int64]4097};plaintextZip=[pscustomobject]@{bytes=[int64]4097};maximumExpandedBytes=[int64]8192
  git=[pscustomobject]@{sha256='8'*64;bytes=4097}
}
$plan=[pscustomobject]@{schemaVersion=1;kind='wp2c-preparation-observation-plan';bindings=$bindings}
$fixture.plan=$plan;$fixture.planPath='C:\synthetic-only\observation-plan.json'
$fixture.planHash=Get-Phase7BWP2CObjectHash $plan

# Mock filesystem metadata in BOTH defining module scopes, keeping the actual
# containment/reparse algorithm intact. Unknown content reads throw, not fall
# through to the Primary PC. The fixture contains no real files or credentials.
$filesystemMocks={
  param($State)
  $script:collectorFixture=$State
  function script:Test-Path {
    param($LiteralPath,$PathType,[switch]$IsValid,$ErrorAction)
    if($LiteralPath -in $script:collectorFixture.missing){return $false}
    if($PathType -eq 'Container' -and $LiteralPath -in $script:collectorFixture.files){return $false}
    $true
  }
  function script:Get-Item {
    param($LiteralPath,[switch]$Force,$ErrorAction)
    $s=$script:collectorFixture;$s.reads.Add([string]$LiteralPath)
    if($LiteralPath -in $s.missing){throw 'SYNTHETIC_MISSING_ITEM'}
    [pscustomobject]@{
      FullName=if($s.resolved.ContainsKey($LiteralPath)){$s.resolved[$LiteralPath]}else{$LiteralPath}
      PSIsContainer=($LiteralPath -notin $s.files)
      PSProvider=[pscustomobject]@{Name=if($s.providers.ContainsKey($LiteralPath)){$s.providers[$LiteralPath]}else{'FileSystem'}}
      Attributes=if($LiteralPath -in $s.reparse){[IO.FileAttributes]::ReparsePoint}else{[IO.FileAttributes]::Directory}
      VersionInfo=[pscustomobject]@{FileVersion='synthetic-tools'}
    }
  }
}
& $guestModule $filesystemMocks $fixture
& $contractModule $filesystemMocks $fixture
& $guestModule {
  function script:Get-Phase7BIsolatedGuestContract {$script:collectorFixture.fixed}
  function script:Get-CimInstance {
    param($ClassName,$Filter,$ErrorAction)
    $s=$script:collectorFixture
    switch -Exact ($ClassName) {
      'Win32_ComputerSystem' {[pscustomobject]@{Manufacturer=$s.manufacturer;Model='VMware Virtual Platform';Name=$s.computerName;TotalPhysicalMemory=4GB;NumberOfLogicalProcessors=2}}
      'Win32_ComputerSystemProduct' {[pscustomobject]@{UUID=$s.uuid}}
      'Win32_OperatingSystem' {[pscustomobject]@{BuildNumber='26200';Caption='Microsoft Windows 11 Enterprise Evaluation'}}
      'SoftwareLicensingProduct' {[pscustomobject]@{PartialProductKey='synthetic';Name='Windows synthetic';LicenseStatus=1;GracePeriodRemaining=10080}}
      'Win32_LogicalDisk' {[pscustomobject]@{DeviceID='C:';DriveType=3;FileSystem='NTFS';ProviderName=$null;FreeSpace=100GB}}
      'Win32_Process' {}
      'Win32_NetworkConnection' {}
      default {throw 'UNEXPECTED_SYNTHETIC_CIM_QUERY'}
    }
  }
  function script:Get-Service {param($Name,$ErrorAction);if($Name -cne 'VMTools'){throw 'UNEXPECTED_SERVICE'};[pscustomobject]@{Status='Running'}}
  function script:Read-Phase7BWP2CBoundJson {
    param($LiteralPath,$ExpectedSha256)
    $s=$script:collectorFixture
    if($LiteralPath -ceq $s.planPath -and $ExpectedSha256 -ceq (Get-Phase7BWP2CObjectHash $s.plan)){return $s.plan}
    if($LiteralPath -cne (Join-Path $s.fixed.isolatedRoot 'guest-identity-marker.json') -or $ExpectedSha256 -cne $s.markerHash){throw 'UNEXPECTED_MARKER_READ'}
    $s.reads.Add($LiteralPath);$s.marker
  }
  function script:Assert-Phase7BWP2CInstalledTooling {param($Contract);$script:collectorFixture.installedChecks++}
  function script:Assert-Phase7BWP2CFile {param($LiteralPath,$Identity);if($LiteralPath -cne 'C:\Program Files\Git\cmd\git.exe'){throw 'UNEXPECTED_BINARY_CHECK'}}
  function script:Get-ScheduledTask {param($TaskName,$ErrorAction);[pscustomobject]@{TaskName=$TaskName}}
  function script:Get-Phase7BReconciliationTaskProjection {param($TaskName,$Task);[pscustomobject]@{name=$TaskName}}
  function script:Test-Phase7BInertTaskSet {param($TaskProjections,$Contract);[pscustomobject]@{pass=(@($TaskProjections).Count -eq 3)}}
  function script:Get-Content {
    param($LiteralPath,[switch]$Raw,$ErrorAction)
    $s=$script:collectorFixture;$s.reads.Add($LiteralPath)
    if($LiteralPath -ceq (Join-Path $s.fixed.repositoryRoot 'logs\physiqueos-runtime-control.json')){'{"desiredState":"stopped"}'}
    elseif($LiteralPath -ceq (Join-Path $s.fixed.repositoryRoot 'logs\physiqueos-ngrok-control.json')){'{"ngrokDesiredState":"stopped"}'}
    else {throw 'UNEXPECTED_CONTENT_READ'}
  }
  function script:Get-NetTCPConnection {param($ErrorAction)}
  function script:Get-NetAdapter {param([switch]$IncludeHidden,$ErrorAction)}
  function script:Get-NetRoute {param($ErrorAction)}
  function script:Get-Acl {param($LiteralPath,$ErrorAction);[pscustomobject]@{Access=@()}}
  function script:Get-ChildItem {
    param($Path,$LiteralPath,[switch]$Force,$ErrorAction)
    if($Path -ceq 'Env:'){return} # Never enumerate the real environment.
    $s=$script:collectorFixture;$s.reads.Add($LiteralPath)
    if($s.directories.ContainsKey($LiteralPath)){$s.directories[$LiteralPath]}
  }
  function script:Find-Phase7BForbiddenCredentialSignals {param($RepositoryRoot)}
  function script:Get-Phase7BSha256 {param($LiteralPath);$script:collectorFixture.markerHash}
  function script:Add-Type {param($AssemblyName)}
  # Full-path function mocks intercept native invocation without changing the
  # collector's body or using PATH. Neither actual executable is launched.
  Set-Item -LiteralPath 'Function:script:C:\Program Files\VMware\VMware Tools\VMwareHgfsClient.exe' -Value {$script:collectorFixture.nativeCalls++;$script:LASTEXITCODE=0}
  Set-Item -LiteralPath 'Function:script:C:\Program Files\Git\cmd\git.exe' -Value {
    $s=$script:collectorFixture;$s.nativeCalls++;$script:LASTEXITCODE=0
    if($args[0] -cne '--no-optional-locks' -or $args[1] -cne '-C' -or $args[2] -cne $s.fixed.repositoryRoot){throw 'UNEXPECTED_GIT_ARGUMENTS'}
    if($args[3] -ceq 'rev-parse'){$s.head}elseif($args[3] -ceq 'status'){if($s.dirty){' M synthetic'}}else{throw 'UNEXPECTED_GIT_OPERATION'}
  }
}

try {
  Check ($fixed.repositoryRoot -ceq 'C:\Users\dusti\Documents\GitHub\physiqueos' -and $fixed.isolatedRoot -ceq 'C:\Phase7B\isolated\379bb303') 'actual published separate roots'
  if($ReproducePublishedDefect){
    # Read the exact reviewed baseline, not a reimplementation of the collector.
    $source=@(& git --no-optional-locks -C (Split-Path -Parent $PSScriptRoot) show '1fb0ef885c99d4b6022124f9e154e4ad1e1fe1e5:scripts/phase7bWorkPackage2CGuest.psm1') -join "`n"
    Check ($LASTEXITCODE -eq 0) 'published source available'
    $tokens=$null;$errors=$null;$ast=[Management.Automation.Language.Parser]::ParseInput($source,[ref]$tokens,[ref]$errors)
    Check (@($errors).Count -eq 0) 'published source parses'
    $function=$ast.Find({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -ceq 'Get-Phase7BWP2CGuestObservation'},$true)
    & $guestModule {param($Body);Set-Item Function:script:Get-Phase7BWP2CGuestObservation -Value ([scriptblock]::Create($Body))} $function.Body.Extent.Text.Substring(1,($function.Body.Extent.Text.Length-2))
    Reject {& $guestModule {param($Plan);Get-Phase7BWP2CGuestObservation $Plan} $plan} 'PATH_ESCAPE'
    Check ($fixture.nativeCalls -eq 0) 'published defect precedes native commands'
  } else {
    $observed=Get-Phase7BWP2CGuestObservation $plan
    Check (Test-Phase7BWP2CGuestObservation $observed $bindings).pass 'actual collector reaches complete inert observation'
    Check ($fixture.nativeCalls -eq 3 -and $fixture.installedChecks -eq 1) 'collector executed beyond old failing assertion'
    Check ($fixture.reads.Contains((Join-Path $fixed.repositoryRoot 'logs\physiqueos-runtime-control.json'))) 'repository owns runtime control'
    Check ($fixture.reads.Contains((Join-Path $fixed.isolatedRoot 'guest-identity-marker.json'))) 'isolated root owns marker'
    Check (Assert-Phase7BWP2CGuestPreMutation $plan).pathOwnershipPass 'real pre-mutation entry uses corrected collector'

    # Inspector executes its actual source. Only its plan read is synthetic; the
    # collector and evaluator are not replaced with a caller-supplied PASS.
    & $contractModule {
      function script:Read-Phase7BWP2CBoundJson {
        param($LiteralPath,$ExpectedSha256)
        $s=$script:collectorFixture
        if($LiteralPath -cne $s.planPath -or $ExpectedSha256 -cne (Get-Phase7BWP2CObjectHash $s.plan)){throw 'UNEXPECTED_PLAN_READ'}
        $s.plan
      }
    }
    $inspector=Join-Path $PSScriptRoot 'phase7bInspectWorkPackage2CGuestPreparation.ps1'
    $report=(& $inspector -ObservationPlanPath $fixture.planPath -ObservationPlanSha256 $fixture.planHash)|ConvertFrom-Json
    Check ($report.kind -ceq 'wp2c-guest-preparation-observation' -and $report.observation.pathOwnershipPass) 'actual preparation inspector passes separate roots'
    foreach($name in @('wp2cExecuted','packetDecrypted','executionClaimCreated','authorizationConsumed','reportPersisted')){Check ($report.$name -ceq $false) ('inspector nonmutation '+$name)}

    foreach($owner in @('repositoryRoot','isolatedRoot')){
      $saved=$fixture.fixed.$owner
      foreach($bad in @('C:\wrong-root','C:\wrong-root\..\escape','relative\root','HKLM:\Software','FileSystem::C:\synthetic','\\server\share','C:\bad:root','')){
        $fixture.fixed.$owner=$bad
        $code=if($bad -ceq 'C:\wrong-root'){'GUEST_ROOT_BINDING'}else{'LOCAL_PATH_REQUIRED'}
        Reject {Get-Phase7BWP2CGuestObservation $plan} $code
      }
      $fixture.fixed.$owner=$null;Reject {Get-Phase7BWP2CGuestObservation $plan} 'LOCAL_PATH_REQUIRED'
      $fixture.fixed.$owner=$saved
      $fixture.missing=@($saved);Reject {Get-Phase7BWP2CGuestObservation $plan} 'ROOT_MISSING';$fixture.missing=@()
      $fixture.files=@($saved);Reject {Get-Phase7BWP2CGuestObservation $plan} 'ROOT_MISSING';$fixture.files=@()
      $fixture.providers[$saved]='Registry';Reject {Get-Phase7BWP2CGuestObservation $plan} 'GUEST_ROOT_LOCATION';$fixture.providers.Clear()
      $fixture.resolved[$saved]='C:\elsewhere';Reject {Get-Phase7BWP2CGuestObservation $plan} 'GUEST_ROOT_LOCATION';$fixture.resolved.Clear()
      foreach($link in @($saved,(Split-Path -Parent $saved))){$fixture.reparse=@($link);Reject {Get-Phase7BWP2CGuestObservation $plan} 'REPARSE_PATH'}
      $fixture.reparse=@()
    }
    $fixture.fixed.repositoryRoot=$fixed.isolatedRoot;$fixture.fixed.isolatedRoot=$fixed.repositoryRoot
    Reject {Get-Phase7BWP2CGuestObservation $plan} 'GUEST_ROOT_BINDING'
    $fixture.fixed=Clone $fixed
    foreach($name in @('incomingRoot','restoreRoot','stateRoot','toolingRoot')){
      $saved=$bindings.$name
      foreach($bad in @((Join-Path $fixed.repositoryRoot 'wrong-owner'),($fixed.isolatedRoot+'-sibling\escape'),'C:\outside')){
        $bindings.$name=$bad;Reject {Get-Phase7BWP2CGuestObservation $plan} 'PATH_ESCAPE'
      }
      $bindings.$name=$saved
      $fixture.reparse=@($saved);Reject {Get-Phase7BWP2CGuestObservation $plan} 'REPARSE_PATH';$fixture.reparse=@()
    }
    foreach($child in @((Join-Path $fixed.isolatedRoot 'wrong-owner'),($fixed.repositoryRoot+'-sibling\escape'),'C:\outside','relative','HKLM:\Software')){
      $fixture.directories[$fixed.repositoryRoot]=@([pscustomobject]@{FullName=$child;Name='synthetic';PSIsContainer=$false;Attributes=[IO.FileAttributes]::Normal})
      $code=if($child -in @('relative','HKLM:\Software')){'LOCAL_PATH_REQUIRED'}else{'PATH_ESCAPE'}
      Reject {Get-Phase7BWP2CGuestObservation $plan} $code
    }
    $fixture.directories.Clear()
    foreach($path in @((Join-Path $fixed.repositoryRoot 'logs'),(Join-Path $fixed.isolatedRoot 'guest-identity-marker.json'))){
      $fixture.reparse=@($path);Reject {Get-Phase7BWP2CGuestObservation $plan} 'REPARSE_PATH'
    }
    $fixture.reparse=@()
    $fixture.directories[$fixed.repositoryRoot]=@([pscustomobject]@{FullName=(Join-Path $fixed.repositoryRoot 'synthetic-child');Name='synthetic-child';PSIsContainer=$false;Attributes=[IO.FileAttributes]::Normal})
    Check (Assert-Phase7BWP2CGuestPreMutation $plan).pathOwnershipPass 'correct repository child accepted'
    $fixture.directories.Clear()

    foreach($field in @('computerName','uuid','head')){
      $saved=$fixture[$field];$fixture[$field]='wrong'
      $badObservation=Get-Phase7BWP2CGuestObservation $plan
      Check (-not (Test-Phase7BWP2CGuestObservation $badObservation $bindings).pass) ('collector exposes wrong identity '+$field)
      Reject {Assert-Phase7BWP2CGuestPreMutation $plan} 'GUEST_PREMUTATION_INERT_FAIL'
      Reject {& $inspector -ObservationPlanPath $fixture.planPath -ObservationPlanSha256 $fixture.planHash} 'GUEST_PREPARATION_NOT_INERT'
      $fixture[$field]=$saved
    }
    $fixture.marker.applicationCommit='wrong';Reject {Get-Phase7BWP2CGuestObservation $plan} 'GUEST_MARKER_CONTENT';$fixture.marker.applicationCommit=$fixed.applicationCommit
    $fixture.dirty=$true;Reject {Assert-Phase7BWP2CGuestPreMutation $plan} 'GUEST_PREMUTATION_INERT_FAIL';$fixture.dirty=$false
    $fixture.reads.Clear();$before=$fixture.nativeCalls;$fixture.manufacturer='PRIMARY-PC'
    Reject {Get-Phase7BWP2CGuestObservation $plan} 'WRONG_MACHINE'
    Check ($fixture.reads.Count -eq 0 -and $fixture.nativeCalls -eq $before) 'wrong machine rejected before guest paths/helpers'
    $fixture.manufacturer='VMware, Inc.'
    Check (Assert-Phase7BWP2CGuestPreMutation $plan).pathOwnershipPass 'final restored synthetic fixture passes'
  }
  [ordered]@{classification='PHASE7B_WP2C_COLLECTOR_TESTS_PASS';pass=$true;assertions=$script:assertions;publishedDefectReproduced=[bool]$ReproducePublishedDefect;actualCollectorInvoked=$true;liveGuestAccessed=$false;liveMutationPerformed=$false}|ConvertTo-Json -Compress
} finally {
  # Dispose mocked module instances; no filesystem artifacts/claims to clean.
  Remove-Module phase7bWorkPackage2CGuest,phase7bWorkPackage2CContract -Force
}
