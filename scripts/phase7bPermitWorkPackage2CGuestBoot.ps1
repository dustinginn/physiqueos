[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$InvocationPath,[Parameter(Mandatory=$true)][string]$InvocationSha256,[Parameter(Mandatory=$true)][string]$AuthorizationPath,[Parameter(Mandatory=$true)][string]$AuthorizationSha256,[Parameter(Mandatory=$true)][string]$VmxPath,[Parameter(Mandatory=$true)][string]$SnapshotMetadataPath,[Parameter(Mandatory=$true)][string]$RecoveryMediaPath,[Parameter(Mandatory=$true)][string]$ControlMediaPath,[Parameter(Mandatory=$true)][string]$ControlMediaSha256,[Parameter(Mandatory=$true)][switch]$FounderClaimedExecutionBootApproved)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bIsolatedGuestContract.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CContract.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CHost.psm1')
Assert-Phase7BWP2C $FounderClaimedExecutionBootApproved.IsPresent 'CLAIMED_BOOT_REVIEW_REQUIRED'
$c=Read-Phase7BWP2CBoundJson $InvocationPath $InvocationSha256
$a=Read-Phase7BWP2CBoundJson $AuthorizationPath $AuthorizationSha256
Assert-Phase7BWP2CAuthorization $a $c $InvocationSha256
Assert-Phase7BWP2CPublishedRepository (Split-Path -Parent $PSScriptRoot) $c.bindings.toolingCommit
$head=@(& git --no-optional-locks -C (Split-Path -Parent $PSScriptRoot) rev-parse HEAD)
Assert-Phase7BWP2C ($LASTEXITCODE -eq 0 -and $head.Count -eq 1 -and $head[0] -ceq $c.bindings.toolingCommit) 'TOOLING_COMMIT_MISMATCH'
foreach($file in $c.hostArtifacts.files){Assert-Phase7BWP2CFile (Join-Path $PSScriptRoot $file.name) $file}
$observation=Get-Phase7BWP2CHostObservation $VmxPath $SnapshotMetadataPath
Assert-Phase7BWP2C (Test-Phase7BWP2CHostObservation $observation $c.bindings).pass 'HOST_BOOT_PREFLIGHT'
$ledger='C:\Phase7B\host-evidence\379bb303\wp2c\claims'
Assert-Phase7BWP2C ((Get-Phase7BWP2CExecutionState $ledger $a.authorizationId) -ceq 'CLAIMED_RECONCILIATION_REQUIRED') 'HOST_CLAIM_REQUIRED'
$claimPath=Join-Path $ledger ($a.authorizationId+'.claim.json');$claimId=Get-Phase7BWP2CIdentity $claimPath
$claim=Read-Phase7BWP2CBoundJson $claimPath $claimId.sha256
Assert-Phase7BWP2CClaim $claim $a $AuthorizationSha256 'host'
Assert-Phase7BWP2CBootMedia (Read-Phase7BVmx $VmxPath) $VmxPath $RecoveryMediaPath $ControlMediaPath $c.bindings $ControlMediaSha256
# Durable one-shot boot permit outside the rollback domain. This script does NOT
# power on, attach media, or alter VMX. Failure/cancellation never removes it.
$permit=[ordered]@{schemaVersion=1;kind='wp2c-host-boot-permit';authorizationId=$a.authorizationId;hostClaimSha256=$claimId.sha256;invocationContractSha256=$InvocationSha256;controlMediaSha256=$ControlMediaSha256;restoreMediaSha256=$c.bindings.restoreMedia.sha256;observedRawVmxSha256=$observation.rawVmxSha256;permittedAt=[datetime]::UtcNow.ToString('o');automaticRetryAllowed=$false}
$identity=Write-Phase7BWP2CCreateNewJson (Join-Path $ledger ($a.authorizationId+'.boot.json')) $permit
[ordered]@{classification='PHASE7B_WP2C_ONE_SHOT_HOST_BOOT_PERMIT';identity=$identity;vmBooted=$false;automaticRetryAllowed=$false}|ConvertTo-Json -Depth 4
