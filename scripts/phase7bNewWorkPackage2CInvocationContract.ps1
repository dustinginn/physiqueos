[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$BindingsPath,[Parameter(Mandatory=$true)][string]$ToolingManifestPath,[Parameter(Mandatory=$true)][string]$OutputPath)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CContract.psm1')
$bindings=Get-Content -LiteralPath $BindingsPath -Raw | ConvertFrom-Json
$manifest=Get-Content -LiteralPath $ToolingManifestPath -Raw | ConvertFrom-Json
$repo=Split-Path -Parent $PSScriptRoot
$head=@(& git --no-optional-locks -C $repo rev-parse HEAD)
if($LASTEXITCODE -ne 0 -or $head.Count -ne 1 -or $head[0] -cne $bindings.toolingCommit){throw 'PHASE7B_WP2C_TOOLING_COMMIT_MISMATCH'}
$actual=Get-Phase7BWP2CDependencyManifest $PSScriptRoot
Assert-Phase7BWP2C ((Get-Phase7BWP2CObjectHash $actual) -ceq (Get-Phase7BWP2CObjectHash $manifest)) 'SOURCE_TOOLING_MISMATCH'
$hostArtifacts=Get-Phase7BWP2CDependencyManifest -SourceDirectory $PSScriptRoot -EntryPoints (Get-Phase7BWP2CHostEntryPoints)
$contract=New-Phase7BWP2CInvocationContract $bindings $manifest $hostArtifacts
$identity=Write-Phase7BWP2CCreateNewJson $OutputPath $contract
[ordered]@{classification='PHASE7B_WP2C_INVOCATION_CREATED_NONEXECUTABLE';sha256=$identity.sha256;bytes=$identity.bytes;wp2cExecuted=$false;executionAuthorized=$false}|ConvertTo-Json
