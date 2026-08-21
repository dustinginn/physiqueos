[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidateSet("Inspect", "Apply")][string]$Mode,
  [Parameter(Mandatory = $true)][string]$KitManifestPath,
  [Parameter()][switch]$AcknowledgeIsolatedVmwareGuest,
  [Parameter()][switch]$AcknowledgeWindowsUpdated,
  [Parameter()][switch]$AcknowledgeNoProductionCredentials,
  [Parameter()][switch]$AcknowledgeWorkPackage2NotAuthorized
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot "phase7bIsolatedGuestContract.psm1") -Force

$contract = Get-Phase7BIsolatedGuestContract
$nonce = [Guid]::NewGuid().ToString("N")
$observedAt = [DateTime]::UtcNow.ToString("o")
$reportDirectory = Join-Path $contract.isolatedRoot "reports"
$reportPath = Join-Path $reportDirectory "guest-bootstrap-$nonce.json"
$mutationStarted = $false

function Invoke-Phase7BNative {
  param([Parameter(Mandatory = $true)][string]$FilePath, [Parameter()][string[]]$Arguments = @())
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) { throw "PHASE7B_NATIVE_COMMAND_FAILED:$([IO.Path]::GetFileName($FilePath)):$LASTEXITCODE" }
}

function Get-Phase7BGuestIdentity {
  $computer = Get-CimInstance Win32_ComputerSystem -ErrorAction Stop
  $toolsService = Get-Service -Name VMTools -ErrorAction SilentlyContinue
  $toolsCandidates = @(
    "C:\Program Files\VMware\VMware Tools\VMwareToolboxCmd.exe",
    "C:\Program Files\VMware\VMware Tools\vmtoolsd.exe"
  )
  $toolsExecutable = @($toolsCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1)
  $hgfsClient = "C:\Program Files\VMware\VMware Tools\vmware-hgfsclient.exe"
  $sharedFolderNames = @()
  if (Test-Path -LiteralPath $hgfsClient -PathType Leaf) {
    $sharedFolderNames = @(& $hgfsClient 2>$null | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  }
  Test-Phase7BVmwareGuestIdentity `
    -Manufacturer ([string]$computer.Manufacturer) `
    -Model ([string]$computer.Model) `
    -ToolsServicePresent ([bool]$toolsService) `
    -ToolsExecutablePresent ($toolsExecutable.Count -eq 1) `
    -SharedFolderEnumerationAvailable (Test-Path -LiteralPath $hgfsClient -PathType Leaf) `
    -SharedFolderNames $sharedFolderNames
}

function Get-Phase7BKitValidation {
  $manifestResolved = (Resolve-Path -LiteralPath $KitManifestPath -ErrorAction Stop).Path
  $manifest = Get-Content -LiteralPath $manifestResolved -Raw | ConvertFrom-Json
  if ([int]$manifest.schemaVersion -ne 1) { throw "PHASE7B_KIT_SCHEMA_MISMATCH" }
  if ([string]$manifest.applicationCommit -ne $contract.applicationCommit) { throw "PHASE7B_KIT_APPLICATION_COMMIT_MISMATCH" }
  if ([string]$manifest.manifestDigest -ne $contract.manifestDigest) { throw "PHASE7B_KIT_IDENTITY_DIGEST_MISMATCH" }
  $kitRoot = Split-Path -Parent $manifestResolved
  $failures = New-Object System.Collections.Generic.List[string]
  foreach ($file in @($manifest.files)) {
    $candidate = Join-Path $kitRoot ([string]$file.relativePath)
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { $failures.Add([string]$file.relativePath); continue }
    if ((Get-Phase7BSha256 -LiteralPath $candidate) -ne ([string]$file.sha256).ToLowerInvariant()) { $failures.Add([string]$file.relativePath) }
  }
  [pscustomobject]@{
    pass = $failures.Count -eq 0
    toolingCommit = [string]$manifest.toolingCommit
    kitRoot = $kitRoot
    failures = @($failures)
  }
}

function Install-Phase7BPrerequisites {
  $winget = Get-Command winget.exe -ErrorAction SilentlyContinue
  if (-not $winget) { throw "PHASE7B_WINGET_REQUIRED" }
  if (-not (Test-Path -LiteralPath "C:\Program Files\Git\cmd\git.exe" -PathType Leaf)) {
    Invoke-Phase7BNative -FilePath $winget.Source -Arguments @("install", "--exact", "--id", "Git.Git", "--source", "winget", "--silent", "--accept-package-agreements", "--accept-source-agreements")
  }
  if (-not (Test-Path -LiteralPath "C:\Program Files\nodejs\node.exe" -PathType Leaf)) {
    Invoke-Phase7BNative -FilePath $winget.Source -Arguments @("install", "--exact", "--id", "OpenJS.NodeJS.LTS", "--source", "winget", "--silent", "--accept-package-agreements", "--accept-source-agreements")
  }
}

function Assert-Phase7BPrerequisites {
  $gitPath = "C:\Program Files\Git\cmd\git.exe"
  $nodePath = "C:\Program Files\nodejs\node.exe"
  $npmPath = "C:\Program Files\nodejs\npm.cmd"
  foreach ($path in @($gitPath, $nodePath, $npmPath)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "PHASE7B_PREREQUISITE_MISSING:$path" }
  }
  $nodeVersion = (& $nodePath --version).Trim()
  if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v24\.') { throw "PHASE7B_NODE_24_LTS_REQUIRED" }
  [pscustomobject]@{ gitPath = $gitPath; nodePath = $nodePath; npmPath = $npmPath; nodeVersion = $nodeVersion }
}

