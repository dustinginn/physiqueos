[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^phase7b-wp2-[0-9a-f]{32}$')][string]$AttemptId,
  [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-f]{40}$')][string]$ExpectedToolingCommit,
  [Parameter(Mandatory = $true)][string]$PrimaryHostIpv4,
  [Parameter(Mandatory = $true)][ValidateRange(1, 32)][int]$PrimaryPrefixLength,
  [Parameter()][ValidateRange(1, [long]::MaxValue)][int64]$RequiredCapacityBytes = [int64]1GB
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bBoundedReplicaTransport.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bSecondComputerReplicaContract.psm1') -Force
$stage = 'validate-source-contract'
try {
  $contractValues = @(phase7bBoundedReplicaTransport\Get-Phase7BBoundedReplicaTransportContract)
  if ($contractValues.Count -ne 1 -or $null -eq $contractValues[0] -or $contractValues[0] -isnot [pscustomobject]) {
    throw 'PHASE7B_WP2B_LAPTOP_CONTRACT_SHAPE_FAIL'
  }
  $contract = $contractValues[0]
  $acceptedNameValues = @($contract.acceptedComputerName)
  if ($acceptedNameValues.Count -ne 1 -or $acceptedNameValues[0] -isnot [string]) {
    throw 'PHASE7B_WP2B_LAPTOP_ACCEPTED_NAME_SHAPE_FAIL'
  }
  $acceptedName = ConvertTo-Phase7BCanonicalComputerName -Value $acceptedNameValues

  $stage = 'validate-host-identity'
  $products = @(Get-CimInstance Win32_ComputerSystemProduct -ErrorAction Stop)
  if ($products.Count -ne 1) { throw 'PHASE7B_WP2B_LAPTOP_PRODUCT_CARDINALITY_FAIL' }
  $product = $products[0]
  $machineGuid = [string](Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Cryptography' -Name MachineGuid -ErrorAction Stop).MachineGuid
  $hostSha = Get-Phase7BBoundedReplicaHostIdentitySha256 -ComputerName $acceptedName `
    -Uuid ([string]$product.UUID) -MachineGuid $machineGuid
  if ($hostSha -cne $contract.acceptedHostIdentitySha256) { throw 'PHASE7B_WP2B_LAPTOP_HOST_IDENTITY_FAIL' }

  $stage = 'validate-storage-identity'
  $volumes = @(Get-Volume -DriveLetter D -ErrorAction Stop)
  $partitions = @(Get-Partition -DriveLetter D -ErrorAction Stop)
  $disks = @($partitions | Get-Disk -ErrorAction Stop)
  if ($volumes.Count -ne 1 -or $partitions.Count -ne 1 -or $disks.Count -ne 1) { throw 'PHASE7B_WP2B_LAPTOP_DISK_CARDINALITY_FAIL' }
  $volume = $volumes[0]
  $disk = $disks[0]
  $diskSha = Get-Phase7BBoundedReplicaDiskIdentitySha256 -ComputerName $acceptedName `
    -DiskNumber ([int]$disk.Number) -UniqueId ([string]$disk.UniqueId) -SerialNumber ([string]$disk.SerialNumber) `
    -FriendlyName ([string]$disk.FriendlyName) -DiskSizeBytes ([int64]$disk.Size) -BusType ([string]$disk.BusType)
  $destinationEvidence = [pscustomobject]@{
    computerName = $acceptedName
    hostIdentitySha256 = $hostSha
    diskIdentitySha256 = $diskSha
    driveRoot = 'D:\'
    fileSystem = [string]$volume.FileSystemType
    diskNumber = [int]$disk.Number
    busType = [string]$disk.BusType
    physicallyIndependent = $true
    freeBytes = [int64]$volume.SizeRemaining
    persistentAccountCreated = $false
    persistentShareRetained = $false
    persistentFirewallRuleRetained = $false
    persistentMappingRetained = $false
    credentialsPersisted = $false
    rawProductionFilesAccepted = $false
  }
  if (-not (Test-Phase7BBoundedReplicaDestinationEvidence -Evidence $destinationEvidence -RequiredBytes $RequiredCapacityBytes).pass) {
    throw 'PHASE7B_WP2B_LAPTOP_DESTINATION_FAIL'
  }

  $stage = 'validate-private-lan-binding'
  $primary = [ipaddress]::None
  if (-not [ipaddress]::TryParse($PrimaryHostIpv4, [ref]$primary) -or $primary.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork) {
    throw 'PHASE7B_WP2B_PRIMARY_IPV4_INVALID'
  }
  $privateIndices = @(Get-NetConnectionProfile -ErrorAction Stop | Where-Object { [string]$_.NetworkCategory -eq 'Private' } | Select-Object -ExpandProperty InterfaceIndex -Unique)
  $lanCandidates = @(
    foreach ($index in $privateIndices) {
      foreach ($address in @(Get-NetIPAddress -InterfaceIndex $index -AddressFamily IPv4 -AddressState Preferred -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike '169.254.*' })) {
        $binding = Test-Phase7BSecondComputerNetworkBinding -PrimaryIpv4 $PrimaryHostIpv4 -PrimaryPrefixLength $PrimaryPrefixLength -ReplicaIpv4 ([string]$address.IPAddress) -ReplicaPrefixLength ([int]$address.PrefixLength)
        if ($binding.pass) { $address }
      }
    }
  )
  if ($lanCandidates.Count -ne 1) { throw 'PHASE7B_WP2B_LAPTOP_PRIVATE_LAN_CARDINALITY_FAIL' }

  [ordered]@{
    classification = 'PHASE7B_WP2B_LAPTOP_READONLY_PREFLIGHT_PASS'
    pass = $true
    attemptId = $AttemptId
    toolingCommit = $ExpectedToolingCommit
    computerName = $acceptedName
    contractObjectCount = $contractValues.Count
    contractObjectType = $contract.GetType().FullName
    acceptedComputerNameValueCount = $acceptedNameValues.Count
    acceptedComputerNameValueType = $acceptedNameValues[0].GetType().FullName
    hardwareBoundIdentityAuthoritative = $true
    standaloneRuntimeHostnameGateRequired = $false
    hostIdentitySha256 = $hostSha
    diskIdentitySha256 = $diskSha
    fileSystem = [string]$volume.FileSystemType
    diskNumber = [int]$disk.Number
    busType = [string]$disk.BusType
    freeBytes = [int64]$volume.SizeRemaining
    replicaIpv4 = [string]$lanCandidates[0].IPAddress
    replicaPrefixLength = [int]$lanCandidates[0].PrefixLength
    primaryIpv4 = $PrimaryHostIpv4
    primaryPrefixLength = $PrimaryPrefixLength
    rawHardwareIdentifiersProjected = $false
    mutationPerformed = $false
    reportPersisted = $false
    receiverOpened = $false
    automaticRetryAllowed = $false
  } | ConvertTo-Json -Depth 5
} catch {
  $safeCode = if ($_.Exception.Message -match '^PHASE7B_') { $_.Exception.Message } else { 'PHASE7B_WP2B_LAPTOP_READONLY_PREFLIGHT_EXCEPTION' }
  [ordered]@{
    classification = 'PHASE7B_WP2B_LAPTOP_READONLY_PREFLIGHT_FAIL'
    pass = $false
    attemptId = $AttemptId
    toolingCommit = $ExpectedToolingCommit
    safeStage = $stage
    safeErrorCode = $safeCode
    mutationPerformed = $false
    reportPersisted = $false
    receiverOpened = $false
    automaticRetryAllowed = $false
  } | ConvertTo-Json -Depth 4
  exit 1
}
