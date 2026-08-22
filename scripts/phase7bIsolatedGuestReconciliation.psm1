Set-StrictMode -Version Latest

function Assert-Phase7BReconciliationInvariant {
  param(
    [Parameter(Mandatory = $true)][bool]$Condition,
    [Parameter(Mandatory = $true)][string]$Code
  )
  if (-not $Condition) { throw "PHASE7B_RECONCILIATION_INVARIANT:$Code" }
}

function Test-Phase7BReportOnlyReconciliationState {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][psobject]$State,
    [Parameter(Mandatory = $true)][psobject]$Contract,
    [Parameter(Mandatory = $true)][string]$BootstrapToolingCommit,
    [Parameter(Mandatory = $true)][string]$ReconciliationToolingCommit
  )

  try {
    Assert-Phase7BReconciliationInvariant ($BootstrapToolingCommit -eq "be86ec20394fff9760134b583d6f3c949ea95673") "BOOTSTRAP_TOOLING_COMMIT"
    Assert-Phase7BReconciliationInvariant ($ReconciliationToolingCommit -match '^[0-9a-f]{40}$') "RECONCILIATION_TOOLING_COMMIT"
    Assert-Phase7BReconciliationInvariant ([bool]$State.kitIntegrityPass) "KIT_INTEGRITY"
    Assert-Phase7BReconciliationInvariant ([string]$State.session.username -ieq "dusti") "GUEST_ACCOUNT"
    Assert-Phase7BReconciliationInvariant ([bool]$State.session.administrator) "ADMINISTRATOR"
    Assert-Phase7BReconciliationInvariant ([bool]$State.guestIdentity.pass) "GUEST_IDENTITY"
    Assert-Phase7BReconciliationInvariant ([string]$State.guestIdentity.classification -eq "ISOLATED_VMWARE_GUEST_IDENTITY_PASS") "GUEST_IDENTITY_CLASSIFICATION"
    Assert-Phase7BReconciliationInvariant ([bool]$State.toolEnvironment.pass) "TOOL_STATE"
    Assert-Phase7BReconciliationInvariant ([bool]$State.toolEnvironment.resolutionPass) "TOOL_RESOLUTION"
    Assert-Phase7BReconciliationInvariant ([string]$State.toolEnvironment.classification -eq "PHASE7B_DETERMINISTIC_TOOL_STATE_REVALIDATION_PASS") "TOOL_STATE_CLASSIFICATION"
    Assert-Phase7BReconciliationInvariant ([string]$State.toolEnvironment.nodeVersion -match '^v24\.[0-9]+\.[0-9]+$') "NODE_VERSION"
    Assert-Phase7BReconciliationInvariant ([string]$State.toolEnvironment.npmVersion -match '^[0-9]+\.[0-9]+\.[0-9]+$') "NPM_VERSION"
    Assert-Phase7BReconciliationInvariant ([string]$State.toolEnvironment.gitVersion -match '^git version [0-9]+\.[0-9]+\.[0-9]+') "GIT_VERSION"
    Assert-Phase7BReconciliationInvariant ([bool]$State.repository.present) "REPOSITORY_PRESENT"
    Assert-Phase7BReconciliationInvariant ([string]$State.repository.head -eq [string]$Contract.applicationCommit) "REPOSITORY_HEAD"
    Assert-Phase7BReconciliationInvariant ([bool]$State.repository.clean) "REPOSITORY_CLEAN"

    foreach ($artifactName in @("nodeModulesPresent", "npmInstallLockPresent", "nextPackagePresent", "buildIdPresent", "routesManifestPresent", "buildManifestPresent", "serverDirectoryPresent")) {
      Assert-Phase7BReconciliationInvariant ([bool]$State.build.$artifactName) "BUILD_$($artifactName.ToUpperInvariant())"
    }
    Assert-Phase7BReconciliationInvariant ([int]$State.build.esbuildBinaryCount -ge 1) "ESBUILD_BINARY"

    $credentialSignalPaths = @($State.credentials.signalPaths)
    Assert-Phase7BReconciliationInvariant ([bool]$State.credentials.pass) "CREDENTIAL_SCAN"
    Assert-Phase7BReconciliationInvariant ([int]$State.credentials.signalCount -eq 0) "CREDENTIAL_SIGNAL_COUNT"
    Assert-Phase7BReconciliationInvariant ($credentialSignalPaths.Count -eq 0) "CREDENTIAL_SIGNAL_PATHS"
    Assert-Phase7BReconciliationInvariant ([int]$State.credentials.sensitiveEnvironmentNameCount -eq 0) "SENSITIVE_ENVIRONMENT_NAMES"

    Assert-Phase7BReconciliationInvariant ([bool]$State.stoppedControls.runtimePresent) "RUNTIME_CONTROL_PRESENT"
    Assert-Phase7BReconciliationInvariant ([int]$State.stoppedControls.runtimeSchemaVersion -eq 1) "RUNTIME_CONTROL_SCHEMA"
    Assert-Phase7BReconciliationInvariant ([string]$State.stoppedControls.runtimeDesiredState -eq "stopped") "RUNTIME_CONTROL_STATE"
    Assert-Phase7BReconciliationInvariant ([string]$State.stoppedControls.runtimeChangedBy -eq "phase7b-isolated-guest-bootstrap") "RUNTIME_CONTROL_OWNER"
    Assert-Phase7BReconciliationInvariant ([string]$State.stoppedControls.runtimeReason -eq "checkpoint9-inert-before-restore") "RUNTIME_CONTROL_REASON"
    Assert-Phase7BReconciliationInvariant ([bool]$State.stoppedControls.ngrokPresent) "NGROK_CONTROL_PRESENT"
    Assert-Phase7BReconciliationInvariant ([int]$State.stoppedControls.ngrokSchemaVersion -eq 1) "NGROK_CONTROL_SCHEMA"
    Assert-Phase7BReconciliationInvariant ([string]$State.stoppedControls.ngrokDesiredState -eq "stopped") "NGROK_CONTROL_STATE"
    Assert-Phase7BReconciliationInvariant ([string]$State.stoppedControls.ngrokChangedBy -eq "phase7b-isolated-guest-bootstrap") "NGROK_CONTROL_OWNER"
    Assert-Phase7BReconciliationInvariant ([string]$State.stoppedControls.ngrokReason -eq "checkpoint9-inert-before-routing-authorization") "NGROK_CONTROL_REASON"

    $taskProjections = @($State.tasks.projections)
    $expectedTaskNames = @($Contract.productionTaskName, $Contract.monitorTaskName, $Contract.ngrokTaskName) | Sort-Object
    $actualTaskNames = @($taskProjections | ForEach-Object { [string]$_.taskName }) | Sort-Object
    Assert-Phase7BReconciliationInvariant ([bool]$State.tasks.pass) "TASK_SET"
    Assert-Phase7BReconciliationInvariant ($taskProjections.Count -eq 3) "TASK_COUNT"
    Assert-Phase7BReconciliationInvariant (@(Compare-Object -ReferenceObject $expectedTaskNames -DifferenceObject $actualTaskNames).Count -eq 0) "TASK_NAMES"
    Assert-Phase7BReconciliationInvariant (@($taskProjections | Where-Object { [bool]$_.enabled }).Count -eq 0) "TASKS_DISABLED"

    Assert-Phase7BReconciliationInvariant ([bool]$State.marker.present) "MARKER_PRESENT"
    Assert-Phase7BReconciliationInvariant ([int]$State.marker.schemaVersion -eq 1) "MARKER_SCHEMA"
    Assert-Phase7BReconciliationInvariant ([string]$State.marker.applicationCommit -eq [string]$Contract.applicationCommit) "MARKER_APPLICATION_COMMIT"
    Assert-Phase7BReconciliationInvariant ([string]$State.marker.manifestDigest -eq [string]$Contract.manifestDigest) "MARKER_MANIFEST_DIGEST"
    Assert-Phase7BReconciliationInvariant ([string]$State.marker.windowsHostId -eq [string]$Contract.windowsHostId) "MARKER_WINDOWS_HOST"
    Assert-Phase7BReconciliationInvariant ([string]$State.marker.windowsRuntimeId -eq [string]$Contract.windowsRuntimeId) "MARKER_WINDOWS_RUNTIME"

    Assert-Phase7BReconciliationInvariant ([bool]$State.reports.directoryPresent) "REPORT_DIRECTORY_PRESENT"
    Assert-Phase7BReconciliationInvariant ([int]$State.reports.existingCount -eq 0) "EXISTING_REPORT_COUNT"
    Assert-Phase7BReconciliationInvariant ([int]$State.runtime.listenerCount -eq 0) "RUNTIME_LISTENERS"
    Assert-Phase7BReconciliationInvariant ([int]$State.runtime.physiqueOsProcessCount -eq 0) "RUNTIME_PROCESSES"
    Assert-Phase7BReconciliationInvariant ([string]$State.runtime.classification -eq "NOT_RUNNING_EXPECTED") "RUNTIME_CLASSIFICATION"
    Assert-Phase7BReconciliationInvariant ([string]$State.ngrok.classification -eq "NOT_PROVISIONED_EXPECTED") "NGROK_CLASSIFICATION"
    Assert-Phase7BReconciliationInvariant (-not [bool]$State.ngrok.executablePresent) "NGROK_EXECUTABLE_ABSENT"
    Assert-Phase7BReconciliationInvariant (-not [bool]$State.ngrok.taskEnabled) "NGROK_TASK_DISABLED"
    Assert-Phase7BReconciliationInvariant (-not [bool]$State.workPackage2.authorized) "WP2_UNAUTHORIZED"
    Assert-Phase7BReconciliationInvariant ([string]$State.workPackage2.classification -eq "PREPARED_INTERFACE_ONLY") "WP2_CLASSIFICATION"
  } catch {
    if ([string]$_.Exception.Message -match '^PHASE7B_RECONCILIATION_INVARIANT:[A-Z0-9_]+$') { throw }
    throw "PHASE7B_RECONCILIATION_STATE_SHAPE_INVALID"
  }

  [pscustomobject][ordered]@{
    pass = $true
    classification = "PHASE7B_REPORT_ONLY_RECONCILIATION_STATE_PASS"
  }
}