function Initialize-Phase7BRepository {
  param([Parameter(Mandatory = $true)]$Prerequisites)
  $parent = Split-Path -Parent $contract.repositoryRoot
  New-Item -ItemType Directory -Path $parent -Force | Out-Null
  if (-not (Test-Path -LiteralPath (Join-Path $contract.repositoryRoot ".git") -PathType Container)) {
    if (Test-Path -LiteralPath $contract.repositoryRoot) { throw "PHASE7B_REPOSITORY_PATH_NOT_EMPTY_OR_NOT_GIT" }
    Invoke-Phase7BNative -FilePath $Prerequisites.gitPath -Arguments @("clone", "--no-checkout", $contract.repositoryUrl, $contract.repositoryRoot)
  }
  Push-Location $contract.repositoryRoot
  try {
    $origin = (& $Prerequisites.gitPath remote get-url origin).Trim()
    if ($LASTEXITCODE -ne 0 -or $origin.TrimEnd('/') -ine $contract.repositoryUrl.TrimEnd('/')) { throw "PHASE7B_REPOSITORY_ORIGIN_MISMATCH" }
    Invoke-Phase7BNative -FilePath $Prerequisites.gitPath -Arguments @("fetch", "--no-tags", "origin", $contract.applicationCommit)
    Invoke-Phase7BNative -FilePath $Prerequisites.gitPath -Arguments @("checkout", "-B", $contract.applicationBranch, $contract.applicationCommit)
    $head = (& $Prerequisites.gitPath rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0 -or $head -ne $contract.applicationCommit) { throw "PHASE7B_APPLICATION_COMMIT_MISMATCH" }
    $dirtyBefore = @(& $Prerequisites.gitPath status --porcelain=v1 --untracked-files=all)
    if ($dirtyBefore.Count -gt 0) { throw "PHASE7B_APPLICATION_TREE_NOT_CLEAN_BEFORE_BUILD" }
    Invoke-Phase7BNative -FilePath $Prerequisites.npmPath -Arguments @("ci", "--ignore-scripts=false")
    Invoke-Phase7BNative -FilePath $Prerequisites.npmPath -Arguments @("run", "build")
    $headAfter = (& $Prerequisites.gitPath rev-parse HEAD).Trim()
    $dirtyAfter = @(& $Prerequisites.gitPath status --porcelain=v1 --untracked-files=all)
    if ($headAfter -ne $contract.applicationCommit -or $dirtyAfter.Count -gt 0) { throw "PHASE7B_APPLICATION_IDENTITY_CHANGED_BY_BUILD" }
  } finally { Pop-Location }
}

function New-Phase7BTaskXml {
  param(
    [string]$Description, [string]$Command, [string]$Arguments, [string]$WorkingDirectory,
    [string]$ExecutionTimeLimit, [string]$TriggerXml
  )
  $escapedUser = [Security.SecurityElement]::Escape("$env:USERDOMAIN\$env:USERNAME")
  $escapedDescription = [Security.SecurityElement]::Escape($Description)
  $escapedCommand = [Security.SecurityElement]::Escape($Command)
  $escapedArguments = [Security.SecurityElement]::Escape($Arguments)
  $escapedWorkingDirectory = [Security.SecurityElement]::Escape($WorkingDirectory)
  return @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>$escapedDescription</Description></RegistrationInfo>
  <Triggers>$TriggerXml</Triggers>
  <Principals><Principal id="Author"><UserId>$escapedUser</UserId><LogonType>S4U</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
  <Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><StartWhenAvailable>false</StartWhenAvailable><AllowStartOnDemand>true</AllowStartOnDemand><Enabled>false</Enabled><Hidden>true</Hidden><RunOnlyIfIdle>false</RunOnlyIfIdle><WakeToRun>false</WakeToRun><ExecutionTimeLimit>$ExecutionTimeLimit</ExecutionTimeLimit></Settings>
  <Actions Context="Author"><Exec><Command>$escapedCommand</Command><Arguments>$escapedArguments</Arguments><WorkingDirectory>$escapedWorkingDirectory</WorkingDirectory></Exec></Actions>
</Task>
"@
}

