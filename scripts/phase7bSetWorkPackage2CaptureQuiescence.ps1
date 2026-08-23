[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidateSet('Inspect', 'Establish')][string]$Operation,
  [Parameter()][string]$ExpectedToolingCommit,
  [Parameter()][string]$EvidenceNonce,
  [Parameter()][string]$EvidenceOutputPath,
  [Parameter()][string]$AuthorizationAcknowledgement
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2OperatorLifecycle.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bBoundedReplicaTransport.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2Contract.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bIsolatedGuestContract.psm1') -Force
$contract = Get-Phase7BWorkPackage2OperatorContract
if ($Operation -eq 'Inspect') {
  [ordered]@{ classification = 'PHASE7B_WP2B_NARROW_QUIESCENCE_READY_INERT'; pass = $true; autonomousWriterTask = 'PhysiqueOS Runtime Monitor'; productionServerLeftRunning = $true; fullCutoverFenceStarted = $false; mutationPerformed = $false; automaticRetryAllowed = $false } | ConvertTo-Json -Depth 4
  exit 0
}
$stage = 'validate-input'; $mutationStarted = $false
try {
  if ($ExpectedToolingCommit -notmatch '^[0-9a-f]{40}$' -or $EvidenceNonce -notmatch '^[0-9a-f]{32}$' -or
      $AuthorizationAcknowledgement -ne 'WP2B_CAPTURE_ESTABLISH_NARROW_QUIESCENCE_EXACTLY_ONCE') { throw 'PHASE7B_WP2B_QUIESCENCE_ARGUMENT_OR_AUTHORIZATION_FAIL' }
  $expectedName = "phase7b-wp2b-quiescence-$EvidenceNonce.json"
  if ((Split-Path -Leaf $EvidenceOutputPath) -cne $expectedName -or (Test-Path -LiteralPath $EvidenceOutputPath)) { throw 'PHASE7B_WP2B_QUIESCENCE_EVIDENCE_PATH_REJECTED' }
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'PHASE7B_WP2B_QUIESCENCE_ELEVATION_REQUIRED' }
  $repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
  $head = (& git -C $repositoryRoot rev-parse HEAD).Trim().ToLowerInvariant()
  $branch = (& git -C $repositoryRoot branch --show-current).Trim()
  $delta = (& git -C $repositoryRoot rev-list --left-right --count 'HEAD...origin/combined-app-platform-cutover').Trim()
  $dirty = @(& git -C $repositoryRoot status --short --untracked-files=no)
  if ($head -ne $ExpectedToolingCommit -or $branch -ne $contract.branch -or $delta -ne "0`t0" -or $dirty.Count -ne 0) { throw 'PHASE7B_WP2B_QUIESCENCE_REPOSITORY_IDENTITY_FAIL' }
  $stage = 'validate-runtime-and-monitor'
  $status = & (Join-Path $PSScriptRoot 'statusPhysiqueOS.ps1') | ConvertFrom-Json -ErrorAction Stop
  if ([string]$status.overallState -ne 'healthy' -or -not $status.listener) { throw 'PHASE7B_WP2B_QUIESCENCE_PRODUCTION_RUNTIME_NOT_HEALTHY' }
  $monitorName = 'PhysiqueOS Runtime Monitor'
  $monitor = Get-ScheduledTask -TaskName $monitorName -ErrorAction Stop
  $action = @($monitor.Actions)
  $expectedExe = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
  $expectedScript = Join-Path $repositoryRoot 'scripts\monitorPhysiqueOS.ps1'
  $expectedArguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$expectedScript`""
  $definitionExact = $action.Count -eq 1 -and [string]$action[0].Execute -eq $expectedExe -and
    [string]$action[0].Arguments -eq $expectedArguments -and [string]$action[0].WorkingDirectory -eq $repositoryRoot
  if (-not $definitionExact) { throw 'PHASE7B_WP2B_QUIESCENCE_MONITOR_DEFINITION_FAIL' }
  if ([string]$monitor.State -eq 'Disabled') { throw 'PHASE7B_WP2B_QUIESCENCE_PRIOR_STATE_REJECTED' }
  $stage = 'disable-autonomous-writer'
  $mutationStarted = $true
  Stop-ScheduledTask -TaskName $monitorName -ErrorAction SilentlyContinue
  Disable-ScheduledTask -TaskName $monitorName -ErrorAction Stop | Out-Null
  $deadline = [DateTime]::UtcNow.AddSeconds(20)
  do {
    $afterMonitor = Get-ScheduledTask -TaskName $monitorName -ErrorAction Stop
    if ([string]$afterMonitor.State -eq 'Disabled') { break }
    Start-Sleep -Milliseconds 250
  } while ([DateTime]::UtcNow -lt $deadline)
  $server = Get-ScheduledTask -TaskName 'PhysiqueOS Production Server' -ErrorAction Stop
  $listeners = @(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue)
  if ([string]$afterMonitor.State -ne 'Disabled' -or [string]$server.State -ne 'Running' -or $listeners.Count -ne 1) { throw 'PHASE7B_WP2B_QUIESCENCE_POSTCONDITION_FAIL' }
  $evidence = [pscustomobject][ordered]@{
    schemaVersion = 1; classification = $contract.quiescenceClassification; pass = $true; nonce = $EvidenceNonce
    observedAt = [DateTime]::UtcNow.ToString('o'); toolingCommit = $head; monitorTaskName = $monitorName
    monitorTaskDefinitionExact = $true; monitorTaskDisabled = $true; monitorTaskNotRunning = $true
    productionServerLeftRunning = $true; productionListenerPresent = $true; autonomousCanonicalWriterPaused = $true
    fullCutoverFenceStarted = $false; mutationPerformed = $true; reportPersisted = $true; automaticRetryAllowed = $false
  }
  if (-not (Test-Phase7BWorkPackage2QuiescenceEvidence -Evidence $evidence -ExpectedToolingCommit $head).pass) { throw 'PHASE7B_WP2B_QUIESCENCE_SELF_CHECK_FAIL' }
  $persisted = Write-Phase7BSafeEvidenceFile -LiteralPath $EvidenceOutputPath -Evidence $evidence
  [ordered]@{ classification = $evidence.classification; pass = $true; nonce = $EvidenceNonce; evidenceFileName = $persisted.fileName; evidenceSha256 = $persisted.sha256; monitorTaskDisabled = $true; productionServerLeftRunning = $true; autonomousCanonicalWriterPaused = $true; fullCutoverFenceStarted = $false; automaticRetryAllowed = $false } | ConvertTo-Json -Depth 4
} catch {
  $safeCode = if ($_.Exception.Message -match '^PHASE7B_') { $_.Exception.Message } else { 'PHASE7B_WP2B_QUIESCENCE_EXCEPTION' }
  [ordered]@{ classification = 'PHASE7B_WP2B_NARROW_QUIESCENCE_FAIL'; pass = $false; safeStage = $stage; safeErrorCode = $safeCode; mutationStarted = $mutationStarted; automaticRetryAllowed = $false; newFounderAuthorizationRequired = $mutationStarted } | ConvertTo-Json -Depth 4
  exit 1
}
