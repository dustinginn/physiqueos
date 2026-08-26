[CmdletBinding()] param([switch]$FixturesOnly)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
if ($PSVersionTable.PSEdition -cne 'Desktop' -or $PSVersionTable.PSVersion.Major -ne 5) { throw 'WINDOWS_PS51_REQUIRED' }
Import-Module (Join-Path $PSScriptRoot 'phase7bIsolatedGuestContract.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2Contract.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2Orchestration.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2OperatorLifecycle.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2AuthorizationEligibility.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bBoundedReplicaTransport.psm1') -Force
. (Join-Path $PSScriptRoot 'test-support\phase7bPendingDescriptorFixture.ps1')
$script:assertions=0
function Assert-True([bool]$Condition,[string]$Message) { if (-not $Condition) { throw "ASSERTION_FAILED:$Message" };$script:assertions++ }
function Write-Json([string]$Path,$Value) { [IO.File]::WriteAllText($Path,(ConvertTo-Phase7BCanonicalJson $Value),(New-Object Text.UTF8Encoding($false))) }
$repo=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$testRoot=Join-Path $repo ('.tmp\phase7b-finalization-tests-'+[guid]::NewGuid().ToString('N'))
$finalizer=Join-Path $PSScriptRoot 'phase7bFinalizeBoundedReplicaDescriptor.ps1'

