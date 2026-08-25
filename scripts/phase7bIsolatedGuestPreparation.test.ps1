[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$modulePath = Join-Path $PSScriptRoot "phase7bIsolatedGuestContract.psm1"
Import-Module $modulePath -Force
$contract = Get-Phase7BIsolatedGuestContract
$testRoot = Join-Path $repositoryRoot ".tmp\phase7b-isolated-guest-tests-$([Guid]::NewGuid().ToString('N'))"
$passCount = 0

function Assert-True([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw "ASSERTION_FAILED:$Message" }
  $script:passCount++
}

try {
  New-Item -ItemType Directory -Path $testRoot -Force | Out-Null

  Assert-True ($contract.applicationCommit -eq "379bb30391cfb7ed912e4757c77604e859b8a599") "accepted application commit"
  Assert-True ($contract.manifestDigest -eq "134bb6b4fd81e067c5c77fc1b5574373b62d4f6d033f14ed7c6afa4db40f557d") "manifest digest"
  Assert-True ($contract.repositoryRoot -eq "C:\Users\dusti\Documents\GitHub\physiqueos") "exact guest repository path"
  Assert-True ($contract.bootstrapIsoFileName -eq "phase7b-vmware-guest-bootstrap-kit-v5.iso") "post-marker report correction uses a new bootstrap ISO identity"

  $validVmxPath = Join-Path $testRoot "valid.vmx"
  @'
displayName = "phase7b-isolated-windows-restore-379bb303"
numvcpus = "2"
memsize = "4096"
firmware = "efi"
uefi.secureBoot.enabled = "TRUE"
guestOS = "windows11-64"
managedVM.autoAddVTPM = "software"
ethernet0.connectionType = "nat"
ethernet1.present = "FALSE"
isolation.tools.copy.disable = "TRUE"
isolation.tools.paste.disable = "TRUE"
isolation.tools.dnd.disable = "TRUE"
isolation.tools.hgfsServerSet.disable = "TRUE"
sharedFolder.maxNum = "0"
usb.restrictions.defaultAllow = "FALSE"
scsi0:0.present = "TRUE"
scsi0:0.fileName = "phase7b-isolated.vmdk"
'@ | Set-Content -LiteralPath $validVmxPath -Encoding ASCII
  @'
# Disk DescriptorFile
version=1
CID=fffffffe
parentCID=ffffffff
createType="monolithicSparse"
RW 167772160 SPARSE "phase7b-isolated-s001.vmdk"
'@ | Set-Content -LiteralPath (Join-Path $testRoot "phase7b-isolated.vmdk") -Encoding ASCII
  $validVmx = Read-Phase7BVmx -LiteralPath $validVmxPath
  $validResult = Test-Phase7BVmxContract -Vmx $validVmx -Contract $contract
  Assert-True $validResult.pass "valid VMX accepted"
  $validDisk = Test-Phase7BVmdkContract -Vmx $validVmx -VmxPath $validVmxPath -Contract $contract
  Assert-True $validDisk.pass "80 GiB sparse VMDK accepted"

  $opticalVmx = @{} + $validVmx
  $opticalVmx["sata0:1.present"] = "TRUE"
  $opticalVmx["sata0:1.devicetype"] = "cdrom-image"
  $opticalVmx["sata0:1.filename"] = "windows-installer.iso"
  $opticalDisk = Test-Phase7BVmdkContract -Vmx $opticalVmx -VmxPath $validVmxPath -Contract $contract
  Assert-True $opticalDisk.pass "single VMDK plus optical ISO accepted"
  Assert-True ($opticalDisk.opticalAttachmentCount -eq 1) "optical ISO reported separately from disks"

  $nvmeVmx = @{} + $validVmx
  [void]$nvmeVmx.Remove("scsi0:0.present")
  [void]$nvmeVmx.Remove("scsi0:0.filename")
  $nvmeVmx["nvme0:0.present"] = "TRUE"
  $nvmeVmx["nvme0:0.filename"] = "phase7b-isolated.vmdk"
  $nvmeDisk = Test-Phase7BVmdkContract -Vmx $nvmeVmx -VmxPath $validVmxPath -Contract $contract
  Assert-True $nvmeDisk.pass "VMware 26H1 NVMe single-disk layout accepted"
  Assert-True ($nvmeDisk.diskSlot -eq "nvme0:0") "NVMe disk slot safely projected"

  @'
# Disk DescriptorFile
version=1
CID=fffffffd
parentCID=ffffffff
createType="twoGbMaxExtentSparse"
RW 83886080 SPARSE "phase7b-split-s001.vmdk"
RW 83886080 SPARSE "phase7b-split-s002.vmdk"
'@ | Set-Content -LiteralPath (Join-Path $testRoot "phase7b-split.vmdk") -Encoding ASCII
  $splitVmx = @{} + $nvmeVmx
  $splitVmx["nvme0:0.filename"] = "phase7b-split.vmdk"
  $splitDisk = Test-Phase7BVmdkContract -Vmx $splitVmx -VmxPath $validVmxPath -Contract $contract
  Assert-True $splitDisk.pass "split sparse VMDK capacity aggregates all extents"
  Assert-True ($splitDisk.capacityGiB -eq 80) "split sparse VMDK reports aggregate 80 GiB"

  $invalidVmx = @{} + $validVmx
  $invalidVmx["ethernet0.connectiontype"] = "bridged"
  $invalidVmx["isolation.tools.copy.disable"] = "FALSE"
  $invalidResult = Test-Phase7BVmxContract -Vmx $invalidVmx -Contract $contract
  Assert-True (-not $invalidResult.pass) "bridged/clipboard VMX rejected"
  $invalidDiskVmx = @{} + $validVmx
  $invalidDiskVmx["sata0:1.filename"] = "extra.vmdk"
  $invalidDisk = Test-Phase7BVmdkContract -Vmx $invalidDiskVmx -VmxPath $validVmxPath -Contract $contract
  Assert-True (-not $invalidDisk.pass) "second virtual disk rejected"

  $validGuestIdentityArgs = @{
    Manufacturer = "VMware, Inc."
    Model = "VMware20,1"
    ToolsServicePresent = $true
    ToolsServiceRunning = $true
    ToolsExecutablePresent = $true
    SharedFolderEnumerationAvailable = $true
    SharedFolderEnumerationExitCode = 1
    SharedFolderNames = @()
    HgfsDriverPresent = $true
    HgfsDriverRunning = $true
    MappedHgfsDiskCount = 0
    MappedHgfsConnectionCount = 0
  }
  $currentGuestIdentity = Test-Phase7BVmwareGuestIdentity @validGuestIdentityArgs
  Assert-True $currentGuestIdentity.pass "current VMware20,1 Workstation guest with corroborated empty HGFS accepted"
  Assert-True ($currentGuestIdentity.sharedFolderEnumerationStatus -eq "EMPTY_EXIT_1_CORROBORATED") "current Windows HGFS empty exit is explicitly classified"

  $legacyGuestIdentityArgs = @{} + $validGuestIdentityArgs
  $legacyGuestIdentityArgs.Model = "VMware Virtual Platform"
  $legacyGuestIdentityArgs.SharedFolderEnumerationExitCode = 0
  $legacyGuestIdentity = Test-Phase7BVmwareGuestIdentity @legacyGuestIdentityArgs
  Assert-True $legacyGuestIdentity.pass "legacy VMware Virtual Platform guest accepted"

  $physicalIdentityArgs = @{} + $validGuestIdentityArgs
  $physicalIdentityArgs.Manufacturer = "ASUSTeK COMPUTER INC."
  $physicalIdentityArgs.Model = "Founder PC"
  $physicalIdentity = Test-Phase7BVmwareGuestIdentity @physicalIdentityArgs
  Assert-True (-not $physicalIdentity.pass) "physical host rejected even with VMware software signals"

  $otherHypervisorIdentityArgs = @{} + $validGuestIdentityArgs
  $otherHypervisorIdentityArgs.Manufacturer = "Microsoft Corporation"
  $otherHypervisorIdentityArgs.Model = "Virtual Machine"
  $otherHypervisorIdentity = Test-Phase7BVmwareGuestIdentity @otherHypervisorIdentityArgs
  Assert-True (-not $otherHypervisorIdentity.pass) "non-VMware hypervisor rejected"

  $ambiguousVmwareIdentityArgs = @{} + $validGuestIdentityArgs
  $ambiguousVmwareIdentityArgs.Model = "VMware Cloud Platform"
  $ambiguousVmwareIdentity = Test-Phase7BVmwareGuestIdentity @ambiguousVmwareIdentityArgs
  Assert-True (-not $ambiguousVmwareIdentity.pass) "unsupported VMware model syntax rejected"

  $missingToolsIdentityArgs = @{} + $validGuestIdentityArgs
  $missingToolsIdentityArgs.ToolsServicePresent = $false
  $missingToolsIdentityArgs.ToolsServiceRunning = $false
  $missingToolsIdentityArgs.ToolsExecutablePresent = $false
  $missingToolsIdentity = Test-Phase7BVmwareGuestIdentity @missingToolsIdentityArgs
  Assert-True (-not $missingToolsIdentity.pass) "VMware manufacturer with missing Tools rejected"

  $stoppedToolsIdentityArgs = @{} + $validGuestIdentityArgs
  $stoppedToolsIdentityArgs.ToolsServiceRunning = $false
  $stoppedToolsIdentity = Test-Phase7BVmwareGuestIdentity @stoppedToolsIdentityArgs
  Assert-True (-not $stoppedToolsIdentity.pass) "stopped VMware Tools service rejected"

  $sharedIdentityArgs = @{} + $validGuestIdentityArgs
  $sharedIdentityArgs.SharedFolderEnumerationExitCode = 0
  $sharedIdentityArgs.SharedFolderNames = @("dangerous-share")
  $sharedIdentity = Test-Phase7BVmwareGuestIdentity @sharedIdentityArgs
  Assert-True (-not $sharedIdentity.pass) "VMware guest with shared folder rejected"

  $missingClientIdentityArgs = @{} + $validGuestIdentityArgs
  $missingClientIdentityArgs.SharedFolderEnumerationAvailable = $false
  $missingClientIdentityArgs.SharedFolderEnumerationExitCode = -1
  $missingClientIdentity = Test-Phase7BVmwareGuestIdentity @missingClientIdentityArgs
  Assert-True (-not $missingClientIdentity.pass) "missing Windows HGFS client rejected"

  $failedEnumerationIdentityArgs = @{} + $validGuestIdentityArgs
  $failedEnumerationIdentityArgs.SharedFolderEnumerationExitCode = 2
  $failedEnumerationIdentity = Test-Phase7BVmwareGuestIdentity @failedEnumerationIdentityArgs
  Assert-True (-not $failedEnumerationIdentity.pass) "unsupported HGFS enumeration failure rejected"

  $missingDriverIdentityArgs = @{} + $validGuestIdentityArgs
  $missingDriverIdentityArgs.HgfsDriverPresent = $false
  $missingDriverIdentityArgs.HgfsDriverRunning = $false
  $missingDriverIdentity = Test-Phase7BVmwareGuestIdentity @missingDriverIdentityArgs
  Assert-True (-not $missingDriverIdentity.pass) "missing or stopped HGFS driver rejected"

  $mappedDiskIdentityArgs = @{} + $validGuestIdentityArgs
  $mappedDiskIdentityArgs.MappedHgfsDiskCount = 1
  $mappedDiskIdentity = Test-Phase7BVmwareGuestIdentity @mappedDiskIdentityArgs
  Assert-True (-not $mappedDiskIdentity.pass) "mapped HGFS disk rejected"

  $mappedConnectionIdentityArgs = @{} + $validGuestIdentityArgs
  $mappedConnectionIdentityArgs.MappedHgfsConnectionCount = 1
  $mappedConnectionIdentity = Test-Phase7BVmwareGuestIdentity @mappedConnectionIdentityArgs
  Assert-True (-not $mappedConnectionIdentity.pass) "mapped HGFS network connection rejected"

  $paths = Test-Phase7BGuestPathContract -RepositoryRoot $contract.repositoryRoot -IsolatedRoot $contract.isolatedRoot -Contract $contract
  Assert-True $paths.pass "exact guest paths accepted"
  $wrongPaths = Test-Phase7BGuestPathContract -RepositoryRoot "C:\Users\founder\repo" -IsolatedRoot $contract.isolatedRoot -Contract $contract
  Assert-True (-not $wrongPaths.pass) "portable but non-contract path rejected"

  $hostNodePath = "C:\Program Files\nodejs\node.exe"
  $hostNpmPath = "C:\Program Files\nodejs\npm.cmd"
  $hostGitPath = "C:\Program Files\Git\cmd\git.exe"
  foreach ($toolPath in @($hostNodePath, $hostNpmPath, $hostGitPath)) {
    Assert-True (Test-Path -LiteralPath $toolPath -PathType Leaf) "focused deterministic tool fixture prerequisite exists: $(Split-Path -Leaf $toolPath)"
  }
  $originalProcessPath = $env:Path
  try {
    $env:Path = "$env:SystemRoot\System32"
    Assert-True (@(Get-Command node.exe -All -CommandType Application -ErrorAction SilentlyContinue).Count -eq 0) "fresh-process stale PATH initially cannot resolve Node"

    $toolEnvironment = Set-Phase7BDeterministicToolEnvironment -NodePath $hostNodePath -NpmPath $hostNpmPath -GitPath $hostGitPath
    Assert-True $toolEnvironment.pass "deterministic tool environment accepted"
    Assert-True ($toolEnvironment.classification -eq "PHASE7B_DETERMINISTIC_TOOL_ENVIRONMENT_PASS") "deterministic tool environment classification"
    Assert-True ($toolEnvironment.nodeVersion -match '^v24\.') "bounded environment resolves Node 24"
    Assert-True ($toolEnvironment.npmVersion -match '^[0-9]+\.[0-9]+\.[0-9]+$') "bounded environment resolves npm"
    Assert-True ($toolEnvironment.gitVersion -match '^git version ') "bounded environment resolves Git"
    Assert-True $toolEnvironment.childNodeResolutionPass "child cmd resolves exact Node without shell restart"
    Assert-True (@(Get-Command node.exe -All -CommandType Application).Count -eq 1) "bounded PATH has one Node resolution"
    Assert-True (@(Get-Command npm.cmd -All -CommandType Application).Count -eq 1) "bounded PATH has one npm resolution"
    Assert-True (@(Get-Command git.exe -All -CommandType Application).Count -eq 1) "bounded PATH has one Git resolution"

    $lifecycleRoot = Join-Path $testRoot "npm-lifecycle"
    New-Item -ItemType Directory -Path $lifecycleRoot -Force | Out-Null
    '{"private":true,"scripts":{"install":"node install.js"}}' | Set-Content -LiteralPath (Join-Path $lifecycleRoot "package.json") -Encoding ASCII
    'process.stdout.write("PHASE7B_ESBUILD_STYLE_NODE_LIFECYCLE_PASS")' | Set-Content -LiteralPath (Join-Path $lifecycleRoot "install.js") -Encoding ASCII
    Push-Location $lifecycleRoot
    try {
      $lifecycleOutput = @(& $hostNpmPath run install --silent 2>&1) -join [Environment]::NewLine
      $lifecycleExitCode = $LASTEXITCODE
    } finally { Pop-Location }
    Assert-True ($lifecycleExitCode -eq 0 -and $lifecycleOutput.Contains("PHASE7B_ESBUILD_STYLE_NODE_LIFECYCLE_PASS")) "npm lifecycle child resolves node install.js"

    $idempotentEnvironment = Set-Phase7BDeterministicToolEnvironment -NodePath $hostNodePath -NpmPath $hostNpmPath -GitPath $hostGitPath
    Assert-True ($idempotentEnvironment.boundedPathSha256 -eq $toolEnvironment.boundedPathSha256) "already-installed accepted tools remain idempotent"

    $missingToolRejected = $false
    try { [void](Set-Phase7BDeterministicToolEnvironment -NodePath (Join-Path $testRoot "missing\node.exe") -NpmPath $hostNpmPath -GitPath $hostGitPath) } catch { $missingToolRejected = $_.Exception.Message -match '^PHASE7B_' }
    Assert-True $missingToolRejected "missing Node directory fails closed"

    $wrongToolRoot = Join-Path $testRoot "wrong-node"
    New-Item -ItemType Directory -Path $wrongToolRoot -Force | Out-Null
    Copy-Item -LiteralPath "$env:SystemRoot\System32\where.exe" -Destination (Join-Path $wrongToolRoot "node.exe")
    Copy-Item -LiteralPath $hostNpmPath -Destination (Join-Path $wrongToolRoot "npm.cmd")
    $wrongNodeRejected = $false
    try { [void](Set-Phase7BDeterministicToolEnvironment -NodePath (Join-Path $wrongToolRoot "node.exe") -NpmPath (Join-Path $wrongToolRoot "npm.cmd") -GitPath $hostGitPath) } catch { $wrongNodeRejected = $_.Exception.Message -eq "PHASE7B_NODE_24_LTS_REQUIRED" }
    Assert-True $wrongNodeRejected "wrong Node executable identity fails closed"

    $ambiguousWindows = Join-Path $testRoot "ambiguous-windows"
    New-Item -ItemType Directory -Path @(
      (Join-Path $ambiguousWindows "System32"),
      (Join-Path $ambiguousWindows "System32\Wbem"),
      (Join-Path $ambiguousWindows "System32\WindowsPowerShell\v1.0")
    ) -Force | Out-Null
    Copy-Item -LiteralPath $hostNodePath -Destination (Join-Path $ambiguousWindows "System32\node.exe")
    $ambiguousNodeRejected = $false
    try { [void](Set-Phase7BDeterministicToolEnvironment -NodePath $hostNodePath -NpmPath $hostNpmPath -GitPath $hostGitPath -WindowsDirectory $ambiguousWindows) } catch { $ambiguousNodeRejected = $_.Exception.Message -eq "PHASE7B_NODE_RESOLUTION_AMBIGUOUS_OR_WRONG" }
    Assert-True $ambiguousNodeRejected "multiple Node resolutions fail closed"

    $partialNpmRecovery = Get-Phase7BGuestBootstrapRecoveryDecision -MutationStarted $true -AcceptedPass $false -S1SnapshotExists $false -PartialNpmStatePresent $true
    Assert-True ($partialNpmRecovery.classification -eq "PHASE7B_GUEST_BOOTSTRAP_RESTORE_S0_REQUIRED" -and $partialNpmRecovery.restoreS0Required -and -not $partialNpmRecovery.currentDiskResumeAllowed) "partial npm cache requires S0 restoration instead of resume"
    $partialRepositoryRecovery = Get-Phase7BGuestBootstrapRecoveryDecision -MutationStarted $true -AcceptedPass $false -S1SnapshotExists $false -PartialRepositoryPresent $true
    Assert-True ($partialRepositoryRecovery.classification -eq "PHASE7B_GUEST_BOOTSTRAP_RESTORE_S0_REQUIRED" -and $partialRepositoryRecovery.restoreS0Required -and -not $partialRepositoryRecovery.currentDiskResumeAllowed) "partial repository checkout requires S0 restoration instead of resume"
    Assert-True $partialRepositoryRecovery.newFounderAuthorizationRequired "recovery and another attempt require Founder authorization"
    $preMutationRecovery = Get-Phase7BGuestBootstrapRecoveryDecision -MutationStarted $false -AcceptedPass $false -S1SnapshotExists $false
    Assert-True ($preMutationRecovery.classification -eq "PHASE7B_GUEST_BOOTSTRAP_FRESH_ATTEMPT_AUTHORIZATION_REQUIRED" -and -not $preMutationRecovery.currentDiskResumeAllowed) "pre-mutation failure still prohibits automatic retry"
    $inconsistentS1Rejected = $false
    try { [void](Get-Phase7BGuestBootstrapRecoveryDecision -MutationStarted $true -AcceptedPass $false -S1SnapshotExists $true) } catch { $inconsistentS1Rejected = $_.Exception.Message -eq "PHASE7B_FAILED_BOOTSTRAP_WITH_S1_INCONSISTENT" }
    Assert-True $inconsistentS1Rejected "failed bootstrap with S1 fails closed"
  } finally {
    $env:Path = $originalProcessPath
  }

  $credentialRoot = Join-Path $testRoot "credential-scan"
  New-Item -ItemType Directory -Path (Join-Path $credentialRoot "private\founder") -Force | Out-Null
  "fixture-only" | Set-Content -LiteralPath (Join-Path $credentialRoot ".env.production") -Encoding ASCII
  "fixture-only" | Set-Content -LiteralPath (Join-Path $credentialRoot "private\founder\record.json") -Encoding ASCII
  "fixture-only" | Set-Content -LiteralPath (Join-Path $credentialRoot "attempt.credential.clixml") -Encoding ASCII
  $signals = @(Find-Phase7BForbiddenCredentialSignals -RepositoryRoot $credentialRoot)
  Assert-True ($signals.Count -eq 3) "credential/private data fixtures rejected"
  Assert-True (@($signals.PSObject.Properties.Name | Where-Object { $_ -match '(?i)value|content|secret' }).Count -eq 0) "credential scan has no content field"

  $productionArgs = "`"$($contract.repositoryRoot)\node_modules\next\dist\bin\next`" start --hostname 0.0.0.0 --port 3000"
  $monitorArgs = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$($contract.repositoryRoot)\scripts\monitorPhysiqueOS.ps1`""
  $tasks = @(
    (Get-Phase7BSafeTaskProjection -TaskName $contract.productionTaskName -Execute "C:\Program Files\nodejs\node.exe" -Arguments $productionArgs -WorkingDirectory $contract.repositoryRoot -LogonType "S4U" -RunLevel "Limited" -MultipleInstances "IgnoreNew" -ExecutionTimeLimit "PT0S" -Enabled $false -TriggerTypes @("MSFT_TaskLogonTrigger") -RepetitionIntervals @()),
    (Get-Phase7BSafeTaskProjection -TaskName $contract.monitorTaskName -Execute "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" -Arguments $monitorArgs -WorkingDirectory $contract.repositoryRoot -LogonType "S4U" -RunLevel "Limited" -MultipleInstances "IgnoreNew" -ExecutionTimeLimit "PT30S" -Enabled $false -TriggerTypes @("MSFT_TaskLogonTrigger", "MSFT_TaskTimeTrigger") -RepetitionIntervals @("PT1M")),
    (Get-Phase7BSafeTaskProjection -TaskName $contract.ngrokTaskName -Execute "$($contract.ngrokRoot)\ngrok.exe" -Arguments "http 3000" -WorkingDirectory $contract.ngrokRoot -LogonType "S4U" -RunLevel "Limited" -MultipleInstances "IgnoreNew" -ExecutionTimeLimit "PT0S" -Enabled $false -TriggerTypes @() -RepetitionIntervals @())
  )
  $taskSet = Test-Phase7BInertTaskSet -TaskProjections $tasks -Contract $contract
  Assert-True $taskSet.pass "exact disabled task set accepted"
  $tasks[0].enabled = $true
  $activeTaskSet = Test-Phase7BInertTaskSet -TaskProjections $tasks -Contract $contract
  Assert-True (-not $activeTaskSet.pass) "enabled production task rejected"
  $tasks[0].enabled = $false
  $tasks[1].argumentsSha256 = Get-Phase7BSha256 -Text "wrong"
  $wrongTaskSet = Test-Phase7BInertTaskSet -TaskProjections $tasks -Contract $contract
  Assert-True (-not $wrongTaskSet.pass) "wrong monitor definition rejected"

  $scriptPaths = @(
    "phase7bIsolatedGuestContract.psm1",
    "phase7bVmwareHostPreflight.ps1",
    "phase7bIsolatedGuestBootstrap.ps1",
    "phase7bIsolatedGuestRestoreInterface.ps1",
    "phase7bBuildVmwareGuestBootstrapKit.ps1",
    "phase7bBuildVmwareGuestBootstrapIso.ps1",
    "phase7bIsolatedGuestPreparation.test.ps1"
  ) | ForEach-Object { Join-Path $PSScriptRoot $_ }
  foreach ($path in $scriptPaths) {
    $tokens = $null; $errors = $null
    [void][Management.Automation.Language.Parser]::ParseFile($path, [ref]$tokens, [ref]$errors)
    Assert-True (@($errors).Count -eq 0) "PowerShell 5.1 AST parse: $(Split-Path -Leaf $path)"
  }

  $restoreScript = Join-Path $PSScriptRoot "phase7bIsolatedGuestRestoreInterface.ps1"
  $restoreText = Get-Content -LiteralPath $restoreScript -Raw
  Assert-True ($restoreText.Contains('PHASE7B_WORK_PACKAGE2_NOT_AUTHORIZED')) "WP2 mutation boundary is explicit"
  Assert-True ($restoreText.IndexOf('PHASE7B_WORK_PACKAGE2_NOT_AUTHORIZED') -lt $restoreText.IndexOf('$incoming =')) "WP2 mutation rejects before path operations"
  $restoreProcess = Start-Process -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -ArgumentList @("-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", $restoreScript, "-Operation", "DecryptAndRestore") -Wait -PassThru -WindowStyle Hidden
  Assert-True ($restoreProcess.ExitCode -ne 0) "WP2 unauthorized mutation command exits nonzero"
  $bootstrapText = Get-Content -LiteralPath (Join-Path $PSScriptRoot "phase7bIsolatedGuestBootstrap.ps1") -Raw
  Assert-True ($bootstrapText.Contains('$identity.classification')) "wrong host fails closed"
  Assert-True ($bootstrapText.Contains('C:\Program Files\VMware\VMware Tools\VMwareHgfsClient.exe')) "bootstrap uses the Windows VMware HGFS client path"
  Assert-True (-not $bootstrapText.Contains('C:\Program Files\VMware\VMware Tools\vmware-hgfsclient.exe')) "bootstrap excludes the Linux-style HGFS client path"
  Assert-True ($bootstrapText.Contains('Win32_SystemDriver') -and $bootstrapText.Contains('Win32_LogicalDisk') -and $bootstrapText.Contains('Win32_NetworkConnection')) "bootstrap collects corroborating driver and mapped-HGFS evidence"
  Assert-True ($bootstrapText.IndexOf('Set-Phase7BDeterministicToolEnvironment') -lt $bootstrapText.IndexOf('Initialize-Phase7BRepository -Prerequisites')) "bootstrap establishes deterministic PATH before npm ci"
  Assert-True ($bootstrapText.Contains('toolEnvironment = if ($toolEnvironmentState)')) "bootstrap report includes deterministic tool evidence"
  Assert-True ($bootstrapText.Contains('$credentialSignalsFinal = @(')) "post-marker credential projection preserves zero-result array cardinality"
  Assert-True (-not $bootstrapText.Contains('$credentialSignalsFinal = if ($repoPresent)')) "post-marker credential projection excludes conditional output unwrapping"

  $zeroFinalCredentialSignals = @(
    if ($true) { @() }
  )
  Assert-True ($zeroFinalCredentialSignals.Count -eq 0) "PowerShell 5.1 zero final credential signals remain an empty array"
  $oneFinalCredentialSignals = @(
    if ($true) { [pscustomobject]@{ relativePath = ".env.fixture" } }
  )
  Assert-True ($oneFinalCredentialSignals.Count -eq 1) "PowerShell 5.1 one final credential signal remains a one-element array"

  $postMarkerNonce = [Guid]::NewGuid().ToString("N")
  $postMarkerReportPath = Join-Path $testRoot "guest-bootstrap-$postMarkerNonce.json"
  $postMarkerReport = [ordered]@{
    schemaVersion = 1
    nonce = $postMarkerNonce
    pass = $zeroFinalCredentialSignals.Count -eq 0
    classification = "PHASE7B_VMWARE_GUEST_BOOTSTRAP_PASS_INERT"
    credentials = [ordered]@{
      pass = $zeroFinalCredentialSignals.Count -eq 0
      signalCount = $zeroFinalCredentialSignals.Count
      signalPaths = @($zeroFinalCredentialSignals | ForEach-Object { $_.relativePath })
    }
  }
  $postMarkerReport | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $postMarkerReportPath -Encoding UTF8
  $postMarkerPersisted = Get-Content -LiteralPath $postMarkerReportPath -Raw | ConvertFrom-Json
  Assert-True (Test-Path -LiteralPath $postMarkerReportPath -PathType Leaf) "post-marker nonce-bound report persists"
  Assert-True ([string]$postMarkerPersisted.nonce -eq $postMarkerNonce) "post-marker report nonce/path construction is exact"
  Assert-True ([bool]$postMarkerPersisted.pass -and [bool]$postMarkerPersisted.credentials.pass) "post-marker report accepts zero credential signals"
  Assert-True ([int]$postMarkerPersisted.credentials.signalCount -eq 0) "post-marker report serializes zero credential signal count"
  Assert-True (@($postMarkerPersisted.credentials.signalPaths).Count -eq 0) "post-marker report serializes empty credential signal paths"
  Assert-True (-not ($bootstrapText -match '(?i)(token|password|secret)\s*=\s*["''][^"'']{8,}["'']')) "no embedded credential literals"
  $hostPreflightText = Get-Content -LiteralPath (Join-Path $PSScriptRoot "phase7bVmwareHostPreflight.ps1") -Raw
  Assert-True ($hostPreflightText.Contains('ValidateSet("HostBaseline", "FullVm", "BootstrapReady")')) "preflight exposes host, VM, and bootstrap-bound modes"
  Assert-True ($hostPreflightText.Contains('PHASE7B_VMX_REQUIRED_FOR_FULL_PREFLIGHT')) "full VM preflight still requires exact VMX"
  Assert-True ($hostPreflightText.Contains('VMWARE_HOST_BASELINE_PREFLIGHT_PASS')) "host baseline has distinct pass classification"
  Assert-True ($hostPreflightText.Contains('VMWARE_BOOTSTRAP_READY_PREFLIGHT_PASS')) "bootstrap-ready preflight has distinct pass classification"
  Assert-True ($hostPreflightText.Contains('Test-Phase7BBootstrapOpticalContract')) "bootstrap-ready preflight binds optical identity"
  Assert-True ($hostPreflightText.Contains('hostPreflightElevated')) "host preflight records elevation as a distinct check"
  Assert-True ($hostPreflightText.Contains('UNREADABLE_REQUIRES_ELEVATION')) "VMP evidence fails closed when elevation is unavailable"

  $kitOutputDirectory = Join-Path $testRoot "kit"
  $builderOutput = @(& (Join-Path $PSScriptRoot "phase7bBuildVmwareGuestBootstrapKit.ps1") -OutputDirectory $kitOutputDirectory -ToolingCommit "TEST_TOOLING_COMMIT") -join [Environment]::NewLine
  $builderResult = $builderOutput | ConvertFrom-Json
  Assert-True ($builderResult.classification -eq "PHASE7B_VMWARE_GUEST_BOOTSTRAP_KIT_BUILT") "kit builder classification"
  Assert-True (Test-Path -LiteralPath $builderResult.archivePath -PathType Leaf) "kit archive exists"
  $kitManifestPath = Join-Path $kitOutputDirectory "phase7b-vmware-guest-bootstrap-kit-manifest.json"
  $kitManifest = Get-Content -LiteralPath $kitManifestPath -Raw | ConvertFrom-Json
  $kitHashFailures = @($kitManifest.files | Where-Object { (Get-Phase7BSha256 -LiteralPath (Join-Path $kitOutputDirectory $_.relativePath)) -ne $_.sha256 })
  Assert-True ($kitHashFailures.Count -eq 0) "kit manifest hashes all payload files"
  foreach ($requiredRestoreDependency in @('phase7bWorkPackage2Contract.psm1','phase7bIsolatedGuestReconciliation.psm1','phase7bWindowsAgeIdentityBridge.psm1')) {
    Assert-True (@($kitManifest.files | Where-Object { [string]$_.relativePath -ceq $requiredRestoreDependency }).Count -eq 1) "kit includes restore dependency $requiredRestoreDependency"
  }
  $kitRestoreInspect = @(& "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $kitOutputDirectory 'phase7bIsolatedGuestRestoreInterface.ps1') -Operation Inspect 2>&1)
  $kitRestoreInspectExit = $LASTEXITCODE
  $kitRestoreInspectResult = ($kitRestoreInspect -join [Environment]::NewLine) | ConvertFrom-Json -ErrorAction Stop
  Assert-True ($kitRestoreInspectExit -ne 0 -and [string]$kitRestoreInspectResult.classification -ceq 'WP2_INTERFACE_PATHS_MISSING' -and
    -not [bool]$kitRestoreInspectResult.mutationPerformed) "kit-local restore interface resolves native identity dependencies in fresh PowerShell 5.1 and fails only on absent synthetic guest paths"
  Assert-True ($kitManifest.applicationCommit -eq $contract.applicationCommit) "kit keeps accepted application commit"
  $kitText = @((Get-ChildItem -LiteralPath $kitOutputDirectory -File | ForEach-Object { Get-Content -LiteralPath $_.FullName -Raw })) -join [Environment]::NewLine
  Assert-True (-not ($kitText -match '(?i)dop_v1_[A-Za-z0-9_-]{20,}|-----BEGIN (?:RSA|OPENSSH|EC) PRIVATE KEY-----')) "kit contains no concrete credential/private-key material"

  $isoPath = Join-Path $testRoot "phase7b-bootstrap.iso"
  $isoOutput = @(& (Join-Path $PSScriptRoot "phase7bBuildVmwareGuestBootstrapIso.ps1") -KitDirectory $kitOutputDirectory -OutputPath $isoPath) -join [Environment]::NewLine
  $isoResult = $isoOutput | ConvertFrom-Json
  Assert-True ($isoResult.classification -eq "PHASE7B_VMWARE_GUEST_BOOTSTRAP_ISO_BUILT") "bootstrap ISO builder classification"
  Assert-True (Test-Path -LiteralPath $isoResult.outputPath -PathType Leaf) "bootstrap ISO exists"
  Assert-True ($isoResult.outputBytes -gt 32774) "bootstrap ISO has an ISO9660 volume descriptor"
  Assert-True (-not $isoResult.productionCredentialsIncluded) "bootstrap ISO excludes production credentials"
  Assert-True (-not $isoResult.workPackage2Authorized) "bootstrap ISO does not authorize work package 2"
  Assert-True ($isoResult.volumeName -eq $contract.bootstrapIsoVolumeLabel) "bootstrap ISO uses the Joliet-safe contract label"
  Assert-True ($isoResult.primaryVolumeLabel -eq $contract.bootstrapIsoVolumeLabel) "primary ISO label is exact"
  Assert-True ($isoResult.jolietVolumeLabel -eq $contract.bootstrapIsoVolumeLabel) "Windows-visible Joliet label is exact"

  $boundOpticalVmx = @{} + $validVmx
  $boundOpticalVmx["sata0:1.present"] = "TRUE"
  $boundOpticalVmx["sata0:1.devicetype"] = "cdrom-image"
  $boundOpticalVmx["sata0:1.filename"] = $isoPath
  $isoHash = Get-Phase7BSha256 -LiteralPath $isoPath
  $opticalContract = Test-Phase7BBootstrapOpticalContract -Vmx $boundOpticalVmx -VmxPath $validVmxPath -ExpectedIsoPath $isoPath -ExpectedIsoSha256 $isoHash -Contract $contract
  Assert-True $opticalContract.pass "exact optical path/hash/primary/Joliet binding accepted"
  $wrongHashContract = Test-Phase7BBootstrapOpticalContract -Vmx $boundOpticalVmx -VmxPath $validVmxPath -ExpectedIsoPath $isoPath -ExpectedIsoSha256 ("0" * 64) -Contract $contract
  Assert-True (-not $wrongHashContract.pass) "wrong optical hash rejected"

  $wrongLabelIso = Join-Path $testRoot "phase7b-bootstrap-wrong-label.iso"
  Copy-Item -LiteralPath $isoPath -Destination $wrongLabelIso
  $wrongLabelStream = [IO.File]::Open($wrongLabelIso, [IO.FileMode]::Open, [IO.FileAccess]::Write, [IO.FileShare]::None)
  try {
    [void]$wrongLabelStream.Seek((17 * 2048) + 40, [IO.SeekOrigin]::Begin)
    $wrongLabelBytes = [Text.Encoding]::BigEndianUnicode.GetBytes("WRONG_LABEL".PadRight(16))
    $wrongLabelStream.Write($wrongLabelBytes, 0, $wrongLabelBytes.Length)
  } finally { $wrongLabelStream.Dispose() }
  $wrongLabelVmx = @{} + $boundOpticalVmx
  $wrongLabelVmx["sata0:1.filename"] = $wrongLabelIso
  $wrongLabelContract = Test-Phase7BBootstrapOpticalContract -Vmx $wrongLabelVmx -VmxPath $validVmxPath -ExpectedIsoPath $wrongLabelIso -ExpectedIsoSha256 (Get-Phase7BSha256 -LiteralPath $wrongLabelIso) -Contract $contract
  Assert-True (-not $wrongLabelContract.pass) "Windows-visible Joliet label mismatch rejected"

  [ordered]@{
    classification = "PHASE7B_ISOLATED_GUEST_PREPARATION_TESTS_PASS"
    pass = $true
    assertions = $passCount
    applicationCommit = $contract.applicationCommit
  } | ConvertTo-Json -Compress
} finally {
  if (Test-Path -LiteralPath $testRoot) {
    $resolved = (Resolve-Path -LiteralPath $testRoot).Path
    $expectedPrefix = (Resolve-Path -LiteralPath (Join-Path $repositoryRoot ".tmp")).Path + "\phase7b-isolated-guest-tests-"
    if ($resolved.StartsWith($expectedPrefix, [StringComparison]::OrdinalIgnoreCase)) { Remove-Item -LiteralPath $resolved -Recurse -Force }
  }
}
