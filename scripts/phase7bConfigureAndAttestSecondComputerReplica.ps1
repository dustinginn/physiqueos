[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidateSet('ConfigureAndAttest')][string]$Operation,
  [Parameter(Mandatory = $true)][string]$AttemptId,
  [Parameter(Mandatory = $true)][string]$ExpectedComputerName,
  [Parameter(Mandatory = $true)][string]$ExpectedHostIdentitySha256,
  [Parameter(Mandatory = $true)][string]$ExpectedDiskIdentitySha256,
  [Parameter(Mandatory = $true)][int]$ExpectedDiskNumber,
  [Parameter(Mandatory = $true)][string]$ExpectedDiskBusType,
  [Parameter(Mandatory = $true)][string]$ExpectedFileSystem,
  [Parameter(Mandatory = $true)][int64]$MinimumFreeBytes,
  [Parameter(Mandatory = $true)][string]$ExpectedReplicaIpv4,
  [Parameter(Mandatory = $true)][int]$ExpectedReplicaPrefixLength,
  [Parameter(Mandatory = $true)][string]$PrimaryHostIpv4,
  [Parameter(Mandatory = $true)][int]$PrimaryHostPrefixLength,
  [Parameter(Mandatory = $true)][string]$ShareRoot,
  [Parameter(Mandatory = $true)][string]$LocalReplicaRoot,
  [Parameter(Mandatory = $true)][string]$ShareName,
  [Parameter(Mandatory = $true)][string]$UncReplicaRoot,
  [Parameter(Mandatory = $true)][string]$ReplicaAccountName,
  [Parameter(Mandatory = $true)][string]$FirewallRuleName,
  [Parameter(Mandatory = $true)][string]$FounderAuthorizationId,
  [Parameter(Mandatory = $true)][switch]$AcknowledgeExactlyOneConfiguration,
  [Parameter(Mandatory = $true)][switch]$AcknowledgeNoAutomaticRetry,
  [Parameter(Mandatory = $true)][switch]$AcknowledgeNoProbeOrCapture
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$stage = 'validate-arguments'
$mutationStarted = $false
$completedMutations = New-Object System.Collections.Generic.List[string]
$authorizationLiteral = 'phase7b-wp2b-replica-config-r2-6cce4f4197ae4651a33ec123825326f9'
$configurationPass = 'PHASE7B_WP2_SECOND_COMPUTER_REPLICA_CONFIGURATION_PASS'
$attestationPass = 'PHASE7B_WP2_SECOND_COMPUTER_REPLICA_ATTESTATION_PASS'

function Get-Sha256Text {
  param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Text)
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Text)))).Replace('-', '').ToLowerInvariant()
  } finally { $sha.Dispose() }
}

function Get-PrincipalSidText {
  param([Parameter(Mandatory = $true)]$IdentityReference)
  try {
    ([Security.Principal.NTAccount][string]$IdentityReference).Translate([Security.Principal.SecurityIdentifier]).Value
  } catch {
    ([Security.Principal.SecurityIdentifier][string]$IdentityReference).Value
  }
}

function Test-SameIpv4Subnet {
  param(
    [Parameter(Mandatory = $true)][string]$FirstAddress,
    [Parameter(Mandatory = $true)][string]$SecondAddress,
    [Parameter(Mandatory = $true)][int]$PrefixLength
  )
  $first = [ipaddress]::None
  $second = [ipaddress]::None
  if (-not [ipaddress]::TryParse($FirstAddress, [ref]$first) -or
      -not [ipaddress]::TryParse($SecondAddress, [ref]$second) -or
      $first.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork -or
      $second.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork -or
      $PrefixLength -lt 1 -or $PrefixLength -gt 32) { return $false }
  $firstBytes = $first.GetAddressBytes()
  $secondBytes = $second.GetAddressBytes()
  [array]::Reverse($firstBytes)
  [array]::Reverse($secondBytes)
  $mask = if ($PrefixLength -eq 32) { [uint32]::MaxValue } else { [uint32]([uint32]::MaxValue -shl (32 - $PrefixLength)) }
  ([BitConverter]::ToUInt32($firstBytes, 0) -band $mask) -eq ([BitConverter]::ToUInt32($secondBytes, 0) -band $mask)
}

