[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$KitManifestPath,
  [Parameter(Mandatory = $true)][switch]$AcknowledgeReportOnlyReconciliation,
  [Parameter(Mandatory = $true)][switch]$AcknowledgeNoPreparationMutation,
  [Parameter(Mandatory = $true)][switch]$AcknowledgeWorkPackage2NotAuthorized
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$stage = "initialize"
$reportWriteMayHaveStarted = $false

try {
  $kitRoot = Split-Path -Parent (Resolve-Path -LiteralPath $KitManifestPath -ErrorAction Stop).Path
  $contractModulePath = Join-Path $kitRoot "phase7bIsolatedGuestContract.psm1"
  $reconciliationModulePath = Join-Path $kitRoot "phase7bIsolatedGuestReconciliation.psm1"
  foreach ($requiredModule in @($contractModulePath, $reconciliationModulePath)) {
    if (-not (Test-Path -LiteralPath $requiredModule -PathType Leaf)) { throw "PHASE7B_RECONCILIATION_REQUIRED_MODULE_MISSING" }
  }
  Import-Module $contractModulePath -Force
  Import-Module $reconciliationModulePath -Force
  $contract = Get-Phase7BIsolatedGuestContract

  $stage = "authorization-boundary"
  if (-not ($AcknowledgeReportOnlyReconciliation -and $AcknowledgeNoPreparationMutation -and $AcknowledgeWorkPackage2NotAuthorized)) {
    throw "PHASE7B_RECONCILIATION_ACKNOWLEDGEMENTS_REQUIRED"
  }
  $currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $currentPrincipal = New-Object Security.Principal.WindowsPrincipal($currentIdentity)
  $administrator = $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $administrator) { throw "PHASE7B_RECONCILIATION_ADMINISTRATOR_REQUIRED" }

  $stage = "kit-integrity"
  $manifest = Get-Content -LiteralPath $KitManifestPath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
  if ([int]$manifest.schemaVersion -ne 1) { throw "PHASE7B_RECONCILIATION_KIT_SCHEMA_MISMATCH" }
  if ([string]$manifest.applicationCommit -ne [string]$contract.applicationCommit) { throw "PHASE7B_RECONCILIATION_APPLICATION_COMMIT_MISMATCH" }
  if ([string]$manifest.bootstrapToolingCommit -ne "be86ec20394fff9760134b583d6f3c949ea95673") { throw "PHASE7B_RECONCILIATION_BOOTSTRAP_TOOLING_COMMIT_MISMATCH" }
  if ([string]$manifest.reconciliationToolingCommit -notmatch '^[0-9a-f]{40}$') { throw "PHASE7B_RECONCILIATION_TOOLING_COMMIT_INVALID" }
  if ([string]$manifest.manifestDigest -ne [string]$contract.manifestDigest) { throw "PHASE7B_RECONCILIATION_MANIFEST_DIGEST_MISMATCH" }
  if ([bool]$manifest.productionCredentialsIncluded) { throw "PHASE7B_RECONCILIATION_KIT_CREDENTIAL_AUTHORITY_FORBIDDEN" }
  if ([bool]$manifest.workPackage2Authorized) { throw "PHASE7B_RECONCILIATION_KIT_WP2_AUTHORITY_FORBIDDEN" }
  if ([bool]$manifest.attempt5Authorized) { throw "PHASE7B_RECONCILIATION_KIT_ATTEMPT5_AUTHORITY_FORBIDDEN" }
  $expectedFiles = @("phase7bIsolatedGuestContract.psm1", "phase7bIsolatedGuestReconciliation.psm1", "phase7bReconcileIsolatedGuestReport.ps1") | Sort-Object
  $manifestFiles = @($manifest.files)
  $actualFiles = @($manifestFiles | ForEach-Object { [string]$_.relativePath }) | Sort-Object
  if ($manifestFiles.Count -ne 3 -or @(Compare-Object -ReferenceObject $expectedFiles -DifferenceObject $actualFiles).Count -ne 0) {
    throw "PHASE7B_RECONCILIATION_KIT_FILE_SET_MISMATCH"
  }
  foreach ($file in $manifestFiles) {
    $relativePath = [string]$file.relativePath
    if ([IO.Path]::IsPathRooted($relativePath) -or $relativePath -match '(?:^|[\\/])\.\.(?:[\\/]|$)') { throw "PHASE7B_RECONCILIATION_UNSAFE_KIT_PATH" }
    $candidate = Join-Path $kitRoot $relativePath
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { throw "PHASE7B_RECONCILIATION_KIT_FILE_MISSING" }
    if ((Get-Phase7BSha256 -LiteralPath $candidate) -ne ([string]$file.sha256).ToLowerInvariant()) { throw "PHASE7B_RECONCILIATION_KIT_HASH_MISMATCH" }
  }

  $stage = "guest-identity"
  if ($env:USERNAME -ine "dusti") { throw "PHASE7B_RECONCILIATION_GUEST_ACCOUNT_MISMATCH" }
  $computer = Get-CimInstance Win32_ComputerSystem -ErrorAction Stop
  $toolsService = Get-Service -Name VMTools -ErrorAction SilentlyContinue
  $toolsCandidates = @(
    "C:\Program Files\VMware\VMware Tools\VMwareToolboxCmd.exe",
    "C:\Program Files\VMware\VMware Tools\vmtoolsd.exe"
  )
  $toolsExecutable = @($toolsCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1)
  $hgfsClient = "C:\Program Files\VMware\VMware Tools\VMwareHgfsClient.exe"
  $sharedFolderNames = @()
  $sharedFolderEnumerationExitCode = -1
  if (Test-Path -LiteralPath $hgfsClient -PathType Leaf) {
    $sharedFolderNames = @(& $hgfsClient 2>$null | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    if ($null -ne $LASTEXITCODE) { $sharedFolderEnumerationExitCode = [int]$LASTEXITCODE }
  }
  $vmhgfsDriver = Get-CimInstance Win32_SystemDriver -Filter "Name='vmhgfs'" -ErrorAction Stop
  $mappedHgfsDisks = @(Get-CimInstance Win32_LogicalDisk -ErrorAction Stop | Where-Object { [string]$_.ProviderName -match '(?i)(vmware-host|\\\.host|hgfs)' })
  $mappedHgfsConnections = @(Get-CimInstance Win32_NetworkConnection -ErrorAction Stop | Where-Object { [string]$_.RemoteName -match '(?i)(vmware-host|\\\.host|hgfs)' })
  $guestIdentity = Test-Phase7BVmwareGuestIdentity `
    -Manufacturer ([string]$computer.Manufacturer) `
    -Model ([string]$computer.Model) `
    -ToolsServicePresent ([bool]$toolsService) `
    -ToolsServiceRunning ([bool]($toolsService -and [string]$toolsService.Status -eq "Running")) `
    -ToolsExecutablePresent ($toolsExecutable.Count -eq 1) `
    -SharedFolderEnumerationAvailable (Test-Path -LiteralPath $hgfsClient -PathType Leaf) `
    -SharedFolderEnumerationExitCode $sharedFolderEnumerationExitCode `
    -SharedFolderNames $sharedFolderNames `
    -HgfsDriverPresent ([bool]$vmhgfsDriver) `
    -HgfsDriverRunning ([bool]($vmhgfsDriver -and [string]$vmhgfsDriver.State -eq "Running")) `
    -MappedHgfsDiskCount $mappedHgfsDisks.Count `
    -MappedHgfsConnectionCount $mappedHgfsConnections.Count

  $stage = "tool-state"
  $gitPath = "C:\Program Files\Git\cmd\git.exe"
  $nodePath = "C:\Program Files\nodejs\node.exe"
  $npmPath = "C:\Program Files\nodejs\npm.cmd"
  foreach ($toolPath in @($gitPath, $nodePath, $npmPath)) {
    if (-not (Test-Path -LiteralPath $toolPath -PathType Leaf)) { throw "PHASE7B_RECONCILIATION_TOOL_MISSING" }
  }
  $nodeVersion = ((@(& $nodePath --version 2>$null) -join "")).Trim()
  if ($LASTEXITCODE -ne 0) { throw "PHASE7B_RECONCILIATION_NODE_IDENTITY_FAIL" }
  $npmVersion = ((@(& $npmPath --version 2>$null) -join "")).Trim()
  if ($LASTEXITCODE -ne 0) { throw "PHASE7B_RECONCILIATION_NPM_IDENTITY_FAIL" }
  $gitVersion = ((@(& $gitPath --version 2>$null) -join "")).Trim()
  if ($LASTEXITCODE -ne 0) { throw "PHASE7B_RECONCILIATION_GIT_IDENTITY_FAIL" }
  $nodeResolution = @(Get-Command node.exe -All -CommandType Application -ErrorAction SilentlyContinue)
  $npmResolution = @(Get-Command npm.cmd -All -CommandType Application -ErrorAction SilentlyContinue)
  $gitResolution = @(Get-Command git.exe -All -CommandType Application -ErrorAction SilentlyContinue)
  $resolutionPass = `
    $nodeResolution.Count -eq 1 -and [string]$nodeResolution[0].Source -ieq $nodePath -and `
    $npmResolution.Count -eq 1 -and [string]$npmResolution[0].Source -ieq $npmPath -and `
    $gitResolution.Count -eq 1 -and [string]$gitResolution[0].Source -ieq $gitPath
  $toolStatePass = $resolutionPass -and $nodeVersion -match '^v24\.' -and $npmVersion -match '^[0-9]+\.[0-9]+\.[0-9]+$' -and $gitVersion -match '^git version '
  $toolEnvironment = [ordered]@{
    pass = $toolStatePass
    resolutionPass = $resolutionPass
    classification = if ($toolStatePass) { "PHASE7B_DETERMINISTIC_TOOL_STATE_REVALIDATION_PASS" } else { "PHASE7B_DETERMINISTIC_TOOL_STATE_REVALIDATION_FAIL" }
    nodeVersion = $nodeVersion
    npmVersion = $npmVersion
    gitVersion = $gitVersion
  }

  $stage = "repository-and-build-state"
  $repositoryPresent = Test-Path -LiteralPath (Join-Path $contract.repositoryRoot ".git") -PathType Container
  $head = $null
  $treeClean = $false
  if ($repositoryPresent) {
    Push-Location $contract.repositoryRoot
    try {
      $head = ((@(& $gitPath --no-optional-locks rev-parse HEAD 2>$null) -join "")).Trim()
      $headExitCode = $LASTEXITCODE
      $statusLines = @(& $gitPath --no-optional-locks status --porcelain=v1 --untracked-files=all 2>$null)
      $statusExitCode = $LASTEXITCODE
      $treeClean = $headExitCode -eq 0 -and $statusExitCode -eq 0 -and $statusLines.Count -eq 0
    } finally { Pop-Location }
  }
  $build = [ordered]@{
    nodeModulesPresent = Test-Path -LiteralPath (Join-Path $contract.repositoryRoot "node_modules") -PathType Container
    npmInstallLockPresent = Test-Path -LiteralPath (Join-Path $contract.repositoryRoot "node_modules\.package-lock.json") -PathType Leaf
    nextPackagePresent = Test-Path -LiteralPath (Join-Path $contract.repositoryRoot "node_modules\next\package.json") -PathType Leaf
    esbuildBinaryCount = @(Get-ChildItem -LiteralPath (Join-Path $contract.repositoryRoot "node_modules\@esbuild") -Recurse -File -Filter "esbuild.exe" -ErrorAction SilentlyContinue).Count
    buildIdPresent = Test-Path -LiteralPath (Join-Path $contract.repositoryRoot ".next\BUILD_ID") -PathType Leaf
    routesManifestPresent = Test-Path -LiteralPath (Join-Path $contract.repositoryRoot ".next\routes-manifest.json") -PathType Leaf
    buildManifestPresent = Test-Path -LiteralPath (Join-Path $contract.repositoryRoot ".next\build-manifest.json") -PathType Leaf
    serverDirectoryPresent = Test-Path -LiteralPath (Join-Path $contract.repositoryRoot ".next\server") -PathType Container
  }

  $stage = "credential-state"
  $credentialSignals = @(
    if ($repositoryPresent) { Find-Phase7BForbiddenCredentialSignals -RepositoryRoot $contract.repositoryRoot }
  )
  $sensitiveVariableNames = @("DATABASE_URL", "DIRECT_URL", "DIGITALOCEAN_ACCESS_TOKEN", "DIGITALOCEAN_TOKEN", "NGROK_AUTHTOKEN", "SPACES_ACCESS_KEY_ID", "SPACES_SECRET_ACCESS_KEY")
  $presentSensitiveNames = @($sensitiveVariableNames | Where-Object { [Environment]::GetEnvironmentVariable($_) })

  $stage = "stopped-control-state"
  $runtimeControlPath = Join-Path $contract.repositoryRoot "logs\physiqueos-runtime-control.json"
  $ngrokControlPath = Join-Path $contract.repositoryRoot "logs\physiqueos-ngrok-control.json"
  $runtimeControlPresent = Test-Path -LiteralPath $runtimeControlPath -PathType Leaf
  $ngrokControlPresent = Test-Path -LiteralPath $ngrokControlPath -PathType Leaf
  $runtimeControl = if ($runtimeControlPresent) { Get-Content -LiteralPath $runtimeControlPath -Raw | ConvertFrom-Json } else { $null }
  $ngrokControl = if ($ngrokControlPresent) { Get-Content -LiteralPath $ngrokControlPath -Raw | ConvertFrom-Json } else { $null }

  $stage = "task-state"
  $taskProjections = @()
  foreach ($taskName in @($contract.productionTaskName, $contract.monitorTaskName, $contract.ngrokTaskName)) {
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if (-not $task) { continue }
    $action = @($task.Actions)[0]
    $triggers = @($task.Triggers)
    $taskProjections += Get-Phase7BSafeTaskProjection -TaskName $taskName -Execute ([string]$action.Execute) -Arguments ([string]$action.Arguments) -WorkingDirectory ([string]$action.WorkingDirectory) -LogonType ([string]$task.Principal.LogonType) -RunLevel ([string]$task.Principal.RunLevel) -MultipleInstances ([string]$task.Settings.MultipleInstances) -ExecutionTimeLimit ([string]$task.Settings.ExecutionTimeLimit) -Enabled ([bool]$task.Settings.Enabled) -TriggerTypes @($triggers | ForEach-Object { [string]$_.CimClass.CimClassName }) -RepetitionIntervals @($triggers | ForEach-Object { if ($_.Repetition) { [string]$_.Repetition.Interval } } | Where-Object { $_ })
  }
  $taskProjections = @($taskProjections)
  $taskSet = Test-Phase7BInertTaskSet -TaskProjections $taskProjections -Contract $contract

  $stage = "marker-and-report-state"
  $markerPath = Join-Path $contract.isolatedRoot "guest-identity-marker.json"
  $markerPresent = Test-Path -LiteralPath $markerPath -PathType Leaf
  $marker = if ($markerPresent) { Get-Content -LiteralPath $markerPath -Raw | ConvertFrom-Json } else { $null }
  $reportDirectory = Join-Path $contract.isolatedRoot "reports"
  $existingReports = @(
    if (Test-Path -LiteralPath $reportDirectory -PathType Container) {
      Get-ChildItem -LiteralPath $reportDirectory -File -Filter "guest-bootstrap-*.json" -ErrorAction Stop
    }
  )

  $stage = "runtime-and-ngrok-state"
  $port3000 = @(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue)
  $physiqueOsProcesses = @(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object {
    $commandLine = [string]$_.CommandLine
    ($_.Name -eq "ngrok.exe" -and $commandLine -match '(?i)\bhttp\s+3000\b') -or
    ($_.Name -eq "node.exe" -and $commandLine -match '(?i)physiqueos.*(?:next|runBriefingCadence)') -or
    ($_.Name -in @("powershell.exe", "pwsh.exe") -and $commandLine -match '(?i)monitorPhysiqueOS\.ps1')
  })
  $ngrokExecutable = Join-Path $contract.ngrokRoot "ngrok.exe"
  $ngrokTaskEnabled = @($taskProjections | Where-Object { $_.taskName -eq $contract.ngrokTaskName -and $_.enabled }).Count -gt 0

  $state = [pscustomobject][ordered]@{
    kitIntegrityPass = $true
    session = [ordered]@{ username = [string]$env:USERNAME; administrator = $administrator }
    guestIdentity = $guestIdentity
    toolEnvironment = $toolEnvironment
    repository = [ordered]@{ present = $repositoryPresent; head = $head; clean = $treeClean }
    build = $build
    credentials = [ordered]@{ pass = $credentialSignals.Count -eq 0 -and $presentSensitiveNames.Count -eq 0; signalCount = $credentialSignals.Count; signalPaths = @($credentialSignals | ForEach-Object { $_.relativePath }); sensitiveEnvironmentNameCount = $presentSensitiveNames.Count }
    stoppedControls = [ordered]@{
      runtimePresent = $runtimeControlPresent
      runtimeSchemaVersion = if ($runtimeControl) { [int]$runtimeControl.schemaVersion } else { 0 }
      runtimeDesiredState = if ($runtimeControl) { [string]$runtimeControl.desiredState } else { $null }
      runtimeChangedBy = if ($runtimeControl) { [string]$runtimeControl.changedBy } else { $null }
      runtimeReason = if ($runtimeControl) { [string]$runtimeControl.reason } else { $null }
      ngrokPresent = $ngrokControlPresent
      ngrokSchemaVersion = if ($ngrokControl) { [int]$ngrokControl.schemaVersion } else { 0 }
      ngrokDesiredState = if ($ngrokControl) { [string]$ngrokControl.ngrokDesiredState } else { $null }
      ngrokChangedBy = if ($ngrokControl) { [string]$ngrokControl.changedBy } else { $null }
      ngrokReason = if ($ngrokControl) { [string]$ngrokControl.reason } else { $null }
    }
    tasks = [ordered]@{ pass = [bool]$taskSet.pass; projections = @($taskProjections) }
    marker = [ordered]@{ present = $markerPresent; schemaVersion = if ($marker) { [int]$marker.schemaVersion } else { 0 }; applicationCommit = if ($marker) { [string]$marker.applicationCommit } else { $null }; manifestDigest = if ($marker) { [string]$marker.manifestDigest } else { $null }; windowsHostId = if ($marker) { [string]$marker.windowsHostId } else { $null }; windowsRuntimeId = if ($marker) { [string]$marker.windowsRuntimeId } else { $null } }
    reports = [ordered]@{ directoryPresent = (Test-Path -LiteralPath $reportDirectory -PathType Container); existingCount = $existingReports.Count }
    runtime = [ordered]@{ classification = if ($port3000.Count -eq 0 -and $physiqueOsProcesses.Count -eq 0) { "NOT_RUNNING_EXPECTED" } else { "UNEXPECTED_RUNTIME_STATE" }; listenerCount = $port3000.Count; physiqueOsProcessCount = $physiqueOsProcesses.Count }
    ngrok = [ordered]@{ classification = if (-not (Test-Path -LiteralPath $ngrokExecutable -PathType Leaf)) { "NOT_PROVISIONED_EXPECTED" } else { "UNEXPECTED_NGROK_EXECUTABLE" }; executablePresent = (Test-Path -LiteralPath $ngrokExecutable -PathType Leaf); taskEnabled = $ngrokTaskEnabled }
    workPackage2 = [ordered]@{ authorized = $false; classification = "PREPARED_INTERFACE_ONLY" }
  }

  $stage = "persist-single-reconciliation-report"
  $reportWriteMayHaveStarted = $true
  $result = Write-Phase7BReportOnlyReconciliation -State $state -Contract $contract -BootstrapToolingCommit ([string]$manifest.bootstrapToolingCommit) -ReconciliationToolingCommit ([string]$manifest.reconciliationToolingCommit) -ReportDirectory $reportDirectory
  $result | ConvertTo-Json -Depth 6
} catch {
  $safeCode = if ([string]$_.Exception.Message -match '^PHASE7B_[A-Z0-9_:.-]+$') { [string]$_.Exception.Message } else { "PHASE7B_RECONCILIATION_EXCEPTION" }
  [ordered]@{
    schemaVersion = 1
    mode = "ReportOnlyReconciliation"
    classification = "PHASE7B_VMWARE_GUEST_REPORT_RECONCILIATION_FAIL"
    pass = $false
    safeStage = $stage
    safeErrorCode = $safeCode
    reportWriteMayHaveStarted = $reportWriteMayHaveStarted
    preparationMutationPerformed = $false
    attempt5Authorized = $false
    workPackage2Authorized = $false
  } | ConvertTo-Json -Depth 4
  exit 1
}
