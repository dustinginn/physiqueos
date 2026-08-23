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
    [Parameter(Mandatory = $true)][string]$OutputDirectory
  )
  $attemptId = Assert-Phase7BWorkPackage2AttemptIdentity -ExpectedAttemptId $ExpectedAttemptId -ObservedAttemptId $ExpectedAttemptId
  $paths = [ordered]@{
    selectionPath = Join-Path $OutputDirectory "$attemptId-selection.json"
    inventoryAuthorizationPath = Join-Path $OutputDirectory "$attemptId-inventory-authorization.json"
    capturePlanPath = Join-Path $OutputDirectory "$attemptId-capture-plan.json"
  }
  if (@(@($paths.Values) | Where-Object { Test-Path -LiteralPath $_ }).Count -gt 0) {
    throw 'PHASE7B_WP2B_STABLE_REFRESH_OUTPUT_COLLISION'
  }
  [pscustomobject]$paths
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
  'Test-Phase7BWorkPackage2StablePreflightEvidence'
)
