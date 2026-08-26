Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bIsolatedGuestContract.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CContract.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CGuest.psm1')

function Get-Phase7BWP2CVmxIdentity {
  param([hashtable]$Vmx)
  $slots=@($Vmx.Keys|Where-Object {$_ -match '^(sata|ide)\d+:\d+\.devicetype$' -and [string]$Vmx[$_] -ceq 'cdrom-image'}|ForEach-Object {$_ -replace '\.devicetype$',''}|Sort-Object)
  Assert-Phase7BWP2C ($slots.Count -eq 2) 'TWO_READONLY_OPTICAL_SLOTS_REQUIRED'
  $projection=[ordered]@{}
  foreach($key in @($Vmx.Keys|Sort-Object)){$projection[$key]=[string]$Vmx[$key]}
  foreach($slot in $slots){
    Assert-Phase7BWP2C ($Vmx[$slot+'.present'] -ceq 'TRUE' -and $Vmx[$slot+'.startconnected'] -in @('TRUE','FALSE') -and $Vmx.ContainsKey($slot+'.filename')) 'OPTICAL_SLOT_POLICY'
    $projection[$slot+'.filename']='<EXACT_MEDIA_VERIFIED_SEPARATELY>'
    $projection[$slot+'.startconnected']='<MUST_BE_TRUE_AT_BOOT_PERMIT>'
  }
  [pscustomobject]@{mode='wp2c-offline-optical-projection-v1';sha256=Get-Phase7BWP2CObjectHash $projection;opticalSlots=$slots}
}

function Assert-Phase7BWP2CBootMedia {
  param([hashtable]$Vmx,[string]$VmxPath,[string]$RecoveryMediaPath,[string]$ControlMediaPath,$Bindings,[string]$ControlMediaSha256)
  $identity=Get-Phase7BWP2CVmxIdentity $Vmx
  Assert-Phase7BWP2C ($identity.sha256 -ceq $Bindings.vmConfigSha256) 'BOOT_VM_CONFIG'
  $expected=@([IO.Path]::GetFullPath($RecoveryMediaPath),[IO.Path]::GetFullPath($ControlMediaPath))
  Assert-Phase7BWP2C ($expected[0] -cne $expected[1]) 'BOOT_MEDIA_DISTINCT'
  $actual=@(foreach($slot in $identity.opticalSlots){
    Assert-Phase7BWP2C ($Vmx[$slot+'.startconnected'] -ceq 'TRUE') 'BOOT_MEDIA_NOT_CONNECTED'
    $path=[string]$Vmx[$slot+'.filename'];if(-not [IO.Path]::IsPathRooted($path)){$path=Join-Path (Split-Path -Parent $VmxPath) $path}
    Assert-Phase7BWP2CLocalPath $path
  })
  Assert-Phase7BWP2C (@(Compare-Object @($expected|Sort-Object) @($actual|Sort-Object)).Count -eq 0) 'BOOT_MEDIA_PATH'
  Assert-Phase7BWP2CFile $RecoveryMediaPath $Bindings.restoreMedia
  Assert-Phase7BWP2C ((Get-Phase7BWP2CIdentity $ControlMediaPath).sha256 -ceq $ControlMediaSha256) 'BOOT_CONTROL_MEDIA_HASH'
}

function Test-Phase7BWP2CHostObservation {
  param($Observation,$Bindings)
  $o=$Observation;$b=$Bindings
  [pscustomobject]@{pass=($o.hostIdentitySha256 -ceq $b.hostIdentitySha256 -and $o.vmConfigSha256 -ceq $b.vmConfigSha256 -and $o.snapshotSha256 -ceq $b.snapshotSha256 -and $o.availableMemoryBytes -ge 7GB -and $o.freeDiskBytes -ge 120GB -and $o.poweredOff -ceq $true -and $o.vmContractPass -ceq $true -and $o.nicStartConnected -ceq $false -and $o.clipboardDisabled -ceq $true -and $o.dragDropDisabled -ceq $true -and $o.sharedFoldersDisabled -ceq $true -and $o.memorySnapshotPresent -ceq $false)}
}

