Set-StrictMode -Version Latest

Import-Module (Join-Path $PSScriptRoot "phase7bIsolatedGuestContract.psm1")

function Get-Phase7BSecondComputerReplicaContract {
  [CmdletBinding()]
  param()

  [pscustomobject][ordered]@{
    schemaVersion = 1
    classification = 'PHASE7B_WP2_SECOND_COMPUTER_REPLICA_CONTRACT'
    attestationClassification = 'PHASE7B_WP2_SECOND_COMPUTER_REPLICA_ATTESTATION_PASS'
    sessionClassification = 'PHASE7B_WP2_SECOND_COMPUTER_SMB_SESSION_PASS'
    transportClassification = 'SMB3_ENCRYPTED_NONPERSISTENT_READBACK'
    attestationFileName = 'phase7b-wp2b-replica-attestation.json'
    minimumFreeBytes = [int64]1GB
    acceptedFileSystems = @('NTFS', 'ReFS')
    acceptedPhysicalBusTypes = @('USB', 'SATA', 'SAS', 'NVMe', 'RAID', 'SCM')
    minimumSmbDialect = [version]'3.0'
    requireEncryption = $true
    encryptionSuppliesIntegrity = $true
    mappingPersistent = $false
    saveCredentials = $false
    useWriteThrough = $true
    automaticRetryAllowed = $false
  }
}

function Get-Phase7BSecondComputerReplicaUncIdentity {
  [CmdletBinding()]
  param([Parameter(Mandatory = $true)][string]$UncReplicaRoot)

  $normalized = $UncReplicaRoot.TrimEnd('\')
  if ($normalized -notmatch '^\\\\(?<server>[^\\]+)\\(?<share>[^\\]+)(?<suffix>\\.*)?$') {
    throw 'PHASE7B_WP2_REPLICA_UNC_INVALID'
  }
  $server = [string]$Matches.server
  $share = [string]$Matches.share
  if ($server -notmatch '^[A-Za-z0-9][A-Za-z0-9-]{0,62}$' -or
      $share -notmatch '^[A-Za-z0-9][A-Za-z0-9$_.-]{0,79}$') {
    throw 'PHASE7B_WP2_REPLICA_UNC_IDENTITY_INVALID'
  }
  [pscustomobject][ordered]@{
    serverName = $server
    shareName = $share
    shareRoot = "\\$server\$share"
    replicaRoot = $normalized
  }
}

function Test-Phase7BSecondComputerNetworkBinding {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string]$PrimaryIpv4,
    [Parameter(Mandatory = $true)][int]$PrimaryPrefixLength,
    [Parameter(Mandatory = $true)][string]$ReplicaIpv4,
    [Parameter(Mandatory = $true)][int]$ReplicaPrefixLength
  )

  $primary = [ipaddress]::None
  $replica = [ipaddress]::None
  $valid = [ipaddress]::TryParse($PrimaryIpv4, [ref]$primary) -and
    [ipaddress]::TryParse($ReplicaIpv4, [ref]$replica) -and
    $primary.AddressFamily -eq [Net.Sockets.AddressFamily]::InterNetwork -and
    $replica.AddressFamily -eq [Net.Sockets.AddressFamily]::InterNetwork -and
    $PrimaryPrefixLength -ge 1 -and $PrimaryPrefixLength -le 32 -and
    $ReplicaPrefixLength -eq $PrimaryPrefixLength
  $sameSubnet = $false
  if ($valid) {
    $prefix = $PrimaryPrefixLength
    $mask = if ($prefix -eq 32) { [uint32]::MaxValue } else { [uint32]([uint32]::MaxValue -shl (32 - $prefix)) }
    $primaryBytes = $primary.GetAddressBytes()
    $replicaBytes = $replica.GetAddressBytes()
    [array]::Reverse($primaryBytes)
    [array]::Reverse($replicaBytes)
    $primaryValue = [BitConverter]::ToUInt32($primaryBytes, 0)
    $replicaValue = [BitConverter]::ToUInt32($replicaBytes, 0)
    $sameSubnet = ($primaryValue -band $mask) -eq ($replicaValue -band $mask)
  }
  [pscustomobject][ordered]@{
    pass = $valid -and $sameSubnet
    classification = if ($valid -and $sameSubnet) { 'PHASE7B_WP2_REPLICA_NETWORK_BINDING_PASS' } else { 'PHASE7B_WP2_REPLICA_NETWORK_BINDING_FAIL' }
    primaryIpv4 = if ($valid) { $PrimaryIpv4 } else { $null }
    replicaIpv4 = if ($valid) { $ReplicaIpv4 } else { $null }
    prefixLength = if ($valid) { $PrimaryPrefixLength } else { $null }
  }
}

