Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bIsolatedGuestContract.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2Contract.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bBoundedReplicaTransport.psm1') -Force

function Get-Phase7BWorkPackage2OperatorContract {
  [CmdletBinding()] param()
  $bounded = Get-Phase7BBoundedReplicaTransportContract
  [pscustomobject][ordered]@{
    schemaVersion = 1
    classification = 'PHASE7B_WP2B_OPERATOR_LIFECYCLE_CONTRACT'
    branch = 'combined-app-platform-cutover'
    applicationCommit = (Get-Phase7BWorkPackage2Contract).applicationCommit
    founderMeaningfulDataThrough = '2026-08-16'
    founderDowntimeBegan = '2026-08-17'
    requiredCollectionCount = 39
    acceptedLaptop = $bounded.acceptedComputerName
    acceptedLaptopHostIdentitySha256 = $bounded.acceptedHostIdentitySha256
    acceptedLaptopDiskIdentitySha256 = $bounded.acceptedDiskIdentitySha256
    replicaPathModel = $bounded.replicaPathModel
    authorizationClassification = 'PHASE7B_WP2B_CAPTURE_AUTHORIZATION'
    quiescenceClassification = 'PHASE7B_WP2B_NARROW_QUIESCENCE_PASS'
    automaticRetryAllowed = $false
    wp2cAuthorized = $false
  }
}

function Test-Phase7BWorkPackage2QuiescenceEvidence {
  [CmdletBinding()] param(
    [Parameter(Mandatory = $true)]$Evidence,
    [Parameter(Mandatory = $true)][string]$ExpectedToolingCommit
  )
  $contract = Get-Phase7BWorkPackage2OperatorContract
  $pass = [string]$Evidence.classification -eq $contract.quiescenceClassification -and [bool]$Evidence.pass -and
    [string]$Evidence.toolingCommit -eq $ExpectedToolingCommit -and [bool]$Evidence.monitorTaskDefinitionExact -and
    [bool]$Evidence.monitorTaskDisabled -and [bool]$Evidence.monitorTaskNotRunning -and
    [bool]$Evidence.productionServerLeftRunning -and [bool]$Evidence.productionListenerPresent -and
    [bool]$Evidence.autonomousCanonicalWriterPaused -and -not [bool]$Evidence.fullCutoverFenceStarted -and
    [string]$Evidence.nonce -match '^[0-9a-f]{32}$' -and [string]$Evidence.observedAt -match '^\d{4}-\d{2}-\d{2}T' -and
    -not [bool]$Evidence.automaticRetryAllowed
  [pscustomobject][ordered]@{ pass = [bool]$pass; classification = if ($pass) { 'PHASE7B_WP2B_QUIESCENCE_EVIDENCE_ACCEPTED' } else { 'PHASE7B_WP2B_QUIESCENCE_EVIDENCE_REJECTED' } }
}

