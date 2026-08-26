[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$ReturnEnvelopePath,[Parameter(Mandatory=$true)][string]$InvocationPath,[Parameter(Mandatory=$true)][string]$InvocationSha256,[Parameter(Mandatory=$true)][string]$AuthorizationPath,[Parameter(Mandatory=$true)][string]$AuthorizationSha256,[Parameter(Mandatory=$true)][string]$OutputDirectory,[Parameter(Mandatory=$true)][switch]$FounderNonsecretEvidenceReturnApproved)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CContract.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CHost.psm1')
Assert-Phase7BWP2C $FounderNonsecretEvidenceReturnApproved.IsPresent 'EVIDENCE_RETURN_REVIEW_REQUIRED'
$c=Read-Phase7BWP2CBoundJson $InvocationPath $InvocationSha256
$a=Read-Phase7BWP2CBoundJson $AuthorizationPath $AuthorizationSha256
Assert-Phase7BWP2CAuthorization $a $c $InvocationSha256 ([datetimeoffset]::Parse($a.issuedAt).UtcDateTime)
Assert-Phase7BWP2CPublishedRepository (Split-Path -Parent $PSScriptRoot) $c.bindings.toolingCommit
foreach($file in $c.hostArtifacts.files){Assert-Phase7BWP2CFile (Join-Path $PSScriptRoot $file.name) $file}
$text=Get-Content -LiteralPath $ReturnEnvelopePath -Raw -ErrorAction Stop
Assert-Phase7BWP2C ($text.Length -le 4MB -and $text -notmatch 'AGE-SECRET-KEY-') 'EVIDENCE_RETURN_SHAPE'
$returned=$text|ConvertFrom-Json -ErrorAction Stop
Assert-Phase7BWP2C ($returned.classification -ceq 'PHASE7B_WP2_ISOLATED_RESTORE_VERIFICATION_PASS_INERT' -and $returned.pass -ceq $true) 'EVIDENCE_RETURN_NONPASS'
Assert-Phase7BWP2C ((Get-Phase7BWP2CObjectHash $returned.evidence) -ceq $returned.evidenceSha256 -and (Get-Phase7BWP2CObjectHash $returned.completion) -ceq $returned.completionSha256) 'EVIDENCE_RETURN_CHECKSUM'
$ledger='C:\Phase7B\host-evidence\379bb303\wp2c\claims'
$claim=Get-Phase7BWP2CIdentity (Join-Path $ledger ($a.authorizationId+'.claim.json'))
Assert-Phase7BWP2CPassEvidence $returned.evidence $a $AuthorizationSha256 $claim.sha256
Assert-Phase7BWP2C ($returned.completion.authorizationId -ceq $a.authorizationId -and $returned.completion.evidenceSha256 -ceq $returned.evidenceSha256 -and $returned.completion.claimSha256 -ceq $returned.evidence.guestClaimSha256 -and $returned.completion.authorizationConsumed -ceq $true) 'EVIDENCE_RETURN_COMPLETION'
[void](Assert-Phase7BWP2CLocalPath $OutputDirectory 'C:\Phase7B\host-evidence\379bb303\wp2c')
$ePath=Join-Path $OutputDirectory ($a.authorizationId+'.guest-evidence.json')
$mPath=Join-Path $OutputDirectory ($a.authorizationId+'.guest-completion.json')
Assert-Phase7BWP2C (-not (Test-Path -LiteralPath $ePath) -and -not (Test-Path -LiteralPath $mPath)) 'EVIDENCE_IMPORT_COLLISION'
$eId=Write-Phase7BWP2CCreateNewJson $ePath $returned.evidence
$mId=Write-Phase7BWP2CCreateNewJson $mPath $returned.completion
[ordered]@{classification='PHASE7B_WP2C_NONSECRET_EVIDENCE_IMPORTED';evidence=$eId;completion=$mId;hostCompletionWritten=$false;wp2cExecuted=$false;automaticRetryAllowed=$false}|ConvertTo-Json -Depth 4
