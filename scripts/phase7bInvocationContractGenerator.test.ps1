$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bIsolatedGuestContract.psm1') -Force

$script:assertions = 0
function Assert-True([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw "ASSERTION_FAILED:$Message" }
  $script:assertions++
}

$testRoot = Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..\.tmp')).Path "phase7b-invocation-generator-$([guid]::NewGuid().ToString('N'))"
$syntheticRoot = Join-Path $testRoot 'synthetic-repository'
$syntheticScripts = Join-Path $syntheticRoot 'scripts'
$attemptId = 'phase7b-wp2-' + ('a' * 32)
$ps51 = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
try {
  [void](New-Item -ItemType Directory -Path $syntheticScripts -Force)
  $requiredNames = @(
    'phase7bNewWorkPackage2InvocationContract.ps1',
    'phase7bRunWorkPackage2Stage3.ps1','phase7bRunWorkPackage2Stage4.ps1','phase7bRunWorkPackage2Stage5.ps1',
    'phase7bPrepareWorkPackage2EncryptedPacket.ps1','phase7bVerifyAndCloseBoundedReplicaReceiver.ps1',
    'phase7bImportBoundedReplicaReceipt.ps1','phase7bVerifyPrimaryReplicaSessionClosed.ps1',
    'phase7bFinalizeBoundedReplicaDescriptor.ps1','phase7bBoundedReplicaTransport.psm1',
    'phase7bWorkPackage2Contract.psm1','phase7bWorkPackage2OperatorLifecycle.psm1',
    'phase7bWorkPackage2AuthorizationEligibility.psm1','phase7bWorkPackage2Orchestration.psm1',
    'phase7bWindowsAgePassphraseBridge.psm1','phase7bIsolatedGuestContract.psm1','phase7bSecondComputerReplicaContract.psm1'
  )
  foreach ($name in $requiredNames) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $syntheticScripts $name)
  }
  & git -C $syntheticRoot init | Out-Null
  & git -C $syntheticRoot config user.name 'Phase7B Synthetic Test'
  & git -C $syntheticRoot config user.email 'phase7b-synthetic@example.invalid'
  & git -C $syntheticRoot checkout -b combined-app-platform-cutover | Out-Null
  & git -C $syntheticRoot add scripts
  & git -C $syntheticRoot commit -m 'synthetic invocation generator fixture' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'SYNTHETIC_GIT_COMMIT_FAIL' }
  $syntheticCommit = (& git -C $syntheticRoot rev-parse HEAD).Trim().ToLowerInvariant()
  & git -C $syntheticRoot update-ref refs/remotes/origin/combined-app-platform-cutover $syntheticCommit
  $outputRoot = Join-Path $syntheticRoot '.tmp'
  [void](New-Item -ItemType Directory -Path $outputRoot)

  $firstPath = Join-Path $outputRoot 'invocation-one.json'
  $priorErrorPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $firstLines = @(& $ps51 -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $syntheticScripts 'phase7bNewWorkPackage2InvocationContract.ps1') `
    -AttemptId $attemptId -OutputPath $firstPath 2>&1)
  $firstExit = $LASTEXITCODE
  $ErrorActionPreference = $priorErrorPreference
  if ($firstExit -ne 0) { throw "FRESH_PS51_GENERATOR_FAIL:$($firstLines -join '|')" }
  $first = ($firstLines -join [Environment]::NewLine) | ConvertFrom-Json -ErrorAction Stop
  Assert-True ($firstExit -eq 0 -and [bool]$first.pass) 'fresh Windows PowerShell 5.1 generator execution passes'
  Assert-True ((Test-Path -LiteralPath $firstPath -PathType Leaf) -and [string]$first.sha256 -ceq (Get-Phase7BSha256 -LiteralPath $firstPath)) 'generator persists exactly hash-bound contract'
  $contract = Get-Content -LiteralPath $firstPath -Raw | ConvertFrom-Json -ErrorAction Stop
  Assert-True ([string]$contract.toolingCommit -ceq $syntheticCommit -and [string]$contract.attemptId -ceq $attemptId) 'generated contract binds synthetic repository and attempt'
  Assert-True ([bool]$contract.securePassphraseBridgeRequired -and [bool]$contract.decryptRoundTripRequired) 'generated contract binds secure bridge and decrypt round trip'
  foreach ($stage in 3..5) {
    $relativePath = "scripts/phase7bRunWorkPackage2Stage$stage.ps1"
    $artifact = @($contract.artifacts | Where-Object { [string]$_.relativePath -ceq $relativePath })
    $sourcePath = Join-Path $syntheticRoot ($relativePath.Replace('/', '\'))
    Assert-True ($artifact.Count -eq 1 -and [string]$artifact[0].sha256 -ceq (Get-Phase7BSha256 -LiteralPath $sourcePath) -and
      [int64]$artifact[0].bytes -eq [int64](Get-Item -LiteralPath $sourcePath).Length) "Stage $stage identity is machine-derived"
  }
  Assert-True (@($firstLines | Where-Object { [string]$_ -match 'Get-Phase7BSha256.*not recognized|CommandNotFoundException' }).Count -eq 0) 'fresh process has no preloaded-module dependency'

  $firstBytes = [IO.File]::ReadAllBytes($firstPath)
  Remove-Item -LiteralPath $firstPath -Force
  $secondPath = Join-Path $outputRoot 'invocation-two.json'
  $ErrorActionPreference = 'Continue'
  $secondLines = @(& $ps51 -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $syntheticScripts 'phase7bNewWorkPackage2InvocationContract.ps1') `
    -AttemptId $attemptId -OutputPath $secondPath 2>&1)
  $secondExit = $LASTEXITCODE
  $ErrorActionPreference = $priorErrorPreference
  if ($secondExit -ne 0) { throw "SECOND_FRESH_PS51_GENERATOR_FAIL:$($secondLines -join '|')" }
  $second = ($secondLines -join [Environment]::NewLine) | ConvertFrom-Json -ErrorAction Stop
  Assert-True ($secondExit -eq 0 -and [bool]$second.pass) 'second fresh Windows PowerShell 5.1 generation passes'
  Assert-True ([Convert]::ToBase64String($firstBytes) -ceq [Convert]::ToBase64String([IO.File]::ReadAllBytes($secondPath))) 'deletion and recreation are byte-identical'
} finally {
  if (Test-Path -LiteralPath $testRoot) { Remove-Item -LiteralPath $testRoot -Recurse -Force }
}
[ordered]@{
  classification = 'PHASE7B_WP2B_INVOCATION_GENERATOR_WINDOWS_PS51_TESTS_PASS'
  pass = $true
  assertions = $script:assertions
  freshWindowsPowerShellProcessUsed = $true
  liveAttemptEvidenceTouched = $false
  liveAuthorizationCreated = $false
  automaticRetryAllowed = $false
  wp2cAuthorized = $false
} | ConvertTo-Json -Compress
