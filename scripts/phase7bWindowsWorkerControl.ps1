[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet(
    "inspect-runtime-monitor", "quiesce-runtime-monitor", "restore-runtime-monitor",
    "inspect-production-server", "retire-production-server", "inspect-ngrok", "retire-ngrok"
  )]
  [string]$Operation,
  [Parameter(Mandatory = $true)]
  [ValidateLength(1, 131072)]
  [string]$PayloadBase64
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$productionTaskName = "PhysiqueOS Production Server"
$monitorTaskName = "PhysiqueOS Runtime Monitor"
$ngrokTaskName = "PhysiqueOS Ngrok Tunnel"
$nodePath = "C:\Program Files\nodejs\node.exe"
$powershellPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$ngrokPath = "C:\Users\dusti\AppData\Local\ngrok\ngrok.exe"
$ngrokWorkingDirectory = "C:\Users\dusti\AppData\Local\ngrok"
$monitorScript = Join-Path $repositoryRoot "scripts\monitorPhysiqueOS.ps1"
$nextPath = Join-Path $repositoryRoot "node_modules\next\dist\bin\next"
$runtimeControlPath = Join-Path $repositoryRoot "logs\physiqueos-runtime-control.json"
$runtimeMetadataPath = Join-Path $repositoryRoot "logs\physiqueos-runtime.json"
$ngrokControlPath = Join-Path $repositoryRoot "logs\physiqueos-ngrok-control.json"
$mutationStarted = $false

function Get-PropertyValue($Value, [string]$Name) {
  if ($null -eq $Value) { return $null }
  $property = $Value.PSObject.Properties[$Name]
  if ($property) { return $property.Value }
  return $null
}

function Normalize-Path([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return $null }
  return $Value.Trim().Trim('"').Replace("/", "\").TrimEnd("\").ToLowerInvariant()
}

function Get-Sha256([string]$Value) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Value)))).Replace("-", "").ToLowerInvariant()
  } finally { $sha.Dispose() }
}

