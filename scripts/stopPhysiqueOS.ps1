[CmdletBinding()]
param([int]$TimeoutSeconds = 30)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$taskName = "PhysiqueOS Production Server"
$monitorTaskName = "PhysiqueOS Runtime Monitor"
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$nodePath = "C:\Program Files\nodejs\node.exe"
$nextPath = Join-Path $repositoryRoot "node_modules\next\dist\bin\next"
$metadataPath = Join-Path $repositoryRoot "logs\physiqueos-runtime.json"
$controlPath = Join-Path $repositoryRoot "logs\physiqueos-runtime-control.json"
$lifecycleLog = Join-Path $repositoryRoot "logs\physiqueos-runtime.lifecycle.log"
$statusScript = Join-Path $PSScriptRoot "statusPhysiqueOS.ps1"
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
$monitorTask = Get-ScheduledTask -TaskName $monitorTaskName -ErrorAction SilentlyContinue

if (-not $task) { throw "Canonical task '$taskName' is not installed." }
if (-not $monitorTask) { throw "Monitor task '$monitorTaskName' is not installed." }
$action = $task.Actions | Select-Object -First 1
$expectedArguments = "`"$nextPath`" start --hostname 0.0.0.0 --port 3000"
if ($task.Actions.Count -ne 1 -or $action.Execute -ne $nodePath -or
    $action.Arguments -ne $expectedArguments -or $action.WorkingDirectory -ne $repositoryRoot) {
  throw "Refusing to stop a task that does not match the canonical PhysiqueOS definition."
}

$before = & $statusScript | ConvertFrom-Json
if ($before.listener -and $before.overallState -notin @("healthy", "task_process_mismatch", "control_state_mismatch")) {
  throw "Refusing to stop: port 3000 is not owned by the canonical runtime."
}
$listenerPid = if ($before.listener) { [int]$before.listener.pid } else { $null }
$priorControl = if (Test-Path -LiteralPath $controlPath) {
  try { Get-Content -LiteralPath $controlPath -Raw | ConvertFrom-Json } catch { $null }
} else { $null }
$control = [ordered]@{
  schemaVersion = 1
  desiredState = "stopped"
  changedAt = (Get-Date).ToString("o")
  changedBy = "stop_script"
  reason = "Explicit intentional stop requested"
  lastRecoveryAttemptAt = if ($priorControl) { $priorControl.lastRecoveryAttemptAt } else { $null }
  lastRecoveryOutcome = "intentional_stop"
  consecutiveRecoveryFailures = 0
  lastHealthyAt = if ($priorControl) { $priorControl.lastHealthyAt } else { $null }
  consecutiveUnhealthyChecks = 0
}
$temporaryPath = "$controlPath.$PID.tmp"
$control | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $temporaryPath -Encoding utf8
Move-Item -LiteralPath $temporaryPath -Destination $controlPath -Force
Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
Add-Content -LiteralPath $lifecycleLog -Value "$((Get-Date).ToString('o')) Requested canonical scheduled-task stop."

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
do {
  Start-Sleep -Seconds 1
  $after = & $statusScript | ConvertFrom-Json
  if (-not $after.listener -and $after.task.state -ne "Running") {
    if (Test-Path -LiteralPath $metadataPath) { Remove-Item -LiteralPath $metadataPath -Force }
    Add-Content -LiteralPath $lifecycleLog -Value "$((Get-Date).ToString('o')) Canonical runtime stopped; prior listener PID was $listenerPid."
    $after | ConvertTo-Json -Depth 10
    exit 0
  }
  if ($after.listener -and $listenerPid -and [int]$after.listener.pid -ne $listenerPid) {
    throw "A different listener appeared on port 3000; no process was terminated."
  }
} while ((Get-Date) -lt $deadline)

throw "Task stop did not close canonical listener PID $listenerPid within $TimeoutSeconds seconds; no direct process kill was attempted."
