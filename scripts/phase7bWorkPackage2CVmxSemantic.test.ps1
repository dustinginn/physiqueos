[CmdletBinding()]
param([string]$ActualVmxPath,[string]$ExpectedToolingPath)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
if($PSVersionTable.PSEdition -cne 'Desktop' -or $PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1){throw 'WINDOWS_PS51_REQUIRED'}
. (Join-Path $PSScriptRoot 'phase7bWorkPackage2Finalization.test.ps1') -FixturesOnly
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CContract.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CHost.psm1') -Force
function Reject([scriptblock]$Action,[string]$Label){$failed=$false;try{& $Action|Out-Null}catch{$failed=$true};Assert-True $failed $Label}
function Save-Vmx([hashtable]$Value,[string]$Path){[IO.File]::WriteAllLines($Path,@(foreach($key in @($Value.Keys|Sort-Object)){$key+' = "'+$Value[$key]+'"'}))}
$root=Join-Path ([IO.Path]::GetTempPath()) ('vs-'+[guid]::NewGuid().ToString('N').Substring(0,8))
try {
  [void](New-Item -ItemType Directory -Path $root)
  $fixed=Get-Phase7BIsolatedGuestContract;$vmxPath=Join-Path $root 'semantic.vmx'
  $v=@{'displayname'=$fixed.vmDisplayName;'uuid.bios'='56 4d 29 d3 c2 39 b8 6b-4b e4 ce 8c a3 00 80 a4';'memsize'='4096';'numvcpus'='2';'firmware'='efi';'uefi.secureboot.enabled'='TRUE';'guestos'='windows11-64';'managedvm.autoaddvtpm'='software';'ethernet0.present'='TRUE';'ethernet0.connectiontype'='nat';'ethernet0.startconnected'='FALSE';'isolation.tools.copy.disable'='TRUE';'isolation.tools.paste.disable'='TRUE';'isolation.tools.dnd.disable'='TRUE';'isolation.tools.hgfsserverset.disable'='TRUE';'sharedfolder.maxnum'='0';'usb.restrictions.defaultallow'='FALSE';'scsi0:0.filename'='synthetic.vmdk';'scsi0:0.present'='TRUE';'sata0:0.devicetype'='cdrom-image';'sata0:0.present'='TRUE';'sata0:0.filename'='tooling.iso';'sata0:0.startconnected'='FALSE';'sata0:1.devicetype'='cdrom-image';'sata0:1.present'='TRUE';'sata0:1.filename'='tooling.iso'}
  Save-Vmx $v $vmxPath;$parsed=Read-Phase7BWP2COpticalVmx $vmxPath;$identity=Get-Phase7BWP2CVmxIdentity $parsed
  Assert-True ($identity.schemaVersion -eq 2 -and $identity.mode -ceq 'wp2c-semantic-vmx-v2') 'semantic v2 source classification'
  $benign=$v.Clone();$benign['guestinfo.detailed.data']='runtime-a';$benign['vm.lastpowerrequesttimestamp']='111';$benign['vmotion.checkpointfbsize']='123';$benign['encryption.data']='opaque-a';$benign['encryption.keysafe']='opaque-b'
  $benignId=Get-Phase7BWP2CVmxIdentity $benign
  $benignChanged=$benign.Clone();$benignChanged['guestinfo.detailed.data']='runtime-b';$benignChanged['vm.lastpowerrequesttimestamp']='222';$benignChanged['vmotion.checkpointfbsize']='456';$benignChanged['encryption.data']='opaque-c';$benignChanged['encryption.keysafe']='opaque-d'
  Assert-True ((Get-Phase7BWP2CVmxIdentity $benignChanged).sha256 -ceq $benignId.sha256) 'enumerated benign serialization changes preserve semantic identity'
  Assert-True ($identity.sha256 -cne $benignId.sha256) 'encrypted-configuration presence remains semantically bound'
  $optical=$v.Clone();$optical['sata0:0.filename']='current-tooling.iso';$optical['sata0:1.filename']='preparation.iso';$optical['sata0:0.startconnected']='TRUE';$optical['sata0:1.startconnected']='TRUE'
  Assert-True ((Get-Phase7BWP2CVmxIdentity $optical).sha256 -ceq $identity.sha256) 'phase-specific optical path and connection values are projected separately'
  foreach($change in @(
    @('displayname','wrong-vm'),@('memsize','2048'),@('numvcpus','4'),@('firmware','bios'),@('uefi.secureboot.enabled','FALSE'),
    @('isolation.tools.copy.disable','FALSE'),
    @('isolation.tools.paste.disable','FALSE'),@('isolation.tools.dnd.disable','FALSE'),
    @('isolation.tools.hgfsserverset.disable','FALSE'),@('sharedfolder.maxnum','1')
  )){$bad=$v.Clone();$bad[$change[0]]=$change[1];Reject {Get-Phase7BWP2CVmxIdentity $bad} ('reject security change '+$change[0])}
  foreach($change in @(@('uuid.bios','00 00 00 00 00 00 00 00-00 00 00 00 00 00 00 00'),@('scsi0:0.filename','wrong.vmdk'))){$bad=$v.Clone();$bad[$change[0]]=$change[1];Assert-True ((Get-Phase7BWP2CVmxIdentity $bad).sha256 -cne $identity.sha256) ('bind security change '+$change[0])}
  $bad=$v.Clone();$bad['ethernet0.startconnected']='TRUE';Reject {Get-Phase7BWP2CVmxIdentity $bad} 'connected NIC rejected'
  $bad=$v.Clone();$bad['ethernet1.present']='TRUE';Reject {Get-Phase7BWP2CVmxIdentity $bad} 'extra NIC rejected'
  $bad=$v.Clone();$bad['scsi0:1.filename']='extra.vmdk';$bad['scsi0:1.present']='TRUE';Reject {Get-Phase7BWP2CVmxIdentity $bad} 'extra disk rejected'
  $bad=$v.Clone();$bad['sata0:2.filename']='third.iso';$bad['sata0:2.present']='TRUE';$bad['sata0:2.devicetype']='cdrom-image';Reject {Get-Phase7BWP2CVmxIdentity $bad} 'third optical rejected'
  $bad=$v.Clone();$bad.Remove('sata0:1.filename');Reject {Get-Phase7BWP2CVmxIdentity $bad} 'missing optical rejected'
  $bad=$v.Clone();$bad['unexpected.security.setting']='TRUE';Reject {Get-Phase7BWP2CVmxIdentity $bad} 'unknown field rejected'
  $bad=$v.Clone();$bad['encryption.data']='only-one';Reject {Get-Phase7BWP2CVmxIdentity $bad} 'partial encryption observation rejected'
  Save-Vmx $v $vmxPath;Add-Content -LiteralPath $vmxPath -Value 'memsize = "4096"';Reject {Read-Phase7BWP2COpticalVmx $vmxPath} 'duplicate assignment rejected'
  Save-Vmx $v $vmxPath;Add-Content -LiteralPath $vmxPath -Value 'malformed vmx text';Reject {Read-Phase7BWP2COpticalVmx $vmxPath} 'malformed assignment rejected'
  if($ActualVmxPath){
    $before=Get-Phase7BWP2CIdentity $ActualVmxPath;$actual=Read-Phase7BWP2COpticalVmx $ActualVmxPath;$actualId=Get-Phase7BWP2CVmxIdentity $actual;$after=Get-Phase7BWP2CIdentity $ActualVmxPath
    Assert-True ((Get-Phase7BWP2CObjectHash $before) -ceq (Get-Phase7BWP2CObjectHash $after)) 'actual stopped VMX remains byte-identical'
    Assert-True ($actualId.mode -ceq 'wp2c-semantic-vmx-v2' -and $actual['ethernet0.startconnected'] -ceq 'FALSE') 'actual stopped VM semantic projection passes offline contract'
    if($ExpectedToolingPath){Assert-Phase7BWP2CPreparationBootMedia $actual $ExpectedToolingPath;Assert-True $true 'actual first-boot optical projection remains exact'}
  }
  $result=[ordered]@{classification='PHASE7B_WP2C_VMX_SEMANTIC_TESTS_PASS';pass=$true;assertions=$script:assertions;actualVmxChecked=[bool]$ActualVmxPath;vmMutationPerformed=$false;wp2cExecuted=$false}
}finally{
  if(Test-Path -LiteralPath $root){$resolved=(Resolve-Path -LiteralPath $root).Path;if((Split-Path -Parent $resolved) -cne ([IO.Path]::GetTempPath().TrimEnd('\')) -or (Split-Path -Leaf $resolved) -cnotmatch '^vs-[0-9a-f]{8}$'){throw 'SYNTHETIC_CLEANUP_BOUNDARY'};Remove-Item -LiteralPath $resolved -Recurse -Force}
}
$result|ConvertTo-Json -Compress
