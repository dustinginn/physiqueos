Set-StrictMode -Version Latest

function Get-Phase7BIsolatedGuestContract {
  [CmdletBinding()]
  param()

  [pscustomobject][ordered]@{
    schemaVersion = 1
    shortIdentity = "379bb303"
    applicationCommit = "379bb30391cfb7ed912e4757c77604e859b8a599"
    applicationBranch = "combined-app-platform-cutover"
    repositoryUrl = "https://github.com/dustinginn/physiqueos.git"
    manifestDigest = "134bb6b4fd81e067c5c77fc1b5574373b62d4f6d033f14ed7c6afa4db40f557d"
    manifestFileSha256 = "a9947b7e03d062bbe3c843ca2bb79bef55d48c5723d008f0fddcd3098f750cde"
    environmentId = "phase7b-isolated-exercise-379bb303"
    exerciseId = "phase7b-cp9-exercise-379bb303"
    runId = "phase7b-cp9-run-379bb303"
    coordinatorOperationId = "phase7b-cp9-coordinator-379bb303"
    migrationOperationId = "phase7b-cp9-migration-379bb303"
    firstProviderCommandId = "phase7b-cp9-379bb303:first-provider-command"
    syntheticOwnerId = "phase5-synthetic-user"
    datasetId = "phase7b-cp9-synthetic-358-379bb303"
    databaseName = "physiqueos_phase5_restore_provider_phase7b_cp9_379bb303"
    restoreBucket = "physiqueos-phase7b-isolated-379bb303"
    backupBucket = "physiqueos-phase7b-backup-379bb303"
    windowsHostId = "phase7b-isolated-windows-restore-379bb303"
    windowsRuntimeId = "phase7b-cp9-windows-runtime-379bb303"
    appId = "bf57cf56-48cc-4cd6-90e4-a23ee5381741"
    vmDisplayName = "phase7b-isolated-windows-restore-379bb303"
    vmProcessorCount = 2
    vmMemoryMiB = 4096
    vmDiskGiB = 80
    vmNetwork = "nat"
    repositoryRoot = "C:\Users\dusti\Documents\GitHub\physiqueos"
    isolatedRoot = "C:\Phase7B\isolated\379bb303"
    ngrokRoot = "C:\Users\dusti\AppData\Local\ngrok"
    productionTaskName = "PhysiqueOS Production Server"
    monitorTaskName = "PhysiqueOS Runtime Monitor"
    ngrokTaskName = "PhysiqueOS Ngrok Tunnel"
  }
}

function Get-Phase7BSha256 {
  [CmdletBinding(DefaultParameterSetName = "Text")]
  param(
    [Parameter(Mandatory = $true, ParameterSetName = "Text")][AllowEmptyString()][string]$Text,
    [Parameter(Mandatory = $true, ParameterSetName = "File")][string]$LiteralPath
  )

  if ($PSCmdlet.ParameterSetName -eq "File") {
    if (-not (Test-Path -LiteralPath $LiteralPath -PathType Leaf)) { throw "PHASE7B_FILE_NOT_FOUND" }
    return (Get-FileHash -Algorithm SHA256 -LiteralPath $LiteralPath).Hash.ToLowerInvariant()
  }
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Text)))).Replace("-", "").ToLowerInvariant()
  } finally { $sha.Dispose() }
}

function Read-Phase7BVmx {
  [CmdletBinding()]
  param([Parameter(Mandatory = $true)][string]$LiteralPath)

  if (-not (Test-Path -LiteralPath $LiteralPath -PathType Leaf)) { throw "PHASE7B_VMX_NOT_FOUND" }
  $values = @{}
  foreach ($line in Get-Content -LiteralPath $LiteralPath) {
    if ($line -match '^\s*([^#][^=]+?)\s*=\s*"(.*)"\s*$') {
      $values[$matches[1].Trim().ToLowerInvariant()] = $matches[2]
    }
  }
  return $values
}

