$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bBoundedReplicaTransport.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bIsolatedGuestContract.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2Contract.psm1') -Force
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
  $authoritativeHostSha = 'ea6696e8a0fc4d9242544568d62cd979fd57bd2478fac4f40755b3546776ac3c'
  $authoritativeDiskSha = '336d31be1f1e6dd4bde254fae94ffebf2b23829520a26c2f5d9bc5deda169896'
  $digitZeroHostSha = 'ddf354efb3688588818f48ea7e46720eb7b716e7006ce02b9386786bc6cdc8e1'
  $digitZeroDiskSha = '3b660772000275e24aa13ba78712c518a898e701ebd3a443cee31776877ac948'
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
  $fixtureHost = Get-Phase7BBoundedReplicaHostIdentitySha256 -ComputerName 'LAPTOP-4G5UOU2R' `
    -Uuid '01234567-89AB-CDEF-0123-456789ABCDEF' -MachineGuid 'FEDCBA98-7654-3210-FEDC-BA9876543210'
  Assert-True ($fixtureHost -ceq 'ac9d1de2394da0c4840e12a5dda9c31af0695fa129368c4941314ae8ef284663') `
    'shared real host hash-producing path matches fixed V2 fixture digest'
  $digitZeroFixtureHost = Get-Phase7BBoundedReplicaHostIdentitySha256 -ComputerName 'LAPTOP-4G5U0U2R' `
    -Uuid '01234567-89AB-CDEF-0123-456789ABCDEF' -MachineGuid 'FEDCBA98-7654-3210-FEDC-BA9876543210'
  Assert-True ($digitZeroFixtureHost -cne $fixtureHost) 'digit-zero hostname produces a distinct host identity digest'
  $fixtureDisk = Get-Phase7BBoundedReplicaDiskIdentitySha256 -ComputerName 'LAPTOP-4G5UOU2R' -DiskNumber 0 `
    -UniqueId 'UNIQUE-ID' -SerialNumber 'SERIAL-01' -FriendlyName 'Friendly Disk' `
    -DiskSizeBytes ([int64]1000204886016) -BusType 'SATA'
  Assert-True ($fixtureDisk -ceq 'd6b447b4e76618df4b90659befd20fb9790af53ffbf54e2f21cb9df8563ace8c') `
    'shared real disk hash-producing path matches fixed V2 fixture digest'
  $digitZeroFixtureDisk = Get-Phase7BBoundedReplicaDiskIdentitySha256 -ComputerName 'LAPTOP-4G5U0U2R' -DiskNumber 0 `
    -UniqueId 'UNIQUE-ID' -SerialNumber 'SERIAL-01' -FriendlyName 'Friendly Disk' `
    -DiskSizeBytes ([int64]1000204886016) -BusType 'SATA'
  Assert-True ($digitZeroFixtureDisk -cne $fixtureDisk) 'digit-zero hostname produces a distinct disk identity digest'
  Assert-Throws { Get-Phase7BBoundedReplicaHostIdentitySha256 -ComputerName 'LAPTOP-4G5UOU2R' `
    -Uuid 'not-a-guid' -MachineGuid 'FEDCBA98-7654-3210-FEDC-BA9876543210' } 'HOST_COMPONENT_FORMAT_FAIL' `
    'malformed UUID fails shared host computation'
  $acceptedName = 'LAPTOP-4G5UOU2R'
  Assert-True ((ConvertTo-Phase7BCanonicalComputerName -Value $acceptedName) -ceq $acceptedName) 'accepted scalar computer name canonicalized'
  Assert-True ((ConvertTo-Phase7BCanonicalComputerName -Value 'laptop-4g5uou2r') -ceq $acceptedName) 'computer name uses ordinal case-insensitive canonical identity'
  Assert-True ((ConvertTo-Phase7BCanonicalComputerName -Value (, $acceptedName)) -ceq $acceptedName) 'one-element string collection canonicalized'
  Assert-True (Test-Phase7BBoundedReplicaComputerIdentity -ObservedComputerName $acceptedName -ExpectedComputerName $acceptedName).pass 'current accepted laptop name passes canonical identity'
  Assert-True (Test-Phase7BBoundedReplicaComputerIdentity -ObservedComputerName 'laptop-4g5uou2r' -ExpectedComputerName $acceptedName).pass 'case-only Windows hostname representation accepted'
  foreach ($invalidName in @(
      $null, '', ' ',
      ' LAPTOP-4G5UOU2R', 'LAPTOP-4G5UOU2R ', "LAPTOP-4G5UOU2R`0", "LAPTOP-4G5UOU2R`n", 'LAPTOP-4G5U0U2R', 'WRONG_HOST'
    )) {
    Assert-True (-not (Test-Phase7BBoundedReplicaComputerIdentity -ObservedComputerName $invalidName -ExpectedComputerName $acceptedName).pass) 'invalid, malformed, or wrong computer name rejected'
  }
  Assert-True (-not (Test-Phase7BBoundedReplicaComputerIdentity -ObservedComputerName @($acceptedName, $acceptedName) -ExpectedComputerName $acceptedName).pass) 'multi-value computer name identity fails closed'
  Assert-Throws { ConvertTo-Phase7BCanonicalComputerName -Value $null } 'SHAPE_INVALID' 'null computer name fails closed'
  Assert-Throws { ConvertTo-Phase7BCanonicalComputerName -Value @('A', 'B') } 'SHAPE_INVALID' 'multi-value computer name fails closed'
  Assert-Throws { ConvertTo-Phase7BCanonicalComputerName -Value ' LAPTOP-4G5UOU2R' } 'FORMAT_INVALID' 'leading whitespace fails closed'
  Assert-Throws { ConvertTo-Phase7BCanonicalComputerName -Value "LAPTOP-4G5UOU2R`0" } 'FORMAT_INVALID' 'embedded null fails closed'
  $packet = Join-Path $root 'phase7b-wp2-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.zip.age'
  [IO.File]::WriteAllBytes($packet, [Text.Encoding]::ASCII.GetBytes("age-encryption.org/v1`nsynthetic-ciphertext"))
  $sha = Get-Phase7BSha256 -LiteralPath $packet; $bytes = [int64](Get-Item $packet).Length
  $nativePacket = Resolve-Phase7BWorkPackage2NativeFilePath -LiteralPath $packet
  Assert-True ($nativePacket.pass -and $nativePacket.providerName -ceq 'FileSystem' -and
    $nativePacket.nativePath -ceq [IO.Path]::GetFullPath($packet)) 'normal native local file resolves to exact native path'
  Assert-Throws { Resolve-Phase7BWorkPackage2NativeFilePath -LiteralPath 'relative.age' } 'PATH_FORMAT_REJECTED' 'relative file path rejected'
  Assert-Throws { Resolve-Phase7BWorkPackage2NativeFilePath -LiteralPath (Join-Path $root 'missing.age') } 'PATH_NOT_FOUND' 'missing native file rejected'
  Assert-Throws { Resolve-Phase7BWorkPackage2NativeFilePath -LiteralPath "Microsoft.PowerShell.Core\FileSystem::$packet" } 'PATH_FORMAT_REJECTED' 'provider-qualified input rejected'
  Assert-Throws { Resolve-Phase7BWorkPackage2NativeFilePath -LiteralPath 'HKCU:\Software' } 'PATH_PROVIDER_REJECTED' 'non-FileSystem provider rejected'
  $packetDrive = [IO.Path]::GetPathRoot($packet).Substring(0, 1)
  $packetUnc = "\\localhost\$packetDrive`$$($packet.Substring(2))"
  $nativeUncPacket = Resolve-Phase7BWorkPackage2NativeFilePath -LiteralPath $packetUnc
  Assert-True ($nativeUncPacket.pass -and $nativeUncPacket.nativePath -ceq $packetUnc -and
    [IO.File]::Exists($nativeUncPacket.nativePath)) 'native loopback UNC file resolves without provider-qualified PathInfo syntax'
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
      @{ property = 'hostIdentitySha256'; value = $digitZeroHostSha },
      @{ property = 'diskIdentitySha256'; value = $digitZeroDiskSha },
      @{ property = 'hostIdentitySha256'; value = $invalidTranscribedHostSha })) {
    $retired = New-Evidence; $retired.($case.property) = $case.value
    Assert-True (-not (Test-Phase7BBoundedReplicaDestinationEvidence -Evidence $retired -RequiredBytes $bytes).pass) `
      "digit-zero-derived or malformed identity fails active destination gate:$($case.property)"
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
  $copy = Copy-Phase7BBoundedEncryptedReplica -SourcePath $packet -DestinationPath $replica -DestinationRoot $root -ExpectedSha256 $sha -ExpectedBytes $bytes
  Assert-True ($copy.pass -and $copy.packetSha256 -eq $sha -and $copy.writeThrough) 'bounded synthetic copy and readback pass'
  Assert-Throws { Copy-Phase7BBoundedEncryptedReplica -SourcePath $packet -DestinationPath $replica -DestinationRoot $root -ExpectedSha256 $sha -ExpectedBytes $bytes } 'DESTINATION_EXISTS' 'destination overwrite rejected'
  $partial = Join-Path $root 'partial.age'; [IO.File]::WriteAllBytes($partial, [Text.Encoding]::ASCII.GetBytes('age-encryption.org/v1'))
  Assert-True (-not (Test-Phase7BBoundedEncryptedReplicaSource -LiteralPath $partial -ExpectedSha256 $sha -ExpectedBytes $bytes).pass) 'partial copy rejected'
  $mismatch = Join-Path $root 'mismatch.age'; Copy-Item $packet $mismatch; [IO.File]::AppendAllText($mismatch, 'x')
  Assert-True (-not (Test-Phase7BBoundedEncryptedReplicaSource -LiteralPath $mismatch -ExpectedSha256 $sha -ExpectedBytes $bytes).pass) 'destination size and hash mismatch rejected'
  Assert-Throws { Test-Phase7BBoundedEncryptedReplicaSource -LiteralPath (Join-Path $root 'missing.age') -ExpectedSha256 $sha -ExpectedBytes $bytes } 'PACKET_NOT_FOUND' 'readback failure rejects'

  $attempt = 'phase7b-wp2-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  $mappedRoot = Join-Path $root 'mapped-receiver'; New-Item -ItemType Directory -Path $mappedRoot | Out-Null
  $outsideRoot = Join-Path $root 'outside-receiver'; New-Item -ItemType Directory -Path $outsideRoot | Out-Null
  New-PSDrive -Name P7BF -PSProvider FileSystem -Root $mappedRoot | Out-Null
  New-PSDrive -Name P7BO -PSProvider FileSystem -Root $outsideRoot | Out-Null
  try {
    $mappedIdentity = Get-Phase7BReplicaDirectoryIdentity -LiteralPath 'P7BF:\'
    Assert-True ($mappedIdentity.localPath -eq 'P7BF:\' -and $mappedIdentity.providerRoot -eq $mappedRoot -and $mappedIdentity.providerRootSha256 -eq (Get-Phase7BSha256 -Text $mappedRoot.ToLowerInvariant())) 'nonpersistent PSDrive resolves to exact provider attempt root'
    Assert-Throws { [IO.Path]::GetFullPath('P7BF:\mapped.age') } 'format is not supported' 'real Windows PowerShell 5.1 failure form reproduced for multi-character PSDrive path'
    $mappedDestination = 'P7BF:\mapped.age'
    $mappedCopy = Copy-Phase7BBoundedEncryptedReplica -SourcePath $packet -DestinationPath $mappedDestination -DestinationRoot 'P7BF:\' -ExpectedSha256 $sha -ExpectedBytes $bytes
    Assert-True ($mappedCopy.pass -and (Test-Path -LiteralPath $mappedDestination) -and $mappedCopy.writeThrough) 'provider-aware bounded copy accepts exact PSDrive child and preserves write-through readback'
    $mappedNative = Resolve-Phase7BWorkPackage2NativeFilePath -LiteralPath $mappedDestination
    Assert-True ($mappedNative.pass -and $mappedNative.nativePath -ceq (Join-Path $mappedRoot 'mapped.age')) `
      'multi-character FileSystem PSDrive resolves to underlying native ProviderPath'
    $mappedPacket = Test-Phase7BEncryptedPacket -LiteralPath $mappedDestination -ExpectedSha256 $sha
    Assert-True ($mappedPacket.pass -and $mappedPacket.packetBytes -eq $bytes) `
      'exact line-333 encrypted packet readback accepts FileSystem PSDrive path through native ProviderPath'
    $boundedModule = Get-Module phase7bBoundedReplicaTransport
    $originalReadback = & $boundedModule { (Get-Command Test-Phase7BEncryptedPacket -CommandType Function).ScriptBlock }
    $cleanupDestination = 'P7BF:\post-write-readback-failure.age'
    try {
      & $boundedModule {
        function script:Test-Phase7BEncryptedPacket {
          param([string]$LiteralPath, [string]$ExpectedSha256)
          throw 'SYNTHETIC_POST_WRITE_READBACK_FAIL'
        }
      }
      Assert-Throws {
        Copy-Phase7BBoundedEncryptedReplica -SourcePath $packet -DestinationPath $cleanupDestination `
          -DestinationRoot 'P7BF:\' -ExpectedSha256 $sha -ExpectedBytes $bytes
      } 'SYNTHETIC_POST_WRITE_READBACK_FAIL' 'post-write readback exception remains the surfaced failure after exact cleanup'
      Assert-True (-not (Test-Path -LiteralPath $cleanupDestination)) `
        'post-write readback exception removes the exact unaccepted destination packet'
    } finally {
      & $boundedModule {
        param([scriptblock]$FunctionBody)
        Set-Item -Path Function:\script:Test-Phase7BEncryptedPacket -Value $FunctionBody
      } $originalReadback
    }
    New-Item -ItemType Directory -Path 'P7BF:\nested' | Out-Null
    Assert-Throws { Copy-Phase7BBoundedEncryptedReplica -SourcePath $packet -DestinationPath 'P7BF:\nested\outside.age' -DestinationRoot 'P7BF:\' -ExpectedSha256 $sha -ExpectedBytes $bytes } 'OUTSIDE_BOUND_ROOT' 'destination below a nested directory is outside the exact bound receiver root'
    Assert-Throws { Copy-Phase7BBoundedEncryptedReplica -SourcePath $packet -DestinationPath 'P7BF:\..\outside-receiver\escape.age' -DestinationRoot 'P7BF:\' -ExpectedSha256 $sha -ExpectedBytes $bytes } 'PATH_FORMAT_REJECTED' 'traversal syntax is rejected before provider resolution'
    Assert-Throws { Copy-Phase7BBoundedEncryptedReplica -SourcePath $packet -DestinationPath 'P7BO:\escape.age' -DestinationRoot 'P7BF:\' -ExpectedSha256 $sha -ExpectedBytes $bytes } 'OUTSIDE_BOUND_ROOT' 'different filesystem PSDrive cannot escape the bound receiver root'
    Assert-Throws { Copy-Phase7BBoundedEncryptedReplica -SourcePath $packet -DestinationPath 'HKCU:\Software\bad.age' -DestinationRoot 'HKCU:\Software' -ExpectedSha256 $sha -ExpectedBytes $bytes } 'PROVIDER_REJECTED' 'unexpected non-filesystem provider rejected'
    Assert-Throws { Copy-Phase7BBoundedEncryptedReplica -SourcePath $packet -DestinationPath '\\server-only\bad.age' -DestinationRoot '\\server-only' -ExpectedSha256 $sha -ExpectedBytes $bytes } 'PATH_FORMAT_REJECTED' 'malformed UNC root rejected before network resolution'
    Assert-Throws { Copy-Phase7BBoundedEncryptedReplica -SourcePath $packet -DestinationPath 'relative.age' -DestinationRoot 'P7BF:\' -ExpectedSha256 $sha -ExpectedBytes $bytes } 'PATH_FORMAT_REJECTED' 'relative destination rejected'
    $sourceRejectedDestination = 'P7BF:\source-rejected.age'
    Assert-Throws { Copy-Phase7BBoundedEncryptedReplica -SourcePath $packet -DestinationPath $sourceRejectedDestination -DestinationRoot 'P7BF:\' -ExpectedSha256 ('0' * 64) -ExpectedBytes $bytes } 'SOURCE_FAIL' 'source mismatch fails before destination creation'
    Assert-True (-not (Test-Path -LiteralPath $sourceRejectedDestination) -and
      -not (Test-Path -LiteralPath 'P7BF:\nested\outside.age') -and -not (Test-Path -LiteralPath 'P7BO:\escape.age')) `
      'all rejected copies leave no synthetic destination residue'
  } finally {
    Remove-PSDrive -Name P7BO -Force -ErrorAction SilentlyContinue
    Remove-PSDrive -Name P7BF -Force -ErrorAction SilentlyContinue
  }
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
  $primary = [pscustomobject]@{ classification = 'PHASE7B_WP2_PRIMARY_REPLICA_SESSION_TEARDOWN_PASS'; pass = $true; attemptId = $attempt; evidenceNonce = ('b' * 32); evidenceFileName = "$attempt-primary-teardown-$('b' * 32).json"; observedAt = [DateTime]::UtcNow.ToString('o'); serverName = 'LAPTOP-4G5UOU2R'; shareName = 'P7Baaaaaaaa$'; matchingPsDriveCount = 0; matchingSmbMappingCount = 0; savedCredentialTargetCount = 0; mappingPersistent = $false; credentialsPersisted = $false; sessionTornDown = $true; mutationPerformed = $false; reportPersisted = $true; automaticRetryAllowed = $false }
  Assert-True (Test-Phase7BPrimaryReplicaSessionTeardownEvidence -Evidence $primary -ExpectedAttemptId $attempt -ExpectedServerName 'LAPTOP-4G5UOU2R' -ExpectedShareName 'P7Baaaaaaaa$').pass 'primary mapping and credential teardown accepted'
  foreach ($property in @('matchingPsDriveCount','matchingSmbMappingCount','savedCredentialTargetCount')) { $bad = $primary.PSObject.Copy(); $bad.$property = 1; Assert-True (-not (Test-Phase7BPrimaryReplicaSessionTeardownEvidence -Evidence $bad -ExpectedAttemptId $attempt -ExpectedServerName 'LAPTOP-4G5UOU2R' -ExpectedShareName 'P7Baaaaaaaa$').pass) "primary teardown rejects $property residue" }
  $wrongTeardownName = $primary.PSObject.Copy(); $wrongTeardownName.evidenceFileName = 'wrong.json'
  Assert-True (-not (Test-Phase7BPrimaryReplicaSessionTeardownEvidence -Evidence $wrongTeardownName -ExpectedAttemptId $attempt -ExpectedServerName 'LAPTOP-4G5UOU2R' -ExpectedShareName 'P7Baaaaaaaa$').pass) 'primary teardown path identity mismatch rejected'

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
  $contractSource = Get-Content -Raw (Join-Path $PSScriptRoot 'phase7bWorkPackage2Contract.psm1')
  $boundedSource = Get-Content -Raw (Join-Path $PSScriptRoot 'phase7bBoundedReplicaTransport.psm1')
  Assert-True ($contractSource.Contains('Resolve-Phase7BWorkPackage2NativeFilePath') -and
    $contractSource.Contains('$resolved[0].ProviderPath') -and $contractSource.Contains('$resolved.Count -ne 1') -and
    $contractSource.Contains("Provider.Name -cne 'FileSystem'")) `
    'shared WP2 file resolver requires one FileSystem result and extracts native ProviderPath'
  Assert-True (-not ($contractSource -match '\[IO\.(?:File|Compression\.ZipFile)\]::(?:OpenRead|Open)\(\(Resolve-Path[^\r\n]+\)\.Path') -and
    -not ($boundedSource -match '\[IO\.File\]::Open\(\(Resolve-Path[^\r\n]+\)\.Path')) `
    'transitive WP2 raw .NET readers no longer consume PathInfo.Path directly'
  Assert-True ($boundedSource.Contains('PHASE7B_WP2_BOUNDED_REPLICA_READBACK_CLEANUP_FAIL') -and
    $boundedSource.Contains('Remove-Item -LiteralPath $nativeDestinationPath -Force -ErrorAction Stop')) `
    'post-write readback exceptions require exact destination cleanup or fail closed'
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
