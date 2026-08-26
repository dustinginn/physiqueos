Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bIsolatedGuestContract.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CContract.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CGuest.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2Contract.psm1')

function Get-Phase7BWP2COpticalSlots {
  param([hashtable]$Vmx)
  # Count physical/unsupported optical attachments too; never hide a third
  # device merely because it is not one of the two approved image devices.
  @($Vmx.Keys|Where-Object {
    ($_ -match '^(sata|ide|scsi|nvme)\d+:\d+\.devicetype$' -and [string]$Vmx[$_] -match '^cdrom-') -or
    ($_ -match '^(sata|ide|scsi|nvme)\d+:\d+\.filename$' -and [string]$Vmx[$_] -match '\.iso$')
  }|ForEach-Object {$_ -replace '\.(devicetype|filename)$',''}|Sort-Object -Unique)
}

function Read-Phase7BWP2COpticalVmx {
  param([string]$LiteralPath)
  $before=Get-Phase7BSha256 -LiteralPath $LiteralPath
  $vmx=Read-Phase7BVmx $LiteralPath
  $slots=@(Get-Phase7BWP2COpticalSlots $vmx);$seen=@{}
  # The shared legacy reader retains the last duplicate. A semantic binding
  # must never let a duplicate security setting become an order-dependent value.
  foreach($line in Get-Content -LiteralPath $LiteralPath){
    if($line -match '^\s*(?:#.*)?$'){continue}
    Assert-Phase7BWP2C ($line -match '^\s*([^#][^=]*?)\s*=\s*"([^"\r\n]*)"\s*$') 'VMX_MALFORMED_ASSIGNMENT'
    $key=$matches[1].Trim().ToLowerInvariant()
    Assert-Phase7BWP2C (-not $seen.ContainsKey($key)) 'VMX_DUPLICATE_ASSIGNMENT'
    $seen[$key]=$true
  }
  Assert-Phase7BWP2C ((Get-Phase7BSha256 -LiteralPath $LiteralPath) -ceq $before) 'OPTICAL_VMX_CHANGED'
  $vmx
}

function Get-Phase7BWP2CVmxSemanticPolicy {
  # Explicit field ownership. Known VMware runtime/serialization values may
  # change when Workstation saves an otherwise equivalent powered-off VMX; only
  # their narrowly defined presence contract is authoritative. Every other
  # recognized field is hashed, and every unrecognized field fails closed.
  [pscustomobject][ordered]@{
    schemaVersion=2
    mode='wp2c-semantic-vmx-v2'
    ignoredExact=@(
      'cleanshutdown','softpoweroff','guestinfo.detailed.data',
      'toolsinstallmanager.lastinstallerror','toolsinstallmanager.updatecounter',
      'vm.lastpowerrequesttimestamp','monitor.phys_bits_used','vmxstats.filename',
      'encryption.data','encryption.keysafe'
    )
    ignoredPatterns=@('^numa\.autosize\.','^vmotion\.')
    boundPatterns=@(
      '^\.encoding$','^config\.version$','^virtualhw\.(?:version|productcompatibility)$',
      '^displayname$','^guestos$','^firmware$','^uefi\.secureboot\.enabled$',
      '^(?:numvcpus|memsize|mem\.hotadd|cpuid\.corespersocket)$',
      '^(?:uuid\.(?:bios|location)|encryptedvm\.guid|vm\.createdate|vm\.genid|vm\.genidx|vmx\.encryptiontype)$',
      '^(?:nvram|extendedconfigfile)$','^vtpm\.(?:present|ekcrt|ekcsr)$','^managedvm\.autoaddvtpm$',
      '^ethernet0\.(?:present|connectiontype|startconnected|virtualdev|addresstype|generatedaddress|generatedaddressoffset|pcislotnumber)$',
      '^isolation\.tools\.(?:copy|paste|dnd|hgfsserverset)\.disable$','^sharedfolder\.maxnum$',
      '^usb\.restrictions\.defaultallow$','^(?:usb|usb_xhci|ehci)\.(?:present|pcislotnumber)$',
      '^usb_xhci:\d+\.(?:present|devicetype|parent|port)$','^floppy0\.present$',
      '^(?:nvme|scsi|sata|ide)\d+\.(?:present|pcislotnumber|virtualdev|subnqnuuid)$',
      '^(?:nvme|scsi|sata|ide)\d+:\d+\.(?:present|filename|redo|devicetype|startconnected)$',
      '^pcibridge\d+\.(?:present|pcislotnumber|virtualdev|functions)$','^vmci0\.(?:present|id)$',
      '^(?:sound\.(?:present|autodetect|filename|virtualdev|pcislotnumber)|sensor\.location|hpet0\.present)$',
      '^mks\.enable3d$','^svga\.(?:graphicsmemorykb|guestbackedprimaryaware|vramsize)$',
      '^tools\.(?:capability\.verifiedsamltoken|remindinstall|synctime)$',
      '^powertype\.(?:poweroff|poweron|reset|suspend)$'
    )
  }
}

