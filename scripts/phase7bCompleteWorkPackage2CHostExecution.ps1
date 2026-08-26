[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$InvocationPath,[Parameter(Mandatory=$true)][string]$InvocationSha256,[Parameter(Mandatory=$true)][string]$AuthorizationPath,[Parameter(Mandatory=$true)][string]$AuthorizationSha256,[Parameter(Mandatory=$true)][string]$GuestEvidencePath,[Parameter(Mandatory=$true)][string]$GuestEvidenceSha256,[Parameter(Mandatory=$true)][string]$GuestCompletionPath,[Parameter(Mandatory=$true)][string]$GuestCompletionSha256,[Parameter(Mandatory=$true)][switch]$FounderEvidenceCloseoutApproved)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CContract.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CHost.psm1')
Assert-Phase7BWP2C $FounderEvidenceCloseoutApproved.IsPresent 'FOUNDER_CLOSEOUT_REQUIRED'
$c=Read-Phase7BWP2CBoundJson $InvocationPath $InvocationSha256
$a=Read-Phase7BWP2CBoundJson $AuthorizationPath $AuthorizationSha256
Assert-Phase7BWP2CInvocation $c
Assert-Phase7BWP2CPublishedRepository (Split-Path -Parent $PSScriptRoot) $c.bindings.toolingCommit
$hostUuid=(Get-CimInstance Win32_ComputerSystemProduct -ErrorAction Stop).UUID
Assert-Phase7BWP2C ((Get-Phase7BWP2CObjectHash ([string]$hostUuid).ToLowerInvariant()) -ceq $c.bindings.hostIdentitySha256) 'WRONG_HOST'
$head=@(& git --no-optional-locks -C (Split-Path -Parent $PSScriptRoot) rev-parse HEAD)
Assert-Phase7BWP2C ($LASTEXITCODE -eq 0 -and $head.Count -eq 1 -and $head[0] -ceq $c.bindings.toolingCommit) 'TOOLING_COMMIT_MISMATCH'
foreach($file in $c.hostArtifacts.files){Assert-Phase7BWP2CFile (Join-Path $PSScriptRoot $file.name) $file}
# Completion reconciliation may occur after expiry; it never grants execution.
Assert-Phase7BWP2CAuthorization $a $c $InvocationSha256 ([datetimeoffset]::Parse($a.issuedAt).UtcDateTime)
$ledger='C:\Phase7B\host-evidence\379bb303\wp2c\claims'
$claimPath=Join-Path $ledger ($a.authorizationId+'.claim.json')
$claimIdentity=Get-Phase7BWP2CIdentity $claimPath
$claim=Read-Phase7BWP2CBoundJson $claimPath $claimIdentity.sha256
Assert-Phase7BWP2CClaim $claim $a $AuthorizationSha256 'host'
$e=Read-Phase7BWP2CBoundJson $GuestEvidencePath $GuestEvidenceSha256
$m=Read-Phase7BWP2CBoundJson $GuestCompletionPath $GuestCompletionSha256
Assert-Phase7BWP2CPassEvidence $e $a $AuthorizationSha256 $claimIdentity.sha256
$boot=Read-Phase7BWP2CBoundJson (Join-Path $ledger ($a.authorizationId+'.boot.json')) $e.hostBootPermitSha256
Assert-Phase7BWP2C ($boot.schemaVersion -eq 1 -and $boot.kind -ceq 'wp2c-host-boot-permit' -and $boot.authorizationId -ceq $a.authorizationId -and $boot.hostClaimSha256 -ceq $claimIdentity.sha256 -and $boot.invocationContractSha256 -ceq $InvocationSha256 -and $boot.restoreMediaSha256 -ceq $a.bindings.restoreMedia.sha256 -and $boot.automaticRetryAllowed -ceq $false) 'HOST_BOOT_PERMIT_BINDING'
Assert-Phase7BWP2C ($m.schemaVersion -eq 1 -and $m.kind -ceq 'wp2c-completion' -and $m.authorizationId -ceq $a.authorizationId -and $m.claimSha256 -ceq $e.guestClaimSha256 -and $m.evidenceSha256 -ceq $GuestEvidenceSha256 -and $m.authorizationConsumed -ceq $true -and $m.wp2cAuthorized -ceq $false -and $m.automaticRetryAllowed -ceq $false) 'GUEST_COMPLETION_BINDING'
Assert-Phase7BWP2C ([datetimeoffset]::Parse($e.completedAt) -le [datetimeoffset]::Parse($a.expiresAt)) 'COMPLETION_OUTSIDE_AUTHORIZATION'
$result=Complete-Phase7BWP2CExecution $ledger $a $claimIdentity.sha256 $GuestEvidenceSha256
[ordered]@{classification='PHASE7B_WP2C_HOST_COMPLETION_RECONCILED';completion=$result;s2Created=$false;automaticRetryAllowed=$false;wp2cAuthorized=$false}|ConvertTo-Json -Depth 4