function New-Phase7BWorkPackage2CaptureAuthorizationDocument {
  [CmdletBinding()] param(
    [Parameter(Mandatory = $true)][string]$AuthorizationId,
    [Parameter(Mandatory = $true)][string]$AttemptId,
    [Parameter(Mandatory = $true)][string]$ToolingCommit,
    [Parameter(Mandatory = $true)][string]$CapturePlanSha256,
    [Parameter(Mandatory = $true)][string]$InventorySha256,
    [Parameter(Mandatory = $true)][string]$SelectionSha256,
    [Parameter(Mandatory = $true)][string]$SourceRootSha256,
    [Parameter(Mandatory = $true)][int64]$RuntimeRevision,
    [Parameter(Mandatory = $true)][string]$RuntimeSha256,
    [Parameter(Mandatory = $true)][string]$AgeExePathSha256,
    [Parameter(Mandatory = $true)][string]$AgeExeSha256,
    [Parameter(Mandatory = $true)][string]$LocalOutputRootSha256,
    [Parameter(Mandatory = $true)][string]$ReplicaRootSha256,
    [Parameter(Mandatory = $true)][string]$ReplicaUncRoot,
    [Parameter(Mandatory = $true)][string]$QuiescenceEvidenceSha256,
    [Parameter(Mandatory = $true)][string]$QuiescenceEvidenceFileName,
    [Parameter(Mandatory = $true)][string]$ConsumptionMarkerFileName,
    [Parameter(Mandatory = $true)][datetime]$IssuedAt,
    [Parameter(Mandatory = $true)][datetime]$ExpiresAt
  )
  $wp2 = Get-Phase7BWorkPackage2Contract
  $operator = Get-Phase7BWorkPackage2OperatorContract
  $hashes = @($ToolingCommit, $CapturePlanSha256, $InventorySha256, $SelectionSha256, $SourceRootSha256, $RuntimeSha256,
    $AgeExePathSha256, $AgeExeSha256, $LocalOutputRootSha256, $ReplicaRootSha256, $QuiescenceEvidenceSha256)
  if ($AuthorizationId -notmatch '^phase7b-wp2b-capture-auth-[0-9a-f]{32}$' -or $AttemptId -notmatch '^phase7b-wp2-[0-9a-f]{32}$' -or
      @($hashes | Where-Object { $_ -notmatch '^[0-9a-f]{40}$' -and $_ -notmatch '^[0-9a-f]{64}$' }).Count -gt 0 -or
      $ToolingCommit -notmatch '^[0-9a-f]{40}$' -or $RuntimeRevision -lt 1 -or $ReplicaUncRoot -notmatch '^\\\\LAPTOP-4G5U0U2R\\P7B[0-9a-f]{8}\$$' -or
      $QuiescenceEvidenceFileName -notmatch '^phase7b-wp2b-quiescence-[0-9a-f]{32}\.json$' -or
      $ConsumptionMarkerFileName -cne "$AuthorizationId.used.json" -or $ExpiresAt.ToUniversalTime() -le $IssuedAt.ToUniversalTime()) {
    throw 'PHASE7B_WP2B_CAPTURE_AUTHORIZATION_ARGUMENT_FAIL'
  }
  [ordered]@{
    schemaVersion = 1
    classification = $wp2.authorizationClassification
    captureAuthorizationClassification = $operator.authorizationClassification
    authorizationId = $AuthorizationId
    authorizedStages = @([ordered]@{ stage = 'WP2B_CAPTURE'; mutationBudget = 1 })
    attemptId = $AttemptId
    toolingCommit = $ToolingCommit
    applicationCommit = $wp2.applicationCommit
    environmentId = $wp2.environmentId
    vmDisplayName = $wp2.vmDisplayName
    windowsHostId = $wp2.windowsHostId
    manifestDigest = $wp2.manifestDigest
    capturePlanSha256 = $CapturePlanSha256
    sourceInventorySha256 = $InventorySha256
    selectionSha256 = $SelectionSha256
    sourceRootSha256 = $SourceRootSha256
    runtimeRevision = $RuntimeRevision
    runtimeSha256 = $RuntimeSha256
    ageExePathSha256 = $AgeExePathSha256
    ageExeSha256 = $AgeExeSha256
    localOutputRootSha256 = $LocalOutputRootSha256
    replicaRootSha256 = $ReplicaRootSha256
    replicaUncRoot = $ReplicaUncRoot
    replicaClassification = 'OFF_MACHINE_OR_INDEPENDENT_STORAGE'
    replicaPathModel = $operator.replicaPathModel
    laptopHostIdentitySha256 = $operator.acceptedLaptopHostIdentitySha256
    laptopDiskIdentitySha256 = $operator.acceptedLaptopDiskIdentitySha256
    founderMeaningfulDataThrough = $operator.founderMeaningfulDataThrough
    founderDowntimeBegan = $operator.founderDowntimeBegan
    quiescenceEvidenceSha256 = $QuiescenceEvidenceSha256
    quiescenceEvidenceFileName = $QuiescenceEvidenceFileName
    consumptionMarkerFileName = $ConsumptionMarkerFileName
    packetSha256 = '0' * 64
    founderApproved = $true
    oneUseOnly = $true
    automaticRetryAllowed = $false
    wp2cAuthorized = $false
    issuedAt = $IssuedAt.ToUniversalTime().ToString('o')
    expiresAt = $ExpiresAt.ToUniversalTime().ToString('o')
  }
}

