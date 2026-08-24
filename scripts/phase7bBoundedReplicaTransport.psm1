Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bIsolatedGuestContract.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2Contract.psm1')

function Test-Phase7BSha256IdentityShape {
  [CmdletBinding()] param([Parameter(Mandatory = $true)][AllowNull()]$Value)
  $values = @($Value)
  $values.Count -eq 1 -and $null -ne $values[0] -and $values[0] -is [string] -and
    [string]$values[0] -cmatch '^[0-9a-f]{64}$'
}

function Get-Phase7BBoundedReplicaHostIdentitySha256 {
  [CmdletBinding()] param(
    [Parameter(Mandatory = $true)][string]$ComputerName,
    [Parameter(Mandatory = $true)][string]$Uuid,
    [Parameter(Mandatory = $true)][string]$MachineGuid
  )
  $uuidValue = [guid]::Empty
  $machineGuidValue = [guid]::Empty
  if (-not [guid]::TryParse($Uuid, [ref]$uuidValue) -or $uuidValue -eq [guid]::Empty -or
      -not [guid]::TryParse($MachineGuid, [ref]$machineGuidValue) -or $machineGuidValue -eq [guid]::Empty) {
    throw 'PHASE7B_WP2_BOUNDED_REPLICA_HOST_COMPONENT_FORMAT_FAIL'
  }
  Get-Phase7BSha256 -Text ($ComputerName.ToLowerInvariant() + '|' + $Uuid.ToLowerInvariant() + '|' +
    $MachineGuid.ToLowerInvariant())
}

function Get-Phase7BBoundedReplicaDiskIdentitySha256 {
  [CmdletBinding()] param(
    [Parameter(Mandatory = $true)][string]$ComputerName,
    [Parameter(Mandatory = $true)][int]$DiskNumber,
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$UniqueId,
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$SerialNumber,
    [Parameter(Mandatory = $true)][string]$FriendlyName,
    [Parameter(Mandatory = $true)][int64]$DiskSizeBytes,
    [Parameter(Mandatory = $true)][string]$BusType
  )
  Get-Phase7BSha256 -Text ($ComputerName.ToLowerInvariant() + '|' + [string]$DiskNumber + '|' +
    $UniqueId.ToLowerInvariant() + '|' + $SerialNumber.ToLowerInvariant() + '|' +
    $FriendlyName.ToLowerInvariant() + '|' + [string]$DiskSizeBytes + '|' + $BusType.ToLowerInvariant())
}

