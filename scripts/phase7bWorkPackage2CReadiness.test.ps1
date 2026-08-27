[CmdletBinding()]
param([string]$AgeExePath,[string]$AgeKeygenPath)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
if($PSVersionTable.PSEdition -cne 'Desktop' -or $PSVersionTable.PSVersion.Major -ne 5){throw 'WINDOWS_PS51_REQUIRED'}
Import-Module (Join-Path $PSScriptRoot 'phase7bIsolatedGuestContract.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2Contract.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CContract.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CGuest.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CHost.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CMedia.psm1') -Force
$script:assertions=0
function Assert-True([bool]$Condition,[string]$Message){if(-not $Condition){throw "ASSERTION_FAILED:$Message"};$script:assertions++}
function Assert-Rejected([scriptblock]$Action,[string]$Message){$failed=$false;try{& $Action | Out-Null}catch{$failed=$true};Assert-True $failed $Message}
function Copy-Value($Value){$Value|ConvertTo-Json -Depth 30|ConvertFrom-Json}
function Identity([char]$Letter){[pscustomobject]@{sha256=([string]$Letter*64);bytes=[int64]4097}}
$repo=Split-Path -Parent $PSScriptRoot
$root=Join-Path $repo ('.tmp\wp2c-synthetic-'+[Guid]::NewGuid().ToString('N'))
try {
  New-Item -ItemType Directory -Path $root | Out-Null
  $ledger=Join-Path $root 'host-ledger';$guestLedger=Join-Path $root 'guest-ledger';$history=Join-Path $root 'history'
  foreach($path in @($ledger,$guestLedger,$history)){New-Item -ItemType Directory -Path $path|Out-Null}
  $fixed=Get-Phase7BIsolatedGuestContract
  $manifest=Get-Phase7BWP2CDependencyManifest $PSScriptRoot
  Assert-True (@($manifest.files).Count -gt 5) 'transitive closure contains real dependencies'
  Assert-True (@($manifest.files.name | Where-Object {$_ -match 'Stage[2345]|Bootstrap|ReplicaTransport'}).Count -eq 0) 'historical provenance filenames are not executable dependencies'
  Assert-True ((Get-Phase7BWP2CObjectHash $manifest) -ceq (Get-Phase7BWP2CObjectHash (Get-Phase7BWP2CDependencyManifest $PSScriptRoot))) 'dependency manifest deterministic'
  $b=[pscustomobject][ordered]@{
    attemptId='phase7b-wp2-'+('a'*32);toolingCommit=(& git -C $repo rev-parse HEAD).Trim();applicationCommit=$fixed.applicationCommit;environmentId=$fixed.environmentId;vmDisplayName=$fixed.vmDisplayName
    hostIdentitySha256='1'*64;guestIdentitySha256='2'*64;vmConfigSha256='3'*64;snapshotSha256='4'*64;preparationEvidenceSha256='5'*64;toolingManifestSha256=Get-Phase7BWP2CObjectHash $manifest
    finalDescriptor=Identity 'a';packet=Identity 'b';restoreMedia=Identity 'c';mediaDescriptor=Identity 'd';toolingMedia=Identity 'e';age=Identity 'f';ageKeygen=Identity 'a';git=Identity 'b'
    ageRecipient='age1'+('q'*58);ageEncryptionMode='native-recipient-v1';ageVersion='1.3.1';ageKeygenVersion='1.3.1'
    guestMarkerSha256='6'*64;guestComputerName='WP2C-SYNTHETIC';guestOsBuild='26200';guestOsCaption='Microsoft Windows 11 Enterprise Evaluation';vmwareToolsVersion='synthetic-tools'
    snapshotName='S1-physiqueos-bootstrap-inert';preparedStateId='wp2c-prepared-'+('7'*32);identityEntryMethod='1password-type-in-window-provisional-v1';identityEntryValidationSha256='8'*64
    networkPolicy='disconnected-v1';vmConfigIdentityMode='wp2c-offline-optical-projection-v1';claimSchemaVersion=1;completionSchemaVersion=1;plaintextZip=Identity 'c';maximumExpandedBytes=[int64]4097
    incomingRoot=Join-Path $fixed.isolatedRoot 'incoming';restoreRoot=Join-Path $fixed.isolatedRoot 'restore\canonical';stateRoot=Join-Path $fixed.isolatedRoot 'wp2c-state';toolingRoot=Join-Path $fixed.isolatedRoot ('tooling\'+(Get-Phase7BWP2CObjectHash $manifest))
  }
  $hostArtifacts=Get-Phase7BWP2CDependencyManifest -SourceDirectory $PSScriptRoot -EntryPoints (Get-Phase7BWP2CHostEntryPoints)
  $c=New-Phase7BWP2CInvocationContract $b $manifest $hostArtifacts
  $invPath=Join-Path $root 'invocation.json';$invIdentity=Write-Phase7BWP2CCreateNewJson $invPath $c
  $second=Write-Phase7BWP2CCreateNewJson (Join-Path $root 'comparison.json') (New-Phase7BWP2CInvocationContract $b $manifest $hostArtifacts)
  Assert-True ($second.sha256 -ceq $invIdentity.sha256 -and $second.bytes -eq $invIdentity.bytes) 'canonical invocation byte deterministic'
  $a=New-Phase7BWP2CAuthorization $c $invIdentity.sha256
  Assert-Phase7BWP2CAuthorization $a $c $invIdentity.sha256
  Assert-True $true 'source-produced current authorization accepted'
  $authPath=Join-Path $root ($a.authorizationId+'.json');$authIdentity=Write-Phase7BWP2CCreateNewJson $authPath $a
  Assert-Rejected {Read-Phase7BWP2CBoundJson $authPath ('0'*64)} 'exact authorization file hash required'
  foreach($field in @('attemptId','toolingCommit','guestIdentitySha256','snapshotSha256','ageRecipient','networkPolicy')) {
    $bad=Copy-Value $a;$bad.bindings.$field='wrong'
    Assert-Rejected {Assert-Phase7BWP2CAuthorization $bad $c $invIdentity.sha256} "authorization rejects $field"
  }
  foreach($field in @('finalDescriptor','packet','restoreMedia','toolingMedia','age','ageKeygen')){
    $bad=Copy-Value $a;$bad.bindings.$field.sha256='0'*64
    Assert-Rejected {Assert-Phase7BWP2CAuthorization $bad $c $invIdentity.sha256} "authorization rejects $field"
  }
  foreach($field in @('oneUse','wp2cAuthorized')){$bad=Copy-Value $a;$bad.$field=$false;Assert-Rejected {Assert-Phase7BWP2CAuthorization $bad $c $invIdentity.sha256} "reject false $field"}
  foreach($field in @('automaticRetryAllowed','laterMigrationAuthorized')){$bad=Copy-Value $a;$bad.$field=$true;Assert-Rejected {Assert-Phase7BWP2CAuthorization $bad $c $invIdentity.sha256} "reject true $field"}
  $bad=Copy-Value $a;$bad.mutationBudget=2;Assert-Rejected {Assert-Phase7BWP2CAuthorization $bad $c $invIdentity.sha256} 'wrong budget'
  foreach($value in @('true',1,$null)){$bad=Copy-Value $a;$bad.oneUse=$value;Assert-Rejected {Assert-Phase7BWP2CAuthorization $bad $c $invIdentity.sha256} 'boolean coercion rejected'}
  $bad=Copy-Value $a;$bad.stage='WP2B_CAPTURE';Assert-Rejected {Assert-Phase7BWP2CAuthorization $bad $c $invIdentity.sha256} 'wrong stage'
  Assert-Rejected {Assert-Phase7BWP2CAuthorization $a $c $invIdentity.sha256 ([datetime]::UtcNow.AddDays(2))} 'expired'
  Assert-Rejected {Assert-Phase7BWP2CAuthorization $a $c ('0'*64)} 'wrong invocation'
  if(@(& git --no-optional-locks -C $repo status --porcelain=v1 --untracked-files=all).Count -gt 0){Assert-Rejected {Assert-Phase7BWP2CPublishedRepository $repo $b.toolingCommit} 'unpublished local candidate cannot grant execution authority'}
  foreach($n in 1..4){$old=Copy-Value $a;$old.authorizationId='wp2c-auth-'+([string]$n*32);$old.bindings.toolingCommit=([string]$n*40);[void](Write-Phase7BWP2CCreateNewJson (Join-Path $history ($old.authorizationId+'.json')) $old)}
  Assert-Phase7BWP2CNoCurrentConflict $history $c $ledger
  Assert-True $true 'older-commit authorizations coexist without count gate'
  [void](Write-Phase7BWP2CCreateNewJson (Join-Path $history ($a.authorizationId+'.json')) $a)
  Assert-Rejected {Assert-Phase7BWP2CNoCurrentConflict $history $c $ledger} 'eligible current conflict'
  $hostClaim=New-Phase7BWP2CExecutionClaim $ledger $a $authIdentity.sha256 'host' ''
  Assert-Phase7BWP2CClaim $hostClaim.document $a $authIdentity.sha256 'host'
  Assert-True ((Get-Phase7BWP2CExecutionState $ledger $a.authorizationId) -ceq 'CLAIMED_RECONCILIATION_REQUIRED') 'durable host claim'
  Assert-Rejected {New-Phase7BWP2CExecutionClaim $ledger $a $authIdentity.sha256 'host' ''} 'replay after claim rejected'
  $guestClaim=New-Phase7BWP2CExecutionClaim $guestLedger $a $authIdentity.sha256 'guest' $hostClaim.identity.sha256
  # Synthetic guest rollback removes only a disposable guest claim; external host ledger survives.
  Remove-Item -LiteralPath $guestClaim.path -Force
  Assert-True ((Get-Phase7BWP2CExecutionState $ledger $a.authorizationId) -ceq 'CLAIMED_RECONCILIATION_REQUIRED') 'guest snapshot rollback cannot erase host claim'
  Assert-Rejected {New-Phase7BWP2CExecutionClaim $ledger $a $authIdentity.sha256 'host' ''} 'host launch remains blocked after rollback'
  [void](Complete-Phase7BWP2CExecution $ledger $a $hostClaim.identity.sha256 ('9'*64))
  Assert-True ((Get-Phase7BWP2CExecutionState $ledger $a.authorizationId) -ceq 'COMPLETED_TERMINAL') 'completion terminal'
  Assert-Rejected {Complete-Phase7BWP2CExecution $ledger $a $hostClaim.identity.sha256 ('9'*64)} 'completion cannot repeat'
  $o=[pscustomobject]@{manufacturer='VMware, Inc.';model='VMware Virtual Platform';computerName=$b.guestComputerName;guestIdentitySha256=$b.guestIdentitySha256;applicationCommit=$b.applicationCommit;repositoryClean=$true;markerSha256=$b.guestMarkerSha256;toolingManifestSha256=$b.toolingManifestSha256;installedFilesExact=$true;psEdition='Desktop';psVersion='5.1.26100.1';is64Bit=$true;frameworkReady=$true;osBuild=$b.guestOsBuild;osCaption=$b.guestOsCaption;licenseStatus=1;evaluationMinutesRemaining=10000;memoryMiB=4095;vcpuCount=2;toolsRunning=$true;toolsVersion=$b.vmwareToolsVersion;hgfsEnumerationExitCode=0;hgfsFolderCount=0;networkDriveCount=0;smbConnectionCount=0;upAdapterCount=0;externalRouteCount=0;establishedExternalConnectionCount=0;tasksExactAndDisabled=$true;controlsStopped=$true;applicationProcessCount=0;port3000Count=0;databaseProcessCount=0;credentialExclusionsPass=$true;localNtfsRoots=$true;pathOwnershipPass=$true;incomingFreeBytes=[int64]10GB;restoreFreeBytes=[int64]10GB;incomingChildCount=0;restoreChildCount=0}
  # Obtain the corroboration shape from the real producer under synthetic OS
  # boundaries, not a hand-maintained pass flag or a legacy exit-code fixture.
  $hgfsObservation=& (Get-Module phase7bWorkPackage2CGuest) {
    function Get-Service {param($Name,$ErrorAction);[pscustomobject]@{Status='Running'}}
    function Test-Path {param($LiteralPath,$PathType);$true}
    function Get-CimInstance {
      param($ClassName,$Filter,$ErrorAction)
      switch($ClassName){
        'Win32_SystemDriver' {[pscustomobject]@{Name='vmhgfs';State='Running'}}
        'Win32_LogicalDisk' {}
        'Win32_NetworkConnection' {}
        default {throw 'UNEXPECTED_HGFS_FIXTURE_QUERY'}
      }
    }
    function Get-PSDrive {param($ErrorAction)}
    Set-Item -LiteralPath 'Function:C:\Program Files\VMware\VMware Tools\VMwareHgfsClient.exe' -Value {& C:\Windows\System32\cmd.exe /d /c exit 1}
    Get-Phase7BWP2CHgfsObservation ([pscustomobject]@{Manufacturer='VMware, Inc.';Model='VMware Virtual Platform'})
  }
  $o | Add-Member NoteProperty hgfsObservation $hgfsObservation
  $o.hgfsEnumerationExitCode=1
  Assert-True (Test-Phase7BWP2CGuestObservation $o $b).pass 'source gate accepts source-produced corroborated exit1 observation'
  foreach($field in @('manufacturer','computerName','guestIdentitySha256','applicationCommit','markerSha256','toolingManifestSha256','osBuild','toolsVersion')){$bad=Copy-Value $o;$bad.$field='wrong';Assert-True (-not (Test-Phase7BWP2CGuestObservation $bad $b).pass) "gate rejects $field"}
  foreach($field in @('repositoryClean','installedFilesExact','frameworkReady','toolsRunning','tasksExactAndDisabled','controlsStopped','credentialExclusionsPass','localNtfsRoots','pathOwnershipPass')){$bad=Copy-Value $o;$bad.$field=$false;Assert-True (-not (Test-Phase7BWP2CGuestObservation $bad $b).pass) "gate rejects $field"}
  foreach($field in @('hgfsFolderCount','networkDriveCount','smbConnectionCount','upAdapterCount','externalRouteCount','establishedExternalConnectionCount','applicationProcessCount','port3000Count','databaseProcessCount','incomingChildCount','restoreChildCount')){$bad=Copy-Value $o;$bad.$field=1;Assert-True (-not (Test-Phase7BWP2CGuestObservation $bad $b).pass) "gate rejects $field"}
  foreach($field in @('evaluationMinutesRemaining','incomingFreeBytes','restoreFreeBytes')){$bad=Copy-Value $o;$bad.$field=0;Assert-True (-not (Test-Phase7BWP2CGuestObservation $bad $b).pass) "gate rejects $field"}
  $ho=[pscustomobject]@{hostIdentitySha256=$b.hostIdentitySha256;vmConfigSha256=$b.vmConfigSha256;snapshotSha256=$b.snapshotSha256;availableMemoryBytes=[int64]7GB;freeDiskBytes=[int64]120GB;poweredOff=$true;vmContractPass=$true;nicStartConnected=$false;clipboardDisabled=$true;dragDropDisabled=$true;sharedFoldersDisabled=$true;memorySnapshotPresent=$false}
  Assert-True (Test-Phase7BWP2CHostObservation $ho $b).pass 'host baseline'
  $fixed=Get-Phase7BIsolatedGuestContract
  $vmx=@{'displayname'=$fixed.vmDisplayName;'uuid.bios'='56 4d 29 d3 c2 39 b8 6b-4b e4 ce 8c a3 00 80 a4';'memsize'='4096';'numvcpus'='2';'firmware'='efi';'uefi.secureboot.enabled'='TRUE';'guestos'='windows11-64';'managedvm.autoaddvtpm'='software';'ethernet0.present'='TRUE';'ethernet0.connectiontype'='nat';'ethernet0.startconnected'='FALSE';'isolation.tools.copy.disable'='TRUE';'isolation.tools.paste.disable'='TRUE';'isolation.tools.dnd.disable'='TRUE';'isolation.tools.hgfsserverset.disable'='TRUE';'sharedfolder.maxnum'='0';'usb.restrictions.defaultallow'='FALSE';'scsi0:0.filename'='synthetic.vmdk';'scsi0:0.present'='TRUE';'sata0:1.devicetype'='cdrom-image';'sata0:1.present'='TRUE';'sata0:1.startconnected'='FALSE';'sata0:1.filename'='tools.iso';'sata0:2.devicetype'='cdrom-image';'sata0:2.present'='TRUE';'sata0:2.startconnected'='FALSE';'sata0:2.filename'='unused.iso'}
  $vmIdentity=Get-Phase7BWP2CVmxIdentity $vmx
  $changed=$vmx.Clone();$changed['sata0:1.filename']='recovery.iso';$changed['sata0:2.filename']='control.iso';$changed['sata0:1.startconnected']='TRUE';$changed['sata0:2.startconnected']='TRUE'
  Assert-True ((Get-Phase7BWP2CVmxIdentity $changed).sha256 -ceq $vmIdentity.sha256) 'only separately checked optical path/state excluded from VM config hash'
  $bad=$vmx.Clone();$bad['scsi0:0.filename']='changed.vmdk';Assert-True ((Get-Phase7BWP2CVmxIdentity $bad).sha256 -cne $vmIdentity.sha256) 'VM config binds disk path'
  $bad=$vmx.Clone();$bad['memsize']='2048';Assert-Rejected {Get-Phase7BWP2CVmxIdentity $bad} 'VM config rejects wrong memory'
  $bad=$vmx.Clone();$bad['ethernet0.startconnected']='TRUE';Assert-Rejected {Get-Phase7BWP2CVmxIdentity $bad} 'VM config rejects connected NIC'
  $bad=$vmx.Clone();$bad['sata0:2.devicetype']='rawDisk';Assert-Rejected {Get-Phase7BWP2CVmxIdentity $bad} 'raw/physical extra attachment rejected'
  $recoveryIso=Join-Path $root 'synthetic-recovery.iso';$controlIso=Join-Path $root 'synthetic-control.iso'
  [IO.File]::WriteAllText($recoveryIso,'synthetic-recovery');[IO.File]::WriteAllText($controlIso,'synthetic-control')
  $bootBindings=Copy-Value $b;$bootBindings.vmConfigSha256=$vmIdentity.sha256;$bootBindings.restoreMedia=Get-Phase7BWP2CIdentity $recoveryIso
  $changed['sata0:1.filename']=$recoveryIso;$changed['sata0:2.filename']=$controlIso
  Assert-Phase7BWP2CBootMedia $changed (Join-Path $root 'synthetic.vmx') $recoveryIso $controlIso $bootBindings (Get-Phase7BWP2CIdentity $controlIso).sha256
  Assert-True $true 'post-attachment preboot gate validates exact media'
  Assert-Rejected {Assert-Phase7BWP2CBootMedia $changed (Join-Path $root 'synthetic.vmx') $recoveryIso $controlIso $bootBindings ('0'*64)} 'wrong control media rejected'
  $changed['sata0:2.startconnected']='FALSE';Assert-Rejected {Assert-Phase7BWP2CBootMedia $changed (Join-Path $root 'synthetic.vmx') $recoveryIso $controlIso $bootBindings (Get-Phase7BWP2CIdentity $controlIso).sha256} 'disconnected optical media rejected before boot permit'
  $bad=Copy-Value $ho;$bad.availableMemoryBytes=[int64](4.29*1GB);Assert-True (-not (Test-Phase7BWP2CHostObservation $bad $b).pass) '4.29GiB fails preserved 7GiB gate'
  foreach($field in @('clipboardDisabled','dragDropDisabled','sharedFoldersDisabled','poweredOff')){$bad=Copy-Value $ho;$bad.$field=$false;Assert-True (-not (Test-Phase7BWP2CHostObservation $bad $b).pass) "host rejects $field"}
  $entry=[pscustomobject]@{schemaVersion=1;kind='wp2c-synthetic-entry-validation';method=$b.identityEntryMethod;guestIdentitySha256=$b.guestIdentitySha256;toolingManifestSha256=$b.toolingManifestSha256;invalidSyntheticValueOnly=$true;noTotp=$true;automaticSubmissionDisabled=$true;firstFieldExact=$true;secondFieldExact=$true;wrongFieldTestPass=$true;guestFocusLossTestPass=$true;hostFocusChangeTestPass=$true;minimizationTestPass=$true;cancellationTestPass=$true;interruptionTestPass=$true;canaryTestPass=$true;hostClipboardUnchanged=$true;guestClipboardUnchanged=$true;noToolingSecretFileWrites=$true;realIdentityUsed=$false;unexpectedDestinationInput=$false;universalFocusGuarantee=$false;founderReviewed=$true;onePasswordVersion='synthetic';vmwareVersion='synthetic';guestDialogVersion='v1';testedAt=[datetime]::UtcNow.ToString('o')}
  Assert-Phase7BWP2CEntryValidation $entry $b;Assert-True $true 'provisional acceptance source schema'
  foreach($field in @('firstFieldExact','secondFieldExact','wrongFieldTestPass','guestFocusLossTestPass','hostFocusChangeTestPass','minimizationTestPass','cancellationTestPass','interruptionTestPass','canaryTestPass','hostClipboardUnchanged','guestClipboardUnchanged','noToolingSecretFileWrites','founderReviewed')){$bad=Copy-Value $entry;$bad.$field=$false;Assert-Rejected {Assert-Phase7BWP2CEntryValidation $bad $b} "reject unsafe entry $field"}
  $bad=Copy-Value $entry;$bad.universalFocusGuarantee=$true;Assert-Rejected {Assert-Phase7BWP2CEntryValidation $bad $b} 'cannot claim universal focus guarantee'
  $pb=Copy-Value $b;$pb.identityEntryValidationSha256=Get-Phase7BWP2CObjectHash $entry
  $guestReport=[pscustomobject]@{schemaVersion=1;kind='wp2c-guest-preparation-observation';observation=$o;wp2cExecuted=$false;packetDecrypted=$false;executionClaimCreated=$false;authorizationConsumed=$false}
  $prep=New-Phase7BWP2CPreparationEvidence $pb $ho $guestReport $entry -FounderReviewed
  Assert-True (-not $prep.wp2cExecuted -and -not $prep.executionClaimCreated) 'source-produced preparation is not execution'
  foreach($field in @('clipboardDisabled','dragDropDisabled','sharedFoldersDisabled')){
    $badHost=Copy-Value $ho;$badHost.$field=$false
    Assert-Rejected {New-Phase7BWP2CPreparationEvidence $pb $badHost $guestReport $entry -FounderReviewed} ('corroborated guest exit1 cannot override host '+$field)
  }
  $prepPath=Join-Path $root 'preparation.json';$pb.preparationEvidenceSha256=(Write-Phase7BWP2CCreateNewJson $prepPath $prep).sha256
  $entryPath=Join-Path $root 'entry.json';[void](Write-Phase7BWP2CCreateNewJson $entryPath $entry)
  $pc=New-Phase7BWP2CInvocationContract $pb $manifest $hostArtifacts
  $pcPath=Join-Path $root 'control-invocation.json';$pci=Write-Phase7BWP2CCreateNewJson $pcPath $pc
  $pa=New-Phase7BWP2CAuthorization $pc $pci.sha256
  $paPath=Join-Path $root 'control-auth.json';$pai=Write-Phase7BWP2CCreateNewJson $paPath $pa
  $pclaim=New-Phase7BWP2CExecutionClaim $ledger $pa $pai.sha256 'host' ''
  $control=Join-Path $root 'control-content'
  $carrier=New-Phase7BWP2CControlContent $pcPath $pci.sha256 $paPath $pai.sha256 $pclaim.path $pclaim.identity.sha256 $prepPath $entryPath $control
  Assert-True ($carrier.fileCount -eq 5 -and -not $carrier.secretIncluded -and -not $carrier.selfHashIncluded) 'actual source-produced control carrier is non-circular and nonsecret'
  $received=Read-Phase7BWP2CBoundJson (Join-Path $control 'authorization.json') $pai.sha256
  Assert-Phase7BWP2CAuthorization $received $pc $pci.sha256
  Assert-True $true 'control producer output accepted by guest authorization consumer'
  $verified=[pscustomobject]@{pass=$true;fileCount=2;sourceInventorySha256='a'*64;referenceIndexSha256='b'*64}
  $evidence=New-Phase7BWP2CPassEvidence $pa $pai.sha256 $pclaim.identity.sha256 ('d'*64) ('e'*64) $verified
  Assert-Phase7BWP2CPassEvidence $evidence $pa $pai.sha256 $pclaim.identity.sha256
  Assert-True $true 'actual PASS producer accepted by closeout consumer'
  foreach($field in @('manifestPass','referenceIndexPass','credentialExclusionsPass','runtimeInertPass','networkIsolationPass','temporaryZipRemoved')){$bad=Copy-Value $evidence;$bad.$field=$false;Assert-Rejected {Assert-Phase7BWP2CPassEvidence $bad $pa $pai.sha256 $pclaim.identity.sha256} "closeout rejects $field"}
  $bad=Copy-Value $evidence;$bad.bindings.packet.sha256='0'*64;Assert-Rejected {Assert-Phase7BWP2CPassEvidence $bad $pa $pai.sha256 $pclaim.identity.sha256} 'evidence cannot lie about bound context'
  foreach($field in @('guestChecksAccepted','shutdownVerified','noMemorySnapshot')){$bad=Copy-Value $prep;$bad.$field=$false;Assert-Rejected {Assert-Phase7BWP2CPreparation $bad $pb} "preparation rejects $field"}
  $bad=Copy-Value $prep;$bad.guestObservation.upAdapterCount=1;Assert-Rejected {Assert-Phase7BWP2CPreparation $bad $pb} 'preparation pass boolean cannot override observed network'
  Assert-True (Test-Phase7BWP2CSnapshotTransition 'HOST_COMPLETE' 'S2' $true $false $false).pass 'S2 only after host completion and shutdown'
  foreach($args in @(@('PREPARED','S2',$true,$false,$false),@('HOST_COMPLETE','S2',$false,$false,$false),@('HOST_COMPLETE','S2',$true,$true,$false),@('HOST_COMPLETE','S2',$true,$false,$true),@('GUEST_PASS','S1',$true,$false,$true))){Assert-True (-not (Test-Phase7BWP2CSnapshotTransition @args).pass) 'unsafe snapshot transition rejected'}
  foreach($path in @('P7BR:\packet','HKLM:\Software','\\server\share\packet','C:\x\..\escape','C:\x\a:stream')){Assert-Rejected {Assert-Phase7BWP2CLocalPath $path} 'unexpected provider/escape rejected'}
  Assert-Rejected {Assert-Phase7BWP2CLocalPath 'C:\outside\file' 'C:\bounded'} 'outside root rejected'
  Assert-True ((Assert-Phase7BWP2CLocalPath (Join-Path $root 'child') $root) -ceq (Join-Path $root 'child')) 'correct bounded child accepted'
  $target=Join-Path $root 'junction-target';$link=Join-Path $root 'junction-link'
  New-Item -ItemType Directory -Path $target|Out-Null
  New-Item -ItemType Junction -Path $link -Target $target|Out-Null
  Assert-Rejected {Assert-Phase7BWP2CLocalPath (Join-Path $link 'file') $root} 'real Windows reparse point rejected'
  [IO.Directory]::Delete($link)
  Assert-True (Test-Path -LiteralPath $target -PathType Container) 'removing synthetic junction preserves its synthetic target'
  foreach($state in @('preparation-preflight','tooling-install','media-attach','guest-boot','synthetic-entry','execution-preflight','claimed','staged','decrypt','zip','extract','verify','evidence-written','completed','shutdown','snapshot','outer-closeout')){$r=Get-Phase7BWP2CRecoveryDecision $state;Assert-True (-not $r.automaticRetryAllowed -and -not $r.restoreReplayAllowed -and -not $r.automaticRevertAllowed) "no implicit replay/revert $state"}
  $bindingsPath=Join-Path $root 'bindings.json';[void](Write-Phase7BWP2CCreateNewJson $bindingsPath $b)
  $manifestPath=Join-Path $root 'manifest.json';[void](Write-Phase7BWP2CCreateNewJson $manifestPath $manifest)
  $generated=Join-Path $root 'fresh-process.json'
  $lines=@(& "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'phase7bNewWorkPackage2CInvocationContract.ps1') -BindingsPath $bindingsPath -ToolingManifestPath $manifestPath -OutputPath $generated 2>&1)
  Assert-True ($LASTEXITCODE -eq 0) ('fresh PS5.1 generator: '+($lines -join ' '))
  Assert-True ((Get-Phase7BWP2CIdentity $generated).sha256 -ceq $invIdentity.sha256) 'fresh-process producer byte parity'
  $source=Get-Content (Join-Path $PSScriptRoot 'phase7bRunWorkPackage2GuestRestore.ps1') -Raw
  $order=@('Assert-Phase7BWP2CGuestPreMutation $c','Request-Phase7BVerifiedAgeIdentity','New-Phase7BWP2CExecutionClaim','[IO.File]::Copy','Invoke-Phase7BAgeNativeIdentityDecryptionToFile','Assert-Phase7BWP2CZipBounds','Expand-Phase7BSafePacketZip','Test-Phase7BWP2CRestoredPacket','Write-Phase7BWP2CCreateNewJson $evidencePath','Complete-Phase7BWP2CExecution')
  $previous=-1;foreach($needle in $order){$index=$source.IndexOf($needle);Assert-True ($index -gt $previous) "source ordering $needle";$previous=$index}
  Assert-True ($source.LastIndexOf('Assert-Phase7BWP2CGuestPreMutation $c',$source.IndexOf('New-Phase7BWP2CExecutionClaim')) -gt $source.IndexOf('Request-Phase7BVerifiedAgeIdentity')) 'preflight repeated after identity before claim'
  foreach($file in @($manifest.files|Where-Object {$_.name -cmatch '\.(?:ps1|psm1)$'})+@($hostArtifacts.files)){
    $path=Join-Path $PSScriptRoot $file.name;$tokens=$null;$errors=$null;$ast=[Management.Automation.Language.Parser]::ParseFile($path,[ref]$tokens,[ref]$errors)
    Assert-True (@($errors).Count -eq 0) "PS5.1 AST $($file.name)"
    Assert-True (@($ast.FindAll({param($n)$n -is [Management.Automation.Language.ExitStatementAst]},$true)).Count -eq 0) "no raw exit $($file.name)"
  }
  if($AgeExePath -and $AgeKeygenPath){
    $toolRoot=Join-Path $root 'tool-content';$toolResult=New-Phase7BWP2CToolingContent $PSScriptRoot $AgeExePath $AgeKeygenPath $toolRoot
    Assert-True ($toolResult.manifestIdentity.sha256 -ceq $b.toolingManifestSha256) 'tooling content uses source manifest'
    $iso=Join-Path $root 'synthetic-tools.iso';$isoId=New-Phase7BWP2COpticalImage $toolRoot 'P7B_C_TOOLS' $iso
    Assert-True ($isoId.bytes -gt 0) 'real disposable tooling ISO built without mounting'
  }
  $result=[ordered]@{classification='PHASE7B_WP2C_READINESS_SYNTHETIC_PASS';pass=$true;assertions=$script:assertions;vmBooted=$false;liveAuthorizationCreated=$false;realIdentityUsed=$false;wp2cExecuted=$false;actualVmwareIdentityEntryTestPerformed=$false}
} finally {
  if(Test-Path -LiteralPath $root){$resolved=(Resolve-Path -LiteralPath $root).Path;if($resolved.StartsWith((Join-Path $repo '.tmp\wp2c-synthetic-'),[StringComparison]::OrdinalIgnoreCase)){Remove-Item -LiteralPath $resolved -Recurse -Force}}
}
$result|ConvertTo-Json -Compress
