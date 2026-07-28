[CmdletBinding()]
param([int]$TimeoutSeconds = 45)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$started = Get-Date
$taskName = "PhysiqueOS Ngrok Tunnel"
$ngrokPath = "C:\Users\dusti\AppData\Local\ngrok\ngrok.exe"
$workingDirectory = "C:\Users\dusti\AppData\Local\ngrok"
$configPath = Join-Path $workingDirectory "ngrok.yml"
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$logsDirectory = Join-Path $repositoryRoot "logs"
$controlPath = Join-Path $logsDirectory "physiqueos-ngrok-control.json"
$statusScript = Join-Path $PSScriptRoot "statusPhysiqueOSNgrok.ps1"

function Write-Control($State) {
  New-Item -ItemType Directory -Path $logsDirectory -Force | Out-Null
  $temporary = "$controlPath.$PID.tmp"
  $State | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $temporary -Encoding utf8
  Move-Item -LiteralPath $temporary -Destination $controlPath -Force
}

if (-not (Test-Path -LiteralPath $ngrokPath -PathType Leaf)) { throw "Canonical ngrok executable is missing." }
if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) { throw "Canonical ngrok configuration is missing." }
& $ngrokPath config check *> $null
if ($LASTEXITCODE -ne 0) { throw "Canonical ngrok configuration is invalid." }
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if (-not $task -or $task.Actions.Count -ne 1 -or $task.Actions[0].Execute -ne $ngrokPath -or
  $task.Actions[0].Arguments -ne "http 3000" -or $task.Actions[0].WorkingDirectory -ne $workingDirectory) {
  throw "Canonical ngrok task is missing or invalid."
}
try {
  $health = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:3000/api/health" -TimeoutSec 5
  if ($health.StatusCode -ne 200) { throw "HTTP $($health.StatusCode)" }
} catch { throw "PhysiqueOS upstream is unavailable; ngrok was not started." }
$before = & $statusScript -AsJson | ConvertFrom-Json
if ($before.foreignProcessCount -gt 0) { throw "A foreign ngrok process exists; no process was changed." }
if ($before.canonicalProcessCount -gt 1) { throw "Duplicate canonical ngrok processes exist; no process was changed." }
$state = [ordered]@{
  schemaVersion = 1; ngrokDesiredState = "running"; ngrokChangedAt = (Get-Date).ToString("o")
  ngrokChangedBy = "$env:USERNAME/startPhysiqueOSNgrok.ps1"; lastNgrokRecoveryAttemptAt = $null
  lastNgrokRecoveryOutcome = "explicit_start"; consecutiveNgrokRecoveryFailures = 0
  lastHealthyPublicUrl = $before.publicUrl; lastHealthyTunnelAt = $null
}
Write-Control $state
if ($before.overallState -ne "healthy") { Start-ScheduledTask -TaskName $taskName }
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
do {
  Start-Sleep -Milliseconds 750
  $status = & $statusScript -AsJson | ConvertFrom-Json
  if ($status.overallState -eq "healthy") {
    $state.lastNgrokRecoveryOutcome = "healthy"
    $state.lastHealthyPublicUrl = $status.publicUrl
    $state.lastHealthyTunnelAt = (Get-Date).ToString("o")
    Write-Control $state
    $status | Add-Member -NotePropertyName elapsedSeconds -NotePropertyValue ([math]::Round(((Get-Date)-$started).TotalSeconds,2))
    $status | ConvertTo-Json -Depth 8
    exit 0
  }
  if ($status.foreignProcessCount -gt 0 -or $status.canonicalProcessCount -gt 1) { throw "Ngrok process conflict detected during startup." }
} while ((Get-Date) -lt $deadline)
throw "Canonical ngrok tunnel did not become healthy within $TimeoutSeconds seconds."
