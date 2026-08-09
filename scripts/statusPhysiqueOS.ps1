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
$ownershipHelper = Join-Path $repositoryRoot "scripts\physiqueosRuntimeOwnership.ps1"
$localUrl = "http://127.0.0.1:3000"
. $ownershipHelper

function Get-Listeners {
  @(
    netstat -ano -p TCP |
      Select-String -Pattern "TCP\s+([^\s]+):3000\s+[^\s]+\s+LISTENING\s+(\d+)" |
      ForEach-Object {
        $match = [regex]::Match($_.Line, "TCP\s+([^\s]+):3000\s+[^\s]+\s+LISTENING\s+(\d+)")
        if ($match.Success) {
          [pscustomobject]@{
            address = $match.Groups[1].Value
            port = 3000
            pid = [int]$match.Groups[2].Value
          }
        }
      }
  )
}

function Get-ProcessRecord([int]$ProcessId) {
  if (-not $ProcessId) { return $null }
  Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue |
    Select-Object @{n="pid";e={$_.ProcessId}}, @{n="parentPid";e={$_.ParentProcessId}},
      @{n="name";e={$_.Name}}, @{n="commandLine";e={$_.CommandLine}},
      @{n="sessionId";e={$_.SessionId}},
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

$taskQuery = Get-PhysiqueOSTaskQueryResult -TaskName $taskName
$task = $taskQuery.task
$taskInfo = if ($taskQuery.status -eq "readable") {
  try { Get-ScheduledTaskInfo -TaskName $taskName -ErrorAction Stop } catch { $null }
} else { $null }
$monitorTaskQuery = Get-PhysiqueOSTaskQueryResult -TaskName $monitorTaskName
$monitorTask = $monitorTaskQuery.task
$monitorInfo = if ($monitorTaskQuery.status -eq "readable") {
  try { Get-ScheduledTaskInfo -TaskName $monitorTaskName -ErrorAction Stop } catch { $null }
} else { $null }
$listeners = @(Get-Listeners)
$listenerPids = @($listeners | Select-Object -ExpandProperty pid -Unique)
$listener = if ($listenerPids.Count -eq 1) {
  $listeners | Where-Object { $_.pid -eq $listenerPids[0] } | Select-Object -First 1
} else { $null }
$process = if ($listener) { Get-ProcessRecord -ProcessId $listener.pid } else { $null }
$ancestors = if ($process) { @(Get-Ancestors $process) } else { @() }
$startupTiming = Get-PhysiqueOSRuntimeStartupTiming -Process $process -TaskInfo $taskInfo
$expectedArguments = "`"$nextPath`" start --hostname 0.0.0.0 --port 3000"
$taskMatches = [bool]($task -and
  $task.Actions.Count -eq 1 -and
  $task.Actions[0].Execute -eq $nodePath -and
  $task.Actions[0].Arguments -eq $expectedArguments -and
  $task.Actions[0].WorkingDirectory -eq $repositoryRoot)
$monitorMatches = [bool]($monitorTask -and $monitorTask.Actions.Count -eq 1 -and
  $monitorTask.Actions[0].Execute -like "*\WindowsPowerShell\v1.0\powershell.exe" -and
  $monitorTask.Actions[0].Arguments -like "*-File `"$monitorScript`"*")
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
$ownership = Get-PhysiqueOSRuntimeOwnershipDecision `
  -TaskQueryStatus $taskQuery.status `
  -Task $task `
  -TaskInfo $taskInfo `
  -Listeners $listeners `
  -Process $process `
  -Ancestors $ancestors `
  -HealthOk ([bool]$health.ok) `
  -ExpectedNodePath $nodePath `
  -ExpectedNextPath $nextPath `
  -ExpectedRepositoryRoot $repositoryRoot
$canonicalOwnership = $ownership.ownershipDecision -eq "canonical"

$overall = Get-PhysiqueOSRuntimeOverallState `
  -TaskQueryStatus $taskQuery.status `
  -MonitorTaskQueryStatus $monitorTaskQuery.status `
  -TaskDefinitionMatches $taskMatches `
  -MonitorDefinitionMatches $monitorMatches `
  -ControlValid ([bool]$control) `
  -ListenerPresent ($listeners.Count -gt 0) `
  -CanonicalOwnership $canonicalOwnership `
  -DesiredState $desiredState `
  -TaskState $taskState `
  -ForbiddenAncestor $forbiddenAncestor `
  -HealthOk ([bool]$health.ok) `
  -StartupGraceActive ([bool]$startupTiming.graceActive) `
  -LastRecoveryOutcome $(if ($control) { [string]$control.lastRecoveryOutcome } else { $null }) `
  -ConsecutiveRecoveryFailures $(if ($control) { [int]$control.consecutiveRecoveryFailures } else { 0 })

$lanAddress = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -match "^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)" -and $_.InterfaceAlias -notmatch "Loopback|WSL|vEthernet|Virtual|VPN" } |
  Select-Object -First 1 -ExpandProperty IPAddress
$ngrokStatusScript = Join-Path $PSScriptRoot "statusPhysiqueOSNgrok.ps1"
$ngrokStatus = if ($overall -ne "healthy") {
  [pscustomobject]@{
    overallState = "deferred"
    reason = "local_runtime_$overall"
  }
} elseif (Test-Path -LiteralPath $ngrokStatusScript -PathType Leaf) {
  try { & $ngrokStatusScript -AsJson | ConvertFrom-Json } catch {
    [pscustomobject]@{ overallState = "configuration_invalid"; error = $_.Exception.Message }
  }
} else { [pscustomobject]@{ overallState = "configuration_invalid"; error = "Ngrok status script missing." } }
$uptimeSeconds = if ($process -and $process.startedAt) { [math]::Floor(((Get-Date) - [datetime]$process.startedAt).TotalSeconds) } else { $null }

[ordered]@{
  overallState = $overall
  desiredState = $desiredState
  task = [ordered]@{
    installed = if ($taskQuery.status -eq "readable") { [bool]$task } else { $null }
    queryStatus = $taskQuery.status
    matchesCanonicalDefinition = $taskMatches
    state = $taskState
    lastRunTime = if ($taskInfo) { $taskInfo.LastRunTime.ToString("o") } else { $null }
    lastTaskResult = if ($taskInfo) { $taskInfo.LastTaskResult } else { $null }
  }
  monitorTask = [ordered]@{
    installed = if ($monitorTaskQuery.status -eq "readable") { [bool]$monitorTask } else { $null }
    queryStatus = $monitorTaskQuery.status
    matchesCanonicalDefinition = $monitorMatches
    state = $monitorState
    lastRunTime = if ($monitorInfo -and $monitorInfo.LastRunTime) { $monitorInfo.LastRunTime.ToString("o") } else { $null }
    lastTaskResult = if ($monitorInfo) { $monitorInfo.LastTaskResult } else { $null }
  }
  listener = $listener
  listeners = $listeners
  process = $process
  ancestorChain = $ancestors
  uptimeSeconds = $uptimeSeconds
  health = $health
  startup = $startupTiming
  ownership = $ownership
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