function Assert-Phase7BWorkPackage2CaptureAuthorization {
  [CmdletBinding()] param(
    [Parameter(Mandatory = $true)][string]$LiteralPath,
    [Parameter(Mandatory = $true)][string]$ExpectedSha256,
    [Parameter(Mandatory = $true)][string]$ExpectedAttemptId,
    [Parameter(Mandatory = $true)][string]$ExpectedToolingCommit,
    [Parameter(Mandatory = $true)][string]$ExpectedInventorySha256,
    [Parameter(Mandatory = $true)][string]$ExpectedSourceRootSha256,
    [Parameter(Mandatory = $true)][string]$ExpectedCapturePlanSha256,
    [Parameter(Mandatory = $true)][string]$ExpectedLocalOutputRootSha256,
    [Parameter(Mandatory = $true)][string]$ExpectedReplicaRootSha256,
    [Parameter(Mandatory = $true)][string]$ExpectedAgeExeSha256,
    [Parameter(Mandatory = $true)][string]$ExpectedQuiescenceEvidenceSha256
  )
  $authorization = Assert-Phase7BWorkPackage2Authorization -LiteralPath $LiteralPath -ExpectedSha256 $ExpectedSha256 `
    -ExpectedStage 'WP2B_CAPTURE' -ExpectedAttemptId $ExpectedAttemptId -ExpectedSourceInventorySha256 $ExpectedInventorySha256 `
    -ExpectedSourceRootSha256 $ExpectedSourceRootSha256 -ExpectedCapturePlanSha256 $ExpectedCapturePlanSha256 `
    -ExpectedLocalOutputRootSha256 $ExpectedLocalOutputRootSha256 -ExpectedReplicaRootSha256 $ExpectedReplicaRootSha256
  $operator = Get-Phase7BWorkPackage2OperatorContract
  if ([string]$authorization.captureAuthorizationClassification -ne $operator.authorizationClassification -or
      [string]$authorization.authorizationId -notmatch '^phase7b-wp2b-capture-auth-[0-9a-f]{32}$' -or
      [string]$authorization.toolingCommit -ne $ExpectedToolingCommit -or [string]$authorization.ageExeSha256 -ne $ExpectedAgeExeSha256 -or
      [string]$authorization.quiescenceEvidenceSha256 -ne $ExpectedQuiescenceEvidenceSha256 -or
      [string]$authorization.quiescenceEvidenceFileName -notmatch '^phase7b-wp2b-quiescence-[0-9a-f]{32}\.json$' -or
      [string]$authorization.selectionSha256 -notmatch '^[0-9a-f]{64}$' -or [int64]$authorization.runtimeRevision -lt 1 -or
      [string]$authorization.runtimeSha256 -notmatch '^[0-9a-f]{64}$' -or [string]$authorization.ageExePathSha256 -notmatch '^[0-9a-f]{64}$' -or
      [string]$authorization.replicaUncRoot -notmatch '^\\\\LAPTOP-4G5U0U2R\\P7B[0-9a-f]{8}\$$' -or
      [string]$authorization.replicaPathModel -ne 'EXACT_ATTEMPT_ROOT' -or -not [bool]$authorization.oneUseOnly -or
      [string]$authorization.founderMeaningfulDataThrough -ne $operator.founderMeaningfulDataThrough -or
      [string]$authorization.founderDowntimeBegan -ne $operator.founderDowntimeBegan -or [bool]$authorization.wp2cAuthorized -or
      [string]$authorization.consumptionMarkerFileName -cne "$($authorization.authorizationId).used.json") {
    throw 'PHASE7B_WP2B_CAPTURE_AUTHORIZATION_BINDING_MISMATCH'
  }
  $marker = Join-Path (Split-Path -Parent ([IO.Path]::GetFullPath($LiteralPath))) ([string]$authorization.consumptionMarkerFileName)
  if (Test-Path -LiteralPath $marker) { throw 'PHASE7B_WP2B_CAPTURE_AUTHORIZATION_ALREADY_USED' }
  $authorization
}

function Use-Phase7BWorkPackage2CaptureAuthorization {
  [CmdletBinding()] param([Parameter(Mandatory = $true)][string]$AuthorizationPath, [Parameter(Mandatory = $true)]$Authorization)
  $marker = Join-Path (Split-Path -Parent ([IO.Path]::GetFullPath($AuthorizationPath))) ([string]$Authorization.consumptionMarkerFileName)
  $value = [ordered]@{ schemaVersion = 1; classification = 'PHASE7B_WP2B_CAPTURE_AUTHORIZATION_CONSUMED'; pass = $true; authorizationId = [string]$Authorization.authorizationId; attemptId = [string]$Authorization.attemptId; consumedAt = [DateTime]::UtcNow.ToString('o'); automaticRetryAllowed = $false }
  $bytes = (New-Object Text.UTF8Encoding($false)).GetBytes((ConvertTo-Phase7BCanonicalJson -InputObject $value))
  $stream = New-Object IO.FileStream($marker, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
  try { $stream.Write($bytes, 0, $bytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }
  [pscustomobject][ordered]@{ classification = $value.classification; pass = $true; markerFileName = Split-Path -Leaf $marker; markerSha256 = Get-Phase7BSha256 -LiteralPath $marker }
}

function Assert-Phase7BWorkPackage2AttemptIdentity {
  [CmdletBinding()] param(
    [Parameter(Mandatory = $true)][AllowNull()][AllowEmptyString()][string]$ExpectedAttemptId,
    [Parameter(Mandatory = $true)][AllowNull()][AllowEmptyString()][string]$ObservedAttemptId
  )
  if ($ExpectedAttemptId -cnotmatch '^phase7b-wp2-[0-9a-f]{32}$' -or
      $ObservedAttemptId -cnotmatch '^phase7b-wp2-[0-9a-f]{32}$' -or
      $ObservedAttemptId -cne $ExpectedAttemptId) {
    throw 'PHASE7B_WP2B_ATTEMPT_IDENTITY_MISMATCH'
  }
  $ExpectedAttemptId
}

function Assert-Phase7BWorkPackage2StableRefreshOutputSet {
  [CmdletBinding()] param(
    [Parameter(Mandatory = $true)][AllowNull()][AllowEmptyString()][string]$ExpectedAttemptId,
    [Parameter(Mandatory = $true)][AllowNull()][AllowEmptyString()][string]$RefreshNonce,
    [Parameter(Mandatory = $true)][string]$OutputDirectory
  )
  $attemptId = Assert-Phase7BWorkPackage2AttemptIdentity -ExpectedAttemptId $ExpectedAttemptId -ObservedAttemptId $ExpectedAttemptId
  if ($RefreshNonce -cnotmatch '^[0-9a-f]{32}$') { throw 'PHASE7B_WP2B_STABLE_REFRESH_NONCE_REJECTED' }
  $stem = "$attemptId-refresh-$RefreshNonce"
  $paths = [ordered]@{
    selectionPath = Join-Path $OutputDirectory "$stem-selection.json"
    inventoryAuthorizationPath = Join-Path $OutputDirectory "$stem-inventory-authorization.json"
    capturePlanPath = Join-Path $OutputDirectory "$stem-capture-plan.json"
  }
  if (@(@($paths.Values) | Where-Object { Test-Path -LiteralPath $_ }).Count -gt 0) {
    throw 'PHASE7B_WP2B_STABLE_REFRESH_OUTPUT_COLLISION'
  }
  [pscustomobject]$paths
}

function Get-Phase7BWorkPackage2ExistingInventorySetDecision {
  [CmdletBinding()] param(
    [Parameter(Mandatory = $true)][string]$ExpectedAttemptId,
    [Parameter(Mandatory = $true)][string]$ExpectedToolingCommit,
    [Parameter(Mandatory = $true)][string]$ExpectedSourceRootSha256,
    [Parameter(Mandatory = $true)][string]$SelectionPath,
    [Parameter(Mandatory = $true)][string]$InventoryAuthorizationPath,
    [Parameter(Mandatory = $true)][string]$CapturePlanPath
  )
  try {
    [void](Assert-Phase7BWorkPackage2AttemptIdentity -ExpectedAttemptId $ExpectedAttemptId -ObservedAttemptId $ExpectedAttemptId)
    if ($ExpectedToolingCommit -cnotmatch '^[0-9a-f]{40}$' -or $ExpectedSourceRootSha256 -cnotmatch '^[0-9a-f]{64}$') {
      throw 'PHASE7B_WP2B_EXISTING_INVENTORY_EXPECTATION_REJECTED'
    }
    $paths = @($SelectionPath, $InventoryAuthorizationPath, $CapturePlanPath)
    $presentCount = @($paths | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf }).Count
    if ($presentCount -eq 0) {
      return [pscustomobject][ordered]@{
        classification = 'PHASE7B_WP2B_REFRESH_REQUIRED'; pass = $false
        safeReasonCode = 'PHASE7B_WP2B_EXACT_ATTEMPT_INVENTORY_SET_ABSENT'; presentFileCount = 0
        automaticRetryAllowed = $false; wp2cAuthorized = $false
      }
    }
    if ($presentCount -ne 3) { throw 'PHASE7B_WP2B_EXISTING_INVENTORY_PARTIAL_SET' }
    $selectionSha = Get-Phase7BSha256 -LiteralPath $SelectionPath
    $inventoryAuthorizationSha = Get-Phase7BSha256 -LiteralPath $InventoryAuthorizationPath
    $capturePlanSha = Get-Phase7BSha256 -LiteralPath $CapturePlanPath
    $selection = Get-Content -LiteralPath $SelectionPath -Raw | ConvertFrom-Json -ErrorAction Stop
    $inventoryAuthorization = Get-Content -LiteralPath $InventoryAuthorizationPath -Raw | ConvertFrom-Json -ErrorAction Stop
    $capturePlan = Get-Content -LiteralPath $CapturePlanPath -Raw | ConvertFrom-Json -ErrorAction Stop
    $wp2 = Get-Phase7BWorkPackage2Contract
    foreach ($observedAttemptId in @($selection.attemptId, $inventoryAuthorization.attemptId, $capturePlan.attemptId)) {
      [void](Assert-Phase7BWorkPackage2AttemptIdentity -ExpectedAttemptId $ExpectedAttemptId -ObservedAttemptId ([string]$observedAttemptId))
    }
    if ([string]$selection.classification -cne 'PHASE7B_WP2_WINDOWS_SELECTION' -or
        [string]$selection.toolingCommit -cne $ExpectedToolingCommit -or
        [string]$selection.applicationCommit -cne [string]$wp2.applicationCommit -or
        [string]$selection.environmentId -cne [string]$wp2.environmentId -or
        [string]$selection.vmDisplayName -cne [string]$wp2.vmDisplayName -or
        [string]$selection.windowsHostId -cne [string]$wp2.windowsHostId -or
        [string]$selection.manifestDigest -cne [string]$wp2.manifestDigest -or
        [string]$selection.sourceRootSha256 -cne $ExpectedSourceRootSha256 -or
        [int]$selection.canonicalEvidence.requiredCollectionPresentCount -ne 39 -or
        [int]$selection.canonicalEvidence.missingCollectionCount -ne 0 -or
        [int]$selection.canonicalEvidence.unknownCollectionCount -ne 0 -or
        [int]$selection.canonicalEvidence.missingMediaReferenceCount -ne 0 -or
        [int]$selection.exclusionEvidence.credentialSignalCount -ne 0 -or
        [string]$inventoryAuthorization.classification -cne [string]$wp2.authorizationClassification -or
        [string]$inventoryAuthorization.toolingCommit -cne $ExpectedToolingCommit -or
        [string]$inventoryAuthorization.applicationCommit -cne [string]$wp2.applicationCommit -or
        [string]$inventoryAuthorization.environmentId -cne [string]$wp2.environmentId -or
        [string]$inventoryAuthorization.vmDisplayName -cne [string]$wp2.vmDisplayName -or
        [string]$inventoryAuthorization.windowsHostId -cne [string]$wp2.windowsHostId -or
        [string]$inventoryAuthorization.manifestDigest -cne [string]$wp2.manifestDigest -or
        [string]$inventoryAuthorization.sourceRootSha256 -cne $ExpectedSourceRootSha256 -or
        @($inventoryAuthorization.authorizedStages).Count -ne 1 -or
        [string]$inventoryAuthorization.authorizedStages[0].stage -cne 'WP2B_INVENTORY' -or
        [int]$inventoryAuthorization.authorizedStages[0].mutationBudget -ne 1 -or
        -not [bool]$inventoryAuthorization.founderApproved -or [bool]$inventoryAuthorization.automaticRetryAllowed -or
        [string]$capturePlan.classification -cne 'PHASE7B_WP2_CAPTURE_PLAN' -or
        [string]$capturePlan.applicationCommit -cne [string]$wp2.applicationCommit -or
        [string]$capturePlan.environmentId -cne [string]$wp2.environmentId -or
        [string]$capturePlan.vmDisplayName -cne [string]$wp2.vmDisplayName -or
        [string]$capturePlan.windowsHostId -cne [string]$wp2.windowsHostId -or
        [string]$capturePlan.manifestDigest -cne [string]$wp2.manifestDigest -or
        [string]$capturePlan.selectionSha256 -cne $selectionSha -or
        [string]$capturePlan.sourceInventorySha256 -cnotmatch '^[0-9a-f]{64}$' -or
        [string]$capturePlan.sourceRootSha256 -cne $ExpectedSourceRootSha256 -or
        [int]$capturePlan.fileCount -lt 1 -or [int64]$capturePlan.totalBytes -lt 1) {
      throw 'PHASE7B_WP2B_EXISTING_INVENTORY_BINDING_MISMATCH'
    }
    [pscustomobject][ordered]@{
      classification = 'PHASE7B_WP2B_EXISTING_INVENTORY_CANDIDATE'; pass = $true
      selectionSha256 = $selectionSha; inventoryAuthorizationSha256 = $inventoryAuthorizationSha
      capturePlanSha256 = $capturePlanSha; sourceInventorySha256 = [string]$capturePlan.sourceInventorySha256
      presentFileCount = 3; automaticRetryAllowed = $false; wp2cAuthorized = $false
    }
  } catch {
    $safeCode = if ($_.Exception.Message -match '^PHASE7B_') { $_.Exception.Message } else { 'PHASE7B_WP2B_EXISTING_INVENTORY_PARSE_OR_BINDING_FAIL' }
    [pscustomobject][ordered]@{
      classification = 'PHASE7B_WP2B_NONREFRESHABLE_INVENTORY_FAILURE'; pass = $false
      safeReasonCode = $safeCode; presentFileCount = @(@($SelectionPath, $InventoryAuthorizationPath, $CapturePlanPath) | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf }).Count
      automaticRetryAllowed = $false; wp2cAuthorized = $false
    }
  }
}

function Resolve-Phase7BWorkPackage2StableInventoryPreflightDecision {
  [CmdletBinding()] param(
    [Parameter(Mandatory = $true)][int]$ExitCode,
    [Parameter(Mandatory = $true)]$Result
  )
  if ($ExitCode -eq 0 -and [bool]$Result.pass -and
      [string]$Result.classification -ceq 'PHASE7B_WP2B_STABLE_PREFLIGHT_AND_AUTHORIZATION_PASS') {
    return [pscustomobject][ordered]@{ classification = 'PHASE7B_WP2B_EXISTING_INVENTORY_REUSABLE'; pass = $true; refreshAllowed = $false }
  }
  if ($ExitCode -ne 0 -and -not [bool]$Result.pass -and
      [string]$Result.classification -ceq 'PHASE7B_WP2B_STABLE_PREFLIGHT_AND_AUTHORIZATION_FAIL' -and
      [string]$Result.safeErrorCode -ceq 'PHASE7B_WP2B_STABLE_BINDING_REFRESH_REQUIRED') {
    return [pscustomobject][ordered]@{ classification = 'PHASE7B_WP2B_REFRESH_REQUIRED'; pass = $false; refreshAllowed = $true }
  }
  [pscustomobject][ordered]@{ classification = 'PHASE7B_WP2B_NONREFRESHABLE_INVENTORY_FAILURE'; pass = $false; refreshAllowed = $false }
}

function Test-Phase7BWorkPackage2StablePreflightEvidence {
  [CmdletBinding()] param([Parameter(Mandatory = $true)]$Evidence)
  $pass = [bool]$Evidence.repositoryIdentityPass -and [bool]$Evidence.originParityPass -and [bool]$Evidence.trackedTreeClean -and
    [bool]$Evidence.planBindingPass -and [bool]$Evidence.inventoryBindingPass -and [bool]$Evidence.runtimeBindingPass -and
    [int]$Evidence.requiredCollectionCount -eq 39 -and [int]$Evidence.missingCollectionCount -eq 0 -and
    [int]$Evidence.unknownCollectionCount -eq 0 -and [int]$Evidence.missingMediaReferenceCount -eq 0 -and
    [int]$Evidence.credentialSignalCount -eq 0 -and [bool]$Evidence.ageIdentityPass -and [bool]$Evidence.primaryDestinationPass -and
    [bool]$Evidence.laptopReachable -and [bool]$Evidence.quiescencePass -and [bool]$Evidence.sourceStableAcrossPreflight
  [pscustomobject][ordered]@{ pass = [bool]$pass; classification = if ($pass) { 'PHASE7B_WP2B_STABLE_PREFLIGHT_PASS' } else { 'PHASE7B_WP2B_STABLE_PREFLIGHT_FAIL' } }
}

Export-ModuleMember -Function @(
  'Get-Phase7BWorkPackage2OperatorContract',
  'Test-Phase7BWorkPackage2QuiescenceEvidence',
  'New-Phase7BWorkPackage2CaptureAuthorizationDocument',
  'Assert-Phase7BWorkPackage2CaptureAuthorization',
  'Use-Phase7BWorkPackage2CaptureAuthorization',
  'Assert-Phase7BWorkPackage2AttemptIdentity',
  'Assert-Phase7BWorkPackage2StableRefreshOutputSet',
  'Get-Phase7BWorkPackage2ExistingInventorySetDecision',
  'Resolve-Phase7BWorkPackage2StableInventoryPreflightDecision',
  'Test-Phase7BWorkPackage2StablePreflightEvidence'
)