function Test-Phase7BVmxContract {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][hashtable]$Vmx,
    [Parameter()][psobject]$Contract = (Get-Phase7BIsolatedGuestContract)
  )

  $failures = New-Object System.Collections.Generic.List[string]
  function Require-Value([string]$Name, [string]$Expected) {
    if (-not $Vmx.ContainsKey($Name) -or [string]$Vmx[$Name] -ne $Expected) { $failures.Add("$Name=$Expected") }
  }
  Require-Value "displayname" $Contract.vmDisplayName
  Require-Value "numvcpus" ([string]$Contract.vmProcessorCount)
  Require-Value "memsize" ([string]$Contract.vmMemoryMiB)
  Require-Value "firmware" "efi"
  Require-Value "uefi.secureboot.enabled" "TRUE"
  Require-Value "ethernet0.connectiontype" "nat"
  Require-Value "isolation.tools.copy.disable" "TRUE"
  Require-Value "isolation.tools.paste.disable" "TRUE"
  Require-Value "isolation.tools.dnd.disable" "TRUE"
  Require-Value "isolation.tools.hgfsserverset.disable" "TRUE"
  Require-Value "sharedfolder.maxnum" "0"
  Require-Value "usb.restrictions.defaultallow" "FALSE"

  $guest = if ($Vmx.ContainsKey("guestos")) { [string]$Vmx["guestos"] } else { "" }
  if ($guest -notmatch '(?i)windows11.*-64') { $failures.Add("guestos=Windows 11 64-bit") }
  $tpmPresent = @($Vmx.Keys | Where-Object { $_ -match '^vtpm\.' -and [string]$Vmx[$_] -eq "TRUE" }).Count -gt 0
  $autoTpm = $Vmx.ContainsKey("managedvm.autoaddvtpm") -and [string]$Vmx["managedvm.autoaddvtpm"] -eq "software"
  if (-not ($tpmPresent -or $autoTpm)) { $failures.Add("vtpm=present") }
  if ($Vmx.ContainsKey("ethernet1.present") -and [string]$Vmx["ethernet1.present"] -eq "TRUE") { $failures.Add("ethernet1=absent") }
  if (@($Vmx.Keys | Where-Object { $_ -match '^sharedfolder\d+\.present$' -and [string]$Vmx[$_] -eq "TRUE" }).Count -gt 0) {
    $failures.Add("shared-folders=none")
  }

  [pscustomobject][ordered]@{
    pass = $failures.Count -eq 0
    classification = if ($failures.Count -eq 0) { "VMWARE_HOST_CONTRACT_PASS" } else { "VMWARE_HOST_CONTRACT_FAIL" }
    failures = @($failures)
  }
}

