[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$VmxPath,
  [Parameter()][string]$ReportPath
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot "phase7bIsolatedGuestContract.psm1") -Force

$contract = Get-Phase7BIsolatedGuestContract
$nonce = [Guid]::NewGuid().ToString("N")
$timestamp = [DateTime]::UtcNow.ToString("o")
if ([string]::IsNullOrWhiteSpace($ReportPath)) {
  $ReportPath = Join-Path $env:TEMP "phase7b-vmware-host-preflight-$nonce.json"
}

try {
  $vmx = Read-Phase7BVmx -LiteralPath $VmxPath
  $vmxContract = Test-Phase7BVmxContract -Vmx $vmx -Contract $contract
  $diskContract = Test-Phase7BVmdkContract -Vmx $vmx -VmxPath (Resolve-Path -LiteralPath $VmxPath).Path -Contract $contract
  $os = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
  $availableMemoryGiB = [Math]::Round(([double]$os.FreePhysicalMemory * 1KB / 1GB), 2)
  $systemDrive = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'" -ErrorAction Stop
  $freeDiskGiB = [Math]::Round(([double]$systemDrive.FreeSpace / 1GB), 2)
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
  if ($vmwareInstalled) {
    $running = @(& $vmrunPath[0] list 2>$null)
    $vmRunning = @($running | Where-Object { $_.Trim() -ieq (Resolve-Path -LiteralPath $VmxPath).Path }).Count -gt 0
  }

  $runtimeStatus = $null
  $runtimeStatusScript = Join-Path $PSScriptRoot "statusPhysiqueOS.ps1"
  if (Test-Path -LiteralPath $runtimeStatusScript -PathType Leaf) {
    try { $runtimeStatus = & $runtimeStatusScript | ConvertFrom-Json } catch { $runtimeStatus = $null }
  }
  $productionHealthy = [bool]($runtimeStatus -and $runtimeStatus.overallState -eq "healthy" -and $runtimeStatus.health.ok -and $runtimeStatus.ownership.ownershipDecision -eq "canonical")
  $checks = [ordered]@{
    vmxContract = [bool]$vmxContract.pass
    vmdkContract = [bool]$diskContract.pass
    vmwareWorkstation26H1Available = $vmwareVersionAccepted
    targetVmPoweredOff = -not $vmRunning
    availableMemoryAtLeast7GiB = $availableMemoryGiB -ge 7
    systemDriveFreeAtLeast120GiB = $freeDiskGiB -ge 120
    founderProductionRuntimeHealthy = $productionHealthy
  }
  $pass = @($checks.Values | Where-Object { -not $_ }).Count -eq 0
  $report = [ordered]@{
    schemaVersion = 1
    nonce = $nonce
    observedAt = $timestamp
    classification = if ($pass) { "VMWARE_HOST_PREFLIGHT_PASS" } else { "VMWARE_HOST_PREFLIGHT_FAIL" }
    pass = $pass
    acceptedApplicationCommit = $contract.applicationCommit
    vmDisplayName = $contract.vmDisplayName
    vmxPath = (Resolve-Path -LiteralPath $VmxPath).Path
    checks = $checks
    safeEvidence = [ordered]@{
      availableMemoryGiB = $availableMemoryGiB
      systemDriveFreeGiB = $freeDiskGiB
      vmwareWorkstationDetected = $vmwareInstalled
      vmwareDisplayVersion = $vmwareDisplayVersion
      targetVmRunning = $vmRunning
      vmxFailures = @($vmxContract.failures)
      vmdkFailures = @($diskContract.failures)
      vmdkCapacityGiB = $diskContract.capacityGiB
      vmdkCreateType = $diskContract.createType
    }
  }
  $json = $report | ConvertTo-Json -Depth 8
  $json | Set-Content -LiteralPath $ReportPath -Encoding UTF8
  $json
  if (-not $pass) { exit 1 }
} catch {
  [ordered]@{
    schemaVersion = 1; nonce = $nonce; observedAt = $timestamp; pass = $false
    classification = "VMWARE_HOST_PREFLIGHT_ERROR"; safeErrorCode = "HOST_PREFLIGHT_EXCEPTION"
  } | ConvertTo-Json -Compress
  exit 1
}
