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
$mutationStarted = $false; $shareCreated = $false; $firewallCreated = $false; $stage = 'validate-input'
try {
  if ($AttemptId -notmatch '^phase7b-wp2-[0-9a-f]{32}$' -or $ExpectedPacketFileName -ne "$AttemptId.zip.age" -or
      $RequiredCapacityBytes -le 0 -or $AuthorizationAcknowledgement -ne 'WP2B_CAPTURE_EPHEMERAL_REPLICA_OPEN_EXACTLY_ONCE') { throw 'PHASE7B_WP2_BOUNDED_REPLICA_ARGUMENT_OR_AUTHORIZATION_FAIL' }
  $primary = [ipaddress]::None
  if (-not [ipaddress]::TryParse($PrimaryHostIpv4, [ref]$primary) -or $primary.AddressFamily -ne [Net.Sockets.AddressFamily]::InterNetwork) { throw 'PHASE7B_WP2_BOUNDED_REPLICA_PRIMARY_IPV4_INVALID' }
  $machineIdentity = Test-Phase7BBoundedReplicaComputerIdentity -ObservedComputerName ([Environment]::MachineName) -ExpectedComputerName $contract.acceptedComputerName
  $environmentIdentity = Test-Phase7BBoundedReplicaComputerIdentity -ObservedComputerName $env:COMPUTERNAME -ExpectedComputerName $contract.acceptedComputerName
  $computerSystem = Get-CimInstance Win32_ComputerSystem -ErrorAction Stop
  $cimIdentity = Test-Phase7BBoundedReplicaComputerIdentity -ObservedComputerName $computerSystem.Name -ExpectedComputerName $contract.acceptedComputerName
  if (-not $machineIdentity.pass -or -not $environmentIdentity.pass -or -not $cimIdentity.pass) { throw 'PHASE7B_WP2_BOUNDED_REPLICA_HOST_IDENTITY_FAIL' }
  $stage = 'validate-laptop-storage'
  $product = Get-CimInstance Win32_ComputerSystemProduct
  $machineGuid = [string](Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Cryptography' -Name MachineGuid).MachineGuid
  $hostSha = Get-Phase7BSha256 -Text ($contract.acceptedComputerName.ToLowerInvariant() + '|' + ([string]$product.UUID).ToLowerInvariant() + '|' + $machineGuid.ToLowerInvariant())
  $volume = Get-Volume -DriveLetter D -ErrorAction Stop
  $partitions = @(Get-Partition -DriveLetter D -ErrorAction Stop); $disks = @($partitions | Get-Disk -ErrorAction Stop)
  if ($partitions.Count -ne 1 -or $disks.Count -ne 1) { throw 'PHASE7B_WP2_BOUNDED_REPLICA_DISK_CARDINALITY_FAIL' }
  $disk = $disks[0]
  $diskSha = Get-Phase7BSha256 -Text ($contract.acceptedComputerName.ToLowerInvariant() + '|' + [string]$disk.Number + '|' + ([string]$disk.UniqueId).ToLowerInvariant() + '|' + ([string]$disk.SerialNumber).ToLowerInvariant() + '|' + ([string]$disk.FriendlyName).ToLowerInvariant() + '|' + [string]$disk.Size + '|' + ([string]$disk.BusType).ToLowerInvariant())
  $evidence = [pscustomobject]@{ computerName = $machineIdentity.canonicalComputerName; hostIdentitySha256 = $hostSha; diskIdentitySha256 = $diskSha; driveRoot = 'D:\'; fileSystem = [string]$volume.FileSystemType; diskNumber = [int]$disk.Number; busType = [string]$disk.BusType; physicallyIndependent = $true; freeBytes = [int64]$volume.SizeRemaining; persistentAccountCreated = $false; persistentShareRetained = $false; persistentFirewallRuleRetained = $false; persistentMappingRetained = $false; credentialsPersisted = $false; rawProductionFilesAccepted = $false }
  if (-not (Test-Phase7BBoundedReplicaDestinationEvidence -Evidence $evidence -RequiredBytes $RequiredCapacityBytes).pass) { throw 'PHASE7B_WP2_BOUNDED_REPLICA_DESTINATION_FAIL' }
  $stage = 'create-ephemeral-receiver'
  $root = "D:\Phase7B\wp2-replica\$AttemptId"; $shareName = "P7B$($AttemptId.Substring($AttemptId.Length - 8))`$"; $ruleName = "Phase7B-$($AttemptId.Substring($AttemptId.Length - 8))-ephemeral-smb"
  if ((Test-Path -LiteralPath $root) -or @(Get-SmbShare -Name $shareName -ErrorAction SilentlyContinue).Count -gt 0 -or @(Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue).Count -gt 0) { throw 'PHASE7B_WP2_BOUNDED_REPLICA_PRIOR_OR_PARTIAL_STATE_REJECTED' }
  New-Item -ItemType Directory -Path $root -Force -ErrorAction Stop | Out-Null; $mutationStarted = $true
  $identity = "$env:COMPUTERNAME\$env:USERNAME"
  [void](New-SmbShare -Name $shareName -Path $root -ChangeAccess $identity -EncryptData $true -CachingMode None -FolderEnumerationMode AccessBased -ErrorAction Stop); $shareCreated = $true
  [void](New-NetFirewallRule -Name $ruleName -DisplayName $ruleName -Direction Inbound -Action Allow -Enabled True -Profile Private -Protocol TCP -LocalPort 445 -RemoteAddress $PrimaryHostIpv4 -ErrorAction Stop); $firewallCreated = $true
  [ordered]@{ classification = 'PHASE7B_WP2_BOUNDED_REPLICA_EPHEMERAL_RECEIVER_OPEN'; pass = $true; attemptId = $AttemptId; computerName = $contract.acceptedComputerName; hostIdentitySha256 = $hostSha; diskIdentitySha256 = $diskSha; shareName = $shareName; uncReplicaRoot = "\\$($contract.acceptedComputerName)\$shareName"; replicaPathModel = $contract.replicaPathModel; packetFileName = $ExpectedPacketFileName; exactPacketBytesKnown = $false; requiredCapacityBytes = $RequiredCapacityBytes; existingAccountUsed = $true; credentialsPersisted = $false; teardownRequired = $true; automaticRetryAllowed = $false } | ConvertTo-Json -Depth 4
} catch {
  if ($firewallCreated) { Remove-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue }
  if ($shareCreated) { Remove-SmbShare -Name $shareName -Force -Confirm:$false -ErrorAction SilentlyContinue }
  $safeCode = if ($_.Exception.Message -match '^PHASE7B_') { $_.Exception.Message } else { 'PHASE7B_WP2_BOUNDED_REPLICA_RECEIVER_EXCEPTION' }
  [ordered]@{ classification = 'PHASE7B_WP2_BOUNDED_REPLICA_RECEIVER_FAIL'; pass = $false; safeStage = $stage; safeErrorCode = $safeCode; mutationStarted = $mutationStarted; cleanupAttempted = $mutationStarted; automaticRetryAllowed = $false } | ConvertTo-Json -Depth 4
  exit 1
}
