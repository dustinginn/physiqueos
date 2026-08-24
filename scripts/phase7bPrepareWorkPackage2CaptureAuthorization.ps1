[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$AuthorizationId,
  [Parameter(Mandatory = $true)][string]$AttemptId,
  [Parameter(Mandatory = $true)][string]$ExpectedToolingCommit,
  [Parameter(Mandatory = $true)][string]$CapturePlanPath,
  [Parameter(Mandatory = $true)][string]$ExpectedCapturePlanSha256,
  [Parameter(Mandatory = $true)][string]$SelectionPath,
  [Parameter(Mandatory = $true)][string]$ExpectedSelectionSha256,
  [Parameter(Mandatory = $true)][string]$ExpectedInventorySha256,
  [Parameter(Mandatory = $true)][string]$SourceRoot,
  [Parameter(Mandatory = $true)][string]$AgeExePath,
  [Parameter(Mandatory = $true)][string]$ExpectedAgeExeSha256,
  [Parameter(Mandatory = $true)][string]$LocalOutputRoot,
  [Parameter(Mandatory = $true)][string]$ReplicaUncRoot,
  [Parameter(Mandatory = $true)][string]$PrimaryHostIpv4,
  [Parameter(Mandatory = $true)][ValidateRange(1,32)][int]$PrimaryHostPrefixLength,
  [Parameter(Mandatory = $true)][string]$LaptopIpv4,
  [Parameter(Mandatory = $true)][ValidateRange(1,32)][int]$LaptopPrefixLength,
  [Parameter(Mandatory = $true)][string]$QuiescenceEvidencePath,
  [Parameter(Mandatory = $true)][string]$ExpectedQuiescenceEvidenceSha256,
  [Parameter()][string]$ExpectedQuiescenceEvidenceToolingCommit,
  [Parameter()][ValidateSet('FRESH_ESTABLISH','EXACT_EXISTING_QUIESCENCE_RESUME')][string]$QuiescenceMode = 'FRESH_ESTABLISH',
  [Parameter()][string]$QuiescenceResumeAuthorizationAcknowledgement,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [Parameter(Mandatory = $true)][string]$AuthorizationAcknowledgement
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2OperatorLifecycle.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bBoundedReplicaTransport.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2Contract.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bIsolatedGuestContract.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bSecondComputerReplicaContract.psm1') -Force
$stage = 'validate-input'
try {
  if ($QuiescenceMode -ceq 'FRESH_ESTABLISH') {
    if ([string]::IsNullOrWhiteSpace($ExpectedQuiescenceEvidenceToolingCommit)) { $ExpectedQuiescenceEvidenceToolingCommit = $ExpectedToolingCommit }
    if ($ExpectedQuiescenceEvidenceToolingCommit -cne $ExpectedToolingCommit -or -not [string]::IsNullOrEmpty($QuiescenceResumeAuthorizationAcknowledgement)) {
      throw 'PHASE7B_WP2B_CAPTURE_PREFLIGHT_FRESH_QUIESCENCE_BINDING_FAIL'
    }
  } elseif ([string]::IsNullOrWhiteSpace($ExpectedQuiescenceEvidenceToolingCommit) -or
      $QuiescenceResumeAuthorizationAcknowledgement -cne 'WP2B_CAPTURE_RESUME_EXACT_EXISTING_QUIESCENCE_READ_ONLY') {
    throw 'PHASE7B_WP2B_CAPTURE_PREFLIGHT_RESUME_AUTHORIZATION_FAIL'
  }
  $hashArguments = @($ExpectedToolingCommit, $ExpectedCapturePlanSha256, $ExpectedSelectionSha256, $ExpectedInventorySha256, $ExpectedAgeExeSha256, $ExpectedQuiescenceEvidenceSha256)
  if ($AuthorizationAcknowledgement -ne 'WP2B_CAPTURE_PREPARE_ONE_USE_AUTHORIZATION_EXACTLY_ONCE' -or
      $AuthorizationId -notmatch '^phase7b-wp2b-capture-auth-[0-9a-f]{32}$' -or $AttemptId -notmatch '^phase7b-wp2-[0-9a-f]{32}$' -or
      @($hashArguments | Where-Object { $_ -notmatch '^[0-9a-f]{40}$' -and $_ -notmatch '^[0-9a-f]{64}$' }).Count -gt 0 -or
      $ExpectedToolingCommit -notmatch '^[0-9a-f]{40}$' -or $ExpectedQuiescenceEvidenceToolingCommit -notmatch '^[0-9a-f]{40}$' -or
      (Test-Path -LiteralPath $OutputPath)) { throw 'PHASE7B_WP2B_CAPTURE_PREFLIGHT_ARGUMENT_FAIL' }
  $authorizationParent = Split-Path -Parent ([IO.Path]::GetFullPath($OutputPath))
  if (-not (Test-Path -LiteralPath $authorizationParent -PathType Container) -or
      -not $authorizationParent.Equals((Split-Path -Parent ([IO.Path]::GetFullPath($QuiescenceEvidencePath))), [StringComparison]::OrdinalIgnoreCase)) {
    throw 'PHASE7B_WP2B_CAPTURE_PREFLIGHT_EVIDENCE_ROOT_FAIL'
  }
  $repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path.TrimEnd('\')
  $source = (Resolve-Path -LiteralPath $SourceRoot -ErrorAction Stop).Path.TrimEnd('\')
  $head = (& git -C $repositoryRoot rev-parse HEAD).Trim().ToLowerInvariant()
  $branch = (& git -C $repositoryRoot branch --show-current).Trim()
  $delta = (& git -C $repositoryRoot rev-list --left-right --count 'HEAD...origin/combined-app-platform-cutover').Trim()
  $dirty = @(& git -C $repositoryRoot status --short --untracked-files=no)
  if ($head -ne $ExpectedToolingCommit -or $branch -ne 'combined-app-platform-cutover' -or $delta -ne "0`t0" -or $dirty.Count -ne 0) { throw 'PHASE7B_WP2B_CAPTURE_PREFLIGHT_REPOSITORY_FAIL' }
  $stage = 'validate-static-bindings'
  foreach ($binding in @(@($CapturePlanPath, $ExpectedCapturePlanSha256), @($SelectionPath, $ExpectedSelectionSha256),
      @($QuiescenceEvidencePath, $ExpectedQuiescenceEvidenceSha256), @($AgeExePath, $ExpectedAgeExeSha256))) {
    if (-not (Test-Path -LiteralPath $binding[0] -PathType Leaf) -or (Get-Phase7BSha256 -LiteralPath $binding[0]) -ne $binding[1]) { throw 'PHASE7B_WP2B_CAPTURE_PREFLIGHT_FILE_BINDING_FAIL' }
  }
  $quiescence = Get-Content -LiteralPath $QuiescenceEvidencePath -Raw | ConvertFrom-Json -ErrorAction Stop
  if (-not (Test-Phase7BWorkPackage2QuiescenceEvidence -Evidence $quiescence -ExpectedToolingCommit $ExpectedQuiescenceEvidenceToolingCommit).pass) { throw 'PHASE7B_WP2B_CAPTURE_PREFLIGHT_QUIESCENCE_FAIL' }
  $plan = Get-Content -LiteralPath $CapturePlanPath -Raw | ConvertFrom-Json -ErrorAction Stop
  $selection = Get-Content -LiteralPath $SelectionPath -Raw | ConvertFrom-Json -ErrorAction Stop
  if ([string]$plan.attemptId -ne $AttemptId -or [string]$plan.selectionSha256 -ne $ExpectedSelectionSha256 -or
      [string]$plan.sourceInventorySha256 -ne $ExpectedInventorySha256 -or [string]$selection.attemptId -ne $AttemptId -or
      [int]$selection.canonicalEvidence.requiredCollectionPresentCount -ne 39 -or [int]$selection.canonicalEvidence.missingCollectionCount -ne 0 -or
      [int]$selection.canonicalEvidence.unknownCollectionCount -ne 0 -or [int]$selection.canonicalEvidence.missingMediaReferenceCount -ne 0 -or
      [int]$selection.exclusionEvidence.credentialSignalCount -ne 0) { throw 'PHASE7B_WP2B_CAPTURE_PREFLIGHT_PLAN_OR_SELECTION_FAIL' }
  $stage = 'validate-stable-source'
  $auditScript = Join-Path $PSScriptRoot 'phase7bAuditWorkPackage2CaptureSource.mjs'
  $auditBeforeText = @(& node --no-warnings $auditScript $source) -join [Environment]::NewLine
  if ($LASTEXITCODE -ne 0) { throw 'PHASE7B_WP2B_CAPTURE_SOURCE_AUDIT_NONZERO' }
  $auditBefore = $auditBeforeText | ConvertFrom-Json -ErrorAction Stop
  $inventory = New-Phase7BWorkPackage2Inventory -SourceRoot $source -Entries @($plan.files)
  $auditAfterText = @(& node --no-warnings $auditScript $source) -join [Environment]::NewLine
  if ($LASTEXITCODE -ne 0) { throw 'PHASE7B_WP2B_CAPTURE_SOURCE_AUDIT_NONZERO' }
  $auditAfter = $auditAfterText | ConvertFrom-Json -ErrorAction Stop
  $sourceStable = [string]$auditBefore.runtimeSha256 -eq [string]$auditAfter.runtimeSha256 -and
    [string]$auditBefore.controlSha256 -eq [string]$auditAfter.controlSha256 -and [string]$inventory.inventorySha256 -eq $ExpectedInventorySha256
  if (-not [bool]$auditAfter.pass -or [int]$auditAfter.requiredCollectionPresentCount -ne 39 -or
      [int]$auditAfter.missingCollectionCount -ne 0 -or [int]$auditAfter.unknownCollectionCount -ne 0 -or
      [int]$auditAfter.missingMediaReferenceCount -ne 0 -or [int]$auditAfter.credentialSignalCount -ne 0) {
    throw 'PHASE7B_WP2B_CAPTURE_SOURCE_INTEGRITY_FAIL'
  }
  if (-not $sourceStable -or [string]$auditAfter.runtimeSha256 -ne [string]$selection.canonicalEvidence.runtimeSha256 -or
      [int64]$auditAfter.runtimeRevision -ne [int64]$selection.canonicalEvidence.runtimeRevision) {
    throw 'PHASE7B_WP2B_STABLE_BINDING_REFRESH_REQUIRED'
  }
  $stage = 'validate-tools-destinations-and-lan'
  $ageVersionLines = @(& $AgeExePath --version 2>&1)
  $ageVersion = Test-Phase7BAgeVersionOutput -OutputLines @($ageVersionLines | ForEach-Object { [string]$_ }) -ExitCode $LASTEXITCODE
  if (-not $ageVersion.pass) { throw 'PHASE7B_WP2_AGE_VERSION_UNSUPPORTED' }
  $localBase = [IO.Path]::GetFullPath($LocalOutputRoot).TrimEnd('\')
  $localDrive = Get-PSDrive -Name ([IO.Path]::GetPathRoot($localBase).Substring(0,1)) -PSProvider FileSystem -ErrorAction Stop
  if ([int64]$localDrive.Free -lt [Math]::Max([int64]1GB, [int64]$plan.totalBytes) -or (Test-Path -LiteralPath (Join-Path $localBase $AttemptId))) { throw 'PHASE7B_WP2B_PRIMARY_DESTINATION_FAIL' }
  $expectedShare = "P7B$($AttemptId.Substring($AttemptId.Length - 8))`$"
  if ($ReplicaUncRoot -cne "\\LAPTOP-4G5U0U2R\$expectedShare") { throw 'PHASE7B_WP2B_REPLICA_ROOT_BINDING_FAIL' }
  $primaryAddresses = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop | Where-Object { [string]$_.IPAddress -eq $PrimaryHostIpv4 -and [int]$_.PrefixLength -eq $PrimaryHostPrefixLength })
  $networkBinding = Test-Phase7BSecondComputerNetworkBinding -PrimaryIpv4 $PrimaryHostIpv4 -PrimaryPrefixLength $PrimaryHostPrefixLength -ReplicaIpv4 $LaptopIpv4 -ReplicaPrefixLength $LaptopPrefixLength
  if ($primaryAddresses.Count -ne 1 -or -not $networkBinding.pass) { throw 'PHASE7B_WP2B_PHYSICAL_LAN_BINDING_FAIL' }
  $evidence = [pscustomobject]@{ repositoryIdentityPass = $true; originParityPass = $true; trackedTreeClean = $true; planBindingPass = $true; inventoryBindingPass = $true; runtimeBindingPass = $true; requiredCollectionCount = 39; missingCollectionCount = 0; unknownCollectionCount = 0; missingMediaReferenceCount = 0; credentialSignalCount = 0; ageIdentityPass = $true; primaryDestinationPass = $true; laptopNetworkBindingPass = $true; laptopReachabilityDeferredToReceiver = $true; quiescencePass = $true; sourceStableAcrossPreflight = $true }
  if (-not (Test-Phase7BWorkPackage2StablePreflightEvidence -Evidence $evidence).pass) { throw 'PHASE7B_WP2B_STABLE_PREFLIGHT_FAIL' }
  $sourceRootSha = Get-Phase7BSha256 -Text $source.ToLowerInvariant()
  $localRootSha = Get-Phase7BSha256 -Text $localBase.ToLowerInvariant()
  $replicaRootSha = Get-Phase7BSha256 -Text $ReplicaUncRoot.ToLowerInvariant()
  $agePathSha = Get-Phase7BSha256 -Text ([IO.Path]::GetFullPath($AgeExePath).ToLowerInvariant())
  $issued = [DateTime]::UtcNow
  $document = New-Phase7BWorkPackage2CaptureAuthorizationDocument -AuthorizationId $AuthorizationId -AttemptId $AttemptId `
    -ToolingCommit $head -CapturePlanSha256 $ExpectedCapturePlanSha256 -CapturePlanFileName (Split-Path -Leaf $CapturePlanPath) `
    -InventorySha256 $ExpectedInventorySha256 `
    -SelectionSha256 $ExpectedSelectionSha256 -SelectionFileName (Split-Path -Leaf $SelectionPath) -SourceRootSha256 $sourceRootSha -RuntimeRevision ([int64]$auditAfter.runtimeRevision) `
    -RuntimeSha256 ([string]$auditAfter.runtimeSha256) -AgeExePathSha256 $agePathSha -AgeExeSha256 $ExpectedAgeExeSha256 `
    -LocalOutputRootSha256 $localRootSha -ReplicaRootSha256 $replicaRootSha -ReplicaUncRoot $ReplicaUncRoot `
    -QuiescenceEvidenceSha256 $ExpectedQuiescenceEvidenceSha256 -QuiescenceEvidenceFileName (Split-Path -Leaf $QuiescenceEvidencePath) `
    -QuiescenceEvidenceToolingCommit $ExpectedQuiescenceEvidenceToolingCommit `
    -ConsumptionMarkerFileName "$AuthorizationId.used.json" `
    -IssuedAt $issued -ExpiresAt $issued.AddHours(24)
  $persisted = Write-Phase7BSafeEvidenceFile -LiteralPath $OutputPath -Evidence $document
  [ordered]@{ classification = 'PHASE7B_WP2B_STABLE_PREFLIGHT_AND_AUTHORIZATION_PASS'; pass = $true; authorizationId = $AuthorizationId; attemptId = $AttemptId; authorizationFileName = $persisted.fileName; authorizationSha256 = $persisted.sha256; toolingCommit = $head; runtimeRevision = [int64]$auditAfter.runtimeRevision; runtimeSha256 = [string]$auditAfter.runtimeSha256; capturePlanFileName = Split-Path -Leaf $CapturePlanPath; capturePlanSha256 = $ExpectedCapturePlanSha256; sourceInventorySha256 = $ExpectedInventorySha256; selectionSha256 = $ExpectedSelectionSha256; requiredCapacityBytes = [Math]::Max([int64]1GB, ([int64]$plan.totalBytes * 2L) + [int64]64MB); laptopIpv4 = $LaptopIpv4; laptopIdentityDeferredToReceiver = $true; laptopReachabilityDeferredToReceiver = $true; primaryNetworkBindingPass = $true; requiredCollectionCount = 39; missingMediaReferenceCount = 0; credentialSignalCount = 0; quiescencePass = $true; sourceStableAcrossPreflight = $true; automaticRetryAllowed = $false; wp2cAuthorized = $false } | ConvertTo-Json -Depth 5
} catch {
  $safeCode = if ($_.Exception.Message -match '^PHASE7B_') { $_.Exception.Message } else { 'PHASE7B_WP2B_CAPTURE_PREFLIGHT_EXCEPTION' }
  [ordered]@{ classification = 'PHASE7B_WP2B_STABLE_PREFLIGHT_AND_AUTHORIZATION_FAIL'; pass = $false; safeStage = $stage; safeErrorCode = $safeCode; mutationStarted = $false; automaticRetryAllowed = $false } | ConvertTo-Json -Depth 4
  exit 1
}
