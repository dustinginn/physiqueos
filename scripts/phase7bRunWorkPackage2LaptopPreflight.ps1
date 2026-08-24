[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^phase7b-wp2-[0-9a-f]{32}$')][string]$AttemptId,
  [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-f]{40}$')][string]$ExpectedToolingCommit,
  [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-f]{64}$')][string]$ExpectedArtifactSha256
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$acceptedAttemptId = 'phase7b-wp2-fc48221852204c188c414a18f6c42bbd'
$acceptedComputerName = 'LAPTOP-4G5UOU2R'
$acceptedHostIdentitySha256 = 'ea6696e8a0fc4d9242544568d62cd979fd57bd2478fac4f40755b3546776ac3c'
$acceptedDiskIdentitySha256 = '336d31be1f1e6dd4bde254fae94ffebf2b23829520a26c2f5d9bc5deda169896'
$acceptedFileSystem = 'NTFS'
$acceptedDiskNumber = 0
$acceptedBusType = 'SATA'
$requiredFreeBytes = [int64]1GB
$primaryIpv4 = '192.168.1.69'
$requiredPrefixLength = 24

function Get-Phase7BStage0Sha256 {
  [CmdletBinding()] param([Parameter(Mandatory = $true)][string]$Text)
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Text)))).Replace('-', '').ToLowerInvariant()
  } finally {
    $sha.Dispose()
  }
}

function Assert-Phase7BStage0Sha256Identity {
  [CmdletBinding()] param(
    [Parameter(Mandatory = $true)][AllowNull()]$Value,
    [Parameter(Mandatory = $true)][string]$ErrorCode
  )
  $values = @($Value)
  if ($values.Count -ne 1 -or $null -eq $values[0] -or $values[0] -isnot [string] -or
      [string]$values[0] -cnotmatch '^[0-9a-f]{64}$') {
    throw $ErrorCode
  }
  [string]$values[0]
}

function Get-Phase7BStage0HostIdentitySha256 {
  [CmdletBinding()] param(
    [Parameter(Mandatory = $true)][string]$ComputerName,
    [Parameter(Mandatory = $true)][string]$Uuid,
    [Parameter(Mandatory = $true)][string]$MachineGuid
  )
  $normalizedName = $ComputerName.ToLowerInvariant()
  $normalizedUuid = $Uuid.ToLowerInvariant()
  $normalizedMachineGuid = $MachineGuid.ToLowerInvariant()
  Get-Phase7BStage0Sha256 -Text ($normalizedName + '|' + $normalizedUuid + '|' + $normalizedMachineGuid)
}

function Get-Phase7BStage0DiskIdentitySha256 {
  [CmdletBinding()] param(
    [Parameter(Mandatory = $true)][string]$ComputerName,
    [Parameter(Mandatory = $true)][int]$DiskNumber,
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$UniqueId,
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$SerialNumber,
    [Parameter(Mandatory = $true)][string]$FriendlyName,
    [Parameter(Mandatory = $true)][int64]$DiskSizeBytes,
    [Parameter(Mandatory = $true)][string]$BusType
  )
  $normalizedName = $ComputerName.ToLowerInvariant()
  $normalizedUniqueId = $UniqueId.ToLowerInvariant()
  $normalizedSerialNumber = $SerialNumber.ToLowerInvariant()
  $normalizedFriendlyName = $FriendlyName.ToLowerInvariant()
  $normalizedBusType = $BusType.ToLowerInvariant()
  Get-Phase7BStage0Sha256 -Text ($normalizedName + '|' + [string]$DiskNumber + '|' +
    $normalizedUniqueId + '|' + $normalizedSerialNumber + '|' + $normalizedFriendlyName + '|' +
    [string]$DiskSizeBytes + '|' + $normalizedBusType)
}

