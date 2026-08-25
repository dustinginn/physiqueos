Set-StrictMode -Version Latest

function Test-Phase7BWorkPackage2CaptureAuthorizationShape {
  [CmdletBinding()] param(
    [Parameter(Mandatory = $true)]$Authorization,
    [Parameter(Mandatory = $true)][string]$ExpectedAttemptId,
    [Parameter(Mandatory = $true)][string]$ExpectedToolingCommit
  )
  $properties = @($Authorization.PSObject.Properties.Name)
  $stages = @(if ($properties -contains 'authorizedStages') { @($Authorization.authorizedStages) })
  $required = @('schemaVersion','classification','captureAuthorizationClassification','authorizationId','attemptId','toolingCommit','authorizedStages',
    'issuedAt','expiresAt','maximumAuthorizationLifetimeHours','oneUseOnly','automaticRetryAllowed','wp2cAuthorized','consumptionMarkerFileName',
    'invocationContractSha256','stage3LauncherSha256','ageEncryptionMode','ageRecipient','ageIdentityInputMode',
    'nativeRecipientRequired','agePluginRequired','ageVersion','ageKeygenPathSha256','ageKeygenSha256','ageKeygenVersion','decryptRoundTripRequired',
    'applicationCommit','environmentId','vmDisplayName','windowsHostId','manifestDigest','capturePlanSha256','sourceInventorySha256',
    'selectionSha256','sourceRootSha256','runtimeRevision','runtimeSha256','localOutputRootSha256','replicaRootSha256',
    'replicaUncRoot','replicaPathModel','laptopHostIdentitySha256','laptopDiskIdentitySha256','ageExePathSha256','ageExeSha256',
    'quiescenceEvidenceSha256','quiescenceEvidenceFileName','quiescenceEvidenceToolingCommit','founderApproved')
  $missing = @($required | Where-Object { $properties -notcontains $_ })
  $expiry = [DateTime]::MinValue
  $issued = [DateTime]::MinValue
  $expiryPass = $false
  $issuedPass = $false
  if ($missing.Count -eq 0) {
    $expiryPass = [DateTime]::TryParse([string]$Authorization.expiresAt, [ref]$expiry)
    $issuedPass = [DateTime]::TryParse([string]$Authorization.issuedAt, [ref]$issued)
  }
  $hashes = @(if ($missing.Count -eq 0) { @(
    [string]$Authorization.capturePlanSha256, [string]$Authorization.sourceInventorySha256,
    [string]$Authorization.sourceRootSha256, [string]$Authorization.localOutputRootSha256,
    [string]$Authorization.replicaRootSha256, [string]$Authorization.ageExeSha256,
    [string]$Authorization.quiescenceEvidenceSha256, [string]$Authorization.invocationContractSha256,
    [string]$Authorization.stage3LauncherSha256, [string]$Authorization.ageKeygenPathSha256,
    [string]$Authorization.ageKeygenSha256, [string]$Authorization.selectionSha256,
    [string]$Authorization.runtimeSha256, [string]$Authorization.ageExePathSha256,
    [string]$Authorization.laptopHostIdentitySha256, [string]$Authorization.laptopDiskIdentitySha256
  ) })
  $pass = $missing.Count -eq 0 -and [int]$Authorization.schemaVersion -eq 1 -and
    [string]$Authorization.classification -ceq 'PHASE7B_WP2_STAGE_AUTHORIZATION' -and
    [string]$Authorization.authorizationId -cmatch '^phase7b-wp2b-capture-auth-[0-9a-f]{32}$' -and
    [string]$Authorization.attemptId -ceq $ExpectedAttemptId -and
    [string]$Authorization.toolingCommit -ceq $ExpectedToolingCommit -and
    [string]$Authorization.captureAuthorizationClassification -ceq 'PHASE7B_WP2B_CAPTURE_AUTHORIZATION' -and
    [string]$Authorization.applicationCommit -cmatch '^[0-9a-f]{40}$' -and [int64]$Authorization.runtimeRevision -gt 0 -and
    $stages.Count -eq 1 -and [string]$stages[0].stage -ceq 'WP2B_CAPTURE' -and
    [int]$stages[0].mutationBudget -eq 1 -and [bool]$Authorization.oneUseOnly -and
    [string]$Authorization.ageEncryptionMode -ceq 'native-recipient-v1' -and
    [string]$Authorization.ageRecipient -cmatch '^age1[023456789acdefghjklmnpqrstuvwxyz]{58}$' -and
    [string]$Authorization.ageIdentityInputMode -ceq 'stdin' -and [bool]$Authorization.nativeRecipientRequired -and
    -not [bool]$Authorization.agePluginRequired -and [string]$Authorization.ageVersion -ceq '1.3.1' -and
    [string]$Authorization.ageKeygenVersion -ceq '1.3.1' -and [bool]$Authorization.decryptRoundTripRequired -and
    -not [bool]$Authorization.automaticRetryAllowed -and -not [bool]$Authorization.wp2cAuthorized -and
    [string]$Authorization.consumptionMarkerFileName -ceq "$([string]$Authorization.authorizationId).used.json" -and
    [string]$Authorization.replicaUncRoot -cmatch '^\\\\LAPTOP-4G5UOU2R\\P7B[0-9a-f]{8}\$$' -and
    [string]$Authorization.replicaPathModel -ceq 'EXACT_ATTEMPT_ROOT' -and [bool]$Authorization.founderApproved -and
    [int]$Authorization.maximumAuthorizationLifetimeHours -eq 24 -and $issuedPass -and $expiryPass -and
    $expiry.ToUniversalTime() -gt $issued.ToUniversalTime() -and $expiry.ToUniversalTime() -le $issued.ToUniversalTime().AddHours(24) -and
    @($hashes | Where-Object { $_ -cnotmatch '^[0-9a-f]{64}$' }).Count -eq 0
  [pscustomobject][ordered]@{
    pass = [bool]$pass
    expiryUtc = if ($expiryPass) { $expiry.ToUniversalTime() } else { $null }
    missingPropertyCount = $missing.Count
  }
}

