Set-StrictMode -Version Latest

function Test-Phase7BWorkPackage2CaptureAuthorizationShape {
  [CmdletBinding()] param(
    [Parameter(Mandatory = $true)]$Authorization,
    [Parameter(Mandatory = $true)][string]$ExpectedAttemptId,
    [Parameter(Mandatory = $true)][string]$ExpectedToolingCommit
  )
  $properties = @($Authorization.PSObject.Properties.Name)
  $stages = @(if ($properties -contains 'authorizedStages') { @($Authorization.authorizedStages) })
  $required = @('schemaVersion','classification','authorizationId','attemptId','toolingCommit','authorizedStages',
    'expiresAt','oneUseOnly','automaticRetryAllowed','wp2cAuthorized','consumptionMarkerFileName',
    'capturePlanSha256','sourceInventorySha256','sourceRootSha256','localOutputRootSha256',
    'replicaRootSha256','ageExeSha256','quiescenceEvidenceSha256')
  $missing = @($required | Where-Object { $properties -notcontains $_ })
  $expiry = [DateTime]::MinValue
  $expiryPass = $false
  if ($missing.Count -eq 0) { $expiryPass = [DateTime]::TryParse([string]$Authorization.expiresAt, [ref]$expiry) }
  $hashes = @(if ($missing.Count -eq 0) { @(
    [string]$Authorization.capturePlanSha256, [string]$Authorization.sourceInventorySha256,
    [string]$Authorization.sourceRootSha256, [string]$Authorization.localOutputRootSha256,
    [string]$Authorization.replicaRootSha256, [string]$Authorization.ageExeSha256,
    [string]$Authorization.quiescenceEvidenceSha256
  ) })
  $pass = $missing.Count -eq 0 -and [int]$Authorization.schemaVersion -eq 1 -and
    [string]$Authorization.classification -ceq 'PHASE7B_WP2_STAGE_AUTHORIZATION' -and
    [string]$Authorization.authorizationId -cmatch '^phase7b-wp2b-capture-auth-[0-9a-f]{32}$' -and
    [string]$Authorization.attemptId -ceq $ExpectedAttemptId -and
    [string]$Authorization.toolingCommit -ceq $ExpectedToolingCommit -and
    $stages.Count -eq 1 -and [string]$stages[0].stage -ceq 'WP2B_CAPTURE' -and
    [int]$stages[0].mutationBudget -eq 1 -and [bool]$Authorization.oneUseOnly -and
    -not [bool]$Authorization.automaticRetryAllowed -and -not [bool]$Authorization.wp2cAuthorized -and
    [string]$Authorization.consumptionMarkerFileName -ceq "$([string]$Authorization.authorizationId).used.json" -and
    $expiryPass -and @($hashes | Where-Object { $_ -cnotmatch '^[0-9a-f]{64}$' }).Count -eq 0
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