function Test-Phase7BVmdkContract {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][hashtable]$Vmx,
    [Parameter(Mandatory = $true)][string]$VmxPath,
    [Parameter()][psobject]$Contract = (Get-Phase7BIsolatedGuestContract)
  )
  $failures = New-Object System.Collections.Generic.List[string]
  $storageFileKeys = @($Vmx.Keys | Where-Object { $_ -match '^(?:scsi|sata|nvme|ide)\d+:\d+\.filename$' })
  $diskSlots = New-Object System.Collections.Generic.List[string]
  $opticalAttachmentCount = 0
  foreach ($fileKey in $storageFileKeys) {
    $slot = $fileKey.Substring(0, $fileKey.Length - ".filename".Length)
    $fileName = [string]$Vmx[$fileKey]
    $deviceTypeKey = "$slot.devicetype"
    $deviceType = if ($Vmx.ContainsKey($deviceTypeKey)) { [string]$Vmx[$deviceTypeKey] } else { "" }
    $isVirtualDisk = $fileName -match '(?i)\.vmdk$'
    $isOpticalMedia = $deviceType -match '(?i)^cdrom-' -or $fileName -match '(?i)\.iso$'
    if ($isVirtualDisk) {
      $diskSlots.Add($slot)
    } elseif ($isOpticalMedia) {
      $opticalAttachmentCount++
    } else {
      $failures.Add("unsupported-storage-attachment:$slot")
    }
  }
  if ($diskSlots.Count -eq 0) { $failures.Add("single-vmdk-disk=present") }
  if ($diskSlots.Count -gt 1) { $failures.Add("single-disk-only") }
  $descriptorPath = $null
  $capacitySectors = $null
  $createType = $null
  $diskSlot = if ($diskSlots.Count -eq 1) { $diskSlots[0] } else { $null }
  if ($diskSlot) {
    $presentKey = "$diskSlot.present"
    if (-not $Vmx.ContainsKey($presentKey) -or [string]$Vmx[$presentKey] -ne "TRUE") { $failures.Add("$presentKey=TRUE") }
    $descriptorPath = Join-Path (Split-Path -Parent $VmxPath) ([string]$Vmx["$diskSlot.filename"])
    if (-not (Test-Path -LiteralPath $descriptorPath -PathType Leaf)) {
      $failures.Add("vmdk-descriptor=present")
    } else {
      $descriptor = Get-Content -LiteralPath $descriptorPath -Raw -ErrorAction Stop
      $extentMatches = [regex]::Matches($descriptor, '(?m)^RW\s+(\d+)\s+(?:SPARSE|FLAT)\s+')
      if ($extentMatches.Count -gt 0) {
        $capacitySectors = [Int64]0
        foreach ($extentMatch in $extentMatches) { $capacitySectors += [Int64]$extentMatch.Groups[1].Value }
      } else {
        $failures.Add("vmdk-capacity=readable")
      }
      if ($descriptor -match '(?m)^createType="([^"]+)"') { $createType = $matches[1] } else { $failures.Add("vmdk-createType=readable") }
      if ($createType -and $createType -notin @("monolithicSparse", "twoGbMaxExtentSparse")) { $failures.Add("vmdk=dynamically-allocated-sparse") }
      $expectedSectors = [Int64]$Contract.vmDiskGiB * 1024 * 1024 * 1024 / 512
      if ($capacitySectors -and $capacitySectors -ne $expectedSectors) { $failures.Add("vmdk-capacity=$($Contract.vmDiskGiB)GiB") }
    }
  }
  [pscustomobject][ordered]@{
    pass = $failures.Count -eq 0
    classification = if ($failures.Count -eq 0) { "VMWARE_DISK_CONTRACT_PASS" } else { "VMWARE_DISK_CONTRACT_FAIL" }
    diskSlot = $diskSlot
    descriptorPath = $descriptorPath
    capacityGiB = if ($capacitySectors) { [Math]::Round(($capacitySectors * 512 / 1GB), 2) } else { $null }
    createType = $createType
    opticalAttachmentCount = $opticalAttachmentCount
    failures = @($failures)
  }
}

function Test-Phase7BVmwareGuestIdentity {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string]$Manufacturer,
    [Parameter(Mandatory = $true)][string]$Model,
    [Parameter(Mandatory = $true)][bool]$ToolsServicePresent,
    [Parameter(Mandatory = $true)][bool]$ToolsExecutablePresent,
    [Parameter(Mandatory = $true)][bool]$SharedFolderEnumerationAvailable,
    [Parameter(Mandatory = $true)][AllowEmptyCollection()][string[]]$SharedFolderNames
  )

  $isVmware = $Manufacturer.Trim() -eq "VMware, Inc." -and $Model.Trim() -eq "VMware Virtual Platform"
  $pass = $isVmware -and $ToolsServicePresent -and $ToolsExecutablePresent -and $SharedFolderEnumerationAvailable -and @($SharedFolderNames).Count -eq 0
  [pscustomobject][ordered]@{
    pass = $pass
    classification = if ($pass) { "ISOLATED_VMWARE_GUEST_IDENTITY_PASS" } else { "PHASE7B_WRONG_OR_UNISOLATED_WINDOWS_HOST" }
    manufacturer = $Manufacturer
    model = $Model
    vmwareToolsPresent = [bool]($ToolsServicePresent -and $ToolsExecutablePresent)
    sharedFolderEnumerationAvailable = $SharedFolderEnumerationAvailable
    sharedFolderCount = @($SharedFolderNames).Count
  }
}

