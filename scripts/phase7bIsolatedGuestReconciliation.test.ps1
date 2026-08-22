[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Import-Module (Join-Path $PSScriptRoot "phase7bIsolatedGuestContract.psm1") -Force
Import-Module (Join-Path $PSScriptRoot "phase7bIsolatedGuestReconciliation.psm1") -Force
$contract = Get-Phase7BIsolatedGuestContract
$testRoot = Join-Path $repositoryRoot ".tmp\phase7b-reconciliation-tests-$([Guid]::NewGuid().ToString('N'))"
$passCount = 0

function Assert-True([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw "ASSERTION_FAILED:$Message" }
  $script:passCount++
}

function New-ValidReconciliationState {
  $taskProjections = @(
    [pscustomobject]@{ taskName = $contract.productionTaskName; enabled = $false },
    [pscustomobject]@{ taskName = $contract.monitorTaskName; enabled = $false },
    [pscustomobject]@{ taskName = $contract.ngrokTaskName; enabled = $false }
  )
  [pscustomobject][ordered]@{
    kitIntegrityPass = $true
    session = [pscustomobject]@{ username = "dusti"; administrator = $true }
    guestIdentity = [pscustomobject]@{ pass = $true; classification = "ISOLATED_VMWARE_GUEST_IDENTITY_PASS"; manufacturer = "VMware, Inc."; model = "VMware20,1"; sharedFolderCount = 0; mappedHgfsDiskCount = 0; mappedHgfsConnectionCount = 0 }
    toolEnvironment = [pscustomobject]@{ pass = $true; resolutionPass = $true; classification = "PHASE7B_DETERMINISTIC_TOOL_STATE_REVALIDATION_PASS"; nodeVersion = "v24.19.0"; npmVersion = "11.7.0"; gitVersion = "git version 2.55.0" }
    repository = [pscustomobject]@{ present = $true; head = $contract.applicationCommit; clean = $true }
    build = [pscustomobject]@{ nodeModulesPresent = $true; npmInstallLockPresent = $true; nextPackagePresent = $true; esbuildBinaryCount = 1; buildIdPresent = $true; routesManifestPresent = $true; buildManifestPresent = $true; serverDirectoryPresent = $true }
    credentials = [pscustomobject]@{ pass = $true; signalCount = 0; signalPaths = @(); sensitiveEnvironmentNameCount = 0 }
    stoppedControls = [pscustomobject]@{ runtimePresent = $true; runtimeSchemaVersion = 1; runtimeDesiredState = "stopped"; runtimeChangedBy = "phase7b-isolated-guest-bootstrap"; runtimeReason = "checkpoint9-inert-before-restore"; ngrokPresent = $true; ngrokSchemaVersion = 1; ngrokDesiredState = "stopped"; ngrokChangedBy = "phase7b-isolated-guest-bootstrap"; ngrokReason = "checkpoint9-inert-before-routing-authorization" }
    tasks = [pscustomobject]@{ pass = $true; projections = $taskProjections }
    marker = [pscustomobject]@{ present = $true; schemaVersion = 1; applicationCommit = $contract.applicationCommit; manifestDigest = $contract.manifestDigest; windowsHostId = $contract.windowsHostId; windowsRuntimeId = $contract.windowsRuntimeId }
    reports = [pscustomobject]@{ directoryPresent = $true; existingCount = 0 }
    runtime = [pscustomobject]@{ classification = "NOT_RUNNING_EXPECTED"; listenerCount = 0; physiqueOsProcessCount = 0 }
    ngrok = [pscustomobject]@{ classification = "NOT_PROVISIONED_EXPECTED"; executablePresent = $false; taskEnabled = $false }
    workPackage2 = [pscustomobject]@{ authorized = $false; classification = "PREPARED_INTERFACE_ONLY" }
  }
}

function Copy-State([psobject]$State) {
  return ($State | ConvertTo-Json -Depth 12 | ConvertFrom-Json)
}

try {
  New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
  $bootstrapCommit = "be86ec20394fff9760134b583d6f3c949ea95673"
  $reconciliationCommit = "1111111111111111111111111111111111111111"
  $validState = New-ValidReconciliationState
  $validation = Test-Phase7BReportOnlyReconciliationState -State $validState -Contract $contract -BootstrapToolingCommit $bootstrapCommit -ReconciliationToolingCommit $reconciliationCommit
  Assert-True $validation.pass "exact attempt-4 inert fixture validates"

  $sentinelDirectory = Join-Path $testRoot "sentinels"
  New-Item -ItemType Directory -Path $sentinelDirectory -Force | Out-Null
  $sentinels = @(
    (Join-Path $sentinelDirectory "repository-state.txt"),
    (Join-Path $sentinelDirectory "runtime-control.json"),
    (Join-Path $sentinelDirectory "ngrok-control.json"),
    (Join-Path $sentinelDirectory "guest-marker.json"),
    (Join-Path $sentinelDirectory "task-state.json")
  )
  foreach ($sentinel in $sentinels) { "unchanged-fixture" | Set-Content -LiteralPath $sentinel -Encoding ASCII }
  $hashesBefore = @($sentinels | ForEach-Object { (Get-FileHash -Algorithm SHA256 -LiteralPath $_).Hash })
  $environmentBefore = [Environment]::GetEnvironmentVariable("Path", "Process")

  $successDirectory = Join-Path $testRoot "success-reports"
  New-Item -ItemType Directory -Path $successDirectory -Force | Out-Null
  $writeResult = Write-Phase7BReportOnlyReconciliation -State $validState -Contract $contract -BootstrapToolingCommit $bootstrapCommit -ReconciliationToolingCommit $reconciliationCommit -ReportDirectory $successDirectory
  $successFiles = @(Get-ChildItem -LiteralPath $successDirectory -File -Filter "guest-bootstrap-*.json")
  Assert-True ($writeResult.classification -eq "PHASE7B_REPORT_ONLY_RECONCILIATION_WRITE_COMPLETE") "success write classification"
  Assert-True ($successFiles.Count -eq 1 -and $writeResult.reportWriteCount -eq 1) "success creates exactly one report"
  Assert-True ($successFiles[0].Name -eq "guest-bootstrap-$($writeResult.nonce).json") "nonce binds report path"
  Assert-True ((Get-FileHash -Algorithm SHA256 -LiteralPath $successFiles[0].FullName).Hash.ToLowerInvariant() -eq $writeResult.reportSha256) "Founder-computable report hash"
  $persisted = Get-Content -LiteralPath $successFiles[0].FullName -Raw | ConvertFrom-Json
  Assert-True ($persisted.classification -eq "PHASE7B_VMWARE_GUEST_REPORT_RECONCILIATION_PASS_INERT") "distinct reconciliation success classification"
  Assert-True ($persisted.mode -eq "ReportOnlyReconciliation") "report mode cannot be confused with Apply"
  Assert-True ([bool]$persisted.mutationStarted -and -not [bool]$persisted.preparationMutationPerformed -and [bool]$persisted.reportOnlyMutationPerformed) "report-only mutation semantics are explicit"
  Assert-True ($persisted.toolingCommit -eq $bootstrapCommit -and $persisted.reconciliationToolingCommit -eq $reconciliationCommit) "bootstrap and reconciliation tooling identities are distinct"
  Assert-True ([int]$persisted.credentials.signalCount -eq 0 -and @($persisted.credentials.signalPaths).Count -eq 0) "zero credential collection serializes safely"
  Assert-True ([int]$persisted.reconciliation.reportWriteCount -eq 1) "report declares one-write contract"

  $hashesAfter = @($sentinels | ForEach-Object { (Get-FileHash -Algorithm SHA256 -LiteralPath $_).Hash })
  Assert-True (@(Compare-Object -ReferenceObject $hashesBefore -DifferenceObject $hashesAfter).Count -eq 0) "repository/control/marker/task sentinels remain unchanged"
  Assert-True ([Environment]::GetEnvironmentVariable("Path", "Process") -eq $environmentBefore) "process environment remains unchanged"

  $firstReportHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $successFiles[0].FullName).Hash
  $secondWriteRejected = $false
  try { [void](Write-Phase7BReportOnlyReconciliation -State $validState -Contract $contract -BootstrapToolingCommit $bootstrapCommit -ReconciliationToolingCommit $reconciliationCommit -ReportDirectory $successDirectory) } catch { $secondWriteRejected = $_.Exception.Message -eq "PHASE7B_RECONCILIATION_EXISTING_REPORTS_PRESENT" }
  Assert-True $secondWriteRejected "existing report prevents a second write"
  Assert-True (@(Get-ChildItem -LiteralPath $successDirectory -File -Filter "guest-bootstrap-*.json").Count -eq 1) "second invocation leaves exactly one report"
  Assert-True ((Get-FileHash -Algorithm SHA256 -LiteralPath $successFiles[0].FullName).Hash -eq $firstReportHash) "existing report is never modified"

  $failureCases = @(
    [pscustomobject]@{ name = "guest-identity"; mutate = { param($s) $s.guestIdentity.pass = $false } },
    [pscustomobject]@{ name = "administrator"; mutate = { param($s) $s.session.administrator = $false } },
    [pscustomobject]@{ name = "tool-resolution"; mutate = { param($s) $s.toolEnvironment.resolutionPass = $false } },
    [pscustomobject]@{ name = "repository-head"; mutate = { param($s) $s.repository.head = "0" * 40 } },
    [pscustomobject]@{ name = "build-artifact"; mutate = { param($s) $s.build.buildIdPresent = $false } },
    [pscustomobject]@{ name = "credential-one"; mutate = { param($s) $s.credentials.pass = $false; $s.credentials.signalCount = 1; $s.credentials.signalPaths = @(".env.fixture") } },
    [pscustomobject]@{ name = "credential-many"; mutate = { param($s) $s.credentials.pass = $false; $s.credentials.signalCount = 2; $s.credentials.signalPaths = @("a", "b") } },
    [pscustomobject]@{ name = "runtime-control"; mutate = { param($s) $s.stoppedControls.runtimeDesiredState = "running" } },
    [pscustomobject]@{ name = "runtime-control-owner"; mutate = { param($s) $s.stoppedControls.runtimeChangedBy = "unexpected" } },
    [pscustomobject]@{ name = "task-zero"; mutate = { param($s) $s.tasks.pass = $false; $s.tasks.projections = @() } },
    [pscustomobject]@{ name = "task-one"; mutate = { param($s) $s.tasks.pass = $false; $s.tasks.projections = @($s.tasks.projections[0]) } },
    [pscustomobject]@{ name = "task-many"; mutate = { param($s) $s.tasks.pass = $false; $s.tasks.projections = @($s.tasks.projections) + [pscustomobject]@{ taskName = "unexpected"; enabled = $false } } },
    [pscustomobject]@{ name = "task-enabled"; mutate = { param($s) $s.tasks.pass = $false; $s.tasks.projections[0].enabled = $true } },
    [pscustomobject]@{ name = "marker"; mutate = { param($s) $s.marker.applicationCommit = "0" * 40 } },
    [pscustomobject]@{ name = "marker-schema"; mutate = { param($s) $s.marker.schemaVersion = 2 } },
    [pscustomobject]@{ name = "existing-report"; mutate = { param($s) $s.reports.existingCount = 1 } },
    [pscustomobject]@{ name = "runtime-listener"; mutate = { param($s) $s.runtime.listenerCount = 1 } },
    [pscustomobject]@{ name = "ngrok"; mutate = { param($s) $s.ngrok.executablePresent = $true; $s.ngrok.classification = "UNEXPECTED_NGROK_EXECUTABLE" } },
    [pscustomobject]@{ name = "wp2"; mutate = { param($s) $s.workPackage2.authorized = $true } },
    [pscustomobject]@{ name = "missing-state"; mutate = { param($s) [void]$s.build.PSObject.Properties.Remove("serverDirectoryPresent") } }
  )
  foreach ($failureCase in $failureCases) {
    $failureState = Copy-State $validState
    & $failureCase.mutate $failureState
    $failureDirectory = Join-Path $testRoot "failure-$($failureCase.name)"
    New-Item -ItemType Directory -Path $failureDirectory -Force | Out-Null
    $rejected = $false
    try { [void](Write-Phase7BReportOnlyReconciliation -State $failureState -Contract $contract -BootstrapToolingCommit $bootstrapCommit -ReconciliationToolingCommit $reconciliationCommit -ReportDirectory $failureDirectory) } catch { $rejected = [string]$_.Exception.Message -match '^PHASE7B_RECONCILIATION_' }
    Assert-True $rejected "failure fixture rejects: $($failureCase.name)"
    Assert-True (@(Get-ChildItem -LiteralPath $failureDirectory -File -Filter "guest-bootstrap-*.json").Count -eq 0) "failure fixture writes zero reports: $($failureCase.name)"
  }

  $scriptPaths = @(
    "phase7bIsolatedGuestReconciliation.psm1",
    "phase7bReconcileIsolatedGuestReport.ps1",
    "phase7bBuildGuestReconciliationIso.ps1",
    "phase7bIsolatedGuestReconciliation.test.ps1"
  ) | ForEach-Object { Join-Path $PSScriptRoot $_ }
  foreach ($scriptPath in $scriptPaths) {
    $tokens = $null; $errors = $null
    [void][Management.Automation.Language.Parser]::ParseFile($scriptPath, [ref]$tokens, [ref]$errors)
    Assert-True (@($errors).Count -eq 0) "PowerShell 5.1 AST parse: $(Split-Path -Leaf $scriptPath)"
  }

  $entryText = Get-Content -LiteralPath (Join-Path $PSScriptRoot "phase7bReconcileIsolatedGuestReport.ps1") -Raw
  $moduleText = Get-Content -LiteralPath (Join-Path $PSScriptRoot "phase7bIsolatedGuestReconciliation.psm1") -Raw
  $builderText = Get-Content -LiteralPath (Join-Path $PSScriptRoot "phase7bBuildGuestReconciliationIso.ps1") -Raw
  Assert-True (-not ($entryText -match '(?i)\b(?:Set-Content|Out-File|Add-Content|New-Item|Remove-Item|Copy-Item|Move-Item|Register-ScheduledTask|Disable-ScheduledTask|Enable-ScheduledTask|Set-ScheduledTask)\b')) "guest entry contains no direct preparation/file mutation command"
  Assert-True (-not ($entryText -match '(?i)\bnpm(?:\.cmd)?\s+(?:ci|install|run)|\bgit(?:\.exe)?\s+(?:clone|fetch|pull|push|checkout|reset)\b')) "guest entry contains no npm/build/repository mutation command"
  Assert-True (-not ($entryText -match '(?im)^\s*\$env:[A-Za-z0-9_]+\s*=')) "guest entry contains no environment assignment"
  Assert-True ([regex]::Matches($entryText, 'Write-Phase7BReportOnlyReconciliation').Count -eq 1) "guest entry has exactly one reconciliation writer call"
  Assert-True (-not ($moduleText -match '\[IO\.File\]::WriteAllText')) "reconciliation module never overwrites an existing report"
  Assert-True ([regex]::Matches($moduleText, '\[IO\.FileMode\]::CreateNew').Count -eq 1) "reconciliation module uses one create-new report boundary"
  Assert-True ([regex]::Matches($moduleText, '\$reportStream\.Write\(').Count -eq 1) "reconciliation module has exactly one report-byte write"
  Assert-True ($builderText -match 'PHASE7B_RECONCILIATION_ISO_OUTPUT_ALREADY_EXISTS') "ISO builder rejects an existing output artifact"
  Assert-True ($builderText -match 'FileMode\.CreateNew') "ISO builder cannot overwrite prior evidence"
  Assert-True (-not ($entryText -match '(?i)Invoke-WebRequest|Invoke-RestMethod|Start-BitsTransfer')) "guest entry contains no network client"
  Assert-True (-not ($entryText -match '(?i)dop_v1_|BEGIN (?:RSA|OPENSSH|EC) PRIVATE KEY')) "guest entry contains no credential/private-key material"
  Assert-True ($entryText -match 'PHASE7B_RECONCILIATION_KIT_CREDENTIAL_AUTHORITY_FORBIDDEN') "guest entry rejects credential-bearing media"
  Assert-True ($entryText -match 'PHASE7B_RECONCILIATION_KIT_WP2_AUTHORITY_FORBIDDEN') "guest entry rejects WP2-bearing media"
  Assert-True ($entryText -match 'PHASE7B_RECONCILIATION_KIT_ATTEMPT5_AUTHORITY_FORBIDDEN') "guest entry rejects attempt-5 authority"

  [ordered]@{
    classification = "PHASE7B_REPORT_ONLY_RECONCILIATION_TESTS_PASS"
    pass = $true
    assertions = $passCount
    applicationCommit = $contract.applicationCommit
    bootstrapToolingCommit = $bootstrapCommit
  } | ConvertTo-Json -Compress
} finally {
  if (Test-Path -LiteralPath $testRoot) {
    $resolved = (Resolve-Path -LiteralPath $testRoot).Path
    $expectedPrefix = (Resolve-Path -LiteralPath (Join-Path $repositoryRoot ".tmp")).Path + "\phase7b-reconciliation-tests-"
    if ($resolved.StartsWith($expectedPrefix, [StringComparison]::OrdinalIgnoreCase)) { Remove-Item -LiteralPath $resolved -Recurse -Force }
  }
}
