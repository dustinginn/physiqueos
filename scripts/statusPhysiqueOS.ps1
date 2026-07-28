[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$taskName = "PhysiqueOS Production Server"
$monitorTaskName = "PhysiqueOS Runtime Monitor"
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$nodePath = "C:\Program Files\nodejs\node.exe"
$nextPath = Join-Path $repositoryRoot "node_modules\next\dist\bin\next"
$metadataPath = Join-Path $repositoryRoot "logs\physiqueos-runtime.json"
$controlPath = Join-Path $repositoryRoot "logs\physiqueos-runtime-control.json"
$monitorScript = Join-Path $repositoryRoot "scripts\monitorPhysiqueOS.ps1"
$localUrl = "http://127.0.0.1:3000"

function Get-Listener {
  $row = netstat -ano -p TCP | Select-String -Pattern "TCP\s+([^\s]+):3000\s+[^\s]+\s+LISTENING\s+(\d+)" | Select-Object -First 1
  if (-not $row) { return $null }
  $match = [regex]::Match($row.Line, "TCP\s+([^\s]+):3000\s+[^\s]+\s+LISTENING\s+(\d+)")
  if (-not $match.Success) { return $null }
  [pscustomobject]@{ address = $match.Groups[1].Value; port = 3000; pid = [int]$match.Groups[2].Value }
}

function Get-ProcessRecord([int]$ProcessId) {
  if (-not $ProcessId) { return $null }
  Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue |
    Select-Object @{n="pid";e={$_.ProcessId}}, @{n="parentPid";e={$_.ParentProcessId}},
      @{n="name";e={$_.Name}}, @{n="commandLine";e={$_.CommandLine}},
      @{n="startedAt";e={ if ($_.CreationDate) { $_.CreationDate.ToString("o") } else { $null } }}
}

function Get-Ancestors($process) {
  $result = @()
  $seen = @{}
  $current = $process
  while ($current -and -not $seen.ContainsKey([int]$current.pid)) {
    $seen[[int]$current.pid] = $true
    $result += $current
    if (-not $current.parentPid) { break }
    $current = Get-ProcessRecord -ProcessId ([int]$current.parentPid)
  }
  return $result
}

function Test-Health([string]$Url) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "$Url/api/health" -TimeoutSec 5
    return [pscustomobject]@{ ok = $response.StatusCode -eq 200; status = $response.StatusCode; checkedAt = (Get-Date).ToString("o") }
  } catch {
    return [pscustomobject]@{ ok = $false; status = $null; checkedAt = (Get-Date).ToString("o"); error = $_.Exception.Message }
  }
}

$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
$taskInfo = if ($task) { Get-ScheduledTaskInfo -TaskName $taskName } else { $null }
$monitorTask = Get-ScheduledTask -TaskName $monitorTaskName -ErrorAction SilentlyContinue
$monitorInfo = if ($monitorTask) { Get-ScheduledTaskInfo -TaskName $monitorTaskName } else { $null }
$listener = Get-Listener
$process = if ($listener) { Get-ProcessRecord -ProcessId $listener.pid } else { $null }
$ancestors = if ($process) { @(Get-Ancestors $process) } else { @() }
$expectedArguments = "`"$nextPath`" start --hostname 0.0.0.0 --port 3000"
$taskMatches = [bool]($task -and
  $task.Actions.Count -eq 1 -and
  $task.Actions[0].Execute -eq $nodePath -and
  $task.Actions[0].Arguments -eq $expectedArguments -and
  $task.Actions[0].WorkingDirectory -eq $repositoryRoot)
$monitorMatches = [bool]($monitorTask -and $monitorTask.Actions.Count -eq 1 -and
  $monitorTask.Actions[0].Execute -like "*\WindowsPowerShell\v1.0\powershell.exe" -and
  $monitorTask.Actions[0].Arguments -like "*-File `"$monitorScript`"*")
$processMatches = [bool]($process -and
  $process.name -eq "node.exe" -and
  $process.commandLine -like "*$nextPath*start --hostname 0.0.0.0 --port 3000*")
