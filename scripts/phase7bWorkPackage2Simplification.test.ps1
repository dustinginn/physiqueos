$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2Contract.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2OperatorLifecycle.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2AuthorizationEligibility.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2Orchestration.psm1') -Force
$script:assertions=0
function Assert-True([bool]$value,[string]$message){if(-not $value){throw "ASSERTION_FAILED:$message"};$script:assertions++}
function Write-Json([string]$path,$value){[IO.File]::WriteAllText($path,($value|ConvertTo-Json -Depth 12 -Compress),(New-Object Text.UTF8Encoding($false)))}
function New-Authorization([string]$attempt,[string]$commit,[string]$id,[DateTime]$expires){
  $h='a'*64
  [pscustomobject][ordered]@{schemaVersion=1;classification='PHASE7B_WP2_STAGE_AUTHORIZATION';captureAuthorizationClassification='PHASE7B_WP2B_CAPTURE_AUTHORIZATION';authorizationId=$id;attemptId=$attempt;toolingCommit=$commit;authorizedStages=@([pscustomobject]@{stage='WP2B_CAPTURE';mutationBudget=1});issuedAt=$expires.AddHours(-1).ToUniversalTime().ToString('o');expiresAt=$expires.ToUniversalTime().ToString('o');maximumAuthorizationLifetimeHours=24;oneUseOnly=$true;automaticRetryAllowed=$false;wp2cAuthorized=$false;consumptionMarkerFileName="$id.used.json";invocationContractSha256=$h;stage3LauncherSha256=$h;ageEncryptionMode='native-recipient-v1';ageRecipient=('age1'+('q'*58));ageIdentityInputMode='stdin';nativeRecipientRequired=$true;agePluginRequired=$false;ageVersion='1.3.1';ageKeygenPathSha256=$h;ageKeygenSha256=$h;ageKeygenVersion='1.3.1';decryptRoundTripRequired=$true;applicationCommit=('b'*40);environmentId='production';vmDisplayName='PhysiqueOS';windowsHostId='host';manifestDigest=$h;capturePlanSha256=$h;sourceInventorySha256=$h;selectionSha256=$h;sourceRootSha256=$h;runtimeRevision=1;runtimeSha256=$h;localOutputRootSha256=$h;replicaRootSha256=$h;replicaUncRoot='\\LAPTOP-4G5UOU2R\P7B11111111$';replicaPathModel='EXACT_ATTEMPT_ROOT';laptopHostIdentitySha256=$h;laptopDiskIdentitySha256=$h;ageExePathSha256=$h;ageExeSha256=$h;quiescenceEvidenceSha256=$h;quiescenceEvidenceFileName=('phase7b-wp2b-quiescence-'+('c'*32)+'.json');quiescenceEvidenceToolingCommit=$commit;founderApproved=$true}
}
$root=Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..\.tmp')).Path "phase7b-wp2-simplification-$([guid]::NewGuid().ToString('N'))"
try{
  [void](New-Item -ItemType Directory -Path $root)
  $attempt='phase7b-wp2-'+('1'*32);$current='2'*40;$old='3'*40
  foreach($count in @(0,1,3,4)){
    $caseRoot=Join-Path $root "history-$count";[void](New-Item -ItemType Directory -Path $caseRoot)
    for($i=0;$i -lt $count;$i++){$id='phase7b-wp2b-capture-auth-'+(([string]$i).PadLeft(32,'a'));Write-Json (Join-Path $caseRoot "$attempt-$id.json") (New-Authorization $attempt $old $id ([DateTime]::UtcNow.AddHours(1)))}
    $before=@(Get-ChildItem $caseRoot -File|ForEach-Object{"$($_.Name):$((Get-FileHash $_.FullName -Algorithm SHA256).Hash)"})
    $set=Get-Phase7BWorkPackage2CaptureAuthorizationSet -EvidenceRoot $caseRoot -ExpectedAttemptId $attempt -ExpectedToolingCommit $current
    $after=@(Get-ChildItem $caseRoot -File|ForEach-Object{"$($_.Name):$((Get-FileHash $_.FullName -Algorithm SHA256).Hash)"})
    Assert-True ($set.pass -and $set.historicalAuditEvidenceCount -eq $count) "arbitrary historical count $count does not block"
    Assert-True (@(Compare-Object $before $after).Count -eq 0) "history $count remains byte-identical"
  }
  $currentRoot=Join-Path $root 'current';[void](New-Item -ItemType Directory -Path $currentRoot)
  $id='phase7b-wp2b-capture-auth-'+('4'*32);$path=Join-Path $currentRoot "$attempt-$id.json"
  Write-Json $path (New-Authorization $attempt $current $id ([DateTime]::UtcNow.AddHours(1)))
  $eligible=Get-Phase7BWorkPackage2CaptureAuthorizationSet -EvidenceRoot $currentRoot -ExpectedAttemptId $attempt -ExpectedToolingCommit $current
  Assert-True (-not $eligible.pass -and $eligible.conflictingCurrentAuthorizationCount -eq 1) 'eligible current authorization blocks creation'
  [IO.File]::WriteAllText((Join-Path $currentRoot "$id.used.json"),'used',(New-Object Text.UTF8Encoding($false)))
  $consumed=Get-Phase7BWorkPackage2CaptureAuthorizationSet -EvidenceRoot $currentRoot -ExpectedAttemptId $attempt -ExpectedToolingCommit $current
  Assert-True ($consumed.pass -and @($consumed.candidates|Where-Object{$_.classification -ceq 'CURRENT_AUTHORIZATION_CONSUMED_TERMINAL'}).Count -eq 1) 'consumed current authorization is terminal and ineligible'
  Remove-Item (Join-Path $currentRoot "$id.used.json")
  Write-Json $path (New-Authorization $attempt $current $id ([DateTime]::UtcNow.AddMinutes(-1)))
  $expired=Get-Phase7BWorkPackage2CaptureAuthorizationSet -EvidenceRoot $currentRoot -ExpectedAttemptId $attempt -ExpectedToolingCommit $current
  Assert-True ($expired.pass -and @($expired.candidates|Where-Object{$_.classification -ceq 'CURRENT_AUTHORIZATION_EXPIRED_TERMINAL'}).Count -eq 1) 'expired current authorization is terminal and ineligible'
  $wrongAttempt=Get-Phase7BWorkPackage2CaptureAuthorizationEligibility -LiteralPath $path -ExpectedAttemptId ('phase7b-wp2-'+('9'*32)) -ExpectedToolingCommit $current
  Assert-True (-not $wrongAttempt.eligible -and -not $wrongAttempt.currentBinding) 'wrong attempt cannot become current'
  $wrongCommit=Get-Phase7BWorkPackage2CaptureAuthorizationEligibility -LiteralPath $path -ExpectedAttemptId $attempt -ExpectedToolingCommit ('8'*40)
  Assert-True (-not $wrongCommit.eligible -and -not $wrongCommit.currentBinding) 'older tooling commit cannot execute as current'
  foreach($case in @('wrong-stage','wrong-budget','automatic-retry','native-false','plugin-true','mode-wrong','roundtrip-false','native-absent','roundtrip-absent')){
    $caseRoot=Join-Path $root $case;[void](New-Item -ItemType Directory -Path $caseRoot)
    $caseId='phase7b-wp2b-capture-auth-'+(([string]$case.Length).PadLeft(32,'6'))
    $caseAuthorization=New-Authorization $attempt $current $caseId ([DateTime]::UtcNow.AddHours(1))
    if($case -ceq 'wrong-stage'){$caseAuthorization.authorizedStages[0].stage='WP2C_STAGE'}
    elseif($case -ceq 'wrong-budget'){$caseAuthorization.authorizedStages[0].mutationBudget=2}
    elseif($case -ceq 'automatic-retry'){$caseAuthorization.automaticRetryAllowed=$true}
    elseif($case -ceq 'native-false'){$caseAuthorization.nativeRecipientRequired=$false}
    elseif($case -ceq 'plugin-true'){$caseAuthorization.agePluginRequired=$true}
    elseif($case -ceq 'mode-wrong'){$caseAuthorization.ageEncryptionMode='passphrase'}
    elseif($case -ceq 'roundtrip-false'){$caseAuthorization.decryptRoundTripRequired=$false}
    elseif($case -ceq 'native-absent'){$caseAuthorization.PSObject.Properties.Remove('nativeRecipientRequired')}
    else{$caseAuthorization.PSObject.Properties.Remove('decryptRoundTripRequired')}
    $casePath=Join-Path $caseRoot "$attempt-$caseId.json";Write-Json $casePath $caseAuthorization
    $invalid=Get-Phase7BWorkPackage2CaptureAuthorizationSet -EvidenceRoot $caseRoot -ExpectedAttemptId $attempt -ExpectedToolingCommit $current
    Assert-True (-not $invalid.pass -and $invalid.conflictingCurrentAuthorizationCount -eq 1 -and
      @($invalid.candidates|Where-Object{$_.classification -ceq 'CURRENT_AUTHORIZATION_INVALID_CONFLICT'}).Count -eq 1) "invalid current authorization blocks creation:$case"
  }

  $artifacts=@([pscustomobject]@{relativePath='scripts/a.ps1';sha256='a'*64;bytes=12},[pscustomobject]@{relativePath='scripts/b.psm1';sha256='b'*64;bytes=34})
  $contractArgs=@{AttemptId=$attempt;ToolingCommit=$current;ApplicationCommit=('5'*40);AgeRecipient=('age1'+('q'*58));AgeExePathSha256=('6'*64);AgeExeSha256=('7'*64);AgeVersion='1.3.1';AgeKeygenPathSha256=('8'*64);AgeKeygenSha256=('9'*64);AgeKeygenVersion='1.3.1'}
  $one=New-Phase7BWorkPackage2InvocationContractDocument @contractArgs -Artifacts $artifacts
  $two=New-Phase7BWorkPackage2InvocationContractDocument @contractArgs -Artifacts @($artifacts[1],$artifacts[0])
  Assert-True (($one|ConvertTo-Json -Depth 12 -Compress) -ceq ($two|ConvertTo-Json -Depth 12 -Compress)) 'orchestration regeneration is deterministic independent of input enumeration'
  $generatedContractPath=Join-Path $root 'ignored-generated-invocation-contract.json'
  Write-Json $generatedContractPath $one;$firstGeneratedHash=(Get-FileHash -LiteralPath $generatedContractPath -Algorithm SHA256).Hash
  Remove-Item -LiteralPath $generatedContractPath
  Write-Json $generatedContractPath $two;$secondGeneratedHash=(Get-FileHash -LiteralPath $generatedContractPath -Algorithm SHA256).Hash
  Assert-True ($firstGeneratedHash -ceq $secondGeneratedHash) 'deleted ignored orchestration contract is recreated byte-identically from tracked deterministic source'

  $capture=Get-Content (Join-Path $PSScriptRoot 'phase7bPrepareWorkPackage2EncryptedPacket.ps1') -Raw
  $finalize=Get-Content (Join-Path $PSScriptRoot 'phase7bFinalizeBoundedReplicaDescriptor.ps1') -Raw
  $bridge=Get-Content (Join-Path $PSScriptRoot 'phase7bWindowsAgeIdentityBridge.psm1') -Raw
  $operator=Get-Content (Join-Path $PSScriptRoot 'phase7bWorkPackage2OperatorLifecycle.psm1') -Raw
  Assert-True ($capture.Contains('plaintextZipSha256') -and $capture.Contains('decryptedStreamSha256') -and $capture.Contains('Invoke-Phase7BAgeNativeIdentityDecryptionToHash')) 'Stage3 binds plaintext and decrypted stream identities'
  Assert-True ($capture.IndexOf('Invoke-Phase7BAgeNativeIdentityDecryptionToHash') -lt $capture.IndexOf('Copy-Phase7BBoundedEncryptedReplica')) 'decrypt verification precedes replica mutation'
  Assert-True (-not $capture.Contains('Use-Phase7BWorkPackage2CaptureAuthorization') -and $finalize.Contains('Use-Phase7BWorkPackage2CaptureAuthorization')) 'authorization consumption occurs at Stage5 finalization'
  Assert-True ($bridge.Contains('RedirectStandardOutput = $true') -and $bridge.Contains('StandardOutput.BaseStream') -and $bridge.Contains('RedirectStandardInput = $true')) 'binary decrypt hashes stdout and supplies the identity only through stdin'
  Assert-True ($bridge -notmatch '(?i)AGE_PASSPHRASE\s*=|SetEnvironmentVariable|--passphrase-file|WriteConsoleInputW') 'no secret environment, file, or ConsoleHost injection channel'
  Assert-True (-not $operator.Contains('Test-Phase7BExactStaleCaptureAuthorizationPrerequisite') -and
    -not $operator.Contains('Test-Phase7BExactTwoHistoricalCaptureAuthorizationPrerequisite')) 'historical exact-one/exact-two authorization ratchets are removed'
  foreach($name in @('phase7bRunWorkPackage2Stage3.ps1','phase7bRunWorkPackage2Stage4.ps1','phase7bRunWorkPackage2Stage5.ps1','phase7bNewWorkPackage2InvocationContract.ps1')){
    $pathToParse=Join-Path $PSScriptRoot $name;$tokens=$null;$errors=$null;$ast=[Management.Automation.Language.Parser]::ParseFile($pathToParse,[ref]$tokens,[ref]$errors)
    Assert-True (@($errors).Count -eq 0) "$name parses";Assert-True (@($ast.FindAll({param($n)$n -is [Management.Automation.Language.ExitStatementAst]},$true)).Count -eq 0) "$name has no raw exit"
  }
}finally{if(Test-Path $root){Remove-Item $root -Recurse -Force}}
[ordered]@{classification='PHASE7B_WP2_SIMPLIFICATION_TESTS_PASS';pass=$true;assertions=$script:assertions;liveExecutionPerformed=$false;automaticRetryAllowed=$false;wp2cAuthorized=$false}|ConvertTo-Json -Compress
