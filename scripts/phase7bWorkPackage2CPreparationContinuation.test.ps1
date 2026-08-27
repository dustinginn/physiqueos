[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$AgeExePath,[Parameter(Mandatory=$true)][string]$AgeKeygenPath)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
if($PSVersionTable.PSEdition -cne 'Desktop' -or $PSVersionTable.PSVersion -lt [version]'5.1'){throw 'PS51_REQUIRED'}
. (Join-Path $PSScriptRoot 'phase7bWorkPackage2Finalization.test.ps1') -FixturesOnly
# Keep disposable paths below .NET Framework MAX_PATH, like the short live
# host-evidence root. This directory is unique, test-owned and never live state.
$testRoot=Join-Path ([IO.Path]::GetTempPath()) ('pc-'+[guid]::NewGuid().ToString('N').Substring(0,8))
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CContract.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CHost.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CMedia.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CPreparationContinuation.psm1') -Force
function Reject([scriptblock]$Action,[string]$Label){$failed=$false;try{& $Action|Out-Null}catch{$failed=$true};Assert-True $failed $Label}
function Reject-Code([scriptblock]$Action,[string]$Code,[string]$Label){$actual=$null;try{& $Action|Out-Null}catch{$actual=$_.Exception.Message};Assert-True ($actual -ceq $Code) $Label}
function Clone($Value){ConvertTo-Phase7BCanonicalJson $Value|ConvertFrom-Json}
function Save-Vmx($Value){[IO.File]::WriteAllLines($vmxPath,@(foreach($key in @($Value.Keys|Sort-Object)){$key+' = "'+$Value[$key]+'"'}))}
function Synthetic-Cim {
  param($ClassName,$Filter,$ErrorAction)
  switch($ClassName){
    'Win32_OperatingSystem' {[pscustomobject]@{FreePhysicalMemory=[int64](8GB/1024)}}
    'Win32_ComputerSystemProduct' {[pscustomobject]@{UUID='11111111-2222-3333-4444-555555555555'}}
    'Win32_LogicalDisk' {[pscustomobject]@{FreeSpace=[int64]200GB}}
    'Win32_Process' {}
    default {throw 'SYNTHETIC_OS_QUERY'}
  }
}
function Observe-Host {
  & $hostModule {param($V,$S,$Cim);function Get-CimInstance {param($ClassName,$Filter,$ErrorAction);& $Cim @PSBoundParameters};Get-Phase7BWP2CHostObservation $V $S} $global:phase7bContinuationTest.vmxPath $global:phase7bContinuationTest.snapshotPath ${function:Synthetic-Cim}
}
function Invoke-Operator([hashtable]$Arguments){
  $output=New-Object 'Collections.Generic.List[string]'
  $errorBefore=@($Error)
  try { & {
    function Import-Module {param($Name)}
    function New-Object {param($TypeName,$ArgumentList);if($TypeName -ceq 'Security.Principal.WindowsPrincipal'){$p=[pscustomobject]@{};$p|Add-Member ScriptMethod IsInRole {$true};return $p};Microsoft.PowerShell.Utility\New-Object @PSBoundParameters}
    function Assert-Phase7BWP2CPublishedRepository {param($RepositoryRoot,$ExpectedCommit);if($RepositoryRoot -cne $repo -or $ExpectedCommit -cne $publicationCommit){throw 'TEST_COMMIT'}}
    function Assert-Phase7BWP2CLocalPath {param($LiteralPath,$WithinRoot);if($WithinRoot -ceq 'C:\Phase7B\host-evidence\379bb303\wp2c'){$WithinRoot=$testRoot};& $pathValidator $LiteralPath $WithinRoot}
    function Get-CimInstance {param($ClassName,$Filter,$ErrorAction);Synthetic-Cim @PSBoundParameters}
    function Read-Host {if($global:phase7bContinuationTest.tokenRead){return 'END'};$global:phase7bContinuationTest.tokenRead=$true;return $global:phase7bContinuationTest.inputToken}
    function Get-Phase7BWP2CHostObservation {param($VmxPath,$SnapshotMetadataPath);Observe-Host}
    function Get-Phase7BWP2CPreparationRam {& $hostModule {param($Cim);function Get-CimInstance {param($ClassName,$Filter,$ErrorAction);& $Cim @PSBoundParameters};Get-Phase7BWP2CPreparationRam} ${function:Synthetic-Cim}}
    function New-Phase7BWP2CToolingContent {param($SourceDirectory,$AgePath,$AgeKeygenPath,$Destination);& $historicalToolProducer $oldSource $AgePath $AgeKeygenPath $Destination}
    # Overrides above are synthetic OS, publication and historical checkout
    # boundaries only. The actual Initialize/BuildTooling/remaining modes run.
    & $operatorPath @Arguments -FounderPreparationApproved
  } | ForEach-Object {$output.Add([string]$_)} }catch{
    $chain=New-Object 'Collections.Generic.List[string]';$e=$_.Exception
    while($e){$chain.Add($e.GetType().Name+':'+$e.Message);$e=$e.InnerException}
    foreach($record in @($Error|Where-Object {$_ -notin $errorBefore}|Select-Object -First 6)){$chain.Add('ErrorRecord:'+$record.Exception.GetType().Name+':'+$record.Exception.Message)}
    throw ('SYNTHETIC_OPERATOR_FAIL:'+($output -join "`n")+':'+($chain -join ' -> '))
  }
  $output.ToArray()
}
function Read-Current {Read-Phase7BWP2CPreparationContinuation $made.path $made.identity.sha256 $repo}
function Create-Current {New-Phase7BWP2CPreparationContinuation $originalRoot $sessionPin.sha256 $inventoryPin $vmxPin.sha256 $repo $currentCommit}
function New-HistoricalToolingContent($SourceDirectory,$AgePath,$AgeKeygenPath,$Destination){
  $entryPoints=@('phase7bRunWorkPackage2GuestRestore.ps1','phase7bInstallWorkPackage2GuestTooling.ps1','phase7bInspectWorkPackage2CGuestPreparation.ps1','phase7bTestWorkPackage2GuestIdentityEntry.ps1')
  $manifest=Get-Phase7BWP2CDependencyManifest $SourceDirectory $entryPoints
  if(@($manifest.files).Count -ne 12){throw 'HISTORICAL_TOOLING_CLOSURE'}
  [void](New-Item -ItemType Directory -Path $Destination)
  foreach($file in $manifest.files){[IO.File]::Copy((Join-Path $SourceDirectory $file.name),(Join-Path $Destination $file.name))}
  [IO.File]::Copy($AgePath,(Join-Path $Destination 'age.exe'));[IO.File]::Copy($AgeKeygenPath,(Join-Path $Destination 'age-keygen.exe'))
  $age=Get-Phase7BWP2CIdentity (Join-Path $Destination 'age.exe');$keygen=Get-Phase7BWP2CIdentity (Join-Path $Destination 'age-keygen.exe')
  $manifestIdentity=Write-Phase7BWP2CCreateNewJson (Join-Path $Destination 'wp2c-tooling-manifest.json') $manifest
  Assert-Phase7BWP2CExactFileSet $Destination (@($manifest.files.name)+@('age.exe','age-keygen.exe','wp2c-tooling-manifest.json'))
  [pscustomobject]@{manifest=$manifest;manifestIdentity=$manifestIdentity;age=$age;ageKeygen=$keygen}
}
try {
  $s=New-Case 'c';$final=Invoke-SyntheticFinalizer $s;Assert-True $final.pass 'source finalizer fixture'
  $descriptor=Get-Content $s.finalPath -Raw|ConvertFrom-Json
  $descriptor.ageExeSha256=(Get-Phase7BWP2CIdentity $AgeExePath).sha256;$descriptor.ageKeygenSha256=(Get-Phase7BWP2CIdentity $AgeKeygenPath).sha256;Write-Json $s.finalPath $descriptor
  $originalRoot=Join-Path $s.root 'original';$vmxPath=Join-Path $s.root 'synthetic.vmx';$snapshotPath=Join-Path $s.root 'synthetic.vmsd'
  [IO.File]::WriteAllText((Join-Path $s.root 'synthetic.vmdk'),"createType=`"monolithicSparse`"`nRW 167772160 SPARSE `"synthetic-extent.vmdk`"`n")
  [IO.File]::WriteAllText($snapshotPath,"snapshot.current = `"2`"`nsnapshot0.uid = `"1`"`nsnapshot0.displayName = `"S0-clean-windows-pre-bootstrap`"`nsnapshot1.uid = `"2`"`nsnapshot1.displayName = `"S1-physiqueos-bootstrap-inert`"`n")
  $fixed=Get-Phase7BIsolatedGuestContract;$oldMedia=Join-Path $originalRoot 'tooling.iso'
  $v=@{'displayname'=$fixed.vmDisplayName;'uuid.bios'='56 4d 29 d3 c2 39 b8 6b-4b e4 ce 8c a3 00 80 a4';'memsize'='4096';'numvcpus'='2';'firmware'='efi';'uefi.secureboot.enabled'='TRUE';'guestos'='windows11-64';'managedvm.autoaddvtpm'='software';'ethernet0.present'='TRUE';'ethernet0.connectiontype'='nat';'ethernet0.startconnected'='FALSE';'isolation.tools.copy.disable'='TRUE';'isolation.tools.paste.disable'='TRUE';'isolation.tools.dnd.disable'='TRUE';'isolation.tools.hgfsserverset.disable'='TRUE';'sharedfolder.maxnum'='0';'usb.restrictions.defaultallow'='FALSE';'scsi0:0.filename'='synthetic.vmdk';'scsi0:0.present'='TRUE';'sata0:0.devicetype'='cdrom-image';'sata0:0.present'='TRUE';'sata0:0.filename'=$oldMedia;'sata0:0.startconnected'='FALSE';'sata0:1.devicetype'='cdrom-image';'sata0:1.present'='TRUE';'sata0:1.filename'=$oldMedia}
  Save-Vmx $v
  $hostModule=Get-Module phase7bWorkPackage2CHost;$continuationModule=Get-Module phase7bWorkPackage2CPreparationContinuation
  $pathValidator=(Get-Command Assert-Phase7BWP2CLocalPath).ScriptBlock;$historicalToolProducer=${function:New-HistoricalToolingContent}
  $operatorPath=Join-Path $PSScriptRoot 'phase7bWorkPackage2CPreparationOperator.ps1'
  $oldCommit='a'*40;$currentCommit='b'*40;$publicationCommit=$oldCommit
  # Historical guest closure is copied solely into the disposable fixture. Its
  # Host module comes from the real pre-optical published source.
  $oldSource=Join-Path $s.root 'old-source';[void](New-Item -ItemType Directory -Path $oldSource)
  foreach($f in (Get-Phase7BWP2CDependencyManifest $PSScriptRoot).files){[IO.File]::Copy((Join-Path $PSScriptRoot $f.name),(Join-Path $oldSource $f.name))}
  $oldHost=@(& git -C $repo show 'a2f9dc2185e5f4e2f3965b1cd5fc9c8d12e37168:scripts/phase7bWorkPackage2CHost.psm1') -join "`r`n"
  if($LASTEXITCODE -ne 0){throw 'HISTORICAL_SOURCE_REQUIRED'}
  [IO.File]::WriteAllText((Join-Path $oldSource 'phase7bWorkPackage2CHost.psm1'),($oldHost+"`r`n"),(New-Object Text.UTF8Encoding($false)))
  $init=Invoke-Operator @{Mode='Initialize';SessionRoot=$originalRoot;ToolingCommit=$oldCommit;VmxPath=$vmxPath;SnapshotMetadataPath=$snapshotPath;DescriptorPath=$s.finalPath;DescriptorSha256=(Get-Phase7BWP2CIdentity $s.finalPath).sha256;AgePath=$AgeExePath;AgeKeygenPath=$AgeKeygenPath}
  Assert-True (($init -join "`n") -match 'PHASE7B_WP2C_PREPARATION_OPERATOR_INITIALIZED') 'actual Initialize produces original session shape'
  $built=Invoke-Operator @{Mode='BuildTooling';SessionRoot=$originalRoot}
  Assert-True (($built -join "`n") -match 'PHASE7B_WP2C_MEDIA_CREATED') 'actual BuildTooling source produces original media/result'
  $publicationCommit=$currentCommit
  # Inject only synthetic machine/publication/root boundaries into host-only
  # continuation module. No caller-supplied PASS replaces the real validators.
  $global:phase7bContinuationTest=[pscustomobject]@{root=$testRoot;repo=$repo;commit=$currentCommit;vmxPath=$vmxPath;snapshotPath=$snapshotPath;pathValidator=$pathValidator;observe=${function:Observe-Host};tokenRead=$false;inputToken=''}
  & $continuationModule {
    function script:Import-Module {param($Name)}
    function script:Assert-Phase7BWP2CLocalPath {param($LiteralPath,$WithinRoot);if($WithinRoot -ceq 'C:\Phase7B\host-evidence\379bb303\wp2c'){$WithinRoot=$global:phase7bContinuationTest.root};& $global:phase7bContinuationTest.pathValidator $LiteralPath $WithinRoot}
    function script:Assert-Phase7BWP2CPublishedRepository {param($RepositoryRoot,$ExpectedCommit);if($RepositoryRoot -cne $global:phase7bContinuationTest.repo -or $ExpectedCommit -cne $global:phase7bContinuationTest.commit){throw 'TEST_CURRENT_COMMIT'}}
    function script:Get-Phase7BWP2CHostObservation {param($VmxPath,$SnapshotMetadataPath);& $global:phase7bContinuationTest.observe}
    function script:Get-Phase7BWP2CBaselineHandoffRoot {param($SessionId,$Commit);Join-Path $global:phase7bContinuationTest.root ('baseline-handoffs\'+$SessionId+'\'+$Commit)}
  }
  $sessionPin=Get-Phase7BWP2CIdentity (Join-Path $originalRoot 'session.json');$vmxPin=Get-Phase7BWP2CIdentity $vmxPath
  $inventory=Get-Phase7BWP2COriginalPreparationInventory $originalRoot;$inventoryPin=Get-Phase7BWP2CObjectHash $inventory
  Assert-True ($inventoryPin -ceq (Get-Phase7BWP2CObjectHash (Get-Phase7BWP2COriginalPreparationInventory $originalRoot))) 'deterministic original inventory'
  $original=Read-Phase7BWP2COriginalPreparation $originalRoot $sessionPin.sha256 $inventoryPin
  Assert-True (-not $original.origin.baselineCaptured -and -not $original.origin.planCreated -and -not $original.origin.preparationAccepted) 'exact source-produced prebaseline accepted'
  Reject {New-Phase7BWP2CPreparationContinuation $originalRoot ('0'*64) $inventoryPin $vmxPin.sha256 $repo $currentCommit} 'wrong session identity'
  Reject {New-Phase7BWP2CPreparationContinuation $originalRoot $sessionPin.sha256 $inventoryPin $vmxPin.sha256 $repo ('c'*40)} 'wrong current commit'
  foreach($name in @('baseline.json','preparation-plan.json','accepted','baseline-token.txt')){
    $extra=Join-Path $originalRoot $name;[IO.File]::WriteAllText($extra,'synthetic');$changedPin=Get-Phase7BWP2CObjectHash (Get-Phase7BWP2COriginalPreparationInventory $originalRoot)
    Reject {Read-Phase7BWP2COriginalPreparation $originalRoot $sessionPin.sha256 $changedPin} ('prebaseline rejects '+$name)
    Remove-Item -LiteralPath $extra
  }
  $mediaBytes=[IO.File]::ReadAllBytes($oldMedia);[IO.File]::AppendAllText($oldMedia,'changed');Reject {Create-Current} 'changed original media';[IO.File]::WriteAllBytes($oldMedia,$mediaBytes)
  $vmBytes=[IO.File]::ReadAllBytes($vmxPath);[IO.File]::AppendAllText($vmxPath,"`n#changed");Reject {Create-Current} 'changed VMX';[IO.File]::WriteAllBytes($vmxPath,$vmBytes)
  $snapBytes=[IO.File]::ReadAllBytes($snapshotPath);[IO.File]::AppendAllText($snapshotPath,"`n#changed");Reject {Create-Current} 'changed VMSD';[IO.File]::WriteAllBytes($snapshotPath,$snapBytes)
  $sessionBytes=[IO.File]::ReadAllBytes((Join-Path $originalRoot 'session.json'))
  [IO.File]::WriteAllText($snapshotPath,([Text.Encoding]::UTF8.GetString($snapBytes).Replace('snapshot.current = "2"','snapshot.current = "1"')))
  $badSession=Clone $original.settings;$badSession.snapshotSha256=(Get-Phase7BWP2CIdentity $snapshotPath).sha256;Write-Json (Join-Path $originalRoot 'session.json') $badSession
  Reject {New-Phase7BWP2CPreparationContinuation $originalRoot (Get-Phase7BWP2CIdentity (Join-Path $originalRoot 'session.json')).sha256 (Get-Phase7BWP2CObjectHash (Get-Phase7BWP2COriginalPreparationInventory $originalRoot)) $vmxPin.sha256 $repo $currentCommit} 'wrong S1 lineage even with internally matching pins'
  [IO.File]::WriteAllBytes((Join-Path $originalRoot 'session.json'),$sessionBytes);[IO.File]::WriteAllBytes($snapshotPath,$snapBytes)
  $bad=$v.Clone();$bad['sata0:1.startconnected']='maybe';Save-Vmx $bad
  Reject {New-Phase7BWP2CPreparationContinuation $originalRoot $sessionPin.sha256 $inventoryPin (Get-Phase7BWP2CIdentity $vmxPath).sha256 $repo $currentCommit} 'unsupported optical state';Save-Vmx $v
  $collision=Get-Phase7BWP2CContinuationRoot $originalRoot $original.settings.preparedStateId $currentCommit
  [void](New-Item -ItemType Directory -Path $collision);[IO.File]::WriteAllText((Join-Path $collision 'tooling-current.iso'),'synthetic partial')
  Reject {Create-Current} 'exact current replacement-media collision blocks before creation'
  # Only this disposable, known fixture collision is removed, never live state.
  Remove-Item -LiteralPath (Join-Path $collision 'tooling-current.iso');Remove-Item -LiteralPath $collision
  $raw=Invoke-Operator @{Mode='CreateContinuation';SessionRoot=$originalRoot;OriginalSessionSha256=$sessionPin.sha256;OriginalInventorySha256=$inventoryPin;OriginalVmxSha256=$vmxPin.sha256;ToolingCommit=$currentCommit}
  $json=@($raw|Where-Object {$_ -notmatch '^& \('}) -join "`n";$made=$json|ConvertFrom-Json
  Assert-True ($made.created -and $made.classification -ceq 'PHASE7B_WP2C_PREPARATION_CONTINUATION_NONEXECUTABLE') 'actual continuation operator creation'
  $selected=Read-Current;$c=$selected.document
  Assert-True ($c.current.toolingMediaPath -cne $oldMedia -and (Get-Phase7BWP2CIdentity $oldMedia).sha256 -ceq $original.origin.toolingMedia.sha256) 'distinct replacement ISO and preserved original'
  Assert-True ($c.original.initializationCommit -ceq $oldCommit -and $c.current.toolingCommit -ceq $currentCommit -and $selected.settings.preparedStateId -ceq $original.settings.preparedStateId) 'two lineages; same prepared lifecycle ID'
  Assert-True ($c.current.hostModule.sha256 -ceq (Get-Phase7BWP2CIdentity (Join-Path $PSScriptRoot 'phase7bWorkPackage2CHost.psm1')).sha256 -and @($c.current.toolingManifest.files).Count -eq 14 -and 'b.cmd' -cin @($c.current.toolingManifest.files.name)) 'current Host plus authoritative and ergonomic baseline launchers in current guest closure'
  Assert-True ($c.current.toolingManifestIdentity.sha256 -cne $original.origin.toolingManifest.sha256) 'historical manifest not current'
  Assert-True ((Get-Phase7BWP2CObjectHash (Get-Phase7BWP2CDependencyManifest $PSScriptRoot)) -ceq $c.current.toolingManifestIdentity.sha256) 'current closure deterministic regeneration'
  $replacementBytes=[IO.File]::ReadAllBytes($c.current.toolingMediaPath);[IO.File]::AppendAllText($c.current.toolingMediaPath,'changed')
  Reject {Read-Current} 'replacement ISO changed';[IO.File]::WriteAllBytes($c.current.toolingMediaPath,$replacementBytes)
  Assert-True ($inventoryPin -ceq (Get-Phase7BWP2CObjectHash (Get-Phase7BWP2COriginalPreparationInventory $originalRoot))) 'original remains byte-identical'
  $again=Create-Current;Assert-True (-not $again.created -and $again.identity.sha256 -ceq $made.identity.sha256) 'compatible existing context reported, never recreated'
  $contextBytes=[IO.File]::ReadAllBytes($made.path)
  foreach($field in @('toolingCommit','operator','toolingMediaPath')){
    $bad=Clone $c
    switch($field){'toolingCommit'{$bad.current.toolingCommit='c'*40};'operator'{$bad.current.operator.sha256='0'*64};'toolingMediaPath'{$bad.current.toolingMediaPath=$oldMedia}}
    Write-Json $made.path $bad;Reject {Read-Phase7BWP2CPreparationContinuation $made.path (Get-Phase7BWP2CIdentity $made.path).sha256 $repo} ('wrong context '+$field)
    [IO.File]::WriteAllBytes($made.path,$contextBytes)
  }
  $bad=Clone $c;$bad.nonExecutable=$false;Write-Json $made.path $bad;Reject {Read-Phase7BWP2CPreparationContinuation $made.path (Get-Phase7BWP2CIdentity $made.path).sha256 $repo} 'malformed authority';[IO.File]::WriteAllBytes($made.path,$contextBytes)
  $other=Join-Path (Split-Path -Parent $selected.root) ('c'*40);[void](New-Item -ItemType Directory -Path $other)
  [IO.File]::WriteAllText((Join-Path $other 'tooling-current.iso'),'partial');Reject {Read-Current} 'partial replacement-media collision blocks'
  Remove-Item -LiteralPath (Join-Path $other 'tooling-current.iso')
  Write-Json (Join-Path $other 'continuation.json') $c;Reject {Read-Current} 'conflicting current context blocks'
  $historical=Clone $c;$historical.current.toolingCommit='c'*40;Write-Json (Join-Path $other 'continuation.json') $historical
  Assert-True ((Read-Current).identity.sha256 -ceq $made.identity.sha256) 'historical count does not gate exact selected current context'
  $badHistory=Clone $historical;$badHistory.PSObject.Properties.Remove('nonExecutable');Write-Json (Join-Path $other 'continuation.json') $badHistory
  Reject {Read-Current} 'malformed historical context is not ignored by cardinality policy';Write-Json (Join-Path $other 'continuation.json') $historical
  # Reproduce the published live defect with an actual source-produced parent
  # continuation shape: its legacy whole-VMX identity no longer matches after
  # VMware saves an authorized optical projection plus benign runtime metadata.
  $v['sata0:0.filename']=$c.current.toolingMediaPath;$v['sata0:1.filename']=$c.current.toolingMediaPath;Save-Vmx $v
  $legacy=Clone $c;$legacy.vm.configSha256='f'*64;Write-Json $made.path $legacy;$parentId=Get-Phase7BWP2CIdentity $made.path
  Reject {Read-Phase7BWP2CPreparationContinuation $made.path $parentId.sha256 $repo} 'legacy whole-VMX binding reproduces current resumption defect'
  $v['guestinfo.detailed.data']='benign-runtime-serialization';Save-Vmx $v
  $bridgeCommit='d'*40;$publicationCommit=$bridgeCommit;$global:phase7bContinuationTest.commit=$bridgeCommit
  $bridgeRaw=Invoke-Operator @{Mode='CreateVmBindingContinuation';SessionRoot=$selected.root;ContinuationPath=$made.path;ContinuationSha256=$parentId.sha256;StoppedVmxSha256=(Get-Phase7BWP2CIdentity $vmxPath).sha256;ToolingCommit=$bridgeCommit}
  $bridgeJson=@($bridgeRaw|Where-Object {$_ -notmatch '^& \('}) -join "`n";$bridgeMade=$bridgeJson|ConvertFrom-Json
  Assert-True ($bridgeMade.created -and $bridgeMade.classification -ceq 'PHASE7B_WP2C_PREPARATION_VM_BINDING_CONTINUATION_NONEXECUTABLE') 'actual create-new VM-binding bridge operator'
  $selected=Read-Phase7BWP2CVmBindingContinuation $bridgeMade.path $bridgeMade.identity.sha256 $repo;$c=$selected.document
  Assert-True ($selected.binding.parent.legacyVmConfigSha256 -ceq ('f'*64) -and $selected.binding.vm.semanticMode -ceq 'wp2c-semantic-vmx-v2') 'bridge preserves legacy mismatch and current semantic identity separately'
  Assert-True ($selected.binding.vm.stoppedVmx.sha256 -ceq (Get-Phase7BWP2CIdentity $vmxPath).sha256 -and $c.current.toolingMediaPath -cne $legacy.current.toolingMediaPath) 'bridge pins stopped raw VMX and distinct current tooling'
  Assert-True ((Get-Phase7BWP2CObjectHash (Get-Phase7BWP2CDependencyManifest $PSScriptRoot)) -ceq (Get-Phase7BWP2CObjectHash $selected.binding.current.toolingManifest) -and @($selected.binding.current.toolingManifest.files).Count -eq 14) 'bridge current tooling closure deterministically regenerated'
  $bridgeAgain=New-Phase7BWP2CVmBindingContinuation $made.path $parentId.sha256 $selected.binding.vm.stoppedVmx.sha256 $repo $bridgeCommit
  Assert-True (-not $bridgeAgain.created -and $bridgeAgain.identity.sha256 -ceq $bridgeMade.identity.sha256) 'exact compatible bridge is returned without another write'
  Reject {New-Phase7BWP2CVmBindingContinuation $made.path $parentId.sha256 ('0'*64) $repo $bridgeCommit} 'existing bridge cannot be selected with wrong stopped VMX pin'
  $bridgeBytes=[IO.File]::ReadAllBytes($bridgeMade.path);$bridgeDoc=Clone $selected.binding;$bridgeDoc.vm.semanticSha256='0'*64;Write-Json $bridgeMade.path $bridgeDoc
  Reject {Read-Phase7BWP2CVmBindingContinuation $bridgeMade.path (Get-Phase7BWP2CIdentity $bridgeMade.path).sha256 $repo} 'malformed semantic bridge rejected';[IO.File]::WriteAllBytes($bridgeMade.path,$bridgeBytes)
  $bridgeMediaBytes=[IO.File]::ReadAllBytes($c.current.toolingMediaPath);[IO.File]::AppendAllText($c.current.toolingMediaPath,'changed')
  Reject {Read-Phase7BWP2CVmBindingContinuation $bridgeMade.path $bridgeMade.identity.sha256 $repo} 'bridge replacement ISO changed';[IO.File]::WriteAllBytes($c.current.toolingMediaPath,$bridgeMediaBytes)
  $v['sata0:0.filename']=$c.current.toolingMediaPath;$v['sata0:1.filename']=$c.current.toolingMediaPath;Save-Vmx $v
  # A create-new baseline-handoff addendum preserves the historical semantic
  # bridge while carrying the new launcher plus independently authoritative
  # guest/tooling pins on distinct current media.
  $handoffCommit='e'*40;$publicationCommit=$handoffCommit;$global:phase7bContinuationTest.commit=$handoffCommit
  $handoffRaw=Invoke-Operator @{Mode='CreateBaselineHandoffContinuation';SessionRoot=$selected.root;VmBindingPath=$bridgeMade.path;VmBindingSha256=$bridgeMade.identity.sha256;StoppedVmxSha256=(Get-Phase7BWP2CIdentity $vmxPath).sha256;ToolingCommit=$handoffCommit}
  $handoffJson=@($handoffRaw|Where-Object {$_ -notmatch '^[&$]'}|Where-Object {$_ -notmatch '^(Guest:|Set-ExecutionPolicy)'}) -join "`n";$handoffMade=$handoffJson|ConvertFrom-Json
  Assert-True ($handoffMade.created -and $handoffMade.classification -ceq 'PHASE7B_WP2C_PREPARATION_BASELINE_HANDOFF_CONTINUATION_NONEXECUTABLE') 'actual create-new baseline-handoff operator'
  $selected=Read-Phase7BWP2CBaselineHandoffContinuation $handoffMade.path $handoffMade.identity.sha256 $repo;$c=$selected.document
  Assert-True ($selected.baselineHandoff.parent.identity.sha256 -ceq $bridgeMade.identity.sha256 -and $selected.baselineHandoff.current.toolingMediaPath -cne $selected.parent.document.current.toolingMediaPath) 'handoff preserves semantic bridge parent and distinct media'
  Assert-True ($selected.baselineHandoff.schemaVersion -eq 1 -and $null -eq $selected.immediateParent) 'historical first handoff retains schema one semantics'
  Assert-True (@($selected.baselineHandoff.current.toolingManifest.files).Count -eq 14 -and @($selected.tooling.content.manifest.files).Count -eq 14 -and @(Get-ChildItem ($selected.baselineHandoff.current.toolingMediaPath+'.content')).Count -eq 18) 'handoff has thirteen-script plus b.cmd closure and exact eighteen-file media'
  Assert-True ($selected.baselineHandoff.current.baselineBinding.guestIdentitySha256 -ceq $original.settings.expectedGuestIdentitySha256 -and $selected.baselineHandoff.current.baselineBinding.toolingManifestSha256 -ceq $selected.baselineHandoff.current.toolingManifestIdentity.sha256) 'handoff binding uses source-owned guest and tooling pins'
  Assert-True (-not $selected.baselineHandoff.current.baselineBinding.restoreAuthorized -and -not $selected.baselineHandoff.current.baselineBinding.wp2cExecutionAuthorized -and -not $selected.baselineHandoff.current.baselineBinding.laterMigrationAuthorized) 'handoff binding grants no execution authority'
  $operatorText=Get-Content -LiteralPath $operatorPath -Raw
  Assert-True ($operatorText.Contains('type X:\b with X replaced') -and ($handoffRaw -join "`n") -notmatch '-ExpectedGuestIdentitySha256') 'generated guest instruction is four characters after visual drive selection and carries no transcribed pins'
  $firstHandoff=$selected;$firstHandoffMade=$handoffMade;$firstHandoffBytes=[IO.File]::ReadAllBytes($handoffMade.path)
  $firstMediaPath=$selected.baselineHandoff.current.toolingMediaPath;$firstMediaIdentity=Get-Phase7BWP2CIdentity $firstMediaPath

  # Exact live-defect reproduction: once the cold VM correctly retains the
  # accepted first Baseline media, the legacy semantic-bridge-only selector
  # still asks the unchanged strict validator for older semantic tooling.
  $v['sata0:0.filename']=$firstMediaPath;$v['sata0:1.filename']=$firstMediaPath;Save-Vmx $v
  $reboundCommit='f'*40;$publicationCommit=$reboundCommit;$global:phase7bContinuationTest.commit=$reboundCommit
  Reject-Code {New-Phase7BWP2CBaselineHandoffContinuation $bridgeMade.path $bridgeMade.identity.sha256 (Get-Phase7BWP2CIdentity $vmxPath).sha256 $repo $reboundCommit} 'PHASE7B_WP2C_PREPARATION_BOOT_MEDIA' 'published semantic-parent boot-media failure reproduced exactly before first write'
  Reject {New-Phase7BWP2CBaselineHandoffContinuation $bridgeMade.path $bridgeMade.identity.sha256 (Get-Phase7BWP2CIdentity $vmxPath).sha256 $repo $reboundCommit $handoffMade.path $null} 'immediate parent path and hash are an inseparable pair'
  Reject {New-Phase7BWP2CBaselineHandoffContinuation $bridgeMade.path ('0'*64) (Get-Phase7BWP2CIdentity $vmxPath).sha256 $repo $reboundCommit $handoffMade.path $handoffMade.identity.sha256} 'wrong semantic bridge rejected for rebound'
  Reject {New-Phase7BWP2CBaselineHandoffContinuation $bridgeMade.path $bridgeMade.identity.sha256 (Get-Phase7BWP2CIdentity $vmxPath).sha256 $repo $reboundCommit $handoffMade.path ('0'*64)} 'wrong immediate handoff identity rejected'
  Reject {New-Phase7BWP2CBaselineHandoffContinuation $bridgeMade.path $bridgeMade.identity.sha256 (Get-Phase7BWP2CIdentity $vmxPath).sha256 $repo $reboundCommit $bridgeMade.path $bridgeMade.identity.sha256} 'wrong immediate handoff path rejected'
  Reject {New-Phase7BWP2CBaselineHandoffContinuation $bridgeMade.path $bridgeMade.identity.sha256 (Get-Phase7BWP2CIdentity $vmxPath).sha256 $repo ('e'*40) $handoffMade.path $handoffMade.identity.sha256} 'wrong current publication commit rejected'
  $firstMediaBytes=[IO.File]::ReadAllBytes($firstMediaPath);[IO.File]::AppendAllText($firstMediaPath,'changed')
  Reject {New-Phase7BWP2CBaselineHandoffContinuation $bridgeMade.path $bridgeMade.identity.sha256 (Get-Phase7BWP2CIdentity $vmxPath).sha256 $repo $reboundCommit $handoffMade.path $handoffMade.identity.sha256} 'modified immediate Baseline media rejected';[IO.File]::WriteAllBytes($firstMediaPath,$firstMediaBytes)
  $badImmediate=Clone $selected.baselineHandoff;$badImmediate.current.toolingMedia.sha256='0'*64;Write-Json $handoffMade.path $badImmediate
  Reject {New-Phase7BWP2CBaselineHandoffContinuation $bridgeMade.path $bridgeMade.identity.sha256 (Get-Phase7BWP2CIdentity $vmxPath).sha256 $repo $reboundCommit $handoffMade.path (Get-Phase7BWP2CIdentity $handoffMade.path).sha256} 'parent handoff and media mismatch rejected';[IO.File]::WriteAllBytes($handoffMade.path,$firstHandoffBytes)
  $badImmediate=Clone $selected.baselineHandoff;$badImmediate|Add-Member NoteProperty unexpectedParent 'x';Write-Json $handoffMade.path $badImmediate
  Reject {New-Phase7BWP2CBaselineHandoffContinuation $bridgeMade.path $bridgeMade.identity.sha256 (Get-Phase7BWP2CIdentity $vmxPath).sha256 $repo $reboundCommit $handoffMade.path (Get-Phase7BWP2CIdentity $handoffMade.path).sha256} 'malformed immediate parent provenance rejected';[IO.File]::WriteAllBytes($handoffMade.path,$firstHandoffBytes)
  $bad=$v.Clone();$bad['ethernet0.startconnected']='TRUE';Save-Vmx $bad
  Reject {New-Phase7BWP2CBaselineHandoffContinuation $bridgeMade.path $bridgeMade.identity.sha256 (Get-Phase7BWP2CIdentity $vmxPath).sha256 $repo $reboundCommit $handoffMade.path $handoffMade.identity.sha256} 'connected NIC rejected for rebound';Save-Vmx $v
  $bad=$v.Clone();$bad['sata0:0.filename']=$firstHandoff.parent.document.current.toolingMediaPath;$bad['sata0:1.filename']=$firstHandoff.parent.document.current.toolingMediaPath;Save-Vmx $bad
  Reject-Code {New-Phase7BWP2CBaselineHandoffContinuation $bridgeMade.path $bridgeMade.identity.sha256 (Get-Phase7BWP2CIdentity $vmxPath).sha256 $repo $reboundCommit $handoffMade.path $handoffMade.identity.sha256} 'PHASE7B_WP2C_PREPARATION_BOOT_MEDIA' 'older semantic tooling cannot replace exact immediate parent media';Save-Vmx $v
  $bad=$v.Clone();$bad['sata0:0.filename']=Join-Path $testRoot 'unexpected-recovery.iso';Save-Vmx $bad
  Reject-Code {New-Phase7BWP2CBaselineHandoffContinuation $bridgeMade.path $bridgeMade.identity.sha256 (Get-Phase7BWP2CIdentity $vmxPath).sha256 $repo $reboundCommit $handoffMade.path $handoffMade.identity.sha256} 'PHASE7B_WP2C_PREPARATION_BOOT_MEDIA' 'unexpected recovery media rejected';Save-Vmx $v
  $bad=$v.Clone();$bad['sata0:0.startconnected']='TRUE';Save-Vmx $bad
  Reject-Code {New-Phase7BWP2CBaselineHandoffContinuation $bridgeMade.path $bridgeMade.identity.sha256 (Get-Phase7BWP2CIdentity $vmxPath).sha256 $repo $reboundCommit $handoffMade.path $handoffMade.identity.sha256} 'PHASE7B_WP2C_PREPARATION_BOOT_MEDIA' 'wrong optical connection projection rejected';Save-Vmx $v
  $bad=$v.Clone();$bad['sata0:2.present']='TRUE';$bad['sata0:2.devicetype']='cdrom-image';$bad['sata0:2.filename']=$firstMediaPath;Save-Vmx $bad
  Reject {New-Phase7BWP2CBaselineHandoffContinuation $bridgeMade.path $bridgeMade.identity.sha256 (Get-Phase7BWP2CIdentity $vmxPath).sha256 $repo $reboundCommit $handoffMade.path $handoffMade.identity.sha256} 'third optical device rejected';Save-Vmx $v
  $bad=$v.Clone();$bad['sata0:1.present']='FALSE';Save-Vmx $bad
  Reject {New-Phase7BWP2CBaselineHandoffContinuation $bridgeMade.path $bridgeMade.identity.sha256 (Get-Phase7BWP2CIdentity $vmxPath).sha256 $repo $reboundCommit $handoffMade.path $handoffMade.identity.sha256} 'missing optical device rejected';Save-Vmx $v

  $reboundRaw=Invoke-Operator @{Mode='CreateBaselineHandoffContinuation';SessionRoot=$firstHandoff.parent.root;VmBindingPath=$bridgeMade.path;VmBindingSha256=$bridgeMade.identity.sha256;ImmediateBaselineHandoffPath=$handoffMade.path;ImmediateBaselineHandoffSha256=$handoffMade.identity.sha256;StoppedVmxSha256=(Get-Phase7BWP2CIdentity $vmxPath).sha256;ToolingCommit=$reboundCommit}
  $reboundJson=@($reboundRaw|Where-Object {$_ -notmatch '^[&$]'}|Where-Object {$_ -notmatch '^(Guest:|Set-ExecutionPolicy)'}) -join "`n";$reboundMade=$reboundJson|ConvertFrom-Json
  Assert-True ($reboundMade.created -and $reboundMade.classification -ceq 'PHASE7B_WP2C_PREPARATION_BASELINE_HANDOFF_CONTINUATION_NONEXECUTABLE') 'actual rebound operator reaches creation with exact immediate parent'
  $selected=Read-Phase7BWP2CBaselineHandoffContinuation $reboundMade.path $reboundMade.identity.sha256 $repo;$c=$selected.document
  Assert-True ($selected.baselineHandoff.schemaVersion -eq 2 -and $selected.baselineHandoff.parent.identity.sha256 -ceq $bridgeMade.identity.sha256 -and $selected.baselineHandoff.immediateBaselineHandoffParent.identity.sha256 -ceq $handoffMade.identity.sha256) 'rebound binds semantic bridge and immediate handoff separately'
  Assert-True ($selected.baselineHandoff.immediateBaselineHandoffParent.toolingMedia.sha256 -ceq $firstMediaIdentity.sha256 -and $selected.baselineHandoff.current.toolingMediaPath -cne $firstMediaPath) 'rebound validates exact immediate media and creates distinct current media'
  Assert-True ((Get-Phase7BWP2CIdentity $handoffMade.path).sha256 -ceq $handoffMade.identity.sha256 -and (Get-Phase7BWP2CIdentity $firstMediaPath).sha256 -ceq $firstMediaIdentity.sha256) 'immediate handoff and media remain immutable after rebound creation'
  $handoffRaw=$reboundRaw;$handoffMade=$reboundMade;$handoffCommit=$reboundCommit
  $handoffAgain=New-Phase7BWP2CBaselineHandoffContinuation $bridgeMade.path $bridgeMade.identity.sha256 $selected.baselineHandoff.vm.stoppedVmx.sha256 $repo $handoffCommit $firstHandoffMade.path $firstHandoffMade.identity.sha256
  Assert-True (-not $handoffAgain.created -and $handoffAgain.identity.sha256 -ceq $handoffMade.identity.sha256) 'compatible rebound handoff returned without another write'
  Reject {New-Phase7BWP2CBaselineHandoffContinuation $bridgeMade.path $bridgeMade.identity.sha256 ('0'*64) $repo $handoffCommit $firstHandoffMade.path $firstHandoffMade.identity.sha256} 'existing rebound handoff rejects wrong stopped VMX pin'
  # Actual preboot must reject both stale original and stale parent media, then
  # consume only the exact selected handoff and bound media identity.
  $args=@{SessionRoot=$selected.root;BaselineHandoffPath=$handoffMade.path;BaselineHandoffSha256=$handoffMade.identity.sha256}
  Reject {Read-Phase7BWP2CVmBindingContinuation $bridgeMade.path ('0'*64) $repo} 'wrong selected bridge hash'
  Reject {Read-Phase7BWP2CBaselineHandoffContinuation $handoffMade.path ('0'*64) $repo} 'wrong selected handoff hash'
  Reject {Invoke-Operator @{Mode='PreBootBaseline';SessionRoot=$selected.root}} 'explicit VM-binding selection required'
  Reject {Invoke-Operator @{Mode='PreBootBaseline';SessionRoot=$originalRoot}} 'old original session cannot masquerade as current'
  Reject {Invoke-Operator (@{Mode='PreBootBaseline'}+$args)} 'parent continuation ISO cannot satisfy bridge baseline'
  $v['sata0:0.filename']=$c.current.toolingMediaPath;$v['sata0:1.filename']=$c.current.toolingMediaPath;Save-Vmx $v
  $preboot=Invoke-Operator (@{Mode='PreBootBaseline'}+$args)
  Assert-True (($preboot -join "`n") -match 'PHASE7B_WP2C_PREPARATION_PREBOOT_PASS') 'actual baseline accepts bridge media and omitted optical default'
  Assert-True (($handoffRaw -join "`n") -notmatch $c.current.toolingManifestIdentity.sha256) 'short generated command reads pins from immutable binding'
  $fixtureLines=@(& "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'phase7bWorkPackage2CCollector.test.ps1') -ExportSourceFixture)
  if($LASTEXITCODE -ne 0){throw 'COLLECTOR_FIXTURE'}
  $fixture=$fixtureLines -join "`n"|ConvertFrom-Json;$baseline=$fixture.baseline
  $baseline.guestIdentitySha256=$original.settings.expectedGuestIdentitySha256
  $global:phase7bContinuationTest.inputToken=ConvertTo-Phase7BWP2CPreparationReturnText $baseline;$global:phase7bContinuationTest.tokenRead=$false
  $imported=Invoke-Operator (@{Mode='ImportBaseline'}+$args)
  Assert-True (($imported -join "`n") -match 'PHASE7B_WP2C_PREPARATION_BASELINE_IMPORTED') 'actual baseline token importer uses continuation-owned path'
  Reject {Assert-Phase7BWP2CContinuationRegistry $selected.root $original.settings.preparedStateId -RequirePreBaseline} 'new cross-commit creation blocked after any prior continuation progress'
  $planOutput=Invoke-Operator (@{Mode='BuildPreparation'}+$args)
  Assert-True (($planOutput -join "`n") -match 'PHASE7B_WP2C_MEDIA_CREATED') 'actual later BuildPreparation succeeds without Initialize'
  $plan=Get-Content (Join-Path $selected.root 'preparation-plan.json') -Raw|ConvertFrom-Json
  Assert-True ($plan.bindings.toolingCommit -ceq $handoffCommit -and $plan.bindings.toolingMedia.sha256 -ceq $c.current.toolingMedia.sha256 -and $plan.bindings.preparedStateId -ceq $original.settings.preparedStateId) 'plan carries handoff-current tooling and original lifecycle ID'
  $preparation=[pscustomobject]@{wp2cExecuted=$false};Add-Phase7BWP2CPreparationLineage $preparation $plan $selected $handoffMade.path
  Assert-True ($preparation.preparationLineage.schemaVersion -eq 4 -and $preparation.preparationLineage.originalInitializationCommit -ceq $oldCommit -and $preparation.preparationLineage.currentToolingCommit -ceq $handoffCommit -and $preparation.preparationLineage.continuation.sha256 -ceq $handoffMade.identity.sha256 -and $preparation.preparationLineage.parentVmBinding.sha256 -ceq $bridgeMade.identity.sha256 -and $preparation.preparationLineage.immediateBaselineHandoff.sha256 -ceq $firstHandoffMade.identity.sha256 -and $preparation.preparationLineage.immediateBaselineToolingMedia.sha256 -ceq $firstMediaIdentity.sha256) 'recorder lineage adapter binds original, semantic bridge, immediate and rebound lineages'
  $badPlan=Clone $plan;$badPlan.bindings.toolingMedia=$c.original.toolingMedia;Reject {Add-Phase7BWP2CPreparationLineage ([pscustomobject]@{}) $badPlan $selected $bridgeMade.path} 'recorder rejects stale tooling plan'
  $v['sata0:0.startconnected']='TRUE';$v['sata0:1.filename']=Join-Path $selected.root 'preparation.iso';Save-Vmx $v
  $secondBoot=Invoke-Operator (@{Mode='PreBoot'}+$args)
  Assert-True (($secondBoot -join "`n") -match 'PHASE7B_WP2C_PREPARATION_PREBOOT_PASS') 'actual second preboot accepts current tools plus preparation carrier'
  # Source-produced collector/harness outputs with only the synthetic VM UUID
  # updated to this source-produced baseline, never a hand-authored PASS flag.
  $fixture.observation.guestIdentitySha256=$baseline.guestIdentitySha256
  $planId=Get-Phase7BWP2CIdentity (Join-Path $selected.root 'preparation-plan.json')
  $prep=Get-Content (Join-Path $selected.root 'preparation-result.json') -Raw|ConvertFrom-Json
  $report=[pscustomobject][ordered]@{schemaVersion=1;kind='wp2c-guest-preparation-observation';planSha256=$planId.sha256;observation=$fixture.observation;observedAt='2026-08-26T00:00:00Z';wp2cExecuted=$false;packetDecrypted=$false;executionClaimCreated=$false;authorizationConsumed=$false;reportPersisted=$false}
  $observations=@(foreach($case in @('first-field','canary','interrupt')){
    & {
      param($Case,$ScriptPath)
      function Import-Module {param($Name)}
      function Get-CimInstance {param($ClassName,$ErrorAction);[pscustomobject]@{Manufacturer='VMware, Inc.';Model='VMware Virtual Platform'}}
      function Show-Phase7BGuestSyntheticIdentityObservation {[pscustomobject][ordered]@{firstFieldExact=($Case -ceq 'first-field');secondFieldExact=($Case -ceq 'first-field');firstCount=if($Case -ceq 'first-field'){74}else{0};secondCount=if($Case -ceq 'first-field'){74}else{0};dialogConfirmed=($Case -ceq 'first-field');syntheticObservationOnly=$true}}
      (& $ScriptPath -Case $Case -FounderSyntheticGuestTestApproved)|ConvertFrom-Json
    } $case (Join-Path $PSScriptRoot 'phase7bTestWorkPackage2GuestIdentityEntry.ps1')
  })
  $returned=New-Phase7BWP2CPreparationReturn $plan $prep.content.descriptorIdentity $report $observations
  $review=[pscustomobject][ordered]@{schemaVersion=1;kind='wp2c-preparation-founder-review';preparedStateId=$plan.bindings.preparedStateId;onePasswordVersion='8.0';vmwareVersion='26.0';clipboardSequenceBefore=42;clipboardSequenceAfter=42;founderReviewed=$true;realIdentityUsed=$false;invalidSyntheticValueOnly=$true;unexpectedDestinationInput=$false;reviewedAt='2026-08-26T00:01:00Z';wrongFieldTestPass=$true;guestFocusLossTestPass=$true;hostFocusChangeTestPass=$true;minimizationTestPass=$true;cancellationTestPass=$true;interruptionTestPass=$true;canaryTestPass=$true;noToolingSecretFileWrites=$true;noTotp=$true;automaticSubmissionDisabled=$true}
  [void](Write-Phase7BWP2CCreateNewJson (Join-Path $selected.root 'founder-review.json') $review)
  $global:phase7bContinuationTest.inputToken=ConvertTo-Phase7BWP2CPreparationReturnText $returned;$global:phase7bContinuationTest.tokenRead=$false
  $importedReturn=Invoke-Operator (@{Mode='ImportReturn'}+$args)
  Assert-True (($importedReturn -join "`n") -match 'PHASE7B_WP2C_PREPARATION_RETURN_CHECKED') 'actual checked return importer under continuation'
  $recorded=Invoke-Operator (@{Mode='Record'}+$args)
  Assert-True (($recorded -join "`n") -match 'PHASE7B_WP2C_PREPARATION_RECORDED_NONEXECUTABLE') 'actual operator -> recorder -> accepted evidence'
  $accepted=Get-Content (Join-Path $selected.root 'accepted\preparation.json') -Raw|ConvertFrom-Json
  Assert-True ($accepted.preparationLineage.schemaVersion -eq 4 -and $accepted.preparationLineage.continuation.sha256 -ceq $handoffMade.identity.sha256 -and $accepted.preparationLineage.parentVmBinding.sha256 -ceq $bridgeMade.identity.sha256 -and $accepted.preparationLineage.immediateBaselineHandoff.sha256 -ceq $firstHandoffMade.identity.sha256 -and $accepted.preparationLineage.originalInitializationCommit -ceq $oldCommit -and $accepted.preparationLineage.currentToolingCommit -ceq $handoffCommit -and -not $accepted.wp2cExecuted) 'durable final evidence preserves original, bridge, immediate and rebound lineages and nonexecution'
  Assert-True (@(Get-ChildItem (Join-Path $selected.root 'accepted')).Count -eq 4) 'unchanged exact four-file closeout'
  Reject {Invoke-Operator (@{Mode='Record'}+$args)} 'accepted evidence cannot be overwritten'
  Assert-True ($inventoryPin -ceq (Get-Phase7BWP2CObjectHash (Get-Phase7BWP2COriginalPreparationInventory $originalRoot))) 'all original files unchanged after full synthetic continuation'
  $result=[ordered]@{classification='PHASE7B_WP2C_PREPARATION_CONTINUATION_TESTS_PASS';pass=$true;assertions=$script:assertions;actualInitializeProducer=$true;actualContinuationEntry=$true;actualPreBootBaseline=$true;actualImportBaseline=$true;actualBuildPreparation=$true;actualSecondPreBoot=$true;actualImportReturn=$true;actualRecorder=$true;realGuestAccess=$false;liveContinuationCreated=$false;realMediaMounted=$false;wp2cExecuted=$false}
}finally{
  Remove-Variable phase7bContinuationTest -Scope Global -ErrorAction SilentlyContinue
  if(Test-Path -LiteralPath $testRoot){$resolved=(Resolve-Path -LiteralPath $testRoot).Path;if($resolved -cne [IO.Path]::GetFullPath($testRoot) -or (Split-Path -Parent $resolved) -cne ([IO.Path]::GetTempPath().TrimEnd('\')) -or (Split-Path -Leaf $resolved) -cnotmatch '^pc-[0-9a-f]{8}$'){throw 'SYNTHETIC_CLEANUP_BOUNDARY'};Remove-Item -LiteralPath $resolved -Recurse -Force}
}
$result|ConvertTo-Json -Compress