$forbiddenAncestor = @($ancestors | Select-Object -Skip 1 | Where-Object {
  $_.name -in @("powershell.exe", "pwsh.exe", "cmd.exe", "WindowsTerminal.exe", "Code.exe")
}).Count -gt 0
$health = Test-Health -Url $localUrl
$metadata = if (Test-Path -LiteralPath $metadataPath) {
  try { Get-Content -LiteralPath $metadataPath -Raw | ConvertFrom-Json } catch { $null }
} else { $null }
$metadataStale = [bool]($metadata -and (-not $listener -or [int]$metadata.listenerPid -ne [int]$listener.pid))
$taskState = if ($task) { [string]$task.State } else { "NotInstalled" }
$monitorState = if ($monitorTask) { [string]$monitorTask.State } else { "NotInstalled" }
$control = if (Test-Path -LiteralPath $controlPath) {
  try {
    $candidate = Get-Content -LiteralPath $controlPath -Raw | ConvertFrom-Json
    if ($candidate.schemaVersion -eq 1 -and $candidate.desiredState -in @("running", "stopped")) { $candidate } else { $null }
  } catch { $null }
} else { $null }
$desiredState = if ($control) { [string]$control.desiredState } else { "unknown" }

$overall = if (-not $taskMatches -or -not $monitorMatches -or -not $control) {
  "task_invalid"
} elseif ($listener -and -not $processMatches) {
  "foreign_listener"
} elseif ($listener -and ($taskState -ne "Running" -or -not $taskMatches -or $forbiddenAncestor)) {
  "task_process_mismatch"
} elseif ($desiredState -eq "stopped" -and -not $listener) {
  "intentionally_stopped"
} elseif ($control.lastRecoveryOutcome -eq "recovery_failed" -or [int]$control.consecutiveRecoveryFailures -ge 3) {
  "recovery_failed"
} elseif ($listener -and $health.ok -and $taskState -eq "Running") {
  "healthy"
} elseif (-not $listener -and $control.lastRecoveryOutcome -eq "recovery_invoked") {
  "recovering"
} elseif ($taskState -eq "Running" -and -not $listener) {
  "starting"
} elseif (-not $listener -and $desiredState -eq "running") {
  "recovery_pending"
} else {
  "unhealthy"
}

$lanAddress = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -match "^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)" -and $_.InterfaceAlias -notmatch "Loopback|WSL|vEthernet|Virtual|VPN" } |
  Select-Object -First 1 -ExpandProperty IPAddress
$ngrokStatusScript = Join-Path $PSScriptRoot "statusPhysiqueOSNgrok.ps1"
$ngrokStatus = if (Test-Path -LiteralPath $ngrokStatusScript -PathType Leaf) {
  try { & $ngrokStatusScript -AsJson | ConvertFrom-Json } catch {
    [pscustomobject]@{ overallState = "configuration_invalid"; error = $_.Exception.Message }
  }
} else { [pscustomobject]@{ overallState = "configuration_invalid"; error = "Ngrok status script missing." } }
$uptimeSeconds = if ($process -and $process.startedAt) { [math]::Floor(((Get-Date) - [datetime]$process.startedAt).TotalSeconds) } else { $null }

[ordered]@{
  overallState = $overall
  desiredState = $desiredState
  task = [ordered]@{
    installed = [bool]$task
    matchesCanonicalDefinition = $taskMatches
    state = $taskState
    lastRunTime = if ($taskInfo) { $taskInfo.LastRunTime.ToString("o") } else { $null }
    lastTaskResult = if ($taskInfo) { $taskInfo.LastTaskResult } else { $null }
  }
  monitorTask = [ordered]@{
    installed = [bool]$monitorTask
    matchesCanonicalDefinition = $monitorMatches
    state = $monitorState
    lastRunTime = if ($monitorInfo -and $monitorInfo.LastRunTime) { $monitorInfo.LastRunTime.ToString("o") } else { $null }
    lastTaskResult = if ($monitorInfo) { $monitorInfo.LastTaskResult } else { $null }
  }
  listener = $listener
  process = $process
  ancestorChain = $ancestors
  uptimeSeconds = $uptimeSeconds
  health = $health
  localUrl = $localUrl
  lanUrl = if ($lanAddress) { "http://${lanAddress}:3000" } else { $null }
  ngrok = $ngrokStatus
  recovery = [ordered]@{
    lastAttemptAt = if ($control) { $control.lastRecoveryAttemptAt } else { $null }
    lastOutcome = if ($control) { $control.lastRecoveryOutcome } else { $null }
    consecutiveFailures = if ($control) { $control.consecutiveRecoveryFailures } else { $null }
  }
  control = [ordered]@{ path = $controlPath; valid = [bool]$control }
  metadata = [ordered]@{ path = $metadataPath; present = [bool]$metadata; stale = $metadataStale }
} | ConvertTo-Json -Depth 10
