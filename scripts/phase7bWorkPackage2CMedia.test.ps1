$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
# Reuse the actual pending-descriptor producer and real finalizer fixture, not
# a handwritten approximation of their portable final-descriptor output.
. (Join-Path $PSScriptRoot 'phase7bWorkPackage2Finalization.test.ps1') -FixturesOnly
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CContract.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CMedia.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CGuest.psm1') -Force
function Assert-Rejected([scriptblock]$Action,[string]$Message){$failed=$false;try{& $Action|Out-Null}catch{$failed=$true};Assert-True $failed $Message}
try {
  $s=New-Case 'wp2c-recovery-media'
  $packet=Join-Path $s.root ($s.inputs.AttemptId+'.zip.age')
  [IO.File]::WriteAllBytes($packet,[Text.Encoding]::ASCII.GetBytes("age-encryption.org/v1`nTHROWAWAY-NOT-A-REAL-PACKET"))
  $id=Get-Phase7BWP2CIdentity $packet
  $s.pending.packetSha256=$id.sha256;$s.pending.packetBytes=$id.bytes
  Save-Pending $s
  $s.inputs.ExpectedPacketSha256=$id.sha256;$s.inputs.ExpectedPacketBytes=$id.bytes
  $s.receipt.packetSha256=$id.sha256;$s.receipt.packetBytes=$id.bytes;Write-Json $s.receiptPath $s.receipt
  $final=Invoke-SyntheticFinalizer $s
  Assert-True $final.pass 'real synthetic finalizer produces accepted descriptor'
  $root=Join-Path $s.root 'media-content'
  $result=New-Phase7BWP2CRecoveryContent $packet $s.finalPath (Get-Phase7BWP2CIdentity $s.finalPath).sha256 $root
  Assert-True (@(Get-ChildItem -LiteralPath $root).Count -eq 3) 'recovery carrier exactly three files'
  Assert-True (-not $result.document.executionAuthorityIncluded) 'recovery descriptor has no circular execution authorization'
  Assert-True ((Get-Phase7BWP2CIdentity (Join-Path $root 'final-descriptor.json')).sha256 -ceq (Get-Phase7BWP2CIdentity $s.finalPath).sha256) 'accepted descriptor copied byte-identical'
  Assert-True ((Get-Phase7BWP2CIdentity (Join-Path $root (Split-Path -Leaf $packet))).sha256 -ceq $id.sha256) 'ciphertext copied byte-identical'
  $iso=Join-Path $s.root 'synthetic-recovery.iso'
  $isoId=New-Phase7BWP2COpticalImage $root 'P7B_C_RESTORE' $iso
  Assert-True ($isoId.bytes -gt $id.bytes) 'disposable recovery ISO actually built, never mounted'
  Assert-Rejected {New-Phase7BWP2CRecoveryContent $packet $s.finalPath ('f'*64) (Join-Path $s.root 'bad')} 'wrong final descriptor rejected'
  $unexpected=Join-Path $root 'unexpected.txt';[IO.File]::WriteAllText($unexpected,'synthetic')
  Assert-Rejected {Assert-Phase7BWP2CExactFileSet $root @((Split-Path -Leaf $packet),'final-descriptor.json','wp2c-media.json')} 'unexpected media file rejected'
  Remove-Item -LiteralPath $unexpected
  Assert-Rejected {New-Phase7BWP2CRecoveryContent $packet $s.finalPath (Get-Phase7BWP2CIdentity $s.finalPath).sha256 $root} 'no media overwrite'
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  Add-Type -AssemblyName System.IO.Compression
  foreach($case in @(@{name='correct';entry='canonical/fixture.json';bytes=2;limit=2;accept=$true},@{name='traversal';entry='../outside';bytes=2;limit=2;accept=$false},@{name='capacity';entry='canonical/fixture.json';bytes=3;limit=2;accept=$false})) {
    $zip=Join-Path $s.root ($case.name+'.zip');$z=[IO.Compression.ZipFile]::Open($zip,[IO.Compression.ZipArchiveMode]::Create)
    try{$stream=$z.CreateEntry($case.entry).Open();try{$stream.Write((New-Object byte[] $case.bytes),0,$case.bytes)}finally{$stream.Dispose()}}finally{$z.Dispose()}
    if($case.accept){Assert-True ((Assert-Phase7BWP2CZipBounds $zip $case.limit) -eq $case.bytes) 'bounded ZIP accepted'}else{Assert-Rejected {Assert-Phase7BWP2CZipBounds $zip $case.limit} ('ZIP rejected '+$case.name)}
  }
  $result=[ordered]@{classification='PHASE7B_WP2C_MEDIA_TESTS_PASS';pass=$true;assertions=$script:assertions;realPacketUsed=$false;mediaMounted=$false;vmBooted=$false}
} finally {
  if(Test-Path -LiteralPath $testRoot){$resolved=(Resolve-Path -LiteralPath $testRoot).Path;if(-not $resolved.StartsWith((Join-Path $repo '.tmp\phase7b-finalization-tests-'),[StringComparison]::OrdinalIgnoreCase)){throw 'SYNTHETIC_CLEANUP_BOUNDARY'};Remove-Item -LiteralPath $resolved -Recurse -Force}
}
$result|ConvertTo-Json -Compress
