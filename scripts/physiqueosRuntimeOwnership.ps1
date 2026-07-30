Set-StrictMode -Version Latest

$script:PhysiqueOSLaunchToleranceMilliseconds = 5000
$script:PhysiqueOSForbiddenAncestors = @(
  "powershell.exe",
  "pwsh.exe",
  "cmd.exe",
  "windowsterminal.exe",
  "code.exe",
  "npm.exe",
  "npm.cmd",
  "npx.exe",
  "npx.cmd"
)

function Get-PhysiqueOSProperty($Value, [string]$Name) {
  if ($null -eq $Value) { return $null }
  $property = $Value.PSObject.Properties[$Name]
  if ($property) { return $property.Value }
  return $null
}

function Normalize-PhysiqueOSPath([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return $null }
  return $Value.Trim().Trim('"').Replace("/", "\").TrimEnd("\").ToLowerInvariant()
}

function Test-PhysiqueOSTaskArguments(
  [string]$Observed,
  [string]$ExpectedNextPath
) {
  if ([string]::IsNullOrWhiteSpace($Observed)) { return $false }
  $match = [regex]::Match(
    $Observed,
    '^\s*(?:"(?<path>[^"]+)"|(?<path>\S+))\s+start\s+--hostname\s+0\.0\.0\.0\s+--port\s+3000\s*$',
    [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
  )
  if (-not $match.Success) { return $false }
  return (Normalize-PhysiqueOSPath $match.Groups["path"].Value) -eq
    (Normalize-PhysiqueOSPath $ExpectedNextPath)
}

function Test-PhysiqueOSCommandLine(
  [string]$CommandLine,
  [string]$ExpectedNextPath
) {
  if ([string]::IsNullOrWhiteSpace($CommandLine)) { return $false }
  $escapedNextPath = [regex]::Escape((Normalize-PhysiqueOSPath $ExpectedNextPath))
  $normalized = $CommandLine.Replace("/", "\").ToLowerInvariant()
  return [regex]::IsMatch(
    $normalized,
    "(?:^|\s|`")$escapedNextPath(?:`"|\s)+start\s+--hostname\s+0\.0\.0\.0\s+--port\s+3000(?:\s|$)"
  )
}

function Get-PhysiqueOSTaskQueryResult([string]$TaskName) {
  try {
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
    if (-not $task) {
      return [pscustomobject]@{ status = "not_found"; task = $null; error = $null }
    }
    return [pscustomobject]@{ status = "readable"; task = $task; error = $null }
  } catch {
    $message = $_.Exception.Message
    $accessDenied = $_.Exception.HResult -eq -2147217405 -or
      $message -match "(?i)access\s+is\s+denied|access\s+denied|unauthorized"
    $notFound = $message -match "(?i)not\s+found|no\s+matching|cannot\s+find"
    return [pscustomobject]@{
      status = if ($accessDenied) { "access_denied" } elseif ($notFound) { "not_found" } else { "query_failed" }
      task = $null
      error = $message
    }
  }
}

function Get-PhysiqueOSRuntimeOwnershipDecision {
  [CmdletBinding()]
  param(
    [string]$TaskQueryStatus,
    $Task,
    $TaskInfo,
    [array]$Listeners,
    $Process,
    [array]$Ancestors,
    [bool]$HealthOk,
    [string]$ExpectedNodePath,
    [string]$ExpectedNextPath,
    [string]$ExpectedRepositoryRoot
  )

  $actions = @()
  if ($Task) { $actions = @($Task.Actions) }
  $action = if ($actions.Count -eq 1) { $actions[0] } else { $null }
  $taskDefinitionMatches = [bool](
    $TaskQueryStatus -eq "readable" -and
    $actions.Count -eq 1 -and
    (Normalize-PhysiqueOSPath (Get-PhysiqueOSProperty $action "Execute")) -eq
      (Normalize-PhysiqueOSPath $ExpectedNodePath) -and
    (Test-PhysiqueOSTaskArguments `
      -Observed (Get-PhysiqueOSProperty $action "Arguments") `
      -ExpectedNextPath $ExpectedNextPath) -and
    (Normalize-PhysiqueOSPath (Get-PhysiqueOSProperty $action "WorkingDirectory")) -eq
      (Normalize-PhysiqueOSPath $ExpectedRepositoryRoot)
  )
  $taskState = [string](Get-PhysiqueOSProperty $Task "State")
  $taskStateMatches = $taskState -eq "Running"
  $ancestorRecords = @($Ancestors)

  $listenerPids = @(
    $Listeners |
      ForEach-Object { [int](Get-PhysiqueOSProperty $_ "pid") } |
      Where-Object { $_ -gt 0 } |
      Sort-Object -Unique
  )
  $listenerCountMatches = $listenerPids.Count -eq 1
  $listenerPidMatches = [bool](
    $listenerCountMatches -and
    $Process -and
    [int](Get-PhysiqueOSProperty $Process "pid") -eq $listenerPids[0]
  )
  $processNameMatches = [string](Get-PhysiqueOSProperty $Process "name") -eq "node.exe"
  $sessionMatches = [bool](
    $Process -and
    $null -ne (Get-PhysiqueOSProperty $Process "sessionId") -and
    [int](Get-PhysiqueOSProperty $Process "sessionId") -eq 0
  )

  $parent = if ($ancestorRecords.Count -ge 2) { $ancestorRecords[1] } else { $null }
  $grandparent = if ($ancestorRecords.Count -ge 3) { $ancestorRecords[2] } else { $null }
  $ancestryMatches = [bool](
    $Process -and
    $parent -and
    $grandparent -and
    [int](Get-PhysiqueOSProperty $Process "parentPid") -eq [int](Get-PhysiqueOSProperty $parent "pid") -and
    [string](Get-PhysiqueOSProperty $parent "name") -eq "svchost.exe" -and
    [int](Get-PhysiqueOSProperty $parent "sessionId") -eq 0 -and
    [int](Get-PhysiqueOSProperty $parent "parentPid") -eq [int](Get-PhysiqueOSProperty $grandparent "pid") -and
    [string](Get-PhysiqueOSProperty $grandparent "name") -eq "services.exe" -and
    [int](Get-PhysiqueOSProperty $grandparent "sessionId") -eq 0
  )
  $forbiddenAncestor = @(
    $ancestorRecords |
      Select-Object -Skip 1 |
      Where-Object {
        $script:PhysiqueOSForbiddenAncestors -contains
          ([string](Get-PhysiqueOSProperty $_ "name")).ToLowerInvariant()
      }
  ).Count -gt 0

  $commandLine = [string](Get-PhysiqueOSProperty $Process "commandLine")
  $commandLineAvailable = -not [string]::IsNullOrWhiteSpace($commandLine)
  $commandLineMatches = [bool](
    $commandLineAvailable -and
    (Test-PhysiqueOSCommandLine $commandLine $ExpectedNextPath)
  )

  $processStartedAt = Get-PhysiqueOSProperty $Process "startedAt"
  if (-not $processStartedAt) {
    $processStartedAt = Get-PhysiqueOSProperty $Process "CreationDate"
  }
  $taskLastRunTime = Get-PhysiqueOSProperty $TaskInfo "LastRunTime"
  $launchTimeDifferenceMilliseconds = $null
  if ($processStartedAt -and $taskLastRunTime) {
    try {
      $launchTimeDifferenceMilliseconds = [math]::Round(
        [math]::Abs(
          (([datetime]$processStartedAt) - ([datetime]$taskLastRunTime)).TotalMilliseconds
        )
      )
    } catch {
      $launchTimeDifferenceMilliseconds = $null
    }
  }
  # Task Scheduler timestamps have one-second resolution, so five seconds allows
  # normal dispatch latency without creating a broad ownership window.
  $launchTimeMatches = $null -ne $launchTimeDifferenceMilliseconds -and
    $launchTimeDifferenceMilliseconds -le $script:PhysiqueOSLaunchToleranceMilliseconds

  $healthMatches = [bool]$HealthOk
  $s4uFallbackEligible = [bool](
    -not $commandLineAvailable -and
    $TaskQueryStatus -eq "readable" -and
    $taskDefinitionMatches -and
    $taskStateMatches -and
    $listenerCountMatches -and
    $listenerPidMatches -and
    $processNameMatches -and
    $sessionMatches -and
    $ancestryMatches -and
    -not $forbiddenAncestor -and
    $launchTimeMatches -and
    $healthMatches
  )

  $visibleCommandCanonical = [bool](
    $commandLineAvailable -and
    $commandLineMatches -and
    $taskDefinitionMatches -and
    $listenerCountMatches -and
    $listenerPidMatches -and
    $processNameMatches -and
    -not $forbiddenAncestor
  )
  $ownershipDecision = if ($visibleCommandCanonical -or $s4uFallbackEligible) {
    "canonical"
  } else {
    "foreign"
  }
  $ownershipReason = if ($visibleCommandCanonical) {
    "command_line_match"
  } elseif ($s4uFallbackEligible) {
    "s4u_strict_fallback"
  } elseif ($TaskQueryStatus -eq "access_denied") {
    "task_access_denied"
  } elseif ($TaskQueryStatus -eq "not_found") {
    "task_not_found"
  } elseif ($TaskQueryStatus -ne "readable") {
    "task_query_failed"
  } elseif ($commandLineAvailable -and -not $commandLineMatches) {
    "command_line_mismatch"
  } elseif (-not $taskDefinitionMatches) {
    "task_definition_mismatch"
  } elseif (-not $listenerCountMatches) {
    "listener_ownership_ambiguous"
  } elseif (-not $processNameMatches) {
    "process_name_mismatch"
  } elseif (-not $sessionMatches) {
    "session_mismatch"
  } elseif (-not $ancestryMatches -or $forbiddenAncestor) {
    "ancestry_mismatch"
  } elseif (-not $taskStateMatches) {
    "task_state_mismatch"
  } elseif (-not $launchTimeMatches) {
    "launch_time_mismatch"
  } elseif (-not $healthMatches) {
    "health_check_failed"
  } else {
    "insufficient_ownership_evidence"
  }

  return [ordered]@{
    commandLineAvailable = $commandLineAvailable
    commandLineMatches = $commandLineMatches
    s4uFallbackEligible = $s4uFallbackEligible
    taskDefinitionMatches = $taskDefinitionMatches
    taskStateMatches = $taskStateMatches
    processNameMatches = $processNameMatches
    sessionMatches = $sessionMatches
    ancestryMatches = $ancestryMatches
    forbiddenAncestor = $forbiddenAncestor
    listenerCountMatches = $listenerCountMatches
    listenerPidMatches = $listenerPidMatches
    launchTimeMatches = $launchTimeMatches
    launchTimeDifferenceMilliseconds = $launchTimeDifferenceMilliseconds
    launchTimeToleranceMilliseconds = $script:PhysiqueOSLaunchToleranceMilliseconds
    healthMatches = $healthMatches
    ownershipDecision = $ownershipDecision
    ownershipReason = $ownershipReason
    taskQueryStatus = $TaskQueryStatus
  }
}

function Get-PhysiqueOSRuntimeOverallState {
  [CmdletBinding()]
  param(
    [string]$TaskQueryStatus,
    [string]$MonitorTaskQueryStatus,
    [bool]$TaskDefinitionMatches,
    [bool]$MonitorDefinitionMatches,
    [bool]$ControlValid,
    [bool]$ListenerPresent,
    [bool]$CanonicalOwnership,
    [string]$DesiredState,
    [string]$TaskState,
    [bool]$ForbiddenAncestor,
    [bool]$HealthOk,
    [string]$LastRecoveryOutcome,
    [int]$ConsecutiveRecoveryFailures
  )

  if ($TaskQueryStatus -eq "access_denied" -or $MonitorTaskQueryStatus -eq "access_denied") {
    return "task_access_denied"
  }
  if ($TaskQueryStatus -eq "query_failed" -or $MonitorTaskQueryStatus -eq "query_failed") {
    return "task_query_failed"
  }
  if (-not $TaskDefinitionMatches -or -not $MonitorDefinitionMatches -or -not $ControlValid) {
    return "task_invalid"
  }
  if ($ListenerPresent -and -not $CanonicalOwnership) { return "foreign_listener" }
  if ($CanonicalOwnership -and $DesiredState -eq "stopped") {
    return "control_state_mismatch"
  }
  if ($ListenerPresent -and (
    $TaskState -ne "Running" -or
    -not $TaskDefinitionMatches -or
    $ForbiddenAncestor
  )) {
    return "task_process_mismatch"
  }
  if ($DesiredState -eq "stopped" -and -not $ListenerPresent) {
    return "intentionally_stopped"
  }
  if ($LastRecoveryOutcome -eq "recovery_failed" -or $ConsecutiveRecoveryFailures -ge 3) {
    return "recovery_failed"
  }
  if ($ListenerPresent -and $HealthOk -and $TaskState -eq "Running") {
    return "healthy"
  }
  if (-not $ListenerPresent -and $LastRecoveryOutcome -eq "recovery_invoked") {
    return "recovering"
  }
  if ($TaskState -eq "Running" -and -not $ListenerPresent) { return "starting" }
  if (-not $ListenerPresent -and $DesiredState -eq "running") {
    return "recovery_pending"
  }
  return "unhealthy"
}
