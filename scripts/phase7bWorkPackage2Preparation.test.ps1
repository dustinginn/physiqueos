$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Import-Module (Join-Path $PSScriptRoot "phase7bIsolatedGuestContract.psm1") -Force
Import-Module (Join-Path $PSScriptRoot "phase7bWorkPackage2OperatorLifecycle.psm1") -Force
Import-Module (Join-Path $PSScriptRoot "phase7bWorkPackage2Contract.psm1") -Force
Import-Module (Join-Path $PSScriptRoot "phase7bBoundedReplicaTransport.psm1") -Force
Import-Module (Join-Path $PSScriptRoot "phase7bWorkPackage2Contract.psm1") -Force
Import-Module (Join-Path $PSScriptRoot "phase7bIsolatedGuestContract.psm1") -Force
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$tmpRoot = (Resolve-Path (Join-Path $repositoryRoot ".tmp")).Path
$testRoot = Join-Path $tmpRoot "phase7b-wp2-tests-$([Guid]::NewGuid().ToString('N'))"
$script:assertions = 0

function Assert-True([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw "ASSERTION_FAILED:$Message" }
  $script:assertions++
}
function Assert-Throws([scriptblock]$Action, [string]$Pattern, [string]$Message) {
  $threw = $false
  try { & $Action } catch { $threw = $_.Exception.Message -match $Pattern }
  Assert-True $threw $Message
}
function Write-JsonNoBom([string]$Path, $Value) {
  [IO.File]::WriteAllText($Path, ($Value | ConvertTo-Json -Depth 12), (New-Object Text.UTF8Encoding($false)))
}
function New-Authorization([string]$Path, [string]$Stage, [string]$AttemptId, [string]$InventorySha, [string]$PacketSha, [string]$SourceRootSha = ('0' * 64), [string]$CapturePlanSha = ('0' * 64), [string]$LocalOutputRootSha = ('0' * 64), [string]$ReplicaRootSha = ('0' * 64), [bool]$WrongIdentity = $false) {
  $contract = Get-Phase7BWorkPackage2Contract
  $value = [ordered]@{
    schemaVersion = 1
    classification = $contract.authorizationClassification
    authorizedStages = if ($Stage -eq 'WP2C_MEDIA') {
      @(
        [ordered]@{ stage = 'WP2C_MEDIA'; mutationBudget = 1 },
        [ordered]@{ stage = 'WP2C_STAGE'; mutationBudget = 1 },
        [ordered]@{ stage = 'WP2C_RESTORE'; mutationBudget = 1 },
        [ordered]@{ stage = 'WP2C_VERIFY'; mutationBudget = 0 }
      )
    } else { @([ordered]@{ stage = $Stage; mutationBudget = 1 }) }
    attemptId = $AttemptId
    applicationCommit = if ($WrongIdentity) { '0' * 40 } else { $contract.applicationCommit }
    environmentId = $contract.environmentId
    vmDisplayName = $contract.vmDisplayName
    windowsHostId = $contract.windowsHostId
    manifestDigest = $contract.manifestDigest
    sourceInventorySha256 = $InventorySha
    sourceRootSha256 = $SourceRootSha
    capturePlanSha256 = $CapturePlanSha
    localOutputRootSha256 = $LocalOutputRootSha
    replicaRootSha256 = $ReplicaRootSha
    replicaClassification = 'OFF_MACHINE_OR_INDEPENDENT_STORAGE'
    packetSha256 = $PacketSha
    founderApproved = $true
    automaticRetryAllowed = $false
    issuedAt = [DateTime]::UtcNow.AddMinutes(-1).ToString('o')
    expiresAt = [DateTime]::UtcNow.AddHours(1).ToString('o')
  }
  Write-JsonNoBom $Path $value
  Get-Phase7BSha256 -LiteralPath $Path
}

