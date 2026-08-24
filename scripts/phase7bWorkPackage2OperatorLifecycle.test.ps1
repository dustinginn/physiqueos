$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2OperatorLifecycle.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bBoundedReplicaTransport.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2Contract.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bIsolatedGuestContract.psm1') -Force
$testRoot = Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..\.tmp')).Path "phase7b-wp2b-operator-test-$([guid]::NewGuid().ToString('N'))"
$script:assertions = 0
function Assert-True([bool]$Condition,[string]$Message){if(-not $Condition){throw "ASSERTION_FAILED:$Message"};$script:assertions++}
function Assert-Throws([scriptblock]$Action,[string]$Pattern,[string]$Message){$ok=$false;try{&$Action}catch{$ok=$_.Exception.Message -match $Pattern};Assert-True $ok $Message}
function Write-Canonical([string]$Path,$Value){[IO.File]::WriteAllText($Path,($Value|ConvertTo-Json -Depth 12),(New-Object Text.UTF8Encoding($false)))}
function New-Quiescence([string]$Commit){[pscustomobject][ordered]@{classification='PHASE7B_WP2B_NARROW_QUIESCENCE_PASS';pass=$true;toolingCommit=$Commit;monitorTaskDefinitionExact=$true;monitorTaskDisabled=$true;monitorTaskNotRunning=$true;productionServerLeftRunning=$true;productionListenerPresent=$true;autonomousCanonicalWriterPaused=$true;fullCutoverFenceStarted=$false;nonce=('1'*32);observedAt=[DateTime]::UtcNow.ToString('o');mutationPerformed=$true;reportPersisted=$true;automaticRetryAllowed=$false}}
function New-StableEvidence {[pscustomobject]@{repositoryIdentityPass=$true;originParityPass=$true;trackedTreeClean=$true;planBindingPass=$true;inventoryBindingPass=$true;runtimeBindingPass=$true;requiredCollectionCount=39;missingCollectionCount=0;unknownCollectionCount=0;missingMediaReferenceCount=0;credentialSignalCount=0;ageIdentityPass=$true;primaryDestinationPass=$true;laptopReachable=$true;quiescencePass=$true;sourceStableAcrossPreflight=$true}}
try {
  New-Item -ItemType Directory -Path $testRoot | Out-Null
  $attempt='phase7b-wp2-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';$authorizationId='phase7b-wp2b-capture-auth-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  $tooling='a'*40;$plan='b'*64;$inventory='c'*64;$selection='d'*64;$source='e'*64;$runtime='f'*64;$agePath='1'*64;$age='2'*64;$local='3'*64;$replica='4'*64;$quiescenceSha='5'*64
  $unc='\\LAPTOP-4G5U0U2R\P7Baaaaaaaa$';$issued=[DateTime]::UtcNow.AddMinutes(-1)
  $document=New-Phase7BWorkPackage2CaptureAuthorizationDocument -AuthorizationId $authorizationId -AttemptId $attempt -ToolingCommit $tooling -CapturePlanSha256 $plan -InventorySha256 $inventory -SelectionSha256 $selection -SourceRootSha256 $source -RuntimeRevision 142 -RuntimeSha256 $runtime -AgeExePathSha256 $agePath -AgeExeSha256 $age -LocalOutputRootSha256 $local -ReplicaRootSha256 $replica -ReplicaUncRoot $unc -QuiescenceEvidenceSha256 $quiescenceSha -QuiescenceEvidenceFileName "phase7b-wp2b-quiescence-$('1'*32).json" -ConsumptionMarkerFileName "$authorizationId.used.json" -IssuedAt $issued -ExpiresAt $issued.AddHours(1)
  Assert-True ($document.captureAuthorizationClassification -eq 'PHASE7B_WP2B_CAPTURE_AUTHORIZATION' -and $document.oneUseOnly -and -not $document.wp2cAuthorized) 'one-use capture-only authorization document'
  Assert-True ($document.selectionSha256 -eq $selection -and $document.runtimeRevision -eq 142 -and $document.replicaPathModel -eq 'EXACT_ATTEMPT_ROOT') 'authorization binds selection runtime and replica path model'
  Assert-True ($document.founderMeaningfulDataThrough -eq '2026-08-16' -and $document.founderDowntimeBegan -eq '2026-08-17') 'authorization binds Founder cutoff policy'
  foreach($change in @(
    @{name='authorizationId';value='wrong'},@{name='attemptId';value='wrong'},@{name='tooling';value='0'},@{name='runtimeRevision';value=0},@{name='unc';value='\\WRONG\share'}
  )){
    $parameters=@{AuthorizationId=$authorizationId;AttemptId=$attempt;ToolingCommit=$tooling;CapturePlanSha256=$plan;InventorySha256=$inventory;SelectionSha256=$selection;SourceRootSha256=$source;RuntimeRevision=142;RuntimeSha256=$runtime;AgeExePathSha256=$agePath;AgeExeSha256=$age;LocalOutputRootSha256=$local;ReplicaRootSha256=$replica;ReplicaUncRoot=$unc;QuiescenceEvidenceSha256=$quiescenceSha;QuiescenceEvidenceFileName="phase7b-wp2b-quiescence-$('1'*32).json";ConsumptionMarkerFileName="$authorizationId.used.json";IssuedAt=$issued;ExpiresAt=$issued.AddHours(1)}
    switch($change.name){'authorizationId'{$parameters.AuthorizationId=$change.value};'attemptId'{$parameters.AttemptId=$change.value};'tooling'{$parameters.ToolingCommit=$change.value};'runtimeRevision'{$parameters.RuntimeRevision=$change.value};'unc'{$parameters.ReplicaUncRoot=$change.value}}
    Assert-Throws { New-Phase7BWorkPackage2CaptureAuthorizationDocument @parameters } 'AUTHORIZATION_ARGUMENT_FAIL' "authorization rejects $($change.name)"
  }
  $authPath=Join-Path $testRoot 'capture-authorization.json';Write-Canonical $authPath $document;$authHash=Get-Phase7BSha256 -LiteralPath $authPath
  $accepted=Assert-Phase7BWorkPackage2CaptureAuthorization -LiteralPath $authPath -ExpectedSha256 $authHash -ExpectedAttemptId $attempt -ExpectedToolingCommit $tooling -ExpectedInventorySha256 $inventory -ExpectedSourceRootSha256 $source -ExpectedCapturePlanSha256 $plan -ExpectedLocalOutputRootSha256 $local -ExpectedReplicaRootSha256 $replica -ExpectedAgeExeSha256 $age -ExpectedQuiescenceEvidenceSha256 $quiescenceSha
  Assert-True ($accepted.authorizationId -eq $authorizationId) 'exact capture authorization accepted'
  foreach($case in @(@{p='ExpectedToolingCommit';v=('0'*40)},@{p='ExpectedInventorySha256';v=('0'*64)},@{p='ExpectedCapturePlanSha256';v=('0'*64)},@{p='ExpectedAgeExeSha256';v=('0'*64)},@{p='ExpectedQuiescenceEvidenceSha256';v=('0'*64)})){
    $parameters=@{LiteralPath=$authPath;ExpectedSha256=$authHash;ExpectedAttemptId=$attempt;ExpectedToolingCommit=$tooling;ExpectedInventorySha256=$inventory;ExpectedSourceRootSha256=$source;ExpectedCapturePlanSha256=$plan;ExpectedLocalOutputRootSha256=$local;ExpectedReplicaRootSha256=$replica;ExpectedAgeExeSha256=$age;ExpectedQuiescenceEvidenceSha256=$quiescenceSha};$parameters[$case.p]=$case.v
    Assert-Throws { Assert-Phase7BWorkPackage2CaptureAuthorization @parameters } 'MISMATCH' "capture authorization rejects $($case.p)"
  }
  $used=Use-Phase7BWorkPackage2CaptureAuthorization -AuthorizationPath $authPath -Authorization $accepted
  Assert-True ($used.pass -and (Test-Path (Join-Path $testRoot "$authorizationId.used.json"))) 'authorization consumption marker created atomically'
  Assert-Throws { Assert-Phase7BWorkPackage2CaptureAuthorization -LiteralPath $authPath -ExpectedSha256 $authHash -ExpectedAttemptId $attempt -ExpectedToolingCommit $tooling -ExpectedInventorySha256 $inventory -ExpectedSourceRootSha256 $source -ExpectedCapturePlanSha256 $plan -ExpectedLocalOutputRootSha256 $local -ExpectedReplicaRootSha256 $replica -ExpectedAgeExeSha256 $age -ExpectedQuiescenceEvidenceSha256 $quiescenceSha } 'ALREADY_USED' 'authorization reuse rejected'
  $stale=[ordered]@{};foreach($key in $document.Keys){$stale[$key]=$document[$key]};$stale.expiresAt=$issued.AddSeconds(1).ToUniversalTime().ToString('o');$stalePath=Join-Path $testRoot 'stale.json';Write-Canonical $stalePath $stale
  Assert-Throws { Assert-Phase7BWorkPackage2Authorization -LiteralPath $stalePath -ExpectedSha256 (Get-Phase7BSha256 -LiteralPath $stalePath) -ExpectedStage WP2B_CAPTURE -ExpectedAttemptId $attempt } 'TIME_INVALID_OR_EXPIRED' 'stale authorization rejected'

  $q=New-Quiescence $tooling;Assert-True (Test-Phase7BWorkPackage2QuiescenceEvidence -Evidence $q -ExpectedToolingCommit $tooling).pass 'narrow quiescence accepted'
  foreach($property in @('monitorTaskDefinitionExact','monitorTaskDisabled','monitorTaskNotRunning','productionServerLeftRunning','productionListenerPresent','autonomousCanonicalWriterPaused')){$bad=$q.PSObject.Copy();$bad.$property=$false;Assert-True (-not (Test-Phase7BWorkPackage2QuiescenceEvidence -Evidence $bad -ExpectedToolingCommit $tooling).pass) "quiescence rejects $property false"}
  $bad=$q.PSObject.Copy();$bad.fullCutoverFenceStarted=$true;Assert-True (-not (Test-Phase7BWorkPackage2QuiescenceEvidence -Evidence $bad -ExpectedToolingCommit $tooling).pass) 'quiescence rejects full cutover fence'
  Assert-True (-not (Test-Phase7BWorkPackage2QuiescenceEvidence -Evidence $q -ExpectedToolingCommit ('0'*40)).pass) 'quiescence rejects wrong tooling commit'
  $resumeName="phase7b-wp2b-quiescence-$('1'*32).json"
  function New-ResumeParameters {
    @{
      Evidence=(New-Quiescence $tooling);ExpectedAttemptId=$attempt;ObservedAttemptId=$attempt;ExpectedEvidenceToolingCommit=$tooling
      ExpectedEvidenceFileName=$resumeName;ExpectedEvidenceSha256=$quiescenceSha
      ObservedEvidenceFileName=$resumeName;ObservedEvidenceSha256=$quiescenceSha;EvidenceCandidateCount=1
      RepositoryIdentityPass=$true;ApplicationBindingPass=$true;SourceRootBindingPass=$true;RuntimeBindingPass=$true
      SourceIntegrityPass=$true;MonitorTaskDefinitionExact=$true;MonitorState='Disabled';ProductionServerState='Running'
      ListenerCount=1;RefreshArtifactCount=0;CaptureAuthorizationCount=0
    }
  }
  $resumeParameters=New-ResumeParameters
  $resume=Test-Phase7BWorkPackage2ExactQuiescenceResume @resumeParameters
  Assert-True ($resume.pass -and $resume.classification -ceq 'PHASE7B_WP2B_EXACT_EXISTING_QUIESCENCE_RESUME_PASS' -and
    -not $resume.quiescenceMutationPerformed -and $resume.quiescenceEvidenceReused -and -not $resume.quiescenceEvidenceCreated -and
    -not $resume.automaticRetryAllowed -and -not $resume.wp2cAuthorized) 'exact accepted evidence and disabled monitor enter zero-mutation resume'
  foreach($case in @(
    @{p='ExpectedEvidenceSha256';v=('0'*64);code='EVIDENCE_SHA256_FAIL'},
    @{p='ObservedEvidenceFileName';v="phase7b-wp2b-quiescence-$('2'*32).json";code='EVIDENCE_FILENAME_FAIL'},
    @{p='ExpectedAttemptId';v='phase7b-wp2-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';code='ATTEMPT_IDENTITY_FAIL'},
    @{p='ExpectedEvidenceToolingCommit';v=('0'*40);code='EVIDENCE_CONTRACT_FAIL'},
    @{p='EvidenceCandidateCount';v=0;code='EVIDENCE_CARDINALITY_FAIL'},
    @{p='EvidenceCandidateCount';v=2;code='EVIDENCE_CARDINALITY_FAIL'},
    @{p='MonitorState';v='Running';code='MONITOR_STATE_FAIL'},
    @{p='ProductionServerState';v='Ready';code='PRODUCTION_SERVER_STATE_FAIL'},
    @{p='ListenerCount';v=0;code='LISTENER_COUNT_FAIL'},
    @{p='RefreshArtifactCount';v=1;code='REFRESH_ARTIFACT_COLLISION'},
    @{p='CaptureAuthorizationCount';v=1;code='CAPTURE_AUTHORIZATION_COLLISION'},
    @{p='RepositoryIdentityPass';v=$false;code='REPOSITORY_IDENTITY_FAIL'},
    @{p='ApplicationBindingPass';v=$false;code='APPLICATION_BINDING_FAIL'},
    @{p='SourceRootBindingPass';v=$false;code='SOURCE_ROOT_BINDING_FAIL'},
    @{p='RuntimeBindingPass';v=$false;code='RUNTIME_BINDING_FAIL'},
    @{p='SourceIntegrityPass';v=$false;code='SOURCE_INTEGRITY_FAIL'}
  )) {
    $parameters=New-ResumeParameters;$parameters[$case.p]=$case.v
    $rejected=Test-Phase7BWorkPackage2ExactQuiescenceResume @parameters
    Assert-True (-not $rejected.pass -and $rejected.classification -ceq 'PHASE7B_WP2B_EXACT_EXISTING_QUIESCENCE_NONRESUMABLE' -and
      [string]$rejected.safeReasonCode -match $case.code -and -not $rejected.quiescenceMutationPerformed -and
      -not $rejected.quiescenceEvidenceCreated -and -not $rejected.automaticRetryAllowed) "resume rejects:$($case.p)"
  }
  $preflight=New-StableEvidence;Assert-True (Test-Phase7BWorkPackage2StablePreflightEvidence $preflight).pass 'complete stable preflight accepted'
  foreach($property in @('repositoryIdentityPass','originParityPass','trackedTreeClean','planBindingPass','inventoryBindingPass','runtimeBindingPass','ageIdentityPass','primaryDestinationPass','laptopReachable','quiescencePass','sourceStableAcrossPreflight')){$bad=New-StableEvidence;$bad.$property=$false;Assert-True (-not (Test-Phase7BWorkPackage2StablePreflightEvidence $bad).pass) "preflight rejects $property false"}
  foreach($property in @('missingCollectionCount','unknownCollectionCount','missingMediaReferenceCount','credentialSignalCount')){$bad=New-StableEvidence;$bad.$property=1;Assert-True (-not (Test-Phase7BWorkPackage2StablePreflightEvidence $bad).pass) "preflight rejects nonzero $property"}
  $bad=New-StableEvidence;$bad.requiredCollectionCount=38;Assert-True (-not (Test-Phase7BWorkPackage2StablePreflightEvidence $bad).pass) 'preflight rejects collection cardinality mismatch'

  $exactAttempt='phase7b-wp2-fc48221852204c188c414a18f6c42bbd'
  Assert-True ((Assert-Phase7BWorkPackage2AttemptIdentity -ExpectedAttemptId $exactAttempt -ObservedAttemptId $exactAttempt) -ceq $exactAttempt) 'exact Founder-authorized attempt identity accepted'
  foreach($observed in @('phase7b-wp2-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','phase7b-wp2-f1fa937cdd9a4937b9471defb3dc46b5','wrong','PHASE7B-WP2-FC48221852204C188C414A18F6C42BBD')){
    Assert-Throws { Assert-Phase7BWorkPackage2AttemptIdentity -ExpectedAttemptId $exactAttempt -ObservedAttemptId $observed } 'ATTEMPT_IDENTITY_MISMATCH' "substituted or malformed attempt rejected:$observed"
  }
  Assert-Throws { Assert-Phase7BWorkPackage2AttemptIdentity -ExpectedAttemptId $null -ObservedAttemptId $exactAttempt } 'ATTEMPT_IDENTITY_MISMATCH' 'null expected attempt rejected'
  Assert-Throws { Assert-Phase7BWorkPackage2AttemptIdentity -ExpectedAttemptId $exactAttempt -ObservedAttemptId $null } 'ATTEMPT_IDENTITY_MISMATCH' 'null observed attempt rejected'
  Assert-Throws { Assert-Phase7BWorkPackage2AttemptIdentity -ExpectedAttemptId 'PHASE7B-WP2-FC48221852204C188C414A18F6C42BBD' -ObservedAttemptId 'PHASE7B-WP2-FC48221852204C188C414A18F6C42BBD' } 'ATTEMPT_IDENTITY_MISMATCH' 'uppercase expected and observed attempt rejected'
  $refreshOutputRoot=Join-Path $testRoot 'stable-refresh-output';New-Item -ItemType Directory $refreshOutputRoot|Out-Null
  $refreshNonce='6'*32
  $refreshOutput=Assert-Phase7BWorkPackage2StableRefreshOutputSet -ExpectedAttemptId $exactAttempt -RefreshNonce $refreshNonce -OutputDirectory $refreshOutputRoot
  Assert-True ((Split-Path -Leaf $refreshOutput.selectionPath) -ceq "$exactAttempt-refresh-$refreshNonce-selection.json" -and (Split-Path -Leaf $refreshOutput.inventoryAuthorizationPath) -ceq "$exactAttempt-refresh-$refreshNonce-inventory-authorization.json" -and (Split-Path -Leaf $refreshOutput.capturePlanPath) -ceq "$exactAttempt-refresh-$refreshNonce-capture-plan.json") 'stable refresh output names bind exact attempt identity and refresh nonce'
  Assert-Throws { Assert-Phase7BWorkPackage2StableRefreshOutputSet -ExpectedAttemptId $exactAttempt -RefreshNonce 'wrong' -OutputDirectory $refreshOutputRoot } 'STABLE_REFRESH_NONCE_REJECTED' 'stable refresh rejects malformed nonce'
  [IO.File]::WriteAllText($refreshOutput.selectionPath,'collision',[Text.UTF8Encoding]::new($false))
  Assert-Throws { Assert-Phase7BWorkPackage2StableRefreshOutputSet -ExpectedAttemptId $exactAttempt -RefreshNonce $refreshNonce -OutputDirectory $refreshOutputRoot } 'STABLE_REFRESH_OUTPUT_COLLISION' 'stable refresh rejects existing exact-attempt refresh output'

  $existingRoot=Join-Path $testRoot 'existing-inventory';New-Item -ItemType Directory $existingRoot|Out-Null
  $existingSelection=Join-Path $existingRoot 'selection.json';$existingInventoryAuth=Join-Path $existingRoot 'inventory-authorization.json';$existingPlan=Join-Path $existingRoot 'capture-plan.json'
  $sourceRootSha='7'*64
  $wp2=Get-Phase7BWorkPackage2Contract
  $missingDecision=Get-Phase7BWorkPackage2ExistingInventorySetDecision -ExpectedAttemptId $exactAttempt -ExpectedToolingCommit $tooling -ExpectedSourceRootSha256 $sourceRootSha -SelectionPath $existingSelection -InventoryAuthorizationPath $existingInventoryAuth -CapturePlanPath $existingPlan
  Assert-True ($missingDecision.classification -ceq 'PHASE7B_WP2B_REFRESH_REQUIRED' -and -not $missingDecision.pass) 'absent exact-attempt inventory set explicitly requires refresh'
  Write-Canonical $existingSelection ([ordered]@{classification='PHASE7B_WP2_WINDOWS_SELECTION';attemptId=$exactAttempt;toolingCommit=$tooling;applicationCommit=$wp2.applicationCommit;environmentId=$wp2.environmentId;vmDisplayName=$wp2.vmDisplayName;windowsHostId=$wp2.windowsHostId;manifestDigest=$wp2.manifestDigest;sourceRootSha256=$sourceRootSha;canonicalEvidence=[ordered]@{requiredCollectionPresentCount=39;missingCollectionCount=0;unknownCollectionCount=0;missingMediaReferenceCount=0};exclusionEvidence=[ordered]@{credentialSignalCount=0}})
  $partialDecision=Get-Phase7BWorkPackage2ExistingInventorySetDecision -ExpectedAttemptId $exactAttempt -ExpectedToolingCommit $tooling -ExpectedSourceRootSha256 $sourceRootSha -SelectionPath $existingSelection -InventoryAuthorizationPath $existingInventoryAuth -CapturePlanPath $existingPlan
  Assert-True ($partialDecision.classification -ceq 'PHASE7B_WP2B_NONREFRESHABLE_INVENTORY_FAILURE' -and -not $partialDecision.pass) 'partial inventory set is nonrefreshable integrity failure'
  $existingSelectionSha=Get-Phase7BSha256 -LiteralPath $existingSelection
  Write-Canonical $existingInventoryAuth ([ordered]@{classification=$wp2.authorizationClassification;attemptId=$exactAttempt;toolingCommit=$tooling;applicationCommit=$wp2.applicationCommit;environmentId=$wp2.environmentId;vmDisplayName=$wp2.vmDisplayName;windowsHostId=$wp2.windowsHostId;manifestDigest=$wp2.manifestDigest;sourceRootSha256=$sourceRootSha;authorizedStages=@([ordered]@{stage='WP2B_INVENTORY';mutationBudget=1});founderApproved=$true;automaticRetryAllowed=$false})
  Write-Canonical $existingPlan ([ordered]@{classification='PHASE7B_WP2_CAPTURE_PLAN';attemptId=$exactAttempt;applicationCommit=$wp2.applicationCommit;environmentId=$wp2.environmentId;vmDisplayName=$wp2.vmDisplayName;windowsHostId=$wp2.windowsHostId;manifestDigest=$wp2.manifestDigest;selectionSha256=$existingSelectionSha;sourceInventorySha256=('8'*64);sourceRootSha256=$sourceRootSha;fileCount=1;totalBytes=1})
  $candidateDecision=Get-Phase7BWorkPackage2ExistingInventorySetDecision -ExpectedAttemptId $exactAttempt -ExpectedToolingCommit $tooling -ExpectedSourceRootSha256 $sourceRootSha -SelectionPath $existingSelection -InventoryAuthorizationPath $existingInventoryAuth -CapturePlanPath $existingPlan
  Assert-True ($candidateDecision.classification -ceq 'PHASE7B_WP2B_EXISTING_INVENTORY_CANDIDATE' -and $candidateDecision.pass) 'complete exact-attempt inventory candidate reaches dynamic reuse validation'
  $wrongAttemptPlan=Get-Content -LiteralPath $existingPlan -Raw|ConvertFrom-Json;$wrongAttemptPlan.attemptId='phase7b-wp2-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';Write-Canonical $existingPlan $wrongAttemptPlan
  $wrongAttemptDecision=Get-Phase7BWorkPackage2ExistingInventorySetDecision -ExpectedAttemptId $exactAttempt -ExpectedToolingCommit $tooling -ExpectedSourceRootSha256 $sourceRootSha -SelectionPath $existingSelection -InventoryAuthorizationPath $existingInventoryAuth -CapturePlanPath $existingPlan
  Assert-True ($wrongAttemptDecision.classification -ceq 'PHASE7B_WP2B_NONREFRESHABLE_INVENTORY_FAILURE') 'attempt mismatch never falls through to refresh'
  $reusableDecision=Resolve-Phase7BWorkPackage2StableInventoryPreflightDecision -ExitCode 0 -Result ([pscustomobject]@{classification='PHASE7B_WP2B_STABLE_PREFLIGHT_AND_AUTHORIZATION_PASS';pass=$true})
  Assert-True ($reusableDecision.classification -ceq 'PHASE7B_WP2B_EXISTING_INVENTORY_REUSABLE' -and -not $reusableDecision.refreshAllowed) 'stable preflight reuses existing inventory without refresh'
  $refreshDecision=Resolve-Phase7BWorkPackage2StableInventoryPreflightDecision -ExitCode 1 -Result ([pscustomobject]@{classification='PHASE7B_WP2B_STABLE_PREFLIGHT_AND_AUTHORIZATION_FAIL';pass=$false;safeErrorCode='PHASE7B_WP2B_STABLE_BINDING_REFRESH_REQUIRED'})
  Assert-True ($refreshDecision.classification -ceq 'PHASE7B_WP2B_REFRESH_REQUIRED' -and $refreshDecision.refreshAllowed) 'only exact stale-binding classification permits refresh'
  foreach($safeCode in @('PHASE7B_WP2B_CAPTURE_PREFLIGHT_PLAN_OR_SELECTION_FAIL','PHASE7B_WP2B_CAPTURE_PREFLIGHT_REPOSITORY_FAIL','PHASE7B_WP2B_CAPTURE_PREFLIGHT_FILE_BINDING_FAIL')){
    $nonrefreshable=Resolve-Phase7BWorkPackage2StableInventoryPreflightDecision -ExitCode 1 -Result ([pscustomobject]@{classification='PHASE7B_WP2B_STABLE_PREFLIGHT_AND_AUTHORIZATION_FAIL';pass=$false;safeErrorCode=$safeCode})
    Assert-True ($nonrefreshable.classification -ceq 'PHASE7B_WP2B_NONREFRESHABLE_INVENTORY_FAILURE' -and -not $nonrefreshable.refreshAllowed) "integrity failure is nonrefreshable:$safeCode"
  }

  $parent=Join-Path $testRoot 'replica-parent';New-Item -ItemType Directory $parent|Out-Null;$pathContract=Get-Phase7BBoundedReplicaAttemptRoot -AttemptId $attempt -ReplicaParentRoot $parent
  New-Item -ItemType Directory $pathContract.attemptRoot|Out-Null
  $localPacket=Join-Path $testRoot "$attempt.zip.age";[IO.File]::WriteAllBytes($localPacket,[Text.Encoding]::ASCII.GetBytes("age-encryption.org/v1`noperator-lifecycle"));$packetSha=Get-Phase7BSha256 -LiteralPath $localPacket;$packetBytes=(Get-Item $localPacket).Length
  $copy=Copy-Phase7BBoundedEncryptedReplica -SourcePath $localPacket -DestinationPath $pathContract.packetPath -ExpectedSha256 $packetSha -ExpectedBytes $packetBytes
  Assert-True ($copy.pass -and (Split-Path -Parent $pathContract.packetPath) -eq $pathContract.attemptRoot) 'synthetic receiver to exact attempt root copy pass'
  Assert-True ($pathContract.packetPath -notmatch ([regex]::Escape("$attempt\$attempt\"))) 'synthetic lifecycle catches duplicate attempt directory composition'
  Assert-True (-not (Test-Phase7BBoundedEncryptedReplicaSource -LiteralPath $pathContract.packetPath -ExpectedSha256 $packetSha -ExpectedBytes ($packetBytes+1)).pass) 'post-encryption exact size mismatch rejected'
  Assert-True (-not (Test-Phase7BBoundedEncryptedReplicaSource -LiteralPath $pathContract.packetPath -ExpectedSha256 ('0'*64) -ExpectedBytes $packetBytes).pass) 'post-encryption exact hash mismatch rejected'

  $receiptNonce='2'*32;$receiptPath=Join-Path $testRoot "$attempt-replica-receipt-$receiptNonce.json"
  $receipt=[pscustomobject][ordered]@{schemaVersion=1;classification='PHASE7B_WP2_BOUNDED_REPLICA_INDEPENDENT_READBACK_PASS';pass=$true;attemptId=$attempt;evidenceNonce=$receiptNonce;evidenceFileName=(Split-Path -Leaf $receiptPath);observedAt=[DateTime]::UtcNow.ToString('o');packetFileName="$attempt.zip.age";packetSha256=$packetSha;packetBytes=$packetBytes;destinationBytesReread=$true;encryptedPacketOnly=$true;computerName='LAPTOP-4G5U0U2R';hostIdentitySha256='ddf354efb3688588818f48ea7e46720eb7b716e7006ce02b9386786bc6cdc8e1';diskIdentitySha256='3b660772000275e24aa13ba78712c518a898e701ebd3a443cee31776877ac948';driveRoot='D:\';fileSystem='NTFS';diskNumber=0;busType='SATA';physicallyIndependent=$true;freeBytes=[int64]10GB;persistentAccountCreated=$false;persistentShareRetained=$false;persistentFirewallRuleRetained=$false;persistentMappingRetained=$false;credentialsPersisted=$false;rawProductionFilesAccepted=$false;sessionTornDown=$true;reportPersisted=$true;automaticRetryAllowed=$false}
  $receiptPersisted=Write-Phase7BSafeEvidenceFile -LiteralPath $receiptPath -Evidence $receipt;Assert-True ($receiptPersisted.pass -and (Test-Phase7BBoundedReplicaReceipt -Receipt $receipt -ExpectedAttemptId $attempt -ExpectedPacketSha256 $packetSha -ExpectedPacketBytes $packetBytes).pass) 'safe laptop receipt persisted and accepted'
  Assert-Throws { Write-Phase7BSafeEvidenceFile -LiteralPath $receiptPath -Evidence $receipt } 'OUTPUT_REJECTED' 'duplicate receipt persistence rejected'
  $teardownNonce='3'*32;$teardownPath=Join-Path $testRoot "$attempt-primary-teardown-$teardownNonce.json";$share='P7Baaaaaaaa$'
  $teardown=[pscustomobject][ordered]@{schemaVersion=1;classification='PHASE7B_WP2_PRIMARY_REPLICA_SESSION_TEARDOWN_PASS';pass=$true;attemptId=$attempt;evidenceNonce=$teardownNonce;evidenceFileName=(Split-Path -Leaf $teardownPath);observedAt=[DateTime]::UtcNow.ToString('o');serverName='LAPTOP-4G5U0U2R';shareName=$share;matchingPsDriveCount=0;matchingSmbMappingCount=0;savedCredentialTargetCount=0;mappingPersistent=$false;credentialsPersisted=$false;sessionTornDown=$true;mutationPerformed=$false;reportPersisted=$true;automaticRetryAllowed=$false}
  $teardownPersisted=Write-Phase7BSafeEvidenceFile -LiteralPath $teardownPath -Evidence $teardown;Assert-True ($teardownPersisted.pass -and (Test-Phase7BPrimaryReplicaSessionTeardownEvidence -Evidence $teardown -ExpectedAttemptId $attempt -ExpectedServerName 'LAPTOP-4G5U0U2R' -ExpectedShareName $share).pass) 'safe primary teardown receipt persisted and accepted'
  foreach($property in @('matchingPsDriveCount','matchingSmbMappingCount','savedCredentialTargetCount')){$bad=$teardown.PSObject.Copy();$bad.$property=1;Assert-True (-not (Test-Phase7BPrimaryReplicaSessionTeardownEvidence -Evidence $bad -ExpectedAttemptId $attempt -ExpectedServerName 'LAPTOP-4G5U0U2R' -ExpectedShareName $share).pass) "teardown rejects residual $property"}
  $pendingPath=Join-Path $testRoot 'pending.json';Write-Canonical $pendingPath ([ordered]@{schemaVersion=1;classification='PHASE7B_WP2_ENCRYPTED_PACKET_REPLICA_COPY_PENDING_INDEPENDENT_READBACK';attemptId=$attempt;packetSha256=$packetSha;packetBytes=$packetBytes;localEncryptedCopyPass=$true;independentEncryptedReplicaPass=$false})
  $finalPath=Join-Path $testRoot 'final.json';$final=@(& (Join-Path $PSScriptRoot 'phase7bFinalizeBoundedReplicaDescriptor.ps1') -AttemptId $attempt -PendingDescriptorPath $pendingPath -ExpectedPendingDescriptorSha256 (Get-Phase7BSha256 -LiteralPath $pendingPath) -ReplicaReceiptPath $receiptPath -ExpectedReplicaReceiptSha256 $receiptPersisted.sha256 -PrimaryTeardownEvidencePath $teardownPath -ExpectedPrimaryTeardownEvidenceSha256 $teardownPersisted.sha256 -AuthorizationAcknowledgement 'WP2B_CAPTURE_FINALIZE_INDEPENDENT_REPLICA_EXACTLY_ONCE' -OutputPath $finalPath)-join [Environment]::NewLine|ConvertFrom-Json
  Assert-True ($final.pass -and $final.independentEncryptedReplicaPass -and $final.sessionTornDown) 'synthetic lifecycle final descriptor pass'
  $wrongFinal=Join-Path $testRoot 'wrong-final.json';$wrongReceipt=$receiptPath+'.wrong';Copy-Item $receiptPath $wrongReceipt;[IO.File]::AppendAllText($wrongReceipt,' ')
  $failure=@(& (Join-Path $PSScriptRoot 'phase7bFinalizeBoundedReplicaDescriptor.ps1') -AttemptId $attempt -PendingDescriptorPath $pendingPath -ExpectedPendingDescriptorSha256 (Get-Phase7BSha256 -LiteralPath $pendingPath) -ReplicaReceiptPath $wrongReceipt -ExpectedReplicaReceiptSha256 $receiptPersisted.sha256 -PrimaryTeardownEvidencePath $teardownPath -ExpectedPrimaryTeardownEvidenceSha256 $teardownPersisted.sha256 -AuthorizationAcknowledgement 'WP2B_CAPTURE_FINALIZE_INDEPENDENT_REPLICA_EXACTLY_ONCE' -OutputPath $wrongFinal)-join [Environment]::NewLine|ConvertFrom-Json
  Assert-True (-not $failure.pass -and -not (Test-Path $wrongFinal)) 'descriptor rejects wrong receipt hash before mutation'
  $paths=@('phase7bWorkPackage2OperatorLifecycle.psm1','phase7bSetWorkPackage2CaptureQuiescence.ps1','phase7bResumeWorkPackage2CaptureQuiescence.ps1','phase7bRefreshWorkPackage2StableInventory.ps1','phase7bPrepareWorkPackage2CaptureAuthorization.ps1','phase7bImportBoundedReplicaReceipt.ps1','phase7bWorkPackage2OperatorLifecycle.test.ps1')|ForEach-Object{Join-Path $PSScriptRoot $_}
  foreach($path in $paths){$tokens=$null;$errors=$null;[void][Management.Automation.Language.Parser]::ParseFile($path,[ref]$tokens,[ref]$errors);Assert-True (@($errors).Count -eq 0) "PowerShell 5.1 AST:$(Split-Path -Leaf $path)"}
  $sourceText=@($paths|Where-Object{$_ -notmatch '\.test\.ps1$'}|ForEach-Object{Get-Content -Raw $_})-join "`n"
  Assert-True (-not ($sourceText -match '(?i)ConvertFrom-SecureString|Export-Clixml|cmdkey(?:\.exe)?\s+/(?:add|delete)|New-LocalUser')) 'no persistent secret or account mechanism'
  Assert-True (-not ($sourceText -match '(?i)Start-Process.+(?:cmd|powershell).+exit')) 'no parent-host termination path'
  Assert-True ($sourceText.Contains('automaticRetryAllowed = $false') -and $sourceText.Contains('wp2cAuthorized = $false')) 'no retry and no WP2-C authority'
  Assert-True ($sourceText.Contains('PHASE7B_WP2B_STABLE_BINDING_REFRESH_REQUIRED') -and $sourceText.Contains('PHASE7B_WP2B_POST_QUIESCENCE_STABLE_INVENTORY_PASS')) 'stale plan has one bounded post-quiescence refresh path'
  $establishSource=Get-Content -Raw (Join-Path $PSScriptRoot 'phase7bSetWorkPackage2CaptureQuiescence.ps1')
  Assert-True ($establishSource.Contains("[ValidateSet('Inspect', 'Establish')]") -and $establishSource.Contains('PHASE7B_WP2B_QUIESCENCE_PRIOR_STATE_REJECTED') -and
    $establishSource.Contains('Stop-ScheduledTask') -and $establishSource.Contains('Disable-ScheduledTask')) 'fresh Establish contract remains unchanged and rejects already-disabled monitor'
  $resumeSource=Get-Content -Raw (Join-Path $PSScriptRoot 'phase7bResumeWorkPackage2CaptureQuiescence.ps1')
  Assert-True ($resumeSource.Contains('WP2B_CAPTURE_RESUME_EXACT_EXISTING_QUIESCENCE_READ_ONLY') -and
    $resumeSource.Contains('Test-Phase7BWorkPackage2ExactQuiescenceResume')) 'resume requires explicit source-owned acknowledgement and exact decision contract'
  Assert-True (-not ($resumeSource -match '(?i)\b(?:Stop|Disable|Enable|Start|Register|Unregister|Set)-ScheduledTask\b|Write-Phase7BSafeEvidenceFile|\b(?:New-Item|Set-Content|Add-Content|Out-File)\b')) 'resume source contains no task or evidence mutation command'
  Assert-True (-not $resumeSource.Contains('phase7bSetWorkPackage2CaptureQuiescence.ps1')) 'nonresumable path never falls back to fresh Establish'
  $prepareSource=Get-Content -Raw (Join-Path $PSScriptRoot 'phase7bPrepareWorkPackage2CaptureAuthorization.ps1')
  Assert-True ($prepareSource.Contains('PHASE7B_WP2B_CAPTURE_SOURCE_INTEGRITY_FAIL') -and
    $prepareSource.IndexOf('PHASE7B_WP2B_CAPTURE_SOURCE_INTEGRITY_FAIL') -lt $prepareSource.IndexOf('PHASE7B_WP2B_STABLE_BINDING_REFRESH_REQUIRED')) `
    'missing collections media or credential signals remain nonrefreshable before stale-binding decision'
  Assert-True ($prepareSource.Contains('$ExpectedQuiescenceEvidenceToolingCommit') -and
    $prepareSource.Contains('Test-Phase7BWorkPackage2QuiescenceEvidence -Evidence $quiescence -ExpectedToolingCommit $ExpectedQuiescenceEvidenceToolingCommit')) `
    'capture preflight can validate an exact reused evidence commit without weakening current repository identity'
  Assert-True ($prepareSource.Contains("[ValidateSet('FRESH_ESTABLISH','EXACT_EXISTING_QUIESCENCE_RESUME')]") -and
    $prepareSource.Contains('PHASE7B_WP2B_CAPTURE_PREFLIGHT_FRESH_QUIESCENCE_BINDING_FAIL') -and
    $prepareSource.Contains('PHASE7B_WP2B_CAPTURE_PREFLIGHT_RESUME_AUTHORIZATION_FAIL')) `
    'capture preflight requires explicit resume mode before accepting a noncurrent evidence commit'
  $refreshSource=Get-Content -Raw (Join-Path $PSScriptRoot 'phase7bRefreshWorkPackage2StableInventory.ps1')
  Assert-True ($refreshSource.Contains('[Parameter(Mandatory = $true)][string]$ExpectedAttemptId')) 'stable refresh requires explicit expected attempt identity'
  Assert-True (-not $refreshSource.Contains('[guid]::NewGuid()')) 'stable refresh never generates or substitutes attempt identity'
  Assert-True ($refreshSource.Contains('$selectionRead.attemptId') -and $refreshSource.Contains('$inventoryAuthorizationRead.attemptId') -and $refreshSource.Contains('$planRead.attemptId') -and $refreshSource.Contains('$plannerResult.attemptId')) 'selection inventory authorization plan and planner output require one exact attempt identity'
  Assert-True ($refreshSource.Contains('Assert-Phase7BWorkPackage2StableRefreshOutputSet') -and $refreshSource.Contains('attemptIdentityExact=$true')) 'stable refresh uses exact output-set contract and reports exact attempt binding'
  Assert-True ($refreshSource.Contains('sourceMutationPerformed=$false') -and $refreshSource.Contains('automaticRetryAllowed=$false') -and $refreshSource.Contains('wp2cAuthorized=$false')) 'stable refresh remains read-only no-retry and WP2-C unauthorized'
  Assert-True ($refreshSource.Contains('$ExpectedQuiescenceEvidenceToolingCommit') -and
    $refreshSource.Contains('Test-Phase7BWorkPackage2QuiescenceEvidence $quiescence $ExpectedQuiescenceEvidenceToolingCommit')) `
    'stable refresh preserves the exact reused quiescence evidence commit binding'
  Assert-True ($refreshSource.Contains("[ValidateSet('FRESH_ESTABLISH','EXACT_EXISTING_QUIESCENCE_RESUME')]") -and
    $refreshSource.Contains('PHASE7B_WP2B_STABLE_REFRESH_FRESH_QUIESCENCE_BINDING_FAIL') -and
    $refreshSource.Contains('PHASE7B_WP2B_STABLE_REFRESH_RESUME_AUTHORIZATION_FAIL')) `
    'stable refresh requires explicit resume mode before accepting a noncurrent evidence commit'
  [ordered]@{classification='PHASE7B_WP2B_OPERATOR_LIFECYCLE_TESTS_PASS';pass=$true;assertions=$script:assertions}|ConvertTo-Json -Compress
} finally {if(Test-Path $testRoot){Remove-Item -LiteralPath $testRoot -Recurse -Force}}