function Read-SafeJson([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
  try { return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json } catch { return $null }
}

function Get-TaskDefinition([string]$TaskName) {
  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
  $actions = @($task.Actions)
  $action = if ($actions.Count -eq 1) { $actions[0] } else { $null }
  $execute = [string](Get-PropertyValue $action "Execute")
  $arguments = [string](Get-PropertyValue $action "Arguments")
  $workingDirectory = [string](Get-PropertyValue $action "WorkingDirectory")
  $enabled = [bool](Get-PropertyValue $task.Settings "Enabled")
  $principal = Get-PropertyValue $task "Principal"
  $triggers = @($task.Triggers)
  $triggerTypes = @($triggers | ForEach-Object { [string]$_.CimClass.CimClassName } | Sort-Object)
  $repetitionIntervals = @($triggers | ForEach-Object { [string](Get-PropertyValue (Get-PropertyValue $_ "Repetition") "Interval") } | Where-Object { $_ } | Sort-Object)
  $canonical = [ordered]@{
    taskName = $TaskName
    execute = Normalize-Path $execute
    argumentsSha256 = Get-Sha256 $arguments
    workingDirectory = Normalize-Path $workingDirectory
    enabled = $enabled
    logonType = [string](Get-PropertyValue $principal "LogonType")
    runLevel = [string](Get-PropertyValue $principal "RunLevel")
    multipleInstances = [string](Get-PropertyValue $task.Settings "MultipleInstances")
    executionTimeLimit = [string](Get-PropertyValue $task.Settings "ExecutionTimeLimit")
    triggerTypes = $triggerTypes
    repetitionIntervals = $repetitionIntervals
  }
  $definitionText = @(
    $canonical.taskName, $canonical.execute, $canonical.argumentsSha256,
    $canonical.workingDirectory, $canonical.logonType, $canonical.runLevel,
    $canonical.multipleInstances, $canonical.executionTimeLimit,
    ($canonical.triggerTypes -join ","), ($canonical.repetitionIntervals -join ",")
  ) -join "|"
  return [pscustomobject]@{
    task = $task
    state = ([string]$task.State).ToLowerInvariant()
    enabled = $enabled
    execute = $execute
    arguments = $arguments
    workingDirectory = $workingDirectory
    definitionSha256 = Get-Sha256 $definitionText
    canonical = $canonical
  }
}

function Test-MonitorDefinition($Definition) {
  $expectedArguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$monitorScript`""
  return [bool](
    (Normalize-Path $Definition.execute) -eq (Normalize-Path $powershellPath) -and
    $Definition.arguments -eq $expectedArguments -and
    (Normalize-Path $Definition.workingDirectory) -eq (Normalize-Path $repositoryRoot) -and
    $Definition.canonical.logonType -eq "S4U" -and
    $Definition.canonical.runLevel -eq "Limited" -and
    $Definition.canonical.multipleInstances -eq "IgnoreNew" -and
    $Definition.canonical.executionTimeLimit -eq "PT30S" -and
    $Definition.canonical.triggerTypes -contains "MSFT_TaskLogonTrigger" -and
    $Definition.canonical.repetitionIntervals -contains "PT1M"
  )
}

function Test-ProductionServerDefinition($Definition) {
  $expectedArguments = "`"$nextPath`" start --hostname 0.0.0.0 --port 3000"
  return [bool](
    (Normalize-Path $Definition.execute) -eq (Normalize-Path $nodePath) -and
    $Definition.arguments -eq $expectedArguments -and
    (Normalize-Path $Definition.workingDirectory) -eq (Normalize-Path $repositoryRoot) -and
    $Definition.canonical.logonType -eq "S4U" -and
    $Definition.canonical.runLevel -eq "Limited" -and
    $Definition.canonical.multipleInstances -eq "IgnoreNew" -and
    $Definition.canonical.executionTimeLimit -eq "PT0S"
  )
}

function Test-NgrokDefinition($Definition) {
  return [bool](
    (Normalize-Path $Definition.execute) -eq (Normalize-Path $ngrokPath) -and
    $Definition.arguments -eq "http 3000" -and
    (Normalize-Path $Definition.workingDirectory) -eq (Normalize-Path $ngrokWorkingDirectory) -and
    $Definition.canonical.logonType -eq "S4U" -and
    $Definition.canonical.runLevel -eq "Limited" -and
    $Definition.canonical.multipleInstances -eq "IgnoreNew" -and
    $Definition.canonical.executionTimeLimit -eq "PT0S"
  )
}

function Get-CadenceProcesses {
  $processes = @(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object { $_.Name -in @("powershell.exe", "pwsh.exe", "node.exe") })
  $monitor = @()
  $cadence = @()
  foreach ($process in $processes) {
    $command = [string]$process.CommandLine
    if ([string]::IsNullOrWhiteSpace($command)) { continue }
    $normalized = $command.Replace("/", "\").ToLowerInvariant()
    if ($normalized.Contains((Normalize-Path $monitorScript))) {
      $monitor += [pscustomobject]@{ pid = [int]$process.ProcessId; role = "runtime-monitor" }
    }
    $cadencePath = Normalize-Path (Join-Path $repositoryRoot "scripts\runBriefingCadence.mjs")
    if ($normalized.Contains($cadencePath) -and $normalized -match "(?i)--source(?:=|\s+)runtime_monitor(?:\s|$)") {
      $cadence += [pscustomobject]@{ pid = [int]$process.ProcessId; role = "runtime-monitor-cadence" }
    }
  }
  return [pscustomobject]@{ monitor = @($monitor); cadence = @($cadence) }
}

function Get-RuntimeDesiredState {
  $control = Read-SafeJson $runtimeControlPath
  if ($control -and $control.schemaVersion -eq 1 -and $control.desiredState -in @("running", "stopped")) { return [string]$control.desiredState }
  return "unknown"
}

function Get-NgrokDesiredState {
  $control = Read-SafeJson $ngrokControlPath
  if ($control -and $control.schemaVersion -eq 1 -and $control.ngrokDesiredState -in @("running", "stopped")) { return [string]$control.ngrokDesiredState }
  return "unknown"
}

function Inspect-RuntimeMonitor {
  $definition = Get-TaskDefinition $monitorTaskName
  $processes = Get-CadenceProcesses
  return [ordered]@{
    taskName = $monitorTaskName
    present = $true
    enabled = $definition.enabled
    taskState = $definition.state
    definitionMatches = Test-MonitorDefinition $definition
    definitionSha256 = $definition.definitionSha256
    monitorProcessCount = @($processes.monitor).Count
    cadenceProcessCount = @($processes.cadence).Count
    cadencePresent = @($processes.cadence).Count -gt 0
    runtimeDesiredState = Get-RuntimeDesiredState
    ngrokDesiredState = Get-NgrokDesiredState
  }
}

function Inspect-ProductionServer {
  $status = & (Join-Path $PSScriptRoot "statusPhysiqueOS.ps1") | ConvertFrom-Json
  $definition = Get-TaskDefinition $productionTaskName
  $metadata = Read-SafeJson $runtimeMetadataPath
  $listenerPid = if ($status.listener) { [int]$status.listener.pid } else { $null }
  $metadataMatches = [bool](
    $metadata -and $listenerPid -and
    [string]$metadata.taskName -eq $productionTaskName -and
    [int]$metadata.listenerPid -eq $listenerPid -and
    (Normalize-Path ([string]$metadata.nodePath)) -eq (Normalize-Path $nodePath) -and
    (Normalize-Path ([string]$metadata.repositoryPath)) -eq (Normalize-Path $repositoryRoot)
  )
  return [ordered]@{
    taskName = $productionTaskName
    present = [bool]$status.task.installed
    taskState = ([string]$status.task.state).ToLowerInvariant()
    definitionMatches = [bool]($status.task.matchesCanonicalDefinition -and (Test-ProductionServerDefinition $definition))
    definitionSha256 = $definition.definitionSha256
    listenerCount = @($status.listeners).Count
    listenerPid = $listenerPid
    nodeOwnershipProven = [bool]($status.ownership.ownershipDecision -eq "canonical")
    runtimeMetadataMatches = $metadataMatches
    retired = [bool](-not $status.listener -and ([string]$status.task.state).ToLowerInvariant() -ne "running")
  }
}

function Inspect-Ngrok {
  $status = & (Join-Path $PSScriptRoot "statusPhysiqueOSNgrok.ps1") -AsJson | ConvertFrom-Json
  $definition = Get-TaskDefinition $ngrokTaskName
  return [ordered]@{
    taskName = $ngrokTaskName
    present = [bool]$status.taskInstalled
    taskState = ([string]$status.taskState).ToLowerInvariant()
    definitionMatches = [bool]($status.taskValid -and (Test-NgrokDefinition $definition))
    definitionSha256 = $definition.definitionSha256
    canonicalProcessCount = [int]$status.canonicalProcessCount
    foreignProcessCount = [int]$status.foreignProcessCount
    processId = if ($status.pid) { [int]$status.pid } else { $null }
    processOwnershipProven = [bool]($status.canonicalProcessCount -eq 1 -and $status.foreignProcessCount -eq 0 -and $status.terminalIndependent)
    retired = [bool]($status.canonicalProcessCount -eq 0)
    desiredState = [string]$status.desiredState
  }
}

function Require-ExactMonitor($State) {
  if (-not $State.present -or -not $State.definitionMatches -or $State.monitorProcessCount -gt 1 -or $State.cadenceProcessCount -gt 1) {
    throw "WINDOWS_MONITOR_IDENTITY_MISMATCH"
  }
}

function Read-Payload {
  try {
    $bytes = [Convert]::FromBase64String($PayloadBase64)
    if ($bytes.Length -gt 65536) { throw "payload-too-large" }
    return [Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json
  } catch { throw "WINDOWS_WORKER_PAYLOAD_INVALID" }
}

function Write-Result([bool]$Ok, $Evidence, [string]$Classification = $null, [string]$Code = $null) {
  [ordered]@{
    ok = $Ok
    operation = $Operation
    classification = $Classification
    code = $Code
    message = if ($Ok) { $null } else { "Windows worker operation failed; inspect protected local logs." }
    evidence = $Evidence
  } | ConvertTo-Json -Depth 12 -Compress
}

try {
  $payload = Read-Payload
  $evidence = switch ($Operation) {
    "inspect-runtime-monitor" { Inspect-RuntimeMonitor }
    "quiesce-runtime-monitor" {
      $before = Inspect-RuntimeMonitor
      Require-ExactMonitor $before
      $mutationStarted = $true
      if ($before.enabled) { Disable-ScheduledTask -TaskName $monitorTaskName -ErrorAction Stop | Out-Null }
      # Disable prevents the one-minute trigger from racing the drain. Give an already-running
      # cadence child a bounded opportunity to finish naturally before stopping the monitor task.
      $drainDeadline = (Get-Date).AddSeconds(20)
      $drained = Inspect-RuntimeMonitor
      while ($drained.cadencePresent -and (Get-Date) -lt $drainDeadline) {
        Start-Sleep -Milliseconds 250
        $drained = Inspect-RuntimeMonitor
      }
      if ($drained.cadencePresent) { throw "WINDOWS_CADENCE_DRAIN_TIMEOUT" }
      if ($drained.taskState -eq "running" -or $drained.monitorProcessCount -gt 0) {
        Stop-ScheduledTask -TaskName $monitorTaskName -ErrorAction Stop
      }
      $deadline = (Get-Date).AddSeconds(8)
      do {
        Start-Sleep -Milliseconds 250
        $after = Inspect-RuntimeMonitor
        if (-not $after.enabled -and $after.taskState -ne "running" -and -not $after.cadencePresent -and $after.monitorProcessCount -eq 0) { break }
      } while ((Get-Date) -lt $deadline)
      if ($after.enabled -or $after.taskState -eq "running" -or $after.cadencePresent -or $after.monitorProcessCount -gt 0) { throw "WINDOWS_CADENCE_STILL_ACTIVE" }
      [ordered]@{ before = $before; after = $after }
    }
    "restore-runtime-monitor" {
      $snapshot = $payload.snapshot
      if (-not $snapshot -or $snapshot.schemaVersion -ne 1 -or $snapshot.runtimeMonitor.taskName -ne $monitorTaskName -or
          [string]$snapshot.runtimeMonitor.definitionSha256 -notmatch "^[0-9a-f]{64}$") { throw "WINDOWS_SNAPSHOT_INVALID" }
      $before = Inspect-RuntimeMonitor
      Require-ExactMonitor $before
      if ($before.definitionSha256 -ne $snapshot.runtimeMonitor.definitionSha256 -or $before.cadencePresent) { throw "WINDOWS_SNAPSHOT_MISMATCH" }
      $mutationStarted = $true
      if ([bool]$snapshot.runtimeMonitor.enabled -and -not $before.enabled) { Enable-ScheduledTask -TaskName $monitorTaskName -ErrorAction Stop | Out-Null }
      if ([bool]$snapshot.runtimeMonitor.enabled -and [string]$snapshot.runtimeMonitor.taskState -eq "running") {
        Start-ScheduledTask -TaskName $monitorTaskName -ErrorAction Stop
      }
      $after = Inspect-RuntimeMonitor
      if ($after.enabled -ne [bool]$snapshot.runtimeMonitor.enabled -or $after.definitionSha256 -ne $snapshot.runtimeMonitor.definitionSha256) { throw "WINDOWS_SNAPSHOT_RESTORE_MISMATCH" }
      [ordered]@{ before = $before; after = $after }
    }
    "inspect-production-server" { Inspect-ProductionServer }
    "retire-production-server" {
      $before = Inspect-ProductionServer
      if (-not $before.present -or -not $before.definitionMatches -or $before.listenerCount -ne 1 -or -not $before.nodeOwnershipProven -or -not $before.runtimeMetadataMatches) { throw "WINDOWS_SERVER_IDENTITY_MISMATCH" }
      $mutationStarted = $true
      $null = & (Join-Path $PSScriptRoot "stopPhysiqueOS.ps1") -TimeoutSeconds 30
      $after = Inspect-ProductionServer
      if (-not $after.retired) { throw "WINDOWS_SERVER_RETIREMENT_UNPROVEN" }
      [ordered]@{ before = $before; after = $after }
    }
    "inspect-ngrok" { Inspect-Ngrok }
    "retire-ngrok" {
      $before = Inspect-Ngrok
      if (-not $before.present -or -not $before.definitionMatches -or $before.canonicalProcessCount -ne 1 -or $before.foreignProcessCount -ne 0 -or -not $before.processOwnershipProven) { throw "WINDOWS_NGROK_IDENTITY_MISMATCH" }
      $mutationStarted = $true
      $null = & (Join-Path $PSScriptRoot "stopPhysiqueOSNgrok.ps1") -MonitorIntervalSeconds 1
      $after = Inspect-Ngrok
      if (-not $after.retired) { throw "WINDOWS_NGROK_RETIREMENT_UNPROVEN" }
      [ordered]@{ before = $before; after = $after }
    }
  }
  Write-Result -Ok $true -Evidence $evidence
  exit 0
} catch {
  Write-Result -Ok $false -Evidence $null -Classification $(if ($mutationStarted) { "ambiguous" } else { "rejected" }) -Code $(if ($mutationStarted) { "WORKER_OUTCOME_AMBIGUOUS" } else { "WORKER_IDENTITY_MISMATCH" })
  exit 1
}
