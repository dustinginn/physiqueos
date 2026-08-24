$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$scriptPath = Join-Path $PSScriptRoot 'phase7bRunWorkPackage2LaptopPreflight.ps1'
$attempt = 'phase7b-wp2-fc48221852204c188c414a18f6c42bbd'
$acceptedHostSha = 'ea6696e8a0fc4d9242544568d62cd979fd57bd2478fac4f40755b3546776ac3c'
$acceptedDiskSha = '336d31be1f1e6dd4bde254fae94ffebf2b23829520a26c2f5d9bc5deda169896'
$digitZeroHostSha = 'ddf354efb3688588818f48ea7e46720eb7b716e7006ce02b9386786bc6cdc8e1'
$digitZeroDiskSha = '3b660772000275e24aa13ba78712c518a898e701ebd3a443cee31776877ac948'
$invalidTranscribedHostSha = 'df354efb3688588818f48ea7e46720eb7b716e7006ce02b9386786bc6cdc8e1'
$testRoot = Join-Path ([IO.Path]::GetTempPath()) "phase7b-stage0-delivery-$([guid]::NewGuid().ToString('N'))"
$assertions = 0

function Assert-True([bool]$Condition, [string]$Message) {
  $script:assertions++
  if (-not $Condition) { throw "ASSERTION_FAILED:$Message" }
}

function Assert-ThrowsCode([scriptblock]$Action, [string]$ExpectedCode, [string]$Message) {
  $script:assertions++
  $observed = $null
  try { [void](& $Action) } catch { $observed = $_.Exception.Message }
  if ($observed -cne $ExpectedCode) { throw "ASSERTION_FAILED:$Message:expected=$ExpectedCode:observed=$observed" }
}

function Invoke-Child([string[]]$Arguments, [string]$ChildScriptPath = $scriptPath) {
  $savedErrorActionPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $lines = @(& "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive `
      -ExecutionPolicy Bypass -File $ChildScriptPath @Arguments 2>&1)
    [pscustomobject]@{ exitCode = $LASTEXITCODE; text = $lines -join [Environment]::NewLine }
  } finally {
    $ErrorActionPreference = $savedErrorActionPreference
  }
}

function Invoke-SyntheticBootstrapFlow(
  [string]$AuthorizedCommit,
  [string]$RequestedCommit,
  [string]$ExpectedArtifactSha256,
  [string]$RequestedArtifactSha256,
  [string]$DeliveryRoot
) {
  if ($RequestedCommit -cne $AuthorizedCommit -or $RequestedCommit -cnotmatch '^[0-9a-f]{40}$') {
    throw 'PHASE7B_WP2B_STAGE0_BOOTSTRAP_COMMIT_FAIL'
  }
  if ($RequestedArtifactSha256 -cne $ExpectedArtifactSha256 -or $RequestedArtifactSha256 -cnotmatch '^[0-9a-f]{64}$') {
    throw 'PHASE7B_WP2B_STAGE0_BOOTSTRAP_EXPECTED_HASH_FAIL'
  }
  if (Test-Path -LiteralPath $DeliveryRoot) { throw 'PHASE7B_WP2B_STAGE0_BOOTSTRAP_DELIVERY_ROOT_PREEXISTS' }
  New-Item -ItemType Directory -Path $DeliveryRoot -ErrorAction Stop | Out-Null
  $downloaded = Join-Path $DeliveryRoot 'phase7bRunWorkPackage2LaptopPreflight.ps1'
  Copy-Item -LiteralPath $scriptPath -Destination $downloaded -ErrorAction Stop
  if ((Get-FileHash -Algorithm SHA256 -LiteralPath $downloaded).Hash.ToLowerInvariant() -cne $ExpectedArtifactSha256) {
    throw 'PHASE7B_WP2B_STAGE0_BOOTSTRAP_DOWNLOADED_HASH_FAIL'
  }
  [pscustomobject]@{
    artifactPath = $downloaded
    attemptId = $attempt
    toolingCommit = $RequestedCommit
    executionPerformed = $false
  }
}