function Install-Phase7BInertTasks {
  $node = "C:\Program Files\nodejs\node.exe"
  $next = Join-Path $contract.repositoryRoot "node_modules\next\dist\bin\next"
  $powerShell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
  $monitor = Join-Path $contract.repositoryRoot "scripts\monitorPhysiqueOS.ps1"
  $ngrok = Join-Path $contract.ngrokRoot "ngrok.exe"
  New-Item -ItemType Directory -Path $contract.ngrokRoot -Force | Out-Null
  $user = [Security.SecurityElement]::Escape("$env:USERDOMAIN\$env:USERNAME")
  $logonTrigger = "<LogonTrigger><Enabled>true</Enabled><UserId>$user</UserId></LogonTrigger>"
  $monitorStart = (Get-Date).AddMinutes(1).ToString("yyyy-MM-ddTHH:mm:ss")
  $monitorTriggers = "$logonTrigger<TimeTrigger><StartBoundary>$monitorStart</StartBoundary><Enabled>true</Enabled><Repetition><Interval>PT1M</Interval><StopAtDurationEnd>false</StopAtDurationEnd></Repetition></TimeTrigger>"

  $definitions = @(
    [pscustomobject]@{ Name = $contract.productionTaskName; Xml = New-Phase7BTaskXml -Description "PhysiqueOS isolated production server; installed inert." -Command $node -Arguments "`"$next`" start --hostname 0.0.0.0 --port 3000" -WorkingDirectory $contract.repositoryRoot -ExecutionTimeLimit "PT0S" -TriggerXml $logonTrigger },
    [pscustomobject]@{ Name = $contract.monitorTaskName; Xml = New-Phase7BTaskXml -Description "PhysiqueOS isolated runtime monitor; installed inert." -Command $powerShell -Arguments "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$monitor`"" -WorkingDirectory $contract.repositoryRoot -ExecutionTimeLimit "PT30S" -TriggerXml $monitorTriggers },
    [pscustomobject]@{ Name = $contract.ngrokTaskName; Xml = New-Phase7BTaskXml -Description "PhysiqueOS isolated ngrok tunnel; placeholder installed inert." -Command $ngrok -Arguments "http 3000" -WorkingDirectory $contract.ngrokRoot -ExecutionTimeLimit "PT0S" -TriggerXml "" }
  )
  foreach ($definition in $definitions) {
    Register-ScheduledTask -TaskName $definition.Name -Xml $definition.Xml -Force | Out-Null
    Disable-ScheduledTask -TaskName $definition.Name | Out-Null
  }
}

function Get-Phase7BTaskProjections {
  $projections = New-Object System.Collections.Generic.List[object]
  foreach ($name in @($contract.productionTaskName, $contract.monitorTaskName, $contract.ngrokTaskName)) {
    $task = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
    if (-not $task) { continue }
    $action = @($task.Actions)[0]
    $principal = $task.Principal
    $triggers = @($task.Triggers)
    $projections.Add((Get-Phase7BSafeTaskProjection -TaskName $name -Execute ([string]$action.Execute) -Arguments ([string]$action.Arguments) -WorkingDirectory ([string]$action.WorkingDirectory) -LogonType ([string]$principal.LogonType) -RunLevel ([string]$principal.RunLevel) -MultipleInstances ([string]$task.Settings.MultipleInstances) -ExecutionTimeLimit ([string]$task.Settings.ExecutionTimeLimit) -Enabled ([bool]$task.Settings.Enabled) -TriggerTypes @($triggers | ForEach-Object { [string]$_.CimClass.CimClassName }) -RepetitionIntervals @($triggers | ForEach-Object { if ($_.Repetition) { [string]$_.Repetition.Interval } } | Where-Object { $_ })))
  }
  return @($projections)
}

