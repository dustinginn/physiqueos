$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$script:assertions = 0
function Assert-True([bool]$Condition,[string]$Message){if(-not $Condition){throw "ASSERTION_FAILED:$Message"};$script:assertions++}
$ps51 = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$paths = @(
  'phase7bPrepareWorkPackage2CaptureAuthorization.ps1',
  'phase7bOpenBoundedReplicaReceiver.ps1',
  'phase7bPrepareWorkPackage2EncryptedPacket.ps1',
  'phase7bResumeCompletedWorkPackage2Capture.ps1',
  'phase7bVerifyAndCloseBoundedReplicaReceiver.ps1',
  'phase7bImportBoundedReplicaReceipt.ps1',
  'phase7bVerifyPrimaryReplicaSessionClosed.ps1',
  'phase7bFinalizeBoundedReplicaDescriptor.ps1',
  'phase7bBuildWorkPackage2RestoreIso.ps1',
  'phase7bIsolatedGuestRestoreInterface.ps1'
) | ForEach-Object { Join-Path $PSScriptRoot $_ }
foreach($path in $paths){
  $tokens=$null;$errors=$null
  [void][Management.Automation.Language.Parser]::ParseFile($path,[ref]$tokens,[ref]$errors)
  Assert-True (@($errors).Count -eq 0) "PowerShell 5.1 AST: $(Split-Path -Leaf $path)"
}
$prepare = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'phase7bPrepareWorkPackage2CaptureAuthorization.ps1') -Raw
$capture = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'phase7bPrepareWorkPackage2EncryptedPacket.ps1') -Raw
$verify = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'phase7bVerifyAndCloseBoundedReplicaReceiver.ps1') -Raw
$import = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'phase7bImportBoundedReplicaReceipt.ps1') -Raw
$finalize = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'phase7bFinalizeBoundedReplicaDescriptor.ps1') -Raw
Assert-True (-not $prepare.Contains('Test-Connection') -and $prepare.Contains('laptopReachabilityDeferredToReceiver')) 'pre-Stage2 LAN proof is binding-only and does not require an unopened receiver'
Assert-True ($prepare.Contains('capturePlanFileName') -and $prepare.Contains('requiredCapacityBytes') -and $prepare.Contains('laptopIpv4')) 'Stage1 emits every Stage2 and Stage3 nonsecret handoff'
Assert-True ($capture.Contains('$authorization.capturePlanFileName') -and $capture.Contains('$authorization.quiescenceEvidenceToolingCommit')) 'Stage3 consumes exact authorization-bound filenames and evidence commit'
$captureResume = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'phase7bResumeCompletedWorkPackage2Capture.ps1') -Raw
Assert-True ($captureResume.Contains("classification -cne 'PHASE7B_WP2_STAGE_AUTHORIZATION'") -and $captureResume.Contains('exactCompletedCaptureReused')) 'completed-capture resume validates the exact source-owned authorization schema/classification'
Assert-True ($capture.LastIndexOf('Use-Phase7BWorkPackage2CaptureAuthorization') -gt $capture.IndexOf('$descriptorCreated = $true')) 'capture authorization consumption is the final successful mutation'
Assert-True ($capture.Contains('exactSameAuthorizationReusableAfterCleanup') -and $capture.Contains('$replicaPacketCreated')) 'pre-consumption failure cleanup is explicit'
Assert-True ($verify.Contains('teardownResumed') -and $verify.Contains('TEARDOWN_CARDINALITY_FAIL')) 'Stage4 exact partial-teardown resume is bounded'
Assert-True ($import.Contains('WP2B_CAPTURE_RESUME_EXACT_EXISTING_SAFE_RECEIPT_READ_ONLY')) 'Stage5 can reuse an exact imported receipt after restart'
Assert-True ($finalize.Contains('WP2B_CAPTURE_RESUME_EXACT_EXISTING_FINAL_DESCRIPTOR_READ_ONLY')) 'Stage5 can accept an exact final descriptor after caller failure'
foreach($source in @($capture,(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'phase7bBuildWorkPackage2RestoreIso.ps1') -Raw),(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'phase7bIsolatedGuestRestoreInterface.ps1') -Raw))){
  Assert-True ($source.Contains('Test-Phase7BWorkPackage2AgeVersionOutput') -and -not ($source -match '(?i)\\bage\\s\+v\?1')) 'all capture/WP2C age consumers use the shared actual-output parser'
}
$probe = @"
`$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
Import-Module '$($PSScriptRoot.Replace("'","''"))\phase7bWorkPackage2Contract.psm1' -Force
Import-Module '$($PSScriptRoot.Replace("'","''"))\phase7bIsolatedGuestContract.psm1' -Force
`$age=Test-Phase7BWorkPackage2AgeVersionOutput -OutputLines @('v1.3.1') -ExitCode 0
`$commands=@('Get-Phase7BSha256','Test-Phase7BWorkPackage2AgeVersionOutput','Assert-Phase7BWorkPackage2Authorization')
[ordered]@{pass=([bool]`$age.pass -and `$age.normalizedVersion -eq '1.3.1' -and @(`$commands|Where-Object{-not (Get-Command `$_ -CommandType Function -ErrorAction SilentlyContinue)}).Count -eq 0);commandCount=`$commands.Count}|ConvertTo-Json -Compress
"@
$encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($probe))
$probeOutput=@(& $ps51 -NoProfile -NonInteractive -EncodedCommand $encoded 2>&1)
$probeExit=$LASTEXITCODE
$probeResult=($probeOutput -join [Environment]::NewLine)|ConvertFrom-Json -ErrorAction Stop
Assert-True ($probeExit -eq 0 -and [bool]$probeResult.pass -and [int]$probeResult.commandCount -eq 3) 'fresh Windows PowerShell 5.1 resolves shared helpers and actual age output'
$captureInspect=@(& $ps51 -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'phase7bPrepareWorkPackage2EncryptedPacket.ps1') -Operation Inspect 2>&1)
$captureInspectExit=$LASTEXITCODE
$captureInspectResult=($captureInspect -join [Environment]::NewLine)|ConvertFrom-Json -ErrorAction Stop
Assert-True ($captureInspectExit -eq 0 -and [bool]$captureInspectResult.pass -and -not [bool]$captureInspectResult.mutationPerformed) 'Stage3 exact source path is self-contained in fresh PowerShell 5.1'
$receiverInspect=@(& $ps51 -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'phase7bOpenBoundedReplicaReceiver.ps1') -Operation Inspect 2>&1)
$receiverInspectExit=$LASTEXITCODE
$receiverInspectResult=($receiverInspect -join [Environment]::NewLine)|ConvertFrom-Json -ErrorAction Stop
Assert-True ($receiverInspectExit -eq 0 -and [bool]$receiverInspectResult.pass -and -not [bool]$receiverInspectResult.mutationPerformed) 'Stage2 exact source path is self-contained in fresh PowerShell 5.1'
[ordered]@{classification='PHASE7B_WP2B_REMAINING_CONNECTED_LIFECYCLE_LOCAL_TESTS_PASS';pass=$true;assertions=$script:assertions;liveExecutionPerformed=$false;automaticRetryAllowed=$false;wp2cAuthorized=$false}|ConvertTo-Json -Compress
