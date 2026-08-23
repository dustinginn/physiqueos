$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$scriptPath = Join-Path $PSScriptRoot 'phase7bRunWorkPackage2LaptopPreflight.ps1'
$attempt = 'phase7b-wp2-fc48221852204c188c414a18f6c42bbd'
$testRoot = Join-Path ([IO.Path]::GetTempPath()) "phase7b-stage0-delivery-$([guid]::NewGuid().ToString('N'))"
$assertions = 0
function Assert-True([bool]$Condition,[string]$Message) {
  $script:assertions++
  if (-not $Condition) { throw "ASSERTION_FAILED:$Message" }
}
function Invoke-Child([string[]]$Arguments,[string]$TemporaryRoot,[string]$ChildScriptPath = $scriptPath) {
  $savedTemp = $env:TEMP
  $savedErrorActionPreference = $ErrorActionPreference
  try {
    $env:TEMP = $TemporaryRoot
    $ErrorActionPreference = 'Continue'
    $lines = @(& "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $ChildScriptPath @Arguments 2>&1)
    [pscustomobject]@{ exitCode = $LASTEXITCODE; text = $lines -join [Environment]::NewLine }
  } finally {
    $env:TEMP = $savedTemp
    $ErrorActionPreference = $savedErrorActionPreference
  }
}
function Invoke-SyntheticBootstrapFlow(
  [string]$AuthorizedCommit,
  [string]$RequestedCommit,
  [string]$ExpectedArtifactSha256,
  [string]$RequestedArtifactSha256,
  [string]$DeliveryRoot
) {
  if ($RequestedCommit -cne $AuthorizedCommit -or $RequestedCommit -cnotmatch '^[0-9a-f]{40}$') { throw 'PHASE7B_WP2B_STAGE0_BOOTSTRAP_COMMIT_FAIL' }
  if ($RequestedArtifactSha256 -cne $ExpectedArtifactSha256 -or $RequestedArtifactSha256 -cnotmatch '^[0-9a-f]{64}$') { throw 'PHASE7B_WP2B_STAGE0_BOOTSTRAP_EXPECTED_HASH_FAIL' }
  if (Test-Path -LiteralPath $DeliveryRoot) { throw 'PHASE7B_WP2B_STAGE0_BOOTSTRAP_DELIVERY_ROOT_PREEXISTS' }
  New-Item -ItemType Directory -Path $DeliveryRoot -ErrorAction Stop | Out-Null
  $downloaded = Join-Path $DeliveryRoot 'phase7bRunWorkPackage2LaptopPreflight.ps1'
  Copy-Item -LiteralPath $scriptPath -Destination $downloaded -ErrorAction Stop
  if ((Get-FileHash -Algorithm SHA256 -LiteralPath $downloaded).Hash.ToLowerInvariant() -cne $ExpectedArtifactSha256) {
    throw 'PHASE7B_WP2B_STAGE0_BOOTSTRAP_DOWNLOADED_HASH_FAIL'
  }
  $toolRoot = Join-Path $testRoot "phase7b-wp2b-$($RequestedCommit.Substring(0,8))"
  if (-not (Test-Path -LiteralPath $toolRoot)) { New-Item -ItemType Directory -Path $toolRoot -ErrorAction Stop | Out-Null }
  Invoke-Child -Arguments @('-AttemptId',$attempt,'-ExpectedToolingCommit',$RequestedCommit) -TemporaryRoot $testRoot -ChildScriptPath $downloaded
}
try {
  New-Item -ItemType Directory -Path $testRoot -ErrorAction Stop | Out-Null
  $tokens = $null
  $errors = $null
  [void][Management.Automation.Language.Parser]::ParseFile($scriptPath,[ref]$tokens,[ref]$errors)
  Assert-True ($errors.Count -eq 0) 'tracked Stage 0 wrapper parses in Windows PowerShell 5.1'
  $source = Get-Content -LiteralPath $scriptPath -Raw
  $hash1 = (Get-FileHash -Algorithm SHA256 -LiteralPath $scriptPath).Hash.ToLowerInvariant()
  $hash2 = (Get-FileHash -Algorithm SHA256 -LiteralPath $scriptPath).Hash.ToLowerInvariant()
  Assert-True ($hash1 -ceq $hash2 -and $hash1 -match '^[0-9a-f]{64}$') 'tracked Stage 0 artifact hash is deterministic'
  Assert-True ($source.Contains('[Parameter(Mandatory = $true)][ValidatePattern(''^[0-9a-f]{40}$'')][string]$ExpectedToolingCommit')) 'wrapper requires explicit tooling commit'
  Assert-True ($source.Contains($attempt) -and $source.Contains('$AttemptId -cne $authorizedAttemptId')) 'wrapper binds exact authorized attempt'
  Assert-True ($source.Contains('raw.githubusercontent.com/dustinginn/physiqueos/$ExpectedToolingCommit/scripts/$name')) 'wrapper retrieves source tools from exact commit'
  Assert-True ($source.Contains('-NoLogo -NoProfile -NonInteractive') -and $source.Contains('phase7bPreflightBoundedReplicaDestination.ps1')) 'wrapper uses isolated Windows PowerShell 5.1 preflight child'
  foreach ($binding in @(
      'LAPTOP-4G5U0U2R','ea6696e8a0fc4d9242544568d62cd979fd57bd2478fac4f40755b3546776ac3c',
      '336d31be1f1e6dd4bde254fae94ffebf2b23829520a26c2f5d9bc5deda169896','NTFS','SATA','192.168.1.69')) {
    Assert-True ($source.Contains($binding)) "Stage 0 accepted identity unchanged:$binding"
  }
  Assert-True ($source.Contains('[bool]$result.mutationPerformed') -and $source.Contains('[bool]$result.receiverOpened') -and
      $source.Contains('[bool]$result.automaticRetryAllowed')) 'wrapper requires read-only no-receiver no-retry projection'
  Assert-True (-not ($source -match '(?i)-Operation\s+OpenEphemeralReceiver|New-SmbShare|New-NetFirewallRule|CaptureEncryptReplicate|SetWorkPackage2CaptureQuiescence|Start-Process|Stop-Process')) 'wrapper cannot invoke receiver capture quiescence or host termination'

  $wrongAttempt = Invoke-Child -Arguments @('-AttemptId','phase7b-wp2-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','-ExpectedToolingCommit',('a'*40)) -TemporaryRoot $testRoot
  Assert-True ($wrongAttempt.exitCode -ne 0 -and $wrongAttempt.text.Contains('PHASE7B_WP2B_ATTEMPT_OR_TOOLING_IDENTITY_MISMATCH')) 'substituted attempt fails before delivery'
  $malformedCommit = Invoke-Child -Arguments @('-AttemptId',$attempt,'-ExpectedToolingCommit','wrong') -TemporaryRoot $testRoot
  Assert-True ($malformedCommit.exitCode -ne 0) 'malformed commit fails parameter binding'
  $collisionCommit = 'b' * 40
  $collisionRoot = Join-Path $testRoot "phase7b-wp2b-$($collisionCommit.Substring(0,8))"
  New-Item -ItemType Directory -Path $collisionRoot -ErrorAction Stop | Out-Null
  $collision = Invoke-Child -Arguments @('-AttemptId',$attempt,'-ExpectedToolingCommit',$collisionCommit) -TemporaryRoot $testRoot
  Assert-True ($collision.exitCode -ne 0 -and $collision.text.Contains('PHASE7B_WP2B_LAPTOP_TOOL_ROOT_PREEXISTS_STOP')) 'exact attempt reaches and fails closed on preexisting new TEMP root'
  Assert-True (@(Get-ChildItem -LiteralPath $collisionRoot -Force).Count -eq 0) 'collision test performs no download or live execution'

  $bootstrapCommit = 'c' * 40
  $bootstrap = Invoke-SyntheticBootstrapFlow -AuthorizedCommit $bootstrapCommit -RequestedCommit $bootstrapCommit `
    -ExpectedArtifactSha256 $hash1 -RequestedArtifactSha256 $hash1 -DeliveryRoot (Join-Path $testRoot 'delivery-pass')
  Assert-True ($bootstrap.exitCode -ne 0 -and $bootstrap.text.Contains('PHASE7B_WP2B_LAPTOP_TOOL_ROOT_PREEXISTS_STOP')) 'PowerShell 5.1 bootstrap fixture downloads hashes and executes exact wrapper without live preflight'
  $wrongHashStopped = $false
  try {
    [void](Invoke-SyntheticBootstrapFlow -AuthorizedCommit $bootstrapCommit -RequestedCommit $bootstrapCommit `
      -ExpectedArtifactSha256 $hash1 -RequestedArtifactSha256 ('d' * 64) -DeliveryRoot (Join-Path $testRoot 'delivery-wrong-hash'))
  } catch { $wrongHashStopped = $_.Exception.Message -eq 'PHASE7B_WP2B_STAGE0_BOOTSTRAP_EXPECTED_HASH_FAIL' }
  Assert-True $wrongHashStopped 'bootstrap rejects wrong authorized wrapper hash before download or execution'
  $wrongCommitStopped = $false
  try {
    [void](Invoke-SyntheticBootstrapFlow -AuthorizedCommit $bootstrapCommit -RequestedCommit ('e' * 40) `
      -ExpectedArtifactSha256 $hash1 -RequestedArtifactSha256 $hash1 -DeliveryRoot (Join-Path $testRoot 'delivery-wrong-commit'))
  } catch { $wrongCommitStopped = $_.Exception.Message -eq 'PHASE7B_WP2B_STAGE0_BOOTSTRAP_COMMIT_FAIL' }
  Assert-True $wrongCommitStopped 'bootstrap rejects wrong commit before download or execution'

  [ordered]@{
    classification = 'PHASE7B_WP2B_STAGE0_DELIVERY_TESTS_PASS'
    pass = $true
    assertions = $assertions
    artifactSha256 = $hash1
    liveExecutionPerformed = $false
    receiverOpened = $false
    productionQuiesced = $false
    automaticRetryAllowed = $false
    wp2cAuthorized = $false
  } | ConvertTo-Json -Compress
} finally {
  if (Test-Path -LiteralPath $testRoot) { Remove-Item -LiteralPath $testRoot -Recurse -Force }
}
