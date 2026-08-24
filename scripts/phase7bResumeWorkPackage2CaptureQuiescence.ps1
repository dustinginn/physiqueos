[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ExpectedAttemptId,
  [Parameter(Mandatory = $true)][string]$ObservedAttemptId,
  [Parameter(Mandatory = $true)][string]$ExpectedCurrentToolingCommit,
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
  [Parameter(Mandatory = $true)][string]$AuthorizationAcknowledgement
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2OperatorLifecycle.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2Contract.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bIsolatedGuestContract.psm1') -Force
$stage = 'validate-input'
try {
  if ($AuthorizationAcknowledgement -cne 'WP2B_CAPTURE_RESUME_EXACT_EXISTING_QUIESCENCE_READ_ONLY' -or
      $ExpectedAttemptId -cnotmatch '^phase7b-wp2-[0-9a-f]{32}$' -or $ObservedAttemptId -cne $ExpectedAttemptId -or
      $ExpectedCurrentToolingCommit -cnotmatch '^[0-9a-f]{40}$' -or
      $ExpectedEvidenceToolingCommit -cnotmatch '^[0-9a-f]{40}$' -or
      $ExpectedApplicationCommit -cnotmatch '^[0-9a-f]{40}$' -or
      $ExpectedSourceRootSha256 -cnotmatch '^[0-9a-f]{64}$' -or
      $ExpectedRuntimeRevision -lt 1 -or $ExpectedRuntimeSha256 -cnotmatch '^[0-9a-f]{64}$' -or
      $ExpectedControlSha256 -cnotmatch '^[0-9a-f]{64}$' -or
      $ExpectedEvidenceFileName -cnotmatch '^phase7b-wp2b-quiescence-[0-9a-f]{32}\.json$' -or
      $ExpectedEvidenceSha256 -cnotmatch '^[0-9a-f]{64}$') {
    throw 'PHASE7B_WP2B_RESUME_ARGUMENT_OR_AUTHORIZATION_FAIL'
  }
  $repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path.TrimEnd('\')
  $source = (Resolve-Path -LiteralPath $SourceRoot -ErrorAction Stop).Path.TrimEnd('\')
  $evidenceDirectory = (Resolve-Path -LiteralPath $EvidenceRoot -ErrorAction Stop).Path.TrimEnd('\')
  $expectedEvidencePath = Join-Path $evidenceDirectory $ExpectedEvidenceFileName
  if (-not ([IO.Path]::GetFullPath($EvidencePath)).Equals([IO.Path]::GetFullPath($expectedEvidencePath), [StringComparison]::OrdinalIgnoreCase)) {
    throw 'PHASE7B_WP2B_RESUME_EVIDENCE_PATH_FAIL'
  }
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'PHASE7B_WP2B_RESUME_ELEVATION_REQUIRED'
  }

  $stage = 'validate-repository-and-source-bindings'
  $head = (& git -C $repositoryRoot rev-parse HEAD).Trim().ToLowerInvariant()
  $branch = (& git -C $repositoryRoot branch --show-current).Trim()
  $delta = (& git -C $repositoryRoot rev-list --left-right --count 'HEAD...origin/combined-app-platform-cutover').Trim()
  $dirty = @(& git -C $repositoryRoot status --short --untracked-files=no)
  $repositoryIdentityPass = $head -ceq $ExpectedCurrentToolingCommit -and $branch -ceq 'combined-app-platform-cutover' -and
    $delta -ceq "0`t0" -and $dirty.Count -eq 0
  $applicationBindingPass = [string](Get-Phase7BWorkPackage2Contract).applicationCommit -ceq $ExpectedApplicationCommit
  $sourceRootSha256 = Get-Phase7BSha256 -Text $source.ToLowerInvariant()
  $sourceRootBindingPass = $sourceRootSha256 -ceq $ExpectedSourceRootSha256
  $auditScript = Join-Path $PSScriptRoot 'phase7bAuditWorkPackage2CaptureSource.mjs'
  $auditBeforeText = @(& node --no-warnings $auditScript $source) -join [Environment]::NewLine
  if ($LASTEXITCODE -ne 0) { throw 'PHASE7B_WP2B_RESUME_SOURCE_AUDIT_NONZERO' }
  $auditBefore = $auditBeforeText | ConvertFrom-Json -ErrorAction Stop

  $stage = 'validate-exact-evidence-and-live-state'
  $evidenceCandidates = @(Get-ChildItem -LiteralPath $evidenceDirectory -Filter 'phase7b-wp2b-quiescence-*.json' -File -ErrorAction Stop)
  $observedEvidenceFileName = if ($evidenceCandidates.Count -eq 1) { [string]$evidenceCandidates[0].Name } else { '' }
  $observedEvidenceSha256 = if ($evidenceCandidates.Count -eq 1) { Get-Phase7BSha256 -LiteralPath $evidenceCandidates[0].FullName } else { '' }
  $evidence = if ($evidenceCandidates.Count -eq 1) {
    Get-Content -LiteralPath $evidenceCandidates[0].FullName -Raw | ConvertFrom-Json -ErrorAction Stop
  } else { [pscustomobject]@{} }
  $refreshArtifactCount = @(Get-ChildItem -LiteralPath $evidenceDirectory -Filter "$ExpectedAttemptId-refresh-*.json" -File -ErrorAction Stop).Count
  $captureAuthorizationCount = @(Get-ChildItem -LiteralPath $evidenceDirectory -Filter "$ExpectedAttemptId-phase7b-wp2b-capture-auth-*.json" -File -ErrorAction Stop).Count
  $monitorName = 'PhysiqueOS Runtime Monitor'
  $monitor = Get-ScheduledTask -TaskName $monitorName -ErrorAction Stop
  $actions = @($monitor.Actions)
  $expectedExe = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
  $expectedScript = Join-Path $repositoryRoot 'scripts\monitorPhysiqueOS.ps1'
  $expectedArguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$expectedScript`""
  $monitorTaskDefinitionExact = $actions.Count -eq 1 -and [string]$actions[0].Execute -ceq $expectedExe -and
    [string]$actions[0].Arguments -ceq $expectedArguments -and [string]$actions[0].WorkingDirectory -ceq $repositoryRoot
  $productionServer = Get-ScheduledTask -TaskName 'PhysiqueOS Production Server' -ErrorAction Stop
  $listenerCount = @(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue).Count

  $auditAfterText = @(& node --no-warnings $auditScript $source) -join [Environment]::NewLine
  if ($LASTEXITCODE -ne 0) { throw 'PHASE7B_WP2B_RESUME_SOURCE_AUDIT_NONZERO' }
  $auditAfter = $auditAfterText | ConvertFrom-Json -ErrorAction Stop
  $runtimeBindingPass = [bool]$auditBefore.pass -and [bool]$auditAfter.pass -and
    [int64]$auditBefore.runtimeRevision -eq $ExpectedRuntimeRevision -and [int64]$auditAfter.runtimeRevision -eq $ExpectedRuntimeRevision -and
    [string]$auditBefore.runtimeSha256 -ceq $ExpectedRuntimeSha256 -and [string]$auditAfter.runtimeSha256 -ceq $ExpectedRuntimeSha256 -and
    [string]$auditBefore.controlSha256 -ceq $ExpectedControlSha256 -and [string]$auditAfter.controlSha256 -ceq $ExpectedControlSha256
  $sourceIntegrityPass = [bool]$auditBefore.pass -and [bool]$auditAfter.pass -and
    [string]$auditBefore.runtimeSha256 -ceq [string]$auditAfter.runtimeSha256 -and
    [string]$auditBefore.controlSha256 -ceq [string]$auditAfter.controlSha256 -and
    [int]$auditAfter.requiredCollectionCount -eq 39 -and [int]$auditAfter.requiredCollectionPresentCount -eq 39 -and
    [int]$auditAfter.missingCollectionCount -eq 0 -and [int]$auditAfter.unknownCollectionCount -eq 0 -and
    [int]$auditAfter.missingMediaReferenceCount -eq 0 -and [int]$auditAfter.credentialSignalCount -eq 0
  $decision = Test-Phase7BWorkPackage2ExactQuiescenceResume -Evidence $evidence -ExpectedAttemptId $ExpectedAttemptId -ObservedAttemptId $ObservedAttemptId `
    -ExpectedEvidenceToolingCommit $ExpectedEvidenceToolingCommit -ExpectedEvidenceFileName $ExpectedEvidenceFileName `
    -ExpectedEvidenceSha256 $ExpectedEvidenceSha256 -ObservedEvidenceFileName $observedEvidenceFileName `
    -ObservedEvidenceSha256 $observedEvidenceSha256 -EvidenceCandidateCount $evidenceCandidates.Count `
    -RepositoryIdentityPass $repositoryIdentityPass -ApplicationBindingPass $applicationBindingPass `
    -SourceRootBindingPass $sourceRootBindingPass -RuntimeBindingPass $runtimeBindingPass -SourceIntegrityPass $sourceIntegrityPass `
    -MonitorTaskDefinitionExact $monitorTaskDefinitionExact -MonitorState ([string]$monitor.State) `
    -ProductionServerState ([string]$productionServer.State) -ListenerCount $listenerCount `
    -RefreshArtifactCount $refreshArtifactCount -CaptureAuthorizationCount $captureAuthorizationCount
  if (-not $decision.pass) {
    [ordered]@{
      classification = $decision.classification; pass = $false; safeStage = $stage; safeErrorCode = $decision.safeReasonCode
      attemptId = $ExpectedAttemptId; quiescenceMode = 'EXACT_EXISTING_QUIESCENCE_RESUME'
      quiescenceMutationPerformed = $false; quiescenceEvidenceReused = $false; quiescenceEvidenceCreated = $false
      automaticRetryAllowed = $false; wp2cAuthorized = $false
    } | ConvertTo-Json -Depth 4
    exit 1
  }
  [ordered]@{
    classification = $decision.classification; pass = $true; attemptId = $ExpectedAttemptId; attemptIdentityExact = $true
    attemptBindingSource = $decision.attemptBindingSource; currentToolingCommit = $head
    evidenceToolingCommit = $ExpectedEvidenceToolingCommit; applicationCommit = $ExpectedApplicationCommit
    sourceRootSha256 = $sourceRootSha256; runtimeRevision = $ExpectedRuntimeRevision
    runtimeSha256 = $ExpectedRuntimeSha256; controlSha256 = $ExpectedControlSha256
    quiescenceMode = 'EXACT_EXISTING_QUIESCENCE_RESUME'; evidenceFileName = $observedEvidenceFileName
    evidenceSha256 = $observedEvidenceSha256; monitorTaskDisabled = $true; productionServerLeftRunning = $true
    productionListenerCount = 1; quiescenceMutationPerformed = $false; quiescenceEvidenceReused = $true
    quiescenceEvidenceCreated = $false; reportPersisted = $false; automaticRetryAllowed = $false; wp2cAuthorized = $false
  } | ConvertTo-Json -Depth 4
} catch {
  $safeCode = if ($_.Exception.Message -match '^PHASE7B_') { $_.Exception.Message } else { 'PHASE7B_WP2B_RESUME_EXCEPTION' }
  [ordered]@{
    classification = 'PHASE7B_WP2B_EXACT_EXISTING_QUIESCENCE_NONRESUMABLE'; pass = $false
    safeStage = $stage; safeErrorCode = $safeCode; attemptId = $ExpectedAttemptId
    quiescenceMode = 'EXACT_EXISTING_QUIESCENCE_RESUME'; quiescenceMutationPerformed = $false
    quiescenceEvidenceReused = $false; quiescenceEvidenceCreated = $false; reportPersisted = $false
    automaticRetryAllowed = $false; wp2cAuthorized = $false
  } | ConvertTo-Json -Depth 4
  exit 1
}
