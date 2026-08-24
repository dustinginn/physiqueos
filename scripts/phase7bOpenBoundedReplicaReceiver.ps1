[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidateSet('Inspect', 'OpenEphemeralReceiver')][string]$Operation,
  [Parameter()][string]$AttemptId,
  [Parameter()][string]$PrimaryHostIpv4,
  [Parameter()][string]$ExpectedPacketFileName,
  [Parameter()][int64]$RequiredCapacityBytes,
  [Parameter()][string]$AuthorizationAcknowledgement
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bBoundedReplicaTransport.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bIsolatedGuestContract.psm1') -Force
$contract = Get-Phase7BBoundedReplicaTransportContract
if ($Operation -eq 'Inspect') {
  [ordered]@{ classification = 'PHASE7B_WP2_BOUNDED_REPLICA_RECEIVER_READY_INERT'; pass = $true; transportClassification = $contract.transportClassification; persistentAccountRequired = $false; persistentShareRequired = $false; persistentFirewallRuleRequired = $false; mutationPerformed = $false; automaticRetryAllowed = $false } | ConvertTo-Json -Depth 4
  exit 0
}
function Remove-Phase7BInvocationCreatedEmptyAttemptRoot {
  [CmdletBinding()] param(
    [Parameter(Mandatory = $true)][string]$LiteralPath,
    [Parameter(Mandatory = $true)][string]$ReplicaParentRoot,
    [Parameter(Mandatory = $true)][string]$AttemptId,
    [Parameter(Mandatory = $true)][bool]$CreatedByInvocation
  )
  $result = [ordered]@{ attempted = $false; removed = $false; blockedByContent = $false }
  if (-not $CreatedByInvocation) { return [pscustomobject]$result }
  $result.attempted = $true
  $expected = [IO.Path]::GetFullPath((Join-Path $ReplicaParentRoot $AttemptId)).TrimEnd('\')
  $observed = [IO.Path]::GetFullPath($LiteralPath).TrimEnd('\')
  if (-not $observed.Equals($expected, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'PHASE7B_WP2_BOUNDED_REPLICA_EMPTY_ROOT_IDENTITY_FAIL'
  }
  if (-not (Test-Path -LiteralPath $observed)) { return [pscustomobject]$result }
  if (-not (Test-Path -LiteralPath $observed -PathType Container)) {
    throw 'PHASE7B_WP2_BOUNDED_REPLICA_EMPTY_ROOT_TYPE_FAIL'
  }
  if (@(Get-ChildItem -LiteralPath $observed -Force -ErrorAction Stop).Count -ne 0) {
    $result.blockedByContent = $true
    return [pscustomobject]$result
  }
  Remove-Item -LiteralPath $observed -ErrorAction Stop
  if (Test-Path -LiteralPath $observed) { throw 'PHASE7B_WP2_BOUNDED_REPLICA_EMPTY_ROOT_REMOVE_FAIL' }
  $result.removed = $true
  [pscustomobject]$result
}

$mutationStarted = $false; $shareCreated = $false; $firewallCreated = $false
$rootCreatedByInvocation = $false
$emptyRootCleanup = [pscustomobject]@{ attempted = $false; removed = $false; blockedByContent = $false }
$stage = 'validate-input'
try {
  if ($AttemptId -notmatch '^phase7b-wp2-[0-9a-f]{32}$' -or $ExpectedPacketFileName -ne "$AttemptId.zip.age" -or
      $RequiredCapacityBytes -le 0 -or $AuthorizationAcknowledgement -ne 'WP2B_CAPTURE_EPHEMERAL_REPLICA_OPEN_EXACTLY_ONCE') { throw 'PHASE7B_WP2_BOUNDED_REPLICA_ARGUMENT_OR_AUTHORIZATION_FAIL' }
  $primary = [ipaddress]::None
  if (-not [ipaddress]::TryParse($PrimaryHostIpv4, [ref]$primary) -or $primary.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork) { throw 'PHASE7B_WP2_BOUNDED_REPLICA_PRIMARY_IPV4_INVALID' }
  $stage = 'validate-laptop-storage'
  $products = @(Get-CimInstance Win32_ComputerSystemProduct -ErrorAction Stop)
  if ($products.Count -ne 1) { throw 'PHASE7B_WP2_BOUNDED_REPLICA_PRODUCT_CARDINALITY_FAIL' }
  $product = $products[0]
  $machineGuid = [string](Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Cryptography' -Name MachineGuid).MachineGuid
  $hostSha = Get-Phase7BBoundedReplicaHostIdentitySha256 -ComputerName $contract.acceptedComputerName `
    -Uuid ([string]$product.UUID) -MachineGuid $machineGuid
  $volumes = @(Get-Volume -DriveLetter D -ErrorAction Stop)
  $partitions = @(Get-Partition -DriveLetter D -ErrorAction Stop); $disks = @($partitions | Get-Disk -ErrorAction Stop)
  if ($volumes.Count -ne 1 -or $partitions.Count -ne 1 -or $disks.Count -ne 1) { throw 'PHASE7B_WP2_BOUNDED_REPLICA_DISK_CARDINALITY_FAIL' }
  $volume = $volumes[0]
  $disk = $disks[0]
  $diskSha = Get-Phase7BBoundedReplicaDiskIdentitySha256 -ComputerName $contract.acceptedComputerName `
    -DiskNumber ([int]$disk.Number) -UniqueId ([string]$disk.UniqueId) -SerialNumber ([string]$disk.SerialNumber) `
    -FriendlyName ([string]$disk.FriendlyName) -DiskSizeBytes ([int64]$disk.Size) -BusType ([string]$disk.BusType)
  $evidence = [pscustomobject]@{ computerName = $contract.acceptedComputerName; hostIdentitySha256 = $hostSha; diskIdentitySha256 = $diskSha; driveRoot = 'D:\'; fileSystem = [string]$volume.FileSystemType; diskNumber = [int]$disk.Number; busType = [string]$disk.BusType; physicallyIndependent = $true; freeBytes = [int64]$volume.SizeRemaining; persistentAccountCreated = $false; persistentShareRetained = $false; persistentFirewallRuleRetained = $false; persistentMappingRetained = $false; credentialsPersisted = $false; rawProductionFilesAccepted = $false }
  if (-not (Test-Phase7BBoundedReplicaDestinationEvidence -Evidence $evidence -RequiredBytes $RequiredCapacityBytes).pass) { throw 'PHASE7B_WP2_BOUNDED_REPLICA_DESTINATION_FAIL' }
  $stage = 'create-ephemeral-receiver'
  $root = "D:\Phase7B\wp2-replica\$AttemptId"; $shareName = "P7B$($AttemptId.Substring($AttemptId.Length - 8))`$"; $ruleName = "Phase7B-$($AttemptId.Substring($AttemptId.Length - 8))-ephemeral-smb"
  if ((Test-Path -LiteralPath $root) -or @(Get-SmbShare -Name $shareName -ErrorAction SilentlyContinue).Count -gt 0 -or @(Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue).Count -gt 0) { throw 'PHASE7B_WP2_BOUNDED_REPLICA_PRIOR_OR_PARTIAL_STATE_REJECTED' }
  New-Item -ItemType Directory -Path $root -ErrorAction Stop | Out-Null
  $rootCreatedByInvocation = $true; $mutationStarted = $true
  $identity = "$env:COMPUTERNAME\$env:USERNAME"
  [void](New-SmbShare -Name $shareName -Path $root -ChangeAccess $identity -EncryptData $true -CachingMode None -FolderEnumerationMode AccessBased -ErrorAction Stop); $shareCreated = $true
  [void](New-NetFirewallRule -Name $ruleName -DisplayName $ruleName -Direction Inbound -Action Allow -Enabled True -Profile Private -Protocol TCP -LocalPort 445 -RemoteAddress $PrimaryHostIpv4 -ErrorAction Stop); $firewallCreated = $true
  [ordered]@{ classification = 'PHASE7B_WP2_BOUNDED_REPLICA_EPHEMERAL_RECEIVER_OPEN'; pass = $true; attemptId = $AttemptId; computerName = $contract.acceptedComputerName; hostIdentitySha256 = $hostSha; diskIdentitySha256 = $diskSha; shareName = $shareName; uncReplicaRoot = "\\$($contract.acceptedComputerName)\$shareName"; replicaPathModel = $contract.replicaPathModel; packetFileName = $ExpectedPacketFileName; exactPacketBytesKnown = $false; requiredCapacityBytes = $RequiredCapacityBytes; existingAccountUsed = $true; credentialsPersisted = $false; teardownRequired = $true; automaticRetryAllowed = $false } | ConvertTo-Json -Depth 4
} catch {
  if ($firewallCreated) { Remove-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue }
  if ($shareCreated) { Remove-SmbShare -Name $shareName -Force -Confirm:$false -ErrorAction SilentlyContinue }
  $originalCode = if ($_.Exception.Message -match '^PHASE7B_') { $_.Exception.Message } else { 'PHASE7B_WP2_BOUNDED_REPLICA_RECEIVER_EXCEPTION' }
  try {
    if ($rootCreatedByInvocation) {
      $emptyRootCleanup = Remove-Phase7BInvocationCreatedEmptyAttemptRoot -LiteralPath $root `
        -ReplicaParentRoot 'D:\Phase7B\wp2-replica' -AttemptId $AttemptId -CreatedByInvocation $true
    }
  } catch {
    $emptyRootCleanup = [pscustomobject]@{ attempted = $true; removed = $false; blockedByContent = $true }
    $originalCode = 'PHASE7B_WP2_BOUNDED_REPLICA_EMPTY_ROOT_CLEANUP_FAIL'
  }
  [ordered]@{ classification = 'PHASE7B_WP2_BOUNDED_REPLICA_RECEIVER_FAIL'; pass = $false; safeStage = $stage; safeErrorCode = $originalCode; mutationStarted = $mutationStarted; cleanupAttempted = [bool]$emptyRootCleanup.attempted; invocationCreatedEmptyRootRemoved = [bool]$emptyRootCleanup.removed; cleanupBlockedByContent = [bool]$emptyRootCleanup.blockedByContent; automaticRetryAllowed = $false } | ConvertTo-Json -Depth 4
  exit 1
}
