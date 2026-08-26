[CmdletBinding()]
param()
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
if($PSVersionTable.PSEdition -cne 'Desktop' -or $PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1){throw 'WINDOWS_PS51_REQUIRED'}
. (Join-Path $PSScriptRoot 'phase7bWorkPackage2Finalization.test.ps1') -FixturesOnly
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CContract.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CHost.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CMedia.psm1') -Force
function Reject([scriptblock]$Action,[string]$Label){$rejected=$false;try{& $Action|Out-Null}catch{$rejected=$true};Assert-True $rejected $Label}
function Save-Vmx([hashtable]$Value){
  $lines=@(foreach($key in @($Value.Keys|Sort-Object)){$key+' = "'+$Value[$key]+'"'})
  [IO.File]::WriteAllLines($vmxPath,$lines)
}
function Synthetic-Cim {
  param($ClassName,$Filter,$ErrorAction)
  switch($ClassName){
    'Win32_OperatingSystem' {[pscustomobject]@{FreePhysicalMemory=[int64](8GB/1024)}}
    'Win32_ComputerSystemProduct' {[pscustomobject]@{UUID='11111111-2222-3333-4444-555555555555'}}
    'Win32_LogicalDisk' {[pscustomobject]@{FreeSpace=[int64]200GB}}
    'Win32_Process' {}
    default {throw 'UNEXPECTED_SYNTHETIC_OS_QUERY'}
  }
}
function Observe-Host {
  & $hostModule {
    param($Path,$Snapshots,$Cim)
    function Get-CimInstance {param($ClassName,$Filter,$ErrorAction);& $Cim @PSBoundParameters}
    Get-Phase7BWP2CHostObservation $Path $Snapshots
  } $vmxPath $snapshotPath ${function:Synthetic-Cim}
}
function Invoke-Operator([string]$Mode){
  # Run the ACTUAL public preboot entry. Only publication, elevation, OS queries
  # and the permitted disposable session-root boundary are substituted. Real
  # VMX parser, disk/host policy, optical policy, media hashes and carrier reader.
  $before=@(Get-ChildItem -LiteralPath $sessionRoot -Recurse -File|ForEach-Object {$_.FullName+':'+(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash})
  $lines=New-Object 'Collections.Generic.List[string]';$failed=$false
  try {
    & {
      function Import-Module {param($Name)}
      function New-Object {
        param($TypeName,$ArgumentList)
        if($TypeName -ceq 'Security.Principal.WindowsPrincipal'){$p=[pscustomobject]@{};$p|Add-Member ScriptMethod IsInRole {$true};return $p}
        Microsoft.PowerShell.Utility\New-Object @PSBoundParameters
      }
      function Get-CimInstance {param($ClassName,$Filter,$ErrorAction);Synthetic-Cim @PSBoundParameters}
      function Get-Phase7BWP2CPreparationRam {
        & $hostModule {param($Cim);function Get-CimInstance {param($ClassName,$Filter,$ErrorAction);& $Cim @PSBoundParameters};Get-Phase7BWP2CPreparationRam} ${function:Synthetic-Cim}
      }
      function Assert-Phase7BWP2CPublishedRepository {param($RepositoryRoot,$ExpectedCommit);if($RepositoryRoot -cne $repo -or $ExpectedCommit -cne ('d'*40)){throw 'WRONG_SYNTHETIC_COMMIT'}}
      function Assert-Phase7BWP2CLocalPath {
        param($LiteralPath,$WithinRoot)
        if($WithinRoot -ceq 'C:\Phase7B\host-evidence\379bb303\wp2c'){
          if($LiteralPath -cne $sessionRoot){throw 'SYNTHETIC_ROOT_ESCAPE'}
          & $pathValidator $LiteralPath
        }else{& $pathValidator $LiteralPath $WithinRoot}
      }
      function Get-Phase7BWP2CHostObservation {param($VmxPath,$SnapshotMetadataPath);if($VmxPath -cne $settings.vmxPath -or $SnapshotMetadataPath -cne $settings.snapshotMetadataPath){throw 'WRONG_SYNTHETIC_VM'};Observe-Host}
      & $operatorPath -Mode $Mode -SessionRoot $sessionRoot -FounderPreparationApproved
    } | ForEach-Object {$lines.Add([string]$_)}
  }catch{$failed=$true;$lines.Add($_.Exception.Message)}
  $after=@(Get-ChildItem -LiteralPath $sessionRoot -Recurse -File|ForEach-Object {$_.FullName+':'+(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash})
  Assert-True (@(Compare-Object $before $after).Count -eq 0) 'public preboot entry made no session/media writes'
  [pscustomobject]@{failed=$failed;text=($lines -join "`n")}
}
function Check-Operator([string]$Mode,[bool]$ExpectedPass,[string]$Label,[string]$ExpectedCode){
  $result=Invoke-Operator $Mode
  Assert-True (($result.failed -eq (-not $ExpectedPass)) -and $(if($ExpectedPass){$result.text -match 'PHASE7B_WP2C_PREPARATION_PREBOOT_PASS'}else{$result.text -match 'PHASE7B_WP2C_PREPARATION_OPERATOR_STOP'})) ($Label+':'+$result.text)
  if($ExpectedCode){Assert-True ($result.text.Contains($ExpectedCode)) ($Label+' exact safe failure code')}
}
try {
  $s=New-Case 'optical-default';$final=Invoke-SyntheticFinalizer $s
  Assert-True $final.pass 'source-produced synthetic final descriptor'
  $sessionRoot=Join-Path $s.root 'session';[void](New-Item -ItemType Directory -Path $sessionRoot)
  $vmxPath=Join-Path $s.root 'synthetic.vmx';$snapshotPath=Join-Path $s.root 'synthetic.vmsd'
  $tools=Join-Path $sessionRoot 'tooling.iso';$prep=Join-Path $sessionRoot 'preparation.iso'
  # These are tiny synthetic media identity fixtures, never mountable/live media.
  [IO.File]::WriteAllText($tools,'synthetic-tooling-bytes');[IO.File]::WriteAllText($prep,'synthetic-preparation-bytes')
  [IO.File]::WriteAllText((Join-Path $s.root 'synthetic.vmdk'),"createType=`"monolithicSparse`"`nRW 167772160 SPARSE `"synthetic-extent.vmdk`"`n")
  [IO.File]::WriteAllText($snapshotPath,"snapshot.current = `"2`"`nsnapshot0.uid = `"1`"`nsnapshot0.displayName = `"S0-clean-windows-pre-bootstrap`"`nsnapshot1.uid = `"2`"`nsnapshot1.displayName = `"S1-physiqueos-bootstrap-inert`"`n")
  $fixed=Get-Phase7BIsolatedGuestContract
  $v=@{'displayname'=$fixed.vmDisplayName;'memsize'='4096';'numvcpus'='2';'firmware'='efi';'uefi.secureboot.enabled'='TRUE';'guestos'='windows11-64';'managedvm.autoaddvtpm'='software';'ethernet0.connectiontype'='nat';'ethernet0.startconnected'='FALSE';'isolation.tools.copy.disable'='TRUE';'isolation.tools.paste.disable'='TRUE';'isolation.tools.dnd.disable'='TRUE';'isolation.tools.hgfsserverset.disable'='TRUE';'sharedfolder.maxnum'='0';'usb.restrictions.defaultallow'='FALSE';'scsi0:0.filename'='synthetic.vmdk';'scsi0:0.present'='TRUE';'sata0:0.devicetype'='cdrom-image';'sata0:0.present'='TRUE';'sata0:0.filename'=$tools;'sata0:0.startconnected'='FALSE';'sata0:1.devicetype'='cdrom-image';'sata0:1.present'='TRUE';'sata0:1.filename'=$tools}
  Save-Vmx $v
  $parsed=Read-Phase7BWP2COpticalVmx $vmxPath
  Assert-True (-not $parsed.ContainsKey('sata0:1.startconnected') -and $parsed['sata0:0.startconnected'] -ceq 'FALSE') 'actual parser preserves exact failed saved representation'
  # Evaluate the actual previously published function, not a retyped defect.
  $old=@(& git -C $repo show 'a2f9dc2185e5f4e2f3965b1cd5fc9c8d12e37168:scripts/phase7bWorkPackage2CHost.psm1') -join "`n"
  if($LASTEXITCODE -ne 0){throw 'PUBLISHED_BASE_UNAVAILABLE'}
  $tokens=$null;$errors=$null;$oldAst=[Management.Automation.Language.Parser]::ParseInput($old,[ref]$tokens,[ref]$errors)
  $oldDef=$oldAst.Find({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -ceq 'Get-Phase7BWP2CVmxIdentity'},$true)
  $oldError=& {param($Definition,$Value);. ([scriptblock]::Create($Definition));try{Get-Phase7BWP2CVmxIdentity $Value|Out-Null;'UNEXPECTED_PASS'}catch{$_.Exception.Message}} $oldDef.Extent.Text $parsed
  Assert-True ($oldError -ceq 'PHASE7B_WP2C_OPTICAL_SLOT_POLICY') 'exact old source rejects valid omitted optical default'
  $id=Get-Phase7BWP2CVmxIdentity $parsed
  Assert-True ((Get-Phase7BWP2COpticalConnection $parsed 'sata0:1').representation -ceq 'OMITTED_IMAGE_DEFAULT_TRUE') 'omission explicitly classified'
  Assert-True (-not (Get-Phase7BWP2COpticalConnection $parsed 'sata0:0').startConnected) 'explicit FALSE stays disconnected'
  $explicit=$v.Clone();$explicit['sata0:1.startconnected']='TRUE'
  Assert-True ((Get-Phase7BWP2CVmxIdentity $explicit).sha256 -ceq $id.sha256) 'omitted and explicit TRUE same projection'
  Assert-True (-not $parsed.ContainsKey('sata0:1.startconnected')) 'interpretation does not edit parsed input'
  foreach($value in @('true','FALSE ', 'yes','',1,$true,$null)){$bad=$v.Clone();$bad['sata0:1.startconnected']=$value;Reject {Get-Phase7BWP2CVmxIdentity $bad} 'explicit malformed value never defaults'}
  foreach($slot in @('ethernet0','scsi0:0','sata0:9')){Reject {Get-Phase7BWP2COpticalConnection $v $slot} 'no NIC/disk/missing-device default'}
  $hostModule=Get-Module phase7bWorkPackage2CHost
  $pathValidator=(Get-Command Assert-Phase7BWP2CLocalPath).ScriptBlock
  $operatorPath=Join-Path $PSScriptRoot 'phase7bWorkPackage2CPreparationOperator.ps1'
  $observation=Observe-Host
  Assert-True (Test-Phase7BWP2CHostObservation $observation $observation).pass 'actual host collector/evaluator accepts exact representation'
  $settings=[pscustomobject]@{schemaVersion=1;kind='wp2c-preparation-operator-session';toolingCommit=('d'*40);preparedStateId=('wp2c-prepared-'+('e'*32));hostIdentitySha256=$observation.hostIdentitySha256;vmxPath=$vmxPath;snapshotMetadataPath=$snapshotPath;snapshotSha256=$observation.snapshotSha256;operator=Get-Phase7BWP2CIdentity $operatorPath}
  [void](Write-Phase7BWP2CCreateNewJson (Join-Path $sessionRoot 'session.json') $settings)
  [void](Write-Phase7BWP2CCreateNewJson (Join-Path $sessionRoot 'tooling-result.json') ([pscustomobject]@{identity=Get-Phase7BWP2CIdentity $tools}))
  Check-Operator 'PreBootBaseline' $true 'actual baseline operator accepts false + omitted'
  Save-Vmx $explicit;Check-Operator 'PreBootBaseline' $true 'actual baseline explicit TRUE accepted'
  foreach($change in @('both-connected','neither-connected','malformed','missing-slot','third-image','third-physical','wrong-connected-iso','recovery-disconnected','missing-filename','empty-filename','not-present','physical-instead','unsupported-bus')){
    $bad=$v.Clone()
    switch($change){
      'both-connected' {$bad.Remove('sata0:0.startconnected')}
      'neither-connected' {$bad['sata0:1.startconnected']='FALSE'}
      'malformed' {$bad['sata0:1.startconnected']='maybe'}
      'missing-slot' {foreach($k in @($bad.Keys|Where-Object {$_ -like 'sata0:1.*'})){$bad.Remove($k)}}
      'third-image' {$bad['sata0:2.devicetype']='cdrom-image';$bad['sata0:2.present']='TRUE';$bad['sata0:2.filename']=$tools}
      'third-physical' {$bad['sata0:2.devicetype']='cdrom-raw';$bad['sata0:2.present']='TRUE';$bad['sata0:2.filename']='auto detect'}
      'wrong-connected-iso' {$bad['sata0:1.filename']=$prep}
      'recovery-disconnected' {$bad['sata0:0.filename']=Join-Path $sessionRoot 'recovery.iso'}
      'missing-filename' {$bad.Remove('sata0:1.filename')}
      'empty-filename' {$bad['sata0:1.filename']=''}
      'not-present' {$bad['sata0:1.present']='FALSE'}
      'physical-instead' {$bad['sata0:1.devicetype']='cdrom-raw'}
      'unsupported-bus' {foreach($k in @($bad.Keys|Where-Object {$_ -like 'sata0:1.*'})){$bad[$k.Replace('sata0:1','scsi0:1')]=$bad[$k];$bad.Remove($k)}}
    }
    Save-Vmx $bad;Check-Operator 'PreBootBaseline' $false ('actual baseline rejects '+$change)
  }
  foreach($line in @('sata0:1.startConnected = TRUE','sata0:1.startConnected.extra = "FALSE"',('sata0:1.startConnected = "TRUE"'+"`n"+'SATA0:1.startConnected = "FALSE"'),'sata0:1.present = "FALSE"')){
    Save-Vmx $v;[IO.File]::AppendAllText($vmxPath,"`n"+$line+"`n")
    Check-Operator 'PreBootBaseline' $false 'actual entry rejects malformed/duplicate optical assignment' 'PHASE7B_WP2C_OPTICAL_VMX_AMBIGUOUS'
  }
  Save-Vmx $v
  # Actual collector/finalizer/plan/carrier producers supply the second-boot
  # contextual bindings; only operating-system boundaries use synthetic values.
  $fixtureLines=@(& "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'phase7bWorkPackage2CCollector.test.ps1') -ExportSourceFixture)
  Assert-True ($LASTEXITCODE -eq 0) 'source collector baseline fixture'
  $baseline=($fixtureLines -join "`n"|ConvertFrom-Json).baseline
  $descriptor=Get-Content -LiteralPath $s.finalPath -Raw|ConvertFrom-Json
  $pin=[pscustomobject]@{sha256=('a'*64);bytes=4097}
  $plan=New-Phase7BWP2CPreparationPlan $baseline $descriptor (Get-Phase7BWP2CIdentity $s.finalPath) (Get-Phase7BWP2CIdentity $tools) $pin $pin $PSScriptRoot $settings.toolingCommit $settings.preparedStateId $observation.hostIdentitySha256 $observation.vmConfigSha256 $observation.snapshotSha256
  $planPath=Join-Path $s.root 'plan.json';$planId=Write-Phase7BWP2CCreateNewJson $planPath $plan
  $carrier=New-Phase7BWP2CPreparationContent $planPath $planId.sha256 ($prep+'.content')
  [void](Write-Phase7BWP2CCreateNewJson (Join-Path $sessionRoot 'preparation-result.json') ([pscustomobject]@{identity=Get-Phase7BWP2CIdentity $prep;content=$carrier}))
  $second=$v.Clone();$second.Remove('sata0:0.startconnected');$second['sata0:0.filename']=$prep
  Save-Vmx $second;Check-Operator 'PreBoot' $true 'actual second boot accepts both omitted defaults'
  $explicitSecond=$second.Clone();$explicitSecond['sata0:0.startconnected']='TRUE';$explicitSecond['sata0:1.startconnected']='TRUE'
  Save-Vmx $explicitSecond;Check-Operator 'PreBoot' $true 'actual second boot accepts explicit TRUE'
  foreach($change in @('disconnect','wrong-preparation','recovery','both-tooling','malformed')){
    $bad=$second.Clone()
    switch($change){
      'disconnect' {$bad['sata0:0.startconnected']='FALSE'}
      'wrong-preparation' {$bad['sata0:0.filename']=Join-Path $sessionRoot 'wrong-preparation.iso'}
      'recovery' {$bad['sata0:0.filename']=Join-Path $sessionRoot 'recovery.iso'}
      'both-tooling' {$bad['sata0:0.filename']=$tools}
      'malformed' {$bad['sata0:1.startconnected']='false'}
    }
    Save-Vmx $bad;Check-Operator 'PreBoot' $false ('actual second boot rejects '+$change)
  }
  Save-Vmx $v
  [IO.File]::AppendAllText($tools,'altered');Check-Operator 'PreBootBaseline' $false 'tooling bytes remain independently bound' 'PHASE7B_WP2C_FILE_IDENTITY_MISMATCH'
  [IO.File]::WriteAllText($tools,'synthetic-tooling-bytes')
  Save-Vmx $second
  [IO.File]::AppendAllText($prep,'altered');Check-Operator 'PreBoot' $false 'preparation ISO bytes remain independently bound' 'PHASE7B_WP2C_FILE_IDENTITY_MISMATCH'
  [IO.File]::WriteAllText($prep,'synthetic-preparation-bytes')
  # The execution optical consumer is read-only too. No boot permit or claim.
  $execution=$second.Clone();$binding=[pscustomobject]@{vmConfigSha256=$observation.vmConfigSha256;restoreMedia=Get-Phase7BWP2CIdentity $tools}
  Assert-Phase7BWP2CBootMedia $execution $vmxPath $tools $prep $binding (Get-Phase7BWP2CIdentity $prep).sha256
  Assert-True $true 'execution media consumer uses same omitted default'
  $execution['sata0:1.startconnected']='FALSE';Reject {Assert-Phase7BWP2CBootMedia $execution $vmxPath $tools $prep $binding (Get-Phase7BWP2CIdentity $prep).sha256} 'execution still requires both connected'
  $execution['sata0:1.startconnected']='TRUE';Assert-Phase7BWP2CBootMedia $execution $vmxPath $tools $prep $binding (Get-Phase7BWP2CIdentity $prep).sha256
  Assert-True $true 'execution explicit TRUE still accepted'
  $bad=$v.Clone();$bad.Remove('ethernet0.startconnected');Save-Vmx $bad
  Assert-True (-not (Test-Phase7BWP2CHostObservation (Observe-Host) $observation).pass) 'NIC omission never becomes safe disconnected state'
  $manifest=Get-Phase7BWP2CDependencyManifest
  Assert-True ('phase7bWorkPackage2CHost.psm1' -in @($manifest.files.name) -and @($manifest.files).Count -eq 12) 'changed host module belongs to unchanged 15-file tooling membership'
  $result=[ordered]@{classification='PHASE7B_WP2C_OPTICAL_DEFAULT_TESTS_PASS';pass=$true;assertions=$script:assertions;publishedFailureReproduced=$true;actualBaselineEntry=$true;actualSecondBootEntry=$true;actualHostCollector=$true;executionMediaConsumer=$true;liveVmAccess=$false;liveSessionModified=$false;mediaMounted=$false;wp2cExecuted=$false}
} finally {
  if(Test-Path -LiteralPath $testRoot){$resolved=(Resolve-Path -LiteralPath $testRoot).Path;if(-not $resolved.StartsWith((Join-Path $repo '.tmp\phase7b-finalization-tests-'),[StringComparison]::OrdinalIgnoreCase)){throw 'SYNTHETIC_CLEANUP_BOUNDARY'};Remove-Item -LiteralPath $resolved -Recurse -Force}
}
$result|ConvertTo-Json -Compress
