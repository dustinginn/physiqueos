Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bIsolatedGuestContract.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2Contract.psm1')

function New-Phase7BWorkPackage2InvocationContractDocument {
  [CmdletBinding()] param(
    [Parameter(Mandatory = $true)][string]$AttemptId,
    [Parameter(Mandatory = $true)][string]$ToolingCommit,
    [Parameter(Mandatory = $true)][string]$ApplicationCommit,
    [Parameter(Mandatory = $true)][object[]]$Artifacts,
    [Parameter(Mandatory = $true)][string]$AgeRecipient,
    [Parameter(Mandatory = $true)][string]$AgeExePathSha256,
    [Parameter(Mandatory = $true)][string]$AgeExeSha256,
    [Parameter(Mandatory = $true)][string]$AgeVersion,
    [Parameter(Mandatory = $true)][string]$AgeKeygenPathSha256,
    [Parameter(Mandatory = $true)][string]$AgeKeygenSha256,
    [Parameter(Mandatory = $true)][string]$AgeKeygenVersion
  )
  $ageBindingHashes = @($AgeExePathSha256,$AgeExeSha256,$AgeKeygenPathSha256,$AgeKeygenSha256)
  if ($AttemptId -cnotmatch '^phase7b-wp2-[0-9a-f]{32}$' -or $ToolingCommit -cnotmatch '^[0-9a-f]{40}$' -or
      $ApplicationCommit -cnotmatch '^[0-9a-f]{40}$' -or $AgeRecipient -cnotmatch '^age1[023456789acdefghjklmnpqrstuvwxyz]{58}$' -or
      $AgeVersion -cne '1.3.1' -or $AgeKeygenVersion -cne '1.3.1' -or
      @($ageBindingHashes | Where-Object { $_ -cnotmatch '^[0-9a-f]{64}$' }).Count -ne 0) {
    throw 'PHASE7B_WP2B_INVOCATION_CONTRACT_IDENTITY_FAIL'
  }
  $sorted = @($Artifacts | Sort-Object relativePath -CaseSensitive | ForEach-Object {
    if ([string]$_.relativePath -cnotmatch '^scripts/[A-Za-z0-9._-]+$' -or [string]$_.sha256 -cnotmatch '^[0-9a-f]{64}$' -or [int64]$_.bytes -lt 1) {
      throw 'PHASE7B_WP2B_INVOCATION_CONTRACT_ARTIFACT_FAIL'
    }
    [ordered]@{ relativePath=[string]$_.relativePath;sha256=[string]$_.sha256;bytes=[int64]$_.bytes }
  })
  if (@($sorted.relativePath | Sort-Object -Unique).Count -ne $sorted.Count) { throw 'PHASE7B_WP2B_INVOCATION_CONTRACT_DUPLICATE_ARTIFACT' }
  [ordered]@{
    schemaVersion = 2
    classification = 'PHASE7B_WP2B_DURABLE_INVOCATION_CONTRACT'
    attemptId = $AttemptId
    toolingCommit = $ToolingCommit
    applicationCommit = $ApplicationCommit
    artifacts = $sorted
    retainedStage2Required = $true
    ageEncryptionMode = 'native-recipient-v1'
    ageRecipient = $AgeRecipient
    ageIdentityInputMode = 'stdin'
    nativeRecipientRequired = $true
    agePluginRequired = $false
    ageExePathSha256 = $AgeExePathSha256
    ageExeSha256 = $AgeExeSha256
    ageVersion = $AgeVersion
    ageKeygenPathSha256 = $AgeKeygenPathSha256
    ageKeygenSha256 = $AgeKeygenSha256
    ageKeygenVersion = $AgeKeygenVersion
    decryptRoundTripRequired = $true
    automaticRetryAllowed = $false
    wp2cAuthorized = $false
  }
}

function Assert-Phase7BWorkPackage2InvocationContract {
  [CmdletBinding()] param(
    [Parameter(Mandatory = $true)][string]$LiteralPath,
    [Parameter(Mandatory = $true)][string]$ExpectedSha256,
    [Parameter(Mandatory = $true)][string]$ExpectedAttemptId
  )
  if ($ExpectedSha256 -cnotmatch '^[0-9a-f]{64}$' -or (Get-Phase7BSha256 -LiteralPath $LiteralPath) -cne $ExpectedSha256) {
    throw 'PHASE7B_WP2B_INVOCATION_CONTRACT_HASH_FAIL'
  }
  $document = Get-Content -LiteralPath $LiteralPath -Raw | ConvertFrom-Json -ErrorAction Stop
  $ageBindingHashes = @([string]$document.ageExePathSha256,[string]$document.ageExeSha256,[string]$document.ageKeygenPathSha256,[string]$document.ageKeygenSha256)
  if ([int]$document.schemaVersion -ne 2 -or [string]$document.classification -cne 'PHASE7B_WP2B_DURABLE_INVOCATION_CONTRACT' -or
      [string]$document.attemptId -cne $ExpectedAttemptId -or [string]$document.toolingCommit -cnotmatch '^[0-9a-f]{40}$' -or
      [string]$document.applicationCommit -cnotmatch '^[0-9a-f]{40}$' -or -not [bool]$document.retainedStage2Required -or
      [string]$document.ageEncryptionMode -cne 'native-recipient-v1' -or
      [string]$document.ageRecipient -cnotmatch '^age1[023456789acdefghjklmnpqrstuvwxyz]{58}$' -or
      [string]$document.ageIdentityInputMode -cne 'stdin' -or -not [bool]$document.nativeRecipientRequired -or
      [bool]$document.agePluginRequired -or
      [string]$document.ageVersion -cne '1.3.1' -or [string]$document.ageKeygenVersion -cne '1.3.1' -or
      @($ageBindingHashes | Where-Object { $_ -cnotmatch '^[0-9a-f]{64}$' }).Count -ne 0 -or
      -not [bool]$document.decryptRoundTripRequired -or
      [bool]$document.automaticRetryAllowed -or [bool]$document.wp2cAuthorized) { throw 'PHASE7B_WP2B_INVOCATION_CONTRACT_BINDING_FAIL' }
  $document
}

Export-ModuleMember -Function @(
  'New-Phase7BWorkPackage2InvocationContractDocument',
  'Assert-Phase7BWorkPackage2InvocationContract'
)
