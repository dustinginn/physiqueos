[CmdletBinding()]
param([switch]$AsJson)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$taskName = "PhysiqueOS Ngrok Tunnel"
$ngrokPath = "C:\Users\dusti\AppData\Local\ngrok\ngrok.exe"
$workingDirectory = "C:\Users\dusti\AppData\Local\ngrok"
$configPath = Join-Path $workingDirectory "ngrok.yml"
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$controlPath = Join-Path $repositoryRoot "logs\physiqueos-ngrok-control.json"
$expectedArguments = "http 3000"

function Get-ProcessRecord([int]$ProcessId) {
  if (-not $ProcessId) { return $null }
  Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue |
    Select-Object @{n="pid";e={[int]$_.ProcessId}}, @{n="parentPid";e={[int]$_.ParentProcessId}},
      @{n="name";e={$_.Name}}, @{n="executablePath";e={$_.ExecutablePath}},
      @{n="commandLine";e={ Redact-Secrets $_.CommandLine }},
      @{n="startedAt";e={if ($_.CreationDate) {$_.CreationDate.ToString("o")} else {$null}}}
}

function Get-Ancestors($Process) {
  $result = @()
  $seen = @{}
  $current = $Process
  while ($current -and -not $seen.ContainsKey([int]$current.pid)) {
    $seen[[int]$current.pid] = $true
    $result += $current
    if (-not $current.parentPid) { break }
    $current = Get-ProcessRecord ([int]$current.parentPid)
  }
  @($result)
}

function Redact-Secrets([string]$Value) {
  if ($null -eq $Value) { return $null }
  $Value -replace "(?i)((?:authtoken|token)(?:\s+|=|:\s*))\S+", '$1<redacted>' `
    -replace "(?i)(Authorization:\s*(?:Bearer|Basic)\s+)\S+", '$1<redacted>'
}

function Read-Control {
  if (-not (Test-Path -LiteralPath $controlPath -PathType Leaf)) { return $null }
  try {
    $value = Get-Content -LiteralPath $controlPath -Raw | ConvertFrom-Json
    if ($value.schemaVersion -ne 1 -or $value.ngrokDesiredState -notin @("running","stopped")) { return $null }
    $value
  } catch { $null }
}

$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
$taskInfo = if ($task) { Get-ScheduledTaskInfo -TaskName $taskName } else { $null }
$taskValid = [bool]($task -and $task.Actions.Count -eq 1 -and
  $task.Actions[0].Execute -eq $ngrokPath -and
  $task.Actions[0].Arguments -eq $expectedArguments -and
  $task.Actions[0].WorkingDirectory -eq $workingDirectory)
$allNgrok = @(Get-CimInstance Win32_Process -Filter "Name = 'ngrok.exe'" -ErrorAction SilentlyContinue)
$canonical = @($allNgrok | Where-Object {
  $_.ExecutablePath -eq $ngrokPath -and $_.CommandLine -match "(?i)\bhttp\s+(?:http://localhost:)?3000\b"
})
$foreign = @($allNgrok | Where-Object {
  -not ($_.ExecutablePath -eq $ngrokPath -and $_.CommandLine -match "(?i)\bhttp\s+(?:http://localhost:)?3000\b")
})
$process = if ($canonical.Count -eq 1) { Get-ProcessRecord ([int]$canonical[0].ProcessId) } else { $null }
$ancestors = if ($process) { @(Get-Ancestors $process) } else { @() }
$terminalIndependent = [bool]($process -and @($ancestors | Select-Object -Skip 1 | Where-Object {
  $_.name -in @("powershell.exe","pwsh.exe","cmd.exe","WindowsTerminal.exe","Code.exe","npm.exe","npx.exe")
}).Count -eq 0)
$inspectionAvailable = $false
$publicUrl = $null
$upstream = $null
$tunnelHealthy = $false
try {
  $inspection = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 5
  $inspectionAvailable = $true
  $matches = @($inspection.tunnels | Where-Object { $_.config.addr -in @("http://localhost:3000","http://127.0.0.1:3000","localhost:3000","127.0.0.1:3000") })
  if ($matches.Count -eq 1) {
    $publicUrl = [string]$matches[0].public_url
    $upstream = [string]$matches[0].config.addr
    try { $tunnelHealthy = (Invoke-WebRequest -UseBasicParsing -Uri $publicUrl -TimeoutSec 10).StatusCode -eq 200 } catch {}
  }
} catch {}
$upstreamHealthy = $false
try { $upstreamHealthy = (Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:3000/api/health" -TimeoutSec 5).StatusCode -eq 200 } catch {}
$control = Read-Control
$desiredState = if ($control) { [string]$control.ngrokDesiredState } else { "unknown" }
$taskState = if ($task) { [string]$task.State } else { "NotInstalled" }
$overall = if (-not (Test-Path -LiteralPath $ngrokPath -PathType Leaf)) { "executable_missing"
} elseif (-not $taskValid) { "task_invalid"
} elseif ($foreign.Count -gt 0) { "foreign_process"
} elseif ($canonical.Count -gt 1) { "duplicate_tunnel"
} elseif ($desiredState -eq "stopped" -and $canonical.Count -eq 0) { "intentionally_stopped"
} elseif (-not $upstreamHealthy) { "upstream_unhealthy"
} elseif ($canonical.Count -eq 1 -and $tunnelHealthy -and $terminalIndependent) { "healthy"
} elseif ($canonical.Count -eq 1) { "tunnel_unhealthy"
} elseif ($desiredState -eq "running" -and $control.lastNgrokRecoveryOutcome -eq "recovery_failed") { "recovery_failed"
} elseif ($desiredState -eq "running") { "stopped_unexpectedly"
} else { "configuration_invalid" }

$result = [ordered]@{
  overallState = $overall
  desiredState = $desiredState
  taskInstalled = [bool]$task
  taskValid = $taskValid
  taskState = $taskState
  lastRunTime = if ($taskInfo) { $taskInfo.LastRunTime.ToString("o") } else { $null }
  lastTaskResult = if ($taskInfo) { $taskInfo.LastTaskResult } else { $null }
  canonicalExecutable = $ngrokPath
  configPath = $configPath
  pid = if ($process) { $process.pid } else { $null }
  parentProcessId = if ($process) { $process.parentPid } else { $null }
  processStartedAt = if ($process) { $process.startedAt } else { $null }
  uptimeSeconds = if ($process -and $process.startedAt) { [math]::Floor(((Get-Date)-[datetime]$process.startedAt).TotalSeconds) } else { $null }
  ancestorChain = @($ancestors | ForEach-Object { [ordered]@{pid=$_.pid;name=$_.name;parentPid=$_.parentPid} })
  commandLine = if ($process) { $process.commandLine } else { $null }
  localInspectionAvailable = $inspectionAvailable
  publicUrl = $publicUrl
  upstream = $upstream
  tunnelHealthy = $tunnelHealthy
  upstreamHealthy = $upstreamHealthy
  terminalIndependent = $terminalIndependent
  recoveryActive = [bool]($desiredState -eq "running")
  foreignProcessCount = $foreign.Count
  canonicalProcessCount = $canonical.Count
  lastRecoveryAttempt = if ($control) { $control.lastNgrokRecoveryAttemptAt } else { $null }
  lastRecoveryResult = if ($control) { $control.lastNgrokRecoveryOutcome } else { $null }
  consecutiveFailures = if ($control) { $control.consecutiveNgrokRecoveryFailures } else { $null }
}
if ($AsJson) { $result | ConvertTo-Json -Depth 8 } else { [pscustomobject]$result | Format-List }