function Write-Phase7BReportOnlyReconciliation {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][psobject]$State,
    [Parameter(Mandatory = $true)][psobject]$Contract,
    [Parameter(Mandatory = $true)][string]$BootstrapToolingCommit,
    [Parameter(Mandatory = $true)][string]$ReconciliationToolingCommit,
    [Parameter(Mandatory = $true)][string]$ReportDirectory
  )

  $validation = Test-Phase7BReportOnlyReconciliationState -State $State -Contract $Contract -BootstrapToolingCommit $BootstrapToolingCommit -ReconciliationToolingCommit $ReconciliationToolingCommit
  if (-not $validation.pass) { throw "PHASE7B_RECONCILIATION_STATE_REJECTED" }
  if (-not (Test-Path -LiteralPath $ReportDirectory -PathType Container)) { throw "PHASE7B_RECONCILIATION_REPORT_DIRECTORY_MISSING" }
  $existingReports = @(Get-ChildItem -LiteralPath $ReportDirectory -File -Filter "guest-bootstrap-*.json" -ErrorAction Stop)
  if ($existingReports.Count -ne 0) { throw "PHASE7B_RECONCILIATION_EXISTING_REPORTS_PRESENT" }

  $nonce = [Guid]::NewGuid().ToString("N")
  $observedAt = [DateTime]::UtcNow.ToString("o")
  $reportFileName = "guest-bootstrap-$nonce.json"
  $reportPath = Join-Path $ReportDirectory $reportFileName
  if (Test-Path -LiteralPath $reportPath) { throw "PHASE7B_RECONCILIATION_NONCE_COLLISION" }

  $report = [ordered]@{
    schemaVersion = 1
    nonce = $nonce
    observedAt = $observedAt
    mode = "ReportOnlyReconciliation"
    pass = $true
    classification = "PHASE7B_VMWARE_GUEST_REPORT_RECONCILIATION_PASS_INERT"
    mutationStarted = $true
    preparationMutationPerformed = $false
    reportOnlyMutationPerformed = $true
    reportFileName = $reportFileName
    reportPath = $reportPath
    applicationCommit = [string]$Contract.applicationCommit
    toolingCommit = $BootstrapToolingCommit
    reconciliationToolingCommit = $ReconciliationToolingCommit
    manifestDigest = [string]$Contract.manifestDigest
    environmentId = [string]$Contract.environmentId
    windowsHostId = [string]$Contract.windowsHostId
    windowsRuntimeId = [string]$Contract.windowsRuntimeId
    guestIdentity = $State.guestIdentity
    session = $State.session
    kitIntegrityPass = [bool]$State.kitIntegrityPass
    toolEnvironment = $State.toolEnvironment
    repository = $State.repository
    build = $State.build
    tasks = $State.tasks
    runtime = $State.runtime
    credentials = $State.credentials
    stoppedControls = $State.stoppedControls
    marker = $State.marker
    ngrok = $State.ngrok
    workPackage2 = $State.workPackage2
    reconciliation = [ordered]@{
      classification = "REPORT_ONLY_RECONCILIATION_EXPECTED"
      existingReportCountBefore = 0
      preparationMutationPerformed = $false
      reportWriteCount = 1
    }
  }
  $json = $report | ConvertTo-Json -Depth 12
  $roundTrip = $json | ConvertFrom-Json -ErrorAction Stop
  if ([string]$roundTrip.nonce -ne $nonce -or [string]$roundTrip.reportFileName -ne $reportFileName) { throw "PHASE7B_RECONCILIATION_JSON_ROUNDTRIP_FAIL" }

  $utf8NoBom = New-Object Text.UTF8Encoding($false)
  $reportBytes = $utf8NoBom.GetBytes($json)
  $reportStream = New-Object IO.FileStream($reportPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
  try {
    $reportStream.Write($reportBytes, 0, $reportBytes.Length)
    $reportStream.Flush()
  } finally {
    $reportStream.Dispose()
  }
  $reportSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $reportPath).Hash.ToLowerInvariant()

  [pscustomobject][ordered]@{
    classification = "PHASE7B_REPORT_ONLY_RECONCILIATION_WRITE_COMPLETE"
    pass = $true
    reportPath = $reportPath
    reportFileName = $reportFileName
    reportSha256 = $reportSha256
    nonce = $nonce
    observedAt = $observedAt
    reportWriteCount = 1
    preparationMutationPerformed = $false
    attempt5Authorized = $false
    workPackage2Authorized = $false
  }
}

Export-ModuleMember -Function @(
  "Test-Phase7BReportOnlyReconciliationState",
  "Write-Phase7BReportOnlyReconciliation"
)
