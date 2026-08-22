[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidateSet('Inspect', 'AttestConfigured')][string]$Operation,
  [Parameter()][string]$AttemptId,
  [Parameter()][string]$ExpectedComputerName,
  [Parameter()][string]$ExpectedHostIdentitySha256,
  [Parameter()][string]$ExpectedDiskIdentitySha256,
  [Parameter()][string]$LocalReplicaRoot,
  [Parameter()][string]$ShareName,
  [Parameter()][string]$UncReplicaRoot,
  [Parameter()][string]$PrimaryHostIpv4,
  [Parameter()][string]$ReplicaAccountName,
  [Parameter()][string]$FirewallRuleName
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bIsolatedGuestContract.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bSecondComputerReplicaContract.psm1') -Force
$contract = Get-Phase7BSecondComputerReplicaContract

if ($Operation -eq 'Inspect') {
  [ordered]@{
    classification = 'PHASE7B_WP2_SECOND_COMPUTER_ATTESTATION_TOOL_READY_INERT'
    pass = $true
    mutationPerformed = $false
    reportPersisted = $false
    minimumFreeBytes = $contract.minimumFreeBytes
    acceptedFileSystems = $contract.acceptedFileSystems
    acceptedPhysicalBusTypes = $contract.acceptedPhysicalBusTypes
    automaticRetryAllowed = $false
  } | ConvertTo-Json -Depth 5
  exit 0
}

