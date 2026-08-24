Set-StrictMode -Version Latest

Import-Module (Join-Path $PSScriptRoot "phase7bIsolatedGuestContract.psm1")

function Get-Phase7BWorkPackage2Contract {
  [CmdletBinding()]
  param()

  $guest = Get-Phase7BIsolatedGuestContract
  [pscustomobject][ordered]@{
    schemaVersion = 1
    classification = "PHASE7B_WORK_PACKAGE2_CONTRACT"
    applicationCommit = $guest.applicationCommit
    environmentId = $guest.environmentId
    vmDisplayName = $guest.vmDisplayName
    windowsHostId = $guest.windowsHostId
    manifestDigest = $guest.manifestDigest
    isolatedIncomingRoot = (Join-Path $guest.isolatedRoot "incoming")
    isolatedRestoreRoot = (Join-Path $guest.isolatedRoot "restore\canonical")
    restoredPacketDirectoryName = "packet"
    opticalVolumeLabel = "P7B_WP2"
    packetExtension = ".zip.age"
    ageMediaFileName = "age.exe"
    authorizationClassification = "PHASE7B_WP2_STAGE_AUTHORIZATION"
    authorizationStages = @("WP2B_INVENTORY", "WP2B_CAPTURE", "WP2C_MEDIA", "WP2C_STAGE", "WP2C_RESTORE", "WP2C_VERIFY")
    automaticRetryAllowed = $false
    mutationBudget = 1
  }
}

function ConvertTo-Phase7BCanonicalJson {
  [CmdletBinding()]
  param([Parameter(Mandatory = $true)]$InputObject)

  function Write-Canonical($Value) {
    if ($null -eq $Value) { return "null" }
    if ($Value -is [bool]) { return $(if ($Value) { "true" } else { "false" }) }
    if ($Value -is [string] -or $Value -is [char] -or $Value -is [datetime] -or $Value -is [guid]) {
      return ($Value.ToString() | ConvertTo-Json -Compress)
    }
    if ($Value -is [byte] -or $Value -is [int16] -or $Value -is [int32] -or $Value -is [int64] -or
        $Value -is [uint16] -or $Value -is [uint32] -or $Value -is [uint64] -or $Value -is [decimal] -or
        $Value -is [single] -or $Value -is [double]) {
      return [Convert]::ToString($Value, [Globalization.CultureInfo]::InvariantCulture)
    }
    if ($Value -is [Collections.IDictionary]) {
      $pairs = foreach ($key in @($Value.Keys | ForEach-Object { [string]$_ } | Sort-Object -CaseSensitive)) {
        "$(($key | ConvertTo-Json -Compress)):$(Write-Canonical $Value[$key])"
      }
      return "{$($pairs -join ',')}"
    }
    if ($Value -is [Collections.IEnumerable] -and $Value -isnot [string]) {
      $items = foreach ($item in @($Value)) { Write-Canonical $item }
      return "[$($items -join ',')]"
    }
    $properties = [ordered]@{}
    foreach ($property in @($Value.PSObject.Properties | Sort-Object Name -CaseSensitive)) {
      $properties[$property.Name] = $property.Value
    }
    return Write-Canonical $properties
  }

  Write-Canonical $InputObject
}

