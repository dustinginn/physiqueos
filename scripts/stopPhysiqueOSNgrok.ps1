[CmdletBinding()]
param([int]$MonitorIntervalSeconds = 65)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$taskName = "PhysiqueOS Ngrok Tunnel"
$ngrokPath = "C:\Users\dusti\AppData\Local\ngrok\ngrok.exe"
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

$before = & $statusScript -AsJson | ConvertFrom-Json
if ($before.foreignProcessCount -gt 0) { throw "A foreign ngrok process exists; no process was changed." }
if ($before.canonicalProcessCount -gt 1) { throw "Duplicate canonical ngrok processes exist; no process was changed." }
$state = [ordered]@{
  schemaVersion = 1; ngrokDesiredState = "stopped"; ngrokChangedAt = (Get-Date).ToString("o")
  ngrokChangedBy = "$env:USERNAME/stopPhysiqueOSNgrok.ps1"; lastNgrokRecoveryAttemptAt = $before.lastRecoveryAttempt
  lastNgrokRecoveryOutcome = "intentional_stop"; consecutiveNgrokRecoveryFailures = 0
  lastHealthyPublicUrl = $before.publicUrl; lastHealthyTunnelAt = $null
}
Write-Control $state
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($task -and $before.canonicalProcessCount -eq 1) { Stop-ScheduledTask -TaskName $taskName }
$deadline = (Get-Date).AddSeconds(20)
do {
  Start-Sleep -Milliseconds 500
  $status = & $statusScript -AsJson | ConvertFrom-Json
  if ($status.canonicalProcessCount -eq 0) { break }
} while ((Get-Date) -lt $deadline)
if ($status.canonicalProcessCount -ne 0) { throw "The canonical scheduled task did not stop its ngrok process." }
Start-Sleep -Seconds $MonitorIntervalSeconds
$final = & $statusScript -AsJson | ConvertFrom-Json
if ($final.canonicalProcessCount -ne 0) { throw "Intentional ngrok stop did not remain stopped." }
$final | ConvertTo-Json -Depth 8