$stage = 'validate-arguments'
try {
  foreach ($required in @($AttemptId, $ExpectedComputerName, $ExpectedHostIdentitySha256,
      $ExpectedDiskIdentitySha256, $LocalReplicaRoot, $ShareName, $UncReplicaRoot,
      $PrimaryHostIpv4, $ReplicaAccountName, $FirewallRuleName)) {
    if ([string]::IsNullOrWhiteSpace($required)) { throw 'PHASE7B_WP2_REPLICA_ATTESTATION_ARGUMENT_REQUIRED' }
  }
  if ($AttemptId -notmatch '^phase7b-wp2-[0-9a-f]{32}$' -or
      $ExpectedHostIdentitySha256 -notmatch '^[0-9a-f]{64}$' -or
      $ExpectedDiskIdentitySha256 -notmatch '^[0-9a-f]{64}$') {
    throw 'PHASE7B_WP2_REPLICA_ATTESTATION_ARGUMENT_INVALID'
  }
  $unc = Get-Phase7BSecondComputerReplicaUncIdentity -UncReplicaRoot $UncReplicaRoot
  $localRoot = [IO.Path]::GetFullPath($LocalReplicaRoot).TrimEnd('\')
  if ([Environment]::MachineName -ne $ExpectedComputerName -or $unc.serverName -ne $ExpectedComputerName -or
      $unc.shareName -ne $ShareName) { throw 'PHASE7B_WP2_REPLICA_HOST_OR_SHARE_IDENTITY_MISMATCH' }

  $stage = 'validate-host-and-disk'
  $product = Get-CimInstance Win32_ComputerSystemProduct
  $machineGuid = [string](Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Cryptography' -Name MachineGuid).MachineGuid
  $hostMaterial = $ExpectedComputerName.ToLowerInvariant() + '|' +
    ([string]$product.UUID).ToLowerInvariant() + '|' + $machineGuid.ToLowerInvariant()
  $hostSha = Get-Phase7BSha256 -Text $hostMaterial
  if ($hostSha -ne $ExpectedHostIdentitySha256) { throw 'PHASE7B_WP2_REPLICA_HOST_IDENTITY_MISMATCH' }

  $rootDrive = [IO.Path]::GetPathRoot($localRoot).TrimEnd('\')
  if ($rootDrive -notmatch '^[A-Za-z]:$') { throw 'PHASE7B_WP2_REPLICA_LOCAL_ROOT_INVALID' }
  $driveLetter = $rootDrive.Substring(0, 1)
  $volume = Get-Volume -DriveLetter $driveLetter -ErrorAction Stop
  $partitions = @(Get-Partition -DriveLetter $driveLetter -ErrorAction Stop)
  $disks = @($partitions | Get-Disk -ErrorAction Stop)
  if ($partitions.Count -ne 1 -or $disks.Count -ne 1) { throw 'PHASE7B_WP2_REPLICA_DISK_CARDINALITY_FAIL' }
  $disk = $disks[0]
  $diskMaterial = $ExpectedComputerName.ToLowerInvariant() + '|' + [string]$disk.Number + '|' +
    ([string]$disk.UniqueId).ToLowerInvariant() + '|' + ([string]$disk.SerialNumber).ToLowerInvariant() + '|' +
    ([string]$disk.FriendlyName).ToLowerInvariant() + '|' + [string]$disk.Size + '|' +
    ([string]$disk.BusType).ToLowerInvariant()
  $diskSha = Get-Phase7BSha256 -Text $diskMaterial
  if ($diskSha -ne $ExpectedDiskIdentitySha256 -or
      [string]$volume.FileSystemType -notin $contract.acceptedFileSystems -or
      [string]$disk.BusType -notin $contract.acceptedPhysicalBusTypes -or
      [int64]$volume.SizeRemaining -lt $contract.minimumFreeBytes) {
    throw 'PHASE7B_WP2_REPLICA_DISK_CONTRACT_FAIL'
  }

  $stage = 'validate-account-root-share'
  $account = Get-LocalUser -Name $ReplicaAccountName -ErrorAction Stop
  $administrators = @(Get-LocalGroupMember -Group 'Administrators' -ErrorAction Stop)
  $accountIsAdministrator = @($administrators | Where-Object { $_.SID -eq $account.SID }).Count -gt 0
  $rootExists = Test-Path -LiteralPath $localRoot -PathType Container
  $rootEmpty = $rootExists -and @(Get-ChildItem -LiteralPath $localRoot -Force -ErrorAction Stop).Count -eq 0
  $shareParent = Split-Path -Parent $localRoot
  $shares = @(Get-SmbShare -Name $ShareName -ErrorAction Stop)
  if ($shares.Count -ne 1) { throw 'PHASE7B_WP2_REPLICA_SHARE_CARDINALITY_FAIL' }
  $share = $shares[0]
  $shareAccess = @(Get-SmbShareAccess -Name $ShareName -ErrorAction Stop)
  $allowedAccount = "$ExpectedComputerName\$ReplicaAccountName"
  $accountAccess = @($shareAccess | Where-Object {
      $_.AccountName -eq $allowedAccount -and [string]$_.AccessControlType -eq 'Allow' -and
      [string]$_.AccessRight -in @('Full', 'Change')
    })
  $unsafeShareAccess = @($shareAccess | Where-Object {
      [string]$_.AccessControlType -eq 'Allow' -and $_.AccountName -ne $allowedAccount
    })
  $acl = Get-Acl -LiteralPath $localRoot
  $unsafeAcl = @($acl.Access | Where-Object {
      [string]$_.AccessControlType -eq 'Allow' -and
      [string]$_.IdentityReference -match '(?i)(Everyone|Authenticated Users|BUILTIN\\Users)'
    })
  $accountAcl = @($acl.Access | Where-Object {
      [string]$_.AccessControlType -eq 'Allow' -and
      [string]$_.IdentityReference -eq $allowedAccount -and
      ($_.FileSystemRights -band [Security.AccessControl.FileSystemRights]::Modify) -ne 0
    })
  if (-not $account.Enabled -or $accountIsAdministrator -or -not $rootExists -or -not $rootEmpty -or
      [IO.Path]::GetFullPath([string]$share.Path).TrimEnd('\') -ne [IO.Path]::GetFullPath($shareParent).TrimEnd('\') -or
      -not [bool]$share.EncryptData -or [string]$share.CachingMode -ne 'None' -or
      [string]$share.FolderEnumerationMode -ne 'AccessBased' -or $accountAccess.Count -ne 1 -or
      $unsafeShareAccess.Count -ne 0 -or $unsafeAcl.Count -ne 0 -or $accountAcl.Count -lt 1) {
    throw 'PHASE7B_WP2_REPLICA_ACCOUNT_ROOT_SHARE_CONTRACT_FAIL'
  }

  $stage = 'validate-firewall-and-network'
  $rules = @(Get-NetFirewallRule -Name $FirewallRuleName -ErrorAction Stop)
  if ($rules.Count -ne 1) { throw 'PHASE7B_WP2_REPLICA_FIREWALL_CARDINALITY_FAIL' }
  $rule = $rules[0]
  $port = $rule | Get-NetFirewallPortFilter
  $address = $rule | Get-NetFirewallAddressFilter
  $privateProfiles = @(Get-NetConnectionProfile | Where-Object { [string]$_.NetworkCategory -eq 'Private' })
  $privateAddresses = @(
    foreach ($profile in $privateProfiles) {
      Get-NetIPAddress -InterfaceIndex $profile.InterfaceIndex -AddressFamily IPv4 -AddressState Preferred -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -notlike '169.254.*' }
    }
  )
  if ([string]$rule.Enabled -ne 'True' -or [string]$rule.Direction -ne 'Inbound' -or
      [string]$rule.Action -ne 'Allow' -or [string]$rule.Profile -ne 'Private' -or
      [string]$port.Protocol -ne 'TCP' -or [string]$port.LocalPort -ne '445' -or
      @($address.RemoteAddress).Count -ne 1 -or [string]$address.RemoteAddress -ne $PrimaryHostIpv4 -or
      $privateAddresses.Count -ne 1) {
    throw 'PHASE7B_WP2_REPLICA_FIREWALL_NETWORK_CONTRACT_FAIL'
  }

  $attestation = [ordered]@{
    schemaVersion = 1
    classification = $contract.attestationClassification
    pass = $true
    attemptId = $AttemptId
    computerName = $ExpectedComputerName
    hostIdentitySha256 = $hostSha
    diskIdentitySha256 = $diskSha
    localReplicaRoot = $localRoot
    uncReplicaRoot = $unc.replicaRoot
    shareName = $ShareName
    fileSystem = [string]$volume.FileSystemType
    physicalDiskBusType = [string]$disk.BusType
    freeBytes = [int64]$volume.SizeRemaining
    physicallyAttached = $true
    rootExists = $rootExists
    rootEmpty = $rootEmpty
    shareEncryptData = [bool]$share.EncryptData
    shareCachingMode = [string]$share.CachingMode
    shareFolderEnumerationMode = [string]$share.FolderEnumerationMode
    replicaAccountIsAdministrator = $accountIsAdministrator
    firewallProfile = [string]$rule.Profile
    firewallProtocol = [string]$port.Protocol
    firewallLocalPort = [int]$port.LocalPort
    firewallRemoteAddress = [string]$address.RemoteAddress
    replicaPrivateIpv4 = [string]$privateAddresses[0].IPAddress
    replicaPrivatePrefixLength = [int]$privateAddresses[0].PrefixLength
    transportClassification = $contract.transportClassification
    mutationPerformed = $false
    reportPersisted = $false
    automaticRetryAllowed = $false
  }
  $accepted = Test-Phase7BSecondComputerReplicaAttestation -Attestation ([pscustomobject]$attestation) `
    -ExpectedAttemptId $AttemptId -ExpectedComputerName $ExpectedComputerName `
    -ExpectedHostIdentitySha256 $ExpectedHostIdentitySha256 -ExpectedDiskIdentitySha256 $ExpectedDiskIdentitySha256 `
    -ExpectedLocalReplicaRoot $LocalReplicaRoot -ExpectedUncReplicaRoot $UncReplicaRoot `
    -ExpectedShareName $ShareName -ExpectedPrimaryIpv4 $PrimaryHostIpv4
  if (-not $accepted.pass) { throw $accepted.classification }
  $attestation | ConvertTo-Json -Depth 6
} catch {
  $safeCode = if ($_.Exception.Message -match '^PHASE7B_') { $_.Exception.Message } else { 'PHASE7B_WP2_REPLICA_ATTESTATION_EXCEPTION' }
  [ordered]@{
    classification = 'PHASE7B_WP2_SECOND_COMPUTER_REPLICA_ATTESTATION_FAIL'
    pass = $false
    safeStage = $stage
    safeErrorCode = $safeCode
    mutationPerformed = $false
    reportPersisted = $false
    automaticRetryAllowed = $false
  } | ConvertTo-Json -Depth 4
  exit 1
}
