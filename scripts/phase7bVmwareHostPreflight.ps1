[CmdletBinding()]
param(
  [Parameter()][ValidateSet("HostBaseline", "FullVm")][string]$Mode = "FullVm",
  [Parameter()][string]$VmxPath,
  [Parameter()][string]$ReportPath
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot "phase7bIsolatedGuestContract.psm1") -Force

$contract = Get-Phase7BIsolatedGuestContract
$nonce = [Guid]::NewGuid().ToString("N")
$timestamp = [DateTime]::UtcNow.ToString("o")
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if ([string]::IsNullOrWhiteSpace($ReportPath)) {
  $ReportPath = Join-Path $repositoryRoot ".tmp\phase7b-vmware-host-preflight-$nonce.json"
}

try {
  $os = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
  $computer = Get-CimInstance Win32_ComputerSystem -ErrorAction Stop
  $availableMemoryGiB = [Math]::Round(([double]$os.FreePhysicalMemory * 1KB / 1GB), 2)
  $systemDrive = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'" -ErrorAction Stop
  $freeDiskGiB = [Math]::Round(([double]$systemDrive.FreeSpace / 1GB), 2)
  $repositoryPathExact = $repositoryRoot.TrimEnd('\') -ieq $contract.repositoryRoot.TrimEnd('\')
  $branch = @(& git -C $repositoryRoot branch --show-current 2>$null)
  $repositoryBranchExact = $LASTEXITCODE -eq 0 -and ($branch -join "").Trim() -eq $contract.applicationBranch
  $windows11Host = [string]$os.Caption -match 'Windows 11' -and [string]$os.OSArchitecture -eq '64-bit'
  $virtualMachinePlatform = Get-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform -ErrorAction SilentlyContinue
  $hostVirtualizationContract = [bool]($computer.HypervisorPresent -and $virtualMachinePlatform -and [string]$virtualMachinePlatform.State -eq "Enabled")
  $vmrunCandidates = @(
    "C:\Program Files (x86)\VMware\VMware Workstation\vmrun.exe",
    "C:\Program Files\VMware\VMware Workstation\vmrun.exe"
  )
  $vmrunPath = @($vmrunCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1)
  $vmwareInstalled = $vmrunPath.Count -eq 1
  $vmwareDisplayVersion = $null
  $vmwareProduct = @(Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*", "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*" -ErrorAction SilentlyContinue |
    Where-Object { [string]$_.DisplayName -match '^VMware Workstation' } | Select-Object -First 1)
  if ($vmwareProduct.Count -eq 1) { $vmwareDisplayVersion = [string]$vmwareProduct[0].DisplayVersion }
  $vmwareVersionAccepted = $vmwareInstalled -and $vmwareDisplayVersion -match '^(?:26\.|26H1)'
  $vmRunning = $false

  $runtimeStatus = $null
  $runtimeStatusScript = Join-Path $PSScriptRoot "statusPhysiqueOS.ps1"
  if (Test-Path -LiteralPath $runtimeStatusScript -PathType Leaf) {
    try { $runtimeStatus = & $runtimeStatusScript | ConvertFrom-Json } catch { $runtimeStatus = $null }
  }
  $productionHealthy = [bool]($runtimeStatus -and $runtimeStatus.overallState -eq "healthy" -and $runtimeStatus.health.ok -and $runtimeStatus.ownership.ownershipDecision -eq "canonical")
  $checks = [ordered]@{
    founderRepositoryPathExact = $repositoryPathExact
    founderRepositoryBranchExact = $repositoryBranchExact
    windows11Host64Bit = $windows11Host
    virtualMachinePlatformAndHypervisorPresent = $hostVirtualizationContract
    availableMemoryAtLeast7GiB = $availableMemoryGiB -ge 7
    systemDriveFreeAtLeast120GiB = $freeDiskGiB -ge 120
    founderProductionRuntimeHealthy = $productionHealthy
  }
  $vmxContract = $null
  $diskContract = $null
  $resolvedVmxPath = $null
  if ($Mode -eq "FullVm") {
    if ([string]::IsNullOrWhiteSpace($VmxPath)) { throw "PHASE7B_VMX_REQUIRED_FOR_FULL_PREFLIGHT" }
    $resolvedVmxPath = (Resolve-Path -LiteralPath $VmxPath -ErrorAction Stop).Path
    if ($vmwareInstalled) {
      $running = @(& $vmrunPath[0] list 2>$null)
      $vmRunning = @($running | Where-Object { $_.Trim() -ieq $resolvedVmxPath }).Count -gt 0
    }
    $vmx = Read-Phase7BVmx -LiteralPath $resolvedVmxPath
    $vmxContract = Test-Phase7BVmxContract -Vmx $vmx -Contract $contract
    $diskContract = Test-Phase7BVmdkContract -Vmx $vmx -VmxPath $resolvedVmxPath -Contract $contract
    $checks.vmxContract = [bool]$vmxContract.pass
    $checks.vmdkContract = [bool]$diskContract.pass
    $checks.vmwareWorkstation26H1Available = $vmwareVersionAccepted
    $checks.targetVmPoweredOff = -not $vmRunning
  }
  $pass = @($checks.Values | Where-Object { -not $_ }).Count -eq 0
  $report = [ordered]@{
    schemaVersion = 1
    nonce = $nonce
    observedAt = $timestamp
    mode = $Mode
    classification = if ($pass) { if ($Mode -eq "HostBaseline") { "VMWARE_HOST_BASELINE_PREFLIGHT_PASS" } else { "VMWARE_HOST_PREFLIGHT_PASS" } } else { if ($Mode -eq "HostBaseline") { "VMWARE_HOST_BASELINE_PREFLIGHT_FAIL" } else { "VMWARE_HOST_PREFLIGHT_FAIL" } }
    pass = $pass
    acceptedApplicationCommit = $contract.applicationCommit
    vmDisplayName = $contract.vmDisplayName
    vmxPath = $resolvedVmxPath
    checks = $checks
    safeEvidence = [ordered]@{
      availableMemoryGiB = $availableMemoryGiB
      systemDriveFreeGiB = $freeDiskGiB
      vmwareWorkstationDetected = $vmwareInstalled
      vmwareDisplayVersion = $vmwareDisplayVersion
      targetVmRunning = $vmRunning
      vmxFailures = if ($vmxContract) { @($vmxContract.failures) } else { @() }
      vmdkFailures = if ($diskContract) { @($diskContract.failures) } else { @() }
      vmdkCapacityGiB = if ($diskContract) { $diskContract.capacityGiB } else { $null }
      vmdkCreateType = if ($diskContract) { $diskContract.createType } else { $null }
      windowsCaption = [string]$os.Caption
      windowsArchitecture = [string]$os.OSArchitecture
      hypervisorPresent = [bool]$computer.HypervisorPresent
      virtualMachinePlatformState = if ($virtualMachinePlatform) { [string]$virtualMachinePlatform.State } else { "Unavailable" }
      repositoryPathExact = $repositoryPathExact
      repositoryBranch = ($branch -join "").Trim()
    }
  }
  $json = $report | ConvertTo-Json -Depth 8
  $json | Set-Content -LiteralPath $ReportPath -Encoding UTF8
  $json
  if (-not $pass) { exit 1 }
} catch {
  $safeCode = if ([string]$_.Exception.Message -match '^PHASE7B_[A-Z0-9_:.-]+$') { [string]$_.Exception.Message } else { "HOST_PREFLIGHT_EXCEPTION" }
  [ordered]@{
    schemaVersion = 1; nonce = $nonce; observedAt = $timestamp; pass = $false
    classification = "VMWARE_HOST_PREFLIGHT_ERROR"; safeErrorCode = $safeCode
  } | ConvertTo-Json -Compress
  exit 1
}
