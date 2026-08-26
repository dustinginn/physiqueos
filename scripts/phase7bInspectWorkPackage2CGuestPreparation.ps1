[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$ObservationPlanPath,[Parameter(Mandatory=$true)][string]$ObservationPlanSha256)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CContract.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CGuest.psm1')
# A preparation plan has observations/bindings only: no execution authorization,
# packet, restore-media requirement or caller-provided observation/pass override.
$plan=Read-Phase7BWP2CBoundJson $ObservationPlanPath $ObservationPlanSha256
Assert-Phase7BWP2C ($plan.kind -ceq 'wp2c-preparation-observation-plan' -and $plan.schemaVersion -eq 1) 'PREPARATION_PLAN'
$observation=Get-Phase7BWP2CGuestObservation $plan
$result=Test-Phase7BWP2CGuestObservation $observation $plan.bindings
Assert-Phase7BWP2C $result.pass 'GUEST_PREPARATION_NOT_INERT'
[ordered]@{schemaVersion=1;kind='wp2c-guest-preparation-observation';planSha256=$ObservationPlanSha256;observation=$observation;observedAt=[datetime]::UtcNow.ToString('o');wp2cExecuted=$false;packetDecrypted=$false;executionClaimCreated=$false;authorizationConsumed=$false;reportPersisted=$false}|ConvertTo-Json -Depth 12