function Get-Phase7BWP2CHostObservation {
  param([string]$VmxPath,[string]$SnapshotMetadataPath)
  [void](Assert-Phase7BWP2CLocalPath $VmxPath)
  [void](Assert-Phase7BWP2CLocalPath $SnapshotMetadataPath (Split-Path -Parent $VmxPath))
  $vmx=Read-Phase7BVmx $VmxPath;$fixed=Get-Phase7BIsolatedGuestContract
  foreach($key in @($vmx.Keys|Where-Object {$_ -match '^(scsi|sata|nvme|ide)\d+:\d+\.filename$' -and [string]$vmx[$_] -match '\.vmdk$'})) {
    [void](Assert-Phase7BWP2CLocalPath (Join-Path (Split-Path -Parent $VmxPath) ([string]$vmx[$key])) (Split-Path -Parent $VmxPath))
  }
  $storage=Test-Phase7BVmdkContract -Vmx $vmx -VmxPath $VmxPath -Contract $fixed
  Assert-Phase7BWP2C ($storage.pass -and $storage.opticalAttachmentCount -le 2) 'VM_STORAGE_CONTRACT'
  Assert-Phase7BWP2C (@($vmx.Keys|Where-Object {$_ -match '^ethernet[1-9][0-9]*\.present$' -and [string]$vmx[$_] -eq 'TRUE'}).Count -eq 0) 'EXTRA_VM_NIC'
  $os=Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
  $computer=Get-CimInstance Win32_ComputerSystemProduct -ErrorAction Stop
  $disk=Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'" -ErrorAction Stop
  $processes=@(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object {$_.Name -eq 'vmware-vmx.exe'})
  # Conservatively refuse any running VMware VM. No vmrun power command is present.
  $snapshots=Read-Phase7BVmx $SnapshotMetadataPath
  $current=[string]$snapshots['snapshot.current']
  $currentNames=@(foreach($key in @($snapshots.Keys)){if($key -match '^snapshot\d+\.uid$' -and [string]$snapshots[$key] -ceq $current){$snapshots[$key.Replace('.uid','.displayname')]}})
  Assert-Phase7BWP2C ($currentNames.Count -eq 1 -and $currentNames[0] -ceq 'S1-physiqueos-bootstrap-inert') 'S1_LINEAGE_REQUIRED'
  [pscustomobject][ordered]@{
    hostIdentitySha256=Get-Phase7BWP2CObjectHash ([string]$computer.UUID).ToLowerInvariant()
    vmConfigSha256=(Get-Phase7BWP2CVmxIdentity $vmx).sha256;rawVmxSha256=Get-Phase7BSha256 -LiteralPath $VmxPath;snapshotSha256=Get-Phase7BSha256 -LiteralPath $SnapshotMetadataPath
    availableMemoryBytes=[int64]$os.FreePhysicalMemory*1024;freeDiskBytes=[int64]$disk.FreeSpace
    poweredOff=($processes.Count -eq 0);vmContractPass=(Test-Phase7BVmxContract $vmx $fixed).pass
    nicStartConnected=($vmx['ethernet0.startconnected'] -cne 'FALSE')
    clipboardDisabled=($vmx['isolation.tools.copy.disable'] -ceq 'TRUE' -and $vmx['isolation.tools.paste.disable'] -ceq 'TRUE')
    dragDropDisabled=($vmx['isolation.tools.dnd.disable'] -ceq 'TRUE')
    sharedFoldersDisabled=($vmx['isolation.tools.hgfsserverset.disable'] -ceq 'TRUE' -and $vmx['sharedfolder.maxnum'] -ceq '0')
    memorySnapshotPresent=(@(Get-ChildItem -LiteralPath (Split-Path -Parent $VmxPath) -Filter '*.vmss' -File -ErrorAction Stop).Count -gt 0)
  }
}

function Assert-Phase7BWP2CPreparation {
  param($Preparation,$Bindings)
  $p=$Preparation;$b=$Bindings
  Assert-Phase7BWP2C ($p.schemaVersion -eq 1 -and $p.kind -ceq 'wp2c-preparation' -and $p.preparedStateId -ceq $b.preparedStateId -and $p.guestIdentitySha256 -ceq $b.guestIdentitySha256 -and $p.toolingManifestSha256 -ceq $b.toolingManifestSha256 -and $p.snapshotSha256 -ceq $b.snapshotSha256 -and $p.identityEntryValidationSha256 -ceq $b.identityEntryValidationSha256) 'PREPARATION_BINDING'
  foreach($name in @('wp2cExecuted','packetDecrypted','executionClaimCreated','authorizationConsumed')) {Assert-Phase7BWP2C ($p.$name -ceq $false) 'PREPARATION_IS_NOT_EXECUTION'}
  foreach($name in @('guestChecksAccepted','founderReviewed','shutdownVerified','noMemorySnapshot','evaluationAccepted','capacityAccepted')) {Assert-Phase7BWP2C ($p.$name -ceq $true) 'PREPARATION_NOT_ACCEPTED'}
  Assert-Phase7BWP2C (Test-Phase7BWP2CHostObservation $p.hostObservation $b).pass 'PREPARATION_HOST_ISOLATION'
  Assert-Phase7BWP2C (Test-Phase7BWP2CGuestObservation $p.guestObservation $b).pass 'PREPARATION_GUEST_ISOLATION'
}

