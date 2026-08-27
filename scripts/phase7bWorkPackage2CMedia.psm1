Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bIsolatedGuestContract.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2Contract.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CContract.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CGuest.psm1')

function Assert-Phase7BWP2CExactFileSet {
  param([string]$Root,[string[]]$Names)
  $items=@(Get-ChildItem -LiteralPath $Root -Force -ErrorAction Stop)
  Assert-Phase7BWP2C (@(Compare-Object @($Names | Sort-Object) @($items.Name | Sort-Object)).Count -eq 0 -and @($items | Where-Object {$_.PSIsContainer -or ($_.Attributes -band [IO.FileAttributes]::ReparsePoint)}).Count -eq 0) 'MEDIA_FILE_SET'
}

function New-Phase7BWP2CToolingContent {
  param([string]$SourceDirectory,[string]$AgePath,[string]$AgeKeygenPath,[string]$Destination,$BaselineBinding)
  [void](Assert-Phase7BWP2CLocalPath $Destination)
  Assert-Phase7BWP2C (-not (Test-Path -LiteralPath $Destination)) 'MEDIA_DESTINATION_EXISTS'
  $manifest=Get-Phase7BWP2CDependencyManifest $SourceDirectory
  $ageIdentity=Get-Phase7BWP2CIdentity $AgePath;$keygenIdentity=Get-Phase7BWP2CIdentity $AgeKeygenPath
  # Binaries come from explicitly supplied pinned installation paths, never PATH.
  foreach($exe in @($AgePath,$AgeKeygenPath)) {
    [void](Assert-Phase7BWP2CLocalPath $exe)
    $lines=@(& $exe --version 2>&1)
    Assert-Phase7BWP2C (Test-Phase7BWorkPackage2AgeVersionOutput @($lines | ForEach-Object {[string]$_}) $LASTEXITCODE).pass 'AGE_VERSION'
  }
  New-Item -ItemType Directory -Path $Destination -ErrorAction Stop | Out-Null
  foreach($file in $manifest.files) {[IO.File]::Copy((Join-Path $SourceDirectory $file.name),(Join-Path $Destination $file.name),$false);Assert-Phase7BWP2CFile (Join-Path $Destination $file.name) $file}
  [IO.File]::Copy($AgePath,(Join-Path $Destination 'age.exe'),$false)
  [IO.File]::Copy($AgeKeygenPath,(Join-Path $Destination 'age-keygen.exe'),$false)
  Assert-Phase7BWP2CFile (Join-Path $Destination 'age.exe') $ageIdentity
  Assert-Phase7BWP2CFile (Join-Path $Destination 'age-keygen.exe') $keygenIdentity
  $manifestIdentity=Write-Phase7BWP2CCreateNewJson (Join-Path $Destination 'wp2c-tooling-manifest.json') $manifest
  $result=[ordered]@{manifest=$manifest;manifestIdentity=$manifestIdentity;age=$ageIdentity;ageKeygen=$keygenIdentity}
  if($null -ne $BaselineBinding){
    Assert-Phase7BWP2CBaselineBinding $BaselineBinding
    Assert-Phase7BWP2C ($BaselineBinding.toolingManifestSha256 -ceq $manifestIdentity.sha256) 'BASELINE_BINDING_MANIFEST'
    $result.baselineBindingIdentity=Write-Phase7BWP2CCreateNewJson (Join-Path $Destination 'wp2c-baseline-binding.json') $BaselineBinding
  }
  Assert-Phase7BWP2CExactFileSet $Destination (Get-Phase7BWP2CToolingMediaFileNames $Destination $manifest)
  [pscustomobject]$result
}

