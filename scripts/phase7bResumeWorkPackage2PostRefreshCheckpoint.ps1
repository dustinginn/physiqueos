[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ExpectedAttemptId,
  [Parameter(Mandatory = $true)][string]$ExpectedCurrentToolingCommit,
  [Parameter(Mandatory = $true)][string]$ExpectedRefreshToolingCommit,
  [Parameter(Mandatory = $true)][string]$ExpectedEvidenceToolingCommit,
  [Parameter(Mandatory = $true)][string]$ExpectedApplicationCommit,
  [Parameter(Mandatory = $true)][string]$SourceRoot,
  [Parameter(Mandatory = $true)][string]$ExpectedSourceRootSha256,
  [Parameter(Mandatory = $true)][int64]$ExpectedRuntimeRevision,
  [Parameter(Mandatory = $true)][string]$ExpectedRuntimeSha256,
  [Parameter(Mandatory = $true)][string]$ExpectedControlSha256,
  [Parameter(Mandatory = $true)][string]$EvidenceRoot,
  [Parameter(Mandatory = $true)][string]$EvidencePath,
  [Parameter(Mandatory = $true)][string]$ExpectedEvidenceFileName,
  [Parameter(Mandatory = $true)][string]$ExpectedEvidenceSha256,
  [Parameter(Mandatory = $true)][string]$ExpectedRefreshNonce,
  [Parameter(Mandatory = $true)][string]$ExpectedSelectionFileName,
  [Parameter(Mandatory = $true)][string]$ExpectedSelectionSha256,
  [Parameter(Mandatory = $true)][string]$ExpectedInventoryAuthorizationFileName,
  [Parameter(Mandatory = $true)][string]$ExpectedInventoryAuthorizationSha256,
  [Parameter(Mandatory = $true)][string]$ExpectedCapturePlanFileName,
  [Parameter(Mandatory = $true)][string]$ExpectedCapturePlanSha256,
  [Parameter(Mandatory = $true)][string]$ExpectedSourceInventorySha256,
  [Parameter(Mandatory = $true)][int]$ExpectedFileCount,
  [Parameter(Mandatory = $true)][int64]$ExpectedTotalBytes,
  [Parameter(Mandatory = $true)][string]$ExpectedStaleCaptureAuthorizationFileName,
  [Parameter(Mandatory = $true)][string]$ExpectedStaleCaptureAuthorizationSha256,
  [Parameter(Mandatory = $true)][string]$ExpectedStaleCaptureAuthorizationId,
  [Parameter(Mandatory = $true)][string]$ExpectedStaleCaptureAuthorizationToolingCommit,
  [string]$ExpectedSecondHistoricalCaptureAuthorizationFileName = '',
  [string]$ExpectedSecondHistoricalCaptureAuthorizationSha256 = '',
  [string]$ExpectedSecondHistoricalCaptureAuthorizationId = '',
  [string]$ExpectedSecondHistoricalCaptureAuthorizationToolingCommit = '',
  [Parameter(Mandatory = $true)][string]$ReplacementAuthorizationAcknowledgement,
  [Parameter(Mandatory = $true)][string]$AuthorizationAcknowledgement
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2OperatorLifecycle.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2Contract.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bIsolatedGuestContract.psm1') -Force
$stage = 'validate-input'
try {
  $twoHistoricalRecovery = $ReplacementAuthorizationAcknowledgement -ceq 'WP2B_CAPTURE_REPLACEMENT_VALIDATE_EXACT_TWO_HISTORICAL_AUTHORIZATIONS_READ_ONLY'
  $commits = @($ExpectedCurrentToolingCommit,$ExpectedRefreshToolingCommit,$ExpectedEvidenceToolingCommit,$ExpectedApplicationCommit)
  $hashes = @($ExpectedSourceRootSha256,$ExpectedRuntimeSha256,$ExpectedControlSha256,$ExpectedEvidenceSha256,
    $ExpectedSelectionSha256,$ExpectedInventoryAuthorizationSha256,$ExpectedCapturePlanSha256,$ExpectedSourceInventorySha256,
    $ExpectedStaleCaptureAuthorizationSha256)
  if ($twoHistoricalRecovery) { $hashes += $ExpectedSecondHistoricalCaptureAuthorizationSha256 }
  if ($AuthorizationAcknowledgement -cne 'WP2B_CAPTURE_RESUME_EXACT_POST_REFRESH_CHECKPOINT_READ_ONLY' -or
      (-not $twoHistoricalRecovery -and $ReplacementAuthorizationAcknowledgement -cne 'WP2B_CAPTURE_REPLACEMENT_VALIDATE_EXACT_STALE_AUTHORIZATION_READ_ONLY') -or
      $ExpectedAttemptId -cnotmatch '^phase7b-wp2-[0-9a-f]{32}$' -or $ExpectedRefreshNonce -cnotmatch '^[0-9a-f]{32}$' -or
      $ExpectedStaleCaptureAuthorizationId -cnotmatch '^phase7b-wp2b-capture-auth-[0-9a-f]{32}$' -or
      $ExpectedStaleCaptureAuthorizationToolingCommit -cnotmatch '^[0-9a-f]{40}$' -or
      $ExpectedStaleCaptureAuthorizationFileName -cne "$ExpectedAttemptId-$ExpectedStaleCaptureAuthorizationId.json" -or
      ($twoHistoricalRecovery -and ($ExpectedSecondHistoricalCaptureAuthorizationId -cnotmatch '^phase7b-wp2b-capture-auth-[0-9a-f]{32}$' -or
        $ExpectedSecondHistoricalCaptureAuthorizationToolingCommit -cnotmatch '^[0-9a-f]{40}$' -or
        $ExpectedSecondHistoricalCaptureAuthorizationFileName -cne "$ExpectedAttemptId-$ExpectedSecondHistoricalCaptureAuthorizationId.json" -or
        $ExpectedSecondHistoricalCaptureAuthorizationId -ceq $ExpectedStaleCaptureAuthorizationId -or
        $ExpectedSecondHistoricalCaptureAuthorizationFileName -ceq $ExpectedStaleCaptureAuthorizationFileName)) -or
      (-not $twoHistoricalRecovery -and @(@($ExpectedSecondHistoricalCaptureAuthorizationFileName,$ExpectedSecondHistoricalCaptureAuthorizationSha256,
        $ExpectedSecondHistoricalCaptureAuthorizationId,$ExpectedSecondHistoricalCaptureAuthorizationToolingCommit) | Where-Object { $_ }).Count -ne 0) -or
      @($commits | Where-Object { $_ -cnotmatch '^[0-9a-f]{40}$' }).Count -gt 0 -or
      @($hashes | Where-Object { $_ -cnotmatch '^[0-9a-f]{64}$' }).Count -gt 0 -or
      $ExpectedRuntimeRevision -lt 1 -or $ExpectedFileCount -lt 1 -or $ExpectedTotalBytes -lt 1) {
    throw 'PHASE7B_WP2B_POST_REFRESH_RESUME_ARGUMENT_OR_AUTHORIZATION_FAIL'
  }
  $repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path.TrimEnd('\')
  $source = (Resolve-Path -LiteralPath $SourceRoot -ErrorAction Stop).Path.TrimEnd('\')
  $evidenceDirectory = (Resolve-Path -LiteralPath $EvidenceRoot -ErrorAction Stop).Path.TrimEnd('\')
  $expectedEvidencePath = Join-Path $evidenceDirectory $ExpectedEvidenceFileName
  if (-not ([IO.Path]::GetFullPath($EvidencePath)).Equals([IO.Path]::GetFullPath($expectedEvidencePath),[StringComparison]::OrdinalIgnoreCase)) {
    throw 'PHASE7B_WP2B_POST_REFRESH_RESUME_EVIDENCE_PATH_FAIL'
  }
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'PHASE7B_WP2B_POST_REFRESH_RESUME_ELEVATION_REQUIRED' }

  $stage = 'validate-repository-source-and-checkpoint'
  $head = (& git -C $repositoryRoot rev-parse HEAD).Trim().ToLowerInvariant()
  $branch = (& git -C $repositoryRoot branch --show-current).Trim()
  $delta = (& git -C $repositoryRoot rev-list --left-right --count 'HEAD...origin/combined-app-platform-cutover').Trim()
  $dirty = @(& git -C $repositoryRoot status --short --untracked-files=no)
  $repositoryIdentityPass = $head -ceq $ExpectedCurrentToolingCommit -and $branch -ceq 'combined-app-platform-cutover' -and $delta -ceq "0`t0" -and $dirty.Count -eq 0
  $applicationBindingPass = [string](Get-Phase7BWorkPackage2Contract).applicationCommit -ceq $ExpectedApplicationCommit
  $sourceRootSha256 = Get-Phase7BSha256 -Text $source.ToLowerInvariant()
  $sourceRootBindingPass = $sourceRootSha256 -ceq $ExpectedSourceRootSha256
  $auditScript = Join-Path $PSScriptRoot 'phase7bAuditWorkPackage2CaptureSource.mjs'
  $auditBeforeText = @(& node --no-warnings $auditScript $source) -join [Environment]::NewLine
  if ($LASTEXITCODE -ne 0) { throw 'PHASE7B_WP2B_POST_REFRESH_SOURCE_AUDIT_NONZERO' }
  $auditBefore = $auditBeforeText | ConvertFrom-Json -ErrorAction Stop

  $evidenceCandidates = @(Get-ChildItem -LiteralPath $evidenceDirectory -Filter 'phase7b-wp2b-quiescence-*.json' -File -ErrorAction Stop)
  $observedEvidenceFileName = if ($evidenceCandidates.Count -eq 1) { [string]$evidenceCandidates[0].Name } else { '' }
  $observedEvidenceSha256 = if ($evidenceCandidates.Count -eq 1) { Get-Phase7BSha256 -LiteralPath $evidenceCandidates[0].FullName } else { '' }
  $evidence = if ($evidenceCandidates.Count -eq 1) { Get-Content -LiteralPath $evidenceCandidates[0].FullName -Raw | ConvertFrom-Json -ErrorAction Stop } else { [pscustomobject]@{} }

  $refreshArtifacts = @(Get-ChildItem -LiteralPath $evidenceDirectory -Filter "$ExpectedAttemptId-refresh-*.json" -File -ErrorAction Stop)
  $selectionPath = Join-Path $evidenceDirectory $ExpectedSelectionFileName
  $inventoryAuthorizationPath = Join-Path $evidenceDirectory $ExpectedInventoryAuthorizationFileName
  $capturePlanPath = Join-Path $evidenceDirectory $ExpectedCapturePlanFileName
  $observedSelectionSha256 = if (Test-Path -LiteralPath $selectionPath -PathType Leaf) { Get-Phase7BSha256 -LiteralPath $selectionPath } else { '' }
  $observedInventoryAuthorizationSha256 = if (Test-Path -LiteralPath $inventoryAuthorizationPath -PathType Leaf) { Get-Phase7BSha256 -LiteralPath $inventoryAuthorizationPath } else { '' }
  $observedCapturePlanSha256 = if (Test-Path -LiteralPath $capturePlanPath -PathType Leaf) { Get-Phase7BSha256 -LiteralPath $capturePlanPath } else { '' }
  $observedRefreshNonces = @($refreshArtifacts | ForEach-Object { if ($_.Name -match '-refresh-([0-9a-f]{32})-') { $Matches[1] } } | Sort-Object -Unique)
  $observedRefreshNonce = if ($observedRefreshNonces.Count -eq 1) { [string]$observedRefreshNonces[0] } else { '' }
  $captureAuthorizationCandidates = @(Get-ChildItem -LiteralPath $evidenceDirectory -Filter "$ExpectedAttemptId-phase7b-wp2b-capture-auth-*.json" -File -ErrorAction Stop)
  $captureAuthorizationCount = $captureAuthorizationCandidates.Count
  $observedHistoricalAuthorizations = @($captureAuthorizationCandidates | ForEach-Object {
    $candidate = $_
    $candidateDocument = Get-Content -LiteralPath $candidate.FullName -Raw | ConvertFrom-Json -ErrorAction Stop
    $candidateMarkerPath = Join-Path $evidenceDirectory ([string]$candidateDocument.consumptionMarkerFileName)
    [pscustomobject][ordered]@{
      fileName = [string]$candidate.Name; sha256 = Get-Phase7BSha256 -LiteralPath $candidate.FullName
      authorizationId = [string]$candidateDocument.authorizationId; attemptId = [string]$candidateDocument.attemptId
      toolingCommit = [string]$candidateDocument.toolingCommit
      consumptionMarkerExists = Test-Path -LiteralPath $candidateMarkerPath
    }
  })
  if ($twoHistoricalRecovery) {
    $expectedHistoricalAuthorizations = @(
      [pscustomobject]@{fileName=$ExpectedStaleCaptureAuthorizationFileName;sha256=$ExpectedStaleCaptureAuthorizationSha256;authorizationId=$ExpectedStaleCaptureAuthorizationId;toolingCommit=$ExpectedStaleCaptureAuthorizationToolingCommit},
      [pscustomobject]@{fileName=$ExpectedSecondHistoricalCaptureAuthorizationFileName;sha256=$ExpectedSecondHistoricalCaptureAuthorizationSha256;authorizationId=$ExpectedSecondHistoricalCaptureAuthorizationId;toolingCommit=$ExpectedSecondHistoricalCaptureAuthorizationToolingCommit}
    )
    $historicalPrerequisite = Test-Phase7BExactTwoHistoricalCaptureAuthorizationPrerequisite -ExpectedAttemptId $ExpectedAttemptId `
      -ExpectedAuthorizations $expectedHistoricalAuthorizations -ObservedAuthorizations $observedHistoricalAuthorizations
  } else {
    $observedStale = if ($observedHistoricalAuthorizations.Count -eq 1) { $observedHistoricalAuthorizations[0] } else {
      [pscustomobject]@{fileName='';sha256='';authorizationId='';attemptId='';toolingCommit='';consumptionMarkerExists=$false}
    }
    $historicalPrerequisite = Test-Phase7BExactStaleCaptureAuthorizationPrerequisite `
      -CandidateCount $captureAuthorizationCount -ExpectedAttemptId $ExpectedAttemptId `
      -ExpectedFileName $ExpectedStaleCaptureAuthorizationFileName -ExpectedSha256 $ExpectedStaleCaptureAuthorizationSha256 `
      -ExpectedAuthorizationId $ExpectedStaleCaptureAuthorizationId -ExpectedToolingCommit $ExpectedStaleCaptureAuthorizationToolingCommit `
      -ObservedFileName ([string]$observedStale.fileName) -ObservedSha256 ([string]$observedStale.sha256) `
      -ObservedAuthorizationId ([string]$observedStale.authorizationId) -ObservedAttemptId ([string]$observedStale.attemptId) `
      -ObservedToolingCommit ([string]$observedStale.toolingCommit) -ConsumptionMarkerExists ([bool]$observedStale.consumptionMarkerExists)
  }

  $selection = if ($observedSelectionSha256) { Get-Content -LiteralPath $selectionPath -Raw | ConvertFrom-Json -ErrorAction Stop } else { [pscustomobject]@{} }
  $inventoryAuthorization = if ($observedInventoryAuthorizationSha256) { Get-Content -LiteralPath $inventoryAuthorizationPath -Raw | ConvertFrom-Json -ErrorAction Stop } else { [pscustomobject]@{} }
  $capturePlan = if ($observedCapturePlanSha256) { Get-Content -LiteralPath $capturePlanPath -Raw | ConvertFrom-Json -ErrorAction Stop } else { [pscustomobject]@{} }
  $inventory = if ($observedCapturePlanSha256) { New-Phase7BWorkPackage2Inventory -SourceRoot $source -Entries @($capturePlan.files) } else { [pscustomobject]@{inventorySha256=''} }

  $auditAfterText = @(& node --no-warnings $auditScript $source) -join [Environment]::NewLine
  if ($LASTEXITCODE -ne 0) { throw 'PHASE7B_WP2B_POST_REFRESH_SOURCE_AUDIT_NONZERO' }
  $auditAfter = $auditAfterText | ConvertFrom-Json -ErrorAction Stop
  $runtimeBindingPass = [bool]$auditBefore.pass -and [bool]$auditAfter.pass -and
    [int64]$auditBefore.runtimeRevision -eq $ExpectedRuntimeRevision -and [int64]$auditAfter.runtimeRevision -eq $ExpectedRuntimeRevision -and
    [string]$auditBefore.runtimeSha256 -ceq $ExpectedRuntimeSha256 -and [string]$auditAfter.runtimeSha256 -ceq $ExpectedRuntimeSha256 -and
    [string]$auditBefore.controlSha256 -ceq $ExpectedControlSha256 -and [string]$auditAfter.controlSha256 -ceq $ExpectedControlSha256
  $sourceIntegrityPass = $runtimeBindingPass -and [string]$auditBefore.runtimeSha256 -ceq [string]$auditAfter.runtimeSha256 -and
    [string]$auditBefore.controlSha256 -ceq [string]$auditAfter.controlSha256 -and [string]$inventory.inventorySha256 -ceq $ExpectedSourceInventorySha256 -and
    [int]$auditAfter.requiredCollectionPresentCount -eq 39 -and [int]$auditAfter.missingCollectionCount -eq 0 -and
    [int]$auditAfter.unknownCollectionCount -eq 0 -and [int]$auditAfter.missingMediaReferenceCount -eq 0 -and [int]$auditAfter.credentialSignalCount -eq 0
  $refreshInternalBindingPass = [string]$selection.attemptId -ceq $ExpectedAttemptId -and [string]$selection.toolingCommit -ceq $ExpectedRefreshToolingCommit -and
    [int64]$selection.canonicalEvidence.runtimeRevision -eq $ExpectedRuntimeRevision -and [string]$selection.canonicalEvidence.runtimeSha256 -ceq $ExpectedRuntimeSha256 -and
    [int]$selection.canonicalEvidence.requiredCollectionPresentCount -eq 39 -and [int]$selection.canonicalEvidence.missingMediaReferenceCount -eq 0 -and
    [int]$selection.exclusionEvidence.credentialSignalCount -eq 0 -and [string]$inventoryAuthorization.attemptId -ceq $ExpectedAttemptId -and
    [string]$inventoryAuthorization.toolingCommit -ceq $ExpectedRefreshToolingCommit -and [string]$inventoryAuthorization.capturePlanSha256 -ceq $ExpectedSelectionSha256 -and
    [string]$capturePlan.attemptId -ceq $ExpectedAttemptId -and [string]$capturePlan.applicationCommit -ceq $ExpectedApplicationCommit -and
    [string]$capturePlan.selectionSha256 -ceq $ExpectedSelectionSha256 -and [string]$capturePlan.sourceInventorySha256 -ceq $ExpectedSourceInventorySha256

  $monitor = Get-ScheduledTask -TaskName 'PhysiqueOS Runtime Monitor' -ErrorAction Stop
  $actions = @($monitor.Actions)
  $expectedExe = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
  $expectedScript = Join-Path $repositoryRoot 'scripts\monitorPhysiqueOS.ps1'
  $expectedArguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$expectedScript`""
  $monitorTaskDefinitionExact = $actions.Count -eq 1 -and [string]$actions[0].Execute -ceq $expectedExe -and [string]$actions[0].Arguments -ceq $expectedArguments -and [string]$actions[0].WorkingDirectory -ceq $repositoryRoot
  $productionServer = Get-ScheduledTask -TaskName 'PhysiqueOS Production Server' -ErrorAction Stop
  $listenerCount = @(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue).Count

  $decision = Test-Phase7BWorkPackage2PostRefreshCheckpoint -Evidence $evidence -ExpectedAttemptId $ExpectedAttemptId -ObservedAttemptId ([string]$capturePlan.attemptId) `
    -ExpectedEvidenceToolingCommit $ExpectedEvidenceToolingCommit -ExpectedEvidenceFileName $ExpectedEvidenceFileName -ExpectedEvidenceSha256 $ExpectedEvidenceSha256 `
    -ObservedEvidenceFileName $observedEvidenceFileName -ObservedEvidenceSha256 $observedEvidenceSha256 -EvidenceCandidateCount $evidenceCandidates.Count `
    -ExpectedRefreshNonce $ExpectedRefreshNonce -ObservedRefreshNonce $observedRefreshNonce -RefreshArtifactCount $refreshArtifacts.Count `
    -ExpectedSelectionFileName $ExpectedSelectionFileName -ExpectedSelectionSha256 $ExpectedSelectionSha256 -ObservedSelectionFileName (Split-Path -Leaf $selectionPath) -ObservedSelectionSha256 $observedSelectionSha256 `
    -ExpectedInventoryAuthorizationFileName $ExpectedInventoryAuthorizationFileName -ExpectedInventoryAuthorizationSha256 $ExpectedInventoryAuthorizationSha256 -ObservedInventoryAuthorizationFileName (Split-Path -Leaf $inventoryAuthorizationPath) -ObservedInventoryAuthorizationSha256 $observedInventoryAuthorizationSha256 `
    -ExpectedCapturePlanFileName $ExpectedCapturePlanFileName -ExpectedCapturePlanSha256 $ExpectedCapturePlanSha256 -ObservedCapturePlanFileName (Split-Path -Leaf $capturePlanPath) -ObservedCapturePlanSha256 $observedCapturePlanSha256 `
    -ExpectedSourceInventorySha256 $ExpectedSourceInventorySha256 -ObservedSourceInventorySha256 ([string]$inventory.inventorySha256) `
    -ExpectedRuntimeRevision $ExpectedRuntimeRevision -ObservedRuntimeRevision ([int64]$auditAfter.runtimeRevision) -ExpectedRuntimeSha256 $ExpectedRuntimeSha256 -ObservedRuntimeSha256 ([string]$auditAfter.runtimeSha256) `
    -ExpectedFileCount $ExpectedFileCount -ObservedFileCount ([int]$capturePlan.fileCount) -ExpectedTotalBytes $ExpectedTotalBytes -ObservedTotalBytes ([int64]$capturePlan.totalBytes) `
    -RepositoryIdentityPass $repositoryIdentityPass -ApplicationBindingPass $applicationBindingPass -SourceRootBindingPass $sourceRootBindingPass `
    -RuntimeBindingPass $runtimeBindingPass -SourceIntegrityPass $sourceIntegrityPass -RefreshInternalBindingPass $refreshInternalBindingPass `
    -MonitorTaskDefinitionExact $monitorTaskDefinitionExact -MonitorState ([string]$monitor.State) -ProductionServerState ([string]$productionServer.State) `
    -ListenerCount $listenerCount -CaptureAuthorizationCount $captureAuthorizationCount `
    -ReplacementAuthorizationContinuation $true -StaleCaptureAuthorizationBindingPass ([bool](-not $twoHistoricalRecovery -and $historicalPrerequisite.pass)) `
    -ExpectedHistoricalCaptureAuthorizationCount $(if ($twoHistoricalRecovery) { 2 } else { 1 }) `
    -HistoricalCaptureAuthorizationBindingPass ([bool]($twoHistoricalRecovery -and $historicalPrerequisite.pass))
  if (-not $decision.pass) {
    [ordered]@{classification=$decision.classification;pass=$false;safeStage=$stage;safeErrorCode=$decision.safeReasonCode;attemptId=$ExpectedAttemptId;refreshNonce=$ExpectedRefreshNonce;quiescenceMutationPerformed=$false;refreshMutationPerformed=$false;sourceMutationPerformed=$false;additionalRefreshAllowed=$false;automaticRetryAllowed=$false;wp2cAuthorized=$false}|ConvertTo-Json -Depth 4
    exit 1
  }
  [ordered]@{
    classification=$decision.classification;pass=$true;attemptId=$ExpectedAttemptId;refreshNonce=$ExpectedRefreshNonce
    currentToolingCommit=$head;refreshToolingCommit=$ExpectedRefreshToolingCommit;applicationCommit=$ExpectedApplicationCommit
    evidenceFileName=$observedEvidenceFileName;evidenceSha256=$observedEvidenceSha256
    selectionFileName=$ExpectedSelectionFileName;selectionSha256=$observedSelectionSha256
    inventoryAuthorizationFileName=$ExpectedInventoryAuthorizationFileName;inventoryAuthorizationSha256=$observedInventoryAuthorizationSha256
    capturePlanFileName=$ExpectedCapturePlanFileName;capturePlanSha256=$observedCapturePlanSha256;sourceInventorySha256=[string]$inventory.inventorySha256
    runtimeRevision=[int64]$auditAfter.runtimeRevision;runtimeSha256=[string]$auditAfter.runtimeSha256;fileCount=[int]$capturePlan.fileCount;totalBytes=[int64]$capturePlan.totalBytes
    refreshCheckpointReused=$true;refreshBudgetConsumed=$true;additionalRefreshAllowed=$false
    replacementAuthorizationContinuation=$true;staleCaptureAuthorizationValidated=[bool](-not $twoHistoricalRecovery)
    historicalCaptureAuthorizationCount=$(if ($twoHistoricalRecovery) { 2 } else { 1 });historicalCaptureAuthorizationsValidated=$true
    staleCaptureAuthorizationFileName=$ExpectedStaleCaptureAuthorizationFileName;staleCaptureAuthorizationSha256=$ExpectedStaleCaptureAuthorizationSha256
    secondHistoricalCaptureAuthorizationFileName=$(if ($twoHistoricalRecovery) { $ExpectedSecondHistoricalCaptureAuthorizationFileName } else { '' })
    secondHistoricalCaptureAuthorizationSha256=$(if ($twoHistoricalRecovery) { $ExpectedSecondHistoricalCaptureAuthorizationSha256 } else { '' })
    quiescenceMutationPerformed=$false;refreshMutationPerformed=$false;sourceMutationPerformed=$false
    monitorTaskDisabled=$true;productionServerLeftRunning=$true;productionListenerCount=1
    reportPersisted=$false;automaticRetryAllowed=$false;wp2cAuthorized=$false
  }|ConvertTo-Json -Depth 5
} catch {
  $safeCode = if ($_.Exception.Message -match '^PHASE7B_') { $_.Exception.Message } else { 'PHASE7B_WP2B_POST_REFRESH_RESUME_EXCEPTION' }
  [ordered]@{classification='PHASE7B_WP2B_EXACT_POST_REFRESH_CHECKPOINT_NONRESUMABLE';pass=$false;safeStage=$stage;safeErrorCode=$safeCode;safeExceptionType=$_.Exception.GetType().Name;safeLine=$_.InvocationInfo.ScriptLineNumber;attemptId=$ExpectedAttemptId;refreshNonce=$ExpectedRefreshNonce;quiescenceMutationPerformed=$false;refreshMutationPerformed=$false;sourceMutationPerformed=$false;additionalRefreshAllowed=$false;reportPersisted=$false;automaticRetryAllowed=$false;wp2cAuthorized=$false}|ConvertTo-Json -Depth 4
  exit 1
}