function Test-Phase7BWP2CVmxPolicyKey {
  param([string]$Key,$Policy)
  if($Key -cin @($Policy.ignoredExact)){return 'ignored'}
  foreach($pattern in @($Policy.ignoredPatterns)){if($Key -cmatch $pattern){return 'ignored'}}
  foreach($pattern in @($Policy.boundPatterns)){if($Key -cmatch $pattern){return 'bound'}}
  'unknown'
}

function Get-Phase7BWP2COpticalConnection {
  param([hashtable]$Vmx,[string]$Slot)
  Assert-Phase7BWP2C ($Slot -cmatch '^(sata|ide)\d+:\d+$' -and
    $Vmx[$Slot+'.devicetype'] -ceq 'cdrom-image' -and $Vmx[$Slot+'.present'] -ceq 'TRUE' -and
    $Vmx.ContainsKey($Slot+'.filename') -and [string]$Vmx[$Slot+'.filename'] -match '^.+\.iso$') 'OPTICAL_SLOT_POLICY'
  $key=$Slot+'.startconnected'
  $explicit=$Vmx.ContainsKey($key)
  if($explicit){Assert-Phase7BWP2C ($Vmx[$key] -is [string] -and $Vmx[$key] -cin @('TRUE','FALSE')) 'OPTICAL_START_CONNECTED_VALUE'}
  # VMware CD/DVD startConnected defaults to TRUE when omitted; present image
  # device context above is mandatory. No default is applied to NICs or disks.
  # Vendor explanation: Darius Davis, VMware Workstation forum, 2013-09-29,
  # thread e805adfb-9291-48a8-ada2-525494421e57 (linked in readiness design).
  [pscustomobject]@{slot=$Slot;startConnected=if($explicit){$Vmx[$key] -ceq 'TRUE'}else{$true};representation=if($explicit){'EXPLICIT_'+$Vmx[$key]}else{'OMITTED_IMAGE_DEFAULT_TRUE'}}
}

