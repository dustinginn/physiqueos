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
  $authoritativeHostSha = 'ddf354efb3688588818f48ea7e46720eb7b716e7006ce02b9386786bc6cdc8e1'
  $authoritativeDiskSha = '3b660772000275e24aa13ba78712c518a898e701ebd3a443cee31776877ac948'
  $historicalHostSha = 'ea6696e8a0fc4d9242544568d62cd979fd57bd2478fac4f40755b3546776ac3c'
  $historicalDiskSha = '336d31be1f1e6dd4bde254fae94ffebf2b23829520a26c2f5d9bc5deda169896'
  $invalidTranscribedHostSha = 'df354efb3688588818f48ea7e46720eb7b716e7006ce02b9386786bc6cdc8e1'
  $contract = Get-Phase7BBoundedReplicaTransportContract
  Assert-True ($contract.acceptedHostIdentitySha256 -ceq $authoritativeHostSha -and
    $contract.acceptedDiskIdentitySha256 -ceq $authoritativeDiskSha) 'shared contract binds authoritative current identities'
  foreach ($validIdentity in @($contract.acceptedHostIdentitySha256, $contract.acceptedDiskIdentitySha256)) {
    Assert-True (Test-Phase7BSha256IdentityShape -Value $validIdentity) 'active shared identity is exact lowercase 64-hex'
  }
  foreach ($invalidIdentity in @($null, '', ('a' * 63), ('a' * 65), ('A' * 64), (('a' * 63) + 'g'))) {
    Assert-True (-not (Test-Phase7BSha256IdentityShape -Value $invalidIdentity)) 'malformed shared identity rejected'
  }
  $fixtureHost = Get-Phase7BBoundedReplicaHostIdentitySha256 -ComputerName 'LAPTOP-4G5U0U2R' `
    -Uuid '01234567-89AB-CDEF-0123-456789ABCDEF' -MachineGuid 'FEDCBA98-7654-3210-FEDC-BA9876543210'
  Assert-True ($fixtureHost -ceq 'ff570bf96b4cc2331dc8b27086b8b51928b2e79af3bef7decea29b5335ae224f') `
    'shared real host hash-producing path matches fixed V2 fixture digest'
  $fixtureDisk = Get-Phase7BBoundedReplicaDiskIdentitySha256 -ComputerName 'LAPTOP-4G5U0U2R' -DiskNumber 0 `
    -UniqueId 'UNIQUE-ID' -SerialNumber 'SERIAL-01' -FriendlyName 'Friendly Disk' `
    -DiskSizeBytes ([int64]1000204886016) -BusType 'SATA'
  Assert-True ($fixtureDisk -ceq 'a30f346e3f58de06dad4034b8eba9de3818a1464210539897740707c91eb6e28') `
    'shared real disk hash-producing path matches fixed V2 fixture digest'
  Assert-Throws { Get-Phase7BBoundedReplicaHostIdentitySha256 -ComputerName 'LAPTOP-4G5U0U2R' `
    -Uuid 'not-a-guid' -MachineGuid 'FEDCBA98-7654-3210-FEDC-BA9876543210' } 'HOST_COMPONENT_FORMAT_FAIL' `
    'malformed UUID fails shared host computation'
  $acceptedName = 'LAPTOP-4G5U0U2R'
  Assert-True ((ConvertTo-Phase7BCanonicalComputerName -Value $acceptedName) -ceq $acceptedName) 'accepted scalar computer name canonicalized'
  Assert-True ((ConvertTo-Phase7BCanonicalComputerName -Value 'laptop-4g5u0u2r') -ceq $acceptedName) 'computer name uses ordinal case-insensitive canonical identity'
  Assert-True ((ConvertTo-Phase7BCanonicalComputerName -Value (, $acceptedName)) -ceq $acceptedName) 'one-element string collection canonicalized'
  Assert-True (Test-Phase7BBoundedReplicaComputerIdentity -ObservedComputerName $acceptedName -ExpectedComputerName $acceptedName).pass 'current accepted laptop name passes canonical identity'
  Assert-True (Test-Phase7BBoundedReplicaComputerIdentity -ObservedComputerName 'laptop-4g5u0u2r' -ExpectedComputerName $acceptedName).pass 'case-only Windows hostname representation accepted'
  foreach ($invalidName in @(
      $null, '', ' ',
      ' LAPTOP-4G5U0U2R', 'LAPTOP-4G5U0U2R ', "LAPTOP-4G5U0U2R`0", "LAPTOP-4G5U0U2R`n", 'WRONG_HOST'
    )) {
    Assert-True (-not (Test-Phase7BBoundedReplicaComputerIdentity -ObservedComputerName $invalidName -ExpectedComputerName $acceptedName).pass) 'invalid, malformed, or wrong computer name rejected'
  }
  Assert-True (-not (Test-Phase7BBoundedReplicaComputerIdentity -ObservedComputerName @($acceptedName, $acceptedName) -ExpectedComputerName $acceptedName).pass) 'multi-value computer name identity fails closed'
  Assert-Throws { ConvertTo-Phase7BCanonicalComputerName -Value $null } 'SHAPE_INVALID' 'null computer name fails closed'
  Assert-Throws { ConvertTo-Phase7BCanonicalComputerName -Value @('A', 'B') } 'SHAPE_INVALID' 'multi-value computer name fails closed'
  Assert-Throws { ConvertTo-Phase7BCanonicalComputerName -Value ' LAPTOP-4G5U0U2R' } 'FORMAT_INVALID' 'leading whitespace fails closed'
  Assert-Throws { ConvertTo-Phase7BCanonicalComputerName -Value "LAPTOP-4G5U0U2R`0" } 'FORMAT_INVALID' 'embedded null fails closed'
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
      @{ property = 'hostIdentitySha256'; value = $historicalHostSha },
      @{ property = 'diskIdentitySha256'; value = $historicalDiskSha },
      @{ property = 'hostIdentitySha256'; value = $invalidTranscribedHostSha })) {
    $retired = New-Evidence; $retired.($case.property) = $case.value
    Assert-True (-not (Test-Phase7BBoundedReplicaDestinationEvidence -Evidence $retired -RequiredBytes $bytes).pass) `
      "retired or malformed identity fails active destination gate:$($case.property)"
  }
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
  New-PSDrive -Name P7BF -PSProvider FileSystem -Root $root | Out-Null
  try {
    $mappedIdentity = Get-Phase7BReplicaDirectoryIdentity -LiteralPath 'P7BF:\'
    Assert-True ($mappedIdentity.localPath -eq 'P7BF:\' -and $mappedIdentity.providerRoot -eq $root -and $mappedIdentity.providerRootSha256 -eq (Get-Phase7BSha256 -Text $root.ToLowerInvariant())) 'nonpersistent PSDrive resolves to exact provider attempt root'
  } finally { Remove-PSDrive -Name P7BF -Force }
  $pathsContract = Get-Phase7BBoundedReplicaAttemptRoot -AttemptId $attempt -ReplicaParentRoot 'D:\Phase7B\wp2-replica'
  Assert-True ($pathsContract.pathModel -eq 'EXACT_ATTEMPT_ROOT' -and $pathsContract.attemptRoot -eq "D:\Phase7B\wp2-replica\$attempt" -and
    $pathsContract.packetPath -eq "D:\Phase7B\wp2-replica\$attempt\$attempt.zip.age") 'canonical attempt root appends attempt exactly once'
  Assert-True ($pathsContract.packetPath -notmatch ([regex]::Escape("$attempt\$attempt\"))) 'duplicate nested attempt directory rejected by canonical path model'
  $receipt = New-Evidence
  foreach ($property in ([ordered]@{ classification = 'PHASE7B_WP2_BOUNDED_REPLICA_INDEPENDENT_READBACK_PASS'; pass = $true; attemptId = $attempt; evidenceNonce = ('a' * 32); evidenceFileName = "$attempt-replica-receipt-$('a' * 32).json"; observedAt = [DateTime]::UtcNow.ToString('o'); packetSha256 = $sha; packetBytes = $bytes; destinationBytesReread = $true; sessionTornDown = $true; encryptedPacketOnly = $true; reportPersisted = $true; automaticRetryAllowed = $false }).GetEnumerator()) { Add-Member -InputObject $receipt -NotePropertyName $property.Key -NotePropertyValue $property.Value }
  Assert-True (Test-Phase7BBoundedReplicaReceipt -Receipt $receipt -ExpectedAttemptId $attempt -ExpectedPacketSha256 $sha -ExpectedPacketBytes $bytes).pass 'independent receipt and teardown accepted'
  foreach ($property in @('destinationBytesReread','sessionTornDown','encryptedPacketOnly')) { $bad = $receipt.PSObject.Copy(); $bad.$property = $false; Assert-True (-not (Test-Phase7BBoundedReplicaReceipt -Receipt $bad -ExpectedAttemptId $attempt -ExpectedPacketSha256 $sha -ExpectedPacketBytes $bytes).pass) "receipt rejects $property false" }
  $wrongReceipt = $receipt.PSObject.Copy(); $wrongReceipt.packetSha256 = 'f' * 64
  Assert-True (-not (Test-Phase7BBoundedReplicaReceipt -Receipt $wrongReceipt -ExpectedAttemptId $attempt -ExpectedPacketSha256 $sha -ExpectedPacketBytes $bytes).pass) 'independent readback hash mismatch rejected'
  $wrongReceiptName = $receipt.PSObject.Copy(); $wrongReceiptName.evidenceFileName = 'wrong.json'
  Assert-True (-not (Test-Phase7BBoundedReplicaReceipt -Receipt $wrongReceiptName -ExpectedAttemptId $attempt -ExpectedPacketSha256 $sha -ExpectedPacketBytes $bytes).pass) 'receipt path identity mismatch rejected'
  $primary = [pscustomobject]@{ classification = 'PHASE7B_WP2_PRIMARY_REPLICA_SESSION_TEARDOWN_PASS'; pass = $true; attemptId = $attempt; evidenceNonce = ('b' * 32); evidenceFileName = "$attempt-primary-teardown-$('b' * 32).json"; observedAt = [DateTime]::UtcNow.ToString('o'); serverName = 'LAPTOP-4G5U0U2R'; shareName = 'P7Baaaaaaaa$'; matchingPsDriveCount = 0; matchingSmbMappingCount = 0; savedCredentialTargetCount = 0; mappingPersistent = $false; credentialsPersisted = $false; sessionTornDown = $true; mutationPerformed = $false; reportPersisted = $true; automaticRetryAllowed = $false }
  Assert-True (Test-Phase7BPrimaryReplicaSessionTeardownEvidence -Evidence $primary -ExpectedAttemptId $attempt -ExpectedServerName 'LAPTOP-4G5U0U2R' -ExpectedShareName 'P7Baaaaaaaa$').pass 'primary mapping and credential teardown accepted'
  foreach ($property in @('matchingPsDriveCount','matchingSmbMappingCount','savedCredentialTargetCount')) { $bad = $primary.PSObject.Copy(); $bad.$property = 1; Assert-True (-not (Test-Phase7BPrimaryReplicaSessionTeardownEvidence -Evidence $bad -ExpectedAttemptId $attempt -ExpectedServerName 'LAPTOP-4G5U0U2R' -ExpectedShareName 'P7Baaaaaaaa$').pass) "primary teardown rejects $property residue" }
  $wrongTeardownName = $primary.PSObject.Copy(); $wrongTeardownName.evidenceFileName = 'wrong.json'
  Assert-True (-not (Test-Phase7BPrimaryReplicaSessionTeardownEvidence -Evidence $wrongTeardownName -ExpectedAttemptId $attempt -ExpectedServerName 'LAPTOP-4G5U0U2R' -ExpectedShareName 'P7Baaaaaaaa$').pass) 'primary teardown path identity mismatch rejected'

  $paths = @('phase7bBoundedReplicaTransport.psm1','phase7bPreflightBoundedReplicaDestination.ps1','phase7bOpenBoundedReplicaReceiver.ps1','phase7bVerifyAndCloseBoundedReplicaReceiver.ps1','phase7bVerifyPrimaryReplicaSessionClosed.ps1','phase7bImportBoundedReplicaReceipt.ps1','phase7bFinalizeBoundedReplicaDescriptor.ps1','phase7bBoundedReplicaTransport.test.ps1') | ForEach-Object { Join-Path $PSScriptRoot $_ }
  foreach ($path in $paths) { $tokens = $null; $errors = $null; [void][Management.Automation.Language.Parser]::ParseFile($path, [ref]$tokens, [ref]$errors); Assert-True (@($errors).Count -eq 0) "PowerShell 5.1 AST:$(Split-Path -Leaf $path)" }
  $operational = @($paths | Where-Object { $_ -notmatch '\.test\.ps1$' } | ForEach-Object { Get-Content -Raw $_ }) -join "`n"
  Assert-True (-not ($operational -match '(?i)cmdkey(?:\.exe)?["'']?\s+(?:/add|/delete)|savecredentials|New-LocalUser|ConvertFrom-SecureString|Export-Clixml')) 'no persistent credential or dedicated account path'
  Assert-True (-not ($operational -match '(?i)Copy-Item.+runtime-store|Copy-Item.+canonical')) 'no raw production copy path'
  $preflightSource = Get-Content -Raw (Join-Path $PSScriptRoot 'phase7bPreflightBoundedReplicaDestination.ps1')
  Assert-True (-not ($preflightSource -match '(?i)New-Item|Remove-Item|Set-Item|Set-Content|Add-Content|Out-File|Export-Clixml|New-SmbShare|New-NetFirewallRule|Invoke-WebRequest|Invoke-RestMethod')) 'laptop preflight remains read-only'
  Assert-True ($preflightSource.Contains('contractObjectCount') -and $preflightSource.Contains('acceptedComputerNameValueType') -and
    $preflightSource.Contains('hardwareBoundIdentityAuthoritative') -and $preflightSource.Contains('standaloneRuntimeHostnameGateRequired = $false')) `
    'laptop preflight projects accepted hardware-bound identity model'
  Assert-True (-not ($operational.Contains('[Environment]::MachineName -ne $contract.acceptedComputerName')) -and
    -not $operational.Contains('allComputerNameSourcesCanonicalAndExact')) 'retired runtime hostname representation gate absent'
  Assert-True ($operational.Contains('Get-Phase7BBoundedReplicaHostIdentitySha256') -and
    $operational.Contains('Get-Phase7BBoundedReplicaDiskIdentitySha256')) 'Stage 2 and Stage 4 share exact V2 hash-producing helpers'
  Assert-True ($operational.Contains('automaticRetryAllowed = $false')) 'automatic retry disabled'
  Assert-True ($operational.Contains('Remove-SmbShare') -and $operational.Contains('Remove-NetFirewallRule')) 'ephemeral session teardown source-owned'
  Assert-True ($operational.Contains('RequiredCapacityBytes') -and -not (Get-Content -Raw (Join-Path $PSScriptRoot 'phase7bOpenBoundedReplicaReceiver.ps1')).Contains('ExpectedPacketBytes')) 'receiver capacity does not claim pre-encryption ciphertext size'

  $receiverPath = Join-Path $PSScriptRoot 'phase7bOpenBoundedReplicaReceiver.ps1'
  $receiverTokens = $null; $receiverErrors = $null
  $receiverAst = [Management.Automation.Language.Parser]::ParseFile($receiverPath, [ref]$receiverTokens, [ref]$receiverErrors)
  $cleanupFunctions = @($receiverAst.FindAll({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and
    $node.Name -eq 'Remove-Phase7BInvocationCreatedEmptyAttemptRoot' }, $true))
  Assert-True ($cleanupFunctions.Count -eq 1) 'one bounded invocation-created empty-root cleanup helper present'
  Invoke-Expression $cleanupFunctions[0].Extent.Text
  $cleanupParent = Join-Path $root 'cleanup-parent'; New-Item -ItemType Directory -Path $cleanupParent | Out-Null
  $cleanupAttempt = 'phase7b-wp2-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
  $emptyCreated = Join-Path $cleanupParent $cleanupAttempt; New-Item -ItemType Directory -Path $emptyCreated | Out-Null
  $removed = Remove-Phase7BInvocationCreatedEmptyAttemptRoot -LiteralPath $emptyCreated -ReplicaParentRoot $cleanupParent `
    -AttemptId $cleanupAttempt -CreatedByInvocation $true
  Assert-True ($removed.attempted -and $removed.removed -and -not (Test-Path -LiteralPath $emptyCreated)) `
    'current invocation empty attempt root removed exactly'
  $preexisting = Join-Path $cleanupParent $cleanupAttempt; New-Item -ItemType Directory -Path $preexisting | Out-Null
  $retained = Remove-Phase7BInvocationCreatedEmptyAttemptRoot -LiteralPath $preexisting -ReplicaParentRoot $cleanupParent `
    -AttemptId $cleanupAttempt -CreatedByInvocation $false
  Assert-True (-not $retained.attempted -and -not $retained.removed -and (Test-Path -LiteralPath $preexisting)) `
    'preexisting empty root is never removed'
  Remove-Item -LiteralPath $preexisting
  $nonempty = Join-Path $cleanupParent $cleanupAttempt; New-Item -ItemType Directory -Path $nonempty | Out-Null
  [IO.File]::WriteAllText((Join-Path $nonempty 'accepted-or-ambiguous-evidence.bin'), 'fixture')
  $blocked = Remove-Phase7BInvocationCreatedEmptyAttemptRoot -LiteralPath $nonempty -ReplicaParentRoot $cleanupParent `
    -AttemptId $cleanupAttempt -CreatedByInvocation $true
  Assert-True ($blocked.attempted -and -not $blocked.removed -and $blocked.blockedByContent -and
    (Test-Path -LiteralPath $nonempty)) 'nonempty ambiguous or evidence-bearing root is never removed'
  [ordered]@{ classification = 'PHASE7B_WP2_BOUNDED_REPLICA_TRANSPORT_TESTS_PASS'; pass = $true; assertions = $script:assertions } | ConvertTo-Json -Compress
} finally { if (Test-Path -LiteralPath $root) { Remove-Item -LiteralPath $root -Recurse -Force } }