try {
  New-Item -ItemType Directory -Path $testRoot -ErrorAction Stop | Out-Null
  $tokens = $null
  $errors = $null
  $ast = [Management.Automation.Language.Parser]::ParseFile($scriptPath, [ref]$tokens, [ref]$errors)
  Assert-True ($errors.Count -eq 0) 'tracked Stage 0 wrapper parses in Windows PowerShell 5.1'
  $source = Get-Content -LiteralPath $scriptPath -Raw
  $hash1 = (Get-FileHash -Algorithm SHA256 -LiteralPath $scriptPath).Hash.ToLowerInvariant()
  $hash2 = (Get-FileHash -Algorithm SHA256 -LiteralPath $scriptPath).Hash.ToLowerInvariant()
  Assert-True ($hash1 -ceq $hash2 -and $hash1 -match '^[0-9a-f]{64}$') 'tracked Stage 0 artifact hash is deterministic'

  foreach ($functionName in @('Get-Phase7BStage0Sha256', 'Assert-Phase7BStage0Sha256Identity', 'Get-Phase7BStage0HostIdentitySha256',
      'Get-Phase7BStage0DiskIdentitySha256', 'Assert-Phase7BStage0Snapshot')) {
    $functions = @($ast.FindAll({
      param($node)
      $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $functionName
    }, $true))
    Assert-True ($functions.Count -eq 1) "one simplified helper present:$functionName"
    Invoke-Expression $functions[0].Extent.Text
  }

  Assert-True ($source.Contains($attempt)) 'wrapper binds exact authorized attempt'
  foreach ($binding in @(
      'LAPTOP-4G5UOU2R',
      $acceptedHostSha,
      $acceptedDiskSha,
      "'NTFS'", "'SATA'", "'192.168.1.69'", '[int64]1GB')) {
    Assert-True ($source.Contains($binding)) "Stage 0 exact invariant retained:$binding"
  }
  Assert-True (-not $source.Contains($digitZeroHostSha) -and -not $source.Contains($digitZeroDiskSha)) `
    'digit-zero-derived identity digests are retired from active Stage 0 gates'
  Assert-True (-not ($source -cmatch ('(?<![0-9a-f])' + [regex]::Escape($invalidTranscribedHostSha) + '(?![0-9a-f])'))) `
    'invalid 63-character transcription is retired from active Stage 0 gates'
  Assert-True (-not $source.Contains('Get-Phase7BStage0SafeIdentityResult') -and
    -not $source.Contains('Get-Phase7BStage0SafeValueShape') -and
    -not $source.Contains('hostnameEvidence')) 'nested hostname evidence layer removed'
  Assert-True (-not $source.Contains('[Environment]::MachineName') -and
    -not $source.Contains('$env:COMPUTERNAME') -and
    -not $source.Contains('Get-CimInstance Win32_ComputerSystem -') -and
    -not $source.Contains('PHASE7B_WP2B_LAPTOP_HOST_NAME_FAIL')) 'standalone runtime hostname gate removed'
  Assert-True (-not ($source -match '\$result\.(pass|classification|canonicalComputerName)')) 'optional result-property dereferences removed'
  Assert-True (-not ($source -match '(?i)Invoke-WebRequest|Import-Module|phase7bPreflightBoundedReplicaDestination')) 'standalone wrapper has no downloaded dependency chain'
  Assert-True (-not ($source -match '(?i)-Operation\s+OpenEphemeralReceiver|New-SmbShare|New-NetFirewallRule|CaptureEncryptReplicate|SetWorkPackage2CaptureQuiescence|Start-Process|Stop-Process')) 'wrapper cannot mutate receiver capture quiescence or processes'
  Assert-True ($source.Contains("classification = 'PHASE7B_WP2B_LAPTOP_READONLY_PREFLIGHT_PASS'") -and
    $source.Contains("classification = 'PHASE7B_WP2B_LAPTOP_READONLY_PREFLIGHT_FAIL'")) 'flat PASS and FAIL classifications are source-owned'
  Assert-True ($source.Contains('mutationPerformed = $false') -and $source.Contains('reportPersisted = $false') -and
    $source.Contains('receiverOpened = $false') -and $source.Contains('automaticRetryAllowed = $false') -and
    $source.Contains('wp2cAuthorized = $false')) 'flat result preserves no-mutation authorization boundary'
  Assert-True ($source.Contains('PHASE7B_WP2B_STAGE0_ARTIFACT_IDENTITY_FAIL') -and
    $source.Contains('Get-FileHash -Algorithm SHA256 -LiteralPath $PSCommandPath')) 'Stage 0 verifies its own exact delivered bytes before host inspection'

  function Get-V2ReferenceHostIdentitySha256([string]$ComputerName, [string]$Uuid, [string]$MachineGuid) {
    $normalizedName = $ComputerName.ToLowerInvariant()
    $normalizedUuid = $Uuid.ToLowerInvariant()
    $normalizedMachineGuid = $MachineGuid.ToLowerInvariant()
    Get-Phase7BStage0Sha256 -Text ($normalizedName + '|' + $normalizedUuid + '|' + $normalizedMachineGuid)
  }
  function Get-V2ReferenceDiskIdentitySha256([string]$ComputerName, [int]$DiskNumber,
      [string]$UniqueId, [string]$SerialNumber, [string]$FriendlyName, [int64]$DiskSizeBytes,
      [string]$BusType) {
    $normalizedName = $ComputerName.ToLowerInvariant()
    $normalizedUniqueId = $UniqueId.ToLowerInvariant()
    $normalizedSerialNumber = $SerialNumber.ToLowerInvariant()
    $normalizedFriendlyName = $FriendlyName.ToLowerInvariant()
    $normalizedBusType = $BusType.ToLowerInvariant()
    Get-Phase7BStage0Sha256 -Text ($normalizedName + '|' + [string]$DiskNumber + '|' +
      $normalizedUniqueId + '|' + $normalizedSerialNumber + '|' + $normalizedFriendlyName + '|' +
      [string]$DiskSizeBytes + '|' + $normalizedBusType)
  }
  $syntheticUuid = '01234567-89AB-CDEF-0123-456789ABCDEF'
  $syntheticMachineGuid = 'FEDCBA98-7654-3210-FEDC-BA9876543210'
  $v2Host = Get-V2ReferenceHostIdentitySha256 'LAPTOP-4G5UOU2R' $syntheticUuid $syntheticMachineGuid
  $stage0Host = Get-Phase7BStage0HostIdentitySha256 -ComputerName 'LAPTOP-4G5UOU2R' `
    -Uuid $syntheticUuid -MachineGuid $syntheticMachineGuid
  Assert-True ($v2Host -ceq $stage0Host -and $stage0Host -ceq 'ac9d1de2394da0c4840e12a5dda9c31af0695fa129368c4941314ae8ef284663') `
    'Stage 0 real host hash-producing path matches fixed V2 fixture digest'
  $digitZeroStage0Host = Get-Phase7BStage0HostIdentitySha256 -ComputerName 'LAPTOP-4G5U0U2R' `
    -Uuid $syntheticUuid -MachineGuid $syntheticMachineGuid
  Assert-True ($digitZeroStage0Host -cne $stage0Host) 'Stage 0 digit-zero hostname yields a distinct rejected host digest'
  $v2Disk = Get-V2ReferenceDiskIdentitySha256 'LAPTOP-4G5UOU2R' 0 'UNIQUE-ID' 'SERIAL-01' `
    'Friendly Disk' ([int64]1000204886016) 'SATA'
  $stage0Disk = Get-Phase7BStage0DiskIdentitySha256 -ComputerName 'LAPTOP-4G5UOU2R' -DiskNumber 0 `
    -UniqueId 'UNIQUE-ID' -SerialNumber 'SERIAL-01' -FriendlyName 'Friendly Disk' `
    -DiskSizeBytes ([int64]1000204886016) -BusType 'SATA'
  Assert-True ($v2Disk -ceq $stage0Disk -and $stage0Disk -ceq 'd6b447b4e76618df4b90659befd20fb9790af53ffbf54e2f21cb9df8563ace8c') `
    'Stage 0 real disk hash-producing path matches fixed V2 fixture digest'
  $digitZeroStage0Disk = Get-Phase7BStage0DiskIdentitySha256 -ComputerName 'LAPTOP-4G5U0U2R' -DiskNumber 0 `
    -UniqueId 'UNIQUE-ID' -SerialNumber 'SERIAL-01' -FriendlyName 'Friendly Disk' `
    -DiskSizeBytes ([int64]1000204886016) -BusType 'SATA'
  Assert-True ($digitZeroStage0Disk -cne $stage0Disk) 'Stage 0 digit-zero hostname yields a distinct rejected disk digest'

  foreach ($validIdentity in @($acceptedHostSha, $acceptedDiskSha, $stage0Host, $stage0Disk)) {
    Assert-True ((Assert-Phase7BStage0Sha256Identity -Value $validIdentity -ErrorCode 'SHAPE_FAIL') -ceq $validIdentity) `
      'exact lowercase 64-hex identity accepted'
  }
  foreach ($invalidIdentity in @($null, '', ('a' * 63), ('a' * 65), ('A' * 64), (('a' * 63) + 'g'))) {
    Assert-ThrowsCode { Assert-Phase7BStage0Sha256Identity -Value $invalidIdentity -ErrorCode 'SHAPE_FAIL' } `
      'SHAPE_FAIL' 'malformed active identity fails closed'
  }

  $valid = @{
    ObservedAttemptId = $attempt
    ObservedToolingCommit = 'a' * 40
    HostIdentitySha256 = $acceptedHostSha
    DiskIdentitySha256 = $acceptedDiskSha
    FileSystem = 'NTFS'
    DiskNumber = 0
    BusType = 'SATA'
    FreeBytes = [int64]2GB
    PrivateLanCandidateCount = 1
    ReplicaIpv4 = '192.168.1.68'
    ReplicaPrefixLength = 24
  }
  Assert-True ([bool](Assert-Phase7BStage0Snapshot @valid)) 'exact accepted host and disk identities pass without runtime hostname equality'

  $wrongAttempt = $valid.Clone(); $wrongAttempt.ObservedAttemptId = 'phase7b-wp2-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  Assert-ThrowsCode { Assert-Phase7BStage0Snapshot @wrongAttempt } 'PHASE7B_WP2B_ATTEMPT_IDENTITY_FAIL' 'wrong attempt fails closed'
  $wrongCommit = $valid.Clone(); $wrongCommit.ObservedToolingCommit = 'wrong'
  Assert-ThrowsCode { Assert-Phase7BStage0Snapshot @wrongCommit } 'PHASE7B_WP2B_TOOLING_COMMIT_IDENTITY_FAIL' 'malformed tooling commit fails closed'
  $wrongHost = $valid.Clone(); $wrongHost.HostIdentitySha256 = 'b' * 64
  Assert-ThrowsCode { Assert-Phase7BStage0Snapshot @wrongHost } 'PHASE7B_WP2B_LAPTOP_HOST_IDENTITY_FAIL' 'wrong host with correct disk fails closed'
  $wrongDisk = $valid.Clone(); $wrongDisk.DiskIdentitySha256 = 'c' * 64
  Assert-ThrowsCode { Assert-Phase7BStage0Snapshot @wrongDisk } 'PHASE7B_WP2B_LAPTOP_DISK_IDENTITY_FAIL' 'correct host with wrong disk fails closed'
  $digitZeroHost = $valid.Clone(); $digitZeroHost.HostIdentitySha256 = $digitZeroHostSha
  Assert-ThrowsCode { Assert-Phase7BStage0Snapshot @digitZeroHost } 'PHASE7B_WP2B_LAPTOP_HOST_IDENTITY_FAIL' 'digit-zero-derived host identity is audit-only and fails active gate'
  $digitZeroDisk = $valid.Clone(); $digitZeroDisk.DiskIdentitySha256 = $digitZeroDiskSha
  Assert-ThrowsCode { Assert-Phase7BStage0Snapshot @digitZeroDisk } 'PHASE7B_WP2B_LAPTOP_DISK_IDENTITY_FAIL' 'digit-zero-derived disk identity is audit-only and fails active gate'
  $invalidTranscription = $valid.Clone(); $invalidTranscription.HostIdentitySha256 = $invalidTranscribedHostSha
  Assert-ThrowsCode { Assert-Phase7BStage0Snapshot @invalidTranscription } 'PHASE7B_WP2B_LAPTOP_HOST_IDENTITY_SHAPE_FAIL' `
    'invalid 63-character host transcription fails shape gate'
  foreach ($storageCase in @(
      @{ field = 'FileSystem'; value = 'ReFS' },
      @{ field = 'DiskNumber'; value = 1 },
      @{ field = 'BusType'; value = 'USB' })) {
    $wrongStorage = $valid.Clone(); $wrongStorage[$storageCase.field] = $storageCase.value
    Assert-ThrowsCode { Assert-Phase7BStage0Snapshot @wrongStorage } 'PHASE7B_WP2B_LAPTOP_STORAGE_CONTRACT_FAIL' "wrong storage invariant fails:$($storageCase.field)"
  }
  $lowCapacity = $valid.Clone(); $lowCapacity.FreeBytes = [int64](1GB - 1)
  Assert-ThrowsCode { Assert-Phase7BStage0Snapshot @lowCapacity } 'PHASE7B_WP2B_LAPTOP_CAPACITY_FAIL' 'insufficient capacity fails closed'
  $manyLan = $valid.Clone(); $manyLan.PrivateLanCandidateCount = 2
  Assert-ThrowsCode { Assert-Phase7BStage0Snapshot @manyLan } 'PHASE7B_WP2B_LAPTOP_PRIVATE_LAN_CARDINALITY_FAIL' 'many matching LAN addresses fail closed'
  $wrongPrefix = $valid.Clone(); $wrongPrefix.ReplicaPrefixLength = 16
  Assert-ThrowsCode { Assert-Phase7BStage0Snapshot @wrongPrefix } 'PHASE7B_WP2B_LAPTOP_PRIVATE_LAN_CARDINALITY_FAIL' 'wrong LAN prefix fails closed'
  $wrongSubnet = $valid.Clone(); $wrongSubnet.ReplicaIpv4 = '192.168.2.68'
  Assert-ThrowsCode { Assert-Phase7BStage0Snapshot @wrongSubnet } 'PHASE7B_WP2B_LAPTOP_PRIVATE_LAN_SUBNET_FAIL' 'wrong LAN subnet fails closed'
  $invalidIpv4 = $valid.Clone(); $invalidIpv4.ReplicaIpv4 = 'not-an-ip'
  Assert-ThrowsCode { Assert-Phase7BStage0Snapshot @invalidIpv4 } 'PHASE7B_WP2B_LAPTOP_PRIVATE_LAN_IPV4_FAIL' 'invalid LAN address fails closed'

  $wrongAttemptChild = Invoke-Child -Arguments @('-AttemptId', 'phase7b-wp2-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '-ExpectedToolingCommit', ('a' * 40), '-ExpectedArtifactSha256', $hash1)
  Assert-True ($wrongAttemptChild.exitCode -ne 0 -and $wrongAttemptChild.text.Contains('PHASE7B_WP2B_ATTEMPT_IDENTITY_FAIL')) 'wrong attempt stops before live host inspection'
  $malformedCommitChild = Invoke-Child -Arguments @('-AttemptId', $attempt, '-ExpectedToolingCommit', 'wrong', '-ExpectedArtifactSha256', $hash1)
  Assert-True ($malformedCommitChild.exitCode -ne 0) 'malformed commit fails parameter binding before live inspection'
  $wrongArtifactChild = Invoke-Child -Arguments @('-AttemptId', $attempt, '-ExpectedToolingCommit', ('a' * 40), '-ExpectedArtifactSha256', ('f' * 64))
  Assert-True ($wrongArtifactChild.exitCode -ne 0 -and $wrongArtifactChild.text.Contains('PHASE7B_WP2B_STAGE0_ARTIFACT_IDENTITY_FAIL')) 'wrong delivered artifact identity fails before host inspection'
  $missingArtifactChild = Invoke-Child -Arguments @('-AttemptId', $attempt, '-ExpectedToolingCommit', ('a' * 40))
  Assert-True ($missingArtifactChild.exitCode -ne 0) 'missing delivered artifact identity fails parameter binding'

  $bootstrapCommit = 'd' * 40
  $download = Invoke-SyntheticBootstrapFlow -AuthorizedCommit $bootstrapCommit -RequestedCommit $bootstrapCommit `
    -ExpectedArtifactSha256 $hash1 -RequestedArtifactSha256 $hash1 -DeliveryRoot (Join-Path $testRoot 'delivery-pass')
  Assert-True ((Get-FileHash -Algorithm SHA256 -LiteralPath $download.artifactPath).Hash.ToLowerInvariant() -ceq $hash1 -and
    -not $download.executionPerformed) 'synthetic bootstrap retrieves exact bytes without live execution'
  Assert-ThrowsCode {
    Invoke-SyntheticBootstrapFlow -AuthorizedCommit $bootstrapCommit -RequestedCommit ('e' * 40) `
      -ExpectedArtifactSha256 $hash1 -RequestedArtifactSha256 $hash1 -DeliveryRoot (Join-Path $testRoot 'delivery-wrong-commit')
  } 'PHASE7B_WP2B_STAGE0_BOOTSTRAP_COMMIT_FAIL' 'bootstrap rejects wrong commit'
  Assert-ThrowsCode {
    Invoke-SyntheticBootstrapFlow -AuthorizedCommit $bootstrapCommit -RequestedCommit $bootstrapCommit `
      -ExpectedArtifactSha256 $hash1 -RequestedArtifactSha256 ('f' * 64) -DeliveryRoot (Join-Path $testRoot 'delivery-wrong-hash')
  } 'PHASE7B_WP2B_STAGE0_BOOTSTRAP_EXPECTED_HASH_FAIL' 'bootstrap rejects wrong hash'
  $collisionRoot = Join-Path $testRoot 'delivery-collision'
  New-Item -ItemType Directory -Path $collisionRoot -ErrorAction Stop | Out-Null
  Assert-ThrowsCode {
    Invoke-SyntheticBootstrapFlow -AuthorizedCommit $bootstrapCommit -RequestedCommit $bootstrapCommit `
      -ExpectedArtifactSha256 $hash1 -RequestedArtifactSha256 $hash1 -DeliveryRoot $collisionRoot
  } 'PHASE7B_WP2B_STAGE0_BOOTSTRAP_DELIVERY_ROOT_PREEXISTS' 'bootstrap rejects preexisting delivery root'

  [ordered]@{
    classification = 'PHASE7B_WP2B_STAGE0_DELIVERY_TESTS_PASS'
    pass = $true
    assertions = $assertions
    artifactSha256 = $hash1
    liveExecutionPerformed = $false
    receiverOpened = $false
    productionQuiesced = $false
    automaticRetryAllowed = $false
    wp2cAuthorized = $false
  } | ConvertTo-Json -Compress
} finally {
  if (Test-Path -LiteralPath $testRoot) { Remove-Item -LiteralPath $testRoot -Recurse -Force }
}