function Write-Phase7BStoppedControls {
  $logs = Join-Path $contract.repositoryRoot "logs"
  New-Item -ItemType Directory -Path $logs -Force | Out-Null
  [ordered]@{ schemaVersion = 1; desiredState = "stopped"; changedAt = [DateTime]::UtcNow.ToString("o"); changedBy = "phase7b-isolated-guest-bootstrap"; reason = "checkpoint9-inert-before-restore" } |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $logs "physiqueos-runtime-control.json") -Encoding UTF8
  [ordered]@{ schemaVersion = 1; ngrokDesiredState = "stopped"; changedAt = [DateTime]::UtcNow.ToString("o"); changedBy = "phase7b-isolated-guest-bootstrap"; reason = "checkpoint9-inert-before-routing-authorization" } |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $logs "physiqueos-ngrok-control.json") -Encoding UTF8
}

try {
  if ($env:USERNAME -ine "dusti") { throw "PHASE7B_GUEST_ACCOUNT_MUST_BE_DUSTI" }
  $identity = Get-Phase7BGuestIdentity
  if (-not $identity.pass) { throw $identity.classification }
  $kit = Get-Phase7BKitValidation
  if (-not $kit.pass) { throw "PHASE7B_KIT_INTEGRITY_FAIL" }
  $pathContract = Test-Phase7BGuestPathContract -RepositoryRoot $contract.repositoryRoot -IsolatedRoot $contract.isolatedRoot -Contract $contract
  if (-not $pathContract.pass) { throw $pathContract.classification }

  if ($Mode -eq "Apply") {
    $currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentIdentity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw "PHASE7B_ADMINISTRATOR_REQUIRED" }
    if (-not ($AcknowledgeIsolatedVmwareGuest -and $AcknowledgeWindowsUpdated -and $AcknowledgeNoProductionCredentials -and $AcknowledgeWorkPackage2NotAuthorized)) {
      throw "PHASE7B_ALL_BOOTSTRAP_ACKNOWLEDGEMENTS_REQUIRED"
    }
    $mutationStarted = $true
    New-Item -ItemType Directory -Path @(
      (Join-Path $contract.isolatedRoot "incoming"),
      (Join-Path $contract.isolatedRoot "restore\canonical"),
      $reportDirectory
    ) -Force | Out-Null
    Install-Phase7BPrerequisites
    $prerequisites = Assert-Phase7BPrerequisites
    Initialize-Phase7BRepository -Prerequisites $prerequisites
    $credentialSignals = @(Find-Phase7BForbiddenCredentialSignals -RepositoryRoot $contract.repositoryRoot)
    $sensitiveVariableNames = @("DATABASE_URL", "DIRECT_URL", "DIGITALOCEAN_ACCESS_TOKEN", "DIGITALOCEAN_TOKEN", "NGROK_AUTHTOKEN", "SPACES_ACCESS_KEY_ID", "SPACES_SECRET_ACCESS_KEY")
    $presentSensitiveNames = @($sensitiveVariableNames | Where-Object { [Environment]::GetEnvironmentVariable($_) })
    if ($credentialSignals.Count -gt 0 -or $presentSensitiveNames.Count -gt 0) { throw "PHASE7B_PRODUCTION_CREDENTIAL_SIGNAL_PRESENT" }
    Write-Phase7BStoppedControls
    Install-Phase7BInertTasks
    [ordered]@{
      schemaVersion = 1; windowsHostId = $contract.windowsHostId; windowsRuntimeId = $contract.windowsRuntimeId
      applicationCommit = $contract.applicationCommit; manifestDigest = $contract.manifestDigest; createdAt = [DateTime]::UtcNow.ToString("o")
    } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $contract.isolatedRoot "guest-identity-marker.json") -Encoding UTF8
  }

  $prerequisiteState = $null
  try { $prerequisiteState = Assert-Phase7BPrerequisites } catch { $prerequisiteState = $null }
  $repoPresent = Test-Path -LiteralPath (Join-Path $contract.repositoryRoot ".git") -PathType Container
  $head = $null
  $treeClean = $false
  if ($repoPresent -and $prerequisiteState) {
    Push-Location $contract.repositoryRoot
    try {
      $head = (& $prerequisiteState.gitPath rev-parse HEAD 2>$null).Trim()
      $treeClean = @(& $prerequisiteState.gitPath status --porcelain=v1 --untracked-files=all 2>$null).Count -eq 0
    } finally { Pop-Location }
  }
  $taskProjections = @(Get-Phase7BTaskProjections)
  $taskSet = Test-Phase7BInertTaskSet -TaskProjections $taskProjections -Contract $contract
  $credentialSignalsFinal = if ($repoPresent) { @(Find-Phase7BForbiddenCredentialSignals -RepositoryRoot $contract.repositoryRoot) } else { @() }
  $port3000 = @(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue)
  $cadenceProcesses = @(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object {
    $commandLine = [string]$_.CommandLine
    ($_.Name -eq "ngrok.exe" -and $commandLine -match '(?i)\bhttp\s+3000\b') -or
    ($_.Name -eq "node.exe" -and $commandLine -match '(?i)physiqueos.*(?:next|runBriefingCadence)') -or
    ($_.Name -in @("powershell.exe", "pwsh.exe") -and $commandLine -match '(?i)monitorPhysiqueOS\.ps1')
  } | ForEach-Object { [pscustomobject]@{ name = $_.Name; pid = [int]$_.ProcessId } })
  $markerPresent = Test-Path -LiteralPath (Join-Path $contract.isolatedRoot "guest-identity-marker.json") -PathType Leaf
  $applyPass = $identity.pass -and $kit.pass -and $repoPresent -and $head -eq $contract.applicationCommit -and $treeClean -and $taskSet.pass -and $credentialSignalsFinal.Count -eq 0 -and $port3000.Count -eq 0 -and $cadenceProcesses.Count -eq 0 -and $markerPresent
  $inspectPass = $identity.pass -and $kit.pass
  $pass = if ($Mode -eq "Apply") { $applyPass } else { $inspectPass }
  if (-not (Test-Path -LiteralPath $reportDirectory -PathType Container)) {
    $reportDirectory = Split-Path -Parent (Resolve-Path -LiteralPath $KitManifestPath).Path
    $reportPath = Join-Path $reportDirectory "guest-bootstrap-inspect-$nonce.json"
  }
  $report = [ordered]@{
    schemaVersion = 1
    nonce = $nonce
    observedAt = $observedAt
    mode = $Mode
    pass = $pass
    classification = if ($pass) { if ($Mode -eq "Apply") { "PHASE7B_VMWARE_GUEST_BOOTSTRAP_PASS_INERT" } else { "PHASE7B_VMWARE_GUEST_INSPECTION_PASS" } } else { "PHASE7B_VMWARE_GUEST_BOOTSTRAP_FAIL" }
    mutationStarted = $mutationStarted
    applicationCommit = $contract.applicationCommit
    toolingCommit = $kit.toolingCommit
    manifestDigest = $contract.manifestDigest
    environmentId = $contract.environmentId
    windowsHostId = $contract.windowsHostId
    windowsRuntimeId = $contract.windowsRuntimeId
    guestIdentity = $identity
    kitIntegrityPass = $kit.pass
    repository = [ordered]@{ present = $repoPresent; head = $head; clean = $treeClean }
    tasks = [ordered]@{ pass = $taskSet.pass; projections = $taskProjections }
    runtime = [ordered]@{ classification = if ($port3000.Count -eq 0) { "NOT_RUNNING_EXPECTED" } else { "UNEXPECTED_PORT_3000_LISTENER" }; listenerCount = $port3000.Count; physiqueOsProcessCount = $cadenceProcesses.Count }
    credentials = [ordered]@{ pass = $credentialSignalsFinal.Count -eq 0; signalCount = $credentialSignalsFinal.Count; signalPaths = @($credentialSignalsFinal | ForEach-Object { $_.relativePath }) }
    ngrok = [ordered]@{ classification = "NOT_PROVISIONED_EXPECTED"; taskEnabled = [bool](@($taskProjections | Where-Object { $_.taskName -eq $contract.ngrokTaskName -and $_.enabled }).Count -gt 0) }
    workPackage2 = [ordered]@{ authorized = $false; classification = "PREPARED_INTERFACE_ONLY" }
  }
  $json = $report | ConvertTo-Json -Depth 12
  $json | Set-Content -LiteralPath $reportPath -Encoding UTF8
  $json
  if (-not $pass) { exit 1 }
} catch {
  $safeCode = if ([string]$_.Exception.Message -match '^PHASE7B_[A-Z0-9_:.-]+$') { [string]$_.Exception.Message } else { "PHASE7B_GUEST_BOOTSTRAP_EXCEPTION" }
  [ordered]@{
    schemaVersion = 1; nonce = $nonce; observedAt = $observedAt; mode = $Mode; pass = $false
    classification = "PHASE7B_VMWARE_GUEST_BOOTSTRAP_FAIL"; safeErrorCode = $safeCode; mutationStarted = $mutationStarted
  } | ConvertTo-Json -Compress
  exit 1
}
