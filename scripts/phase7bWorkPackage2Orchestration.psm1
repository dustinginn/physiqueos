Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2Contract.psm1')

function New-Phase7BWorkPackage2InvocationContractDocument {
  [CmdletBinding()] param(
    [Parameter(Mandatory = $true)][string]$AttemptId,
    [Parameter(Mandatory = $true)][string]$ToolingCommit,
    [Parameter(Mandatory = $true)][string]$ApplicationCommit,
    [Parameter(Mandatory = $true)][object[]]$Artifacts
  )
  if ($AttemptId -cnotmatch '^phase7b-wp2-[0-9a-f]{32}$' -or $ToolingCommit -cnotmatch '^[0-9a-f]{40}$' -or
      $ApplicationCommit -cnotmatch '^[0-9a-f]{40}$') { throw 'PHASE7B_WP2B_INVOCATION_CONTRACT_IDENTITY_FAIL' }
  $sorted = @($Artifacts | Sort-Object relativePath -CaseSensitive | ForEach-Object {
    if ([string]$_.relativePath -cnotmatch '^scripts/[A-Za-z0-9._-]+$' -or [string]$_.sha256 -cnotmatch '^[0-9a-f]{64}$' -or [int64]$_.bytes -lt 1) {
      throw 'PHASE7B_WP2B_INVOCATION_CONTRACT_ARTIFACT_FAIL'
    }
    [ordered]@{ relativePath=[string]$_.relativePath;sha256=[string]$_.sha256;bytes=[int64]$_.bytes }
  })
  if (@($sorted.relativePath | Sort-Object -Unique).Count -ne $sorted.Count) { throw 'PHASE7B_WP2B_INVOCATION_CONTRACT_DUPLICATE_ARTIFACT' }
  [ordered]@{
    schemaVersion = 1
    classification = 'PHASE7B_WP2B_DURABLE_INVOCATION_CONTRACT'
    attemptId = $AttemptId
    toolingCommit = $ToolingCommit
    applicationCommit = $ApplicationCommit
    artifacts = $sorted
    retainedStage2Required = $true
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
  if ([int]$document.schemaVersion -ne 1 -or [string]$document.classification -cne 'PHASE7B_WP2B_DURABLE_INVOCATION_CONTRACT' -or
      [string]$document.attemptId -cne $ExpectedAttemptId -or [string]$document.toolingCommit -cnotmatch '^[0-9a-f]{40}$' -or
      [string]$document.applicationCommit -cnotmatch '^[0-9a-f]{40}$' -or -not [bool]$document.retainedStage2Required -or
      [bool]$document.automaticRetryAllowed -or [bool]$document.wp2cAuthorized) { throw 'PHASE7B_WP2B_INVOCATION_CONTRACT_BINDING_FAIL' }
  $document
}

Export-ModuleMember -Function @(
  'New-Phase7BWorkPackage2InvocationContractDocument',
  'Assert-Phase7BWorkPackage2InvocationContract'
)