function Test-Phase7BSecondComputerReplicaAttestation {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]$Attestation,
    [Parameter(Mandatory = $true)][string]$ExpectedAttemptId,
    [Parameter(Mandatory = $true)][string]$ExpectedComputerName,
    [Parameter(Mandatory = $true)][string]$ExpectedHostIdentitySha256,
    [Parameter(Mandatory = $true)][string]$ExpectedDiskIdentitySha256,
    [Parameter(Mandatory = $true)][string]$ExpectedLocalReplicaRoot,
    [Parameter(Mandatory = $true)][string]$ExpectedUncReplicaRoot,
    [Parameter(Mandatory = $true)][string]$ExpectedShareName,
    [Parameter(Mandatory = $true)][string]$ExpectedPrimaryIpv4
  )

  $contract = Get-Phase7BSecondComputerReplicaContract
  $hashesValid = $ExpectedHostIdentitySha256 -match '^[0-9a-f]{64}$' -and
    $ExpectedDiskIdentitySha256 -match '^[0-9a-f]{64}$'
  if (-not $hashesValid) { throw 'PHASE7B_WP2_REPLICA_ATTESTATION_EXPECTED_HASH_INVALID' }
  $unc = Get-Phase7BSecondComputerReplicaUncIdentity -UncReplicaRoot $ExpectedUncReplicaRoot
  $local = [IO.Path]::GetFullPath($ExpectedLocalReplicaRoot).TrimEnd('\')
  $pass = [int]$Attestation.schemaVersion -eq 1 -and
    [string]$Attestation.classification -eq $contract.attestationClassification -and
    [bool]$Attestation.pass -and
    [string]$Attestation.attemptId -eq $ExpectedAttemptId -and
    [string]$Attestation.computerName -eq $ExpectedComputerName -and
    [string]$Attestation.hostIdentitySha256 -eq $ExpectedHostIdentitySha256 -and
    [string]$Attestation.diskIdentitySha256 -eq $ExpectedDiskIdentitySha256 -and
    [string]$Attestation.localReplicaRoot -eq $local -and
    [string]$Attestation.uncReplicaRoot -eq $unc.replicaRoot -and
    [string]$Attestation.shareName -eq $ExpectedShareName -and
    [string]$unc.serverName -eq $ExpectedComputerName -and
    [string]$unc.shareName -eq $ExpectedShareName -and
    [string]$Attestation.fileSystem -in $contract.acceptedFileSystems -and
    [string]$Attestation.physicalDiskBusType -in $contract.acceptedPhysicalBusTypes -and
    [int64]$Attestation.freeBytes -ge $contract.minimumFreeBytes -and
    [bool]$Attestation.physicallyAttached -and
    [bool]$Attestation.rootExists -and
    [bool]$Attestation.rootEmpty -and
    [bool]$Attestation.shareEncryptData -and
    [string]$Attestation.shareCachingMode -eq 'None' -and
    [string]$Attestation.shareFolderEnumerationMode -eq 'AccessBased' -and
    -not [bool]$Attestation.replicaAccountIsAdministrator -and
    [string]$Attestation.firewallProfile -eq 'Private' -and
    [string]$Attestation.firewallProtocol -eq 'TCP' -and
    [int]$Attestation.firewallLocalPort -eq 445 -and
    [string]$Attestation.firewallRemoteAddress -eq $ExpectedPrimaryIpv4 -and
    [string]$Attestation.transportClassification -eq $contract.transportClassification -and
    -not [bool]$Attestation.automaticRetryAllowed
  [pscustomobject][ordered]@{
    pass = [bool]$pass
    classification = if ($pass) { 'PHASE7B_WP2_SECOND_COMPUTER_REPLICA_ATTESTATION_ACCEPTED' } else { 'PHASE7B_WP2_SECOND_COMPUTER_REPLICA_ATTESTATION_REJECTED' }
    computerName = if ($pass) { $ExpectedComputerName } else { $null }
    hostIdentitySha256 = if ($pass) { $ExpectedHostIdentitySha256 } else { $null }
    diskIdentitySha256 = if ($pass) { $ExpectedDiskIdentitySha256 } else { $null }
  }
}

function Test-Phase7BSecondComputerSmbSessionEvidence {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]$Evidence,
    [Parameter(Mandatory = $true)][string]$ExpectedServerName,
    [Parameter(Mandatory = $true)][string]$ExpectedShareName,
    [Parameter(Mandatory = $true)][string]$ExpectedAttestationSha256
  )

  $contract = Get-Phase7BSecondComputerReplicaContract
  $dialect = [version]'0.0'
  $dialectValid = [version]::TryParse([string]$Evidence.dialect, [ref]$dialect)
  $pass = $ExpectedAttestationSha256 -match '^[0-9a-f]{64}$' -and
    [string]$Evidence.serverName -eq $ExpectedServerName -and
    [string]$Evidence.shareName -eq $ExpectedShareName -and
    $dialectValid -and $dialect -ge $contract.minimumSmbDialect -and
    [bool]$Evidence.encrypted -and
    [bool]$Evidence.credentialed -and
    -not [bool]$Evidence.guest -and
    -not [bool]$Evidence.mappingPersistent -and
    -not [bool]$Evidence.credentialsSaved -and
    [bool]$Evidence.writeThrough -and
    [string]$Evidence.remoteAttestationSha256 -eq $ExpectedAttestationSha256
  [pscustomobject][ordered]@{
    pass = [bool]$pass
    classification = if ($pass) { $contract.sessionClassification } else { 'PHASE7B_WP2_SECOND_COMPUTER_SMB_SESSION_FAIL' }
    encrypted = if ($dialectValid) { [bool]$Evidence.encrypted } else { $false }
    signed = if ($dialectValid) { [bool]$Evidence.signed } else { $false }
    encryptionSuppliesIntegrity = $contract.encryptionSuppliesIntegrity
    dialect = if ($dialectValid) { $dialect.ToString() } else { $null }
  }
}

Export-ModuleMember -Function @(
  'Get-Phase7BSecondComputerReplicaContract',
  'Get-Phase7BSecondComputerReplicaUncIdentity',
  'Test-Phase7BSecondComputerNetworkBinding',
  'Test-Phase7BSecondComputerReplicaAttestation',
  'Test-Phase7BSecondComputerSmbSessionEvidence'
)