function New-Case([string]$Name) {
  $root=Join-Path $testRoot $Name;[void](New-Item -ItemType Directory -Path $root)
  $attempt='phase7b-wp2-'+('a'*32);$tooling='b'*40;$stage3='c'*64;$contract=Get-Phase7BWorkPackage2Contract
  $nonce='d'*32;$qPath=Join-Path $root "phase7b-wp2b-quiescence-$nonce.json"
  $quiescence=[pscustomobject]@{classification='PHASE7B_WP2B_NARROW_QUIESCENCE_PASS';pass=$true;toolingCommit=('e'*40);nonce=$nonce;observedAt='2026-08-24T00:00:00Z';monitorTaskDefinitionExact=$true;monitorTaskDisabled=$true;monitorTaskNotRunning=$true;productionServerLeftRunning=$true;productionListenerPresent=$true;autonomousCanonicalWriterPaused=$true;fullCutoverFenceStarted=$false;automaticRetryAllowed=$false}
  Write-Json $qPath $quiescence
  $invPath=Join-Path $root 'invocation.json'
  $inv=New-Phase7BWorkPackage2InvocationContractDocument -AttemptId $attempt -ToolingCommit $tooling -ApplicationCommit $contract.applicationCommit `
    -Artifacts @([pscustomobject]@{relativePath='scripts/phase7bRunWorkPackage2Stage3.ps1';sha256=$stage3;bytes=8503},[pscustomobject]@{relativePath='scripts/phase7bRunWorkPackage2Stage4.ps1';sha256=('d'*64);bytes=3757}) `
    -AgeRecipient ('age1'+('q'*58)) -AgeExePathSha256 ('1'*64) -AgeExeSha256 ('2'*64) -AgeVersion '1.3.1' `
    -AgeKeygenPathSha256 ('3'*64) -AgeKeygenSha256 ('4'*64) -AgeKeygenVersion '1.3.1'
  Write-Json $invPath $inv
  $id='phase7b-wp2b-capture-auth-'+[guid]::NewGuid().ToString('N')
  $auth=New-Phase7BWorkPackage2CaptureAuthorizationDocument -AuthorizationId $id -AttemptId $attempt -ToolingCommit $tooling `
    -InvocationContractSha256 (Get-Phase7BSha256 -LiteralPath $invPath) -Stage3LauncherSha256 $stage3 `
    -CapturePlanSha256 ('5'*64) -CapturePlanFileName "$attempt-plan.json" -InventorySha256 ('6'*64) `
    -SelectionSha256 ('7'*64) -SelectionFileName "$attempt-selection.json" -SourceRootSha256 ('8'*64) -RuntimeRevision 142 -RuntimeSha256 ('9'*64) `
    -AgeExePathSha256 $inv.ageExePathSha256 -AgeExeSha256 $inv.ageExeSha256 -AgeVersion '1.3.1' `
    -AgeKeygenPathSha256 $inv.ageKeygenPathSha256 -AgeKeygenSha256 $inv.ageKeygenSha256 -AgeKeygenVersion '1.3.1' -AgeRecipient $inv.ageRecipient `
    -LocalOutputRootSha256 ('a'*64) -ReplicaRootSha256 ('b'*64) -ReplicaUncRoot '\\LAPTOP-4G5UOU2R\P7Baaaaaaaa$' `
    -QuiescenceEvidenceSha256 (Get-Phase7BSha256 -LiteralPath $qPath) -QuiescenceEvidenceFileName (Split-Path -Leaf $qPath) `
    -QuiescenceEvidenceToolingCommit $quiescence.toolingCommit -ConsumptionMarkerFileName "$id.used.json" `
    -IssuedAt ([DateTime]::UtcNow.AddMinutes(-1)) -ExpiresAt ([DateTime]::UtcNow.AddHours(1))
  $authPath=Join-Path $root "$attempt-$id.json";Write-Json $authPath $auth
  $pending=New-Phase7BSyntheticPendingDescriptor -Authorization $auth -PacketSha256 ('0'*64) -PacketBytes 4097
  $pendingPath=Join-Path $root "$attempt-pending-descriptor.json";Write-Json $pendingPath $pending
  $receiptName="$attempt-replica-receipt-$('f'*32).json";$receiptPath=Join-Path $root $receiptName
  $receipt=[pscustomobject]@{schemaVersion=1;classification='PHASE7B_WP2_BOUNDED_REPLICA_INDEPENDENT_READBACK_PASS';pass=$true;attemptId=$attempt;evidenceNonce=('f'*32);evidenceFileName=$receiptName;observedAt='2026-08-25T00:00:00Z';packetFileName="$attempt.zip.age";packetSha256=$pending.packetSha256;packetBytes=$pending.packetBytes;destinationBytesReread=$true;encryptedPacketOnly=$true;computerName='LAPTOP-4G5UOU2R';hostIdentitySha256='ea6696e8a0fc4d9242544568d62cd979fd57bd2478fac4f40755b3546776ac3c';diskIdentitySha256='336d31be1f1e6dd4bde254fae94ffebf2b23829520a26c2f5d9bc5deda169896';driveRoot='D:\';fileSystem='NTFS';diskNumber=0;busType='SATA';physicallyIndependent=$true;freeBytes=[int64]10GB;persistentAccountCreated=$false;persistentShareRetained=$false;persistentFirewallRuleRetained=$false;persistentMappingRetained=$false;credentialsPersisted=$false;rawProductionFilesAccepted=$false;sessionTornDown=$true;reportPersisted=$true;automaticRetryAllowed=$false}
  Write-Json $receiptPath $receipt
  $teardownName="$attempt-primary-teardown-$('1'*32).json";$teardownPath=Join-Path $root $teardownName
  Write-Json $teardownPath ([ordered]@{schemaVersion=1;classification='PHASE7B_WP2_PRIMARY_REPLICA_SESSION_TEARDOWN_PASS';pass=$true;attemptId=$attempt;evidenceNonce=('1'*32);evidenceFileName=$teardownName;observedAt='2026-08-25T00:00:00Z';serverName='LAPTOP-4G5UOU2R';shareName='P7Baaaaaaaa$';matchingPsDriveCount=0;matchingSmbMappingCount=0;savedCredentialTargetCount=0;mappingPersistent=$false;credentialsPersisted=$false;sessionTornDown=$true;mutationPerformed=$false;reportPersisted=$true;automaticRetryAllowed=$false})
  $inputs=@{AttemptId=$attempt;PendingDescriptorPath=$pendingPath;ExpectedPendingDescriptorSha256=(Get-Phase7BSha256 -LiteralPath $pendingPath);InvocationContractPath=$invPath;ExpectedInvocationContractSha256=(Get-Phase7BSha256 -LiteralPath $invPath);CaptureAuthorizationPath=$authPath;ExpectedCaptureAuthorizationSha256=(Get-Phase7BSha256 -LiteralPath $authPath);ExpectedToolingCommit=$tooling;ExpectedStage3LauncherSha256=$stage3;ExpectedPacketSha256=$pending.packetSha256;ExpectedPacketBytes=$pending.packetBytes}
  [pscustomobject]@{root=$root;inputs=$inputs;pending=$pending;auth=$auth;invocation=$inv;quiescence=$quiescence;quiescencePath=$qPath;receiptPath=$receiptPath;receipt=$receipt;teardownPath=$teardownPath;finalPath=(Join-Path $root "$attempt-descriptor.json");markerPath=(Join-Path $root "$id.used.json")}
}
function Save-Pending($Case) { Write-Json $Case.inputs.PendingDescriptorPath $Case.pending;$Case.inputs.ExpectedPendingDescriptorSha256=Get-Phase7BSha256 -LiteralPath $Case.inputs.PendingDescriptorPath }
function Save-Authorization($Case) { Write-Json $Case.inputs.CaptureAuthorizationPath $Case.auth;$Case.inputs.ExpectedCaptureAuthorizationSha256=Get-Phase7BSha256 -LiteralPath $Case.inputs.CaptureAuthorizationPath }
function Add-Duplicates($Case) {
  foreach($pair in @{
    captureAuthorizationId=$Case.auth.authorizationId;captureAuthorizationSha256=$Case.inputs.ExpectedCaptureAuthorizationSha256
    captureAuthorizationToolingCommit=$Case.auth.toolingCommit;quiescenceEvidenceSha256=$Case.auth.quiescenceEvidenceSha256
  }.GetEnumerator()) { $Case.pending | Add-Member -NotePropertyName $pair.Key -NotePropertyValue $pair.Value }
  Save-Pending $Case
}
function Invoke-SyntheticFinalizer($Case,[switch]$Resume) {
  $args=$Case.inputs.Clone()
  $args.ReplicaReceiptPath=$Case.receiptPath;$args.ExpectedReplicaReceiptSha256=Get-Phase7BSha256 -LiteralPath $Case.receiptPath
  $args.PrimaryTeardownEvidencePath=$Case.teardownPath;$args.ExpectedPrimaryTeardownEvidenceSha256=Get-Phase7BSha256 -LiteralPath $Case.teardownPath
  $args.AuthorizationAcknowledgement='WP2B_CAPTURE_FINALIZE_INDEPENDENT_REPLICA_EXACTLY_ONCE';$args.OutputPath=$Case.finalPath
  if($Resume){$args.ExactExistingDescriptorResumeAcknowledgement='WP2B_CAPTURE_RESUME_EXACT_EXISTING_FINAL_DESCRIPTOR_READ_ONLY'}
  (@(& $finalizer @args) -join [Environment]::NewLine)|ConvertFrom-Json -ErrorAction Stop
}
if($FixturesOnly){return}
try {
  [void](New-Item -ItemType Directory -Path $testRoot)
  $s=New-Case 'accepted-shape'
  # Exact 44-property shape of the accepted real pending descriptor; all fixture values are synthetic.
  $acceptedNames=('ageEncryptionMode ageExeSha256 ageFileName ageIdentityInputMode ageKeygenSha256 ageKeygenVersion agePluginRequired ageRecipient ageVersion applicationCommit attemptId automaticRetryAllowed capturePlanSha256 classification decryptedStreamBytes decryptedStreamSha256 decryptRoundTripPass decryptRoundTripRequired environmentId ephemeralTransportTeardownRequired independentEncryptedReplicaPass independentLaptopReadbackRequired invocationContractSha256 localEncryptedCopyPass localOutputRootSha256 manifestDigest nativeRecipientRequired packetBytes packetFileName packetSha256 plaintextSecretPersisted plaintextZipBytes plaintextZipSha256 referenceIndexFileSha256 referenceIndexSha256 referenceIndexVersion replicaClassification replicaRootSha256 schemaVersion sourceInventorySha256 sourceRootSha256 stage3LauncherSha256 vmDisplayName windowsHostId').Split(' ')
  Assert-True (@(Compare-Object $acceptedNames @($s.pending.PSObject.Properties.Name) -CaseSensitive).Count -eq 0) 'actual producer expression emits exact accepted real shape'
  $baseline=@(& git -C $repo show 'ebf38ca415eb8d89fc6e02a64d0449e5ae726902:scripts/phase7bFinalizeBoundedReplicaDescriptor.ps1') -join "`n"
  if($LASTEXITCODE -ne 0){throw 'BASELINE_FINALIZER_UNAVAILABLE'}
  $tokens=$null;$errors=$null;$oldAst=[Management.Automation.Language.Parser]::ParseInput($baseline,[ref]$tokens,[ref]$errors)
  $predicates=@($oldAst.FindAll({param($n) $n -is [Management.Automation.Language.IfStatementAst] -and $n.Clauses[0].Item1.Extent.Text.Contains('[string]$pending.classification')},$true))
  Assert-True (@($errors).Count -eq 0 -and $predicates.Count -eq 1) 'published failing predicate is recovered exactly'
  $condition=$predicates[0].Clauses[0].Item1
  Assert-True (@($condition.FindAll({param($n) $n -is [Management.Automation.Language.CommandAst] -or $n -is [Management.Automation.Language.InvokeMemberExpressionAst]},$true)).Count -eq 0) 'old predicate evaluation has no commands or writes'
  $pending=$s.pending;$AttemptId=$s.inputs.AttemptId;$ExpectedInvocationContractSha256=$s.inputs.ExpectedInvocationContractSha256
  $ExpectedStage3LauncherSha256=$s.inputs.ExpectedStage3LauncherSha256;$ExpectedCaptureAuthorizationSha256=$s.inputs.ExpectedCaptureAuthorizationSha256;$ExpectedToolingCommit=$s.inputs.ExpectedToolingCommit
  $oldFailure=$false
  try{[void](& ([scriptblock]::Create($condition.Extent.Text)))}catch{$oldFailure=$_.Exception -is [Management.Automation.PropertyNotFoundException] -and $_.Exception.Message.Contains('captureAuthorizationSha256')}
  Assert-True $oldFailure 'real PS51 reproduces old producer/finalizer PropertyNotFoundException'
  $before=Get-Phase7BSha256 -LiteralPath $s.inputs.PendingDescriptorPath
  $authBefore=Get-Phase7BSha256 -LiteralPath $s.inputs.CaptureAuthorizationPath
  $inputs=$s.inputs
  $valid=Assert-Phase7BWorkPackage2PendingFinalizationInput @inputs
  Assert-True ($valid.pass -and $valid.pendingDescriptorShape -ceq 'NATIVE_RECIPIENT_V1_PRODUCER' -and -not $valid.mutationPerformed) 'exact producer shape validates read-only with authoritative external evidence'
  $result=Invoke-SyntheticFinalizer $s
  Assert-True ($result.pass -and $result.captureAuthorizationConsumed) 'actual producer expression reaches synthetic finalizer PASS'
  $final=Get-Content -LiteralPath $s.finalPath -Raw|ConvertFrom-Json
  foreach($key in $valid.authoritativeBindings.Keys){Assert-True ([string]$final.$key -ceq [string]$valid.authoritativeBindings[$key]) "final descriptor derives exact authoritative $key"}
  Assert-True ((Get-Phase7BSha256 -LiteralPath $s.inputs.PendingDescriptorPath) -ceq $before -and (Get-Phase7BSha256 -LiteralPath $s.inputs.CaptureAuthorizationPath) -ceq $authBefore) 'pending descriptor and authorization remain byte-identical after finalization'
  $consumed=Get-Phase7BWorkPackage2CaptureAuthorizationEligibility -LiteralPath $s.inputs.CaptureAuthorizationPath -ExpectedAttemptId $s.inputs.AttemptId -ExpectedToolingCommit $s.inputs.ExpectedToolingCommit
  Assert-True ($consumed.classification -ceq 'CURRENT_AUTHORIZATION_CONSUMED_TERMINAL') 'marker-only consumption is terminal'
  Assert-True (-not (Invoke-SyntheticFinalizer $s -Resume).pass) 'already consumed final descriptor cannot be resumed'

  $cases=@('no-authorization','auth-hash','auth-id','auth-tooling','quiescence-hash','quiescence-missing','quiescence-state','quiescence-nonce',
    'packet-sha','packet-bytes','invocation-hash','invocation-commit','stage3-hash','expected-commit','attempt','pending-hash',
    'duplicate-hash','duplicate-commit','duplicate-quiescence','partial-duplicates','missing-owned','unknown-field','schema',
    'expired','consumed','recipient','mode','roundtrip-hash','roundtrip-bytes','roundtrip-flag','retry','string-boolean','string-bytes','fractional-bytes')
  foreach($name in $cases){
    $s=New-Case $name
    switch($name){
      'no-authorization' {$s.inputs.CaptureAuthorizationPath=Join-Path $s.root 'absent.json'}
      'auth-hash' {$s.inputs.ExpectedCaptureAuthorizationSha256='f'*64}
      'auth-id' {Add-Duplicates $s;$s.pending.captureAuthorizationId='phase7b-wp2b-capture-auth-'+('0'*32);Save-Pending $s}
      'auth-tooling' {$s.auth.toolingCommit='f'*40;Save-Authorization $s}
      'quiescence-hash' {$s.auth.quiescenceEvidenceSha256='f'*64;Save-Authorization $s}
      'quiescence-missing' {$s.auth.quiescenceEvidenceFileName='phase7b-wp2b-quiescence-'+('0'*32)+'.json';Save-Authorization $s}
      'quiescence-state' {$s.quiescence.monitorTaskDisabled=$false;Write-Json $s.quiescencePath $s.quiescence;$s.auth.quiescenceEvidenceSha256=Get-Phase7BSha256 -LiteralPath $s.quiescencePath;Save-Authorization $s}
      'quiescence-nonce' {$s.quiescence.nonce='0'*32;Write-Json $s.quiescencePath $s.quiescence;$s.auth.quiescenceEvidenceSha256=Get-Phase7BSha256 -LiteralPath $s.quiescencePath;Save-Authorization $s}
      'packet-sha' {$s.pending.packetSha256='f'*64;Save-Pending $s}
      'packet-bytes' {$s.pending.packetBytes++;Save-Pending $s}
      'invocation-hash' {$s.inputs.ExpectedInvocationContractSha256='f'*64}
      'invocation-commit' {$s.invocation.toolingCommit='f'*40;Write-Json $s.inputs.InvocationContractPath $s.invocation;$s.inputs.ExpectedInvocationContractSha256=Get-Phase7BSha256 -LiteralPath $s.inputs.InvocationContractPath;$s.pending.invocationContractSha256=$s.inputs.ExpectedInvocationContractSha256;Save-Pending $s}
      'stage3-hash' {$s.inputs.ExpectedStage3LauncherSha256='f'*64}
      'expected-commit' {$s.inputs.ExpectedToolingCommit='f'*40}
      'attempt' {$s.inputs.AttemptId='phase7b-wp2-'+('0'*32)}
      'pending-hash' {$s.inputs.ExpectedPendingDescriptorSha256='f'*64}
      'duplicate-hash' {Add-Duplicates $s;$s.pending.captureAuthorizationSha256='f'*64;Save-Pending $s}
      'duplicate-commit' {Add-Duplicates $s;$s.pending.captureAuthorizationToolingCommit='f'*40;Save-Pending $s}
      'duplicate-quiescence' {Add-Duplicates $s;$s.pending.quiescenceEvidenceSha256='f'*64;Save-Pending $s}
      'partial-duplicates' {$s.pending|Add-Member -NotePropertyName captureAuthorizationId -NotePropertyValue $s.auth.authorizationId;Save-Pending $s}
      'missing-owned' {$s.pending.PSObject.Properties.Remove('referenceIndexFileSha256');Save-Pending $s}
      'unknown-field' {$s.pending|Add-Member -NotePropertyName unexpectedField -NotePropertyValue 'extra';Save-Pending $s}
      'schema' {$s.pending.schemaVersion=2;Save-Pending $s}
      'expired' {$s.auth.issuedAt=[DateTime]::UtcNow.AddHours(-2).ToString('o');$s.auth.expiresAt=[DateTime]::UtcNow.AddHours(-1).ToString('o');Save-Authorization $s}
      'consumed' {Write-Json $s.markerPath ([ordered]@{syntheticExistingMarker=$true})}
      'recipient' {$s.pending.ageRecipient='age1'+('p'*58);Save-Pending $s}
      'mode' {$s.pending.ageEncryptionMode='passphrase';Save-Pending $s}
      'roundtrip-hash' {$s.pending.decryptedStreamSha256='e'*64;Save-Pending $s}
      'roundtrip-bytes' {$s.pending.decryptedStreamBytes++;Save-Pending $s}
      'roundtrip-flag' {$s.pending.decryptRoundTripPass=$false;Save-Pending $s}
      'retry' {$s.pending.automaticRetryAllowed=$true;Save-Pending $s}
      'string-boolean' {$s.pending.nativeRecipientRequired='true';Save-Pending $s}
      'string-bytes' {$s.pending.packetBytes='4097';Save-Pending $s}
      'fractional-bytes' {$s.pending.packetBytes=4097.1;Save-Pending $s}
    }
    $snapshot=@(Get-ChildItem -LiteralPath $s.root -File|ForEach-Object{$_.Name+':'+(Get-Phase7BSha256 -LiteralPath $_.FullName)})
    $inputs=$s.inputs;$rejected=$false
    try{[void](Assert-Phase7BWorkPackage2PendingFinalizationInput @inputs)}catch{$rejected=$_.Exception.Message -match '^PHASE7B_'}
    Assert-True $rejected "pre-write validator rejects $name"
    $failure=Invoke-SyntheticFinalizer $s
    Assert-True (-not $failure.pass -and -not $failure.mutationStarted -and -not (Test-Path -LiteralPath $s.finalPath)) "finalizer rejects $name before writing"
    $after=@(Get-ChildItem -LiteralPath $s.root -File|ForEach-Object{$_.Name+':'+(Get-Phase7BSha256 -LiteralPath $_.FullName)})
    Assert-True (@(Compare-Object $snapshot $after).Count -eq 0) "$name leaves all synthetic input/marker evidence unchanged"
  }
  foreach($name in @('duplicate-pass','exact-descriptor-resume')){
    $s=New-Case $name
    if($name -ceq 'duplicate-pass'){Add-Duplicates $s}
    $inputs=$s.inputs;$validated=Assert-Phase7BWorkPackage2PendingFinalizationInput @inputs
    if($name -ceq 'exact-descriptor-resume'){
      $descriptor=[ordered]@{};foreach($p in $s.pending.PSObject.Properties){$descriptor[$p.Name]=$p.Value}
      foreach($key in $validated.authoritativeBindings.Keys){$descriptor[$key]=$validated.authoritativeBindings[$key]}
      $descriptor.classification='PHASE7B_WP2_ENCRYPTED_PACKET_AND_REPLICA_PASS';$descriptor.independentEncryptedReplicaPass=$true
      $descriptor.independentLaptopReadbackRequired=$false;$descriptor.ephemeralTransportTeardownRequired=$false
      $descriptor.replicaReceiptSha256=Get-Phase7BSha256 -LiteralPath $s.receiptPath
      $descriptor.primarySessionTeardownEvidenceSha256=Get-Phase7BSha256 -LiteralPath $s.teardownPath
      Write-Json $s.finalPath $descriptor
      $originalFinal=Get-Phase7BSha256 -LiteralPath $s.finalPath
      $result=Invoke-SyntheticFinalizer $s -Resume
      Assert-True ($result.exactExistingDescriptorReused -and (Get-Phase7BSha256 -LiteralPath $s.finalPath) -ceq $originalFinal) 'exact descriptor recovery preserves existing descriptor bytes'
    }else{$result=Invoke-SyntheticFinalizer $s}
    Assert-True ($result.pass -and $result.captureAuthorizationConsumed -and (Test-Path -LiteralPath $s.markerPath)) "$name validates exact evidence and consumes only once"
  }
  foreach($name in @('receipt-packet-sha','receipt-packet-bytes','teardown-residue')){
    $s=New-Case $name
    if($name -ceq 'teardown-residue'){$t=Get-Content -LiteralPath $s.teardownPath -Raw|ConvertFrom-Json;$t.matchingSmbMappingCount=1;Write-Json $s.teardownPath $t}
    else{if($name -ceq 'receipt-packet-sha'){$s.receipt.packetSha256='f'*64}else{$s.receipt.packetBytes++};Write-Json $s.receiptPath $s.receipt}
    $failure=Invoke-SyntheticFinalizer $s
    Assert-True (-not $failure.pass -and -not $failure.mutationStarted -and -not (Test-Path -LiteralPath $s.markerPath)) "$name rejected before final write/consumption"
  }
  $stage5=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'phase7bRunWorkPackage2Stage5.ps1') -Raw
  $finalize=Get-Content -LiteralPath $finalizer -Raw
  Assert-True ($stage5.IndexOf('Assert-Phase7BWorkPackage2PendingFinalizationInput') -lt $stage5.IndexOf('phase7bVerifyPrimaryReplicaSessionClosed.ps1')) 'shared pure validator precedes first durable Stage5 write'
  Assert-True ($stage5.IndexOf('phase7bVerifyPrimaryReplicaSessionClosed.ps1') -lt $stage5.IndexOf('phase7bImportBoundedReplicaReceipt.ps1') -and $stage5.IndexOf('phase7bImportBoundedReplicaReceipt.ps1') -lt $stage5.IndexOf('phase7bFinalizeBoundedReplicaDescriptor.ps1')) 'teardown, receipt, finalizer ordering preserved'
  Assert-True ($finalize.IndexOf('$persisted = Write-Phase7BSafeEvidenceFile') -lt $finalize.LastIndexOf('Use-Phase7BWorkPackage2CaptureAuthorization')) 'new descriptor persisted before marker consumption'
  Assert-True ($stage5.Contains('-ExpectedPendingDescriptorSha256 $pendingSha') -and -not $finalize.Contains('Remove-Item')) 'preflight pending hash stays pinned through finalizer and pending is never deleted'
  $tokens=$null;$errors=$null;$lifecycleAst=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'phase7bWorkPackage2OperatorLifecycle.psm1'),[ref]$tokens,[ref]$errors)
  $validator=@($lifecycleAst.FindAll({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -ceq 'Assert-Phase7BWorkPackage2PendingFinalizationInput'},$true))[0]
  $commands=@($validator.Body.FindAll({param($n)$n -is [Management.Automation.Language.CommandAst]},$true)|ForEach-Object{$_.GetCommandName()}|Sort-Object -Unique)
  $allowed=@('Get-Phase7BSha256','Get-Content','ConvertFrom-Json','Where-Object','Get-Phase7BWorkPackage2Contract',
    'Assert-Phase7BWorkPackage2InvocationContract','Assert-Phase7BWorkPackage2Authorization','Join-Path','Split-Path',
    'Assert-Phase7BWorkPackage2CaptureAuthorization','Test-Phase7BWorkPackage2QuiescenceEvidence')
  Assert-True (@($commands|Where-Object{$allowed -cnotcontains $_}).Count -eq 0) 'validator command allowlist forbids live stages, writes, network, secret input and retry'
  foreach($name in @('phase7bWorkPackage2OperatorLifecycle.psm1','phase7bFinalizeBoundedReplicaDescriptor.ps1','phase7bRunWorkPackage2Stage5.ps1','test-support\phase7bPendingDescriptorFixture.ps1')){
    $tokens=$null;$errors=$null;$ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $name),[ref]$tokens,[ref]$errors)
    Assert-True (@($errors).Count -eq 0 -and @($ast.FindAll({param($n)$n -is [Management.Automation.Language.ExitStatementAst]},$true)).Count -eq 0) "$name PS51 parse and raw-exit checks"
  }
} finally {
  # Only this test's newly allocated synthetic directory may be removed.
  $resolved=[IO.Path]::GetFullPath($testRoot)
  $allowed=[IO.Path]::GetFullPath((Join-Path $repo '.tmp')).TrimEnd('\')+'\phase7b-finalization-tests-'
  if(-not $resolved.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase)){throw 'SYNTHETIC_CLEANUP_BOUNDARY_FAIL'}
  if(Test-Path -LiteralPath $resolved){Remove-Item -LiteralPath $resolved -Recurse -Force}
}
[ordered]@{classification='PHASE7B_WP2_PENDING_FINALIZATION_WINDOWS_PS51_TESTS_PASS';pass=$true;assertions=$script:assertions;liveStageExecuted=$false;liveEvidenceTouched=$false;automaticRetryAllowed=$false;wp2cAuthorized=$false}|ConvertTo-Json -Compress
