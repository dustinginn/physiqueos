[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ReconciliationToolingCommit,
  [Parameter()][string]$OutputPath
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot "phase7bIsolatedGuestContract.psm1") -Force
$contract = Get-Phase7BIsolatedGuestContract
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$tmpRoot = (Resolve-Path (Join-Path $repositoryRoot ".tmp")).Path
if ($ReconciliationToolingCommit -notmatch '^[0-9a-f]{40}$') { throw "PHASE7B_RECONCILIATION_ISO_TOOLING_COMMIT_INVALID" }
if ([string]::IsNullOrWhiteSpace($OutputPath)) { $OutputPath = Join-Path $tmpRoot "phase7b-attempt4-report-reconciliation.iso" }
$fullOutputPath = [IO.Path]::GetFullPath($OutputPath)
if (-not $fullOutputPath.StartsWith($tmpRoot + "\", [StringComparison]::OrdinalIgnoreCase)) { throw "PHASE7B_RECONCILIATION_ISO_OUTPUT_MUST_BE_UNDER_TMP" }
if ([IO.Path]::GetExtension($fullOutputPath) -ine ".iso") { throw "PHASE7B_RECONCILIATION_ISO_EXTENSION_REQUIRED" }
if (Test-Path -LiteralPath $fullOutputPath) { throw "PHASE7B_RECONCILIATION_ISO_OUTPUT_ALREADY_EXISTS" }

$sourceFiles = @(
  "phase7bIsolatedGuestContract.psm1",
  "phase7bIsolatedGuestReconciliation.psm1",
  "phase7bReconcileIsolatedGuestReport.ps1"
)
$nonce = [Guid]::NewGuid().ToString("N")
$stagingRoot = Join-Path $tmpRoot "phase7b-reconciliation-iso-staging-$nonce"
$stagingKit = Join-Path $stagingRoot "phase7b-report-reconciliation-kit"
$fileSystemImage = $null
$resultImage = $null
$imageStream = $null
try {
  New-Item -ItemType Directory -Path $stagingKit -Force | Out-Null
  foreach ($sourceFile in $sourceFiles) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $sourceFile) -Destination (Join-Path $stagingKit $sourceFile)
  }
  $manifestFiles = @($sourceFiles | ForEach-Object {
    [ordered]@{ relativePath = $_; sha256 = Get-Phase7BSha256 -LiteralPath (Join-Path $stagingKit $_) }
  })
  $manifest = [ordered]@{
    schemaVersion = 1
    createdAt = [DateTime]::UtcNow.ToString("o")
    applicationCommit = [string]$contract.applicationCommit
    bootstrapToolingCommit = "be86ec20394fff9760134b583d6f3c949ea95673"
    reconciliationToolingCommit = $ReconciliationToolingCommit
    manifestDigest = [string]$contract.manifestDigest
    files = $manifestFiles
    productionCredentialsIncluded = $false
    workPackage2Authorized = $false
    attempt5Authorized = $false
  }
  $manifestPath = Join-Path $stagingKit "phase7b-report-reconciliation-manifest.json"
  $manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestPath -Encoding UTF8
  @"
PHYSIQUEOS PHASE 7B REPORT-ONLY RECONCILIATION

This media performs no bootstrap preparation. It may be used only under a separate
Founder authorization to revalidate the existing inert guest and write exactly one
fresh nonce-bound acceptance report. Work package 2 and attempt #5 are unauthorized.
"@ | Set-Content -LiteralPath (Join-Path $stagingRoot "REPORT-ONLY-RECONCILIATION.txt") -Encoding ASCII

  $allText = @((Get-ChildItem -LiteralPath $stagingRoot -File -Recurse | ForEach-Object { Get-Content -LiteralPath $_.FullName -Raw })) -join [Environment]::NewLine
  if ($allText -match '(?i)dop_v1_|BEGIN (?:RSA|OPENSSH|EC) PRIVATE KEY') { throw "PHASE7B_RECONCILIATION_ISO_CREDENTIAL_CONTENT_FAIL" }

  $fileSystemImage = New-Object -ComObject IMAPI2FS.MsftFileSystemImage
  $fileSystemImage.ChooseImageDefaultsForMediaType(12)
  $fileSystemImage.FileSystemsToCreate = 3
  $fileSystemImage.VolumeName = "P7B_RECON"
  $fileSystemImage.Root.AddTree($stagingRoot, $false)
  $resultImage = $fileSystemImage.CreateResultImage()
  $imageStream = $resultImage.ImageStream
  $imageByteCount = [int64]$resultImage.TotalBlocks * 2048

  if (-not ("Phase7BReconciliationIsoWriter" -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
public static class Phase7BReconciliationIsoWriter {
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
            if (read <= 0) { throw new EndOfStreamException("PHASE7B_RECONCILIATION_ISO_STREAM_ENDED_EARLY"); }
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
  [Phase7BReconciliationIsoWriter]::Write($imageStream, $fullOutputPath, $imageByteCount)
  $identity = Get-Phase7BIsoVolumeIdentity -LiteralPath $fullOutputPath
  if ([string]$identity.primaryVolumeLabel -ne "P7B_RECON" -or [string]$identity.jolietVolumeLabel -ne "P7B_RECON") {
    throw "PHASE7B_RECONCILIATION_ISO_LABEL_FAIL"
  }
  [ordered]@{
    classification = "PHASE7B_REPORT_ONLY_RECONCILIATION_ISO_BUILT"
    pass = $true
    outputPath = (Resolve-Path -LiteralPath $fullOutputPath).Path
    outputSha256 = Get-Phase7BSha256 -LiteralPath $fullOutputPath
    outputBytes = (Get-Item -LiteralPath $fullOutputPath).Length
    volumeLabel = "P7B_RECON"
    applicationCommit = [string]$contract.applicationCommit
    bootstrapToolingCommit = "be86ec20394fff9760134b583d6f3c949ea95673"
    reconciliationToolingCommit = $ReconciliationToolingCommit
    manifestSha256 = Get-Phase7BSha256 -LiteralPath $manifestPath
    embeddedFiles = @($manifestFiles)
    productionCredentialsIncluded = $false
    workPackage2Authorized = $false
    attempt5Authorized = $false
  } | ConvertTo-Json -Depth 6
} finally {
  foreach ($comObject in @($imageStream, $resultImage, $fileSystemImage)) {
    if ($comObject) { try { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($comObject) } catch {} }
  }
  if (Test-Path -LiteralPath $stagingRoot) {
    $resolvedStaging = (Resolve-Path -LiteralPath $stagingRoot).Path
    if ($resolvedStaging.StartsWith($tmpRoot + "\phase7b-reconciliation-iso-staging-", [StringComparison]::OrdinalIgnoreCase)) {
      Remove-Item -LiteralPath $resolvedStaging -Recurse -Force
    }
  }
}