function New-Phase7BWP2CPreparationEvidence {
  param($Bindings,$HostObservation,$GuestReport,$EntryEvidence,[switch]$FounderReviewed)
  Assert-Phase7BWP2C $FounderReviewed.IsPresent 'PREPARATION_REVIEW_REQUIRED'
  Assert-Phase7BWP2C ($GuestReport.kind -ceq 'wp2c-guest-preparation-observation' -and $GuestReport.schemaVersion -eq 1) 'PREPARATION_GUEST_REPORT'
  foreach($name in @('wp2cExecuted','packetDecrypted','executionClaimCreated','authorizationConsumed')) {Assert-Phase7BWP2CBoolean $GuestReport.$name $false 'PREPARATION_IS_NOT_EXECUTION'}
  Assert-Phase7BWP2CEntryValidation $EntryEvidence $Bindings
  Assert-Phase7BWP2C (Test-Phase7BWP2CGuestObservation $GuestReport.observation $Bindings).pass 'PREPARATION_GUEST_ISOLATION'
  Assert-Phase7BWP2C (Test-Phase7BWP2CHostObservation $HostObservation $Bindings).pass 'PREPARATION_HOST_ISOLATION'
  $p=[pscustomobject][ordered]@{schemaVersion=1;kind='wp2c-preparation';preparedStateId=$Bindings.preparedStateId;guestIdentitySha256=$Bindings.guestIdentitySha256;toolingManifestSha256=$Bindings.toolingManifestSha256;snapshotSha256=$Bindings.snapshotSha256;identityEntryValidationSha256=Get-Phase7BWP2CObjectHash $EntryEvidence;hostObservation=$HostObservation;guestObservation=$GuestReport.observation;guestReportSha256=Get-Phase7BWP2CObjectHash $GuestReport;guestChecksAccepted=$true;founderReviewed=$true;shutdownVerified=$HostObservation.poweredOff;noMemorySnapshot=(-not $HostObservation.memorySnapshotPresent);evaluationAccepted=$true;capacityAccepted=$true;wp2cExecuted=$false;packetDecrypted=$false;executionClaimCreated=$false;authorizationConsumed=$false;recordedAt=[datetime]::UtcNow.ToString('o')}
  Assert-Phase7BWP2CPreparation $p $Bindings
  $p
}

function Test-Phase7BWP2CSnapshotTransition {
  param([ValidateSet('S0','S1','PREPARED','GUEST_PASS','HOST_COMPLETE','S2')][string]$From,[ValidateSet('S0','S1','PREPARED','GUEST_PASS','HOST_COMPLETE','S2')][string]$To,[bool]$PoweredOff,[bool]$IdentityResident,[bool]$AmbiguousMutation)
  # No snapshot or power operation: policy evaluator only. S0/S1 are never overwritten.
  $allowed=@{'S0'=@('S1');'S1'=@('PREPARED');'PREPARED'=@('GUEST_PASS');'GUEST_PASS'=@('HOST_COMPLETE');'HOST_COMPLETE'=@('S2');'S2'=@()}
  [pscustomobject]@{pass=($To -in $allowed[$From] -and -not $IdentityResident -and -not $AmbiguousMutation -and ($To -notin @('PREPARED','S2') -or $PoweredOff));automaticRevertAllowed=$false;restoreReplayAllowed=$false;snapshotMutationPerformed=$false}
}

