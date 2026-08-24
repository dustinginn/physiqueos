[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("Inspect", "VerifyStagedPacket", "StageEncryptedPacket", "DecryptAndRestore", "VerifyRestore")]
  [string]$Operation,
  [Parameter()][string]$AttemptId,
  [Parameter()][string]$AuthorizationPath,
  [Parameter()][string]$ExpectedAuthorizationSha256,
  [Parameter()][string]$PacketPath,
  [Parameter()][string]$ExpectedSha256,
  [Parameter()][string]$DescriptorPath,
  [Parameter()][string]$ExpectedDescriptorSha256,
  [Parameter()][string]$AgeExePath,
  [Parameter()][string]$ExpectedAgeExeSha256,
  [Parameter()][string]$ReportPath
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot "phase7bIsolatedGuestContract.psm1") -Force
Import-Module (Join-Path $PSScriptRoot "phase7bWorkPackage2Contract.psm1") -Force
Import-Module (Join-Path $PSScriptRoot "phase7bIsolatedGuestReconciliation.psm1") -Force
Import-Module (Join-Path $PSScriptRoot "phase7bIsolatedGuestContract.psm1") -Force
$guestContract = Get-Phase7BIsolatedGuestContract
$contract = Get-Phase7BWorkPackage2Contract
$nonce = [Guid]::NewGuid().ToString("N")
$timestamp = [DateTime]::UtcNow.ToString("o")
$mutationStarted = $false
$authorizationAccepted = $false
$stage = "initialize"
$temporaryZip = $null
$incompleteRestore = $null

if ($Operation -in @("StageEncryptedPacket", "DecryptAndRestore") -and
    ([string]::IsNullOrWhiteSpace($AuthorizationPath) -or [string]::IsNullOrWhiteSpace($ExpectedAuthorizationSha256))) {
  throw "PHASE7B_WORK_PACKAGE2_NOT_AUTHORIZED"
}

$incoming = Join-Path $guestContract.isolatedRoot "incoming"
$restore = Join-Path $guestContract.isolatedRoot "restore\canonical"