function Assert-Phase7BWorkPackage2Authorization {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string]$LiteralPath,
    [Parameter(Mandatory = $true)][string]$ExpectedSha256,
    [Parameter(Mandatory = $true)][ValidateSet("WP2B_INVENTORY", "WP2B_CAPTURE", "WP2C_MEDIA", "WP2C_STAGE", "WP2C_RESTORE", "WP2C_VERIFY")][string]$ExpectedStage,
    [Parameter(Mandatory = $true)][string]$ExpectedAttemptId,
    [Parameter()][string]$ExpectedPacketSha256,
    [Parameter()][string]$ExpectedSourceInventorySha256,
    [Parameter()][string]$ExpectedSourceRootSha256,
    [Parameter()][string]$ExpectedCapturePlanSha256,
    [Parameter()][string]$ExpectedLocalOutputRootSha256,
    [Parameter()][string]$ExpectedReplicaRootSha256
  )

  $contract = Get-Phase7BWorkPackage2Contract
  if ($ExpectedSha256 -notmatch '^[0-9a-fA-F]{64}$') { throw "PHASE7B_WP2_AUTHORIZATION_HASH_INVALID" }
  if ($ExpectedAttemptId -notmatch '^phase7b-wp2-[0-9a-f]{32}$') { throw "PHASE7B_WP2_ATTEMPT_ID_INVALID" }
  if (-not (Test-Path -LiteralPath $LiteralPath -PathType Leaf)) { throw "PHASE7B_WP2_AUTHORIZATION_NOT_FOUND" }
  if ((Get-Phase7BSha256 -LiteralPath $LiteralPath) -ne $ExpectedSha256.ToLowerInvariant()) { throw "PHASE7B_WP2_AUTHORIZATION_HASH_MISMATCH" }
  $document = Get-Content -LiteralPath $LiteralPath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
  $authorization = if ([string]$document.classification -eq "PHASE7B_WP2_ENCRYPTED_PACKET_AND_REPLICA_PASS" -and $document.PSObject.Properties.Name -contains "guestAuthorization") { $document.guestAuthorization } else { $document }
  $authorizedStages = @(
    if ($authorization.PSObject.Properties.Name -contains "authorizedStages") { @($authorization.authorizedStages) }
    elseif ($authorization.PSObject.Properties.Name -contains "stage") { [pscustomobject]@{ stage = [string]$authorization.stage; mutationBudget = [int]$authorization.mutationBudget } }
  )
  $stageBinding = @($authorizedStages | Where-Object { [string]$_.stage -eq $ExpectedStage })
  $expectedMutationBudget = if ($ExpectedStage -eq "WP2C_VERIFY") { 0 } else { 1 }
  if ([int]$authorization.schemaVersion -ne 1 -or
      [string]$authorization.classification -ne $contract.authorizationClassification -or
      $stageBinding.Count -ne 1 -or [int]$stageBinding[0].mutationBudget -ne $expectedMutationBudget -or
      [string]$authorization.attemptId -ne $ExpectedAttemptId -or
      [string]$authorization.applicationCommit -ne $contract.applicationCommit -or
      [string]$authorization.environmentId -ne $contract.environmentId -or
      [string]$authorization.vmDisplayName -ne $contract.vmDisplayName -or
      [string]$authorization.windowsHostId -ne $contract.windowsHostId -or
      [string]$authorization.manifestDigest -ne $contract.manifestDigest -or
      [bool]$authorization.founderApproved -ne $true -or
      [bool]$authorization.automaticRetryAllowed -ne $false) {
    throw "PHASE7B_WP2_AUTHORIZATION_BINDING_MISMATCH"
  }
  $issued = [datetime]::MinValue
  $expires = [datetime]::MinValue
  if (-not [datetime]::TryParse([string]$authorization.issuedAt, [ref]$issued) -or
      -not [datetime]::TryParse([string]$authorization.expiresAt, [ref]$expires) -or
      $expires.ToUniversalTime() -le $issued.ToUniversalTime() -or
      [datetime]::UtcNow -ge $expires.ToUniversalTime()) {
    throw "PHASE7B_WP2_AUTHORIZATION_TIME_INVALID_OR_EXPIRED"
  }
  if (-not [string]::IsNullOrWhiteSpace($ExpectedPacketSha256)) {
    if ($ExpectedPacketSha256 -notmatch '^[0-9a-fA-F]{64}$' -or
        [string]$authorization.packetSha256 -ne $ExpectedPacketSha256.ToLowerInvariant()) { throw "PHASE7B_WP2_AUTHORIZATION_PACKET_MISMATCH" }
  }
  if (-not [string]::IsNullOrWhiteSpace($ExpectedSourceInventorySha256)) {
    if ($ExpectedSourceInventorySha256 -notmatch '^[0-9a-fA-F]{64}$' -or
        [string]$authorization.sourceInventorySha256 -ne $ExpectedSourceInventorySha256.ToLowerInvariant()) { throw "PHASE7B_WP2_AUTHORIZATION_INVENTORY_MISMATCH" }
  }
  if (-not [string]::IsNullOrWhiteSpace($ExpectedSourceRootSha256)) {
    if ($ExpectedSourceRootSha256 -notmatch '^[0-9a-fA-F]{64}$' -or
        [string]$authorization.sourceRootSha256 -ne $ExpectedSourceRootSha256.ToLowerInvariant()) { throw "PHASE7B_WP2_AUTHORIZATION_SOURCE_ROOT_MISMATCH" }
  }
  if (-not [string]::IsNullOrWhiteSpace($ExpectedCapturePlanSha256)) {
    if ($ExpectedCapturePlanSha256 -notmatch '^[0-9a-fA-F]{64}$' -or
        [string]$authorization.capturePlanSha256 -ne $ExpectedCapturePlanSha256.ToLowerInvariant()) { throw "PHASE7B_WP2_AUTHORIZATION_CAPTURE_PLAN_MISMATCH" }
  }
  if (-not [string]::IsNullOrWhiteSpace($ExpectedLocalOutputRootSha256)) {
    if ($ExpectedLocalOutputRootSha256 -notmatch '^[0-9a-fA-F]{64}$' -or
        [string]$authorization.localOutputRootSha256 -ne $ExpectedLocalOutputRootSha256.ToLowerInvariant()) { throw "PHASE7B_WP2_AUTHORIZATION_LOCAL_OUTPUT_MISMATCH" }
  }
  if (-not [string]::IsNullOrWhiteSpace($ExpectedReplicaRootSha256)) {
    if ($ExpectedReplicaRootSha256 -notmatch '^[0-9a-fA-F]{64}$' -or
        [string]$authorization.replicaRootSha256 -ne $ExpectedReplicaRootSha256.ToLowerInvariant() -or
        [string]$authorization.replicaClassification -ne 'OFF_MACHINE_OR_INDEPENDENT_STORAGE') { throw "PHASE7B_WP2_AUTHORIZATION_REPLICA_MISMATCH" }
  }
  $authorization
}

