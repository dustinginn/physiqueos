[CmdletBinding()]
param(
  [Parameter()][string]$KitDirectory,
  [Parameter()][string]$OutputPath
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot "phase7bIsolatedGuestContract.psm1") -Force
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$tmpRoot = (Resolve-Path (Join-Path $repositoryRoot ".tmp")).Path
$contract = Get-Phase7BIsolatedGuestContract
if ([string]::IsNullOrWhiteSpace($KitDirectory)) { $KitDirectory = Join-Path $tmpRoot "phase7b-vmware-guest-bootstrap-kit" }
if ([string]::IsNullOrWhiteSpace($OutputPath)) { $OutputPath = Join-Path $tmpRoot $contract.bootstrapIsoFileName }

$resolvedKit = (Resolve-Path -LiteralPath $KitDirectory -ErrorAction Stop).Path
$fullOutputPath = [IO.Path]::GetFullPath($OutputPath)
if (-not $resolvedKit.StartsWith($tmpRoot + "\", [StringComparison]::OrdinalIgnoreCase)) { throw "PHASE7B_ISO_KIT_MUST_BE_UNDER_TMP" }
if (-not $fullOutputPath.StartsWith($tmpRoot + "\", [StringComparison]::OrdinalIgnoreCase)) { throw "PHASE7B_ISO_OUTPUT_MUST_BE_UNDER_TMP" }
if ([IO.Path]::GetExtension($fullOutputPath) -ine ".iso") { throw "PHASE7B_ISO_OUTPUT_EXTENSION_REQUIRED" }
if ([string]$contract.bootstrapIsoVolumeLabel -notmatch '^[A-Z0-9_]{1,16}$') { throw "PHASE7B_ISO_JOLIET_SAFE_VOLUME_LABEL_REQUIRED" }

$manifestPath = Join-Path $resolvedKit "phase7b-vmware-guest-bootstrap-kit-manifest.json"
$manifest = Get-Content -LiteralPath $manifestPath -Raw -ErrorAction Stop | ConvertFrom-Json
if ([string]$manifest.applicationCommit -ne [string]$contract.applicationCommit) { throw "PHASE7B_ISO_APPLICATION_COMMIT_MISMATCH" }
if ([string]$manifest.manifestDigest -ne [string]$contract.manifestDigest) { throw "PHASE7B_ISO_MANIFEST_DIGEST_MISMATCH" }
$payloadFiles = @($manifest.files)
if ($payloadFiles.Count -lt 1) { throw "PHASE7B_ISO_EMPTY_KIT_MANIFEST" }
foreach ($file in $payloadFiles) {
  $relativePath = [string]$file.relativePath
  if ([string]::IsNullOrWhiteSpace($relativePath) -or [IO.Path]::IsPathRooted($relativePath) -or $relativePath -match '(?:^|[\\/])\.\.(?:[\\/]|$)') { throw "PHASE7B_ISO_UNSAFE_MANIFEST_PATH" }
  $payloadPath = Join-Path $resolvedKit $relativePath
  if (-not (Test-Path -LiteralPath $payloadPath -PathType Leaf)) { throw "PHASE7B_ISO_MANIFEST_FILE_MISSING:$relativePath" }
  if ((Get-Phase7BSha256 -LiteralPath $payloadPath) -ne [string]$file.sha256) { throw "PHASE7B_ISO_MANIFEST_FILE_HASH_MISMATCH:$relativePath" }
}

$nonce = [Guid]::NewGuid().ToString("N")
$stagingRoot = Join-Path $tmpRoot "phase7b-vmware-bootstrap-iso-staging-$nonce"
$stagingKit = Join-Path $stagingRoot "phase7b-vmware-guest-bootstrap-kit"
$fileSystemImage = $null
$resultImage = $null
$imageStream = $null
try {
  New-Item -ItemType Directory -Path $stagingKit -Force | Out-Null
  foreach ($file in $payloadFiles) {
    $relativePath = [string]$file.relativePath
    $destination = Join-Path $stagingKit $relativePath
    $destinationParent = Split-Path -Parent $destination
    if (-not (Test-Path -LiteralPath $destinationParent -PathType Container)) { New-Item -ItemType Directory -Path $destinationParent -Force | Out-Null }
    Copy-Item -LiteralPath (Join-Path $resolvedKit $relativePath) -Destination $destination
  }
  Copy-Item -LiteralPath $manifestPath -Destination (Join-Path $stagingKit (Split-Path -Leaf $manifestPath))
  @"
PHYSIQUEOS PHASE 7B ISOLATED VMWARE GUEST BOOTSTRAP

This optical image contains no production credentials and authorizes no restore.
Open Windows PowerShell as Administrator in the isolated VMware guest, locate the
CD-ROM drive, change to its phase7b-vmware-guest-bootstrap-kit directory, and run:

  powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Invoke-Phase7BGuestBootstrap.ps1

Expected application commit: $($contract.applicationCommit)
Expected VM display name: $($contract.vmDisplayName)
Work package 2 remains unauthorized.
"@ | Set-Content -LiteralPath (Join-Path $stagingRoot "OFFLINE-BOOTSTRAP-INSTRUCTIONS.txt") -Encoding ASCII

  if (Test-Path -LiteralPath $fullOutputPath) { Remove-Item -LiteralPath $fullOutputPath -Force }
  $fileSystemImage = New-Object -ComObject IMAPI2FS.MsftFileSystemImage
  # IMAPI_MEDIA_TYPE_DISK (12) builds a filesystem image without requiring writable optical media.
  $fileSystemImage.ChooseImageDefaultsForMediaType(12)
  $fileSystemImage.FileSystemsToCreate = 3
  $fileSystemImage.VolumeName = $contract.bootstrapIsoVolumeLabel
  $fileSystemImage.Root.AddTree($stagingRoot, $false)
  $resultImage = $fileSystemImage.CreateResultImage()
  $imageStream = $resultImage.ImageStream
  $imageByteCount = [int64]$resultImage.TotalBlocks * 2048
  if (-not ("Phase7BIsoStreamWriter" -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;

public static class Phase7BIsoStreamWriter {
  public static void Write(object source, string path, long length) {
    IntPtr unknown = Marshal.GetIUnknownForObject(source);
    try {
      IStream input = (IStream)Marshal.GetTypedObjectForIUnknown(unknown, typeof(IStream));
      using (FileStream output = new FileStream(path, FileMode.Create, FileAccess.Write, FileShare.None)) {
        byte[] buffer = new byte[65536];
        IntPtr readPointer = Marshal.AllocHGlobal(sizeof(int));
        try {
          long remaining = length;
          while (remaining > 0) {
            int requested = (int)Math.Min(buffer.Length, remaining);
            Marshal.WriteInt32(readPointer, 0);
            input.Read(buffer, requested, readPointer);
            int read = Marshal.ReadInt32(readPointer);
            if (read <= 0) { throw new EndOfStreamException("PHASE7B_ISO_STREAM_ENDED_EARLY"); }
            output.Write(buffer, 0, read);
            remaining -= read;
          }
        } finally {
          Marshal.FreeHGlobal(readPointer);
        }
      }
    } finally {
      Marshal.Release(unknown);
    }
  }
}
'@
  }
  [Phase7BIsoStreamWriter]::Write($imageStream, $fullOutputPath, $imageByteCount)

  $stream = [IO.File]::OpenRead($fullOutputPath)
  try {
    [void]$stream.Seek(32769, [IO.SeekOrigin]::Begin)
    $signatureBytes = New-Object byte[] 5
    if ($stream.Read($signatureBytes, 0, 5) -ne 5 -or [Text.Encoding]::ASCII.GetString($signatureBytes) -ne "CD001") { throw "PHASE7B_ISO9660_SIGNATURE_INVALID" }
  } finally {
    $stream.Dispose()
  }
  $volumeIdentity = Get-Phase7BIsoVolumeIdentity -LiteralPath $fullOutputPath
  if ([string]$volumeIdentity.primaryVolumeLabel -ne [string]$contract.bootstrapIsoVolumeLabel -or
      [string]$volumeIdentity.jolietVolumeLabel -ne [string]$contract.bootstrapIsoVolumeLabel) {
    throw "PHASE7B_ISO_WINDOWS_VOLUME_LABEL_MISMATCH"
  }

  [ordered]@{
    classification = "PHASE7B_VMWARE_GUEST_BOOTSTRAP_ISO_BUILT"
    outputPath = (Resolve-Path -LiteralPath $fullOutputPath).Path
    outputSha256 = Get-Phase7BSha256 -LiteralPath $fullOutputPath
    outputBytes = (Get-Item -LiteralPath $fullOutputPath).Length
    volumeName = $contract.bootstrapIsoVolumeLabel
    primaryVolumeLabel = $volumeIdentity.primaryVolumeLabel
    jolietVolumeLabel = $volumeIdentity.jolietVolumeLabel
    applicationCommit = $contract.applicationCommit
    toolingCommit = [string]$manifest.toolingCommit
    kitManifestSha256 = Get-Phase7BSha256 -LiteralPath $manifestPath
    productionCredentialsIncluded = $false
    workPackage2Authorized = $false
  } | ConvertTo-Json -Depth 4
} finally {
  foreach ($comObject in @($imageStream, $resultImage, $fileSystemImage)) {
    if ($comObject) { try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($comObject) } catch {} }
  }
  if (Test-Path -LiteralPath $stagingRoot) {
    $resolvedStaging = (Resolve-Path -LiteralPath $stagingRoot).Path
    if ($resolvedStaging.StartsWith($tmpRoot + "\phase7b-vmware-bootstrap-iso-staging-", [StringComparison]::OrdinalIgnoreCase)) {
      Remove-Item -LiteralPath $resolvedStaging -Recurse -Force
    }
  }
}