function Get-Phase7BWorkPackage2CaptureAuthorizationEligibility {
  [CmdletBinding()] param(
    [Parameter(Mandatory = $true)][string]$LiteralPath,
    [Parameter(Mandatory = $true)][string]$ExpectedAttemptId,
    [Parameter(Mandatory = $true)][string]$ExpectedToolingCommit,
    [DateTime]$NowUtc = [DateTime]::UtcNow
  )
  $fileName = Split-Path -Leaf $LiteralPath
  $result = [ordered]@{
    fileName = $fileName; classification = 'HISTORICAL_AUDIT_EVIDENCE'; currentBinding = $false
    eligible = $false; blocksCreation = $false; markerExists = $false; expired = $false
    authorizationId = ''; attemptId = ''; toolingCommit = ''; safeExceptionType = ''; mutationPerformed = $false
  }
  try {
    $document = Get-Content -LiteralPath $LiteralPath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
    $result['authorizationId'] = [string]$document.authorizationId
    $result['attemptId'] = [string]$document.attemptId
    $result['toolingCommit'] = [string]$document.toolingCommit
    if ($result['attemptId'] -cne $ExpectedAttemptId -or $result['toolingCommit'] -cne $ExpectedToolingCommit) {
      return [pscustomobject]$result
    }
    $result['currentBinding'] = $true
    $shape = Test-Phase7BWorkPackage2CaptureAuthorizationShape -Authorization $document -ExpectedAttemptId $ExpectedAttemptId -ExpectedToolingCommit $ExpectedToolingCommit
    if (-not $shape.pass) {
      $result['classification'] = 'CURRENT_AUTHORIZATION_INVALID_CONFLICT'
      $result['blocksCreation'] = $true
      return [pscustomobject]$result
    }
    $markerPath = Join-Path (Split-Path -Parent ([IO.Path]::GetFullPath($LiteralPath))) ([string]$document.consumptionMarkerFileName)
    $result['markerExists'] = Test-Path -LiteralPath $markerPath -PathType Leaf
    $result['expired'] = $shape.expiryUtc -le $NowUtc.ToUniversalTime()
    if ($result['markerExists']) {
      $result['classification'] = 'CURRENT_AUTHORIZATION_CONSUMED_TERMINAL'
    } elseif ($result['expired']) {
      $result['classification'] = 'CURRENT_AUTHORIZATION_EXPIRED_TERMINAL'
    } else {
      $result['classification'] = 'CURRENT_AUTHORIZATION_ELIGIBLE'
      $result['eligible'] = $true
      $result['blocksCreation'] = $true
    }
    return [pscustomobject]$result
  } catch {
    $result['safeExceptionType'] = $_.Exception.GetType().Name
    if ($fileName -clike "$ExpectedAttemptId-phase7b-wp2b-capture-auth-*.json") {
      $result['classification'] = 'CURRENT_ATTEMPT_AUTHORIZATION_UNREADABLE_CONFLICT'
      $result['currentBinding'] = $true
      $result['blocksCreation'] = $true
    } else {
      $result['classification'] = 'UNREADABLE_UNRELATED_AUDIT_EVIDENCE'
    }
    return [pscustomobject]$result
  }
}

function Get-Phase7BWorkPackage2CaptureAuthorizationSet {
  [CmdletBinding()] param(
    [Parameter(Mandatory = $true)][string]$EvidenceRoot,
    [Parameter(Mandatory = $true)][string]$ExpectedAttemptId,
    [Parameter(Mandatory = $true)][string]$ExpectedToolingCommit,
    [DateTime]$NowUtc = [DateTime]::UtcNow
  )
  $candidates = @(Get-ChildItem -LiteralPath $EvidenceRoot -Filter '*-phase7b-wp2b-capture-auth-*.json' -File -ErrorAction Stop |
    ForEach-Object { Get-Phase7BWorkPackage2CaptureAuthorizationEligibility -LiteralPath $_.FullName -ExpectedAttemptId $ExpectedAttemptId -ExpectedToolingCommit $ExpectedToolingCommit -NowUtc $NowUtc })
  $conflicts = @($candidates | Where-Object { $_.blocksCreation })
  [pscustomobject][ordered]@{
    classification = if ($conflicts.Count -eq 0) { 'PHASE7B_WP2B_CURRENT_AUTHORIZATION_SET_CLEAR' } else { 'PHASE7B_WP2B_CURRENT_AUTHORIZATION_CONFLICT' }
    pass = $conflicts.Count -eq 0
    candidateCount = $candidates.Count
    historicalAuditEvidenceCount = @($candidates | Where-Object { -not $_.currentBinding }).Count
    terminalCurrentAuthorizationCount = @($candidates | Where-Object { $_.currentBinding -and -not $_.blocksCreation }).Count
    conflictingCurrentAuthorizationCount = $conflicts.Count
    candidates = $candidates
    mutationPerformed = $false
    automaticRetryAllowed = $false
    wp2cAuthorized = $false
  }
}

Export-ModuleMember -Function @(
  'Test-Phase7BWorkPackage2CaptureAuthorizationShape',
  'Get-Phase7BWorkPackage2CaptureAuthorizationEligibility',
  'Get-Phase7BWorkPackage2CaptureAuthorizationSet'
)