function Get-Phase7BWP2CVmxIdentity {
  param([hashtable]$Vmx)
  $policy=Get-Phase7BWP2CVmxSemanticPolicy
  $slots=@(Get-Phase7BWP2COpticalSlots $Vmx)
  Assert-Phase7BWP2C ($slots.Count -eq 2) 'TWO_READONLY_OPTICAL_SLOTS_REQUIRED'
  Assert-Phase7BWP2C (Test-Phase7BVmxContract $Vmx).pass 'VM_SEMANTIC_CONTRACT'
  Assert-Phase7BWP2C ($Vmx['ethernet0.present'] -ceq 'TRUE' -and $Vmx['ethernet0.startconnected'] -ceq 'FALSE') 'VM_SEMANTIC_NETWORK'
  Assert-Phase7BWP2C (@($Vmx.Keys|Where-Object {$_ -cmatch '^ethernet[1-9][0-9]*\.'}).Count -eq 0) 'VM_SEMANTIC_EXTRA_NIC'
  $diskKeys=@($Vmx.Keys|Where-Object {$_ -cmatch '^(?:nvme|scsi|sata|ide)\d+:\d+\.filename$' -and [string]$Vmx[$_] -cmatch '(?i)\.vmdk$'})
  Assert-Phase7BWP2C ($diskKeys.Count -eq 1) 'VM_SEMANTIC_SINGLE_DISK'
  $diskSlot=$diskKeys[0].Substring(0,$diskKeys[0].Length-'.filename'.Length)
  Assert-Phase7BWP2C ($Vmx[$diskSlot+'.present'] -ceq 'TRUE') 'VM_SEMANTIC_DISK_PRESENT'
  $encryptionKeys=@($Vmx.Keys|Where-Object {$_ -cmatch '^encryption\.'})
  Assert-Phase7BWP2C (@(Compare-Object @('encryption.data','encryption.keysafe') @($encryptionKeys|Sort-Object)).Count -eq 0 -or $encryptionKeys.Count -eq 0) 'VM_SEMANTIC_ENCRYPTION_FIELDS'
  if($encryptionKeys.Count -eq 2){
    Assert-Phase7BWP2C (-not [string]::IsNullOrWhiteSpace([string]$Vmx['encryption.data']) -and -not [string]::IsNullOrWhiteSpace([string]$Vmx['encryption.keysafe'])) 'VM_SEMANTIC_ENCRYPTION_FIELDS'
  }
  $bound=[ordered]@{}
  $ignored=New-Object 'Collections.Generic.List[string]'
  foreach($key in @($Vmx.Keys|Sort-Object)){
    $ownership=Test-Phase7BWP2CVmxPolicyKey ([string]$key) $policy
    Assert-Phase7BWP2C ($ownership -cne 'unknown') 'VM_SEMANTIC_UNKNOWN_FIELD'
    if($ownership -ceq 'ignored'){$ignored.Add([string]$key);continue}
    $bound[$key]=[string]$Vmx[$key]
  }
  foreach($slot in $slots){
    [void](Get-Phase7BWP2COpticalConnection $Vmx $slot)
    $bound[$slot+'.filename']='<EXACT_PHASE_MEDIA_VERIFIED_SEPARATELY>'
    $bound[$slot+'.startconnected']='<EXACT_PHASE_CONNECTION_VERIFIED_SEPARATELY>'
  }
  $projection=[pscustomobject][ordered]@{
    schemaVersion=2;mode=$policy.mode;securityRelevant=$bound
    encryptedConfiguration=if($encryptionKeys.Count -eq 2){'PRESENT'}else{'ABSENT'}
  }
  [pscustomobject]@{schemaVersion=2;mode=$policy.mode;sha256=Get-Phase7BWP2CObjectHash $projection;opticalSlots=$slots;ignoredFields=@($ignored);projection=$projection}
}

function Assert-Phase7BWP2CPreparationBootMedia {
  param([hashtable]$Vmx,[string]$ToolingMediaPath,[string]$PreparationMediaPath)
  $identity=Get-Phase7BWP2CVmxIdentity $Vmx
  $expected=@(Assert-Phase7BWP2CLocalPath $ToolingMediaPath)
  if($PreparationMediaPath){$expected+=@(Assert-Phase7BWP2CLocalPath $PreparationMediaPath);Assert-Phase7BWP2C ($expected[0] -cne $expected[1]) 'PREPARATION_MEDIA_DISTINCT'}
  $actual=@(foreach($slot in $identity.opticalSlots){
    $path=Assert-Phase7BWP2CLocalPath ([string]$Vmx[$slot+'.filename'])
    # Even a disconnected spare slot may contain only approved preparation
    # media. Baseline: both name tooling, exactly one connected. Second boot:
    # tooling + preparation control, both connected. Never a recovery ISO.
    Assert-Phase7BWP2C ($path -cin $expected) 'PREPARATION_BOOT_MEDIA'
    if((Get-Phase7BWP2COpticalConnection $Vmx $slot).startConnected){$path}
  })
  Assert-Phase7BWP2C ($actual.Count -eq $expected.Count -and @(Compare-Object @($expected|Sort-Object) @($actual|Sort-Object)).Count -eq 0) 'PREPARATION_BOOT_MEDIA'
}