function Write-SafeResult([Collections.IDictionary]$Result) {
  if (-not [string]::IsNullOrWhiteSpace($ReportPath)) { throw "PHASE7B_WP2_REPORT_PATH_IS_SOURCE_OWNED" }
  $persist = $authorizationAccepted -and $Operation -in @('StageEncryptedPacket', 'DecryptAndRestore', 'VerifyRestore')
  $reportFull = $null
  if ($persist) {
    $reportsRoot = [IO.Path]::GetFullPath((Join-Path $guestContract.isolatedRoot "reports")).TrimEnd('\')
    if (-not (Test-Path -LiteralPath $reportsRoot -PathType Container)) { throw "PHASE7B_WP2_REPORT_DIRECTORY_MISSING" }
    $reportFileName = "wp2-$($Operation.ToLowerInvariant())-$nonce.json"
    $reportFull = Join-Path $reportsRoot $reportFileName
    $Result['reportFileName'] = $reportFileName
    $Result['reportPath'] = $reportFull
  }
  $json = $Result | ConvertTo-Json -Depth 8
  if ($persist) {
    $bytes = (New-Object Text.UTF8Encoding($false)).GetBytes($json)
    $stream = New-Object IO.FileStream($reportFull, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try { $stream.Write($bytes, 0, $bytes.Length); $stream.Flush() } finally { $stream.Dispose() }
    $projection = [ordered]@{}
    foreach ($key in $Result.Keys) { $projection[$key] = $Result[$key] }
    $projection.reportSha256 = Get-Phase7BSha256 -LiteralPath $reportFull
    return ($projection | ConvertTo-Json -Depth 8)
  }
  return $json
}

function Read-BoundDescriptor {
  if ([string]::IsNullOrWhiteSpace($DescriptorPath) -or [string]::IsNullOrWhiteSpace($ExpectedDescriptorSha256) -or
      $ExpectedDescriptorSha256 -notmatch '^[0-9a-fA-F]{64}$') { throw "PHASE7B_WP2_DESCRIPTOR_IDENTITY_REQUIRED" }
  if (-not (Test-Path -LiteralPath $DescriptorPath -PathType Leaf) -or
      (Get-Phase7BSha256 -LiteralPath $DescriptorPath) -ne $ExpectedDescriptorSha256.ToLowerInvariant()) { throw "PHASE7B_WP2_DESCRIPTOR_HASH_MISMATCH" }
  $descriptor = Get-Content -LiteralPath $DescriptorPath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
  if ([int]$descriptor.schemaVersion -ne 1 -or [string]$descriptor.classification -ne "PHASE7B_WP2_ENCRYPTED_PACKET_AND_REPLICA_PASS" -or
      [string]$descriptor.attemptId -ne $AttemptId -or [string]$descriptor.applicationCommit -ne $contract.applicationCommit -or
      [string]$descriptor.environmentId -ne $contract.environmentId -or [string]$descriptor.vmDisplayName -ne $contract.vmDisplayName -or
      [string]$descriptor.packetFileName -ne (Split-Path -Leaf $PacketPath) -or [string]$descriptor.packetSha256 -ne $ExpectedSha256.ToLowerInvariant() -or -not [bool]$descriptor.localEncryptedCopyPass -or
      -not [bool]$descriptor.independentEncryptedReplicaPass -or [string]$descriptor.ageFileName -ne $contract.ageMediaFileName -or
      [string]$descriptor.ageExeSha256 -notmatch '^[0-9a-f]{64}$') { throw "PHASE7B_WP2_DESCRIPTOR_BINDING_MISMATCH" }
  $descriptor
}

function Get-CurrentGuestIdentity {
  $computer = Get-CimInstance Win32_ComputerSystem -ErrorAction Stop
  $toolsService = Get-Service -Name VMTools -ErrorAction SilentlyContinue
  $toolsExecutablePresent = (Test-Path -LiteralPath 'C:\Program Files\VMware\VMware Tools\vmtoolsd.exe' -PathType Leaf) -or
    (Test-Path -LiteralPath 'C:\Program Files\VMware\VMware Tools\VMwareToolboxCmd.exe' -PathType Leaf)
  $hgfsClient = 'C:\Program Files\VMware\VMware Tools\VMwareHgfsClient.exe'
  $sharedFolderNames = @()
  $enumerationExitCode = -1
  if (Test-Path -LiteralPath $hgfsClient -PathType Leaf) {
    $sharedFolderNames = @(& $hgfsClient 2>$null | Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) })
    $enumerationExitCode = $LASTEXITCODE
  }
  $hgfsDriver = Get-CimInstance Win32_SystemDriver -Filter "Name='vmhgfs'" -ErrorAction SilentlyContinue
  $mappedDisks = @(Get-CimInstance Win32_LogicalDisk -ErrorAction Stop | Where-Object { [string]$_.ProviderName -match '(?i)vmware-host|\\vmware-host' })
  $mappedConnections = @(Get-CimInstance Win32_NetworkConnection -ErrorAction Stop | Where-Object { [string]$_.RemoteName -match '(?i)vmware-host|\\vmware-host' })
  Test-Phase7BVmwareGuestIdentity -Manufacturer ([string]$computer.Manufacturer) -Model ([string]$computer.Model) `
    -ToolsServicePresent ($null -ne $toolsService) -ToolsServiceRunning ($toolsService -and $toolsService.Status -eq 'Running') `
    -ToolsExecutablePresent $toolsExecutablePresent -SharedFolderEnumerationAvailable (Test-Path -LiteralPath $hgfsClient -PathType Leaf) `
    -SharedFolderEnumerationExitCode $enumerationExitCode -SharedFolderNames $sharedFolderNames `
    -HgfsDriverPresent ($null -ne $hgfsDriver) -HgfsDriverRunning ($hgfsDriver -and [string]$hgfsDriver.State -eq 'Running') `
    -MappedHgfsDiskCount $mappedDisks.Count -MappedHgfsConnectionCount $mappedConnections.Count
}

function Test-RestoredPacket([string]$Root) {
  $manifestPath = Join-Path $Root "packet-manifest.json"
  if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw "PHASE7B_WP2_RESTORED_MANIFEST_MISSING" }
  $manifest = Get-Content -LiteralPath $manifestPath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
  if ([int]$manifest.schemaVersion -ne 2 -or [string]$manifest.classification -ne "PHASE7B_WP2_DECRYPTED_PACKET_MANIFEST" -or
      [string]$manifest.attemptId -ne $AttemptId -or [string]$manifest.applicationCommit -ne $contract.applicationCommit -or
      [string]$manifest.environmentId -ne $contract.environmentId -or [string]$manifest.vmDisplayName -ne $contract.vmDisplayName -or
      [string]$manifest.manifestDigest -ne $contract.manifestDigest) { throw "PHASE7B_WP2_RESTORED_MANIFEST_BINDING_MISMATCH" }
  $files = @($manifest.files)
  if ($files.Count -eq 0 -or $files.Count -ne [int]$manifest.fileCount) { throw "PHASE7B_WP2_RESTORED_MANIFEST_CARDINALITY_FAIL" }
  $seen = @{}
  $totalBytes = [int64]0
  foreach ($file in $files) {
    $pathCheck = Test-Phase7BWorkPackage2RelativePath -RelativePath ([string]$file.logicalPath)
    if (-not $pathCheck.pass -or $seen.ContainsKey($pathCheck.normalizedPath.ToLowerInvariant())) { throw "PHASE7B_WP2_RESTORED_MANIFEST_PATH_FAIL" }
    $seen[$pathCheck.normalizedPath.ToLowerInvariant()] = $true
    $path = [IO.Path]::GetFullPath((Join-Path $Root $pathCheck.normalizedPath.Replace('/', '\')))
    if (-not $path.StartsWith([IO.Path]::GetFullPath($Root).TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase) -or
        -not (Test-Path -LiteralPath $path -PathType Leaf) -or (Get-Phase7BSha256 -LiteralPath $path) -ne [string]$file.sha256 -or
        (Get-Item -LiteralPath $path).Length -ne [int64]$file.bytes) { throw "PHASE7B_WP2_RESTORED_FILE_DIGEST_FAIL" }
    if (-not (Test-Phase7BWorkPackage2CredentialSignal -LiteralPath $path).pass) { throw "PHASE7B_WP2_RESTORED_CREDENTIAL_SIGNAL" }
    $totalBytes += [int64]$file.bytes
  }
  $reference = $manifest.referenceIndex
  $referencePath = Join-Path $Root 'reference-index.json'
  $referencePass = Test-Phase7BWorkPackage2ReferenceIndexFile -LiteralPath $referencePath -ExpectedFileSha256 ([string]$reference.fileSha256) -ExpectedSemanticSha256 ([string]$reference.semanticSha256) -ExpectedBytes ([int64]$reference.bytes)
  if (-not $referencePass.pass -or [string]$reference.fileName -ne 'reference-index.json' -or [string]$reference.version -ne 'phase7b-wp2-reference-index-v1') { throw 'PHASE7B_WP2_RESTORED_REFERENCE_INDEX_FAIL' }
  $prefix = [IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
  $actualFiles = @(Get-ChildItem -LiteralPath $Root -File -Recurse | ForEach-Object { $_.FullName.Substring($prefix.Length).Replace('\', '/') })
  if ($actualFiles.Count -ne $files.Count + 2 -or @($actualFiles | Where-Object { $_ -notin @('packet-manifest.json','reference-index.json') -and -not $seen.ContainsKey($_.ToLowerInvariant()) }).Count -gt 0) { throw "PHASE7B_WP2_RESTORED_UNEXPECTED_FILE_SET" }
  [pscustomobject][ordered]@{ pass = $true; fileCount = $files.Count; totalBytes = $totalBytes; sourceInventorySha256 = [string]$manifest.sourceInventorySha256; referenceIndexSha256 = $referencePass.referenceIndexSha256; referenceRecordCount = $referencePass.recordCount }
}

try {
  if ($Operation -eq "Inspect") {
    $pathsReady = (Test-Path -LiteralPath $incoming -PathType Container) -and (Test-Path -LiteralPath $restore -PathType Container)
    Write-SafeResult ([ordered]@{ schemaVersion = 2; nonce = $nonce; observedAt = $timestamp; operation = $Operation; classification = if ($pathsReady) { "WP2_INTERFACE_PREPARED_INERT" } else { "WP2_INTERFACE_PATHS_MISSING" }; pass = $pathsReady; applicationCommit = $contract.applicationCommit; environmentId = $contract.environmentId; authorizedStagesRequired = $true; automaticRetryAllowed = $false; mutationPerformed = $false })
    exit $(if ($pathsReady) { 0 } else { 1 })
  }

  foreach ($required in @($AttemptId, $PacketPath, $ExpectedSha256)) { if ([string]::IsNullOrWhiteSpace($required)) { throw "PHASE7B_PACKET_IDENTITY_REQUIRED" } }
  if ($AttemptId -notmatch '^phase7b-wp2-[0-9a-f]{32}$' -or $ExpectedSha256 -notmatch '^[0-9a-fA-F]{64}$') { throw "PHASE7B_PACKET_IDENTITY_INVALID" }

  if ($Operation -eq "VerifyStagedPacket") {
    $resolved = (Resolve-Path -LiteralPath $PacketPath -ErrorAction Stop).Path
    if (-not $resolved.StartsWith([IO.Path]::GetFullPath($incoming).TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw "PHASE7B_PACKET_OUTSIDE_INCOMING" }
    $packet = Test-Phase7BEncryptedPacket -LiteralPath $resolved -ExpectedSha256 $ExpectedSha256
    Write-SafeResult ([ordered]@{ schemaVersion = 2; nonce = $nonce; observedAt = $timestamp; operation = $Operation; classification = $packet.classification; pass = $packet.pass; attemptId = $AttemptId; packetFileName = Split-Path -Leaf $resolved; packetSha256 = $packet.packetSha256; packetBytes = $packet.packetBytes; mutationPerformed = $false })
    if (-not $packet.pass) { exit 1 }
    exit 0
  }

  $descriptor = Read-BoundDescriptor
  $authorizationStage = switch ($Operation) { "StageEncryptedPacket" { "WP2C_STAGE" }; "DecryptAndRestore" { "WP2C_RESTORE" }; "VerifyRestore" { "WP2C_VERIFY" } }
  if (-not [IO.Path]::GetFullPath($AuthorizationPath).Equals([IO.Path]::GetFullPath($DescriptorPath), [StringComparison]::OrdinalIgnoreCase) -or
      $ExpectedAuthorizationSha256.ToLowerInvariant() -ne $ExpectedDescriptorSha256.ToLowerInvariant()) { throw "PHASE7B_WP2_GUEST_AUTHORIZATION_MUST_BE_MEDIA_DESCRIPTOR" }
  [void](Assert-Phase7BWorkPackage2Authorization -LiteralPath $AuthorizationPath -ExpectedSha256 $ExpectedAuthorizationSha256 -ExpectedStage $authorizationStage -ExpectedAttemptId $AttemptId -ExpectedPacketSha256 $ExpectedSha256)
  $authorizationAccepted = $true

  if ($Operation -eq "StageEncryptedPacket") {
    $stage = "validate-optical-source"
    $optical = @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=5' | Where-Object { $_.VolumeName -eq $contract.opticalVolumeLabel })
    if ($optical.Count -ne 1) { throw "PHASE7B_WP2_OPTICAL_IDENTITY_FAIL" }
    $opticalRoot = ([string]$optical[0].DeviceID).TrimEnd('\') + '\'
    $resolvedPacket = (Resolve-Path -LiteralPath $PacketPath -ErrorAction Stop).Path
    $resolvedDescriptor = (Resolve-Path -LiteralPath $DescriptorPath -ErrorAction Stop).Path
    if (-not $resolvedPacket.StartsWith($opticalRoot, [StringComparison]::OrdinalIgnoreCase) -or -not $resolvedDescriptor.StartsWith($opticalRoot, [StringComparison]::OrdinalIgnoreCase)) { throw "PHASE7B_WP2_MEDIA_SOURCE_MISMATCH" }
    $opticalFiles = @(Get-ChildItem -LiteralPath $opticalRoot -File -ErrorAction Stop)
    $mediaFileSet = Test-Phase7BWorkPackage2MediaFileSet -FileNames @($opticalFiles.Name) -PacketFileName (Split-Path -Leaf $resolvedPacket) -AgeFileName $contract.ageMediaFileName
    if (-not $mediaFileSet.pass) { throw $mediaFileSet.classification }
    $packet = Test-Phase7BEncryptedPacket -LiteralPath $resolvedPacket -ExpectedSha256 $ExpectedSha256
    if (-not $packet.pass) { throw $packet.classification }
    $resolvedAge = Join-Path $opticalRoot $contract.ageMediaFileName
    if (-not (Test-Path -LiteralPath $resolvedAge -PathType Leaf) -or (Get-Phase7BSha256 -LiteralPath $resolvedAge) -ne [string]$descriptor.ageExeSha256) { throw "PHASE7B_WP2_AGE_IDENTITY_MISMATCH" }
    $destinationPacket = Join-Path $incoming (Split-Path -Leaf $resolvedPacket)
    $destinationDescriptor = Join-Path $incoming "$AttemptId-descriptor.json"
    $destinationAge = Join-Path $incoming "$AttemptId-age.exe"
    $incomingPrefix = [IO.Path]::GetFullPath($incoming).TrimEnd('\') + '\'
    $incomingBefore = @(Get-ChildItem -LiteralPath $incoming -File -Recurse -Force -ErrorAction Stop | ForEach-Object { $_.FullName.Substring($incomingPrefix.Length).Replace('\', '/') })
    if (-not (Test-Phase7BWorkPackage2StagingFileSet -RelativeFileNames $incomingBefore -PacketFileName (Split-Path -Leaf $resolvedPacket) -AttemptId $AttemptId -ExpectedState Empty).pass) { throw "PHASE7B_WP2_STAGING_DESTINATION_NOT_EMPTY" }
    $stage = "stage-encrypted-packet"
    $mutationStarted = $true
    [IO.File]::Copy($resolvedPacket, $destinationPacket, $false)
    [IO.File]::Copy($resolvedDescriptor, $destinationDescriptor, $false)
    [IO.File]::Copy($resolvedAge, $destinationAge, $false)
    $staged = Test-Phase7BEncryptedPacket -LiteralPath $destinationPacket -ExpectedSha256 $ExpectedSha256
    $incomingAfter = @(Get-ChildItem -LiteralPath $incoming -File -Recurse -Force -ErrorAction Stop | ForEach-Object { $_.FullName.Substring($incomingPrefix.Length).Replace('\', '/') })
    $stagingSet = Test-Phase7BWorkPackage2StagingFileSet -RelativeFileNames $incomingAfter -PacketFileName (Split-Path -Leaf $resolvedPacket) -AttemptId $AttemptId -ExpectedState Complete
    if (-not $staged.pass -or -not $stagingSet.pass -or (Get-Phase7BSha256 -LiteralPath $destinationDescriptor) -ne $ExpectedDescriptorSha256.ToLowerInvariant() -or
        (Get-Phase7BSha256 -LiteralPath $destinationAge) -ne [string]$descriptor.ageExeSha256) { throw "PHASE7B_WP2_STAGED_READBACK_FAIL" }
    Write-SafeResult ([ordered]@{ schemaVersion = 2; nonce = $nonce; observedAt = $timestamp; operation = $Operation; classification = "PHASE7B_WP2_ENCRYPTED_PACKET_STAGED_PASS"; pass = $true; attemptId = $AttemptId; packetFileName = Split-Path -Leaf $destinationPacket; packetSha256 = $ExpectedSha256.ToLowerInvariant(); descriptorSha256 = $ExpectedDescriptorSha256.ToLowerInvariant(); mutationPerformed = $true; automaticRetryAllowed = $false })
    exit 0
  }

  if ($Operation -eq "DecryptAndRestore") {
    $stage = "validate-decryption-input"
    $resolvedPacket = (Resolve-Path -LiteralPath $PacketPath -ErrorAction Stop).Path
    $resolvedDescriptor = (Resolve-Path -LiteralPath $DescriptorPath -ErrorAction Stop).Path
    $incomingPrefix = [IO.Path]::GetFullPath($incoming).TrimEnd('\') + '\'
    if (-not $resolvedPacket.StartsWith($incomingPrefix, [StringComparison]::OrdinalIgnoreCase) -or
        -not $resolvedDescriptor.StartsWith($incomingPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw "PHASE7B_PACKET_OUTSIDE_INCOMING" }
    $incomingFiles = @(Get-ChildItem -LiteralPath $incoming -File -Recurse -Force -ErrorAction Stop | ForEach-Object { $_.FullName.Substring($incomingPrefix.Length).Replace('\', '/') })
    if (-not (Test-Phase7BWorkPackage2StagingFileSet -RelativeFileNames $incomingFiles -PacketFileName (Split-Path -Leaf $resolvedPacket) -AttemptId $AttemptId -ExpectedState Complete).pass) { throw "PHASE7B_WP2_STAGING_FILE_SET_INCOMPLETE" }
    $packet = Test-Phase7BEncryptedPacket -LiteralPath $resolvedPacket -ExpectedSha256 $ExpectedSha256
    if (-not $packet.pass) { throw $packet.classification }
    $expectedStagedAge = Join-Path $incoming "$AttemptId-age.exe"
    if ([string]::IsNullOrWhiteSpace($AgeExePath) -or -not [IO.Path]::GetFullPath($AgeExePath).Equals([IO.Path]::GetFullPath($expectedStagedAge), [StringComparison]::OrdinalIgnoreCase) -or
        $ExpectedAgeExeSha256 -notmatch '^[0-9a-fA-F]{64}$' -or $ExpectedAgeExeSha256.ToLowerInvariant() -ne [string]$descriptor.ageExeSha256 -or
        -not (Test-Path -LiteralPath $AgeExePath -PathType Leaf) -or (Get-Phase7BSha256 -LiteralPath $AgeExePath) -ne $ExpectedAgeExeSha256.ToLowerInvariant()) { throw "PHASE7B_WP2_AGE_IDENTITY_MISMATCH" }
    $ageVersionLines = @(& $AgeExePath --version 2>&1)
    if (-not (Test-Phase7BWorkPackage2AgeVersionOutput -OutputLines @($ageVersionLines | ForEach-Object { [string]$_ }) -ExitCode $LASTEXITCODE).pass) { throw "PHASE7B_WP2_AGE_VERSION_UNSUPPORTED" }
    if ($Host.Name -ne "ConsoleHost" -or -not [Environment]::UserInteractive) { throw "PHASE7B_WP2_INTERACTIVE_SECRET_CONSOLE_REQUIRED" }
    $finalRestore = Join-Path $restore $contract.restoredPacketDirectoryName
    $incompleteRestore = Join-Path $restore ".incomplete-$AttemptId"
    $temporaryZip = Join-Path $restore ".decrypted-$AttemptId.zip"
    if ((Test-Path -LiteralPath $finalRestore) -or (Test-Path -LiteralPath $incompleteRestore) -or (Test-Path -LiteralPath $temporaryZip)) { throw "PHASE7B_WP2_RESTORE_DESTINATION_NOT_FRESH" }
    $stage = "interactive-age-decryption"
    $mutationStarted = $true
    Write-Host "PHASE7B_WP2_ENTER_PASSPHRASE_IN_AGE_TTY"
    & $AgeExePath -d -o $temporaryZip $resolvedPacket
    if ($LASTEXITCODE -ne 0) { throw "PHASE7B_WP2_AGE_DECRYPTION_FAILED" }
    $stage = "extract-and-verify"
    [void](Expand-Phase7BSafePacketZip -LiteralPath $temporaryZip -DestinationRoot $incompleteRestore)
    $verified = Test-RestoredPacket -Root $incompleteRestore
    Move-Item -LiteralPath $incompleteRestore -Destination $finalRestore -ErrorAction Stop
    $incompleteRestore = $null
    Write-SafeResult ([ordered]@{ schemaVersion = 2; nonce = $nonce; observedAt = $timestamp; operation = $Operation; classification = "PHASE7B_WP2_DECRYPT_AND_RESTORE_PASS"; pass = $true; attemptId = $AttemptId; packetSha256 = $ExpectedSha256.ToLowerInvariant(); sourceInventorySha256 = $verified.sourceInventorySha256; restoredFileCount = $verified.fileCount; restoredBytes = $verified.totalBytes; mutationPerformed = $true; plaintextSecretPersisted = $false; automaticRetryAllowed = $false })
    exit 0
  }

  if ($Operation -eq "VerifyRestore") {
    $stage = "verify-restored-state"
    $finalRestore = Join-Path $restore $contract.restoredPacketDirectoryName
    $resolvedDescriptor = (Resolve-Path -LiteralPath $DescriptorPath -ErrorAction Stop).Path
    $incomingPrefix = [IO.Path]::GetFullPath($incoming).TrimEnd('\') + '\'
    if (-not $resolvedDescriptor.StartsWith($incomingPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw "PHASE7B_WP2_DESCRIPTOR_OUTSIDE_INCOMING" }
    $incomingFiles = @(Get-ChildItem -LiteralPath $incoming -File -Recurse -Force -ErrorAction Stop | ForEach-Object { $_.FullName.Substring($incomingPrefix.Length).Replace('\', '/') })
    if (-not (Test-Phase7BWorkPackage2StagingFileSet -RelativeFileNames $incomingFiles -PacketFileName (Split-Path -Leaf $PacketPath) -AttemptId $AttemptId -ExpectedState Complete).pass) { throw "PHASE7B_WP2_STAGING_FILE_SET_INCOMPLETE" }
    $verified = Test-RestoredPacket -Root $finalRestore
    $marker = Get-Content -LiteralPath (Join-Path $guestContract.isolatedRoot "guest-identity-marker.json") -Raw -ErrorAction Stop | ConvertFrom-Json
    $markerPass = [string]$marker.windowsHostId -eq $contract.windowsHostId -and [string]$marker.applicationCommit -eq $contract.applicationCommit -and [string]$marker.manifestDigest -eq $contract.manifestDigest
    $guestIdentity = Get-CurrentGuestIdentity
    $taskNames = @($guestContract.productionTaskName, $guestContract.monitorTaskName, $guestContract.ngrokTaskName)
    $tasks = @($taskNames | ForEach-Object { Get-ScheduledTask -TaskName $_ -ErrorAction SilentlyContinue })
    $taskProjections = @($tasks | ForEach-Object { Get-Phase7BReconciliationTaskProjection -Task $_ })
    $taskEvidence = Test-Phase7BInertTaskSet -TaskProjections $taskProjections -Contract $guestContract
    $enabledTaskCount = @($taskProjections | Where-Object { $_.enabled }).Count
    $taskSetPass = $taskEvidence.pass -and $tasks.Count -eq 3 -and $enabledTaskCount -eq 0
    $runtimeControl = Get-Content -LiteralPath (Join-Path $guestContract.repositoryRoot "logs\physiqueos-runtime-control.json") -Raw | ConvertFrom-Json
    $ngrokControl = Get-Content -LiteralPath (Join-Path $guestContract.repositoryRoot "logs\physiqueos-ngrok-control.json") -Raw | ConvertFrom-Json
    $controlsPass = [int]$runtimeControl.schemaVersion -eq 1 -and [string]$runtimeControl.desiredState -eq 'stopped' -and
      [string]$runtimeControl.changedBy -eq 'phase7b-isolated-guest-bootstrap' -and [string]$runtimeControl.reason -eq 'checkpoint9-inert-before-restore' -and
      [int]$ngrokControl.schemaVersion -eq 1 -and [string]$ngrokControl.ngrokDesiredState -eq 'stopped' -and
      [string]$ngrokControl.changedBy -eq 'phase7b-isolated-guest-bootstrap' -and [string]$ngrokControl.reason -eq 'checkpoint9-inert-before-routing-authorization'
    $listeners = @(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue)
    $processes = @(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object { $_.Name -in @('node.exe', 'ngrok.exe') -and [string]$_.CommandLine -match '(?i)(physiqueos|next|runBriefingCadence|http\s+3000)' })
    $gitPath = 'C:\Program Files\Git\cmd\git.exe'
    $repositoryHead = $null
    $repositoryClean = $false
    if (Test-Path -LiteralPath $gitPath -PathType Leaf) {
      Push-Location $guestContract.repositoryRoot
      try {
        $repositoryHead = (& $gitPath --no-optional-locks rev-parse HEAD 2>$null).Trim()
        $repositoryClean = @(& $gitPath --no-optional-locks status --porcelain=v1 --untracked-files=all 2>$null).Count -eq 0
      } finally { Pop-Location }
    }
    $repositoryPass = $repositoryHead -eq $contract.applicationCommit -and $repositoryClean
    $evidence = Test-Phase7BWorkPackage2RestoreEvidence -ManifestPass $true -FileDigestsPass $true -GuestIdentityPass ($markerPass -and $guestIdentity.pass -and $repositoryPass) -TaskSetPass $taskSetPass -StoppedControlsPass $controlsPass -CredentialScanPass $true -RuntimeListenerCount $listeners.Count -PhysiqueOsProcessCount $processes.Count -MappedHgfsDiskCount $guestIdentity.mappedHgfsDiskCount -MappedHgfsConnectionCount $guestIdentity.mappedHgfsConnectionCount -EnabledTaskCount $enabledTaskCount
    Write-SafeResult ([ordered]@{ schemaVersion = 2; nonce = $nonce; observedAt = $timestamp; operation = $Operation; classification = $evidence.classification; pass = $evidence.pass; attemptId = $AttemptId; packetSha256 = $ExpectedSha256.ToLowerInvariant(); sourceInventorySha256 = $verified.sourceInventorySha256; restoredFileCount = $verified.fileCount; guestIdentityPass = $guestIdentity.pass; guestIdentityMarkerPass = $markerPass; repositoryHead = $repositoryHead; repositoryClean = $repositoryClean; taskSetPass = $taskSetPass; taskCount = $tasks.Count; enabledTaskCount = $enabledTaskCount; stoppedControlsPass = $controlsPass; runtimeListenerCount = $listeners.Count; physiqueOsProcessCount = $processes.Count; mappedHgfsDiskCount = $guestIdentity.mappedHgfsDiskCount; mappedHgfsConnectionCount = $guestIdentity.mappedHgfsConnectionCount; credentialScanPass = $true; mutationPerformed = $false; workPackage2RestoreAccepted = $evidence.pass })
    if (-not $evidence.pass) { exit 1 }
  }
} catch {
  $safeCode = if ($_.Exception.Message -match '^PHASE7B_') { $_.Exception.Message } else { "PHASE7B_WP2_GUEST_RESTORE_EXCEPTION" }
  Write-SafeResult ([ordered]@{ schemaVersion = 2; nonce = $nonce; observedAt = $timestamp; operation = $Operation; classification = "PHASE7B_WP2_GUEST_RESTORE_FAIL"; pass = $false; safeStage = $stage; safeErrorCode = $safeCode; mutationStarted = $mutationStarted; automaticRetryAllowed = $false; newFounderAuthorizationRequired = $mutationStarted })
  exit 1
} finally {
  foreach ($temporaryPath in @($temporaryZip, $incompleteRestore)) {
    if (-not [string]::IsNullOrWhiteSpace($temporaryPath) -and (Test-Path -LiteralPath $temporaryPath)) {
      $full = [IO.Path]::GetFullPath($temporaryPath)
      if ($full.StartsWith([IO.Path]::GetFullPath($restore).TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase) -and $full -match [regex]::Escape($AttemptId)) { Remove-Item -LiteralPath $full -Recurse -Force }
    }
  }
}
