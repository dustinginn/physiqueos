[CmdletBinding()]
param([switch]$ReproducePublishedDefect,[switch]$HgfsRegression,[switch]$ExportSourceFixture)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
if($PSVersionTable.PSEdition -cne 'Desktop' -or $PSVersionTable.PSVersion -lt [version]'5.1'){throw 'WINDOWS_PS51_REQUIRED'}
Import-Module (Join-Path $PSScriptRoot 'phase7bIsolatedGuestContract.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CContract.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CGuest.psm1')
$guestModule=Get-Module phase7bWorkPackage2CGuest
$contractModule=Get-Module phase7bWorkPackage2CContract
$fixed=Get-Phase7BIsolatedGuestContract
$sourceManifest=Get-Phase7BWP2CDependencyManifest $PSScriptRoot
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
  manufacturer='VMware, Inc.';model='VMware Virtual Platform';computerName='WP2C-SYNTHETIC';uuid='synthetic-collector-uuid'
  head=$fixed.applicationCommit;dirty=$false;marker=Clone $fixed;markerHash='6'*64
  reads=New-Object 'Collections.Generic.List[string]';nativeCalls=0;installedChecks=0
  hgfsExit=0;hgfsFolders=@();driver=@([pscustomobject]@{Name='vmhgfs';State='Running'})
  tools=@([pscustomobject]@{Status='Running'});networkDisks=@();networkConnections=@();psDrives=@()
}
$fixture.marker.schemaVersion=1
$bindings=[pscustomobject]@{
  guestComputerName=$fixture.computerName;guestIdentitySha256=Get-Phase7BWP2CObjectHash $fixture.uuid
  applicationCommit=$fixed.applicationCommit;guestMarkerSha256=$fixture.markerHash;toolingManifestSha256=Get-Phase7BWP2CObjectHash $sourceManifest
  guestOsBuild='26200';guestOsCaption='Microsoft Windows 11 Enterprise Evaluation';vmwareToolsVersion='synthetic-tools'
  incomingRoot=Join-Path $fixed.isolatedRoot 'incoming';restoreRoot=Join-Path $fixed.isolatedRoot 'restore\canonical'
  stateRoot=Join-Path $fixed.isolatedRoot 'wp2c-state';toolingRoot=Join-Path $fixed.isolatedRoot ('tooling\'+(Get-Phase7BWP2CObjectHash $sourceManifest))
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
  $global:phase7bSyntheticCollectorFixture=$State
  function script:Test-Path {
    param($LiteralPath,$PathType,[switch]$IsValid,$ErrorAction)
    if($LiteralPath -in $global:phase7bSyntheticCollectorFixture.missing){return $false}
    if($PathType -eq 'Container' -and $LiteralPath -in $global:phase7bSyntheticCollectorFixture.files){return $false}
    $true
  }
  function script:Get-Item {
    param($LiteralPath,[switch]$Force,$ErrorAction)
    $s=$global:phase7bSyntheticCollectorFixture;$s.reads.Add([string]$LiteralPath)
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
  function script:Get-Phase7BIsolatedGuestContract {$global:phase7bSyntheticCollectorFixture.fixed}
  function script:Get-CimInstance {
    param($ClassName,$Filter,$ErrorAction)
    $s=$global:phase7bSyntheticCollectorFixture
    switch -Exact ($ClassName) {
      'Win32_ComputerSystem' {[pscustomobject]@{Manufacturer=$s.manufacturer;Model=$s.model;Name=$s.computerName;TotalPhysicalMemory=4GB;NumberOfLogicalProcessors=2}}
      'Win32_ComputerSystemProduct' {[pscustomobject]@{UUID=$s.uuid}}
      'Win32_OperatingSystem' {[pscustomobject]@{BuildNumber='26200';Caption='Microsoft Windows 11 Enterprise Evaluation'}}
      'SoftwareLicensingProduct' {[pscustomobject]@{PartialProductKey='synthetic';Name='Windows synthetic';LicenseStatus=1;GracePeriodRemaining=10080}}
      'Win32_LogicalDisk' {
        if($Filter -ceq 'DriveType=5'){[pscustomobject]@{DeviceID='E:';VolumeName='P7B_C_TOOLS'}}
        else{[pscustomobject]@{DeviceID='C:';DriveType=3;FileSystem='NTFS';ProviderName=$null;FreeSpace=100GB};$s.networkDisks}
      }
      'Win32_SystemDriver' {if($Filter -cne "Name='vmhgfs'"){throw 'UNEXPECTED_DRIVER_QUERY'};$s.driver}
      'Win32_Process' {}
      'Win32_NetworkConnection' {$s.networkConnections}
      default {throw 'UNEXPECTED_SYNTHETIC_CIM_QUERY'}
    }
  }
  function script:Get-Service {param($Name,$ErrorAction);if($Name -cne 'VMTools'){throw 'UNEXPECTED_SERVICE'};$global:phase7bSyntheticCollectorFixture.tools}
  function script:Get-PSDrive {param($ErrorAction);$global:phase7bSyntheticCollectorFixture.psDrives}
  function script:Read-Phase7BWP2CBoundJson {
    param($LiteralPath,$ExpectedSha256)
    $s=$global:phase7bSyntheticCollectorFixture
    if($LiteralPath -ceq $s.planPath -and $ExpectedSha256 -ceq (Get-Phase7BWP2CObjectHash $s.plan)){return $s.plan}
    if($LiteralPath -cne (Join-Path $s.fixed.isolatedRoot 'guest-identity-marker.json') -or $ExpectedSha256 -cne $s.markerHash){throw 'UNEXPECTED_MARKER_READ'}
    $s.reads.Add($LiteralPath);$s.marker
  }
  function script:Assert-Phase7BWP2CInstalledTooling {param($Contract);$global:phase7bSyntheticCollectorFixture.installedChecks++}
  function script:Assert-Phase7BWP2CFile {param($LiteralPath,$Identity);if($LiteralPath -cne 'C:\Program Files\Git\cmd\git.exe'){throw 'UNEXPECTED_BINARY_CHECK'}}
  function script:Get-ScheduledTask {param($TaskName,$ErrorAction);[pscustomobject]@{TaskName=$TaskName}}
  function script:Get-Phase7BReconciliationTaskProjection {param($TaskName,$Task);[pscustomobject]@{name=$TaskName}}
  function script:Test-Phase7BInertTaskSet {param($TaskProjections,$Contract);[pscustomobject]@{pass=(@($TaskProjections).Count -eq 3)}}
  function script:Get-Content {
    param($LiteralPath,[switch]$Raw,$ErrorAction)
    $s=$global:phase7bSyntheticCollectorFixture;$s.reads.Add($LiteralPath)
    if($LiteralPath -ceq (Join-Path $s.fixed.repositoryRoot 'logs\physiqueos-runtime-control.json')){'{"desiredState":"stopped"}'}
    elseif($LiteralPath -ceq (Join-Path $s.fixed.repositoryRoot 'logs\physiqueos-ngrok-control.json')){'{"ngrokDesiredState":"stopped"}'}
    elseif($LiteralPath -ceq (Join-Path $s.fixed.isolatedRoot 'guest-identity-marker.json')){$s.marker|ConvertTo-Json}
    else {throw 'UNEXPECTED_CONTENT_READ'}
  }
  function script:Get-NetTCPConnection {param($ErrorAction)}
  function script:Get-NetAdapter {param([switch]$IncludeHidden,$ErrorAction)}
  function script:Get-NetRoute {param($ErrorAction)}
  function script:Get-Acl {param($LiteralPath,$ErrorAction);[pscustomobject]@{Access=@()}}
  function script:Get-ChildItem {
    param($Path,$LiteralPath,[switch]$Force,$ErrorAction)
    if($Path -ceq 'Env:'){return} # Never enumerate the real environment.
    $s=$global:phase7bSyntheticCollectorFixture;$s.reads.Add($LiteralPath)
    if($s.directories.ContainsKey($LiteralPath)){$s.directories[$LiteralPath]}
  }
  function script:Find-Phase7BForbiddenCredentialSignals {param($RepositoryRoot)}
  function script:Get-Phase7BSha256 {param($LiteralPath);$global:phase7bSyntheticCollectorFixture.markerHash}
  function script:Add-Type {param($AssemblyName)}
  # Full-path function mocks intercept native invocation without changing the
  # collector's body or using PATH. Neither VMware nor Git is launched here.
  Set-Item -LiteralPath 'Function:script:C:\Program Files\VMware\VMware Tools\VMwareHgfsClient.exe' -Value {
    $s=$global:phase7bSyntheticCollectorFixture;$s.nativeCalls++
    # A harmless REAL native child proves PS5.1 LASTEXITCODE scope semantics;
    # neither VMware executable nor live guest is invoked. No files are written.
    if($null -eq $s.hgfsExit){$global:LASTEXITCODE=$null}else{& C:\Windows\System32\cmd.exe /d /c exit ([int]$s.hgfsExit)}
    $s.hgfsFolders
  }
  Set-Item -LiteralPath 'Function:script:C:\Program Files\Git\cmd\git.exe' -Value {
    $s=$global:phase7bSyntheticCollectorFixture;$s.nativeCalls++;$global:LASTEXITCODE=0
    if($args[0] -cne '--no-optional-locks' -or $args[1] -cne '-C' -or $args[2] -cne $s.fixed.repositoryRoot){throw 'UNEXPECTED_GIT_ARGUMENTS'}
    if($args[3] -ceq 'rev-parse'){$s.head}elseif($args[3] -ceq 'status'){if($s.dirty){' M synthetic'}}else{throw 'UNEXPECTED_GIT_OPERATION'}
  }
}

# The public inspector now owns optical selection. Substitute only that read-only
# boundary, retaining actual collector/pre-mutation behavior for these OS fixtures.
function Invoke-SyntheticPreparationInspector {
  & $guestModule {
    function Import-Module {param($Name);if([IO.Path]::GetFileName($Name) -notin @('phase7bIsolatedGuestContract.psm1','phase7bWorkPackage2Contract.psm1','phase7bWorkPackage2CContract.psm1','phase7bWorkPackage2CGuest.psm1','phase7bWorkPackage2CMedia.psm1')){throw 'UNEXPECTED_INSPECTOR_IMPORT'}}
    function Read-Phase7BWP2CPreparationOptical {
      param($OpticalRoot,$DescriptorSha256)
      if($OpticalRoot -cne 'F:\' -or $DescriptorSha256 -cne ('9'*64)){throw 'UNEXPECTED_PREPARATION_OPTICAL'}
      $s=$global:phase7bSyntheticCollectorFixture
      [pscustomobject]@{plan=$s.plan;descriptor=[pscustomobject]@{plan=[pscustomobject]@{sha256=$s.planHash}}}
    }
    & $global:phase7bSyntheticCollectorFixture.inspector -PreparationOpticalRoot 'F:\' -PreparationDescriptorSha256 ('9'*64)
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
        $s=$global:phase7bSyntheticCollectorFixture
        if($LiteralPath -cne $s.planPath -or $ExpectedSha256 -cne (Get-Phase7BWP2CObjectHash $s.plan)){throw 'UNEXPECTED_PLAN_READ'}
        $s.plan
      }
    }
    $inspector=Join-Path $PSScriptRoot 'phase7bInspectWorkPackage2CGuestPreparation.ps1'
    $fixture.inspector=$inspector
    $report=(Invoke-SyntheticPreparationInspector)|ConvertFrom-Json
    Check ($report.kind -ceq 'wp2c-guest-preparation-observation' -and $report.observation.pathOwnershipPass) 'actual preparation inspector passes separate roots'
    foreach($name in @('wp2cExecuted','packetDecrypted','executionClaimCreated','authorizationConsumed','reportPersisted')){Check ($report.$name -ceq $false) ('inspector nonmutation '+$name)}

    if($HgfsRegression){
      # Run the ACTUAL installer, replacing only unrelated machine/media checks.
      # New-Item is a fail-safe sentinel at its first mutation, so no installation,
      # copying, real optical access, guest directory, evidence or claim occurs.
      Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CMedia.psm1')
      $fixture.manifest=$sourceManifest
      $fixture.manifestHash=Get-Phase7BWP2CObjectHash $fixture.manifest
      $fixture.installer=Join-Path $PSScriptRoot 'phase7bInstallWorkPackage2GuestTooling.ps1'
      $fixture.installBoundary=0
      & $guestModule {
        function script:Invoke-SyntheticInstaller {
          $s=$global:phase7bSyntheticCollectorFixture
          # Dependencies are already imported. Do not replace the scoped test
          # boundaries with cached exports when the actual installer imports them.
          # The separate safety suite verifies fresh-process direct imports.
          function Import-Module {
            param($Name)
            if([IO.Path]::GetFileName($Name) -notin @('phase7bIsolatedGuestContract.psm1','phase7bWorkPackage2CContract.psm1','phase7bWorkPackage2CMedia.psm1','phase7bIsolatedGuestReconciliation.psm1','phase7bWorkPackage2CGuest.psm1')){throw 'UNEXPECTED_INSTALLER_IMPORT'}
          }
          function Read-Phase7BWP2CBoundJson {
            param($LiteralPath,$ExpectedSha256)
            if($LiteralPath -cne 'E:\wp2c-tooling-manifest.json' -or $ExpectedSha256 -cne $s.manifestHash){throw 'UNEXPECTED_INSTALLER_MANIFEST'}
            $s.manifest
          }
          function Get-Phase7BWP2CDependencyManifest {param($SourceDirectory);if($SourceDirectory -cne 'E:\'){throw 'UNEXPECTED_MEDIA_ROOT'};$s.manifest}
          function Get-Phase7BWP2CToolingMediaFileNames {param($ToolingRoot,$Manifest);if($ToolingRoot -cne 'E:\' -or (Get-Phase7BWP2CObjectHash $Manifest) -cne $s.manifestHash){throw 'UNEXPECTED_MEDIA_FILE_SET'};@($Manifest.files.name)+@('age.exe','age-keygen.exe','wp2c-tooling-manifest.json')}
          function Assert-Phase7BWP2CFile {param($LiteralPath,$Identity);if($LiteralPath -notin @('E:\age.exe','E:\age-keygen.exe')){throw 'UNEXPECTED_MEDIA_BINARY'}}
          function Assert-Phase7BWP2CExactFileSet {param($Root,$Names);if($Root -cne 'E:\'){throw 'UNEXPECTED_FILE_SET'}}
          function Get-Phase7BSha256 {param($LiteralPath);if($LiteralPath -cne (Join-Path $s.fixed.isolatedRoot 'guest-identity-marker.json')){throw 'UNEXPECTED_IDENTITY_READ'};$s.markerHash}
          function Get-Process {param($ErrorAction)}
          function Join-Path {param($Path,$ChildPath);[IO.Path]::Combine($Path,$ChildPath)}
          function New-Object {
            param($TypeName,$ArgumentList)
            if($TypeName -cne 'Security.Principal.WindowsPrincipal'){throw 'UNEXPECTED_INSTALLER_OBJECT'}
            $value=[pscustomobject]@{};$value|Add-Member ScriptMethod IsInRole {$true};$value
          }
          function New-Item {param($ItemType,$Path,$ErrorAction);$s.installBoundary++;throw 'SYNTHETIC_INSTALLER_MUTATION_BOUNDARY'}
          & $s.installer -OpticalRoot 'E:\' -ManifestSha256 $s.manifestHash -ExpectedGuestIdentitySha256 (Get-Phase7BWP2CObjectHash $s.uuid) -ExpectedMarkerSha256 $s.markerHash -AgeSha256 ('a'*64) -AgeBytes 4097 -AgeKeygenSha256 ('b'*64) -AgeKeygenBytes 4097 -FounderPreparationApproved
        }
      }
      function InstallerResult {
        $before=$fixture.installBoundary;$message=''
        $fixture.missing=@(Join-Path $fixed.isolatedRoot ('tooling\'+$fixture.manifestHash)) + @($fixture.missing)
        $trace='';try{& $guestModule {Invoke-SyntheticInstaller}|Out-Null}catch{$message=$_.Exception.Message;$trace=$_.ScriptStackTrace}
        $fixture.missing=@($fixture.missing|Where-Object {$_ -cne (Join-Path $fixed.isolatedRoot ('tooling\'+$fixture.manifestHash))})
        [pscustomobject]@{message=$message;trace=$trace;boundaryReached=($fixture.installBoundary -eq $before+1)}
      }
      # Reproduce the exact published inconsistency from Git without modifying
      # source or materializing a guest script. The full published installer
      # and collector bodies run against these same synthetic boundaries.
      $baseline='93f2ce74107e9eee9b1b29af169768a0ad96c0f0'
      $oldGuest=@(& git --no-optional-locks -C (Split-Path -Parent $PSScriptRoot) show ($baseline+':scripts/phase7bWorkPackage2CGuest.psm1')) -join "`n"
      Check ($LASTEXITCODE -eq 0) 'published HGFS collector source available'
      $oldInstaller=@(& git --no-optional-locks -C (Split-Path -Parent $PSScriptRoot) show ($baseline+':scripts/phase7bInstallWorkPackage2GuestTooling.ps1')) -join "`n"
      Check ($LASTEXITCODE -eq 0) 'published HGFS installer source available'
      $tokens=$null;$errors=$null;$ast=[Management.Automation.Language.Parser]::ParseInput($oldGuest,[ref]$tokens,[ref]$errors)
      Check (@($errors).Count -eq 0) 'published HGFS source parses'
      $fixture.hgfsExit=1
      $legacyBodies=@{}
      foreach($name in @('Get-Phase7BWP2CGuestObservation','Test-Phase7BWP2CGuestObservation')){
        $body=$ast.Find({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -ceq $name},$true).Body.Extent.Text
        $legacyBodies[$name]=[scriptblock]::Create($body.Substring(1,$body.Length-2))
      }
      $oldObservation=& $guestModule {param($Body,$Plan);& $Body $Plan} $legacyBodies['Get-Phase7BWP2CGuestObservation'] $plan
      $oldResult=& $guestModule {param($Body,$Observation,$Bindings);& $Body $Observation $Bindings} $legacyBodies['Test-Phase7BWP2CGuestObservation'] $oldObservation $bindings
      Check (-not $oldResult.pass -and $oldResult.failedChecks -contains 'noIntegration') 'published collector/evaluator rejects corroborated exit1'
      $installerPath=$fixture.installer;$fixture.installer=[scriptblock]::Create($oldInstaller)
      $oldInstalled=InstallerResult
      Check (-not $oldInstalled.boundaryReached -and $oldInstalled.message -ceq 'PHASE7B_WP2C_PREPARATION_HGFS') ('published installer reproduces HGFS failure: '+$oldInstalled.message)
      $fixture.installer=$installerPath;$fixture.hgfsExit=0
      $cases=@(
        @{label='exit0';changes=@{};pass=$true},
        @{label='corroborated exit1';changes=@{hgfsExit=1};pass=$true},
        @{label='historical VMware20,1 exit1';changes=@{hgfsExit=1;model='VMware20,1'};pass=$true},
        @{label='unsupported VMware model';changes=@{hgfsExit=1;model='VMware-unknown'};pass=$false},
        @{label='share';changes=@{hgfsExit=1;hgfsFolders=@('unexpected')};pass=$false},
        @{label='multiple shares';changes=@{hgfsExit=1;hgfsFolders=@('one','two')};pass=$false},
        @{label='mapped connection';changes=@{hgfsExit=1;networkConnections=@([pscustomobject]@{RemoteName='\\vmware-host\Shared Folders\x'})};pass=$false},
        @{label='mapped disk';changes=@{hgfsExit=1;networkDisks=@([pscustomobject]@{DeviceID='Z:';DriveType=4;ProviderName='\\.host\Shared Folders\x'})};pass=$false},
        @{label='PSDrive path';changes=@{hgfsExit=1;psDrives=@([pscustomobject]@{Root='\\vmware-host\Shared Folders';Provider=[pscustomobject]@{Name='FileSystem'}})};pass=$false},
        @{label='PSDrive display root';changes=@{hgfsExit=1;psDrives=@([pscustomobject]@{Root='Z:\';DisplayRoot='\\.host\Shared Folders';Provider=[pscustomobject]@{Name='FileSystem'}})};pass=$false},
        @{label='HGFS provider';changes=@{hgfsExit=1;psDrives=@([pscustomobject]@{Root='synthetic';Provider=[pscustomobject]@{Name='HGFS'}})};pass=$false},
        @{label='missing driver';changes=@{hgfsExit=1;driver=@()};pass=$false},
        @{label='stopped driver';changes=@{hgfsExit=1;driver=@([pscustomobject]@{Name='vmhgfs';State='Stopped'})};pass=$false},
        @{label='wrong driver';changes=@{hgfsExit=1;driver=@([pscustomobject]@{Name='wrong';State='Running'})};pass=$false},
        @{label='ambiguous drivers';changes=@{hgfsExit=1;driver=@([pscustomobject]@{Name='vmhgfs';State='Running'},[pscustomobject]@{Name='vmhgfs';State='Running'})};pass=$false},
        @{label='missing tools';changes=@{hgfsExit=1;tools=@()};pass=$false},
        @{label='stopped tools';changes=@{hgfsExit=1;tools=@([pscustomobject]@{Status='Stopped'})};pass=$false},
        @{label='ambiguous tools';changes=@{hgfsExit=1;tools=@([pscustomobject]@{Status='Running'},[pscustomobject]@{Status='Running'})};pass=$false},
        @{label='exit0 shares';changes=@{hgfsExit=0;hgfsFolders=@('unexpected')};pass=$false},
        @{label='exit0 missing driver';changes=@{hgfsExit=0;driver=@()};pass=$false},
        @{label='client absent';changes=@{missing=@('C:\Program Files\VMware\VMware Tools\VMwareHgfsClient.exe')};pass=$false},
        @{label='unexpected exit';changes=@{hgfsExit=2};pass=$false}
      )
      foreach($case in $cases){
        $saved=@{};foreach($key in $case.changes.Keys){$saved[$key]=$fixture[$key];$fixture[$key]=$case.changes[$key]}
        $observation=Get-Phase7BWP2CGuestObservation $plan
        Check ((Test-Phase7BWP2CGuestObservation $observation $bindings).pass -eq $case.pass) ('collector '+$case.label)
        $installed=InstallerResult
        if($case.pass){
          Check ($installed.boundaryReached -and $installed.message -ceq 'SYNTHETIC_INSTALLER_MUTATION_BOUNDARY') ('installer preflight '+$case.label+': '+$installed.message+' '+$installed.trace)
          Check (Assert-Phase7BWP2CGuestPreMutation $plan).pathOwnershipPass ('entry '+$case.label)
          Check ((Invoke-SyntheticPreparationInspector|ConvertFrom-Json).observation.pathOwnershipPass) ('inspector '+$case.label)
          $parameters=@{};foreach($p in $observation.hgfsObservation.PSObject.Properties){if($p.Name -cne 'providerPathCount'){$parameters[$p.Name]=$p.Value}}
          $legacy=Test-Phase7BVmwareGuestIdentity @parameters
          Check $legacy.pass ('existing identity validator '+$case.label)
          if($fixture.hgfsExit -eq 1){Check ($legacy.sharedFolderEnumerationStatus -ceq 'EMPTY_EXIT_1_CORROBORATED') 'exact historical classification'}
        }else{
          Check (-not $installed.boundaryReached -and $installed.message -ceq 'PHASE7B_WP2C_PREPARATION_HGFS') ('installer rejects '+$case.label+': '+$installed.message)
          Reject {Assert-Phase7BWP2CGuestPreMutation $plan} 'GUEST_PREMUTATION_INERT_FAIL'
          Reject {Invoke-SyntheticPreparationInspector} 'GUEST_PREMUTATION_INERT_FAIL'
        }
        foreach($key in $saved.Keys){$fixture[$key]=$saved[$key]}
      }
      $fixture.hgfsExit=$null
      Reject {Get-Phase7BWP2CGuestObservation $plan} 'HGFS_EXIT_UNOBSERVED'
      Check ((InstallerResult).message -ceq 'PHASE7B_WP2C_HGFS_EXIT_UNOBSERVED') 'installer rejects missing exit observation'
      $fixture.hgfsExit=1
      $good=(Get-Phase7BWP2CGuestObservation $plan).hgfsObservation
      $fixture.missing=@('C:\Program Files\VMware\VMware Tools\vmtoolsd.exe')
      Check (-not (Test-Phase7BWP2CHgfsObservation (& $guestModule {Get-Phase7BWP2CHgfsObservation (Get-CimInstance Win32_ComputerSystem)}))) 'missing tools executable rejects HGFS'
      Check ((InstallerResult).message -ceq 'PHASE7B_WP2C_PREPARATION_HGFS') 'installer rejects missing tools executable'
      $fixture.missing=@()
      foreach($property in $good.PSObject.Properties){
        $bad=Clone $good;$bad.PSObject.Properties.Remove($property.Name)
        Check (-not (Test-Phase7BWP2CHgfsObservation $bad)) ('missing HGFS field '+$property.Name)
        $bad=Clone $good;$bad.($property.Name)=$null
        Check (-not (Test-Phase7BWP2CHgfsObservation $bad)) ('null HGFS field '+$property.Name)
      }
      $bad=Clone $good;$bad.hgfsDriverRunning='true';Check (-not (Test-Phase7BWP2CHgfsObservation $bad)) 'boolean string not corroboration'
      Check (-not (Test-Phase7BWP2CHgfsObservation $null)) 'missing entire HGFS observation'
      $fixture.hgfsExit=0
      $installerText=Get-Content -LiteralPath $installerPath -Raw
      Check ($installerText.IndexOf('Get-Phase7BWP2CHgfsObservation') -lt $installerText.IndexOf('New-Item -ItemType Directory')) 'HGFS observed before installer mutation'
      Check ($installerText.IndexOf('Test-Phase7BWP2CHgfsObservation') -lt $installerText.IndexOf('New-Item -ItemType Directory')) 'full HGFS verdict required before installer mutation'
      $current=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'phase7bWorkPackage2CGuest.psm1'),[ref]$tokens,[ref]$errors)
      Check (@($errors).Count -eq 0) 'current guest PS51 AST'
      $getter=$current.Find({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -ceq 'Get-Phase7BWP2CHgfsObservation'},$true)
      $commands=@($getter.FindAll({param($n)$n -is [Management.Automation.Language.CommandAst]},$true)|ForEach-Object {$_.GetCommandName()})
      Check (@($commands|Where-Object {$_ -match '^(New|Set|Remove|Start|Stop|Enable|Disable|Write|Out)-'}).Count -eq 0) 'shared observation has no mutation command'
      [ordered]@{classification='PHASE7B_WP2C_HGFS_ENTRY_TESTS_PASS';pass=$true;assertions=$script:assertions;actualInstallerPreflightInvoked=$true;actualCollectorInspectorEntryInvoked=$true;installerWritesPrevented=$true;liveGuestAccessed=$false}|ConvertTo-Json -Compress
      return
    }

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
      Reject {Invoke-SyntheticPreparationInspector} 'GUEST_PREMUTATION_INERT_FAIL'
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
  if($ExportSourceFixture){
    $baseline=& $guestModule {
      function Get-Phase7BWP2CIdentity {param($LiteralPath);if($LiteralPath -cne 'C:\Program Files\Git\cmd\git.exe'){throw 'UNEXPECTED_BASELINE_BINARY'};[pscustomobject]@{sha256='8'*64;bytes=4097}}
      Get-Phase7BWP2CGuestPreparationBaseline (Get-Phase7BWP2CObjectHash $global:phase7bSyntheticCollectorFixture.uuid)
    }
    [ordered]@{baseline=$baseline;observation=Get-Phase7BWP2CGuestObservation $plan}|ConvertTo-Json -Depth 12 -Compress
  }else{
    [ordered]@{classification='PHASE7B_WP2C_COLLECTOR_TESTS_PASS';pass=$true;assertions=$script:assertions;publishedDefectReproduced=[bool]$ReproducePublishedDefect;actualCollectorInvoked=$true;liveGuestAccessed=$false;liveMutationPerformed=$false}|ConvertTo-Json -Compress
  }
} finally {
  # Dispose mocked module instances; no filesystem artifacts/claims to clean.
  Remove-Module phase7bWorkPackage2CGuest,phase7bWorkPackage2CContract -Force
  Remove-Variable phase7bSyntheticCollectorFixture -Scope Global -ErrorAction SilentlyContinue
}
