[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$AttemptId,
  [Parameter(Mandatory = $true)][string]$AuthorizationPath,
  [Parameter(Mandatory = $true)][string]$ExpectedAuthorizationSha256,
  [Parameter(Mandatory = $true)][string]$PacketPath,
  [Parameter(Mandatory = $true)][string]$ExpectedPacketSha256,
  [Parameter(Mandatory = $true)][string]$DescriptorPath,
  [Parameter(Mandatory = $true)][string]$ExpectedDescriptorSha256,
  [Parameter(Mandatory = $true)][string]$AgeExePath,
  [Parameter(Mandatory = $true)][string]$ExpectedAgeExeSha256,
  [Parameter(Mandatory = $true)][string]$OutputPath
)

$ErrorActionPreference = "Stop"
# The embedded-authorization ISO format cannot bind its own final ISO hash.
# Retained only to reject legacy invocations; use the non-circular WP2-C builder.
throw 'PHASE7B_WP2C_LEGACY_RESTORE_MEDIA_RETIRED'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot "phase7bWorkPackage2Contract.psm1") -Force
Import-Module (Join-Path $PSScriptRoot "phase7bIsolatedGuestContract.psm1") -Force
$contract = Get-Phase7BWorkPackage2Contract
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$tmpRoot = (Resolve-Path (Join-Path $repositoryRoot ".tmp")).Path.TrimEnd('\')
$stage = "validate-media-input"
$stagingRoot = $null
$fileSystemImage = $null
$resultImage = $null
$imageStream = $null

try {
  if ($ExpectedPacketSha256 -notmatch '^[0-9a-fA-F]{64}$' -or $ExpectedDescriptorSha256 -notmatch '^[0-9a-fA-F]{64}$' -or
      $ExpectedAgeExeSha256 -notmatch '^[0-9a-fA-F]{64}$') { throw "PHASE7B_WP2_MEDIA_HASH_ARGUMENT_INVALID" }
  $packet = Test-Phase7BEncryptedPacket -LiteralPath $PacketPath -ExpectedSha256 $ExpectedPacketSha256
  if (-not $packet.pass) { throw $packet.classification }
  if (-not (Test-Path -LiteralPath $DescriptorPath -PathType Leaf) -or
      (Get-Phase7BSha256 -LiteralPath $DescriptorPath) -ne $ExpectedDescriptorSha256.ToLowerInvariant()) { throw "PHASE7B_WP2_DESCRIPTOR_HASH_MISMATCH" }
  if (-not (Test-Path -LiteralPath $AgeExePath -PathType Leaf) -or
      (Get-Phase7BSha256 -LiteralPath $AgeExePath) -ne $ExpectedAgeExeSha256.ToLowerInvariant()) { throw "PHASE7B_WP2_AGE_IDENTITY_MISMATCH" }
  $ageVersionLines = @(& $AgeExePath --version 2>&1)
  if (-not (Test-Phase7BWorkPackage2AgeVersionOutput -OutputLines @($ageVersionLines | ForEach-Object { [string]$_ }) -ExitCode $LASTEXITCODE).pass) { throw "PHASE7B_WP2_AGE_VERSION_UNSUPPORTED" }
  $descriptor = Get-Content -LiteralPath $DescriptorPath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
  if (-not (Test-Phase7BWorkPackage2FinalizationProvenance -Descriptor $descriptor).pass) { throw 'PHASE7B_WP2_STAGE5_PROVENANCE_FAIL' }
  if ([int]$descriptor.schemaVersion -ne 1 -or [string]$descriptor.classification -ne "PHASE7B_WP2_ENCRYPTED_PACKET_AND_REPLICA_PASS" -or
      [string]$descriptor.attemptId -ne $AttemptId -or [string]$descriptor.applicationCommit -ne $contract.applicationCommit -or
      [string]$descriptor.environmentId -ne $contract.environmentId -or [string]$descriptor.vmDisplayName -ne $contract.vmDisplayName -or
      [string]$descriptor.packetFileName -ne (Split-Path -Leaf $PacketPath) -or [string]$descriptor.packetSha256 -ne $ExpectedPacketSha256.ToLowerInvariant() -or
      -not [bool]$descriptor.localEncryptedCopyPass -or -not [bool]$descriptor.independentEncryptedReplicaPass -or
      -not [bool]$descriptor.decryptRoundTripPass -or -not [bool]$descriptor.decryptRoundTripRequired -or
      [string]$descriptor.ageEncryptionMode -cne 'native-recipient-v1' -or
      [string]$descriptor.ageRecipient -cnotmatch '^age1[023456789acdefghjklmnpqrstuvwxyz]{58}$' -or
      [string]$descriptor.ageIdentityInputMode -cne 'stdin' -or -not [bool]$descriptor.nativeRecipientRequired -or
      [bool]$descriptor.agePluginRequired -or [string]$descriptor.ageVersion -cne '1.3.1' -or
      [string]$descriptor.ageKeygenVersion -cne '1.3.1' -or [string]$descriptor.invocationContractSha256 -notmatch '^[0-9a-f]{64}$' -or
      [string]$descriptor.stage3LauncherSha256 -notmatch '^[0-9a-f]{64}$' -or [string]$descriptor.plaintextZipSha256 -notmatch '^[0-9a-f]{64}$' -or
      [string]$descriptor.decryptedStreamSha256 -cne [string]$descriptor.plaintextZipSha256 -or
      [int64]$descriptor.plaintextZipBytes -lt 1 -or [int64]$descriptor.decryptedStreamBytes -ne [int64]$descriptor.plaintextZipBytes) {
    throw "PHASE7B_WP2_DESCRIPTOR_BINDING_MISMATCH"
  }
  [void](Assert-Phase7BWorkPackage2Authorization -LiteralPath $AuthorizationPath -ExpectedSha256 $ExpectedAuthorizationSha256 `
    -ExpectedStage "WP2C_MEDIA" -ExpectedAttemptId $AttemptId -ExpectedPacketSha256 $ExpectedPacketSha256)
  $guestAuthorization = Get-Content -LiteralPath $AuthorizationPath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
  foreach ($requiredGuestStage in @('WP2C_STAGE', 'WP2C_RESTORE', 'WP2C_VERIFY')) {
    [void](Assert-Phase7BWorkPackage2Authorization -LiteralPath $AuthorizationPath -ExpectedSha256 $ExpectedAuthorizationSha256 `
      -ExpectedStage $requiredGuestStage -ExpectedAttemptId $AttemptId -ExpectedPacketSha256 $ExpectedPacketSha256)
  }

  $fullOutput = [IO.Path]::GetFullPath($OutputPath)
  if (-not $fullOutput.StartsWith($tmpRoot + '\', [StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetExtension($fullOutput) -ine ".iso") { throw "PHASE7B_WP2_MEDIA_OUTPUT_MUST_BE_TMP_ISO" }
  if (Test-Path -LiteralPath $fullOutput) { throw "PHASE7B_WP2_MEDIA_OUTPUT_EXISTS" }
  if ($contract.opticalVolumeLabel -notmatch '^[A-Z0-9_]{1,16}$') { throw "PHASE7B_WP2_MEDIA_LABEL_INVALID" }

  $stage = "build-read-only-media"
  $stagingRoot = Join-Path $tmpRoot "phase7b-wp2-iso-staging-$AttemptId"
  if (Test-Path -LiteralPath $stagingRoot) { throw "PHASE7B_WP2_MEDIA_STAGING_EXISTS" }
  New-Item -ItemType Directory -Path $stagingRoot -ErrorAction Stop | Out-Null
  Copy-Item -LiteralPath $PacketPath -Destination (Join-Path $stagingRoot (Split-Path -Leaf $PacketPath))
  Copy-Item -LiteralPath $AgeExePath -Destination (Join-Path $stagingRoot $contract.ageMediaFileName)
  $mediaDescriptor = [ordered]@{}
  foreach ($property in $descriptor.PSObject.Properties) { $mediaDescriptor[$property.Name] = $property.Value }
  $mediaDescriptor.ageFileName = $contract.ageMediaFileName
  $mediaDescriptor.ageExeSha256 = $ExpectedAgeExeSha256.ToLowerInvariant()
  $mediaDescriptor.guestAuthorization = $guestAuthorization
  $mediaDescriptorPath = Join-Path $stagingRoot "phase7b-wp2-packet-descriptor.json"
  $mediaDescriptorBytes = (New-Object Text.UTF8Encoding($false)).GetBytes((ConvertTo-Phase7BCanonicalJson -InputObject $mediaDescriptor))
  $mediaDescriptorStream = New-Object IO.FileStream($mediaDescriptorPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
  try {
    $mediaDescriptorStream.Write($mediaDescriptorBytes, 0, $mediaDescriptorBytes.Length)
    $mediaDescriptorStream.Flush($true)
  } finally {
    $mediaDescriptorStream.Dispose()
  }
  $mediaDescriptorSha256 = Get-Phase7BSha256 -LiteralPath $mediaDescriptorPath
  $mediaFiles = @(Get-ChildItem -LiteralPath $stagingRoot -File)
  $mediaFileSet = Test-Phase7BWorkPackage2MediaFileSet -FileNames @($mediaFiles.Name) -PacketFileName (Split-Path -Leaf $PacketPath) -AgeFileName $contract.ageMediaFileName
  if (-not $mediaFileSet.pass) { throw "PHASE7B_WP2_MEDIA_FILE_SET_INVALID" }

  $fileSystemImage = New-Object -ComObject IMAPI2FS.MsftFileSystemImage
  $fileSystemImage.ChooseImageDefaultsForMediaType(12)
  $fileSystemImage.FileSystemsToCreate = 3
  $fileSystemImage.VolumeName = $contract.opticalVolumeLabel
  $fileSystemImage.Root.AddTree($stagingRoot, $false)
  $resultImage = $fileSystemImage.CreateResultImage()
  $imageStream = $resultImage.ImageStream
  $imageByteCount = [int64]$resultImage.TotalBlocks * 2048
  if (-not ("Phase7BWP2IsoStreamWriter" -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
public static class Phase7BWP2IsoStreamWriter {
  public static void Write(object source, string path, long length) {
    IntPtr unknown = Marshal.GetIUnknownForObject(source);
    try {
      IStream input = (IStream)Marshal.GetTypedObjectForIUnknown(unknown, typeof(IStream));
      using (FileStream output = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None)) {
        byte[] buffer = new byte[65536];
        IntPtr readPointer = Marshal.AllocHGlobal(sizeof(int));
        try {
          long remaining = length;
          while (remaining > 0) {
            int requested = (int)Math.Min(buffer.Length, remaining);
            Marshal.WriteInt32(readPointer, 0);
            input.Read(buffer, requested, readPointer);
            int read = Marshal.ReadInt32(readPointer);
            if (read <= 0) throw new EndOfStreamException("PHASE7B_WP2_ISO_STREAM_ENDED_EARLY");
            output.Write(buffer, 0, read);
            remaining -= read;
          }
        } finally { Marshal.FreeHGlobal(readPointer); }
      }
    } finally { Marshal.Release(unknown); }
  }
}
'@
  }
  [Phase7BWP2IsoStreamWriter]::Write($imageStream, $fullOutput, $imageByteCount)
  $identity = Get-Phase7BIsoVolumeIdentity -LiteralPath $fullOutput
  if ([string]$identity.primaryVolumeLabel -ne $contract.opticalVolumeLabel -or [string]$identity.jolietVolumeLabel -ne $contract.opticalVolumeLabel) { throw "PHASE7B_WP2_MEDIA_VOLUME_IDENTITY_FAIL" }

  [ordered]@{
    classification = "PHASE7B_WP2_RESTORE_MEDIA_BUILT"
    pass = $true
    attemptId = $AttemptId
    outputFileName = Split-Path -Leaf $fullOutput
    outputSha256 = Get-Phase7BSha256 -LiteralPath $fullOutput
    outputBytes = (Get-Item -LiteralPath $fullOutput).Length
    primaryVolumeLabel = $identity.primaryVolumeLabel
    jolietVolumeLabel = $identity.jolietVolumeLabel
    fileCount = 3
    packetFileName = Split-Path -Leaf $PacketPath
    packetSha256 = $ExpectedPacketSha256.ToLowerInvariant()
    sourceDescriptorSha256 = $ExpectedDescriptorSha256.ToLowerInvariant()
    mediaDescriptorSha256 = $mediaDescriptorSha256
    ageFileName = $contract.ageMediaFileName
    ageExeSha256 = $ExpectedAgeExeSha256.ToLowerInvariant()
    embeddedAuthorizedStages = @('WP2C_MEDIA', 'WP2C_STAGE', 'WP2C_RESTORE', 'WP2C_VERIFY')
    credentialsIncluded = $false
    plaintextIncluded = $false
    automaticRetryAllowed = $false
  } | ConvertTo-Json -Depth 5
} catch {
  $safeCode = if ($_.Exception.Message -match '^PHASE7B_') { $_.Exception.Message } else { "PHASE7B_WP2_MEDIA_EXCEPTION" }
  [ordered]@{ classification = "PHASE7B_WP2_RESTORE_MEDIA_FAIL"; pass = $false; safeStage = $stage; safeErrorCode = $safeCode; automaticRetryAllowed = $false } | ConvertTo-Json -Depth 4
  exit 1
} finally {
  foreach ($comObject in @($imageStream, $resultImage, $fileSystemImage)) {
    if ($comObject) { try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($comObject) } catch {} }
  }
  if (-not [string]::IsNullOrWhiteSpace($stagingRoot) -and (Test-Path -LiteralPath $stagingRoot)) {
    $resolved = (Resolve-Path -LiteralPath $stagingRoot).Path
    if ($resolved.StartsWith($tmpRoot + '\phase7b-wp2-iso-staging-', [StringComparison]::OrdinalIgnoreCase)) { Remove-Item -LiteralPath $resolved -Recurse -Force }
  }
}
