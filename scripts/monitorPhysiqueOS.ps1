[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$started = Get-Date
$productionTaskName = "PhysiqueOS Production Server"
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$nodePath = "C:\Program Files\nodejs\node.exe"
$nextPath = Join-Path $repositoryRoot "node_modules\next\dist\bin\next"
$buildIdPath = Join-Path $repositoryRoot ".next\BUILD_ID"
$logsDirectory = Join-Path $repositoryRoot "logs"
$controlPath = Join-Path $logsDirectory "physiqueos-runtime-control.json"
$metadataPath = Join-Path $logsDirectory "physiqueos-runtime.json"
$monitorLog = Join-Path $logsDirectory "physiqueos-runtime-monitor.log"
$startupGraceSeconds = 45
$failureBackoffMinutes = 5
$ngrokTaskName = "PhysiqueOS Ngrok Tunnel"
$ngrokPath = "C:\Users\dusti\AppData\Local\ngrok\ngrok.exe"
$ngrokWorkingDirectory = "C:\Users\dusti\AppData\Local\ngrok"
$ngrokControlPath = Join-Path $logsDirectory "physiqueos-ngrok-control.json"
$ngrokMonitorLog = Join-Path $logsDirectory "physiqueos-ngrok-monitor.log"

function Write-MonitorLog([string]$Message) {
  New-Item -ItemType Directory -Path $logsDirectory -Force | Out-Null
  if ((Test-Path $monitorLog) -and (Get-Item $monitorLog).Length -gt 1048576) {
    $archive = "$monitorLog.1"
    if (Test-Path $archive) { Remove-Item -LiteralPath $archive -Force }
    Move-Item -LiteralPath $monitorLog -Destination $archive
  }
  Add-Content -LiteralPath $monitorLog -Value "$((Get-Date).ToString('o')) $Message"
}

function Read-ControlState {
  if (-not (Test-Path -LiteralPath $controlPath -PathType Leaf)) { return $null }
  try {
    $value = Get-Content -LiteralPath $controlPath -Raw | ConvertFrom-Json
    if ($value.schemaVersion -ne 1 -or $value.desiredState -notin @("running", "stopped")) { return $null }
    foreach ($field in @(
      "lastRecoveryAttemptAt", "lastRecoveryOutcome", "lastHealthyAt",
      "consecutiveRecoveryFailures", "consecutiveUnhealthyChecks"
    )) {
      if (-not $value.PSObject.Properties[$field]) { $value | Add-Member -NotePropertyName $field -NotePropertyValue $null }
    }
    return $value
  } catch { return $null }
}

function Write-ControlState($State) {
  New-Item -ItemType Directory -Path $logsDirectory -Force | Out-Null
  $temporaryPath = "$controlPath.$PID.tmp"
  $State | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $temporaryPath -Encoding utf8
  Move-Item -LiteralPath $temporaryPath -Destination $controlPath -Force
}

function Write-NgrokLog([string]$Message) {
  if ((Test-Path $ngrokMonitorLog) -and (Get-Item $ngrokMonitorLog).Length -gt 1048576) {
    $archive = "$ngrokMonitorLog.1"
    if (Test-Path $archive) { Remove-Item -LiteralPath $archive -Force }
    Move-Item -LiteralPath $ngrokMonitorLog -Destination $archive
  }
  Add-Content -LiteralPath $ngrokMonitorLog -Value "$((Get-Date).ToString('o')) $Message"
}

function Read-NgrokControl {
  if (-not (Test-Path -LiteralPath $ngrokControlPath -PathType Leaf)) { return $null }
  try {
    $value = Get-Content -LiteralPath $ngrokControlPath -Raw | ConvertFrom-Json
    if ($value.schemaVersion -ne 1 -or $value.ngrokDesiredState -notin @("running","stopped")) { return $null }
    foreach ($field in @("lastNgrokRecoveryAttemptAt","lastNgrokRecoveryOutcome",
      "consecutiveNgrokRecoveryFailures","lastHealthyPublicUrl","lastHealthyTunnelAt")) {
      if (-not $value.PSObject.Properties[$field]) { $value | Add-Member -NotePropertyName $field -NotePropertyValue $null }
    }
    $value
  } catch { $null }
}

function Write-NgrokControl($State) {
  $temporary = "$ngrokControlPath.$PID.tmp"
  $State | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $temporary -Encoding utf8
  Move-Item -LiteralPath $temporary -Destination $ngrokControlPath -Force
}

function Save-NgrokOutcome($State, [string]$Outcome, [bool]$Failed = $false) {
  $State.lastNgrokRecoveryOutcome = $Outcome
  if ($Failed) {
    $prior = if ($null -ne $State.consecutiveNgrokRecoveryFailures) { [int]$State.consecutiveNgrokRecoveryFailures } else { 0 }
    $State.consecutiveNgrokRecoveryFailures = $prior + 1
  } elseif ($Outcome -eq "healthy") {
    $State.consecutiveNgrokRecoveryFailures = 0
    $State.lastHealthyTunnelAt = (Get-Date).ToString("o")
  }
  Write-NgrokControl $State
  Write-NgrokLog "outcome=$Outcome action=none elapsedMs=$([math]::Round(((Get-Date)-$started).TotalMilliseconds))"
}

function Invoke-NgrokMonitor {
  $state = Read-NgrokControl
  if (-not $state) { Write-NgrokLog "outcome=configuration_invalid action=none"; return }
  if ($state.ngrokDesiredState -eq "stopped") { Save-NgrokOutcome $state "intentionally_stopped"; return }
  if (-not (Test-Path -LiteralPath $ngrokPath -PathType Leaf)) { Save-NgrokOutcome $state "executable_missing" $true; return }
  $task = Get-ScheduledTask -TaskName $ngrokTaskName -ErrorAction SilentlyContinue
  $taskValid = [bool]($task -and $task.Actions.Count -eq 1 -and
    $task.Actions[0].Execute -eq $ngrokPath -and $task.Actions[0].Arguments -eq "http 3000" -and
    $task.Actions[0].WorkingDirectory -eq $ngrokWorkingDirectory)
  if (-not $taskValid) { Save-NgrokOutcome $state "task_invalid" $true; return }
  $processes = @(Get-CimInstance Win32_Process -Filter "Name = 'ngrok.exe'" -ErrorAction SilentlyContinue)
  $canonical = @($processes | Where-Object {
    $_.ExecutablePath -eq $ngrokPath -and $_.CommandLine -match "(?i)\bhttp\s+(?:http://localhost:)?3000\b"
  })
  $foreign = @($processes | Where-Object {
    -not ($_.ExecutablePath -eq $ngrokPath -and $_.CommandLine -match "(?i)\bhttp\s+(?:http://localhost:)?3000\b")
  })
  if ($foreign.Count -gt 0) { Save-NgrokOutcome $state "foreign_process" $true; return }
  if ($canonical.Count -gt 1) { Save-NgrokOutcome $state "duplicate_tunnel" $true; return }
  if ($canonical.Count -eq 1) {
    try {
      $inspection = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 5
      $matches = @($inspection.tunnels | Where-Object { $_.config.addr -in @("http://localhost:3000","http://127.0.0.1:3000","localhost:3000","127.0.0.1:3000") })
      if ($matches.Count -eq 1) {
        $state.lastHealthyPublicUrl = [string]$matches[0].public_url
        Save-NgrokOutcome $state "healthy"
        return
      }
    } catch {}
    Save-NgrokOutcome $state "tunnel_unhealthy"
    return
  }
  if ([string]$task.State -eq "Running") {
    $info = Get-ScheduledTaskInfo -TaskName $ngrokTaskName
    if ($info.LastRunTime -and ((Get-Date)-$info.LastRunTime).TotalSeconds -le $startupGraceSeconds) {
      Save-NgrokOutcome $state "starting"
    } else { Save-NgrokOutcome $state "stopped_unexpectedly" }
    return
  }
  $failures = if ($null -ne $state.consecutiveNgrokRecoveryFailures) { [int]$state.consecutiveNgrokRecoveryFailures } else { 0 }
  if ($failures -ge 3 -and $state.lastNgrokRecoveryAttemptAt -and
    ((Get-Date)-[datetime]$state.lastNgrokRecoveryAttemptAt).TotalMinutes -lt $failureBackoffMinutes) {
    Save-NgrokOutcome $state "recovery_failed"
    return
  }
  $state.lastNgrokRecoveryAttemptAt = (Get-Date).ToString("o")
  $state.lastNgrokRecoveryOutcome = "recovery_pending"
  Write-NgrokControl $state
  try {
    Start-ScheduledTask -TaskName $ngrokTaskName
    $state.lastNgrokRecoveryOutcome = "recovery_invoked"
    Write-NgrokControl $state
    Write-NgrokLog "outcome=recovery_invoked action=start_task"
  } catch {
    $state.lastNgrokRecoveryOutcome = "recovery_start_failed"
    $state.consecutiveNgrokRecoveryFailures = $failures + 1
    Write-NgrokControl $state
    Write-NgrokLog "outcome=recovery_start_failed type=$($_.Exception.GetType().Name)"
  }
}

function Get-Listener {
  $row = netstat -ano -p TCP | Select-String -Pattern "TCP\s+([^\s]+):3000\s+[^\s]+\s+LISTENING\s+(\d+)" | Select-Object -First 1
  if (-not $row) { return $null }
  $match = [regex]::Match($row.Line, "TCP\s+([^\s]+):3000\s+[^\s]+\s+LISTENING\s+(\d+)")
  if (-not $match.Success) { return $null }
  [pscustomobject]@{ address = $match.Groups[1].Value; pid = [int]$match.Groups[2].Value }
}

function Get-ProcessRecord([int]$ProcessId) {
  if (-not $ProcessId) { return $null }
  Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
}

function Save-Outcome($State, [string]$Outcome, [bool]$Failed = $false) {
  $State.lastRecoveryOutcome = $Outcome
  if ($Failed) {
    $priorFailures = if ($null -ne $State.consecutiveRecoveryFailures) { [int]$State.consecutiveRecoveryFailures } else { 0 }
    $State.consecutiveRecoveryFailures = $priorFailures + 1
  } elseif ($Outcome -eq "healthy") {
    $State.consecutiveRecoveryFailures = 0
    $State.consecutiveUnhealthyChecks = 0
    $State.lastHealthyAt = (Get-Date).ToString("o")
  }
  Write-ControlState $State
  Write-MonitorLog "outcome=$Outcome desiredState=$($State.desiredState) elapsedMs=$([math]::Round(((Get-Date)-$started).TotalMilliseconds))"
}

$control = Read-ControlState
if (-not $control) {
  Write-MonitorLog "outcome=invalid_control_state action=none elapsedMs=$([math]::Round(((Get-Date)-$started).TotalMilliseconds))"
  exit 0
}
if ($control.desiredState -eq "stopped") {
  Save-Outcome $control "intentional_stop"
  exit 0
}
if (-not (Test-Path -LiteralPath $buildIdPath -PathType Leaf)) {
  Save-Outcome $control "build_missing" $true
  exit 0
}

$task = Get-ScheduledTask -TaskName $productionTaskName -ErrorAction SilentlyContinue
$expectedArguments = "`"$nextPath`" start --hostname 0.0.0.0 --port 3000"
$taskValid = [bool]($task -and $task.Actions.Count -eq 1 -and
  $task.Actions[0].Execute -eq $nodePath -and
  $task.Actions[0].Arguments -eq $expectedArguments -and
  $task.Actions[0].WorkingDirectory -eq $repositoryRoot)
if (-not $taskValid) {
  Save-Outcome $control "task_invalid" $true
  exit 0
}

$listener = Get-Listener
if ($listener) {
  $process = Get-ProcessRecord -ProcessId $listener.pid
  $canonical = [bool]($process -and $process.Name -eq "node.exe" -and
    $process.CommandLine -like "*$nextPath*start --hostname 0.0.0.0 --port 3000*")
  if (-not $canonical) {
    Save-Outcome $control "foreign_listener" $true
    exit 0
  }
  try {
    $health = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:3000/api/health" -TimeoutSec 5
    if ($health.StatusCode -eq 200) {
      $metadata = [ordered]@{
        schemaVersion = 2; taskName = $productionTaskName; listenerPid = $listener.pid
        processStartedAt = if ($process.CreationDate) { $process.CreationDate.ToString("o") } else { $null }
        healthCheckedAt = (Get-Date).ToString("o"); port = 3000; hostname = "0.0.0.0"
        repositoryPath = $repositoryRoot; nodePath = $nodePath; taskState = [string]$task.State
        healthStatus = "healthy"
      }
      $metadataTemporary = "$metadataPath.$PID.tmp"
      $metadata | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $metadataTemporary -Encoding utf8
      Move-Item -LiteralPath $metadataTemporary -Destination $metadataPath -Force
      Save-Outcome $control "healthy"
      Invoke-NgrokMonitor
      exit 0
    }
  } catch {}
  $priorUnhealthy = if ($null -ne $control.consecutiveUnhealthyChecks) { [int]$control.consecutiveUnhealthyChecks } else { 0 }
  $control.consecutiveUnhealthyChecks = $priorUnhealthy + 1
  Save-Outcome $control "unhealthy"
  exit 0
}

if ([string]$task.State -eq "Running") {
  $taskInfo = Get-ScheduledTaskInfo -TaskName $productionTaskName
  if ($taskInfo.LastRunTime -and ((Get-Date) - $taskInfo.LastRunTime).TotalSeconds -le $startupGraceSeconds) {
    Save-Outcome $control "starting"
    exit 0
  }
  Save-Outcome $control "stopped_unexpectedly"
  exit 0
}

$failures = if ($null -ne $control.consecutiveRecoveryFailures) { [int]$control.consecutiveRecoveryFailures } else { 0 }
if ($failures -ge 3 -and $control.lastRecoveryAttemptAt) {
  $lastAttempt = [datetime]$control.lastRecoveryAttemptAt
  if (((Get-Date) - $lastAttempt).TotalMinutes -lt $failureBackoffMinutes) {
    Save-Outcome $control "recovery_failed"
    exit 0
  }
}

$control.lastRecoveryAttemptAt = (Get-Date).ToString("o")
$control.lastRecoveryOutcome = if ($control.lastHealthyAt) { "unexpected_runtime_loss" } else { "recovery_required" }
Write-ControlState $control
try {
  Start-ScheduledTask -TaskName $productionTaskName
  $control.lastRecoveryOutcome = "recovery_invoked"
  Write-ControlState $control
  Write-MonitorLog "outcome=recovery_invoked action=start_task elapsedMs=$([math]::Round(((Get-Date)-$started).TotalMilliseconds))"
} catch {
  $control.lastRecoveryOutcome = "recovery_start_failed"
  $control.consecutiveRecoveryFailures = $failures + 1
  Write-ControlState $control
  Write-MonitorLog "outcome=recovery_start_failed type=$($_.Exception.GetType().Name) elapsedMs=$([math]::Round(((Get-Date)-$started).TotalMilliseconds))"
}