function Assert-Phase7BStage0Snapshot {
  [CmdletBinding()] param(
    [Parameter(Mandatory = $true)][string]$ObservedAttemptId,
    [Parameter(Mandatory = $true)][string]$ObservedToolingCommit,
    [Parameter(Mandatory = $true)][string]$HostIdentitySha256,
    [Parameter(Mandatory = $true)][string]$DiskIdentitySha256,
    [Parameter(Mandatory = $true)][string]$FileSystem,
    [Parameter(Mandatory = $true)][int]$DiskNumber,
    [Parameter(Mandatory = $true)][string]$BusType,
    [Parameter(Mandatory = $true)][int64]$FreeBytes,
    [Parameter(Mandatory = $true)][int]$PrivateLanCandidateCount,
    [Parameter(Mandatory = $true)][string]$ReplicaIpv4,
    [Parameter(Mandatory = $true)][int]$ReplicaPrefixLength
  )
  if ($ObservedAttemptId -cne 'phase7b-wp2-fc48221852204c188c414a18f6c42bbd') {
    throw 'PHASE7B_WP2B_ATTEMPT_IDENTITY_FAIL'
  }
  if ($ObservedToolingCommit -cnotmatch '^[0-9a-f]{40}$') {
    throw 'PHASE7B_WP2B_TOOLING_COMMIT_IDENTITY_FAIL'
  }
  [void](Assert-Phase7BStage0Sha256Identity -Value $HostIdentitySha256 `
    -ErrorCode 'PHASE7B_WP2B_LAPTOP_HOST_IDENTITY_SHAPE_FAIL')
  [void](Assert-Phase7BStage0Sha256Identity -Value $DiskIdentitySha256 `
    -ErrorCode 'PHASE7B_WP2B_LAPTOP_DISK_IDENTITY_SHAPE_FAIL')
  if ($HostIdentitySha256 -cne 'ea6696e8a0fc4d9242544568d62cd979fd57bd2478fac4f40755b3546776ac3c') {
    throw 'PHASE7B_WP2B_LAPTOP_HOST_IDENTITY_FAIL'
  }
  if ($DiskIdentitySha256 -cne '336d31be1f1e6dd4bde254fae94ffebf2b23829520a26c2f5d9bc5deda169896') {
    throw 'PHASE7B_WP2B_LAPTOP_DISK_IDENTITY_FAIL'
  }
  if ($FileSystem -cne 'NTFS' -or $DiskNumber -ne 0 -or $BusType -cne 'SATA') {
    throw 'PHASE7B_WP2B_LAPTOP_STORAGE_CONTRACT_FAIL'
  }
  if ($FreeBytes -lt [int64]1GB) {
    throw 'PHASE7B_WP2B_LAPTOP_CAPACITY_FAIL'
  }
  if ($PrivateLanCandidateCount -ne 1 -or $ReplicaPrefixLength -ne 24) {
    throw 'PHASE7B_WP2B_LAPTOP_PRIVATE_LAN_CARDINALITY_FAIL'
  }
  $replicaAddress = [ipaddress]::None
  if (-not [ipaddress]::TryParse($ReplicaIpv4, [ref]$replicaAddress) -or
      $replicaAddress.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork) {
    throw 'PHASE7B_WP2B_LAPTOP_PRIVATE_LAN_IPV4_FAIL'
  }
  $primaryBytes = ([ipaddress]'192.168.1.69').GetAddressBytes()
  $replicaBytes = $replicaAddress.GetAddressBytes()
  if ($primaryBytes[0] -ne $replicaBytes[0] -or
      $primaryBytes[1] -ne $replicaBytes[1] -or
      $primaryBytes[2] -ne $replicaBytes[2]) {
    throw 'PHASE7B_WP2B_LAPTOP_PRIVATE_LAN_SUBNET_FAIL'
  }
  $true
}