function Test-Phase7BGuestPathContract {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string]$RepositoryRoot,
    [Parameter(Mandatory = $true)][string]$IsolatedRoot,
    [Parameter()][psobject]$Contract = (Get-Phase7BIsolatedGuestContract)
  )
  $repoExact = $RepositoryRoot.TrimEnd('\') -ieq $Contract.repositoryRoot.TrimEnd('\')
  $isolatedExact = $IsolatedRoot.TrimEnd('\') -ieq $Contract.isolatedRoot.TrimEnd('\')
  [pscustomobject][ordered]@{
    pass = [bool]($repoExact -and $isolatedExact)
    classification = if ($repoExact -and $isolatedExact) { "GUEST_PATH_CONTRACT_PASS" } else { "GUEST_PATH_CONTRACT_FAIL" }
  }
}

function Find-Phase7BForbiddenCredentialSignals {
  [CmdletBinding()]
  param([Parameter(Mandatory = $true)][string]$RepositoryRoot)

  if (-not (Test-Path -LiteralPath $RepositoryRoot -PathType Container)) { return @() }
  $signals = New-Object System.Collections.Generic.List[object]
  $forbiddenNames = @(".env", ".env.local", ".env.production", "ngrok.yml", "ngrok.yaml")
  $excludedDirectories = @(".git", "node_modules", ".next", "logs")
  $pending = New-Object System.Collections.Generic.Stack[string]
  $pending.Push((Resolve-Path -LiteralPath $RepositoryRoot).Path)
  while ($pending.Count -gt 0) {
    $directory = $pending.Pop()
    foreach ($childDirectory in Get-ChildItem -LiteralPath $directory -Directory -Force -ErrorAction Stop) {
      if ($excludedDirectories -notcontains $childDirectory.Name.ToLowerInvariant()) { $pending.Push($childDirectory.FullName) }
    }
    foreach ($file in Get-ChildItem -LiteralPath $directory -File -Force -ErrorAction Stop) {
      $relative = $file.FullName.Substring($RepositoryRoot.TrimEnd('\').Length).TrimStart('\')
      $name = $file.Name.ToLowerInvariant()
      $reason = $null
      if ($forbiddenNames -contains $name -or $name -like ".env.*") { $reason = "forbidden-configuration-file" }
      elseif ($name -like "*.credential.clixml") { $reason = "deployment-credential-file" }
      elseif ($relative -match '(?i)^private\\founder\\') { $reason = "founder-private-data" }
      if ($reason) { $signals.Add([pscustomobject]@{ relativePath = $relative; reason = $reason }) }
    }
  }
  return [object[]]$signals.ToArray()
}

function Get-Phase7BSafeTaskProjection {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string]$TaskName,
    [Parameter(Mandatory = $true)][string]$Execute,
    [Parameter(Mandatory = $true)][string]$Arguments,
    [Parameter(Mandatory = $true)][string]$WorkingDirectory,
    [Parameter(Mandatory = $true)][string]$LogonType,
    [Parameter(Mandatory = $true)][string]$RunLevel,
    [Parameter(Mandatory = $true)][string]$MultipleInstances,
    [Parameter(Mandatory = $true)][string]$ExecutionTimeLimit,
    [Parameter(Mandatory = $true)][bool]$Enabled,
    [Parameter(Mandatory = $true)][AllowEmptyCollection()][string[]]$TriggerTypes,
    [Parameter(Mandatory = $true)][AllowEmptyCollection()][string[]]$RepetitionIntervals
  )

  [pscustomobject][ordered]@{
    taskName = $TaskName
    execute = $Execute
    argumentsSha256 = Get-Phase7BSha256 -Text $Arguments
    workingDirectory = $WorkingDirectory
    logonType = $LogonType
    runLevel = $RunLevel
    multipleInstances = $MultipleInstances
    executionTimeLimit = $ExecutionTimeLimit
    enabled = $Enabled
    triggerTypes = @($TriggerTypes | Sort-Object)
    repetitionIntervals = @($RepetitionIntervals | Sort-Object)
  }
}

function Test-Phase7BInertTaskSet {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][object[]]$TaskProjections,
    [Parameter()][psobject]$Contract = (Get-Phase7BIsolatedGuestContract)
  )
  $names = @($TaskProjections | ForEach-Object { $_.taskName })
  $required = @($Contract.productionTaskName, $Contract.monitorTaskName, $Contract.ngrokTaskName)
  $missing = @($required | Where-Object { $names -notcontains $_ })
  $enabled = @($TaskProjections | Where-Object { $_.enabled })
  $wrongPrincipal = @($TaskProjections | Where-Object { $_.logonType -ne "S4U" -or $_.runLevel -ne "Limited" -or $_.multipleInstances -ne "IgnoreNew" })
  $wrongDefinition = New-Object System.Collections.Generic.List[object]
  $production = @($TaskProjections | Where-Object { $_.taskName -eq $Contract.productionTaskName })
  if ($production.Count -eq 1) {
    $expectedArgs = "`"$($Contract.repositoryRoot)\node_modules\next\dist\bin\next`" start --hostname 0.0.0.0 --port 3000"
    if ($production[0].execute.TrimEnd('\') -ine "C:\Program Files\nodejs\node.exe" -or
        $production[0].workingDirectory.TrimEnd('\') -ine $Contract.repositoryRoot.TrimEnd('\') -or
        $production[0].argumentsSha256 -ne (Get-Phase7BSha256 -Text $expectedArgs) -or
        $production[0].executionTimeLimit -ne "PT0S") { $wrongDefinition.Add($production[0]) }
  }
  $monitor = @($TaskProjections | Where-Object { $_.taskName -eq $Contract.monitorTaskName })
  if ($monitor.Count -eq 1) {
    $expectedMonitorArgs = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$($Contract.repositoryRoot)\scripts\monitorPhysiqueOS.ps1`""
    if ($monitor[0].execute.TrimEnd('\') -notmatch '(?i)\\WindowsPowerShell\\v1\.0\\powershell\.exe$' -or
        $monitor[0].workingDirectory.TrimEnd('\') -ine $Contract.repositoryRoot.TrimEnd('\') -or
        $monitor[0].argumentsSha256 -ne (Get-Phase7BSha256 -Text $expectedMonitorArgs) -or
        $monitor[0].executionTimeLimit -ne "PT30S" -or
        $monitor[0].triggerTypes -notcontains "MSFT_TaskLogonTrigger" -or
        $monitor[0].repetitionIntervals -notcontains "PT1M") { $wrongDefinition.Add($monitor[0]) }
  }
  $ngrok = @($TaskProjections | Where-Object { $_.taskName -eq $Contract.ngrokTaskName })
  if ($ngrok.Count -eq 1) {
    if ($ngrok[0].execute.TrimEnd('\') -ine "$($Contract.ngrokRoot)\ngrok.exe" -or
        $ngrok[0].workingDirectory.TrimEnd('\') -ine $Contract.ngrokRoot.TrimEnd('\') -or
        $ngrok[0].argumentsSha256 -ne (Get-Phase7BSha256 -Text "http 3000") -or
        $ngrok[0].executionTimeLimit -ne "PT0S") { $wrongDefinition.Add($ngrok[0]) }
  }
  $pass = $missing.Count -eq 0 -and $enabled.Count -eq 0 -and $wrongPrincipal.Count -eq 0 -and $wrongDefinition.Count -eq 0
  [pscustomobject][ordered]@{
    pass = $pass
    classification = if ($pass) { "INERT_TASK_SET_PASS" } else { "INERT_TASK_SET_FAIL" }
    missingTaskNames = $missing
    enabledTaskNames = @($enabled | ForEach-Object { $_.taskName })
    principalMismatchTaskNames = @($wrongPrincipal | ForEach-Object { $_.taskName })
    definitionMismatchTaskNames = @($wrongDefinition | ForEach-Object { $_.taskName })
  }
}

Export-ModuleMember -Function @(
  "Get-Phase7BIsolatedGuestContract",
  "Get-Phase7BSha256",
  "Read-Phase7BVmx",
  "Test-Phase7BVmxContract",
  "Test-Phase7BVmdkContract",
  "Test-Phase7BVmwareGuestIdentity",
  "Test-Phase7BGuestPathContract",
  "Find-Phase7BForbiddenCredentialSignals",
  "Get-Phase7BSafeTaskProjection",
  "Test-Phase7BInertTaskSet"
)