try {
  New-Item -ItemType Directory -Path $testRoot | Out-Null
  $contract = Get-Phase7BWorkPackage2Contract
  Assert-True ($contract.applicationCommit -eq '379bb30391cfb7ed912e4757c77604e859b8a599') "accepted application identity"
  Assert-True ($contract.opticalVolumeLabel -eq 'P7B_WP2') "Joliet-safe WP2 media label"
  Assert-True (-not $contract.automaticRetryAllowed -and $contract.mutationBudget -eq 1) "one mutation and no automatic retry"

  $sourceRoot = Join-Path $testRoot 'source'
  New-Item -ItemType Directory -Path (Join-Path $sourceRoot 'canonical\media') -Force | Out-Null
  $collectionNames = @('user','goals','goalTransitionDrafts','goalProtocolTransitionDrafts','weightEntries','dexaScans','protocols','protocolVersions','energyStrategyLinks','executionItems','reminders','nutritionContext','operatingPlan','progressPhotos','dailyCheckIns','dailyBriefings','briefingReconciliationWorkItems','confidenceInitializationArtifacts','analyses','evidencePackages','evidenceReviews','canonicalEvidenceObjects','trainingPerformanceEvents','trainingPerformanceEventBatches','canonicalExerciseLibrary','piEnergyConfidenceWorkItems','piEnergyFinalizationReceipts','piTrainingConfidenceWorkItems','piTrainingFinalizationReceipts','piLowerLevelConfidenceWorkerRuns','migrationMarkers','goalConfidenceSnapshots','goalConfidenceHistory','goalConfidenceContinuitySeeds','phaseReviewDecisions','phaseReviewTransactions','phaseStrategies','phaseExpectedTrajectories','phaseLifecycleReadModels')
  $runtimeFixture = [ordered]@{ version = '1'; revision = 7; updatedAt = '2026-08-16T12:00:00.000Z' }
  foreach ($collectionName in $collectionNames) { $runtimeFixture[[string]$collectionName] = @() }
  $runtimeFixture.user = [ordered]@{ id = 'founder-fixture'; createdAt = '2026-01-01T00:00:00.000Z'; name = 'Fixture Founder' }
  Write-JsonNoBom (Join-Path $sourceRoot 'canonical\runtime.json') $runtimeFixture
  '{"schemaVersion":1,"authority":"windows"}' | Set-Content -LiteralPath (Join-Path $sourceRoot 'canonical\migration-control.json') -Encoding UTF8
  'fixture-media' | Set-Content -LiteralPath (Join-Path $sourceRoot 'canonical\media\one.bin') -Encoding ASCII
  $oneEntry = @([pscustomobject]@{ sourceRelativePath = 'canonical/runtime.json'; logicalPath = 'windows/canonical/runtime.json' })
  $one = New-Phase7BWorkPackage2Inventory -SourceRoot $sourceRoot -Entries $oneEntry
  Assert-True ($one.pass -and $one.fileCount -eq 1) "one-file inventory accepted"
  $twoEntries = @($oneEntry[0], [pscustomobject]@{ sourceRelativePath = 'canonical/media/one.bin'; logicalPath = 'windows/media/one.bin' })
  $two = New-Phase7BWorkPackage2Inventory -SourceRoot $sourceRoot -Entries $twoEntries
  Assert-True ($two.pass -and $two.fileCount -eq 2 -and $two.totalBytes -gt 0) "multi-file deterministic inventory accepted"
  $twoAgain = New-Phase7BWorkPackage2Inventory -SourceRoot $sourceRoot -Entries @($twoEntries[1], $twoEntries[0])
  Assert-True ($two.inventorySha256 -eq $twoAgain.inventorySha256) "inventory digest independent of input order"
  Assert-Throws { New-Phase7BWorkPackage2Inventory -SourceRoot $sourceRoot -Entries @() } 'PHASE7B_WP2_EMPTY_INVENTORY' "zero files rejected"
  Assert-Throws { New-Phase7BWorkPackage2Inventory -SourceRoot $sourceRoot -Entries @($oneEntry[0], $oneEntry[0]) } 'PHASE7B_WP2_DUPLICATE_LOGICAL_PATH' "duplicate logical file rejected"
  Assert-Throws { New-Phase7BWorkPackage2Inventory -SourceRoot $sourceRoot -Entries @([pscustomobject]@{ sourceRelativePath = '../outside'; logicalPath = 'windows/outside' }) } 'PHASE7B_WP2_UNSAFE_INVENTORY_PATH' "source traversal rejected"
  Assert-True (-not (Test-Phase7BWorkPackage2RelativePath -RelativePath '.env.production').pass) "environment file rejected"
  Assert-True (-not (Test-Phase7BWorkPackage2RelativePath -RelativePath 'node_modules/x.js').pass) "cache/dependency path rejected"
  Assert-True (-not (Test-Phase7BWorkPackage2RelativePath -RelativePath (('a' * 181) + '.json')).pass) "overlong packet path rejected before mutation"

  ('dop_' + 'v1_' + 'fixturecredentialmaterial1234567890') | Set-Content -LiteralPath (Join-Path $sourceRoot 'canonical\token.txt') -Encoding ASCII
  Assert-Throws { New-Phase7BWorkPackage2Inventory -SourceRoot $sourceRoot -Entries @([pscustomobject]@{ sourceRelativePath = 'canonical/token.txt'; logicalPath = 'windows/token.txt' }) } 'PHASE7B_WP2_CREDENTIAL_SIGNAL_REJECTED' "strong credential signal rejected"

  $attemptId = "phase7b-wp2-$([Guid]::NewGuid().ToString('N'))"
  $sourceRootSha = Get-Phase7BSha256 -Text ((Resolve-Path $sourceRoot).Path.TrimEnd('\').ToLowerInvariant())
  $selection = [ordered]@{ schemaVersion = 1; classification = 'PHASE7B_WP2_WINDOWS_SELECTION'; applicationCommit = $contract.applicationCommit; environmentId = $contract.environmentId; vmDisplayName = $contract.vmDisplayName; manifestDigest = $contract.manifestDigest; selections = @([ordered]@{ category = 'canonical-runtime'; sourceRelativePath = 'canonical/runtime.json'; recursive = $false }, [ordered]@{ category = 'migration-control'; sourceRelativePath = 'canonical/migration-control.json'; recursive = $false }, [ordered]@{ category = 'canonical-media'; sourceRelativePath = 'canonical/media'; recursive = $true }) }
  $selectionPath = Join-Path $testRoot 'selection.json'
  Write-JsonNoBom $selectionPath $selection
  $selectionHash = Get-Phase7BSha256 -LiteralPath $selectionPath
  $inventoryAuthPath = Join-Path $testRoot 'inventory-authorization.json'
  $inventoryAuthHash = New-Authorization -Path $inventoryAuthPath -Stage 'WP2B_INVENTORY' -AttemptId $attemptId -InventorySha ('0' * 64) -PacketSha ('0' * 64) -SourceRootSha $sourceRootSha -CapturePlanSha $selectionHash
  $plannedCapturePath = Join-Path $testRoot 'planned-capture.json'
  $planOutput = @(& (Join-Path $PSScriptRoot 'phase7bPlanWorkPackage2Capture.ps1') -AttemptId $attemptId -AuthorizationPath $inventoryAuthPath -ExpectedAuthorizationSha256 $inventoryAuthHash -SourceRoot $sourceRoot -SelectionPath $selectionPath -ExpectedSelectionSha256 $selectionHash -OutputPath $plannedCapturePath) -join [Environment]::NewLine | ConvertFrom-Json
  Assert-True ($planOutput.pass -and $planOutput.fileCount -eq 3 -and -not $planOutput.sourceMutationPerformed) "bounded three-category production inventory plan fixture:$($planOutput | ConvertTo-Json -Compress)"
  Assert-True (@($planOutput.PSObject.Properties.Name | Where-Object { $_ -match '(?i)Path$|sourceRoot$' }).Count -eq 0) "inventory safe projection excludes raw paths"
  $persistedPlan = Get-Content -LiteralPath $plannedCapturePath -Raw | ConvertFrom-Json
  Assert-True ($persistedPlan.files.Count -eq 3) "capture plan persists exact enumerated file set"
  Assert-True ((@($persistedPlan.files.sourceRelativePath | Sort-Object) -join '|') -eq 'canonical/media/one.bin|canonical/migration-control.json|canonical/runtime.json') "capture plan source-relative paths are exact"
  $authPath = Join-Path $testRoot 'capture-authorization.json'
  $authHash = New-Authorization -Path $authPath -Stage 'WP2B_CAPTURE' -AttemptId $attemptId -InventorySha $two.inventorySha256 -PacketSha ('0' * 64) -SourceRootSha $sourceRootSha
  $auth = Assert-Phase7BWorkPackage2Authorization -LiteralPath $authPath -ExpectedSha256 $authHash -ExpectedStage 'WP2B_CAPTURE' -ExpectedAttemptId $attemptId -ExpectedSourceInventorySha256 $two.inventorySha256 -ExpectedSourceRootSha256 $sourceRootSha
  Assert-True ([bool]$auth.founderApproved) "exact stage authorization accepted"
  Assert-Throws { Assert-Phase7BWorkPackage2Authorization -LiteralPath $authPath -ExpectedSha256 $authHash -ExpectedStage 'WP2C_STAGE' -ExpectedAttemptId $attemptId } 'PHASE7B_WP2_AUTHORIZATION_BINDING_MISMATCH' "wrong stage rejected"
  $wrongAuthPath = Join-Path $testRoot 'wrong-authorization.json'
  $wrongAuthHash = New-Authorization -Path $wrongAuthPath -Stage 'WP2B_CAPTURE' -AttemptId $attemptId -InventorySha $two.inventorySha256 -PacketSha ('0' * 64) -WrongIdentity $true
  Assert-Throws { Assert-Phase7BWorkPackage2Authorization -LiteralPath $wrongAuthPath -ExpectedSha256 $wrongAuthHash -ExpectedStage 'WP2B_CAPTURE' -ExpectedAttemptId $attemptId } 'PHASE7B_WP2_AUTHORIZATION_BINDING_MISMATCH' "wrong application identity rejected"

  $capturePlanPath = $plannedCapturePath
  $capturePlanHash = $planOutput.capturePlanSha256
  $fakeAge = Join-Path $testRoot 'fixture-age.cmd'
  @'
@echo off
if "%~1"=="--version" (
  echo age v1.3.1
  exit /b 0
)
powershell.exe -NoProfile -NonInteractive -Command "[IO.File]::WriteAllBytes('%~3',[Text.Encoding]::ASCII.GetBytes('age-encryption.org/v1`nsynthetic-fixture-ciphertext'))"
exit /b %ERRORLEVEL%
'@ | Set-Content -LiteralPath $fakeAge -Encoding ASCII
  $fakeAgeHash = Get-Phase7BSha256 -LiteralPath $fakeAge
  $localOutput = Join-Path $testRoot 'local-encrypted'
  $replicaOutput = Join-Path $testRoot $attemptId
  New-Item -ItemType Directory -Path @($localOutput, $replicaOutput) | Out-Null
  $capturedPacket = Join-Path $localOutput "$attemptId.zip.age"
  [IO.File]::WriteAllBytes($capturedPacket, [Text.Encoding]::ASCII.GetBytes("age-encryption.org/v1`nsynthetic-ciphertext"))
  $packetSha = Get-Phase7BSha256 -LiteralPath $capturedPacket; $packetBytes = [int64](Get-Item $capturedPacket).Length
  $capturedReplica = Join-Path $replicaOutput "$attemptId.zip.age"
  $copyResult = Copy-Phase7BBoundedEncryptedReplica -SourcePath $capturedPacket -DestinationPath $capturedReplica -ExpectedSha256 $packetSha -ExpectedBytes $packetBytes
  Assert-True ($copyResult.pass -and (Split-Path -Parent $capturedReplica) -eq $replicaOutput) "synthetic exact-attempt-root capture/copy avoids duplicate attempt nesting"
  Assert-True (Test-Phase7BPacketReplica -LocalPacketPath $capturedPacket -ReplicaPacketPath $capturedReplica -ExpectedSha256 $packetSha).pass "synthetic capture readback verifies both encrypted copies"
  $finalTooling='a'*40;$finalInvocation='6'*64;$finalStage3='7'*64;$finalAuthorizationId='phase7b-wp2b-capture-auth-'+('e'*32);$finalQuiescence='b'*64
  $finalLocalSha=Get-Phase7BSha256 -Text ([IO.Path]::GetFullPath($localOutput).TrimEnd('\').ToLowerInvariant());$finalReplicaSha='c'*64
  $finalAuthorization=New-Phase7BWorkPackage2CaptureAuthorizationDocument -AuthorizationId $finalAuthorizationId -AttemptId $attemptId -ToolingCommit $finalTooling -InvocationContractSha256 $finalInvocation -Stage3LauncherSha256 $finalStage3 -CapturePlanSha256 $capturePlanHash -CapturePlanFileName "$attemptId-capture-plan.json" -InventorySha256 $two.inventorySha256 -SelectionSha256 $selectionHash -SelectionFileName "$attemptId-selection.json" -SourceRootSha256 $sourceRootSha -RuntimeRevision 1 -RuntimeSha256 ('d'*64) -AgeExePathSha256 ('e'*64) -AgeExeSha256 $fakeAgeHash -LocalOutputRootSha256 $finalLocalSha -ReplicaRootSha256 $finalReplicaSha -ReplicaUncRoot "\\LAPTOP-4G5UOU2R\P7B$($attemptId.Substring($attemptId.Length-8))`$" -QuiescenceEvidenceSha256 $finalQuiescence -QuiescenceEvidenceFileName "phase7b-wp2b-quiescence-$('f'*32).json" -QuiescenceEvidenceToolingCommit $finalTooling -ConsumptionMarkerFileName "$finalAuthorizationId.used.json" -IssuedAt ([DateTime]::UtcNow.AddMinutes(-1)) -ExpiresAt ([DateTime]::UtcNow.AddHours(1))
  $finalAuthorizationPath=Join-Path $testRoot 'final-capture-authorization.json';Write-JsonNoBom $finalAuthorizationPath $finalAuthorization;$finalAuthorizationSha=Get-Phase7BSha256 -LiteralPath $finalAuthorizationPath
  $plainSha='f'*64;$plainBytes=[int64]2048
  $pendingDescriptorPath = Join-Path $localOutput "$attemptId-pending-descriptor.json"
  Write-JsonNoBom $pendingDescriptorPath ([ordered]@{ schemaVersion = 1; classification = 'PHASE7B_WP2_ENCRYPTED_PACKET_REPLICA_COPY_PENDING_INDEPENDENT_READBACK'; attemptId = $attemptId; invocationContractSha256=$finalInvocation;stage3LauncherSha256=$finalStage3;securePassphraseBridgeRequired=$true;decryptRoundTripRequired=$true; packetFileName = "$attemptId.zip.age"; packetSha256 = $packetSha; packetBytes = $packetBytes; localEncryptedCopyPass = $true; independentEncryptedReplicaPass = $false; plaintextZipSha256=$plainSha;plaintextZipBytes=$plainBytes;decryptedStreamSha256=$plainSha;decryptedStreamBytes=$plainBytes;decryptRoundTripPass=$true;captureAuthorizationId=$finalAuthorizationId;captureAuthorizationSha256=$finalAuthorizationSha;captureAuthorizationToolingCommit=$finalTooling;sourceInventorySha256=$two.inventorySha256;sourceRootSha256=$sourceRootSha;capturePlanSha256=$capturePlanHash;localOutputRootSha256=$finalLocalSha;replicaRootSha256=$finalReplicaSha;ageExeSha256=$fakeAgeHash;quiescenceEvidenceSha256=$finalQuiescence; automaticRetryAllowed = $false })
  $receiptFileName = "$attemptId-replica-receipt-$('a' * 32).json"; $receiptPath = Join-Path $testRoot $receiptFileName
  $receipt = [ordered]@{ schemaVersion = 1; classification = 'PHASE7B_WP2_BOUNDED_REPLICA_INDEPENDENT_READBACK_PASS'; pass = $true; attemptId = $attemptId; evidenceNonce = ('a' * 32); evidenceFileName = $receiptFileName; observedAt = [DateTime]::UtcNow.ToString('o'); packetFileName = "$attemptId.zip.age"; packetSha256 = $packetSha; packetBytes = $packetBytes; destinationBytesReread = $true; encryptedPacketOnly = $true; computerName = 'LAPTOP-4G5UOU2R'; hostIdentitySha256 = 'ea6696e8a0fc4d9242544568d62cd979fd57bd2478fac4f40755b3546776ac3c'; diskIdentitySha256 = '336d31be1f1e6dd4bde254fae94ffebf2b23829520a26c2f5d9bc5deda169896'; driveRoot = 'D:\'; fileSystem = 'NTFS'; diskNumber = 0; busType = 'SATA'; physicallyIndependent = $true; freeBytes = [int64]10GB; persistentAccountCreated = $false; persistentShareRetained = $false; persistentFirewallRuleRetained = $false; persistentMappingRetained = $false; credentialsPersisted = $false; rawProductionFilesAccepted = $false; sessionTornDown = $true; reportPersisted = $true; automaticRetryAllowed = $false }
  Write-JsonNoBom $receiptPath $receipt
  $primaryTeardownFileName = "$attemptId-primary-teardown-$('b' * 32).json"; $primaryTeardownPath = Join-Path $testRoot $primaryTeardownFileName; $shareName = "P7B$($attemptId.Substring($attemptId.Length - 8))`$"
  Write-JsonNoBom $primaryTeardownPath ([ordered]@{ schemaVersion = 1; classification = 'PHASE7B_WP2_PRIMARY_REPLICA_SESSION_TEARDOWN_PASS'; pass = $true; attemptId = $attemptId; evidenceNonce = ('b' * 32); evidenceFileName = $primaryTeardownFileName; observedAt = [DateTime]::UtcNow.ToString('o'); serverName = 'LAPTOP-4G5UOU2R'; shareName = $shareName; matchingPsDriveCount = 0; matchingSmbMappingCount = 0; savedCredentialTargetCount = 0; mappingPersistent = $false; credentialsPersisted = $false; sessionTornDown = $true; mutationPerformed = $false; reportPersisted = $true; automaticRetryAllowed = $false })
  $acceptedDescriptorPath = Join-Path $localOutput "$attemptId-descriptor.json"
  $finalizeOutput = @(& (Join-Path $PSScriptRoot 'phase7bFinalizeBoundedReplicaDescriptor.ps1') -AttemptId $attemptId -ExpectedInvocationContractSha256 $finalInvocation -ExpectedStage3LauncherSha256 $finalStage3 -PendingDescriptorPath $pendingDescriptorPath -ExpectedPendingDescriptorSha256 (Get-Phase7BSha256 -LiteralPath $pendingDescriptorPath) -ReplicaReceiptPath $receiptPath -ExpectedReplicaReceiptSha256 (Get-Phase7BSha256 -LiteralPath $receiptPath) -PrimaryTeardownEvidencePath $primaryTeardownPath -ExpectedPrimaryTeardownEvidenceSha256 (Get-Phase7BSha256 -LiteralPath $primaryTeardownPath) -CaptureAuthorizationPath $finalAuthorizationPath -ExpectedCaptureAuthorizationSha256 $finalAuthorizationSha -ExpectedToolingCommit $finalTooling -AuthorizationAcknowledgement 'WP2B_CAPTURE_FINALIZE_INDEPENDENT_REPLICA_EXACTLY_ONCE' -OutputPath $acceptedDescriptorPath) -join [Environment]::NewLine | ConvertFrom-Json
  Assert-True ($finalizeOutput.pass -and $finalizeOutput.independentEncryptedReplicaPass -and $finalizeOutput.sessionTornDown) "laptop-local receipt finalizes independent replica acceptance"
  $receiptResumeOutput = @(& (Join-Path $PSScriptRoot 'phase7bImportBoundedReplicaReceipt.ps1') -AttemptId $attemptId -ExpectedEvidenceNonce ('a' * 32) -ExpectedEvidenceSha256 (Get-Phase7BSha256 -LiteralPath $receiptPath) -ExpectedPacketSha256 $packetSha -ExpectedPacketBytes $packetBytes -OutputPath $receiptPath -AuthorizationAcknowledgement 'WP2B_CAPTURE_IMPORT_SAFE_REPLICA_RECEIPT_EXACTLY_ONCE' -ExactExistingReceiptResumeAcknowledgement 'WP2B_CAPTURE_RESUME_EXACT_EXISTING_SAFE_RECEIPT_READ_ONLY') -join [Environment]::NewLine | ConvertFrom-Json
  Assert-True ($receiptResumeOutput.pass -and $receiptResumeOutput.exactExistingReceiptReused -and -not $receiptResumeOutput.mutationPerformed) "existing exact receipt is restart-safe and reused read-only: $($receiptResumeOutput | ConvertTo-Json -Compress)"
  $finalizeResumeOutput = @(& (Join-Path $PSScriptRoot 'phase7bFinalizeBoundedReplicaDescriptor.ps1') -AttemptId $attemptId -ExpectedInvocationContractSha256 $finalInvocation -ExpectedStage3LauncherSha256 $finalStage3 -PendingDescriptorPath $pendingDescriptorPath -ExpectedPendingDescriptorSha256 (Get-Phase7BSha256 -LiteralPath $pendingDescriptorPath) -ReplicaReceiptPath $receiptPath -ExpectedReplicaReceiptSha256 (Get-Phase7BSha256 -LiteralPath $receiptPath) -PrimaryTeardownEvidencePath $primaryTeardownPath -ExpectedPrimaryTeardownEvidenceSha256 (Get-Phase7BSha256 -LiteralPath $primaryTeardownPath) -CaptureAuthorizationPath $finalAuthorizationPath -ExpectedCaptureAuthorizationSha256 $finalAuthorizationSha -ExpectedToolingCommit $finalTooling -AuthorizationAcknowledgement 'WP2B_CAPTURE_FINALIZE_INDEPENDENT_REPLICA_EXACTLY_ONCE' -OutputPath $acceptedDescriptorPath -ExactExistingDescriptorResumeAcknowledgement 'WP2B_CAPTURE_RESUME_EXACT_EXISTING_FINAL_DESCRIPTOR_READ_ONLY') -join [Environment]::NewLine | ConvertFrom-Json
  Assert-True (-not $finalizeResumeOutput.pass -and [string]$finalizeResumeOutput.safeErrorCode -match 'ALREADY_USED') "consumed finalization cannot be retried automatically"

  $referenceUnsigned = [ordered]@{ schemaVersion = 1; referenceIndexVersion = 'phase7b-wp2-reference-index-v1'; classification = 'PHASE7B_WP2_REFERENCE_INDEX'; observedAt = '2026-08-23T17:55:22.000Z'; applicationCommit = $contract.applicationCommit; schemaIdentity = [ordered]@{ version = '000011'; migrationCount = 11; sha256 = 'a' * 64 }; source = [ordered]@{ runtimeVersion = '1'; runtimeRevision = '7'; runtimeUpdatedAt = '2026-08-16T12:00:00.000Z'; runtimeSha256 = 'b' * 64; controlStateSha256 = 'c' * 64 }; collectionContractVersion = 'founder-canonical-collections-v2'; collectionCount = 39; recordCount = 0; collections = @($collectionNames | ForEach-Object { [ordered]@{ name = $_; count = 0; records = @() } }); relationshipCount = 0; relationships = @(); mediaCount = 0; media = @(); founderCutoffPolicy = [ordered]@{ founderMeaningfulDataThrough = '2026-08-16'; founderDowntimeBegan = '2026-08-17'; postCutoffAcceptance = 'NON_BLOCKING_ONLY_WHEN_SOURCE_PROVEN_SYSTEM_GENERATED'; destructiveFilteringPerformed = $false; provenanceInferred = $false } }
  $referenceSemanticSha = Get-Phase7BSha256 -Text (ConvertTo-Phase7BCanonicalJson $referenceUnsigned)
  $referenceDocument = [ordered]@{}; foreach ($key in $referenceUnsigned.Keys) { $referenceDocument[$key] = $referenceUnsigned[$key] }; $referenceDocument.referenceIndexSha256 = $referenceSemanticSha
  $referenceFixturePath = Join-Path $testRoot 'reference-index.json'; [IO.File]::WriteAllText($referenceFixturePath, (ConvertTo-Phase7BCanonicalJson $referenceDocument), (New-Object Text.UTF8Encoding($false)))
  $referenceFilePass = Test-Phase7BWorkPackage2ReferenceIndexFile -LiteralPath $referenceFixturePath -ExpectedFileSha256 (Get-Phase7BSha256 -LiteralPath $referenceFixturePath) -ExpectedSemanticSha256 $referenceSemanticSha -ExpectedBytes (Get-Item $referenceFixturePath).Length
  Assert-True ($referenceFilePass.pass -and $referenceFilePass.collectionCount -eq 39) "restored reference-index file/digest/cutoff contract accepted"
  Assert-True (-not (Test-Phase7BWorkPackage2ReferenceIndexFile -LiteralPath $referenceFixturePath -ExpectedFileSha256 ('f' * 64) -ExpectedSemanticSha256 $referenceSemanticSha -ExpectedBytes (Get-Item $referenceFixturePath).Length).pass) "restored reference-index file hash mismatch rejected"
  $nodeReferenceRoot = Join-Path $testRoot 'node-reference-staging'; New-Item -ItemType Directory -Path @((Join-Path $nodeReferenceRoot 'windows\canonical'),(Join-Path $nodeReferenceRoot 'windows\control'),(Join-Path $nodeReferenceRoot 'windows\media')) -Force | Out-Null
  $nodeRuntime = $runtimeFixture | ConvertTo-Json -Depth 100 | ConvertFrom-Json
  $nodeRuntime.analyses = @([pscustomobject]@{ id = 'training|authoritative|IMG_1919.png'; evidenceIds = @('nutrition2026-07-25_breakfast_0_IMG_1641.jpeg'); sourceFileId = 'historical-source.pdf'; mediaPath = 'private/founder/photos/required-photo.jpg' })
  Write-JsonNoBom (Join-Path $nodeReferenceRoot 'windows\canonical\runtime.json') $nodeRuntime
  Copy-Item (Join-Path $sourceRoot 'canonical\migration-control.json') (Join-Path $nodeReferenceRoot 'windows\control\migration-control.json'); Copy-Item (Join-Path $sourceRoot 'canonical\media\one.bin') (Join-Path $nodeReferenceRoot 'windows\media\one.bin')
  'required-media' | Set-Content -LiteralPath (Join-Path $nodeReferenceRoot 'windows\media\required-photo.jpg') -Encoding ASCII
  $nodeReferenceFiles = @(); foreach ($logicalPath in @('windows/canonical/runtime.json','windows/control/migration-control.json','windows/media/one.bin','windows/media/required-photo.jpg')) { $physicalPath = Join-Path $nodeReferenceRoot $logicalPath.Replace('/','\'); $sourceRelativePath = if ($logicalPath -eq 'windows/media/required-photo.jpg') { 'private/founder/photos/required-photo.jpg' } else { $logicalPath.Replace('windows/','canonical/') }; $nodeReferenceFiles += [ordered]@{ sourceRelativePath = $sourceRelativePath; logicalPath = $logicalPath; bytes = (Get-Item $physicalPath).Length; sha256 = Get-Phase7BSha256 -LiteralPath $physicalPath } }
  $nodeReferenceInputPath = Join-Path $nodeReferenceRoot '.input.json'; Write-JsonNoBom $nodeReferenceInputPath ([ordered]@{ observedAt = '2026-08-23T17:55:22.000Z'; applicationCommit = $contract.applicationCommit; files = $nodeReferenceFiles; missingReferencedMedia = @() })
  $nodeReferencePath = Join-Path $nodeReferenceRoot 'reference-index.json'; $nodeReferenceOutput = @(& node.exe --no-warnings (Join-Path $PSScriptRoot 'phase7bBuildWorkPackage2ReferenceIndex.mjs') $nodeReferenceInputPath $nodeReferenceRoot $nodeReferencePath) -join [Environment]::NewLine | ConvertFrom-Json
  Assert-True ($nodeReferenceOutput.pass -and $nodeReferenceOutput.collectionCount -eq 39) "Node reference builder accepts exact synthetic staged sources"
  $builtNodeReference = Get-Content -LiteralPath $nodeReferencePath -Raw | ConvertFrom-Json
  Assert-True ($builtNodeReference.mediaCount -eq 2 -and $builtNodeReference.relationshipCount -ge 1) "Node reference builder ignores file-shaped canonical IDs and historical labels while binding present required media"
  $crossRuntimeReference = Test-Phase7BWorkPackage2ReferenceIndexFile -LiteralPath $nodeReferencePath -ExpectedFileSha256 (Get-Phase7BSha256 -LiteralPath $nodeReferencePath) -ExpectedSemanticSha256 $nodeReferenceOutput.referenceIndexSha256 -ExpectedBytes (Get-Item $nodeReferencePath).Length
  Assert-True $crossRuntimeReference.pass "PowerShell 5.1 restore verifier accepts Node canonical reference digest"
  $missingReferenceRoot = Join-Path $testRoot 'node-reference-missing'; New-Item -ItemType Directory -Path @((Join-Path $missingReferenceRoot 'windows\canonical'),(Join-Path $missingReferenceRoot 'windows\control'),(Join-Path $missingReferenceRoot 'windows\media')) -Force | Out-Null
  Copy-Item (Join-Path $nodeReferenceRoot 'windows\canonical\runtime.json') (Join-Path $missingReferenceRoot 'windows\canonical\runtime.json'); Copy-Item (Join-Path $nodeReferenceRoot 'windows\control\migration-control.json') (Join-Path $missingReferenceRoot 'windows\control\migration-control.json')
  $missingReferenceFiles = @(); foreach ($logicalPath in @('windows/canonical/runtime.json','windows/control/migration-control.json')) { $physicalPath = Join-Path $missingReferenceRoot $logicalPath.Replace('/','\'); $missingReferenceFiles += [ordered]@{ sourceRelativePath = $logicalPath.Replace('windows/','canonical/'); logicalPath = $logicalPath; bytes = (Get-Item $physicalPath).Length; sha256 = Get-Phase7BSha256 -LiteralPath $physicalPath } }
  $missingReferenceInputPath = Join-Path $missingReferenceRoot '.input.json'; Write-JsonNoBom $missingReferenceInputPath ([ordered]@{ observedAt = '2026-08-23T17:55:22.000Z'; applicationCommit = $contract.applicationCommit; files = $missingReferenceFiles; missingReferencedMedia = @() })
  $missingReferenceOutputPath = Join-Path $missingReferenceRoot 'reference-index.json'; $missingReferenceOutput = @(& node.exe --no-warnings (Join-Path $PSScriptRoot 'phase7bBuildWorkPackage2ReferenceIndex.mjs') $missingReferenceInputPath $missingReferenceRoot $missingReferenceOutputPath) -join [Environment]::NewLine | ConvertFrom-Json
  Assert-True (-not $missingReferenceOutput.pass -and $missingReferenceOutput.safeErrorCode -eq 'PHASE7B_WP2_REFERENCE_INDEX_MISSING_REFERENCED_MEDIA' -and -not (Test-Path -LiteralPath $missingReferenceOutputPath)) "Node reference builder still rejects genuinely absent required media"

  $staging = Join-Path $testRoot 'staging'
  New-Item -ItemType Directory -Path @((Join-Path $staging 'windows\canonical'), (Join-Path $staging 'windows\media')) -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $sourceRoot 'canonical\runtime.json') -Destination (Join-Path $staging 'windows\canonical\runtime.json')
  Copy-Item -LiteralPath (Join-Path $sourceRoot 'canonical\media\one.bin') -Destination (Join-Path $staging 'windows\media\one.bin')
  $manifest = [ordered]@{ schemaVersion = 1; classification = 'PHASE7B_WP2_DECRYPTED_PACKET_MANIFEST'; attemptId = $attemptId; applicationCommit = $contract.applicationCommit; environmentId = $contract.environmentId; vmDisplayName = $contract.vmDisplayName; windowsHostId = $contract.windowsHostId; manifestDigest = $contract.manifestDigest; sourceInventorySha256 = $two.inventorySha256; fileCount = $two.fileCount; totalBytes = $two.totalBytes; files = @($two.files | ForEach-Object { [ordered]@{ logicalPath = $_.logicalPath; bytes = $_.bytes; sha256 = $_.sha256 } }) }
  $manifestPath = Join-Path $testRoot 'packet-manifest.json'
  [IO.File]::WriteAllText($manifestPath, (ConvertTo-Phase7BCanonicalJson $manifest), (New-Object Text.UTF8Encoding($false)))
  $zipFiles = @($two.files | ForEach-Object { [pscustomobject]@{ logicalPath = $_.logicalPath } })
  $zipOne = Join-Path $testRoot 'packet-one.zip'
  $zipTwo = Join-Path $testRoot 'packet-two.zip'
  $zipResultOne = New-Phase7BDeterministicPacketZip -SourceRoot $staging -Files $zipFiles -ManifestPath $manifestPath -OutputPath $zipOne
  $zipResultTwo = New-Phase7BDeterministicPacketZip -SourceRoot $staging -Files $zipFiles -ManifestPath $manifestPath -OutputPath $zipTwo
  Assert-True ($zipResultOne.sha256 -eq $zipResultTwo.sha256) "deterministic packet bytes"
  $expanded = Join-Path $testRoot 'expanded'
  $expandResult = Expand-Phase7BSafePacketZip -LiteralPath $zipOne -DestinationRoot $expanded
  Assert-True ($expandResult.pass -and (Get-Phase7BSha256 -LiteralPath (Join-Path $expanded 'windows\canonical\runtime.json')) -eq $two.files[0].sha256) "safe extraction preserves digests"
  Assert-Throws { Expand-Phase7BSafePacketZip -LiteralPath $zipOne -DestinationRoot $expanded } 'PHASE7B_WP2_RESTORE_DESTINATION_EXISTS' "dirty destination rejected"

  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $badZip = Join-Path $testRoot 'traversal.zip'
  $badArchive = [IO.Compression.ZipFile]::Open($badZip, [IO.Compression.ZipArchiveMode]::Create)
  try { [void]$badArchive.CreateEntry('../escape.txt') } finally { $badArchive.Dispose() }
  Assert-Throws { Expand-Phase7BSafePacketZip -LiteralPath $badZip -DestinationRoot (Join-Path $testRoot 'bad-expanded') } 'PHASE7B_WP2_UNSAFE_ZIP_ENTRY' "zip traversal rejected"

  $plain = Join-Path $testRoot 'plain.zip.age'
  'plain text' | Set-Content -LiteralPath $plain -Encoding ASCII
  $plainCheck = Test-Phase7BEncryptedPacket -LiteralPath $plain -ExpectedSha256 (Get-Phase7BSha256 -LiteralPath $plain)
  Assert-True (-not $plainCheck.pass -and $plainCheck.classification -eq 'PHASE7B_WP2_PLAINTEXT_OR_UNKNOWN_PACKET_REJECTED') "plaintext packet rejected"
  $encrypted = Join-Path $testRoot "$attemptId.zip.age"
  [IO.File]::WriteAllBytes($encrypted, [Text.Encoding]::ASCII.GetBytes("age-encryption.org/v1`nfixture-ciphertext"))
  $packetSha = Get-Phase7BSha256 -LiteralPath $encrypted
  Assert-True (Test-Phase7BEncryptedPacket -LiteralPath $encrypted -ExpectedSha256 $packetSha).pass "age-framed encrypted fixture accepted"
  Assert-True (-not (Test-Phase7BEncryptedPacket -LiteralPath $encrypted -ExpectedSha256 ('f' * 64)).pass) "packet digest mismatch rejected"
  $replica = Join-Path $testRoot 'replica.zip.age'
  Copy-Item -LiteralPath $encrypted -Destination $replica
  Assert-True (Test-Phase7BPacketReplica -LocalPacketPath $encrypted -ReplicaPacketPath $replica -ExpectedSha256 $packetSha).pass "exact independent replica accepted"
  Assert-Throws { Test-Phase7BPacketReplica -LocalPacketPath $encrypted -ReplicaPacketPath (Join-Path $testRoot 'missing.age') -ExpectedSha256 $packetSha } 'PHASE7B_WP2_PACKET_NOT_FOUND' "missing replica rejected"
  Assert-True (Test-Phase7BWorkPackage2MediaFileSet -FileNames @((Split-Path -Leaf $encrypted), 'phase7b-wp2-packet-descriptor.json', 'age.exe') -PacketFileName (Split-Path -Leaf $encrypted)).pass "exact packet/descriptor/age media set accepted"
  Assert-True (-not (Test-Phase7BWorkPackage2MediaFileSet -FileNames @() -PacketFileName (Split-Path -Leaf $encrypted)).pass) "zero-file media rejected"
  Assert-True (-not (Test-Phase7BWorkPackage2MediaFileSet -FileNames @((Split-Path -Leaf $encrypted)) -PacketFileName (Split-Path -Leaf $encrypted)).pass) "missing descriptor media rejected"
  Assert-True (-not (Test-Phase7BWorkPackage2MediaFileSet -FileNames @((Split-Path -Leaf $encrypted), 'phase7b-wp2-packet-descriptor.json', 'age.exe', 'unexpected.txt') -PacketFileName (Split-Path -Leaf $encrypted)).pass) "unexpected media file rejected"
  Assert-True (-not (Test-Phase7BWorkPackage2MediaFileSet -FileNames @((Split-Path -Leaf $encrypted), (Split-Path -Leaf $encrypted)) -PacketFileName (Split-Path -Leaf $encrypted)).pass) "duplicate media file rejected"
  Assert-True (Test-Phase7BWorkPackage2StagingFileSet -RelativeFileNames @() -PacketFileName (Split-Path -Leaf $encrypted) -AttemptId $attemptId -ExpectedState Empty).pass "empty incoming staging state accepted before mutation"
  Assert-True (-not (Test-Phase7BWorkPackage2StagingFileSet -RelativeFileNames @((Split-Path -Leaf $encrypted)) -PacketFileName (Split-Path -Leaf $encrypted) -AttemptId $attemptId -ExpectedState Complete).pass) "one-file partial staging rejected"
  Assert-True (Test-Phase7BWorkPackage2StagingFileSet -RelativeFileNames @((Split-Path -Leaf $encrypted), "$attemptId-descriptor.json", "$attemptId-age.exe") -PacketFileName (Split-Path -Leaf $encrypted) -AttemptId $attemptId -ExpectedState Complete).pass "exact staged packet, descriptor, and age binary accepted"
  Assert-True (-not (Test-Phase7BWorkPackage2StagingFileSet -RelativeFileNames @((Split-Path -Leaf $encrypted), "$attemptId-descriptor.json", "$attemptId-age.exe", 'unexpected.bin') -PacketFileName (Split-Path -Leaf $encrypted) -AttemptId $attemptId -ExpectedState Complete).pass) "unexpected staged file rejected"

  $validEvidence = Test-Phase7BWorkPackage2RestoreEvidence -ManifestPass $true -FileDigestsPass $true -GuestIdentityPass $true -TaskSetPass $true -StoppedControlsPass $true -CredentialScanPass $true -RuntimeListenerCount 0 -PhysiqueOsProcessCount 0 -MappedHgfsDiskCount 0 -MappedHgfsConnectionCount 0 -EnabledTaskCount 0
  Assert-True $validEvidence.pass "complete inert restore evidence accepted"
  Assert-True (-not (Test-Phase7BWorkPackage2RestoreEvidence -ManifestPass $true -FileDigestsPass $true -GuestIdentityPass $true -TaskSetPass $true -StoppedControlsPass $true -CredentialScanPass $true -RuntimeListenerCount 1 -PhysiqueOsProcessCount 0 -MappedHgfsDiskCount 0 -MappedHgfsConnectionCount 0 -EnabledTaskCount 0).pass) "runtime listener rejected"
  Assert-True (-not (Test-Phase7BWorkPackage2RestoreEvidence -ManifestPass $true -FileDigestsPass $true -GuestIdentityPass $true -TaskSetPass $true -StoppedControlsPass $true -CredentialScanPass $true -RuntimeListenerCount 0 -PhysiqueOsProcessCount 0 -MappedHgfsDiskCount 1 -MappedHgfsConnectionCount 0 -EnabledTaskCount 0).pass) "mapped HGFS disk rejected"
  Assert-True (-not (Test-Phase7BWorkPackage2RestoreEvidence -ManifestPass $true -FileDigestsPass $true -GuestIdentityPass $true -TaskSetPass $true -StoppedControlsPass $true -CredentialScanPass $true -RuntimeListenerCount 0 -PhysiqueOsProcessCount 0 -MappedHgfsDiskCount 0 -MappedHgfsConnectionCount 1 -EnabledTaskCount 0).pass) "mapped HGFS connection rejected"
  Assert-True (-not (Test-Phase7BWorkPackage2RestoreEvidence -ManifestPass $true -FileDigestsPass $true -GuestIdentityPass $true -TaskSetPass $true -StoppedControlsPass $true -CredentialScanPass $true -RuntimeListenerCount 0 -PhysiqueOsProcessCount 0 -MappedHgfsDiskCount 0 -MappedHgfsConnectionCount 0 -EnabledTaskCount 1).pass) "enabled task rejected"
  $recovery = Get-Phase7BWorkPackage2RecoveryDecision -MutationStarted $true -AcceptedPass $false -PartialRestore $true
  Assert-True ($recovery.reconciliationOnly -and -not $recovery.automaticRetryAllowed -and $recovery.newFounderAuthorizationRequired) "partial restore is reconciliation-only"
  Assert-Throws { Get-Phase7BWorkPackage2RecoveryDecision -MutationStarted $true -AcceptedPass $true -PartialRestore $true } 'PHASE7B_WP2_ACCEPTED_WITH_PARTIAL_STATE_INCONSISTENT' "accepted partial state rejected"

  $descriptor = [ordered]@{ schemaVersion = 1; classification = 'PHASE7B_WP2_ENCRYPTED_PACKET_AND_REPLICA_PASS'; attemptId = $attemptId; invocationContractSha256=('6'*64);stage3LauncherSha256=('7'*64);securePassphraseBridgeRequired=$true;decryptRoundTripRequired=$true; applicationCommit = $contract.applicationCommit; environmentId = $contract.environmentId; vmDisplayName = $contract.vmDisplayName; windowsHostId = $contract.windowsHostId; manifestDigest = $contract.manifestDigest; sourceInventorySha256 = $two.inventorySha256; packetFileName = Split-Path -Leaf $encrypted; packetSha256 = $packetSha; packetBytes = (Get-Item $encrypted).Length; plaintextZipSha256=('a'*64);plaintextZipBytes=[int64]2048;decryptedStreamSha256=('a'*64);decryptedStreamBytes=[int64]2048;decryptRoundTripPass=$true; localEncryptedCopyPass = $true; independentEncryptedReplicaPass = $true; plaintextSecretPersisted = $false; automaticRetryAllowed = $false }
  $descriptorPath = Join-Path $testRoot 'descriptor.json'
  Write-JsonNoBom $descriptorPath $descriptor
  $descriptorHash = Get-Phase7BSha256 -LiteralPath $descriptorPath
  $mediaAuthPath = Join-Path $testRoot 'media-authorization.json'
  $mediaAuthHash = New-Authorization -Path $mediaAuthPath -Stage 'WP2C_MEDIA' -AttemptId $attemptId -InventorySha $two.inventorySha256 -PacketSha $packetSha
  $isoPath = Join-Path $testRoot 'phase7b-wp2-fixture.iso'
  $isoOutput = @(& (Join-Path $PSScriptRoot 'phase7bBuildWorkPackage2RestoreIso.ps1') -AttemptId $attemptId -AuthorizationPath $mediaAuthPath -ExpectedAuthorizationSha256 $mediaAuthHash -PacketPath $encrypted -ExpectedPacketSha256 $packetSha -DescriptorPath $descriptorPath -ExpectedDescriptorSha256 $descriptorHash -AgeExePath $fakeAge -ExpectedAgeExeSha256 $fakeAgeHash -OutputPath $isoPath) -join [Environment]::NewLine
  $isoResult = $isoOutput | ConvertFrom-Json
  Assert-True ($isoResult.pass -and $isoResult.classification -eq 'PHASE7B_WP2_RESTORE_MEDIA_BUILT') "synthetic two-file restore media built"
  Assert-True ($isoResult.fileCount -eq 3 -and $isoResult.primaryVolumeLabel -eq 'P7B_WP2' -and $isoResult.jolietVolumeLabel -eq 'P7B_WP2') "restore media exact file count and labels"
  Assert-True ($isoResult.ageFileName -eq 'age.exe' -and $isoResult.ageExeSha256 -eq $fakeAgeHash) "restore media binds exact offline age executable"
  Assert-True (@($isoResult.embeddedAuthorizedStages).Count -eq 4 -and $isoResult.mediaDescriptorSha256 -match '^[0-9a-f]{64}$') "media descriptor embeds exact offline guest stage authorizations"
  Assert-True (-not $isoResult.credentialsIncluded -and -not $isoResult.plaintextIncluded) "restore media excludes credentials and plaintext"

  $captureInspect = @(& (Join-Path $PSScriptRoot 'phase7bPrepareWorkPackage2EncryptedPacket.ps1') -Operation Inspect) -join [Environment]::NewLine | ConvertFrom-Json
  Assert-True ($captureInspect.pass -and $captureInspect.interactiveSecretPromptRequired -and -not $captureInspect.plaintextSecretFilePermitted) "capture tool advertises interactive no-file secret boundary"
  $restoreScript = Join-Path $PSScriptRoot 'phase7bIsolatedGuestRestoreInterface.ps1'
  $unauthorized = Start-Process -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -ArgumentList @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',$restoreScript,'-Operation','DecryptAndRestore') -Wait -PassThru -WindowStyle Hidden
  Assert-True ($unauthorized.ExitCode -ne 0) "guest mutation without bound authorization fails closed"

  $trackedPaths = @('phase7bWorkPackage2Contract.psm1','phase7bBoundedReplicaTransport.psm1','phase7bWorkPackage2OperatorLifecycle.psm1','phase7bWorkPackage2AuthorizationEligibility.psm1','phase7bWorkPackage2Orchestration.psm1','phase7bPlanWorkPackage2Capture.ps1','phase7bSetWorkPackage2CaptureQuiescence.ps1','phase7bResumeWorkPackage2CaptureQuiescence.ps1','phase7bResumeWorkPackage2PostRefreshCheckpoint.ps1','phase7bRefreshWorkPackage2StableInventory.ps1','phase7bPrepareWorkPackage2CaptureAuthorization.ps1','phase7bPrepareWorkPackage2EncryptedPacket.ps1','phase7bResumeCompletedWorkPackage2Capture.ps1','phase7bOpenBoundedReplicaReceiver.ps1','phase7bVerifyAndCloseBoundedReplicaReceiver.ps1','phase7bImportBoundedReplicaReceipt.ps1','phase7bVerifyPrimaryReplicaSessionClosed.ps1','phase7bFinalizeBoundedReplicaDescriptor.ps1','phase7bBuildWorkPackage2RestoreIso.ps1','phase7bIsolatedGuestRestoreInterface.ps1','phase7bNewWorkPackage2InvocationContract.ps1','phase7bRunWorkPackage2Stage3.ps1','phase7bRunWorkPackage2Stage4.ps1','phase7bRunWorkPackage2Stage5.ps1','phase7bInvocationContractGenerator.test.ps1','phase7bWorkPackage2Preparation.test.ps1','phase7bWorkPackage2RemainingLifecycleIntegration.test.ps1','phase7bWorkPackage2Simplification.test.ps1') | ForEach-Object { Join-Path $PSScriptRoot $_ }
  foreach ($path in $trackedPaths) {
    $tokens = $null; $errors = $null
    [void][Management.Automation.Language.Parser]::ParseFile($path, [ref]$tokens, [ref]$errors)
    Assert-True (@($errors).Count -eq 0) "PowerShell 5.1 AST: $(Split-Path -Leaf $path)"
  }
  $allText = @($trackedPaths | ForEach-Object { Get-Content -LiteralPath $_ -Raw }) -join [Environment]::NewLine
  $operationalText = @($trackedPaths | Where-Object { $_ -notmatch '\.test\.ps1$' } | ForEach-Object { Get-Content -LiteralPath $_ -Raw }) -join [Environment]::NewLine
  Assert-True (-not ($allText -match '(?i)(?:passphrase|password|secret)\s*=\s*["''][^"'']{8,}["'']')) "no embedded secret literals"
  Assert-True (-not ($operationalText -match '(?i)AGE_PASSPHRASE|ConvertFrom-SecureString|Export-Clixml')) "no environment/file secret transport"
  Assert-True ($allText.Contains('PHASE7B_WP2_ENTER_PASSPHRASE_IN_AGE_TTY')) "interactive age TTY contract explicit"
  Assert-True ($allText.Contains('automaticRetryAllowed = $false')) "no automatic retry contract explicit"
  $guestRestoreText = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'phase7bIsolatedGuestRestoreInterface.ps1') -Raw
  Assert-True ($guestRestoreText.Contains('wp2-$($Operation.ToLowerInvariant())-$nonce.json')) "guest reports are source-owned and nonce-bound"
  Assert-True ($guestRestoreText.Contains('[IO.FileMode]::CreateNew')) "guest report and restore evidence never overwrite"
  Assert-True ($guestRestoreText.Contains('PHASE7B_WP2_REPORT_PATH_IS_SOURCE_OWNED')) "caller cannot redirect safe guest report"

  [ordered]@{ classification = 'PHASE7B_WP2_A_LOCAL_TOOLING_TESTS_PASS'; pass = $true; assertions = $script:assertions; applicationCommit = $contract.applicationCommit } | ConvertTo-Json -Compress
} finally {
  if (Test-Path -LiteralPath $testRoot) {
    $resolved = (Resolve-Path -LiteralPath $testRoot).Path
    if ($resolved.StartsWith($tmpRoot + '\phase7b-wp2-tests-', [StringComparison]::OrdinalIgnoreCase)) { Remove-Item -LiteralPath $resolved -Recurse -Force }
  }
}
