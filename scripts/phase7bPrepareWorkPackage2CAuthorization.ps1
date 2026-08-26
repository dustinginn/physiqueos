[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$InvocationPath,[Parameter(Mandatory=$true)][string]$InvocationSha256,[Parameter(Mandatory=$true)][string]$PreparationPath,[Parameter(Mandatory=$true)][string]$AuthorizationDirectory,[Parameter(Mandatory=$true)][string]$LedgerRoot,[Parameter(Mandatory=$true)][switch]$FounderAuthorizationCreationApproved)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CContract.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CHost.psm1')
Assert-Phase7BWP2C $FounderAuthorizationCreationApproved.IsPresent 'FOUNDER_AUTHORIZATION_REQUIRED'
Assert-Phase7BWP2C ($LedgerRoot -ceq 'C:\Phase7B\host-evidence\379bb303\wp2c\claims' -and $AuthorizationDirectory -ceq 'C:\Phase7B\host-evidence\379bb303\wp2c\authorizations') 'HOST_AUTHORIZATION_ROOTS'
[void](Assert-Phase7BWP2CLocalPath $LedgerRoot);[void](Assert-Phase7BWP2CLocalPath $AuthorizationDirectory)
$c=Read-Phase7BWP2CBoundJson $InvocationPath $InvocationSha256
Assert-Phase7BWP2CInvocation $c
Assert-Phase7BWP2CPublishedRepository (Split-Path -Parent $PSScriptRoot) $c.bindings.toolingCommit
foreach($file in $c.hostArtifacts.files){Assert-Phase7BWP2CFile (Join-Path $PSScriptRoot $file.name) $file}
$head=@(& git --no-optional-locks -C (Split-Path -Parent $PSScriptRoot) rev-parse HEAD)
Assert-Phase7BWP2C ($LASTEXITCODE -eq 0 -and $head.Count -eq 1 -and $head[0] -ceq $c.bindings.toolingCommit) 'TOOLING_COMMIT_MISMATCH'
$p=Read-Phase7BWP2CBoundJson $PreparationPath $c.bindings.preparationEvidenceSha256
Assert-Phase7BWP2CPreparation $p $c.bindings
# Serialize eligibility + creation. The empty coordination file is not an
# authorization/claim and contains no secret. No retry if another writer owns it.
$lock=New-Object IO.FileStream((Join-Path $AuthorizationDirectory 'wp2c-authoring.lock'),[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
try {
  Assert-Phase7BWP2CNoCurrentConflict $AuthorizationDirectory $c $LedgerRoot
  $a=New-Phase7BWP2CAuthorization $c $InvocationSha256
  Assert-Phase7BWP2CAuthorization $a $c $InvocationSha256
  $path=Join-Path $AuthorizationDirectory ($a.authorizationId+'.json')
  $identity=Write-Phase7BWP2CCreateNewJson $path $a
} finally {$lock.Dispose()}
[ordered]@{classification='PHASE7B_WP2C_AUTHORIZATION_CREATED';authorizationId=$a.authorizationId;path=$path;sha256=$identity.sha256;bytes=$identity.bytes;issuedAt=$a.issuedAt;expiresAt=$a.expiresAt;executionClaimCreated=$false;wp2cExecuted=$false}|ConvertTo-Json
