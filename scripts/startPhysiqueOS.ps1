[CmdletBinding()]
param(
  [switch]$InstallTask,
  [switch]$InstallOnly,
  [int]$TimeoutSeconds = 60
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$taskName = "PhysiqueOS Production Server"
$monitorTaskName = "PhysiqueOS Runtime Monitor"
$legacyTaskNames = @("PhysiqueOS Runtime", "PhysiqueOS Probe PowerShellTree")
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$nodePath = "C:\Program Files\nodejs\node.exe"
$nextPath = Join-Path $repositoryRoot "node_modules\next\dist\bin\next"
$buildIdPath = Join-Path $repositoryRoot ".next\BUILD_ID"
$statusScript = Join-Path $PSScriptRoot "statusPhysiqueOS.ps1"
$logsDirectory = Join-Path $repositoryRoot "logs"
$metadataPath = Join-Path $logsDirectory "physiqueos-runtime.json"
$controlPath = Join-Path $logsDirectory "physiqueos-runtime-control.json"
$lifecycleLog = Join-Path $logsDirectory "physiqueos-runtime.lifecycle.log"
$started = Get-Date

function Write-Lifecycle([string]$Message) {
  New-Item -ItemType Directory -Path $logsDirectory -Force | Out-Null
  if ((Test-Path $lifecycleLog) -and (Get-Item $lifecycleLog).Length -gt 1048576) {
    $archive = "$lifecycleLog.1"
    if (Test-Path $archive) { Remove-Item -LiteralPath $archive -Force }
    Move-Item -LiteralPath $lifecycleLog -Destination $archive
  }
  Add-Content -LiteralPath $lifecycleLog -Value "$((Get-Date).ToString('o')) $Message"
}

function Write-ControlState([string]$ChangedBy, [string]$Reason) {
  New-Item -ItemType Directory -Path $logsDirectory -Force | Out-Null
  $existing = if (Test-Path -LiteralPath $controlPath) {
    try { Get-Content -LiteralPath $controlPath -Raw | ConvertFrom-Json } catch { $null }
  } else { $null }
  $state = [ordered]@{
    schemaVersion = 1
    desiredState = "running"
    changedAt = (Get-Date).ToString("o")
    changedBy = $ChangedBy
    reason = $Reason
    lastRecoveryAttemptAt = if ($existing) { $existing.lastRecoveryAttemptAt } else { $null }
    lastRecoveryOutcome = if ($existing) { $existing.lastRecoveryOutcome } else { $null }
    consecutiveRecoveryFailures = if ($existing) { [int]$existing.consecutiveRecoveryFailures } else { 0 }
    lastHealthyAt = if ($existing) { $existing.lastHealthyAt } else { $null }
    consecutiveUnhealthyChecks = if ($existing) { [int]$existing.consecutiveUnhealthyChecks } else { 0 }
  }
  $temporaryPath = "$controlPath.$PID.tmp"
  $state | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $temporaryPath -Encoding utf8
  Move-Item -LiteralPath $temporaryPath -Destination $controlPath -Force
}

function Install-CanonicalTask {
  $escapedNode = [System.Security.SecurityElement]::Escape($nodePath)
  $escapedNext = [System.Security.SecurityElement]::Escape("`"$nextPath`" start --hostname 0.0.0.0 --port 3000")
  $escapedRoot = [System.Security.SecurityElement]::Escape($repositoryRoot)
  $escapedUser = [System.Security.SecurityElement]::Escape("$env:USERDOMAIN\$env:USERNAME")
  $xml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>PhysiqueOS production Next.js server; direct Node ownership.</Description></RegistrationInfo>
  <Triggers><LogonTrigger><Enabled>true</Enabled><UserId>$escapedUser</UserId></LogonTrigger></Triggers>
  <Principals><Principal id="Author"><UserId>$escapedUser</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings><StopOnIdleEnd>false</StopOnIdleEnd><RestartOnIdle>false</RestartOnIdle></IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>true</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>7</Priority>
    <RestartOnFailure><Interval>PT1M</Interval><Count>5</Count></RestartOnFailure>
  </Settings>
  <Actions Context="Author"><Exec><Command>$escapedNode</Command><Arguments>$escapedNext</Arguments><WorkingDirectory>$escapedRoot</WorkingDirectory></Exec></Actions>
</Task>
"@
  Register-ScheduledTask -TaskName $taskName -Xml $xml -Force | Out-Null
  foreach ($legacyName in $legacyTaskNames) {
    $legacy = Get-ScheduledTask -TaskName $legacyName -ErrorAction SilentlyContinue
    if ($legacy) {
      if ($legacy.State -eq "Running") { throw "Legacy task '$legacyName' is unexpectedly running." }
      Unregister-ScheduledTask -TaskName $legacyName -Confirm:$false
      Write-Lifecycle "Removed verified legacy scheduled task '$legacyName'."
    }
  }
}

function Install-MonitorTask {
  $monitorScript = Join-Path $PSScriptRoot "monitorPhysiqueOS.ps1"
  if (-not (Test-Path -LiteralPath $monitorScript -PathType Leaf)) { throw "Monitor script is missing." }
  $powerShellPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
  $escapedPowerShell = [System.Security.SecurityElement]::Escape($powerShellPath)
  $escapedArguments = [System.Security.SecurityElement]::Escape("-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$monitorScript`"")
  $escapedRoot = [System.Security.SecurityElement]::Escape($repositoryRoot)
  $escapedUser = [System.Security.SecurityElement]::Escape("$env:USERDOMAIN\$env:USERNAME")
  $monitorStart = (Get-Date).AddMinutes(1).ToString("yyyy-MM-ddTHH:mm:ss")
  $xml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>Short-lived PhysiqueOS health and recovery monitor.</Description></RegistrationInfo>
  <Triggers>
    <LogonTrigger><Enabled>true</Enabled><UserId>$escapedUser</UserId></LogonTrigger>
    <TimeTrigger>
      <StartBoundary>$monitorStart</StartBoundary><Enabled>true</Enabled>
      <Repetition><Interval>PT1M</Interval><StopAtDurationEnd>false</StopAtDurationEnd></Repetition>
    </TimeTrigger>
  </Triggers>
  <Principals><Principal id="Author"><UserId>$escapedUser</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>true</StartWhenAvailable>
    <IdleSettings><StopOnIdleEnd>false</StopOnIdleEnd><RestartOnIdle>false</RestartOnIdle></IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand><Enabled>true</Enabled><Hidden>true</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle><ExecutionTimeLimit>PT30S</ExecutionTimeLimit>
  </Settings>
  <Actions Context="Author"><Exec><Command>$escapedPowerShell</Command><Arguments>$escapedArguments</Arguments><WorkingDirectory>$escapedRoot</WorkingDirectory></Exec></Actions>
</Task>
"@
  Register-ScheduledTask -TaskName $monitorTaskName -Xml $xml -Force | Out-Null
}

if (-not (Test-Path -LiteralPath $repositoryRoot -PathType Container)) { throw "Repository path is unavailable." }
if (-not (Test-Path -LiteralPath $nodePath -PathType Leaf)) { throw "Required Node executable is missing: $nodePath" }
if (-not (Test-Path -LiteralPath $nextPath -PathType Leaf)) { throw "Local Next.js binary is missing: $nextPath" }
if (-not (Test-Path -LiteralPath $buildIdPath -PathType Leaf)) { throw "Production build is missing. Stop the runtime, build, then retry." }

$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($InstallTask) {
  Install-CanonicalTask
  Install-MonitorTask
  $task = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
}
if (-not $task) { throw "Canonical task '$taskName' is not installed. Run this script once with -InstallTask." }
$monitorTask = Get-ScheduledTask -TaskName $monitorTaskName -ErrorAction SilentlyContinue
if (-not $monitorTask -and -not $InstallOnly) { throw "Monitor task '$monitorTaskName' is not installed." }
if ($InstallOnly) {
  if (-not $InstallTask) { throw "-InstallOnly requires -InstallTask." }
  $stoppedState = [ordered]@{
    schemaVersion = 1; desiredState = "stopped"; changedAt = (Get-Date).ToString("o")
    changedBy = "installation"; reason = "Safe initial monitor installation"
    lastRecoveryAttemptAt = $null; lastRecoveryOutcome = "intentional_stop"
    consecutiveRecoveryFailures = 0; lastHealthyAt = $null; consecutiveUnhealthyChecks = 0
  }
  New-Item -ItemType Directory -Path $logsDirectory -Force | Out-Null
  $temporaryPath = "$controlPath.$PID.tmp"
  $stoppedState | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $temporaryPath -Encoding utf8
  Move-Item -LiteralPath $temporaryPath -Destination $controlPath -Force
  & $statusScript
  exit 0
}

$before = & $statusScript | ConvertFrom-Json
Write-ControlState -ChangedBy "start_script" -Reason "Explicit start requested"
if ($before.overallState -eq "healthy") {
  $before | ConvertTo-Json -Depth 10
  exit 0
}
if ($before.listener) { throw "Port 3000 is occupied by PID $($before.listener.pid) and is not a healthy canonical runtime." }
if (-not $before.task.matchesCanonicalDefinition) { throw "Installed task does not match the canonical direct-Node definition." }

Write-Lifecycle "Requested canonical scheduled-task start."
Start-ScheduledTask -TaskName $taskName
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
do {
  Start-Sleep -Seconds 1
  $status = & $statusScript | ConvertFrom-Json
  if ($status.overallState -eq "healthy") {
    $metadata = [ordered]@{
      schemaVersion = 2
      taskName = $taskName
      listenerPid = $status.listener.pid
      processStartedAt = $status.process.startedAt
      healthCheckedAt = $status.health.checkedAt
      port = 3000
      hostname = "0.0.0.0"
      repositoryPath = $repositoryRoot
      nodePath = $nodePath
      taskState = $status.task.state
      healthStatus = "healthy"
    }
    $metadata | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $metadataPath -Encoding utf8
    Write-Lifecycle "Canonical runtime healthy with listener PID $($status.listener.pid)."
    $status | Add-Member -NotePropertyName elapsedSeconds -NotePropertyValue ([math]::Round(((Get-Date)-$started).TotalSeconds, 2))
    $status | ConvertTo-Json -Depth 10
    exit 0
  }
  if ($status.overallState -in @("foreign_listener", "task_process_mismatch", "unhealthy")) {
    throw "Canonical runtime entered state '$($status.overallState)'."
  }
} while ((Get-Date) -lt $deadline)

Write-Lifecycle "Health wait timed out after $TimeoutSeconds seconds."
throw "Timed out waiting for the canonical runtime health endpoint."