function New-Phase7BWP2CPassEvidence {
  param($Authorization,[string]$AuthorizationSha256,[string]$HostClaimSha256,[string]$HostBootPermitSha256,[string]$GuestClaimSha256,$VerifiedPacket)
  Assert-Phase7BWP2C ($VerifiedPacket.pass -ceq $true -and $VerifiedPacket.fileCount -gt 0) 'RESTORED_PACKET_NOT_VERIFIED'
  $b=$Authorization.bindings
  [pscustomobject][ordered]@{
    schemaVersion=1;classification='PHASE7B_WP2_ISOLATED_RESTORE_VERIFICATION_PASS_INERT';pass=$true
    authorizationId=$Authorization.authorizationId;authorizationSha256=$AuthorizationSha256
    hostClaimSha256=$HostClaimSha256;hostBootPermitSha256=$HostBootPermitSha256;guestClaimSha256=$GuestClaimSha256
    invocationContractSha256=$Authorization.invocationContractSha256;bindings=$b;bindingsSha256=Get-Phase7BWP2CObjectHash $b
    packetSha256=$b.packet.sha256;plaintextZipSha256=$b.plaintextZip.sha256;plaintextZipBytes=$b.plaintextZip.bytes
    restoreRoot=Join-Path $b.restoreRoot 'packet';restoredFileCount=$VerifiedPacket.fileCount
    sourceInventorySha256=$VerifiedPacket.sourceInventorySha256;referenceIndexSha256=$VerifiedPacket.referenceIndexSha256
    decryptionPass=$true;manifestPass=$true;referenceIndexPass=$true;fileHashesPass=$true;credentialExclusionsPass=$true
    runtimeInertPass=$true;networkIsolationPass=$true;temporaryZipRemoved=$true;completedAt=[datetime]::UtcNow.ToString('o')
    automaticRetryAllowed=$false;wp2cAuthorized=$false;laterMigrationAuthorized=$false;s2Created=$false;hostCloseoutComplete=$false
  }
}

function Assert-Phase7BWP2CPassEvidence {
  param($Evidence,$Authorization,[string]$AuthorizationSha256,[string]$HostClaimSha256)
  $e=$Evidence;$b=$Authorization.bindings
  Assert-Phase7BWP2C ($e.hostBootPermitSha256 -cmatch '^[0-9a-f]{64}$' -and $e.guestClaimSha256 -cmatch '^[0-9a-f]{64}$' -and (Get-Phase7BWP2CObjectHash $e.bindings) -ceq (Get-Phase7BWP2CObjectHash $b)) 'PASS_EVIDENCE_CONTEXT'
  Assert-Phase7BWP2C ($e.schemaVersion -eq 1 -and $e.classification -ceq 'PHASE7B_WP2_ISOLATED_RESTORE_VERIFICATION_PASS_INERT' -and $e.pass -ceq $true -and $e.authorizationId -ceq $Authorization.authorizationId -and $e.authorizationSha256 -ceq $AuthorizationSha256 -and $e.hostClaimSha256 -ceq $HostClaimSha256 -and $e.invocationContractSha256 -ceq $Authorization.invocationContractSha256 -and $e.bindingsSha256 -ceq (Get-Phase7BWP2CObjectHash $b)) 'PASS_EVIDENCE_BINDING'
  Assert-Phase7BWP2C ($e.plaintextZipSha256 -ceq $b.plaintextZip.sha256 -and $e.plaintextZipBytes -eq $b.plaintextZip.bytes -and $e.packetSha256 -ceq $b.packet.sha256 -and $e.restoreRoot -ceq (Join-Path $b.restoreRoot 'packet')) 'PASS_EVIDENCE_CONTENT'
  foreach($name in @('decryptionPass','manifestPass','referenceIndexPass','fileHashesPass','credentialExclusionsPass','runtimeInertPass','networkIsolationPass','temporaryZipRemoved')) {Assert-Phase7BWP2C ($e.$name -ceq $true) 'PASS_EVIDENCE_CHECK'}
  Assert-Phase7BWP2C ($e.automaticRetryAllowed -ceq $false -and $e.wp2cAuthorized -ceq $false -and $e.laterMigrationAuthorized -ceq $false) 'PASS_EVIDENCE_AUTHORITY'
  Assert-Phase7BWP2C ([datetimeoffset]::Parse($e.completedAt) -ge [datetimeoffset]::Parse($Authorization.issuedAt) -and [datetimeoffset]::Parse($e.completedAt) -le [datetimeoffset]::Parse($Authorization.expiresAt)) 'PASS_EVIDENCE_TIME'
}

Export-ModuleMember -Function *-Phase7BWP2C*