function New-Phase7BWP2CRecoveryContent {
  param([string]$PacketPath,[string]$DescriptorPath,[string]$ExpectedDescriptorSha256,[string]$Destination)
  [void](Assert-Phase7BWP2CLocalPath $Destination)
  Assert-Phase7BWP2C (-not (Test-Path -LiteralPath $Destination)) 'MEDIA_DESTINATION_EXISTS'
  $d=Read-Phase7BWP2CBoundJson $DescriptorPath $ExpectedDescriptorSha256
  $fixed=Get-Phase7BWorkPackage2Contract
  Assert-Phase7BWP2C ($d.schemaVersion -eq 1 -and $d.classification -ceq 'PHASE7B_WP2_ENCRYPTED_PACKET_AND_REPLICA_PASS' -and $d.applicationCommit -ceq $fixed.applicationCommit -and $d.environmentId -ceq $fixed.environmentId -and $d.vmDisplayName -ceq $fixed.vmDisplayName -and $d.manifestDigest -ceq $fixed.manifestDigest -and $d.attemptId -cmatch '^phase7b-wp2-[0-9a-f]{32}$') 'FINAL_DESCRIPTOR_IDENTITY'
  foreach($name in @('localEncryptedCopyPass','independentEncryptedReplicaPass','decryptRoundTripPass','nativeRecipientRequired','decryptRoundTripRequired')) {Assert-Phase7BWP2CBoolean $d.$name $true 'FINAL_DESCRIPTOR_CHECK'}
  foreach($name in @('automaticRetryAllowed','plaintextSecretPersisted','agePluginRequired')) {Assert-Phase7BWP2CBoolean $d.$name $false 'FINAL_DESCRIPTOR_AUTHORITY'}
  Assert-Phase7BWP2C (Test-Phase7BWorkPackage2FinalizationProvenance $d).pass 'FINAL_DESCRIPTOR_PROVENANCE'
  Assert-Phase7BWP2C ($d.ageEncryptionMode -ceq 'native-recipient-v1' -and $d.decryptRoundTripPass -ceq $true -and $d.plaintextZipSha256 -ceq $d.decryptedStreamSha256 -and $d.plaintextZipBytes -eq $d.decryptedStreamBytes) 'FINAL_DESCRIPTOR_NATIVE_ROUNDTRIP'
  Assert-Phase7BWP2C ($d.packetFileName -ceq (Split-Path -Leaf $PacketPath) -and $d.packetFileName -ceq ($d.attemptId+'.zip.age')) 'PACKET_NAME'
  $packet=Test-Phase7BEncryptedPacket -LiteralPath $PacketPath -ExpectedSha256 $d.packetSha256
  Assert-Phase7BWP2C ($packet.pass -and $packet.packetBytes -eq $d.packetBytes) 'PACKET_IDENTITY'
  $media=[pscustomobject][ordered]@{schemaVersion=1;kind='wp2c-recovery-media';attemptId=$d.attemptId;finalDescriptor=Get-Phase7BWP2CIdentity $DescriptorPath;packet=Get-Phase7BWP2CIdentity $PacketPath;packetFileName=$d.packetFileName;ageRecipient=$d.ageRecipient;ageEncryptionMode='native-recipient-v1';executionAuthorityIncluded=$false}
  New-Item -ItemType Directory -Path $Destination -ErrorAction Stop | Out-Null
  [IO.File]::Copy($PacketPath,(Join-Path $Destination $d.packetFileName),$false)
  [IO.File]::Copy($DescriptorPath,(Join-Path $Destination 'final-descriptor.json'),$false)
  Assert-Phase7BWP2CFile (Join-Path $Destination $d.packetFileName) $media.packet
  Assert-Phase7BWP2CFile (Join-Path $Destination 'final-descriptor.json') $media.finalDescriptor
  $identity=Write-Phase7BWP2CCreateNewJson (Join-Path $Destination 'wp2c-media.json') $media
  Assert-Phase7BWP2CExactFileSet $Destination @($d.packetFileName,'final-descriptor.json','wp2c-media.json')
  [pscustomobject]@{document=$media;identity=$identity}
}

