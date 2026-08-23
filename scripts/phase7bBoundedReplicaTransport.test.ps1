$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bBoundedReplicaTransport.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bIsolatedGuestContract.psm1') -Force
$root = Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..\.tmp')).Path "phase7b-bounded-replica-test-$([guid]::NewGuid().ToString('N'))"
$script:assertions = 0
function Assert-True([bool]$Condition, [string]$Message) { if (-not $Condition) { throw "ASSERTION_FAILED:$Message" }; $script:assertions++ }
function Assert-Throws([scriptblock]$Action, [string]$Pattern, [string]$Message) { $threw = $false; try { & $Action } catch { $threw = $_.Exception.Message -match $Pattern }; Assert-True $threw $Message }
function New-Evidence {
  $contract = Get-Phase7BBoundedReplicaTransportContract
  [pscustomobject][ordered]@{ computerName = $contract.acceptedComputerName; hostIdentitySha256 = $contract.acceptedHostIdentitySha256; diskIdentitySha256 = $contract.acceptedDiskIdentitySha256; driveRoot = 'D:\'; fileSystem = 'NTFS'; diskNumber = 0; busType = 'SATA'; physicallyIndependent = $true; freeBytes = [int64]10GB; persistentAccountCreated = $false; persistentShareRetained = $false; persistentFirewallRuleRetained = $false; persistentMappingRetained = $false; credentialsPersisted = $false; rawProductionFilesAccepted = $false }
}
try {
  New-Item -ItemType Directory -Path $root | Out-Null
  $packet = Join-Path $root 'phase7b-wp2-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.zip.age'
  [IO.File]::WriteAllBytes($packet, [Text.Encoding]::ASCII.GetBytes("age-encryption.org/v1`nsynthetic-ciphertext"))
  $sha = Get-Phase7BSha256 -LiteralPath $packet; $bytes = [int64](Get-Item $packet).Length
  $source = Test-Phase7BBoundedEncryptedReplicaSource -LiteralPath $packet -ExpectedSha256 $sha -ExpectedBytes $bytes
  Assert-True ($source.pass -and $source.encryptedPacketOnly) 'exact encrypted source accepted'
  Assert-True (-not (Test-Phase7BBoundedEncryptedReplicaSource -LiteralPath $packet -ExpectedSha256 ('f' * 64) -ExpectedBytes $bytes).pass) 'wrong source hash rejected'
  Assert-True (-not (Test-Phase7BBoundedEncryptedReplicaSource -LiteralPath $packet -ExpectedSha256 $sha -ExpectedBytes ($bytes + 1)).pass) 'wrong source size rejected'
  $plain = Join-Path $root 'plain.zip.age'; 'raw production fixture' | Set-Content -LiteralPath $plain -Encoding ASCII
  Assert-True (-not (Test-Phase7BBoundedEncryptedReplicaSource -LiteralPath $plain -ExpectedSha256 (Get-Phase7BSha256 -LiteralPath $plain) -ExpectedBytes (Get-Item $plain).Length).pass) 'plaintext packet rejected'
  $raw = Join-Path $root 'runtime-store.json'; '{}' | Set-Content $raw
  Assert-True (-not (Test-Phase7BBoundedEncryptedReplicaSource -LiteralPath $raw -ExpectedSha256 (Get-Phase7BSha256 -LiteralPath $raw) -ExpectedBytes (Get-Item $raw).Length).pass) 'raw production file transport rejected'
  Assert-True (Test-Phase7BBoundedReplicaFileSet -FileNames @('phase7b-wp2-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.zip.age') -ExpectedPacketFileName 'phase7b-wp2-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.zip.age').pass 'one exact encrypted replica file accepted'
  Assert-True (-not (Test-Phase7BBoundedReplicaFileSet -FileNames @() -ExpectedPacketFileName 'x.age').pass) 'zero replica files rejected'
  Assert-True (-not (Test-Phase7BBoundedReplicaFileSet -FileNames $null -ExpectedPacketFileName 'x.age').pass) 'null replica file set rejected'
  Assert-True (-not (Test-Phase7BBoundedReplicaFileSet -FileNames @('x.age','y.age') -ExpectedPacketFileName 'x.age').pass) 'many replica files rejected'

  $evidence = New-Evidence
  Assert-True (Test-Phase7BBoundedReplicaDestinationEvidence -Evidence $evidence -RequiredBytes $bytes).pass 'accepted host and physical disk evidence'
  foreach ($case in @(
      @{ property = 'computerName'; value = 'WRONG' }, @{ property = 'hostIdentitySha256'; value = '0' * 64 },
      @{ property = 'diskIdentitySha256'; value = '0' * 64 }, @{ property = 'physicallyIndependent'; value = $false },
      @{ property = 'freeBytes'; value = 1 }, @{ property = 'persistentAccountCreated'; value = $true },
      @{ property = 'persistentShareRetained'; value = $true }, @{ property = 'persistentFirewallRuleRetained'; value = $true },
      @{ property = 'persistentMappingRetained'; value = $true }, @{ property = 'credentialsPersisted'; value = $true },
      @{ property = 'rawProductionFilesAccepted'; value = $true }
    )) {
    $bad = New-Evidence; $bad.($case.property) = $case.value
    Assert-True (-not (Test-Phase7BBoundedReplicaDestinationEvidence -Evidence $bad -RequiredBytes $bytes).pass) "destination rejects $($case.property)"
  }

  $replica = Join-Path $root 'replica.age'
  $copy = Copy-Phase7BBoundedEncryptedReplica -SourcePath $packet -DestinationPath $replica -ExpectedSha256 $sha -ExpectedBytes $bytes
  Assert-True ($copy.pass -and $copy.packetSha256 -eq $sha -and $copy.writeThrough) 'bounded synthetic copy and readback pass'
  Assert-Throws { Copy-Phase7BBoundedEncryptedReplica -SourcePath $packet -DestinationPath $replica -ExpectedSha256 $sha -ExpectedBytes $bytes } 'DESTINATION_EXISTS' 'destination overwrite rejected'
  $partial = Join-Path $root 'partial.age'; [IO.File]::WriteAllBytes($partial, [Text.Encoding]::ASCII.GetBytes('age-encryption.org/v1'))
  Assert-True (-not (Test-Phase7BBoundedEncryptedReplicaSource -LiteralPath $partial -ExpectedSha256 $sha -ExpectedBytes $bytes).pass) 'partial copy rejected'
  $mismatch = Join-Path $root 'mismatch.age'; Copy-Item $packet $mismatch; [IO.File]::AppendAllText($mismatch, 'x')
  Assert-True (-not (Test-Phase7BBoundedEncryptedReplicaSource -LiteralPath $mismatch -ExpectedSha256 $sha -ExpectedBytes $bytes).pass) 'destination size and hash mismatch rejected'
  Assert-Throws { Test-Phase7BBoundedEncryptedReplicaSource -LiteralPath (Join-Path $root 'missing.age') -ExpectedSha256 $sha -ExpectedBytes $bytes } 'PACKET_NOT_FOUND' 'readback failure rejects'

  $attempt = 'phase7b-wp2-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  $receipt = New-Evidence
  foreach ($property in ([ordered]@{ classification = 'PHASE7B_WP2_BOUNDED_REPLICA_INDEPENDENT_READBACK_PASS'; pass = $true; attemptId = $attempt; packetSha256 = $sha; packetBytes = $bytes; destinationBytesReread = $true; sessionTornDown = $true; encryptedPacketOnly = $true; reportPersisted = $false; automaticRetryAllowed = $false }).GetEnumerator()) { Add-Member -InputObject $receipt -NotePropertyName $property.Key -NotePropertyValue $property.Value }
  Assert-True (Test-Phase7BBoundedReplicaReceipt -Receipt $receipt -ExpectedAttemptId $attempt -ExpectedPacketSha256 $sha -ExpectedPacketBytes $bytes).pass 'independent receipt and teardown accepted'
  foreach ($property in @('destinationBytesReread','sessionTornDown','encryptedPacketOnly')) { $bad = $receipt.PSObject.Copy(); $bad.$property = $false; Assert-True (-not (Test-Phase7BBoundedReplicaReceipt -Receipt $bad -ExpectedAttemptId $attempt -ExpectedPacketSha256 $sha -ExpectedPacketBytes $bytes).pass) "receipt rejects $property false" }
  $wrongReceipt = $receipt.PSObject.Copy(); $wrongReceipt.packetSha256 = 'f' * 64
  Assert-True (-not (Test-Phase7BBoundedReplicaReceipt -Receipt $wrongReceipt -ExpectedAttemptId $attempt -ExpectedPacketSha256 $sha -ExpectedPacketBytes $bytes).pass) 'independent readback hash mismatch rejected'
  $primary = [pscustomobject]@{ classification = 'PHASE7B_WP2_PRIMARY_REPLICA_SESSION_TEARDOWN_PASS'; pass = $true; attemptId = $attempt; serverName = 'LAPTOP-4G5U0U2R'; shareName = 'P7Baaaaaaaa$'; matchingPsDriveCount = 0; matchingSmbMappingCount = 0; savedCredentialTargetCount = 0; mappingPersistent = $false; credentialsPersisted = $false; sessionTornDown = $true; mutationPerformed = $false; reportPersisted = $false; automaticRetryAllowed = $false }
  Assert-True (Test-Phase7BPrimaryReplicaSessionTeardownEvidence -Evidence $primary -ExpectedAttemptId $attempt -ExpectedServerName 'LAPTOP-4G5U0U2R' -ExpectedShareName 'P7Baaaaaaaa$').pass 'primary mapping and credential teardown accepted'
  foreach ($property in @('matchingPsDriveCount','matchingSmbMappingCount','savedCredentialTargetCount')) { $bad = $primary.PSObject.Copy(); $bad.$property = 1; Assert-True (-not (Test-Phase7BPrimaryReplicaSessionTeardownEvidence -Evidence $bad -ExpectedAttemptId $attempt -ExpectedServerName 'LAPTOP-4G5U0U2R' -ExpectedShareName 'P7Baaaaaaaa$').pass) "primary teardown rejects $property residue" }

  $paths = @('phase7bBoundedReplicaTransport.psm1','phase7bOpenBoundedReplicaReceiver.ps1','phase7bVerifyAndCloseBoundedReplicaReceiver.ps1','phase7bVerifyPrimaryReplicaSessionClosed.ps1','phase7bFinalizeBoundedReplicaDescriptor.ps1','phase7bBoundedReplicaTransport.test.ps1') | ForEach-Object { Join-Path $PSScriptRoot $_ }
  foreach ($path in $paths) { $tokens = $null; $errors = $null; [void][Management.Automation.Language.Parser]::ParseFile($path, [ref]$tokens, [ref]$errors); Assert-True (@($errors).Count -eq 0) "PowerShell 5.1 AST:$(Split-Path -Leaf $path)" }
  $operational = @($paths | Where-Object { $_ -notmatch '\.test\.ps1$' } | ForEach-Object { Get-Content -Raw $_ }) -join "`n"
  Assert-True (-not ($operational -match '(?i)cmdkey(?:\.exe)?["'']?\s+(?:/add|/delete)|savecredentials|New-LocalUser|ConvertFrom-SecureString|Export-Clixml')) 'no persistent credential or dedicated account path'
  Assert-True (-not ($operational -match '(?i)Copy-Item.+runtime-store|Copy-Item.+canonical')) 'no raw production copy path'
  Assert-True ($operational.Contains('automaticRetryAllowed = $false')) 'automatic retry disabled'
  Assert-True ($operational.Contains('Remove-SmbShare') -and $operational.Contains('Remove-NetFirewallRule')) 'ephemeral session teardown source-owned'
  [ordered]@{ classification = 'PHASE7B_WP2_BOUNDED_REPLICA_TRANSPORT_TESTS_PASS'; pass = $true; assertions = $script:assertions } | ConvertTo-Json -Compress
} finally { if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force } }