function Test-InteractiveReplicaPassword {
  param([Parameter()][AllowNull()][Security.SecureString]$Password)
  $null -ne $Password -and $Password.Length -ge 14
}

function Test-ExactConfigurationObservation {
  param([Parameter(Mandatory = $true)]$Observation)
  [bool](
    [bool]$Observation.hostIdentityMatch -and
    [bool]$Observation.diskIdentityMatch -and
    [bool]$Observation.networkBindingMatch -and
    [bool]$Observation.accountEnabled -and
    -not [bool]$Observation.accountIsAdministrator -and
    [bool]$Observation.aclExact -and
    [bool]$Observation.replicaRootEmpty -and
    [bool]$Observation.sharePathExact -and
    [bool]$Observation.shareEncryptData -and
    [string]$Observation.shareCachingMode -eq 'None' -and
    [string]$Observation.shareFolderEnumerationMode -eq 'AccessBased' -and
    [bool]$Observation.shareAccessExact -and
    [bool]$Observation.firewallExact
  )
}

function Set-ExactReplicaAcl {
  param(
    [Parameter(Mandatory = $true)][string]$LiteralPath,
    [Parameter(Mandatory = $true)][Security.Principal.SecurityIdentifier]$ReplicaSid
  )
  $acl = New-Object Security.AccessControl.DirectorySecurity
  $acl.SetAccessRuleProtection($true, $false)
  $inheritance = [Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'
  $propagation = [Security.AccessControl.PropagationFlags]::None
  $allow = [Security.AccessControl.AccessControlType]::Allow
  foreach ($entry in @(
      [pscustomobject]@{ Sid = [Security.Principal.SecurityIdentifier]'S-1-5-18'; Rights = [Security.AccessControl.FileSystemRights]::FullControl },
      [pscustomobject]@{ Sid = [Security.Principal.SecurityIdentifier]'S-1-5-32-544'; Rights = [Security.AccessControl.FileSystemRights]::FullControl },
      [pscustomobject]@{ Sid = $ReplicaSid; Rights = [Security.AccessControl.FileSystemRights]::Modify }
    )) {
    $rule = New-Object Security.AccessControl.FileSystemAccessRule($entry.Sid, $entry.Rights, $inheritance, $propagation, $allow)
    [void]$acl.AddAccessRule($rule)
  }
  Set-Acl -LiteralPath $LiteralPath -AclObject $acl
}

function Test-ExactReplicaAcl {
  param(
    [Parameter(Mandatory = $true)][string]$LiteralPath,
    [Parameter(Mandatory = $true)][string]$ReplicaSid
  )
  $acl = Get-Acl -LiteralPath $LiteralPath
  $allowed = @{
    'S-1-5-18' = [int64][Security.AccessControl.FileSystemRights]::FullControl
    'S-1-5-32-544' = [int64][Security.AccessControl.FileSystemRights]::FullControl
    $ReplicaSid = [int64]([Security.AccessControl.FileSystemRights]::Modify -bor [Security.AccessControl.FileSystemRights]::Synchronize)
  }
  $aces = @($acl.Access | Where-Object { [string]$_.AccessControlType -eq 'Allow' })
  if (-not $acl.AreAccessRulesProtected -or $aces.Count -ne 3) { return $false }
  foreach ($ace in $aces) {
    $sid = Get-PrincipalSidText -IdentityReference $ace.IdentityReference
    if (-not $allowed.ContainsKey($sid) -or [int64]$ace.FileSystemRights -ne $allowed[$sid] -or
        -not $ace.InheritanceFlags.HasFlag([Security.AccessControl.InheritanceFlags]::ContainerInherit) -or
        -not $ace.InheritanceFlags.HasFlag([Security.AccessControl.InheritanceFlags]::ObjectInherit)) { return $false }
  }
  $true
}

try {
  if ($Operation -ne 'ConfigureAndAttest' -or
      $AttemptId -ne 'phase7b-wp2-6cce4f4197ae4651a33ec123825326f9' -or
      $FounderAuthorizationId -ne $authorizationLiteral -or
      -not ($AcknowledgeExactlyOneConfiguration -and $AcknowledgeNoAutomaticRetry -and $AcknowledgeNoProbeOrCapture) -or
      $ExpectedHostIdentitySha256 -notmatch '^[0-9a-f]{64}$' -or
      $ExpectedDiskIdentitySha256 -notmatch '^[0-9a-f]{64}$' -or
      $ExpectedComputerName -notmatch '^[A-Za-z0-9-]{1,63}$' -or
      $ReplicaAccountName -notmatch '^[A-Za-z0-9_.-]{1,20}$' -or
      $ShareName -notmatch '^[A-Za-z0-9$_.-]{1,80}$' -or
      $ExpectedDiskNumber -lt 0 -or $MinimumFreeBytes -lt 1GB -or
      $ExpectedReplicaPrefixLength -ne $PrimaryHostPrefixLength -or
      $ExpectedReplicaPrefixLength -lt 1 -or $ExpectedReplicaPrefixLength -gt 32 -or
      -not (Test-SameIpv4Subnet -FirstAddress $ExpectedReplicaIpv4 -SecondAddress $PrimaryHostIpv4 -PrefixLength $ExpectedReplicaPrefixLength)) {
    throw 'PHASE7B_WP2_REPLICA_CONFIGURATION_ARGUMENT_OR_AUTHORIZATION_FAIL'
  }
  $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'PHASE7B_WP2_REPLICA_CONFIGURATION_ELEVATION_REQUIRED'
  }

  $shareRootFull = [IO.Path]::GetFullPath($ShareRoot).TrimEnd('\')
  $replicaRootFull = [IO.Path]::GetFullPath($LocalReplicaRoot).TrimEnd('\')
  $expectedShareRoot = 'D:\Phase7B\replicas\379bb303\wp2b'
  $expectedReplicaRoot = "$expectedShareRoot\encrypted-replica"
  $expectedUnc = "\\$ExpectedComputerName\$ShareName\encrypted-replica"
  if ($ExpectedComputerName -ne 'LAPTOP-4G5U0U2R' -or $ExpectedDiskNumber -ne 0 -or
      $ExpectedDiskBusType -ne 'SATA' -or $ExpectedFileSystem -ne 'NTFS' -or
      $ExpectedReplicaIpv4 -ne '192.168.1.68' -or $PrimaryHostIpv4 -ne '192.168.1.69' -or
      $ExpectedReplicaPrefixLength -ne 24 -or $PrimaryHostPrefixLength -ne 24 -or
      $ReplicaAccountName -ne 'PhysiqueOSReplica' -or $ShareName -ne 'PhysiqueOS-Phase7B-WP2B$' -or
      $FirewallRuleName -ne 'PhysiqueOS-Phase7B-WP2B-SMB-In' -or
      -not $shareRootFull.Equals($expectedShareRoot, [StringComparison]::OrdinalIgnoreCase) -or
      -not $replicaRootFull.Equals($expectedReplicaRoot, [StringComparison]::OrdinalIgnoreCase) -or
      -not $UncReplicaRoot.TrimEnd('\').Equals($expectedUnc, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'PHASE7B_WP2_REPLICA_CONFIGURATION_EXACT_BINDING_FAIL'
  }

  $stage = 'validate-host-disk-network'
  if ([Environment]::MachineName -ne $ExpectedComputerName) { throw 'PHASE7B_WP2_REPLICA_HOST_NAME_MISMATCH' }
  $product = Get-CimInstance Win32_ComputerSystemProduct
  $machineGuid = [string](Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Cryptography' -Name MachineGuid).MachineGuid
  $hostMaterial = $ExpectedComputerName.ToLowerInvariant() + '|' +
    ([string]$product.UUID).ToLowerInvariant() + '|' + $machineGuid.ToLowerInvariant()
  $hostSha = Get-Sha256Text -Text $hostMaterial
  if ($hostSha -ne $ExpectedHostIdentitySha256) { throw 'PHASE7B_WP2_REPLICA_HOST_IDENTITY_MISMATCH' }

  $volume = Get-Volume -DriveLetter D -ErrorAction Stop
  $partitions = @(Get-Partition -DriveLetter D -ErrorAction Stop)
  $disks = @($partitions | Get-Disk -ErrorAction Stop)
  if ($partitions.Count -ne 1 -or $disks.Count -ne 1) { throw 'PHASE7B_WP2_REPLICA_DISK_CARDINALITY_FAIL' }
  $disk = $disks[0]
  $diskMaterial = $ExpectedComputerName.ToLowerInvariant() + '|' + [string]$disk.Number + '|' +
    ([string]$disk.UniqueId).ToLowerInvariant() + '|' + ([string]$disk.SerialNumber).ToLowerInvariant() + '|' +
    ([string]$disk.FriendlyName).ToLowerInvariant() + '|' + [string]$disk.Size + '|' +
    ([string]$disk.BusType).ToLowerInvariant()
  $diskSha = Get-Sha256Text -Text $diskMaterial
  if ($diskSha -ne $ExpectedDiskIdentitySha256 -or [int]$disk.Number -ne $ExpectedDiskNumber -or
      [string]$disk.BusType -ne $ExpectedDiskBusType -or [string]$volume.FileSystemType -ne $ExpectedFileSystem -or
      [string]$disk.HealthStatus -ne 'Healthy' -or [int64]$volume.SizeRemaining -lt $MinimumFreeBytes) {
    throw 'PHASE7B_WP2_REPLICA_DISK_CONTRACT_FAIL'
  }

  $privateProfiles = @(Get-NetConnectionProfile | Where-Object { [string]$_.NetworkCategory -eq 'Private' })
  $privateAddresses = @(
    foreach ($profile in $privateProfiles) {
      Get-NetIPAddress -InterfaceIndex $profile.InterfaceIndex -AddressFamily IPv4 -AddressState Preferred -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -notlike '169.254.*' }
    }
  )
  $boundAddresses = @($privateAddresses | Where-Object {
      $_.IPAddress -eq $ExpectedReplicaIpv4 -and [int]$_.PrefixLength -eq $ExpectedReplicaPrefixLength
    })
  if ($boundAddresses.Count -ne 1) { throw 'PHASE7B_WP2_REPLICA_PRIVATE_LAN_BINDING_FAIL' }

  $stage = 'validate-fresh-target-state'
  if (Get-LocalUser -Name $ReplicaAccountName -ErrorAction SilentlyContinue) { throw 'PHASE7B_WP2_REPLICA_ACCOUNT_ALREADY_EXISTS' }
  if (Test-Path -LiteralPath 'D:\Phase7B') { throw 'PHASE7B_WP2_REPLICA_ROOT_ALREADY_EXISTS' }
  if (Get-SmbShare -Name $ShareName -ErrorAction SilentlyContinue) { throw 'PHASE7B_WP2_REPLICA_SHARE_ALREADY_EXISTS' }
  if (Get-NetFirewallRule -Name $FirewallRuleName -ErrorAction SilentlyContinue) { throw 'PHASE7B_WP2_REPLICA_FIREWALL_ALREADY_EXISTS' }

  $stage = 'collect-interactive-password'
  $password = Read-Host -Prompt 'Enter a new password for LAPTOP-4G5U0U2R\PhysiqueOSReplica' -AsSecureString
  if (-not (Test-InteractiveReplicaPassword -Password $password)) { throw 'PHASE7B_WP2_REPLICA_PASSWORD_POLICY_FAIL' }

  $stage = 'create-dedicated-account'
  $mutationStarted = $true
  $account = New-LocalUser -Name $ReplicaAccountName -Password $password -AccountNeverExpires -PasswordNeverExpires:$false -UserMayNotChangePassword:$false -Description 'PhysiqueOS Phase 7B WP2B encrypted replica transport only'
  $completedMutations.Add('dedicated-local-account-created')
  $accountSid = [Security.Principal.SecurityIdentifier]$account.SID

  $stage = 'create-and-secure-replica-hierarchy'
  $paths = @('D:\Phase7B', 'D:\Phase7B\replicas', 'D:\Phase7B\replicas\379bb303', $shareRootFull, $replicaRootFull)
  foreach ($path in $paths) {
    [void](New-Item -ItemType Directory -Path $path -ErrorAction Stop)
    Set-ExactReplicaAcl -LiteralPath $path -ReplicaSid $accountSid
  }
  $completedMutations.Add('replica-directory-hierarchy-created-and-acl-bound')

  $stage = 'create-encrypted-share'
  $accountIdentity = "$ExpectedComputerName\$ReplicaAccountName"
  [void](New-SmbShare -Name $ShareName -Path $shareRootFull -ChangeAccess $accountIdentity -EncryptData $true -CachingMode None -FolderEnumerationMode AccessBased -ErrorAction Stop)
  $completedMutations.Add('encrypted-smb-share-created')

  $stage = 'create-restricted-firewall-rule'
  [void](New-NetFirewallRule -Name $FirewallRuleName -DisplayName $FirewallRuleName -Direction Inbound -Action Allow -Enabled True -Profile Private -Protocol TCP -LocalPort 445 -RemoteAddress $PrimaryHostIpv4 -ErrorAction Stop)
  $completedMutations.Add('private-host-restricted-firewall-rule-created')

  $stage = 'attest-configuration'
  $account = Get-LocalUser -Name $ReplicaAccountName -ErrorAction Stop
  $administratorsGroup = Get-LocalGroup -SID 'S-1-5-32-544' -ErrorAction Stop
  $administrators = @(Get-LocalGroupMember -Group $administratorsGroup -ErrorAction Stop)
  $accountIsAdministrator = @($administrators | Where-Object { $_.SID -eq $account.SID }).Count -gt 0
  $rootEmpty = @(Get-ChildItem -LiteralPath $replicaRootFull -Force -ErrorAction Stop).Count -eq 0
  $aclPathsPass = @($paths | Where-Object { -not (Test-ExactReplicaAcl -LiteralPath $_ -ReplicaSid ([string]$account.SID)) }).Count -eq 0

  $shares = @(Get-SmbShare -Name $ShareName -ErrorAction Stop)
  if ($shares.Count -ne 1) { throw 'PHASE7B_WP2_REPLICA_SHARE_CARDINALITY_FAIL' }
  $share = $shares[0]
  $shareAccess = @(Get-SmbShareAccess -Name $ShareName -ErrorAction Stop)
  $shareAccessPass = $shareAccess.Count -eq 1 -and [string]$shareAccess[0].AccountName -eq $accountIdentity -and
    [string]$shareAccess[0].AccessControlType -eq 'Allow' -and [string]$shareAccess[0].AccessRight -eq 'Change'

  $rules = @(Get-NetFirewallRule -Name $FirewallRuleName -ErrorAction Stop)
  if ($rules.Count -ne 1) { throw 'PHASE7B_WP2_REPLICA_FIREWALL_CARDINALITY_FAIL' }
  $rule = $rules[0]
  $portFilters = @($rule | Get-NetFirewallPortFilter)
  $addressFilters = @($rule | Get-NetFirewallAddressFilter)
  $firewallPass = $portFilters.Count -eq 1 -and $addressFilters.Count -eq 1 -and
    [string]$rule.Enabled -eq 'True' -and [string]$rule.Direction -eq 'Inbound' -and
    [string]$rule.Action -eq 'Allow' -and [string]$rule.Profile -eq 'Private' -and
    [string]$portFilters[0].Protocol -eq 'TCP' -and [string]$portFilters[0].LocalPort -eq '445' -and
    @($addressFilters[0].RemoteAddress).Count -eq 1 -and [string]$addressFilters[0].RemoteAddress -eq $PrimaryHostIpv4

  $configurationObservation = [pscustomobject][ordered]@{
    hostIdentityMatch = $hostSha -eq $ExpectedHostIdentitySha256
    diskIdentityMatch = $diskSha -eq $ExpectedDiskIdentitySha256
    networkBindingMatch = $boundAddresses.Count -eq 1
    accountEnabled = [bool]$account.Enabled
    accountIsAdministrator = $accountIsAdministrator
    aclExact = $aclPathsPass
    replicaRootEmpty = $rootEmpty
    sharePathExact = [IO.Path]::GetFullPath([string]$share.Path).TrimEnd('\') -eq $shareRootFull
    shareEncryptData = [bool]$share.EncryptData
    shareCachingMode = [string]$share.CachingMode
    shareFolderEnumerationMode = [string]$share.FolderEnumerationMode
    shareAccessExact = $shareAccessPass
    firewallExact = $firewallPass
  }
  $allPass = Test-ExactConfigurationObservation -Observation $configurationObservation
  if (-not $allPass) { throw 'PHASE7B_WP2_REPLICA_POST_CONFIGURATION_ATTESTATION_FAIL' }

  $global:LASTEXITCODE = 0
  [ordered]@{
    schemaVersion = 2
    classification = 'PHASE7B_WP2_SECOND_COMPUTER_REPLICA_CONFIGURATION_AND_ATTESTATION_PASS'
    pass = $true
    invocationStatus = 0
    operation = $Operation
    attemptId = $AttemptId
    configurationClassification = $configurationPass
    attestationClassification = $attestationPass
    mutationPerformed = $true
    automaticRetryAllowed = $false
    syntheticProbePerformed = $false
    capturePerformed = $false
    credentialsPersisted = $false
    passwordProjected = $false
    computerName = $ExpectedComputerName
    hostIdentitySha256 = $hostSha
    replicaIpv4 = $ExpectedReplicaIpv4
    replicaPrefixLength = $ExpectedReplicaPrefixLength
    primaryHostIpv4 = $PrimaryHostIpv4
    primaryHostPrefixLength = $PrimaryHostPrefixLength
    diskNumber = [int]$disk.Number
    diskIdentitySha256 = $diskSha
    physicalDiskBusType = [string]$disk.BusType
    physicalDiskHealth = [string]$disk.HealthStatus
    fileSystem = [string]$volume.FileSystemType
    freeBytes = [int64]$volume.SizeRemaining
    localReplicaRoot = $replicaRootFull
    replicaDirectoryEmpty = $rootEmpty
    shareName = $ShareName
    shareRoot = $shareRootFull
    uncReplicaRoot = $expectedUnc
    shareEncryptData = [bool]$share.EncryptData
    shareCachingMode = [string]$share.CachingMode
    shareFolderEnumerationMode = [string]$share.FolderEnumerationMode
    shareAccessExact = $shareAccessPass
    replicaAccountIdentity = $accountIdentity
    replicaAccountEnabled = [bool]$account.Enabled
    replicaAccountIsAdministrator = $accountIsAdministrator
    aclExact = $aclPathsPass
    firewallRuleName = $FirewallRuleName
    firewallProfile = [string]$rule.Profile
    firewallProtocol = [string]$portFilters[0].Protocol
    firewallLocalPort = [int]$portFilters[0].LocalPort
    firewallRemoteAddress = [string]$addressFilters[0].RemoteAddress
    reportPersisted = $false
    cleanupRequiredNow = $false
    futureCleanupRequiresSeparateAuthorization = $true
    workPackage2CaptureAuthorized = $false
    workPackage2CAuthorized = $false
  } | ConvertTo-Json -Depth 6
} catch {
  $safeCode = if ($_.Exception.Message -match '^PHASE7B_') { $_.Exception.Message } else { 'PHASE7B_WP2_REPLICA_CONFIGURATION_EXCEPTION' }
  [ordered]@{
    schemaVersion = 2
    classification = 'PHASE7B_WP2_SECOND_COMPUTER_REPLICA_CONFIGURATION_AND_ATTESTATION_FAIL'
    pass = $false
    invocationStatus = 1
    operation = $Operation
    attemptId = $AttemptId
    safeStage = $stage
    safeErrorCode = $safeCode
    mutationStarted = $mutationStarted
    completedMutations = @($completedMutations)
    automaticRetryAllowed = $false
    newFounderAuthorizationRequired = $mutationStarted
    syntheticProbePerformed = $false
    capturePerformed = $false
    passwordProjected = $false
    reportPersisted = $false
  } | ConvertTo-Json -Depth 5
  $global:LASTEXITCODE = 1
  return
} finally {
  if (Get-Variable -Name password -ErrorAction SilentlyContinue) {
    if ($null -ne $password) { $password.Dispose() }
    $password = $null
  }
}
