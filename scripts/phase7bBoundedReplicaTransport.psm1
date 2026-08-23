Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bIsolatedGuestContract.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2Contract.psm1') -Force

function Get-Phase7BBoundedReplicaTransportContract {
  [CmdletBinding()] param()
  [pscustomobject][ordered]@{
    schemaVersion = 1
    classification = 'PHASE7B_WP2_BOUNDED_REPLICA_TRANSPORT_CONTRACT'
    transportClassification = 'EPHEMERAL_SMB_EXISTING_ACCOUNT_ONE_ENCRYPTED_PACKET'
    acceptedComputerName = 'LAPTOP-4G5U0U2R'
    acceptedHostIdentitySha256 = 'ea6696e8a0fc4d9242544568d62cd979fd57bd2478fac4f40755b3546776ac3c'
    acceptedDiskIdentitySha256 = '336d31be1f1e6dd4bde254fae94ffebf2b23829520a26c2f5d9bc5deda169896'
    acceptedDriveRoot = 'D:\'
    acceptedFileSystem = 'NTFS'
    acceptedDiskNumber = 0
    acceptedBusType = 'SATA'
    minimumFreeBytes = [int64]1GB
    replicaPathModel = 'EXACT_ATTEMPT_ROOT'
    persistentAccountPermitted = $false
    persistentSharePermitted = $false
    persistentFirewallRulePermitted = $false
    persistentMappingPermitted = $false
    credentialPersistencePermitted = $false
    rawProductionFilesPermitted = $false
    automaticRetryAllowed = $false
  }
}