function Test-Phase7BWorkPackage2RelativePath {
  [CmdletBinding()]
  param([Parameter(Mandatory = $true)][string]$RelativePath)

  $normalized = $RelativePath.Replace('\', '/')
  $segments = @($normalized.Split('/') | Where-Object { $_.Length -gt 0 })
  $forbiddenSegment = '(?i)^(?:\.git|\.next|node_modules|coverage|dist|tmp|temp|cache|logs?)$'
  $forbiddenFile = '(?i)(?:^|/)(?:\.env(?:\..*)?|.*\.credential\.clixml|.*\.(?:pem|key|pfx|p12|kdbx)|id_(?:rsa|ecdsa|ed25519))(?:$|/)'
  $safe = -not [string]::IsNullOrWhiteSpace($RelativePath) -and
    $normalized.Length -le 180 -and
    @($segments | Where-Object { $_.Length -gt 100 }).Count -eq 0 -and
    -not [IO.Path]::IsPathRooted($RelativePath) -and
    $normalized -notmatch '(?:^|/)\.\.(?:/|$)' -and
    $normalized -notmatch '[:*?"<>|]' -and
    @($segments | Where-Object { $_ -match $forbiddenSegment }).Count -eq 0 -and
    $normalized -notmatch $forbiddenFile
  [pscustomobject][ordered]@{
    pass = [bool]$safe
    classification = if ($safe) { "PHASE7B_WP2_RELATIVE_PATH_PASS" } else { "PHASE7B_WP2_RELATIVE_PATH_REJECTED" }
    normalizedPath = if ($safe) { $normalized } else { $null }
  }
}

function Test-Phase7BWorkPackage2CredentialSignal {
  [CmdletBinding()]
  param([Parameter(Mandatory = $true)][string]$LiteralPath)

  if (-not (Test-Path -LiteralPath $LiteralPath -PathType Leaf)) { throw "PHASE7B_WP2_SOURCE_FILE_NOT_FOUND" }
  $stream = [IO.File]::OpenRead((Resolve-Path -LiteralPath $LiteralPath).Path)
  $signal = $false
  $tail = ""
  $pattern = '(?i)(?:BEGIN (?:RSA|OPENSSH|EC) PRIVATE KEY|dop_v1_[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|(?:AWS|DO|DIGITALOCEAN|NGROK|SPACES)_[A-Z0-9_]*(?:SECRET|TOKEN|KEY)\s*[=:]\s*[^\s"'']{12,}|["'']?(?:password|passphrase|api[_-]?token|access[_-]?token|secret[_-]?key|private[_-]?key)["'']?\s*[:=]\s*["''][^"'']{12,}["'']|postgres(?:ql)?://[^\s"'']+:[^\s"'']+@)'
  try {
    $buffer = New-Object byte[] 65536
    while (($read = $stream.Read($buffer, 0, $buffer.Length)) -gt 0) {
      $sample = $tail + [Text.Encoding]::UTF8.GetString($buffer, 0, $read)
      if ($sample -match $pattern) { $signal = $true; break }
      $tail = if ($sample.Length -gt 512) { $sample.Substring($sample.Length - 512) } else { $sample }
    }
  } finally { $stream.Dispose() }
  [pscustomobject][ordered]@{
    pass = -not $signal
    classification = if ($signal) { "PHASE7B_WP2_CREDENTIAL_SIGNAL_REJECTED" } else { "PHASE7B_WP2_CREDENTIAL_SCAN_PASS" }
    signalCount = if ($signal) { 1 } else { 0 }
  }
}

function Assert-Phase7BWorkPackage2NoReparsePath {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$RelativePath
  )

  $rootFull = [IO.Path]::GetFullPath($Root).TrimEnd('\')
  $rootItem = Get-Item -LiteralPath $rootFull -Force -ErrorAction Stop
  if (($rootItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "PHASE7B_WP2_REPARSE_POINT_REJECTED" }
  $current = $rootFull
  foreach ($segment in @($RelativePath.Replace('\', '/').Split('/') | Where-Object { $_.Length -gt 0 })) {
    $current = Join-Path $current $segment
    $item = Get-Item -LiteralPath $current -Force -ErrorAction Stop
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "PHASE7B_WP2_REPARSE_POINT_REJECTED" }
  }
}

function New-Phase7BWorkPackage2Inventory {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string]$SourceRoot,
    [Parameter(Mandatory = $true)][AllowEmptyCollection()][object[]]$Entries
  )

  $root = (Resolve-Path -LiteralPath $SourceRoot -ErrorAction Stop).Path.TrimEnd('\')
  Assert-Phase7BWorkPackage2NoReparsePath -Root $root -RelativePath '.'
  $items = New-Object System.Collections.Generic.List[object]
  $seen = @{}
  foreach ($entry in @($Entries)) {
    $sourceRelative = [string]$entry.sourceRelativePath
    $logical = [string]$entry.logicalPath
    $sourceCheck = Test-Phase7BWorkPackage2RelativePath -RelativePath $sourceRelative
    $logicalCheck = Test-Phase7BWorkPackage2RelativePath -RelativePath $logical
    if (-not $sourceCheck.pass -or -not $logicalCheck.pass) { throw "PHASE7B_WP2_UNSAFE_INVENTORY_PATH" }
    if ($seen.ContainsKey($logicalCheck.normalizedPath.ToLowerInvariant())) { throw "PHASE7B_WP2_DUPLICATE_LOGICAL_PATH" }
    $seen[$logicalCheck.normalizedPath.ToLowerInvariant()] = $true
    $sourcePath = [IO.Path]::GetFullPath((Join-Path $root $sourceCheck.normalizedPath.Replace('/', '\')))
    if (-not $sourcePath.StartsWith($root + '\', [StringComparison]::OrdinalIgnoreCase)) { throw "PHASE7B_WP2_SOURCE_OUTSIDE_ROOT" }
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) { throw "PHASE7B_WP2_SOURCE_FILE_NOT_FOUND" }
    Assert-Phase7BWorkPackage2NoReparsePath -Root $root -RelativePath $sourceCheck.normalizedPath
    $file = Get-Item -LiteralPath $sourcePath -Force
    if (($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw "PHASE7B_WP2_REPARSE_POINT_REJECTED" }
    $credential = Test-Phase7BWorkPackage2CredentialSignal -LiteralPath $sourcePath
    if (-not $credential.pass) { throw $credential.classification }
    $items.Add([pscustomobject][ordered]@{
      logicalPath = $logicalCheck.normalizedPath
      bytes = [int64]$file.Length
      sha256 = Get-Phase7BSha256 -LiteralPath $sourcePath
      sourceRelativePath = $sourceCheck.normalizedPath
    })
  }
  $sorted = @($items | Sort-Object logicalPath -CaseSensitive)
  if ($sorted.Count -eq 0) { throw "PHASE7B_WP2_EMPTY_INVENTORY" }
  $safeFiles = @($sorted | ForEach-Object { [ordered]@{ logicalPath = $_.logicalPath; sourceRelativePath = $_.sourceRelativePath; bytes = $_.bytes; sha256 = $_.sha256 } })
  $safeJson = ConvertTo-Phase7BCanonicalJson -InputObject $safeFiles
  [pscustomobject][ordered]@{
    classification = "PHASE7B_WP2_SOURCE_INVENTORY_PASS"
    pass = $true
    fileCount = $sorted.Count
    totalBytes = [int64](($sorted | Measure-Object bytes -Sum).Sum)
    inventorySha256 = Get-Phase7BSha256 -Text $safeJson
    files = $sorted
  }
}

function New-Phase7BDeterministicPacketZip {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string]$SourceRoot,
    [Parameter(Mandatory = $true)][object[]]$Files,
    [Parameter(Mandatory = $true)][string]$ManifestPath,
    [Parameter(Mandatory = $true)][string]$OutputPath
  )

  if (Test-Path -LiteralPath $OutputPath) { throw "PHASE7B_WP2_PACKET_OUTPUT_EXISTS" }
  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $output = [IO.File]::Open($OutputPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
  try {
    $archive = New-Object IO.Compression.ZipArchive($output, [IO.Compression.ZipArchiveMode]::Create, $true)
    try {
      $entries = @($Files | Sort-Object logicalPath -CaseSensitive)
      foreach ($file in $entries) {
        $entry = $archive.CreateEntry([string]$file.logicalPath, [IO.Compression.CompressionLevel]::NoCompression)
        $entry.LastWriteTime = [datetimeoffset]::new(2000, 1, 1, 0, 0, 0, [timespan]::Zero)
        $input = [IO.File]::OpenRead((Join-Path $SourceRoot ([string]$file.logicalPath).Replace('/', '\')))
        $target = $entry.Open()
        try { $input.CopyTo($target) } finally { $target.Dispose(); $input.Dispose() }
      }
      $manifestEntry = $archive.CreateEntry("packet-manifest.json", [IO.Compression.CompressionLevel]::NoCompression)
      $manifestEntry.LastWriteTime = [datetimeoffset]::new(2000, 1, 1, 0, 0, 0, [timespan]::Zero)
      $input = [IO.File]::OpenRead($ManifestPath)
      $target = $manifestEntry.Open()
      try { $input.CopyTo($target) } finally { $target.Dispose(); $input.Dispose() }
    } finally { $archive.Dispose() }
  } finally { $output.Dispose() }
  [pscustomobject][ordered]@{ path = $OutputPath; bytes = (Get-Item -LiteralPath $OutputPath).Length; sha256 = Get-Phase7BSha256 -LiteralPath $OutputPath }
}

function Expand-Phase7BSafePacketZip {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string]$LiteralPath,
    [Parameter(Mandatory = $true)][string]$DestinationRoot
  )

  if (Test-Path -LiteralPath $DestinationRoot) { throw "PHASE7B_WP2_RESTORE_DESTINATION_EXISTS" }
  New-Item -ItemType Directory -Path $DestinationRoot -ErrorAction Stop | Out-Null
  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $root = [IO.Path]::GetFullPath($DestinationRoot).TrimEnd('\')
  $archive = [IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $LiteralPath).Path)
  try {
    $seen = @{}
    foreach ($entry in @($archive.Entries)) {
      if ([string]::IsNullOrWhiteSpace($entry.Name)) { throw "PHASE7B_WP2_DIRECTORY_ENTRY_REJECTED" }
      $pathCheck = Test-Phase7BWorkPackage2RelativePath -RelativePath $entry.FullName
      if (-not $pathCheck.pass -and $entry.FullName -ne 'packet-manifest.json') { throw "PHASE7B_WP2_UNSAFE_ZIP_ENTRY" }
      $normalized = $entry.FullName.Replace('\', '/')
      if ($seen.ContainsKey($normalized.ToLowerInvariant())) { throw "PHASE7B_WP2_DUPLICATE_ZIP_ENTRY" }
      $seen[$normalized.ToLowerInvariant()] = $true
      $destination = [IO.Path]::GetFullPath((Join-Path $root $normalized.Replace('/', '\')))
      if (-not $destination.StartsWith($root + '\', [StringComparison]::OrdinalIgnoreCase)) { throw "PHASE7B_WP2_ZIP_TRAVERSAL_REJECTED" }
      $parent = Split-Path -Parent $destination
      if (-not (Test-Path -LiteralPath $parent -PathType Container)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
      $input = $entry.Open()
      $output = [IO.File]::Open($destination, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
      try { $input.CopyTo($output) } finally { $output.Dispose(); $input.Dispose() }
    }
  } catch {
    if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force }
    throw
  } finally { $archive.Dispose() }
  [pscustomobject][ordered]@{ classification = "PHASE7B_WP2_PACKET_EXTRACTION_PASS"; pass = $true; entryCount = $seen.Count }
}

function Test-Phase7BEncryptedPacket {
  [CmdletBinding()]
  param([Parameter(Mandatory = $true)][string]$LiteralPath, [Parameter(Mandatory = $true)][string]$ExpectedSha256)

  if ($ExpectedSha256 -notmatch '^[0-9a-fA-F]{64}$') { throw "PHASE7B_WP2_PACKET_SHA256_INVALID" }
  if (-not (Test-Path -LiteralPath $LiteralPath -PathType Leaf)) { throw "PHASE7B_WP2_PACKET_NOT_FOUND" }
  $stream = [IO.File]::OpenRead((Resolve-Path -LiteralPath $LiteralPath).Path)
  try {
    $buffer = New-Object byte[] 22
    $read = $stream.Read($buffer, 0, $buffer.Length)
  } finally { $stream.Dispose() }
  $header = if ($read -gt 0) { [Text.Encoding]::ASCII.GetString($buffer, 0, $read) } else { "" }
  $actual = Get-Phase7BSha256 -LiteralPath $LiteralPath
  $encrypted = $header.StartsWith("age-encryption.org/v1")
  [pscustomobject][ordered]@{
    pass = $encrypted -and $actual -eq $ExpectedSha256.ToLowerInvariant()
    classification = if (-not $encrypted) { "PHASE7B_WP2_PLAINTEXT_OR_UNKNOWN_PACKET_REJECTED" } elseif ($actual -ne $ExpectedSha256.ToLowerInvariant()) { "PHASE7B_WP2_PACKET_HASH_MISMATCH" } else { "PHASE7B_WP2_ENCRYPTED_PACKET_PASS" }
    packetSha256 = $actual
    packetBytes = (Get-Item -LiteralPath $LiteralPath).Length
    ageHeaderPresent = $encrypted
  }
}

function Test-Phase7BPacketReplica {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string]$LocalPacketPath,
    [Parameter(Mandatory = $true)][string]$ReplicaPacketPath,
    [Parameter(Mandatory = $true)][string]$ExpectedSha256
  )
  $local = Test-Phase7BEncryptedPacket -LiteralPath $LocalPacketPath -ExpectedSha256 $ExpectedSha256
  $replica = Test-Phase7BEncryptedPacket -LiteralPath $ReplicaPacketPath -ExpectedSha256 $ExpectedSha256
  [pscustomobject][ordered]@{
    pass = $local.pass -and $replica.pass -and $local.packetBytes -eq $replica.packetBytes
    classification = if ($local.pass -and $replica.pass -and $local.packetBytes -eq $replica.packetBytes) { "PHASE7B_WP2_ENCRYPTED_REPLICA_PASS" } else { "PHASE7B_WP2_ENCRYPTED_REPLICA_FAIL" }
    packetSha256 = $ExpectedSha256.ToLowerInvariant()
    localBytes = $local.packetBytes
    replicaBytes = $replica.packetBytes
  }
}

function Test-Phase7BWorkPackage2ReferenceIndexFile {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string]$LiteralPath,
    [Parameter(Mandatory = $true)][string]$ExpectedFileSha256,
    [Parameter(Mandatory = $true)][string]$ExpectedSemanticSha256,
    [Parameter(Mandatory = $true)][int64]$ExpectedBytes
  )
  if ($ExpectedFileSha256 -notmatch '^[0-9a-f]{64}$' -or $ExpectedSemanticSha256 -notmatch '^[0-9a-f]{64}$' -or
      -not (Test-Path -LiteralPath $LiteralPath -PathType Leaf)) { throw 'PHASE7B_WP2_REFERENCE_INDEX_IDENTITY_INVALID' }
  $text = Get-Content -LiteralPath $LiteralPath -Raw -ErrorAction Stop
  $index = $text | ConvertFrom-Json -ErrorAction Stop
  $unsigned = [ordered]@{}
  foreach ($property in @($index.PSObject.Properties | Where-Object { $_.Name -ne 'referenceIndexSha256' })) { $unsigned[$property.Name] = $property.Value }
  $collections = @($index.collections); $recordTotal = [int](($collections | Measure-Object count -Sum).Sum)
  $pass = (Get-Phase7BSha256 -LiteralPath $LiteralPath) -eq $ExpectedFileSha256 -and
    (Get-Item -LiteralPath $LiteralPath).Length -eq $ExpectedBytes -and
    [int]$index.schemaVersion -eq 1 -and [string]$index.referenceIndexVersion -eq 'phase7b-wp2-reference-index-v1' -and
    [string]$index.classification -eq 'PHASE7B_WP2_REFERENCE_INDEX' -and
    (Get-Phase7BSha256 -Text (ConvertTo-Phase7BCanonicalJson -InputObject $unsigned)) -eq $ExpectedSemanticSha256 -and
    [string]$index.referenceIndexSha256 -eq $ExpectedSemanticSha256 -and
    [int]$index.collectionCount -eq 39 -and $collections.Count -eq 39 -and @($collections.name | Sort-Object -Unique).Count -eq 39 -and
    [int]$index.recordCount -eq $recordTotal -and [int]$index.mediaCount -eq @($index.media).Count -and
    [int]$index.relationshipCount -eq @($index.relationships).Count -and
    [string]$index.founderCutoffPolicy.founderMeaningfulDataThrough -eq '2026-08-16' -and
    [string]$index.founderCutoffPolicy.founderDowntimeBegan -eq '2026-08-17' -and
    -not [bool]$index.founderCutoffPolicy.destructiveFilteringPerformed -and -not [bool]$index.founderCutoffPolicy.provenanceInferred
  [pscustomobject][ordered]@{ pass = [bool]$pass; classification = if ($pass) { 'PHASE7B_WP2_REFERENCE_INDEX_FILE_PASS' } else { 'PHASE7B_WP2_REFERENCE_INDEX_FILE_FAIL' }; referenceIndexSha256 = if ($pass) { $ExpectedSemanticSha256 } else { $null }; collectionCount = if ($pass) { 39 } else { 0 }; recordCount = if ($pass) { $recordTotal } else { 0 } }
}

function Test-Phase7BWorkPackage2MediaFileSet {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][AllowEmptyCollection()][string[]]$FileNames,
    [Parameter(Mandatory = $true)][string]$PacketFileName,
    [Parameter()][string]$AgeFileName = 'age.exe'
  )
  $actual = @($FileNames | ForEach-Object { [string]$_ } | Sort-Object)
  $expected = @($PacketFileName, 'phase7b-wp2-packet-descriptor.json', $AgeFileName) | Sort-Object
  $pass = $actual.Count -eq 3 -and ($actual -join '|') -ceq ($expected -join '|')
  [pscustomobject][ordered]@{
    pass = $pass
    classification = if ($pass) { 'PHASE7B_WP2_MEDIA_FILE_SET_PASS' } else { 'PHASE7B_WP2_MEDIA_FILE_SET_FAIL' }
    fileCount = $actual.Count
  }
}

function Test-Phase7BWorkPackage2StagingFileSet {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][AllowEmptyCollection()][string[]]$RelativeFileNames,
    [Parameter(Mandatory = $true)][string]$PacketFileName,
    [Parameter(Mandatory = $true)][string]$AttemptId,
    [Parameter(Mandatory = $true)][ValidateSet('Empty', 'Complete')][string]$ExpectedState
  )

  $actual = @($RelativeFileNames | ForEach-Object { ([string]$_).Replace('\', '/') } | Sort-Object -CaseSensitive)
  $expected = @(if ($ExpectedState -eq 'Complete') { @($PacketFileName, "$AttemptId-descriptor.json", "$AttemptId-age.exe") | Sort-Object -CaseSensitive })
  $pass = $actual.Count -eq $expected.Count -and ($actual -join '|') -ceq ($expected -join '|')
  [pscustomobject][ordered]@{
    pass = $pass
    classification = if ($pass) { "PHASE7B_WP2_STAGING_FILE_SET_$($ExpectedState.ToUpperInvariant())_PASS" } else { "PHASE7B_WP2_STAGING_FILE_SET_$($ExpectedState.ToUpperInvariant())_FAIL" }
    fileCount = $actual.Count
  }
}

function Test-Phase7BWorkPackage2RestoreEvidence {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][bool]$ManifestPass,
    [Parameter(Mandatory = $true)][bool]$FileDigestsPass,
    [Parameter(Mandatory = $true)][bool]$GuestIdentityPass,
    [Parameter(Mandatory = $true)][bool]$TaskSetPass,
    [Parameter(Mandatory = $true)][bool]$StoppedControlsPass,
    [Parameter(Mandatory = $true)][bool]$CredentialScanPass,
    [Parameter(Mandatory = $true)][int]$RuntimeListenerCount,
    [Parameter(Mandatory = $true)][int]$PhysiqueOsProcessCount,
    [Parameter(Mandatory = $true)][int]$MappedHgfsDiskCount,
    [Parameter(Mandatory = $true)][int]$MappedHgfsConnectionCount,
    [Parameter(Mandatory = $true)][int]$EnabledTaskCount
  )
  $pass = $ManifestPass -and $FileDigestsPass -and $GuestIdentityPass -and $TaskSetPass -and
    $StoppedControlsPass -and $CredentialScanPass -and $RuntimeListenerCount -eq 0 -and
    $PhysiqueOsProcessCount -eq 0 -and $MappedHgfsDiskCount -eq 0 -and
    $MappedHgfsConnectionCount -eq 0 -and $EnabledTaskCount -eq 0
  [pscustomobject][ordered]@{
    pass = $pass
    classification = if ($pass) { "PHASE7B_WP2_ISOLATED_RESTORE_VERIFICATION_PASS_INERT" } else { "PHASE7B_WP2_ISOLATED_RESTORE_VERIFICATION_FAIL" }
    runtimeListenerCount = $RuntimeListenerCount
    physiqueOsProcessCount = $PhysiqueOsProcessCount
    mappedHgfsDiskCount = $MappedHgfsDiskCount
    mappedHgfsConnectionCount = $MappedHgfsConnectionCount
    enabledTaskCount = $EnabledTaskCount
  }
}

function Get-Phase7BWorkPackage2RecoveryDecision {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][bool]$MutationStarted,
    [Parameter(Mandatory = $true)][bool]$AcceptedPass,
    [Parameter()][bool]$PartialCapture,
    [Parameter()][bool]$PartialReplica,
    [Parameter()][bool]$PartialStage,
    [Parameter()][bool]$PartialRestore,
    [Parameter()][bool]$AmbiguousResult
  )
  if ($AcceptedPass -and ($PartialCapture -or $PartialReplica -or $PartialStage -or $PartialRestore -or $AmbiguousResult)) { throw "PHASE7B_WP2_ACCEPTED_WITH_PARTIAL_STATE_INCONSISTENT" }
  $mustStop = -not $AcceptedPass
  [pscustomobject][ordered]@{
    classification = if ($AcceptedPass) { "PHASE7B_WP2_ACCEPTED" } elseif ($AmbiguousResult -or $MutationStarted) { "PHASE7B_WP2_RECONCILIATION_ONLY_NEW_AUTHORIZATION_REQUIRED" } else { "PHASE7B_WP2_FRESH_AUTHORIZATION_REQUIRED" }
    automaticRetryAllowed = $false
    stopRequired = $mustStop
    reconciliationOnly = [bool](-not $AcceptedPass -and ($AmbiguousResult -or $MutationStarted))
    newFounderAuthorizationRequired = -not $AcceptedPass
  }
}

function Test-Phase7BWorkPackage2AgeVersionOutput {
  [CmdletBinding()] param(
    [Parameter(Mandatory = $true)][AllowEmptyCollection()][string[]]$OutputLines,
    [Parameter(Mandatory = $true)][int]$ExitCode
  )
  $text = (@($OutputLines | ForEach-Object { [string]$_ }) -join ' ').Trim()
  $match = [regex]::Match($text, '^(?i:(?:age\s+)?v?)(?<major>0|[1-9][0-9]*)\.(?<minor>0|[1-9][0-9]*)\.(?<patch>0|[1-9][0-9]*)$')
  $major = if ($match.Success) { [int]$match.Groups['major'].Value } else { -1 }
  $minor = if ($match.Success) { [int]$match.Groups['minor'].Value } else { -1 }
  $patch = if ($match.Success) { [int]$match.Groups['patch'].Value } else { -1 }
  $pass = $ExitCode -eq 0 -and $match.Success -and $major -eq 1 -and $minor -ge 3
  [pscustomobject][ordered]@{
    classification = if ($pass) { 'PHASE7B_WP2_AGE_VERSION_SUPPORTED' } else { 'PHASE7B_WP2_AGE_VERSION_UNSUPPORTED' }
    pass = [bool]$pass
    normalizedVersion = if ($match.Success) { "$major.$minor.$patch" } else { '' }
    outputFormat = if ($text -cmatch '^v[0-9]') { 'OFFICIAL_V_PREFIX' } elseif ($text -cmatch '^age v[0-9]') { 'LEGACY_AGE_V_PREFIX' } elseif ($text -cmatch '^age [0-9]') { 'LEGACY_AGE_PREFIX' } elseif ($text -cmatch '^[0-9]') { 'PLAIN_SEMVER' } else { 'UNRECOGNIZED' }
  }
}

Export-ModuleMember -Function @(
  "Get-Phase7BWorkPackage2Contract",
  "ConvertTo-Phase7BCanonicalJson",
  "Assert-Phase7BWorkPackage2Authorization",
  "Test-Phase7BWorkPackage2RelativePath",
  "Test-Phase7BWorkPackage2CredentialSignal",
  "New-Phase7BWorkPackage2Inventory",
  "New-Phase7BDeterministicPacketZip",
  "Expand-Phase7BSafePacketZip",
  "Test-Phase7BEncryptedPacket",
  "Test-Phase7BPacketReplica",
  "Test-Phase7BWorkPackage2ReferenceIndexFile",
  "Test-Phase7BWorkPackage2MediaFileSet",
  "Test-Phase7BWorkPackage2StagingFileSet",
  "Test-Phase7BWorkPackage2RestoreEvidence",
  "Test-Phase7BWorkPackage2AgeVersionOutput",
  "Get-Phase7BWorkPackage2RecoveryDecision"
)