function New-Phase7BWP2CControlContent {
  param([string]$InvocationPath,[string]$InvocationSha256,[string]$AuthorizationPath,[string]$AuthorizationSha256,[string]$HostClaimPath,[string]$HostClaimSha256,[string]$PreparationPath,[string]$EntryValidationPath,[string]$Destination)
  [void](Assert-Phase7BWP2CLocalPath $Destination)
  Assert-Phase7BWP2C (-not (Test-Path -LiteralPath $Destination)) 'MEDIA_DESTINATION_EXISTS'
  $c=Read-Phase7BWP2CBoundJson $InvocationPath $InvocationSha256
  $a=Read-Phase7BWP2CBoundJson $AuthorizationPath $AuthorizationSha256
  Assert-Phase7BWP2CAuthorization $a $c $InvocationSha256
  $claim=Read-Phase7BWP2CBoundJson $HostClaimPath $HostClaimSha256
  Assert-Phase7BWP2CClaim $claim $a $AuthorizationSha256 'host'
  [void](Read-Phase7BWP2CBoundJson $PreparationPath $c.bindings.preparationEvidenceSha256)
  [void](Read-Phase7BWP2CBoundJson $EntryValidationPath $c.bindings.identityEntryValidationSha256)
  New-Item -ItemType Directory -Path $Destination -ErrorAction Stop | Out-Null
  $sources=[ordered]@{'invocation.json'=$InvocationPath;'authorization.json'=$AuthorizationPath;'host-claim.json'=$HostClaimPath;'preparation.json'=$PreparationPath;'identity-entry-validation.json'=$EntryValidationPath}
  foreach($name in $sources.Keys) {[IO.File]::Copy($sources[$name],(Join-Path $Destination $name),$false);Assert-Phase7BWP2CFile (Join-Path $Destination $name) (Get-Phase7BWP2CIdentity $sources[$name])}
  Assert-Phase7BWP2CExactFileSet $Destination @($sources.Keys)
  [pscustomobject]@{kind='wp2c-control';fileCount=5;secretIncluded=$false;selfHashIncluded=$false}
}

