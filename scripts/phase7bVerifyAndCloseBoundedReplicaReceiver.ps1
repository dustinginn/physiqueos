[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$AttemptId,
  [Parameter(Mandatory = $true)][string]$ExpectedPacketSha256,
  [Parameter(Mandatory = $true)][int64]$ExpectedPacketBytes,
  [Parameter(Mandatory = $true)][string]$EvidenceNonce,
  [Parameter(Mandatory = $true)][string]$EvidenceOutputPath,
  [Parameter(Mandatory = $true)][string]$AuthorizationAcknowledgement
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bBoundedReplicaTransport.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bIsolatedGuestContract.psm1') -Force
$contract = Get-Phase7BBoundedReplicaTransportContract
$stage = 'validate-input'; $teardownAttempted = $false
try {
  if ($AttemptId -notmatch '^phase7b-wp2-[0-9a-f]{32}$' -or $ExpectedPacketSha256 -notmatch '^[0-9a-f]{64}$' -or $ExpectedPacketBytes -le 0 -or
      $EvidenceNonce -notmatch '^[0-9a-f]{32}$' -or
      $AuthorizationAcknowledgement -ne 'WP2B_CAPTURE_VERIFY_REPLICA_AND_TEARDOWN_EXACTLY_ONCE') { throw 'PHASE7B_WP2_BOUNDED_REPLICA_ARGUMENT_OR_AUTHORIZATION_FAIL' }
  $root = "D:\Phase7B\wp2-replica\$AttemptId"; $shareName = "P7B$($AttemptId.Substring($AttemptId.Length - 8))`$"; $ruleName = "Phase7B-$($AttemptId.Substring($AttemptId.Length - 8))-ephemeral-smb"
  $packetPath = Join-Path $root "$AttemptId.zip.age"
  $expectedEvidencePath = Join-Path $root "$AttemptId-replica-receipt-$EvidenceNonce.json"
  if (-not ([IO.Path]::GetFullPath($EvidenceOutputPath)).Equals([IO.Path]::GetFullPath($expectedEvidencePath), [StringComparison]::OrdinalIgnoreCase) -or
      (Test-Path -LiteralPath $EvidenceOutputPath)) { throw 'PHASE7B_WP2_BOUNDED_REPLICA_EVIDENCE_PATH_REJECTED' }
  $stage = 'independent-local-readback'
  $files = @(Get-ChildItem -LiteralPath $root -File -Force -ErrorAction Stop)
  if (-not (Test-Phase7BBoundedReplicaFileSet -FileNames @($files.Name) -ExpectedPacketFileName "$AttemptId.zip.age").pass) { throw 'PHASE7B_WP2_BOUNDED_REPLICA_FILE_CARDINALITY_FAIL' }
  $packet = Test-Phase7BBoundedEncryptedReplicaSource -LiteralPath $packetPath -ExpectedSha256 $ExpectedPacketSha256 -ExpectedBytes $ExpectedPacketBytes
  if (-not $packet.pass) { throw $packet.classification }
  $products = @(Get-CimInstance Win32_ComputerSystemProduct -ErrorAction Stop)
  if ($products.Count -ne 1) { throw 'PHASE7B_WP2_BOUNDED_REPLICA_PRODUCT_CARDINALITY_FAIL' }
  $product = $products[0]
  $machineGuid = [string](Get-ItemProperty -LiteralPath 'HKLM:\SOFTWARE\Microsoft\Cryptography' -Name MachineGuid).MachineGuid
  $hostSha = Get-Phase7BBoundedReplicaHostIdentitySha256 -ComputerName $contract.acceptedComputerName `
    -Uuid ([string]$product.UUID) -MachineGuid $machineGuid
  $volumes = @(Get-Volume -DriveLetter D -ErrorAction Stop); $partitions = @(Get-Partition -DriveLetter D -ErrorAction Stop); $disks = @($partitions | Get-Disk -ErrorAction Stop)
  if ($volumes.Count -ne 1 -or $partitions.Count -ne 1 -or $disks.Count -ne 1) { throw 'PHASE7B_WP2_BOUNDED_REPLICA_DISK_CARDINALITY_FAIL' }
  $volume = $volumes[0]
  $disk = $disks[0]
  $diskSha = Get-Phase7BBoundedReplicaDiskIdentitySha256 -ComputerName $contract.acceptedComputerName `
    -DiskNumber ([int]$disk.Number) -UniqueId ([string]$disk.UniqueId) -SerialNumber ([string]$disk.SerialNumber) `
    -FriendlyName ([string]$disk.FriendlyName) -DiskSizeBytes ([int64]$disk.Size) -BusType ([string]$disk.BusType)
  $stage = 'mandatory-session-teardown'; $teardownAttempted = $true
  Remove-SmbShare -Name $shareName -Force -Confirm:$false -ErrorAction Stop
  Remove-NetFirewallRule -Name $ruleName -ErrorAction Stop
  if (@(Get-SmbShare -Name $shareName -ErrorAction SilentlyContinue).Count -ne 0 -or @(Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue).Count -ne 0) { throw 'PHASE7B_WP2_BOUNDED_REPLICA_TEARDOWN_FAIL' }
  $receipt = [pscustomobject][ordered]@{ schemaVersion = 1; classification = 'PHASE7B_WP2_BOUNDED_REPLICA_INDEPENDENT_READBACK_PASS'; pass = $true; attemptId = $AttemptId; evidenceNonce = $EvidenceNonce; observedAt = [DateTime]::UtcNow.ToString('o'); evidenceFileName = Split-Path -Leaf $EvidenceOutputPath; packetFileName = "$AttemptId.zip.age"; packetSha256 = $packet.packetSha256; packetBytes = $packet.packetBytes; destinationBytesReread = $true; encryptedPacketOnly = $true; computerName = $contract.acceptedComputerName; hostIdentitySha256 = $hostSha; diskIdentitySha256 = $diskSha; driveRoot = 'D:\'; fileSystem = [string]$volume.FileSystemType; diskNumber = [int]$disk.Number; busType = [string]$disk.BusType; physicallyIndependent = $true; freeBytes = [int64]$volume.SizeRemaining; persistentAccountCreated = $false; persistentShareRetained = $false; persistentFirewallRuleRetained = $false; persistentMappingRetained = $false; credentialsPersisted = $false; rawProductionFilesAccepted = $false; sessionTornDown = $true; reportPersisted = $true; automaticRetryAllowed = $false }
  if (-not (Test-Phase7BBoundedReplicaReceipt -Receipt $receipt -ExpectedAttemptId $AttemptId -ExpectedPacketSha256 $ExpectedPacketSha256 -ExpectedPacketBytes $ExpectedPacketBytes).pass) { throw 'PHASE7B_WP2_BOUNDED_REPLICA_RECEIPT_SELF_CHECK_FAIL' }
  $persisted = Write-Phase7BSafeEvidenceFile -LiteralPath $EvidenceOutputPath -Evidence $receipt
  $transportBytes = (New-Object Text.UTF8Encoding($false)).GetBytes((ConvertTo-Phase7BCanonicalJson -InputObject $receipt))
  [ordered]@{ classification = $receipt.classification; pass = $true; attemptId = $AttemptId; evidenceNonce = $EvidenceNonce; evidenceFileName = $persisted.fileName; evidenceSha256 = $persisted.sha256; evidenceTransportBase64 = [Convert]::ToBase64String($transportBytes); packetFileName = $receipt.packetFileName; packetSha256 = $receipt.packetSha256; packetBytes = $receipt.packetBytes; sessionTornDown = $true; reportPersisted = $true; automaticRetryAllowed = $false } | ConvertTo-Json -Depth 5
} catch {
  if ($AttemptId -match '^phase7b-wp2-[0-9a-f]{32}$') {
    $shareName = "P7B$($AttemptId.Substring($AttemptId.Length - 8))`$"
    $ruleName = "Phase7B-$($AttemptId.Substring($AttemptId.Length - 8))-ephemeral-smb"
    if (@(Get-SmbShare -Name $shareName -ErrorAction SilentlyContinue).Count -gt 0) { Remove-SmbShare -Name $shareName -Force -Confirm:$false -ErrorAction SilentlyContinue; $teardownAttempted = $true }
    if (@(Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue).Count -gt 0) { Remove-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue; $teardownAttempted = $true }
  }
  $safeCode = if ($_.Exception.Message -match '^PHASE7B_') { $_.Exception.Message } else { 'PHASE7B_WP2_BOUNDED_REPLICA_VERIFY_EXCEPTION' }
  [ordered]@{ classification = 'PHASE7B_WP2_BOUNDED_REPLICA_VERIFY_FAIL'; pass = $false; safeStage = $stage; safeErrorCode = $safeCode; teardownAttempted = $teardownAttempted; automaticRetryAllowed = $false } | ConvertTo-Json -Depth 4
  exit 1
}
