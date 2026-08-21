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
isolation.tools.hgfs.disable = "TRUE"
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

  $invalidVmx = @{} + $validVmx
  $invalidVmx["ethernet0.connectiontype"] = "bridged"
  $invalidVmx["isolation.tools.copy.disable"] = "FALSE"
  $invalidResult = Test-Phase7BVmxContract -Vmx $invalidVmx -Contract $contract
  Assert-True (-not $invalidResult.pass) "bridged/clipboard VMX rejected"
  $invalidDiskVmx = @{} + $validVmx
  $invalidDiskVmx["sata0:1.filename"] = "extra.vmdk"
  $invalidDisk = Test-Phase7BVmdkContract -Vmx $invalidDiskVmx -VmxPath $validVmxPath -Contract $contract
  Assert-True (-not $invalidDisk.pass) "second virtual disk rejected"

  $guestIdentity = Test-Phase7BVmwareGuestIdentity -Manufacturer "VMware, Inc." -Model "VMware Virtual Platform" -ToolsServicePresent $true -ToolsExecutablePresent $true -SharedFolderEnumerationAvailable $true -SharedFolderNames @()
  Assert-True $guestIdentity.pass "exact VMware guest accepted"
  $physicalIdentity = Test-Phase7BVmwareGuestIdentity -Manufacturer "ASUSTeK COMPUTER INC." -Model "Founder PC" -ToolsServicePresent $false -ToolsExecutablePresent $false -SharedFolderEnumerationAvailable $false -SharedFolderNames @()
  Assert-True (-not $physicalIdentity.pass) "Founder physical host rejected"
  $sharedIdentity = Test-Phase7BVmwareGuestIdentity -Manufacturer "VMware, Inc." -Model "VMware Virtual Platform" -ToolsServicePresent $true -ToolsExecutablePresent $true -SharedFolderEnumerationAvailable $true -SharedFolderNames @("dangerous-share")
  Assert-True (-not $sharedIdentity.pass) "VMware guest shared folder rejected"
  $unprovenSharedIdentity = Test-Phase7BVmwareGuestIdentity -Manufacturer "VMware, Inc." -Model "VMware Virtual Platform" -ToolsServicePresent $true -ToolsExecutablePresent $true -SharedFolderEnumerationAvailable $false -SharedFolderNames @()
  Assert-True (-not $unprovenSharedIdentity.pass) "unavailable shared-folder enumeration rejected"

  $paths = Test-Phase7BGuestPathContract -RepositoryRoot $contract.repositoryRoot -IsolatedRoot $contract.isolatedRoot -Contract $contract
  Assert-True $paths.pass "exact guest paths accepted"
  $wrongPaths = Test-Phase7BGuestPathContract -RepositoryRoot "C:\Users\founder\repo" -IsolatedRoot $contract.isolatedRoot -Contract $contract
  Assert-True (-not $wrongPaths.pass) "portable but non-contract path rejected"

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
  Assert-True (-not ($bootstrapText -match '(?i)(token|password|secret)\s*=\s*["''][^"'']{8,}["'']')) "no embedded credential literals"
  $hostPreflightText = Get-Content -LiteralPath (Join-Path $PSScriptRoot "phase7bVmwareHostPreflight.ps1") -Raw
  Assert-True ($hostPreflightText.Contains('ValidateSet("HostBaseline", "FullVm")')) "preflight exposes explicit pre-install host baseline mode"
  Assert-True ($hostPreflightText.Contains('PHASE7B_VMX_REQUIRED_FOR_FULL_PREFLIGHT')) "full VM preflight still requires exact VMX"
  Assert-True ($hostPreflightText.Contains('VMWARE_HOST_BASELINE_PREFLIGHT_PASS')) "host baseline has distinct pass classification"

  $kitOutputDirectory = Join-Path $testRoot "kit"
  $builderOutput = @(& (Join-Path $PSScriptRoot "phase7bBuildVmwareGuestBootstrapKit.ps1") -OutputDirectory $kitOutputDirectory -ToolingCommit "TEST_TOOLING_COMMIT") -join [Environment]::NewLine
  $builderResult = $builderOutput | ConvertFrom-Json
  Assert-True ($builderResult.classification -eq "PHASE7B_VMWARE_GUEST_BOOTSTRAP_KIT_BUILT") "kit builder classification"
  Assert-True (Test-Path -LiteralPath $builderResult.archivePath -PathType Leaf) "kit archive exists"
  $kitManifestPath = Join-Path $kitOutputDirectory "phase7b-vmware-guest-bootstrap-kit-manifest.json"
  $kitManifest = Get-Content -LiteralPath $kitManifestPath -Raw | ConvertFrom-Json
  $kitHashFailures = @($kitManifest.files | Where-Object { (Get-Phase7BSha256 -LiteralPath (Join-Path $kitOutputDirectory $_.relativePath)) -ne $_.sha256 })
  Assert-True ($kitHashFailures.Count -eq 0) "kit manifest hashes all payload files"
  Assert-True ($kitManifest.applicationCommit -eq $contract.applicationCommit) "kit keeps accepted application commit"
  $kitText = @((Get-ChildItem -LiteralPath $kitOutputDirectory -File | ForEach-Object { Get-Content -LiteralPath $_.FullName -Raw })) -join [Environment]::NewLine
  Assert-True (-not ($kitText -match '(?i)dop_v1_|BEGIN (?:RSA|OPENSSH|EC) PRIVATE KEY')) "kit contains no credential/private-key material"

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