function New-Phase7BWP2COpticalImage {
  param([string]$ContentRoot,[ValidateSet('P7B_C_TOOLS','P7B_C_RESTORE','P7B_C_CONTROL','P7B_C_PREP')][string]$Label,[string]$OutputPath)
  [void](Assert-Phase7BWP2CLocalPath $ContentRoot)
  [void](Assert-Phase7BWP2CLocalPath $OutputPath)
  Assert-Phase7BWP2C (-not (Test-Path -LiteralPath $OutputPath) -and [IO.Path]::GetExtension($OutputPath) -ceq '.iso') 'ISO_OUTPUT_COLLISION'
  $fs=$null;$result=$null;$stream=$null;$imageRoot=$null
  try {
    $fs=New-Object -ComObject IMAPI2FS.MsftFileSystemImage
    $fs.ChooseImageDefaultsForMediaType(12);$fs.FileSystemsToCreate=3;$fs.VolumeName=$Label
    $imageRoot=$fs.Root
    $imageRoot.AddTree($ContentRoot,$false)
    $result=$fs.CreateResultImage();$stream=$result.ImageStream
    if(-not ('Phase7BWP2CImageWriter' -as [type])) {
      Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
public static class Phase7BWP2CImageWriter {
 public static void Write(object source,string path,long length) {
  IntPtr unknown=Marshal.GetIUnknownForObject(source);
  try {
   IStream input=(IStream)Marshal.GetTypedObjectForIUnknown(unknown,typeof(IStream));
   using(FileStream output=new FileStream(path,FileMode.CreateNew,FileAccess.Write,FileShare.None)) {
    byte[] buffer=new byte[65536];IntPtr count=Marshal.AllocHGlobal(4);
    try {while(length>0){int n=(int)Math.Min(buffer.Length,length);Marshal.WriteInt32(count,0);input.Read(buffer,n,count);int read=Marshal.ReadInt32(count);if(read<=0||read>n)throw new IOException("PHASE7B_WP2C_ISO_STREAM");output.Write(buffer,0,read);length-=read;}output.Flush(true);}
    finally{Marshal.FreeHGlobal(count);}
   }
  } finally{Marshal.Release(unknown);}
 }
}
'@
    }
    [Phase7BWP2CImageWriter]::Write($stream,$OutputPath,([int64]$result.TotalBlocks*2048))
    $identity=Get-Phase7BIsoVolumeIdentity $OutputPath
    Assert-Phase7BWP2C ($identity.primaryVolumeLabel -ceq $Label -and $identity.jolietVolumeLabel -ceq $Label) 'ISO_LABEL'
    Get-Phase7BWP2CIdentity $OutputPath
  } finally {
    foreach($obj in @($stream,$result,$imageRoot,$fs)){if($null -ne $obj -and [Runtime.InteropServices.Marshal]::IsComObject($obj)){[void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($obj)}}
    $stream=$null;$result=$null;$imageRoot=$null;$fs=$null
    [GC]::Collect();[GC]::WaitForPendingFinalizers()
  }
}

function New-Phase7BWP2CPreparationContent {
  param([string]$PlanPath,[string]$PlanSha256,[string]$Destination)
  [void](Assert-Phase7BWP2CLocalPath $Destination)
  Assert-Phase7BWP2C (-not (Test-Path -LiteralPath $Destination)) 'MEDIA_DESTINATION_EXISTS'
  $plan=Read-Phase7BWP2CBoundJson $PlanPath $PlanSha256
  Assert-Phase7BWP2CPreparationPlan $plan
  $descriptor=[pscustomobject][ordered]@{schemaVersion=1;kind='wp2c-preparation-control';plan=Get-Phase7BWP2CIdentity $PlanPath;preparedStateId=$plan.bindings.preparedStateId;toolingManifestSha256=$plan.bindings.toolingManifestSha256;executionAuthorityIncluded=$false;packetIncluded=$false;secretIncluded=$false}
  New-Item -ItemType Directory -Path $Destination -ErrorAction Stop | Out-Null
  [IO.File]::Copy($PlanPath,(Join-Path $Destination 'preparation-plan.json'),$false)
  Assert-Phase7BWP2CFile (Join-Path $Destination 'preparation-plan.json') $descriptor.plan
  $identity=Write-Phase7BWP2CCreateNewJson (Join-Path $Destination 'preparation-control.json') $descriptor
  Assert-Phase7BWP2CExactFileSet $Destination @('preparation-plan.json','preparation-control.json')
  [pscustomobject]@{descriptor=$descriptor;descriptorIdentity=$identity;planIdentity=$descriptor.plan;fileCount=2}
}

function Read-Phase7BWP2CPreparationContent {
  param([string]$Root,[string]$DescriptorSha256)
  # Pure file consumer shared by synthetic tests and the optical-only entry.
  Assert-Phase7BWP2CExactFileSet $Root @('preparation-plan.json','preparation-control.json')
  $d=Read-Phase7BWP2CBoundJson (Join-Path $Root 'preparation-control.json') $DescriptorSha256
  Assert-Phase7BWP2CExactProperties $d @('schemaVersion','kind','plan','preparedStateId','toolingManifestSha256','executionAuthorityIncluded','packetIncluded','secretIncluded')
  Assert-Phase7BWP2C ($d.schemaVersion -eq 1 -and $d.kind -ceq 'wp2c-preparation-control') 'PREPARATION_CARRIER'
  foreach($name in @('executionAuthorityIncluded','packetIncluded','secretIncluded')){Assert-Phase7BWP2CBoolean $d.$name $false 'PREPARATION_CARRIER'}
  Assert-Phase7BWP2CExactProperties $d.plan @('sha256','bytes')
  Assert-Phase7BWP2CFile (Join-Path $Root 'preparation-plan.json') $d.plan
  $plan=Read-Phase7BWP2CBoundJson (Join-Path $Root 'preparation-plan.json') $d.plan.sha256
  Assert-Phase7BWP2CPreparationPlan $plan
  Assert-Phase7BWP2C ($d.preparedStateId -ceq $plan.bindings.preparedStateId -and $d.toolingManifestSha256 -ceq $plan.bindings.toolingManifestSha256) 'PREPARATION_CARRIER_BINDING'
  [pscustomobject]@{plan=$plan;descriptor=$d;descriptorIdentity=Get-Phase7BWP2CIdentity (Join-Path $Root 'preparation-control.json')}
}

function Read-Phase7BWP2CPreparationOptical {
  param([string]$OpticalRoot,[string]$DescriptorSha256)
  Assert-Phase7BWP2C ($OpticalRoot -cmatch '^[A-Z]:\\$') 'OPTICAL_ROOT_REQUIRED'
  $drives=@(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=5' -ErrorAction Stop|Where-Object {$_.DeviceID -ceq $OpticalRoot.Substring(0,2) -and $_.VolumeName -ceq 'P7B_C_PREP'})
  Assert-Phase7BWP2C ($drives.Count -eq 1) 'PREPARATION_OPTICAL_REQUIRED'
  Read-Phase7BWP2CPreparationContent $OpticalRoot $DescriptorSha256
}

# Lossless NONSECRET console return. This is a checksum/encoding, not a new
# authentication protocol. Whitespace from screenshot text capture is ignored;
# no character correction, guessed hash, script evaluation or clipboard API.
function ConvertTo-Phase7BWP2CPreparationReturnText {
  param($Document)
  if($Document.kind -ceq 'wp2c-guest-preparation-baseline'){Assert-Phase7BWP2CPreparationBaseline $Document}else{Assert-Phase7BWP2CPreparationReturnShape $Document}
  $json=ConvertTo-Phase7BCanonicalJson $Document
  Assert-Phase7BWP2C ($Document.kind -in @('wp2c-guest-preparation-baseline','wp2c-preparation-return') -and $json -notmatch 'AGE-SECRET-KEY-' -and $json.Length -le 32768) 'PREPARATION_RETURN_SHAPE'
  $bytes=[Text.Encoding]::UTF8.GetBytes($json);$memory=New-Object IO.MemoryStream
  try {
    $zip=New-Object IO.Compression.GZipStream($memory,[IO.Compression.CompressionMode]::Compress,$true)
    try{$zip.Write($bytes,0,$bytes.Length)}finally{$zip.Dispose()}
    $payload=[Convert]::ToBase64String($memory.ToArray())
    $text='WP2CP1:'+ $bytes.Length+':'+(Get-Phase7BWP2CObjectHash $Document)+':'+$payload
    Assert-Phase7BWP2C ($text.Length -le 16384) 'PREPARATION_RETURN_TOO_LARGE'
    $text
  } finally{$memory.Dispose()}
}

function ConvertFrom-Phase7BWP2CPreparationReturnText {
  param([string]$Text)
  Assert-Phase7BWP2C ($Text.Length -le 20000) 'PREPARATION_RETURN_TOO_LARGE'
  $compact=$Text -replace '\s',''
  Assert-Phase7BWP2C ($compact -cmatch '^WP2CP1:([1-9][0-9]{0,4}):([0-9a-f]{64}):([A-Za-z0-9+/]+={0,2})$') 'PREPARATION_RETURN_ENCODING'
  $length=[int]$Matches[1];$hash=$Matches[2];$payload=$Matches[3]
  Assert-Phase7BWP2C ($length -le 32768 -and $compact.Length -le 16384) 'PREPARATION_RETURN_TOO_LARGE'
  $inputStream=New-Object IO.MemoryStream(,[Convert]::FromBase64String($payload));$output=New-Object IO.MemoryStream
  try {
    $zip=New-Object IO.Compression.GZipStream($inputStream,[IO.Compression.CompressionMode]::Decompress)
    try {
      $buffer=New-Object byte[] 1024
      while(($count=$zip.Read($buffer,0,$buffer.Length)) -gt 0){Assert-Phase7BWP2C ($output.Length+$count -le $length) 'PREPARATION_RETURN_EXPANSION';$output.Write($buffer,0,$count)}
    } finally {$zip.Dispose()}
    Assert-Phase7BWP2C ($output.Length -eq $length) 'PREPARATION_RETURN_BYTES'
    $json=(New-Object Text.UTF8Encoding($false,$true)).GetString($output.ToArray())
    Assert-Phase7BWP2C ($json -notmatch 'AGE-SECRET-KEY-') 'PREPARATION_SECRET_FORBIDDEN'
    $document=$json|ConvertFrom-Json -ErrorAction Stop
    # Canonical equality rejects duplicate-key/alternative textual encodings.
    Assert-Phase7BWP2C ($json -ceq (ConvertTo-Phase7BCanonicalJson $document) -and (Get-Phase7BWP2CObjectHash $document) -ceq $hash -and $document.kind -in @('wp2c-guest-preparation-baseline','wp2c-preparation-return')) 'PREPARATION_RETURN_CHECKSUM'
    if($document.kind -ceq 'wp2c-guest-preparation-baseline'){Assert-Phase7BWP2CPreparationBaseline $document}else{Assert-Phase7BWP2CPreparationReturnShape $document}
    $document
  } finally {$inputStream.Dispose();$output.Dispose()}
}

Export-ModuleMember -Function *-Phase7BWP2C*
