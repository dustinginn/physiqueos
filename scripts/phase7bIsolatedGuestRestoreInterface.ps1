[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("Inspect", "VerifyStagedPacket", "StageEncryptedPacket", "DecryptAndRestore", "VerifyRestore")]
  [string]$Operation,
  [Parameter()][string]$PacketPath,
  [Parameter()][string]$ExpectedSha256,
  [Parameter()][string]$ReportPath
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot "phase7bIsolatedGuestContract.psm1") -Force
$contract = Get-Phase7BIsolatedGuestContract
$nonce = [Guid]::NewGuid().ToString("N")
$timestamp = [DateTime]::UtcNow.ToString("o")

if ($Operation -in @("StageEncryptedPacket", "DecryptAndRestore", "VerifyRestore")) {
  throw "PHASE7B_WORK_PACKAGE2_NOT_AUTHORIZED"
}

$incoming = Join-Path $contract.isolatedRoot "incoming"
$restore = Join-Path $contract.isolatedRoot "restore\canonical"
$result = [ordered]@{
  schemaVersion = 1
  nonce = $nonce
  observedAt = $timestamp
  operation = $Operation
  applicationCommit = $contract.applicationCommit
  environmentId = $contract.environmentId
  workPackage2Authorized = $false
  incomingDirectoryPresent = Test-Path -LiteralPath $incoming -PathType Container
  restoreDirectoryPresent = Test-Path -LiteralPath $restore -PathType Container
}

if ($Operation -eq "Inspect") {
  $result.pass = [bool]($result.incomingDirectoryPresent -and $result.restoreDirectoryPresent)
  $result.classification = if ($result.pass) { "WP2_INTERFACE_PREPARED_INERT" } else { "WP2_INTERFACE_PATHS_MISSING" }
} else {
  if ([string]::IsNullOrWhiteSpace($PacketPath) -or [string]::IsNullOrWhiteSpace($ExpectedSha256)) {
    throw "PHASE7B_PACKET_IDENTITY_REQUIRED"
  }
  $resolved = (Resolve-Path -LiteralPath $PacketPath -ErrorAction Stop).Path
  if (-not $resolved.StartsWith($incoming, [StringComparison]::OrdinalIgnoreCase)) { throw "PHASE7B_PACKET_OUTSIDE_INCOMING" }
  if ($ExpectedSha256 -notmatch '^[0-9a-fA-F]{64}$') { throw "PHASE7B_PACKET_SHA256_INVALID" }
  $actual = Get-Phase7BSha256 -LiteralPath $resolved
  $result.packetFileName = Split-Path -Leaf $resolved
  $result.packetSha256 = $actual
  $result.pass = $actual -eq $ExpectedSha256.ToLowerInvariant()
  $result.classification = if ($result.pass) { "ENCRYPTED_PACKET_INTEGRITY_PASS" } else { "ENCRYPTED_PACKET_INTEGRITY_FAIL" }
}

$json = $result | ConvertTo-Json -Depth 6
if (-not [string]::IsNullOrWhiteSpace($ReportPath)) { $json | Set-Content -LiteralPath $ReportPath -Encoding UTF8 }
$json
if (-not $result.pass) { exit 1 }
