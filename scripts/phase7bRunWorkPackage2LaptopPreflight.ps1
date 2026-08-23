[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^phase7b-wp2-[0-9a-f]{32}$')][string]$AttemptId,
  [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-f]{40}$')][string]$ExpectedToolingCommit
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$authorizedAttemptId = 'phase7b-wp2-fc48221852204c188c414a18f6c42bbd'
if ($AttemptId -cne $authorizedAttemptId -or $ExpectedToolingCommit -cnotmatch '^[0-9a-f]{40}$') {
  throw 'PHASE7B_WP2B_ATTEMPT_OR_TOOLING_IDENTITY_MISMATCH'
}
$toolRoot = Join-Path $env:TEMP "phase7b-wp2b-$($ExpectedToolingCommit.Substring(0, 8))"
$expected = [ordered]@{
  'phase7bPreflightBoundedReplicaDestination.ps1' = '9f2079409ba18b9321e6d09575ab92b1598d07dd1c07790de5a9cce53eb2e7a4'
  'phase7bOpenBoundedReplicaReceiver.ps1' = 'ee25fc64fcaed1116e4b2a1d265854ee39cb0ec3c69d765a1b213cd3dbb8c4d8'
  'phase7bVerifyAndCloseBoundedReplicaReceiver.ps1' = '7cd70d1853600ef2aaaa00f6586d20bf588dcd662935cd1491ccbdbf1395ac8a'
  'phase7bBoundedReplicaTransport.psm1' = '99b12c2ca2935ca0fa05e38cd16334a58899b677004ff96cdd493b631cbbc32f'
  'phase7bWorkPackage2Contract.psm1' = '1349b85ed6349556338937de3de04c16d87399357117aa7d728470911cbd0e45'
  'phase7bIsolatedGuestContract.psm1' = '56c91d1fc3dc2248c0144f436ef1cd10627f4546323ad566a76ddda1e3fe1e1d'
  'phase7bSecondComputerReplicaContract.psm1' = 'e1f4e0c059ea3dcd961a0c26619d27ab7e712f759d0dd0dfdad13f8fa2c8010c'
}
if (Test-Path -LiteralPath $toolRoot) { throw 'PHASE7B_WP2B_LAPTOP_TOOL_ROOT_PREEXISTS_STOP' }
New-Item -ItemType Directory -Path $toolRoot -ErrorAction Stop | Out-Null
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
foreach ($name in $expected.Keys) {
  $uri = "https://raw.githubusercontent.com/dustinginn/physiqueos/$ExpectedToolingCommit/scripts/$name"
  $path = Join-Path $toolRoot $name
  Invoke-WebRequest -UseBasicParsing -Uri $uri -OutFile $path -ErrorAction Stop
  if ((Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash.ToLowerInvariant() -cne $expected[$name]) {
    throw "PHASE7B_WP2B_LAPTOP_TOOL_HASH_FAIL:$name"
  }
}
if (@(Get-ChildItem -LiteralPath $toolRoot -File -Force).Count -ne $expected.Count) {
  throw 'PHASE7B_WP2B_LAPTOP_TOOL_CARDINALITY_FAIL'
}
$powershell51 = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
if (-not (Test-Path -LiteralPath $powershell51 -PathType Leaf)) { throw 'PHASE7B_WP2B_LAPTOP_POWERSHELL51_MISSING' }
$preflight = Join-Path $toolRoot 'phase7bPreflightBoundedReplicaDestination.ps1'
$output = @(& $powershell51 -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $preflight `
  -AttemptId $AttemptId -ExpectedToolingCommit $ExpectedToolingCommit -PrimaryHostIpv4 '192.168.1.69' -PrimaryPrefixLength 24 `
  -RequiredCapacityBytes ([int64]1GB) 2>&1)
$exitCode = $LASTEXITCODE
$text = $output -join [Environment]::NewLine
try { $result = $text | ConvertFrom-Json -ErrorAction Stop } catch {
  Write-Host $text
  throw 'PHASE7B_WP2B_LAPTOP_READONLY_PREFLIGHT_JSON_FAIL'
}
if ($exitCode -ne 0 -or -not [bool]$result.pass -or
    [string]$result.classification -cne 'PHASE7B_WP2B_LAPTOP_READONLY_PREFLIGHT_PASS' -or
    [string]$result.attemptId -cne $AttemptId -or [string]$result.toolingCommit -cne $ExpectedToolingCommit -or
    [string]$result.computerName -cne 'LAPTOP-4G5U0U2R' -or
    [string]$result.hostIdentitySha256 -cne 'ea6696e8a0fc4d9242544568d62cd979fd57bd2478fac4f40755b3546776ac3c' -or
    [string]$result.diskIdentitySha256 -cne '336d31be1f1e6dd4bde254fae94ffebf2b23829520a26c2f5d9bc5deda169896' -or
    [string]$result.fileSystem -cne 'NTFS' -or [int]$result.diskNumber -ne 0 -or [string]$result.busType -cne 'SATA' -or
    [string]$result.primaryIpv4 -cne '192.168.1.69' -or [int]$result.primaryPrefixLength -ne 24 -or
    [int]$result.replicaPrefixLength -ne 24 -or -not [bool]$result.allComputerNameSourcesCanonicalAndExact -or
    [bool]$result.rawHardwareIdentifiersProjected -or [bool]$result.mutationPerformed -or [bool]$result.reportPersisted -or
    [bool]$result.receiverOpened -or [bool]$result.automaticRetryAllowed) {
  Write-Host $text
  throw 'PHASE7B_WP2B_LAPTOP_READONLY_PREFLIGHT_ACCEPTANCE_FAIL'
}
Write-Output $text
