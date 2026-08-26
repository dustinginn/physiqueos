[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$InvocationPath,[Parameter(Mandatory=$true)][string]$InvocationSha256,[Parameter(Mandatory=$true)][string]$AuthorizationPath,[Parameter(Mandatory=$true)][string]$AuthorizationSha256,[Parameter(Mandatory=$true)][string]$VmxPath,[Parameter(Mandatory=$true)][string]$SnapshotMetadataPath,[Parameter(Mandatory=$true)][string]$PreparationPath,[Parameter(Mandatory=$true)][string]$ToolingMediaPath,[Parameter(Mandatory=$true)][string]$RecoveryMediaPath,[Parameter(Mandatory=$true)][switch]$FounderOneShotExecutionGo)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CContract.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CHost.psm1')
Assert-Phase7BWP2C $FounderOneShotExecutionGo.IsPresent 'FOUNDER_EXECUTION_GO_REQUIRED'
$c=Read-Phase7BWP2CBoundJson $InvocationPath $InvocationSha256
$a=Read-Phase7BWP2CBoundJson $AuthorizationPath $AuthorizationSha256
Assert-Phase7BWP2CAuthorization $a $c $InvocationSha256
Assert-Phase7BWP2CPublishedRepository (Split-Path -Parent $PSScriptRoot) $c.bindings.toolingCommit
Assert-Phase7BWP2CFile $ToolingMediaPath $c.bindings.toolingMedia
Assert-Phase7BWP2CFile $RecoveryMediaPath $c.bindings.restoreMedia
foreach($file in $c.hostArtifacts.files){Assert-Phase7BWP2CFile (Join-Path $PSScriptRoot $file.name) $file}
$head=@(& git --no-optional-locks -C (Split-Path -Parent $PSScriptRoot) rev-parse HEAD)
Assert-Phase7BWP2C ($LASTEXITCODE -eq 0 -and $head.Count -eq 1 -and $head[0] -ceq $c.bindings.toolingCommit) 'TOOLING_COMMIT_MISMATCH'
$p=Read-Phase7BWP2CBoundJson $PreparationPath $c.bindings.preparationEvidenceSha256
Assert-Phase7BWP2CPreparation $p $c.bindings
$observation=Get-Phase7BWP2CHostObservation $VmxPath $SnapshotMetadataPath
Assert-Phase7BWP2C (Test-Phase7BWP2CHostObservation $observation $c.bindings).pass 'HOST_PREFLIGHT_FAIL'
# Fixed Primary-only ledger; never a VM disk, shared folder, or snapshot member.
$ledger='C:\Phase7B\host-evidence\379bb303\wp2c\claims'
$claim=New-Phase7BWP2CExecutionClaim $ledger $a $AuthorizationSha256 'host' ''
[ordered]@{classification='PHASE7B_WP2C_HOST_EXECUTION_CLAIMED';claimPath=$claim.path;claimSha256=$claim.identity.sha256;claimBytes=$claim.identity.bytes;vmBooted=$false;packetDecrypted=$false;automaticRetryAllowed=$false}|ConvertTo-Json