$stage = 'validate-delivery-identity'
try {
  $actualArtifactSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $PSCommandPath -ErrorAction Stop).Hash.ToLowerInvariant()
  if ($actualArtifactSha256 -cne $ExpectedArtifactSha256) { throw 'PHASE7B_WP2B_STAGE0_ARTIFACT_IDENTITY_FAIL' }

  $stage = 'validate-active-identity-contract'
  [void](Assert-Phase7BStage0Sha256Identity -Value $acceptedHostIdentitySha256 `
    -ErrorCode 'PHASE7B_WP2B_ACTIVE_HOST_IDENTITY_CONTRACT_INVALID')
  [void](Assert-Phase7BStage0Sha256Identity -Value $acceptedDiskIdentitySha256 `
    -ErrorCode 'PHASE7B_WP2B_ACTIVE_DISK_IDENTITY_CONTRACT_INVALID')

  $stage = 'validate-operation-identity'
  if ($AttemptId -cne $acceptedAttemptId) { throw 'PHASE7B_WP2B_ATTEMPT_IDENTITY_FAIL' }
  if ($ExpectedToolingCommit -cnotmatch '^[0-9a-f]{40}$') { throw 'PHASE7B_WP2B_TOOLING_COMMIT_IDENTITY_FAIL' }

  $stage = 'validate-host-identity'
  $products = @(Get-CimInstance Win32_ComputerSystemProduct -ErrorAction Stop)
  if ($products.Count -ne 1) { throw 'PHASE7B_WP2B_LAPTOP_PRODUCT_CARDINALITY_FAIL' }
  $uuid = [string]$products[0].UUID
  $machineGuid = [string](Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Cryptography' -Name MachineGuid -ErrorAction Stop).MachineGuid
  if ([string]::IsNullOrWhiteSpace($uuid) -or [string]::IsNullOrWhiteSpace($machineGuid)) {
    throw 'PHASE7B_WP2B_LAPTOP_HOST_COMPONENT_MISSING'
  }
  $uuidGuid = [guid]::Empty
  $machineGuidValue = [guid]::Empty
  if (-not [guid]::TryParse($uuid, [ref]$uuidGuid) -or $uuidGuid -eq [guid]::Empty -or
      -not [guid]::TryParse($machineGuid, [ref]$machineGuidValue) -or $machineGuidValue -eq [guid]::Empty) {
    throw 'PHASE7B_WP2B_LAPTOP_HOST_COMPONENT_FORMAT_FAIL'
  }
  $hostIdentitySha256 = Get-Phase7BStage0HostIdentitySha256 -ComputerName $acceptedComputerName `
    -Uuid $uuid -MachineGuid $machineGuid
  if ($hostIdentitySha256 -cne $acceptedHostIdentitySha256) { throw 'PHASE7B_WP2B_LAPTOP_HOST_IDENTITY_FAIL' }

  $stage = 'validate-storage-identity'
  $volumes = @(Get-Volume -DriveLetter D -ErrorAction Stop)
  $partitions = @(Get-Partition -DriveLetter D -ErrorAction Stop)
  if ($volumes.Count -ne 1 -or $partitions.Count -ne 1) { throw 'PHASE7B_WP2B_LAPTOP_STORAGE_CARDINALITY_FAIL' }
  $disks = @($partitions | Get-Disk -ErrorAction Stop)
  if ($disks.Count -ne 1) { throw 'PHASE7B_WP2B_LAPTOP_DISK_CARDINALITY_FAIL' }
  $volume = $volumes[0]
  $disk = $disks[0]
  $fileSystem = [string]$volume.FileSystemType
  $diskNumber = [int]$disk.Number
  $busType = [string]$disk.BusType
  $freeBytes = [int64]$volume.SizeRemaining
  $diskIdentitySha256 = Get-Phase7BStage0DiskIdentitySha256 -ComputerName $acceptedComputerName `
    -DiskNumber $diskNumber -UniqueId ([string]$disk.UniqueId) -SerialNumber ([string]$disk.SerialNumber) `
    -FriendlyName ([string]$disk.FriendlyName) -DiskSizeBytes ([int64]$disk.Size) -BusType $busType
  if ($diskIdentitySha256 -cne $acceptedDiskIdentitySha256) { throw 'PHASE7B_WP2B_LAPTOP_DISK_IDENTITY_FAIL' }
  if ($fileSystem -cne $acceptedFileSystem -or $diskNumber -ne $acceptedDiskNumber -or $busType -cne $acceptedBusType) {
    throw 'PHASE7B_WP2B_LAPTOP_STORAGE_CONTRACT_FAIL'
  }
  if ($freeBytes -lt $requiredFreeBytes) { throw 'PHASE7B_WP2B_LAPTOP_CAPACITY_FAIL' }

  $stage = 'validate-private-lan-binding'
  $privateInterfaceIndices = @(Get-NetConnectionProfile -ErrorAction Stop |
    Where-Object { [string]$_.NetworkCategory -ceq 'Private' } |
    Select-Object -ExpandProperty InterfaceIndex -Unique)
  $lanCandidates = @(
    foreach ($interfaceIndex in $privateInterfaceIndices) {
      foreach ($address in @(Get-NetIPAddress -InterfaceIndex $interfaceIndex -AddressFamily IPv4 -AddressState Preferred -ErrorAction SilentlyContinue)) {
        $candidateIpv4 = [string]$address.IPAddress
        $candidatePrefixLength = [int]$address.PrefixLength
        $candidateAddress = [ipaddress]::None
        if ($candidatePrefixLength -eq $requiredPrefixLength -and
            $candidateIpv4 -notlike '169.254.*' -and
            [ipaddress]::TryParse($candidateIpv4, [ref]$candidateAddress) -and
            $candidateAddress.AddressFamily -eq [Net.Sockets.AddressFamily]::InterNetwork) {
          $primaryBytes = ([ipaddress]$primaryIpv4).GetAddressBytes()
          $candidateBytes = $candidateAddress.GetAddressBytes()
          if ($primaryBytes[0] -eq $candidateBytes[0] -and
              $primaryBytes[1] -eq $candidateBytes[1] -and
              $primaryBytes[2] -eq $candidateBytes[2]) {
            $address
          }
        }
      }
    }
  )
  if ($lanCandidates.Count -ne 1) { throw 'PHASE7B_WP2B_LAPTOP_PRIVATE_LAN_CARDINALITY_FAIL' }
  $replicaIpv4 = [string]$lanCandidates[0].IPAddress
  $replicaPrefixLength = [int]$lanCandidates[0].PrefixLength

  [void](Assert-Phase7BStage0Snapshot -ObservedAttemptId $AttemptId -ObservedToolingCommit $ExpectedToolingCommit `
    -HostIdentitySha256 $hostIdentitySha256 -DiskIdentitySha256 $diskIdentitySha256 `
    -FileSystem $fileSystem -DiskNumber $diskNumber -BusType $busType `
    -FreeBytes $freeBytes -PrivateLanCandidateCount $lanCandidates.Count -ReplicaIpv4 $replicaIpv4 `
    -ReplicaPrefixLength $replicaPrefixLength)

  [ordered]@{
    classification = 'PHASE7B_WP2B_LAPTOP_READONLY_PREFLIGHT_PASS'
    pass = $true
    attemptId = $AttemptId
    toolingCommit = $ExpectedToolingCommit
    artifactSha256 = $actualArtifactSha256
    computerName = $acceptedComputerName
    hostIdentitySha256 = $hostIdentitySha256
    diskIdentitySha256 = $diskIdentitySha256
    driveRoot = 'D:\'
    fileSystem = $fileSystem
    diskNumber = $diskNumber
    busType = $busType
    freeBytes = $freeBytes
    requiredFreeBytes = $requiredFreeBytes
    networkCategory = 'Private'
    replicaIpv4 = $replicaIpv4
    replicaPrefixLength = $replicaPrefixLength
    primaryIpv4 = $primaryIpv4
    primaryPrefixLength = $requiredPrefixLength
    mutationPerformed = $false
    reportPersisted = $false
    receiverOpened = $false
    automaticRetryAllowed = $false
    wp2cAuthorized = $false
  } | ConvertTo-Json -Compress
} catch {
  $safeErrorCode = if ($_.Exception.Message -match '^PHASE7B_') {
    $_.Exception.Message
  } else {
    'PHASE7B_WP2B_LAPTOP_READONLY_PREFLIGHT_EXCEPTION'
  }
  [ordered]@{
    classification = 'PHASE7B_WP2B_LAPTOP_READONLY_PREFLIGHT_FAIL'
    pass = $false
    attemptId = $AttemptId
    toolingCommit = $ExpectedToolingCommit
    safeStage = $stage
    safeErrorCode = $safeErrorCode
    mutationPerformed = $false
    reportPersisted = $false
    receiverOpened = $false
    automaticRetryAllowed = $false
    wp2cAuthorized = $false
  } | ConvertTo-Json -Compress
  exit 1
}
