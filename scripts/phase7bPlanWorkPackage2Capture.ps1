[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$AttemptId,
  [Parameter(Mandatory = $true)][string]$AuthorizationPath,
  [Parameter(Mandatory = $true)][string]$ExpectedAuthorizationSha256,
  [Parameter(Mandatory = $true)][string]$SourceRoot,
  [Parameter(Mandatory = $true)][string]$SelectionPath,
  [Parameter(Mandatory = $true)][string]$ExpectedSelectionSha256,
  [Parameter(Mandatory = $true)][string]$OutputPath
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot "phase7bIsolatedGuestContract.psm1") -Force
Import-Module (Join-Path $PSScriptRoot "phase7bWorkPackage2Contract.psm1") -Force
$contract = Get-Phase7BWorkPackage2Contract
$stage = "validate-selection"
try {
  if ($ExpectedSelectionSha256 -notmatch '^[0-9a-fA-F]{64}$' -or -not (Test-Path -LiteralPath $SelectionPath -PathType Leaf) -or
      (Get-Phase7BSha256 -LiteralPath $SelectionPath) -ne $ExpectedSelectionSha256.ToLowerInvariant()) { throw "PHASE7B_WP2_SELECTION_HASH_MISMATCH" }
  $source = (Resolve-Path -LiteralPath $SourceRoot -ErrorAction Stop).Path.TrimEnd('\')
  $sourceRootSha256 = Get-Phase7BSha256 -Text $source.ToLowerInvariant()
  [void](Assert-Phase7BWorkPackage2Authorization -LiteralPath $AuthorizationPath -ExpectedSha256 $ExpectedAuthorizationSha256 `
    -ExpectedStage "WP2B_INVENTORY" -ExpectedAttemptId $AttemptId -ExpectedSourceRootSha256 $sourceRootSha256 `
    -ExpectedCapturePlanSha256 $ExpectedSelectionSha256)
  $output = [IO.Path]::GetFullPath($OutputPath)
  if ($output.Equals($source, [StringComparison]::OrdinalIgnoreCase) -or $output.StartsWith($source + '\', [StringComparison]::OrdinalIgnoreCase) -or
      [IO.Path]::GetExtension($output) -ine '.json' -or (Test-Path -LiteralPath $output)) { throw "PHASE7B_WP2_CAPTURE_PLAN_OUTPUT_REJECTED" }

  $selection = Get-Content -LiteralPath $SelectionPath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
  if ([int]$selection.schemaVersion -ne 1 -or [string]$selection.classification -ne 'PHASE7B_WP2_WINDOWS_SELECTION' -or
      [string]$selection.applicationCommit -ne $contract.applicationCommit -or [string]$selection.environmentId -ne $contract.environmentId -or
      [string]$selection.vmDisplayName -ne $contract.vmDisplayName -or [string]$selection.manifestDigest -ne $contract.manifestDigest) { throw "PHASE7B_WP2_SELECTION_BINDING_MISMATCH" }
  $requiredCategories = @('canonical-runtime', 'migration-control', 'canonical-media')
  $prefixes = @{ 'canonical-runtime' = 'windows/canonical'; 'migration-control' = 'windows/control'; 'canonical-media' = 'windows/media' }
  $selections = @($selection.selections)
  $missingCategories = @($requiredCategories | Where-Object { $requiredCategory = $_; @($selections | Where-Object { [string]$_.category -eq $requiredCategory }).Count -eq 0 })
  if ($selections.Count -lt 3 -or $missingCategories.Count -gt 0) { throw "PHASE7B_WP2_REQUIRED_SELECTION_CATEGORY_MISSING" }

  $stage = "enumerate-bounded-source"
  $entries = New-Object System.Collections.Generic.List[object]
  foreach ($item in $selections) {
    $category = [string]$item.category
    if (-not $prefixes.ContainsKey($category)) { throw "PHASE7B_WP2_SELECTION_CATEGORY_REJECTED" }
    $pathCheck = Test-Phase7BWorkPackage2RelativePath -RelativePath ([string]$item.sourceRelativePath)
    if (-not $pathCheck.pass) { throw "PHASE7B_WP2_SELECTION_PATH_REJECTED" }
    $selectedPath = [IO.Path]::GetFullPath((Join-Path $source $pathCheck.normalizedPath.Replace('/', '\')))
    if (-not $selectedPath.StartsWith($source + '\', [StringComparison]::OrdinalIgnoreCase)) { throw "PHASE7B_WP2_SELECTION_OUTSIDE_SOURCE" }
    if (Test-Path -LiteralPath $selectedPath -PathType Leaf) {
      $files = @(Get-Item -LiteralPath $selectedPath -Force)
      $selectionRoot = Split-Path -Parent $selectedPath
    } elseif (Test-Path -LiteralPath $selectedPath -PathType Container) {
      if (-not [bool]$item.recursive) { throw "PHASE7B_WP2_DIRECTORY_SELECTION_REQUIRES_RECURSIVE" }
      $selectedDirectory = Get-Item -LiteralPath $selectedPath -Force
      if (($selectedDirectory.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "PHASE7B_WP2_REPARSE_POINT_REJECTED" }
      $files = @(Get-ChildItem -LiteralPath $selectedPath -File -Recurse -Force)
      $selectionRoot = $selectedPath
    } else { throw "PHASE7B_WP2_SELECTED_SOURCE_MISSING" }
    if ($files.Count -eq 0) { throw "PHASE7B_WP2_SELECTED_SOURCE_EMPTY" }
    foreach ($file in $files) {
      if (($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "PHASE7B_WP2_REPARSE_POINT_REJECTED" }
      $sourceRelative = $file.FullName.Substring(($source + '\').Length).Replace('\', '/')
      $categoryRelative = if ($file.FullName.Equals($selectedPath, [StringComparison]::OrdinalIgnoreCase)) { $file.Name } else { $file.FullName.Substring(($selectionRoot.TrimEnd('\') + '\').Length).Replace('\', '/') }
      $entries.Add([pscustomobject][ordered]@{ sourceRelativePath = $sourceRelative; logicalPath = "$($prefixes[$category])/$categoryRelative" })
    }
  }
  $inventoryEntries = @($entries | ForEach-Object { $_ })
  $inventory = New-Phase7BWorkPackage2Inventory -SourceRoot $source -Entries $inventoryEntries
  $plan = [ordered]@{
    schemaVersion = 1
    classification = 'PHASE7B_WP2_CAPTURE_PLAN'
    attemptId = $AttemptId
    applicationCommit = $contract.applicationCommit
    environmentId = $contract.environmentId
    vmDisplayName = $contract.vmDisplayName
    windowsHostId = $contract.windowsHostId
    manifestDigest = $contract.manifestDigest
    selectionSha256 = $ExpectedSelectionSha256.ToLowerInvariant()
    sourceRootSha256 = $sourceRootSha256
    sourceInventorySha256 = $inventory.inventorySha256
    fileCount = $inventory.fileCount
    totalBytes = $inventory.totalBytes
    files = @($inventory.files | ForEach-Object { [ordered]@{ sourceRelativePath = $_.sourceRelativePath; logicalPath = $_.logicalPath } })
  }
  $parent = Split-Path -Parent $output
  if (-not (Test-Path -LiteralPath $parent -PathType Container)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
  $planBytes = (New-Object Text.UTF8Encoding($false)).GetBytes((ConvertTo-Phase7BCanonicalJson -InputObject $plan))
  $planStream = New-Object IO.FileStream($output, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
  try {
    $planStream.Write($planBytes, 0, $planBytes.Length)
    $planStream.Flush($true)
  } finally {
    $planStream.Dispose()
  }
  [ordered]@{
    classification = 'PHASE7B_WP2_CAPTURE_PLAN_PASS'
    pass = $true
    attemptId = $AttemptId
    capturePlanFileName = Split-Path -Leaf $output
    capturePlanSha256 = Get-Phase7BSha256 -LiteralPath $output
    sourceRootSha256 = $sourceRootSha256
    sourceInventorySha256 = $inventory.inventorySha256
    fileCount = $inventory.fileCount
    totalBytes = $inventory.totalBytes
    rawSourcePathEmitted = $false
    sourceMutationPerformed = $false
    automaticRetryAllowed = $false
  } | ConvertTo-Json -Depth 5
} catch {
  $safeCode = if ($_.Exception.Message -match '^PHASE7B_') { $_.Exception.Message } else { 'PHASE7B_WP2_INVENTORY_EXCEPTION' }
  [ordered]@{ classification = 'PHASE7B_WP2_CAPTURE_PLAN_FAIL'; pass = $false; safeStage = $stage; safeErrorCode = $safeCode; safeExceptionType = $_.Exception.GetType().Name; safeLine = $_.InvocationInfo.ScriptLineNumber; sourceMutationPerformed = $false; automaticRetryAllowed = $false } | ConvertTo-Json -Depth 4
  exit 1
}