function Get-Phase7BWP2CExpectedGuestIdentity {
  param([hashtable]$Vmx)
  # VMware uuid.bios is the SMBIOS byte sequence. Guid(byte[]) applies the
  # SMBIOS/Windows UUID field byte order; never bind the host's own UUID here.
  $hex=([string]$Vmx['uuid.bios']) -replace '[ -]',''
  Assert-Phase7BWP2C ($hex -cmatch '^[0-9a-fA-F]{32}$') 'VM_GUEST_UUID'
  $bytes=New-Object byte[] 16
  for($i=0;$i -lt 16;$i++){$bytes[$i]=[Convert]::ToByte($hex.Substring($i*2,2),16)}
  $uuid=New-Object Guid(,$bytes)
  Get-Phase7BWP2CObjectHash $uuid.ToString().ToLowerInvariant()
}

function Get-Phase7BWP2CPreparationRam {
  $os=Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
  $available=[int64]$os.FreePhysicalMemory*1024
  [pscustomobject][ordered]@{classification=if($available -ge 7GB){'PHASE7B_WP2C_PREBOOT_RAM_PASS'}else{'PHASE7B_WP2C_PREBOOT_RAM_FAIL'};pass=($available -ge 7GB);availableBytes=$available;requiredBytes=[int64]7GB;availableGiB=[math]::Round($available/1GB,2);requiredGiB=7;vmBooted=$false;mutationPerformed=$false}
}

