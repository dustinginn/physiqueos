[CmdletBinding()]
param(
  [Parameter()][string]$OutputDirectory,
  [Parameter()][string]$ToolingCommit = "UNCOMMITTED_LOCAL_TOOLING"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot "phase7bIsolatedGuestContract.psm1") -Force
$contract = Get-Phase7BIsolatedGuestContract
if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
  $OutputDirectory = Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..")).Path ".tmp\phase7b-vmware-guest-bootstrap-kit"
}
$sourceFiles = @(
  "phase7bIsolatedGuestContract.psm1",
  "phase7bWorkPackage2Contract.psm1",
  "phase7bIsolatedGuestReconciliation.psm1",
  "phase7bWindowsAgeIdentityBridge.psm1",
  "phase7bIsolatedGuestBootstrap.ps1",
  "phase7bIsolatedGuestRestoreInterface.ps1",
  "Invoke-Phase7BGuestBootstrap.ps1"
)

if (Test-Path -LiteralPath $OutputDirectory) {
  $resolvedOutput = (Resolve-Path -LiteralPath $OutputDirectory).Path
  $tmpRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\.tmp")).Path
  if (-not $resolvedOutput.StartsWith($tmpRoot + "\", [StringComparison]::OrdinalIgnoreCase)) { throw "PHASE7B_KIT_OUTPUT_MUST_BE_UNDER_TMP" }
  Remove-Item -LiteralPath $resolvedOutput -Recurse -Force
}
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
foreach ($name in @($sourceFiles | Where-Object { $_ -ne "Invoke-Phase7BGuestBootstrap.ps1" })) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $OutputDirectory $name) }

$launcher = @'
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
& (Join-Path $root "phase7bIsolatedGuestBootstrap.ps1") `
  -Mode Apply `
  -KitManifestPath (Join-Path $root "phase7b-vmware-guest-bootstrap-kit-manifest.json") `
  -AcknowledgeIsolatedVmwareGuest `
  -AcknowledgeWindowsUpdated `
  -AcknowledgeNoProductionCredentials `
  -AcknowledgeWorkPackage2NotAuthorized
exit $LASTEXITCODE
'@
$launcher | Set-Content -LiteralPath (Join-Path $OutputDirectory "Invoke-Phase7BGuestBootstrap.ps1") -Encoding UTF8

$files = @($sourceFiles | ForEach-Object {
  [ordered]@{ relativePath = $_; sha256 = Get-Phase7BSha256 -LiteralPath (Join-Path $OutputDirectory $_) }
})
$manifest = [ordered]@{
  schemaVersion = 1
  createdAt = [DateTime]::UtcNow.ToString("o")
  toolingCommit = $ToolingCommit
  applicationCommit = $contract.applicationCommit
  applicationBranch = $contract.applicationBranch
  manifestDigest = $contract.manifestDigest
  files = $files
}
$manifestPath = Join-Path $OutputDirectory "phase7b-vmware-guest-bootstrap-kit-manifest.json"
$manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

$archivePath = "$OutputDirectory.zip"
if (Test-Path -LiteralPath $archivePath) { Remove-Item -LiteralPath $archivePath -Force }
Compress-Archive -Path (Join-Path $OutputDirectory "*") -DestinationPath $archivePath -CompressionLevel Optimal
[ordered]@{
  classification = "PHASE7B_VMWARE_GUEST_BOOTSTRAP_KIT_BUILT"
  outputDirectory = (Resolve-Path -LiteralPath $OutputDirectory).Path
  archivePath = (Resolve-Path -LiteralPath $archivePath).Path
  archiveSha256 = Get-Phase7BSha256 -LiteralPath $archivePath
  applicationCommit = $contract.applicationCommit
  toolingCommit = $ToolingCommit
} | ConvertTo-Json -Depth 4