function Get-Phase7BBoundedReplicaAttemptRoot {
  [CmdletBinding()] param(
    [Parameter(Mandatory = $true)][string]$AttemptId,
    [Parameter(Mandatory = $true)][string]$ReplicaParentRoot
  )
  if ($AttemptId -notmatch '^phase7b-wp2-[0-9a-f]{32}$') { throw 'PHASE7B_WP2_ATTEMPT_ID_INVALID' }
  $parent = $ReplicaParentRoot.TrimEnd('\')
  if ([string]::IsNullOrWhiteSpace($parent)) { throw 'PHASE7B_WP2_REPLICA_PARENT_INVALID' }
  $attemptRoot = "$parent\$AttemptId"
  [pscustomobject][ordered]@{
    classification = 'PHASE7B_WP2_REPLICA_PATH_CONTRACT_PASS'
    pass = $true
    pathModel = 'EXACT_ATTEMPT_ROOT'
    attemptId = $AttemptId
    attemptRoot = $attemptRoot
    packetPath = "$attemptRoot\$AttemptId.zip.age"
  }
}

function Get-Phase7BReplicaDirectoryIdentity {
  [CmdletBinding()] param([Parameter(Mandatory = $true)][string]$LiteralPath)
  $driveMatch = [regex]::Match($LiteralPath, '^(?<name>[A-Za-z][A-Za-z0-9_-]*):\\?(?<relative>.*)$')
  if ($driveMatch.Success) {
    $drive = Get-PSDrive -Name $driveMatch.Groups['name'].Value -PSProvider FileSystem -ErrorAction Stop
    $relative = $driveMatch.Groups['relative'].Value.TrimStart('\')
    $providerRoot = if ([string]::IsNullOrWhiteSpace($relative)) { [string]$drive.Root } else { Join-Path ([string]$drive.Root) $relative }
    $full = if ([string]::IsNullOrWhiteSpace($relative)) { "$($drive.Name):\" } else { "$($drive.Name):\$relative" }
  } else {
    $full = [IO.Path]::GetFullPath($LiteralPath).TrimEnd('\')
    $providerRoot = $full
  }
  [pscustomobject][ordered]@{
    classification = 'PHASE7B_WP2_REPLICA_DIRECTORY_IDENTITY_PASS'
    pass = $true
    localPath = $full
    providerRoot = $providerRoot.TrimEnd('\')
    providerRootSha256 = Get-Phase7BSha256 -Text $providerRoot.TrimEnd('\').ToLowerInvariant()
  }
}

function Write-Phase7BSafeEvidenceFile {
  [CmdletBinding()] param(
    [Parameter(Mandatory = $true)][string]$LiteralPath,
    [Parameter(Mandatory = $true)]$Evidence
  )
  if ([IO.Path]::GetExtension($LiteralPath) -ine '.json' -or (Test-Path -LiteralPath $LiteralPath)) { throw 'PHASE7B_WP2_SAFE_EVIDENCE_OUTPUT_REJECTED' }
  $parent = Split-Path -Parent ([IO.Path]::GetFullPath($LiteralPath))
  if (-not (Test-Path -LiteralPath $parent -PathType Container)) { throw 'PHASE7B_WP2_SAFE_EVIDENCE_PARENT_MISSING' }
  $bytes = (New-Object Text.UTF8Encoding($false)).GetBytes((ConvertTo-Phase7BCanonicalJson -InputObject $Evidence))
  $stream = New-Object IO.FileStream($LiteralPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
  try { $stream.Write($bytes, 0, $bytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }
  [pscustomobject][ordered]@{ classification = 'PHASE7B_WP2_SAFE_EVIDENCE_PERSISTED'; pass = $true; fileName = Split-Path -Leaf $LiteralPath; sha256 = Get-Phase7BSha256 -LiteralPath $LiteralPath; bytes = [int64]$bytes.Length }
}

function Test-Phase7BBoundedEncryptedReplicaSource {
  [CmdletBinding()] param(
    [Parameter(Mandatory = $true)][string]$LiteralPath,
    [Parameter(Mandatory = $true)][string]$ExpectedSha256,
    [Parameter(Mandatory = $true)][int64]$ExpectedBytes
  )
  $packet = Test-Phase7BEncryptedPacket -LiteralPath $LiteralPath -ExpectedSha256 $ExpectedSha256
  $pass = $packet.pass -and $packet.packetBytes -eq $ExpectedBytes -and
    [IO.Path]::GetExtension($LiteralPath) -ieq '.age'
  [pscustomobject][ordered]@{
    pass = [bool]$pass
    classification = if ($pass) { 'PHASE7B_WP2_BOUNDED_ENCRYPTED_SOURCE_PASS' } else { 'PHASE7B_WP2_BOUNDED_ENCRYPTED_SOURCE_FAIL' }
    packetSha256 = $packet.packetSha256
    packetBytes = $packet.packetBytes
    encryptedPacketOnly = [bool]$packet.ageHeaderPresent
  }
}

function Test-Phase7BBoundedReplicaDestinationEvidence {
  [CmdletBinding()] param([Parameter(Mandatory = $true)]$Evidence, [Parameter(Mandatory = $true)][int64]$RequiredBytes)
  $contract = Get-Phase7BBoundedReplicaTransportContract
  $pass = [string]$Evidence.computerName -eq $contract.acceptedComputerName -and
    [string]$Evidence.hostIdentitySha256 -eq $contract.acceptedHostIdentitySha256 -and
    [string]$Evidence.diskIdentitySha256 -eq $contract.acceptedDiskIdentitySha256 -and
    [string]$Evidence.driveRoot -eq $contract.acceptedDriveRoot -and
    [string]$Evidence.fileSystem -eq $contract.acceptedFileSystem -and
    [int]$Evidence.diskNumber -eq $contract.acceptedDiskNumber -and
    [string]$Evidence.busType -eq $contract.acceptedBusType -and
    [bool]$Evidence.physicallyIndependent -and [int64]$Evidence.freeBytes -ge ([Math]::Max($contract.minimumFreeBytes, $RequiredBytes)) -and
    -not [bool]$Evidence.persistentAccountCreated -and -not [bool]$Evidence.persistentShareRetained -and
    -not [bool]$Evidence.persistentFirewallRuleRetained -and -not [bool]$Evidence.persistentMappingRetained -and
    -not [bool]$Evidence.credentialsPersisted -and -not [bool]$Evidence.rawProductionFilesAccepted
  [pscustomobject][ordered]@{
    pass = [bool]$pass
    classification = if ($pass) { 'PHASE7B_WP2_BOUNDED_REPLICA_DESTINATION_PASS' } else { 'PHASE7B_WP2_BOUNDED_REPLICA_DESTINATION_FAIL' }
    computerName = if ($pass) { $contract.acceptedComputerName } else { $null }
    hostIdentitySha256 = if ($pass) { $contract.acceptedHostIdentitySha256 } else { $null }
    diskIdentitySha256 = if ($pass) { $contract.acceptedDiskIdentitySha256 } else { $null }
  }
}

function Copy-Phase7BBoundedEncryptedReplica {
  [CmdletBinding()] param(
    [Parameter(Mandatory = $true)][string]$SourcePath,
    [Parameter(Mandatory = $true)][string]$DestinationPath,
    [Parameter(Mandatory = $true)][string]$ExpectedSha256,
    [Parameter(Mandatory = $true)][int64]$ExpectedBytes
  )
  $source = Test-Phase7BBoundedEncryptedReplicaSource -LiteralPath $SourcePath -ExpectedSha256 $ExpectedSha256 -ExpectedBytes $ExpectedBytes
  if (-not $source.pass) { throw $source.classification }
  if (Test-Path -LiteralPath $DestinationPath) { throw 'PHASE7B_WP2_BOUNDED_REPLICA_DESTINATION_EXISTS' }
  $parent = Split-Path -Parent ([IO.Path]::GetFullPath($DestinationPath))
  if (-not (Test-Path -LiteralPath $parent -PathType Container)) { throw 'PHASE7B_WP2_BOUNDED_REPLICA_DESTINATION_PARENT_MISSING' }
  $input = [IO.File]::Open((Resolve-Path -LiteralPath $SourcePath).Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
  try {
    $output = New-Object IO.FileStream($DestinationPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None, 1048576, [IO.FileOptions]::WriteThrough)
    try { $input.CopyTo($output, 1048576); $output.Flush($true) } finally { $output.Dispose() }
  } finally { $input.Dispose() }
  $replica = Test-Phase7BEncryptedPacket -LiteralPath $DestinationPath -ExpectedSha256 $ExpectedSha256
  if (-not $replica.pass -or $replica.packetBytes -ne $ExpectedBytes) { throw 'PHASE7B_WP2_BOUNDED_REPLICA_READBACK_MISMATCH' }
  [pscustomobject][ordered]@{ classification = 'PHASE7B_WP2_BOUNDED_REPLICA_COPY_READBACK_PASS'; pass = $true; packetSha256 = $replica.packetSha256; packetBytes = $replica.packetBytes; writeThrough = $true; automaticRetryAllowed = $false }
}

function Test-Phase7BBoundedReplicaFileSet {
  [CmdletBinding()] param(
    [Parameter(Mandatory = $true)][AllowEmptyCollection()][AllowNull()][string[]]$FileNames,
    [Parameter(Mandatory = $true)][string]$ExpectedPacketFileName
  )
  $actual = @($FileNames | Where-Object { $null -ne $_ } | ForEach-Object { [string]$_ })
  $pass = $actual.Count -eq 1 -and $actual[0] -ceq $ExpectedPacketFileName -and [IO.Path]::GetExtension($actual[0]) -ieq '.age'
  [pscustomobject][ordered]@{ pass = [bool]$pass; classification = if ($pass) { 'PHASE7B_WP2_BOUNDED_REPLICA_FILE_SET_PASS' } else { 'PHASE7B_WP2_BOUNDED_REPLICA_FILE_SET_FAIL' }; fileCount = $actual.Count }
}

function Test-Phase7BBoundedReplicaReceipt {
  [CmdletBinding()] param(
    [Parameter(Mandatory = $true)]$Receipt,
    [Parameter(Mandatory = $true)][string]$ExpectedAttemptId,
    [Parameter(Mandatory = $true)][string]$ExpectedPacketSha256,
    [Parameter(Mandatory = $true)][int64]$ExpectedPacketBytes
  )
  $destination = Test-Phase7BBoundedReplicaDestinationEvidence -Evidence $Receipt -RequiredBytes $ExpectedPacketBytes
  $pass = $destination.pass -and [string]$Receipt.classification -eq 'PHASE7B_WP2_BOUNDED_REPLICA_INDEPENDENT_READBACK_PASS' -and
    [bool]$Receipt.pass -and [string]$Receipt.attemptId -eq $ExpectedAttemptId -and
    [string]$Receipt.packetSha256 -eq $ExpectedPacketSha256 -and [int64]$Receipt.packetBytes -eq $ExpectedPacketBytes -and
    [bool]$Receipt.destinationBytesReread -and [bool]$Receipt.sessionTornDown -and
    [bool]$Receipt.encryptedPacketOnly -and [bool]$Receipt.reportPersisted -and
    [string]$Receipt.evidenceNonce -match '^[0-9a-f]{32}$' -and
    [string]$Receipt.evidenceFileName -ceq "$ExpectedAttemptId-replica-receipt-$([string]$Receipt.evidenceNonce).json" -and
    [string]$Receipt.observedAt -match '^\d{4}-\d{2}-\d{2}T' -and -not [bool]$Receipt.automaticRetryAllowed
  [pscustomobject][ordered]@{
    pass = [bool]$pass
    classification = if ($pass) { 'PHASE7B_WP2_BOUNDED_REPLICA_RECEIPT_ACCEPTED' } else { 'PHASE7B_WP2_BOUNDED_REPLICA_RECEIPT_REJECTED' }
    packetSha256 = if ($pass) { $ExpectedPacketSha256 } else { $null }
    packetBytes = if ($pass) { $ExpectedPacketBytes } else { 0 }
  }
}

function Test-Phase7BPrimaryReplicaSessionTeardownEvidence {
  [CmdletBinding()] param([Parameter(Mandatory = $true)]$Evidence, [Parameter(Mandatory = $true)][string]$ExpectedAttemptId, [Parameter(Mandatory = $true)][string]$ExpectedServerName, [Parameter(Mandatory = $true)][string]$ExpectedShareName)
  $pass = [string]$Evidence.classification -eq 'PHASE7B_WP2_PRIMARY_REPLICA_SESSION_TEARDOWN_PASS' -and [bool]$Evidence.pass -and
    [string]$Evidence.attemptId -eq $ExpectedAttemptId -and [string]$Evidence.serverName -eq $ExpectedServerName -and [string]$Evidence.shareName -eq $ExpectedShareName -and
    [int]$Evidence.matchingPsDriveCount -eq 0 -and [int]$Evidence.matchingSmbMappingCount -eq 0 -and [int]$Evidence.savedCredentialTargetCount -eq 0 -and
    -not [bool]$Evidence.mappingPersistent -and -not [bool]$Evidence.credentialsPersisted -and [bool]$Evidence.sessionTornDown -and
    -not [bool]$Evidence.mutationPerformed -and [bool]$Evidence.reportPersisted -and
    [string]$Evidence.evidenceNonce -match '^[0-9a-f]{32}$' -and
    [string]$Evidence.evidenceFileName -ceq "$ExpectedAttemptId-primary-teardown-$([string]$Evidence.evidenceNonce).json" -and
    [string]$Evidence.observedAt -match '^\d{4}-\d{2}-\d{2}T' -and -not [bool]$Evidence.automaticRetryAllowed
  [pscustomobject][ordered]@{ pass = [bool]$pass; classification = if ($pass) { 'PHASE7B_WP2_PRIMARY_REPLICA_SESSION_TEARDOWN_ACCEPTED' } else { 'PHASE7B_WP2_PRIMARY_REPLICA_SESSION_TEARDOWN_REJECTED' } }
}

Export-ModuleMember -Function @(
  'Get-Phase7BBoundedReplicaTransportContract',
  'Get-Phase7BBoundedReplicaAttemptRoot',
  'Get-Phase7BReplicaDirectoryIdentity',
  'Write-Phase7BSafeEvidenceFile',
  'Test-Phase7BBoundedEncryptedReplicaSource',
  'Test-Phase7BBoundedReplicaDestinationEvidence',
  'Copy-Phase7BBoundedEncryptedReplica',
  'Test-Phase7BBoundedReplicaFileSet',
  'Test-Phase7BBoundedReplicaReceipt',
  'Test-Phase7BPrimaryReplicaSessionTeardownEvidence'
)