function Assert-Phase7BWP2CBootMedia {
  param([hashtable]$Vmx,[string]$VmxPath,[string]$RecoveryMediaPath,[string]$ControlMediaPath,$Bindings,[string]$ControlMediaSha256)
  $identity=Get-Phase7BWP2CVmxIdentity $Vmx
  Assert-Phase7BWP2C ($identity.sha256 -ceq $Bindings.vmConfigSha256) 'BOOT_VM_CONFIG'
  $expected=@([IO.Path]::GetFullPath($RecoveryMediaPath),[IO.Path]::GetFullPath($ControlMediaPath))
  Assert-Phase7BWP2C ($expected[0] -cne $expected[1]) 'BOOT_MEDIA_DISTINCT'
  $actual=@(foreach($slot in $identity.opticalSlots){
    Assert-Phase7BWP2C (Get-Phase7BWP2COpticalConnection $Vmx $slot).startConnected 'BOOT_MEDIA_NOT_CONNECTED'
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
  $vmx=Read-Phase7BWP2COpticalVmx $VmxPath;$fixed=Get-Phase7BIsolatedGuestContract
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

function New-Phase7BWP2CPreparationEntryEvidence {
  param($Plan,$Returned,$FounderReview)
  Assert-Phase7BWP2CPreparationPlan $Plan
  Assert-Phase7BWP2CPreparationReturnShape $Returned
  $r=$FounderReview;$b=$Plan.bindings
  $manual=@('wrongFieldTestPass','guestFocusLossTestPass','hostFocusChangeTestPass','minimizationTestPass','cancellationTestPass','interruptionTestPass','canaryTestPass','noToolingSecretFileWrites','noTotp','automaticSubmissionDisabled')
  Assert-Phase7BWP2CExactProperties $r (@('schemaVersion','kind','preparedStateId','onePasswordVersion','vmwareVersion','clipboardSequenceBefore','clipboardSequenceAfter','founderReviewed','realIdentityUsed','invalidSyntheticValueOnly','unexpectedDestinationInput','reviewedAt')+$manual)
  Assert-Phase7BWP2C ($r.schemaVersion -eq 1 -and $r.kind -ceq 'wp2c-preparation-founder-review' -and $r.preparedStateId -ceq $b.preparedStateId) 'PREPARATION_FOUNDER_REVIEW'
  foreach($name in ($manual+@('founderReviewed','invalidSyntheticValueOnly'))){Assert-Phase7BWP2CBoolean $r.$name $true 'PREPARATION_FOUNDER_REVIEW'}
  foreach($name in @('realIdentityUsed','unexpectedDestinationInput')){Assert-Phase7BWP2CBoolean $r.$name $false 'PREPARATION_FOUNDER_REVIEW'}
  foreach($name in @('clipboardSequenceBefore','clipboardSequenceAfter')){Assert-Phase7BWP2C ($r.$name -is [ValueType] -and [long]$r.$name -ge 0 -and [long]$r.$name -le [uint32]::MaxValue) 'PREPARATION_CLIPBOARD_OBSERVATION'}
  Assert-Phase7BWP2C ($r.clipboardSequenceBefore -eq $r.clipboardSequenceAfter) 'PREPARATION_CLIPBOARD_CHANGED'
  foreach($name in @('onePasswordVersion','vmwareVersion')){Assert-Phase7BWP2C ($r.$name -cmatch '^[0-9][0-9A-Za-z. ()-]{0,79}$') 'PREPARATION_REVIEW_VERSION'}
  [void][datetimeoffset]::Parse($r.reviewedAt)
  $entry=[ordered]@{schemaVersion=1;kind='wp2c-synthetic-entry-validation';method=$b.identityEntryMethod;guestIdentitySha256=$b.guestIdentitySha256;toolingManifestSha256=$b.toolingManifestSha256
    invalidSyntheticValueOnly=$true;firstFieldExact=$Returned.syntheticObservations[0].dialog.firstFieldExact;secondFieldExact=$Returned.syntheticObservations[0].dialog.secondFieldExact
    hostClipboardUnchanged=$true;guestClipboardUnchanged=(@($Returned.syntheticObservations|Where-Object {-not $_.guestClipboardSequenceUnchanged}).Count -eq 0)
    realIdentityUsed=$false;unexpectedDestinationInput=$false;universalFocusGuarantee=$false;founderReviewed=$true
    onePasswordVersion=$r.onePasswordVersion;vmwareVersion=$r.vmwareVersion;guestDialogVersion=$b.toolingManifestSha256;testedAt=$r.reviewedAt
  }
  foreach($name in $manual){$entry[$name]=$r.$name}
  Assert-Phase7BWP2CEntryValidation ([pscustomobject]$entry) $b
  [pscustomobject]$entry
}

function New-Phase7BWP2CPreparationHandoffEvidence {
  param($Plan,$Returned,$FounderReview,$HostObservation,$PreparationMedia,$PreparationDescriptor)
  Assert-Phase7BWP2CPreparationPlan $Plan
  Assert-Phase7BWP2CPreparationReturnShape $Returned
  Assert-Phase7BWP2C ($Returned.preparedStateId -ceq $Plan.bindings.preparedStateId -and
    $Returned.plan.sha256 -ceq (Get-Phase7BWP2CObjectHash $Plan) -and $Returned.plan.bytes -eq [Text.Encoding]::UTF8.GetByteCount((ConvertTo-Phase7BCanonicalJson $Plan)) -and
    $Returned.preparationControlDescriptor.sha256 -ceq $PreparationDescriptor.sha256 -and $Returned.preparationControlDescriptor.bytes -eq $PreparationDescriptor.bytes) 'PREPARATION_RETURN_BINDING'
  Assert-Phase7BWP2C ($PreparationMedia.sha256 -cmatch '^[0-9a-f]{64}$' -and [int64]$PreparationMedia.bytes -gt 0) 'PREPARATION_MEDIA_IDENTITY'
  $entry=New-Phase7BWP2CPreparationEntryEvidence $Plan $Returned $FounderReview
  $b=ConvertTo-Phase7BCanonicalJson $Plan.bindings|ConvertFrom-Json
  $b|Add-Member NoteProperty identityEntryValidationSha256 (Get-Phase7BWP2CObjectHash $entry)
  $p=New-Phase7BWP2CPreparationEvidence $b $HostObservation $Returned.report $entry -FounderReviewed
  $handoff=[pscustomobject][ordered]@{
    schemaVersion=1;plan=$Returned.plan;preparationControlMedia=$PreparationMedia;preparationControlDescriptor=$PreparationDescriptor
    toolingMedia=$b.toolingMedia;returnSha256=Get-Phase7BWP2CObjectHash $Returned;founderReviewSha256=Get-Phase7BWP2CObjectHash $FounderReview
    reportIdentity=$Returned.reportIdentity;realIdentityUsed=$false;invalidSyntheticValueOnly=$true
  }
  $p|Add-Member NoteProperty preparationHandoff $handoff
  [pscustomobject]@{preparation=$p;entry=$entry;report=$Returned.report}
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