function Get-Phase7BBoundedReplicaTransportContract {
  [CmdletBinding()] param()
  $contract = [pscustomobject][ordered]@{
    schemaVersion = 1
    classification = 'PHASE7B_WP2_BOUNDED_REPLICA_TRANSPORT_CONTRACT'
    transportClassification = 'EPHEMERAL_SMB_EXISTING_ACCOUNT_ONE_ENCRYPTED_PACKET'
    acceptedComputerName = 'LAPTOP-4G5UOU2R'
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
  if (-not (Test-Phase7BSha256IdentityShape -Value $contract.acceptedHostIdentitySha256) -or
      -not (Test-Phase7BSha256IdentityShape -Value $contract.acceptedDiskIdentitySha256)) {
    throw 'PHASE7B_WP2_ACTIVE_REPLICA_IDENTITY_CONTRACT_INVALID'
  }
  $contract
}

function ConvertTo-Phase7BCanonicalComputerName {
  [CmdletBinding()] param(
    [Parameter(Mandatory = $true)][AllowNull()]$Value
  )
  $values = @($Value)
  if ($values.Count -ne 1 -or $null -eq $values[0] -or $values[0] -isnot [string]) {
    throw 'PHASE7B_WP2_COMPUTER_NAME_SHAPE_INVALID'
  }
  $name = [string]$values[0]
  if ([string]::IsNullOrWhiteSpace($name) -or $name -cne $name.Trim() -or
      $name -match '[\x00-\x1f\x7f]' -or $name -notmatch '^[A-Za-z0-9](?:[A-Za-z0-9-]{0,13}[A-Za-z0-9])?$') {
    throw 'PHASE7B_WP2_COMPUTER_NAME_FORMAT_INVALID'
  }
  $name.ToUpperInvariant()
}

function Test-Phase7BBoundedReplicaComputerIdentity {
  [CmdletBinding()] param(
    [Parameter(Mandatory = $true)][AllowNull()]$ObservedComputerName,
    [Parameter(Mandatory = $true)][AllowNull()]$ExpectedComputerName
  )
  try {
    $observed = ConvertTo-Phase7BCanonicalComputerName -Value $ObservedComputerName
    $expected = ConvertTo-Phase7BCanonicalComputerName -Value $ExpectedComputerName
    $pass = [StringComparer]::Ordinal.Equals($observed, $expected)
    [pscustomobject][ordered]@{
      pass = [bool]$pass
      classification = if ($pass) { 'PHASE7B_WP2_COMPUTER_IDENTITY_PASS' } else { 'PHASE7B_WP2_COMPUTER_IDENTITY_FAIL' }
      canonicalComputerName = if ($pass) { $expected } else { $null }
      inputCardinalityValid = $true
      scalarStringValid = $true
      canonicalFormatValid = $true
    }
  } catch {
    [pscustomobject][ordered]@{
      pass = $false
      classification = 'PHASE7B_WP2_COMPUTER_IDENTITY_FAIL'
      canonicalComputerName = $null
      inputCardinalityValid = $_.Exception.Message -ne 'PHASE7B_WP2_COMPUTER_NAME_SHAPE_INVALID'
      scalarStringValid = $false
      canonicalFormatValid = $false
    }
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
  $created = $false
  try {
    $stream = New-Object IO.FileStream($LiteralPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    $created = $true
    try { $stream.Write($bytes, 0, $bytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }
  } catch {
    if ($created -and (Test-Path -LiteralPath $LiteralPath -PathType Leaf)) { Remove-Item -LiteralPath $LiteralPath -Force -ErrorAction SilentlyContinue }
    throw
  }
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
  $computerIdentity = Test-Phase7BBoundedReplicaComputerIdentity -ObservedComputerName $Evidence.computerName -ExpectedComputerName $contract.acceptedComputerName
  $pass = $computerIdentity.pass -and
    (Test-Phase7BSha256IdentityShape -Value $Evidence.hostIdentitySha256) -and
    (Test-Phase7BSha256IdentityShape -Value $Evidence.diskIdentitySha256) -and
    [string]$Evidence.hostIdentitySha256 -ceq $contract.acceptedHostIdentitySha256 -and
    [string]$Evidence.diskIdentitySha256 -ceq $contract.acceptedDiskIdentitySha256 -and
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
  $destinationCreated = $false
  $input = [IO.File]::Open((Resolve-Path -LiteralPath $SourcePath).Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
  try {
    $output = New-Object IO.FileStream($DestinationPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None, 1048576, [IO.FileOptions]::WriteThrough)
    $destinationCreated = $true
    try { $input.CopyTo($output, 1048576); $output.Flush($true) } finally { $output.Dispose() }
  } catch {
    if ($destinationCreated -and (Test-Path -LiteralPath $DestinationPath -PathType Leaf)) { Remove-Item -LiteralPath $DestinationPath -Force -ErrorAction SilentlyContinue }
    throw
  } finally { $input.Dispose() }
  $replica = Test-Phase7BEncryptedPacket -LiteralPath $DestinationPath -ExpectedSha256 $ExpectedSha256
  if (-not $replica.pass -or $replica.packetBytes -ne $ExpectedBytes) {
    if ($destinationCreated -and (Test-Path -LiteralPath $DestinationPath -PathType Leaf)) { Remove-Item -LiteralPath $DestinationPath -Force -ErrorAction SilentlyContinue }
    throw 'PHASE7B_WP2_BOUNDED_REPLICA_READBACK_MISMATCH'
  }
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
  'Test-Phase7BSha256IdentityShape',
  'Get-Phase7BBoundedReplicaHostIdentitySha256',
  'Get-Phase7BBoundedReplicaDiskIdentitySha256',
  'ConvertTo-Phase7BCanonicalComputerName',
  'Test-Phase7BBoundedReplicaComputerIdentity',
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
