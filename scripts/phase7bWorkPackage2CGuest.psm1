Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bIsolatedGuestContract.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2Contract.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bIsolatedGuestReconciliation.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWindowsAgeIdentityBridge.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CContract.psm1')

function Get-Phase7BWP2CHgfsObservation {
  param($Computer)
  # Read-only machine boundaries shared by installer and full guest collector.
  # Exit interpretation belongs exclusively to Test-Phase7BVmwareGuestIdentity.
  $tools=@(Get-Service VMTools -ErrorAction Stop)
  $toolsExe='C:\Program Files\VMware\VMware Tools\vmtoolsd.exe'
  $client='C:\Program Files\VMware\VMware Tools\VMwareHgfsClient.exe'
  $available=Test-Path -LiteralPath $client -PathType Leaf
  $folders=@();$exitCode=-1
  if($available){
    # Do not inherit a stale native exit code if no result was observed.
    # Native commands update the GLOBAL automatic variable in Windows PS5.1;
    # a local assignment would shadow it even after a successful invocation.
    $global:LASTEXITCODE=$null
    $folders=@(& $client 2>$null | Where-Object {-not [string]::IsNullOrWhiteSpace([string]$_)})
    Assert-Phase7BWP2C ($global:LASTEXITCODE -is [int]) 'HGFS_EXIT_UNOBSERVED'
    $exitCode=$global:LASTEXITCODE
  }
  $driver=@(Get-CimInstance Win32_SystemDriver -Filter "Name='vmhgfs'" -ErrorAction Stop)
  $disks=@(Get-CimInstance Win32_LogicalDisk -ErrorAction Stop)
  $connections=@(Get-CimInstance Win32_NetworkConnection -ErrorAction Stop)
  $hgfsPattern='(?i)(vmware-host|\\\.host|hgfs)'
  $exposed=@(Get-PSDrive -ErrorAction Stop | Where-Object {
    $_.Provider.Name -match $hgfsPattern -or [string]$_.Root -match $hgfsPattern -or
    ($_.PSObject.Properties.Name -contains 'DisplayRoot' -and [string]$_.DisplayRoot -match $hgfsPattern)
  })
  [pscustomobject][ordered]@{
    manufacturer=[string]$Computer.Manufacturer;model=[string]$Computer.Model
    toolsServicePresent=($tools.Count -eq 1)
    toolsServiceRunning=($tools.Count -eq 1 -and $tools[0].Status -eq 'Running')
    toolsExecutablePresent=(Test-Path -LiteralPath $toolsExe -PathType Leaf)
    sharedFolderEnumerationAvailable=[bool]$available;sharedFolderEnumerationExitCode=$exitCode
    sharedFolderNames=@($folders | ForEach-Object {[string]$_})
    hgfsDriverPresent=($driver.Count -eq 1 -and $driver[0].Name -ceq 'vmhgfs')
    hgfsDriverRunning=($driver.Count -eq 1 -and $driver[0].Name -ceq 'vmhgfs' -and $driver[0].State -eq 'Running')
    mappedHgfsDiskCount=@($disks | Where-Object {[string]$_.ProviderName -match $hgfsPattern}).Count
    mappedHgfsConnectionCount=@($connections | Where-Object {[string]$_.RemoteName -match $hgfsPattern}).Count
    providerPathCount=$exposed.Count
  }
}

function Test-Phase7BWP2CHgfsObservation {
  param($Observation)
  # Never trust a caller's pass/status flag. Reevaluate the raw corroboration
  # using the existing contract; its EMPTY_EXIT_1_CORROBORATED label alone is
  # insufficient. Missing/null/coerced observations are not corroboration.
  try {
    $o=$Observation;$parameters=@{}
    foreach($name in @('manufacturer','model')){
      if($o.$name -isnot [string] -or [string]::IsNullOrWhiteSpace($o.$name)){return $false}
      $parameters[$name]=$o.$name
    }
    foreach($name in @('toolsServicePresent','toolsServiceRunning','toolsExecutablePresent','sharedFolderEnumerationAvailable','hgfsDriverPresent','hgfsDriverRunning')){
      if($o.$name -isnot [bool]){return $false};$parameters[$name]=$o.$name
    }
    if($o.sharedFolderEnumerationExitCode -isnot [int]){return $false}
    $parameters.sharedFolderEnumerationExitCode=$o.sharedFolderEnumerationExitCode
    if($o.sharedFolderNames -isnot [array]){return $false}
    $parameters.sharedFolderNames=$o.sharedFolderNames
    foreach($name in @('mappedHgfsDiskCount','mappedHgfsConnectionCount','providerPathCount')){
      if(($o.$name -isnot [int] -and $o.$name -isnot [long]) -or $o.$name -lt 0 -or $o.$name -gt [int]::MaxValue){return $false}
    }
    $parameters.mappedHgfsDiskCount=$o.mappedHgfsDiskCount
    $parameters.mappedHgfsConnectionCount=$o.mappedHgfsConnectionCount
    $identity=Test-Phase7BVmwareGuestIdentity @parameters
    return ($identity.pass -ceq $true -and $o.providerPathCount -eq 0)
  } catch {return $false}
}

function Test-Phase7BWP2CGuestObservation {
  param($Observation,$Bindings,[switch]$AfterRestore)
  # Pure evaluator for source-collected observations, not an execution-entry override.
  $o=$Observation;$b=$Bindings
  foreach($name in @('repositoryClean','installedFilesExact','is64Bit','frameworkReady','toolsRunning','tasksExactAndDisabled','controlsStopped','credentialExclusionsPass','localNtfsRoots','pathOwnershipPass')) {
    Assert-Phase7BWP2C ($o.$name -is [bool]) 'OBSERVATION_BOOLEAN_TYPE'
  }
  $requirements=[ordered]@{
    machine=($o.manufacturer -ceq 'VMware, Inc.' -and $o.model -match '^VMware' -and $o.computerName -ceq $b.guestComputerName -and $o.guestIdentitySha256 -ceq $b.guestIdentitySha256)
    application=($o.applicationCommit -ceq $b.applicationCommit -and $o.repositoryClean -ceq $true)
    marker=($o.markerSha256 -ceq $b.guestMarkerSha256)
    tooling=($o.toolingManifestSha256 -ceq $b.toolingManifestSha256 -and $o.installedFilesExact -ceq $true)
    platform=($o.psEdition -ceq 'Desktop' -and $o.psVersion -match '^5\.1\.' -and $o.is64Bit -ceq $true -and $o.frameworkReady -ceq $true)
    evaluation=($o.osBuild -ceq $b.guestOsBuild -and $o.osCaption -ceq $b.guestOsCaption -and $o.licenseStatus -eq 1 -and $o.evaluationMinutesRemaining -ge 1440)
    resources=($o.memoryMiB -ge 3584 -and $o.memoryMiB -le 4096 -and $o.vcpuCount -eq 2)
    tools=($o.toolsRunning -ceq $true -and $o.toolsVersion -ceq $b.vmwareToolsVersion)
    noIntegration=((Test-Phase7BWP2CHgfsObservation $o.hgfsObservation) -and
      $o.hgfsObservation.manufacturer -ceq $o.manufacturer -and $o.hgfsObservation.model -ceq $o.model -and
      $o.hgfsObservation.toolsServiceRunning -ceq $o.toolsRunning -and
      $o.hgfsEnumerationExitCode -eq $o.hgfsObservation.sharedFolderEnumerationExitCode -and
      $o.hgfsFolderCount -eq 0 -and $o.networkDriveCount -eq 0 -and $o.smbConnectionCount -eq 0)
    network=($o.upAdapterCount -eq 0 -and $o.externalRouteCount -eq 0 -and $o.establishedExternalConnectionCount -eq 0)
    inert=($o.tasksExactAndDisabled -ceq $true -and $o.controlsStopped -ceq $true -and $o.applicationProcessCount -eq 0 -and $o.port3000Count -eq 0 -and $o.databaseProcessCount -eq 0)
    credentials=($o.credentialExclusionsPass -ceq $true)
    filesystems=($o.localNtfsRoots -ceq $true -and $o.pathOwnershipPass -ceq $true)
    capacity=($o.incomingFreeBytes -ge ([int64]$b.packet.bytes+1GB) -and $o.restoreFreeBytes -ge ([int64]$b.packet.bytes+[int64]$b.plaintextZip.bytes+[int64]$b.maximumExpandedBytes+1GB))
    destinations=($AfterRestore -or ($o.incomingChildCount -eq 0 -and $o.restoreChildCount -eq 0))
  }
  $failed=@($requirements.Keys | Where-Object {-not $requirements[$_]})
  [pscustomobject][ordered]@{classification=if($failed.Count -eq 0){'PHASE7B_WP2C_GUEST_PREMUTATION_INERT_PASS'}else{'PHASE7B_WP2C_GUEST_PREMUTATION_INERT_FAIL'};pass=($failed.Count -eq 0);failedChecks=$failed;mutationPerformed=$false}
}

function Assert-Phase7BWP2CInstalledTooling {
  param($Contract)
  $root=$Contract.bindings.toolingRoot
  [void](Assert-Phase7BWP2CLocalPath $root)
  Assert-Phase7BWP2C ([IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\') -ceq $root) 'WRONG_TOOLING_LOCATION'
  $expected=@($Contract.toolingManifest.files.name)+@('age.exe','age-keygen.exe','wp2c-tooling-manifest.json')
  $items=@(Get-ChildItem -LiteralPath $root -Force -ErrorAction Stop)
  Assert-Phase7BWP2C (@(Compare-Object @($expected | Sort-Object) @($items.Name | Sort-Object)).Count -eq 0 -and @($items | Where-Object {$_.PSIsContainer -or ($_.Attributes -band [IO.FileAttributes]::ReparsePoint)}).Count -eq 0) 'TOOLING_FILE_SET'
  foreach($file in @($Contract.toolingManifest.files)) {Assert-Phase7BWP2CFile (Join-Path $root $file.name) $file}
  Assert-Phase7BWP2CFile (Join-Path $root 'age.exe') $Contract.bindings.age
  Assert-Phase7BWP2CFile (Join-Path $root 'age-keygen.exe') $Contract.bindings.ageKeygen
  [void](Read-Phase7BWP2CBoundJson (Join-Path $root 'wp2c-tooling-manifest.json') $Contract.bindings.toolingManifestSha256)
  Assert-Phase7BWP2C ((Get-Phase7BWP2CObjectHash (Get-Phase7BWP2CDependencyManifest $root)) -ceq $Contract.bindings.toolingManifestSha256) 'INSTALLED_CLOSURE_MISMATCH'
  foreach($name in @('age.exe','age-keygen.exe')) {
    $lines=@(& (Join-Path $root $name) --version 2>&1)
    Assert-Phase7BWP2C (Test-Phase7BWorkPackage2AgeVersionOutput -OutputLines @($lines | ForEach-Object {[string]$_}) -ExitCode $LASTEXITCODE).pass 'AGE_VERSION'
  }
}

function Assert-Phase7BWP2CGuestRoots {
  param([string]$RepositoryRoot,[string]$IsolatedRoot)
  # Independent authoritative roots: the checkout is not isolated restore data.
  # Reuse the exact source-owned root contract; never infer one owner from another.
  foreach($root in @($RepositoryRoot,$IsolatedRoot)) { [void](Assert-Phase7BWP2CLocalPath $root) }
  Assert-Phase7BWP2C (Test-Phase7BGuestPathContract -RepositoryRoot $RepositoryRoot -IsolatedRoot $IsolatedRoot).pass 'GUEST_ROOT_BINDING'
  foreach($root in @($RepositoryRoot,$IsolatedRoot)) {
    Assert-Phase7BWP2C (Test-Path -LiteralPath $root -PathType Container) 'ROOT_MISSING'
    $item=Get-Item -LiteralPath $root -Force -ErrorAction Stop
    Assert-Phase7BWP2C ($item.PSIsContainer -and $item.PSProvider.Name -ceq 'FileSystem' -and $item.FullName.TrimEnd('\') -ieq $root.TrimEnd('\')) 'GUEST_ROOT_LOCATION'
  }
}

function Get-Phase7BWP2CGuestObservation {
  param($Contract)
  $b=$Contract.bindings;$fixed=Get-Phase7BIsolatedGuestContract
  $computer=Get-CimInstance Win32_ComputerSystem -ErrorAction Stop
  # Wrong physical machine fails before probing guest paths or running any helper.
  Assert-Phase7BWP2C ($computer.Manufacturer -ceq 'VMware, Inc.' -and $computer.Model -match '^VMware') 'WRONG_MACHINE'
  $identity=Get-CimInstance Win32_ComputerSystemProduct -ErrorAction Stop
  Assert-Phase7BWP2CGuestRoots $fixed.repositoryRoot $fixed.isolatedRoot
  $markerPath=Join-Path $fixed.isolatedRoot 'guest-identity-marker.json'
  [void](Assert-Phase7BWP2CLocalPath $markerPath $fixed.isolatedRoot)
  $marker=Read-Phase7BWP2CBoundJson $markerPath $b.guestMarkerSha256
  Assert-Phase7BWP2C ($marker.schemaVersion -eq 1 -and $marker.applicationCommit -ceq $fixed.applicationCommit -and $marker.manifestDigest -ceq $fixed.manifestDigest -and $marker.windowsHostId -ceq $fixed.windowsHostId -and $marker.windowsRuntimeId -ceq $fixed.windowsRuntimeId) 'GUEST_MARKER_CONTENT'
  $os=Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
  $toolsExe='C:\Program Files\VMware\VMware Tools\vmtoolsd.exe'
  $hgfsObservation=Get-Phase7BWP2CHgfsObservation $computer
  Assert-Phase7BWP2CInstalledTooling $Contract
  $git='C:\Program Files\Git\cmd\git.exe'
  Assert-Phase7BWP2CFile $git $b.git
  $head=@(& $git --no-optional-locks -C $fixed.repositoryRoot rev-parse HEAD 2>$null)
  Assert-Phase7BWP2C ($LASTEXITCODE -eq 0 -and $head.Count -eq 1) 'APPLICATION_REPOSITORY'
  $status=@(& $git --no-optional-locks -C $fixed.repositoryRoot status --porcelain=v1 --untracked-files=all 2>$null)
  Assert-Phase7BWP2C ($LASTEXITCODE -eq 0) 'APPLICATION_REPOSITORY'
  $tasks=@(foreach($name in @($fixed.productionTaskName,$fixed.monitorTaskName,$fixed.ngrokTaskName)){Get-ScheduledTask -TaskName $name -ErrorAction Stop})
  $taskEvidence=Test-Phase7BInertTaskSet -TaskProjections @($tasks | ForEach-Object {Get-Phase7BReconciliationTaskProjection -TaskName $_.TaskName -Task @($_)}) -Contract $fixed
  $runtimePath=Assert-Phase7BWP2CLocalPath (Join-Path $fixed.repositoryRoot 'logs\physiqueos-runtime-control.json') $fixed.repositoryRoot
  $ngrokPath=Assert-Phase7BWP2CLocalPath (Join-Path $fixed.repositoryRoot 'logs\physiqueos-ngrok-control.json') $fixed.repositoryRoot
  $runtime=Get-Content -LiteralPath $runtimePath -Raw -ErrorAction Stop | ConvertFrom-Json
  $ngrok=Get-Content -LiteralPath $ngrokPath -Raw -ErrorAction Stop | ConvertFrom-Json
  $license=@(Get-CimInstance SoftwareLicensingProduct -Filter "ApplicationID='55c92734-d682-4d71-983e-d6ec3f16059f'" -ErrorAction Stop | Where-Object {$_.PartialProductKey -and $_.Name -like 'Windows*' -and $_.LicenseStatus -eq 1})
  Assert-Phase7BWP2C ($license.Count -eq 1) 'WINDOWS_LICENSE_UNRESOLVED'
  $processes=@(Get-CimInstance Win32_Process -ErrorAction Stop)
  $connections=@(Get-NetTCPConnection -ErrorAction Stop)
  $adapters=@(Get-NetAdapter -IncludeHidden -ErrorAction Stop | Where-Object {$_.Status -eq 'Up'})
  $routes=@(Get-NetRoute -ErrorAction Stop | Where-Object {$_.InterfaceAlias -notmatch 'Loopback' -and $_.DestinationPrefix -in @('0.0.0.0/0','::/0')})
  $drives=@(Get-CimInstance Win32_LogicalDisk -ErrorAction Stop)
  $networkDrives=@($drives | Where-Object {$_.DriveType -eq 4 -or $_.ProviderName})
  $networkConnections=@(Get-CimInstance Win32_NetworkConnection -ErrorAction Stop)
  $localNtfs=$true
  foreach($root in @($b.incomingRoot,$b.restoreRoot,$b.stateRoot,$b.toolingRoot)) {
    [void](Assert-Phase7BWP2CLocalPath $root $fixed.isolatedRoot)
    Assert-Phase7BWP2C (Test-Path -LiteralPath $root -PathType Container) 'ROOT_MISSING'
    $disk=@($drives | Where-Object {$_.DeviceID -ceq $root.Substring(0,2)})
    $localNtfs=$localNtfs -and $disk.Count -eq 1 -and $disk[0].DriveType -eq 3 -and $disk[0].FileSystem -ceq 'NTFS'
    $acl=Get-Acl -LiteralPath $root -ErrorAction Stop
    # No Everyone/Users write permission on source-owned restore roots.
    foreach($ace in @($acl.Access)) {
      $sid=$ace.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
      if($sid -in @('S-1-1-0','S-1-5-32-545') -and $ace.AccessControlType -eq 'Allow' -and ($ace.FileSystemRights -band [Security.AccessControl.FileSystemRights]::Write)) {throw 'PHASE7B_WP2C_ROOT_ACL_UNSAFE'}
    }
  }
  $incomingDisk=@($drives | Where-Object {$_.DeviceID -ceq $b.incomingRoot.Substring(0,2)})[0]
  $restoreDisk=@($drives | Where-Object {$_.DeviceID -ceq $b.restoreRoot.Substring(0,2)})[0]
  $scan=New-Object 'Collections.Generic.Stack[string]';$scan.Push($fixed.repositoryRoot)
  while($scan.Count -gt 0){foreach($child in @(Get-ChildItem -LiteralPath $scan.Pop() -Force -ErrorAction Stop)){
    [void](Assert-Phase7BWP2CLocalPath $child.FullName $fixed.repositoryRoot)
    Assert-Phase7BWP2C (-not ($child.Attributes -band [IO.FileAttributes]::ReparsePoint)) 'REPOSITORY_REPARSE_PATH'
    if($child.PSIsContainer -and $child.Name -notin @('.git','node_modules','.next','logs')){$scan.Push($child.FullName)}
  }}
  $credentialFiles=@(Find-Phase7BForbiddenCredentialSignals -RepositoryRoot $fixed.repositoryRoot)
  # Inspect only presence/names, never project credential values. Restored content
  # also receives the existing per-file credential-signal scan after extraction.
  $credentialNames=@('DATABASE_URL','DIRECT_URL','DIGITALOCEAN_ACCESS_TOKEN','DIGITALOCEAN_TOKEN','NGROK_AUTHTOKEN','SPACES_ACCESS_KEY_ID','SPACES_SECRET_ACCESS_KEY','AWS_SECRET_ACCESS_KEY','PGPASSWORD','AGE_SECRET_KEY','AGE_PASSPHRASE')
  $credentialEnvironmentCount=@(Get-ChildItem Env: | Where-Object {$_.Name -in $credentialNames -and -not [string]::IsNullOrEmpty($_.Value)}).Count
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [pscustomobject][ordered]@{
    manufacturer=[string]$computer.Manufacturer;model=[string]$computer.Model;computerName=[string]$computer.Name
    guestIdentitySha256=Get-Phase7BWP2CObjectHash ([string]$identity.UUID).ToLowerInvariant()
    applicationCommit=[string]$head[0];repositoryClean=($status.Count -eq 0)
    markerSha256=Get-Phase7BSha256 -LiteralPath (Join-Path $fixed.isolatedRoot 'guest-identity-marker.json')
    toolingManifestSha256=$b.toolingManifestSha256;installedFilesExact=$true
    psEdition=$PSVersionTable.PSEdition;psVersion=$PSVersionTable.PSVersion.ToString();is64Bit=[Environment]::Is64BitProcess;frameworkReady=$true
    osBuild=[string]$os.BuildNumber;osCaption=[string]$os.Caption;licenseStatus=[int]$license[0].LicenseStatus;evaluationMinutesRemaining=[int]$license[0].GracePeriodRemaining
    memoryMiB=[int64]([math]::Round($computer.TotalPhysicalMemory/1MB));vcpuCount=[int]$computer.NumberOfLogicalProcessors
    toolsRunning=$hgfsObservation.toolsServiceRunning;toolsVersion=(Get-Item -LiteralPath $toolsExe).VersionInfo.FileVersion
    hgfsObservation=$hgfsObservation
    hgfsEnumerationExitCode=$hgfsObservation.sharedFolderEnumerationExitCode;hgfsFolderCount=@($hgfsObservation.sharedFolderNames).Count;networkDriveCount=$networkDrives.Count;smbConnectionCount=$networkConnections.Count
    upAdapterCount=$adapters.Count;externalRouteCount=$routes.Count;establishedExternalConnectionCount=@($connections | Where-Object {$_.State -eq 'Established' -and $_.RemoteAddress -notin @('127.0.0.1','::1')}).Count
    tasksExactAndDisabled=($tasks.Count -eq 3 -and $taskEvidence.pass);controlsStopped=($runtime.desiredState -ceq 'stopped' -and $ngrok.ngrokDesiredState -ceq 'stopped')
    applicationProcessCount=@($processes | Where-Object {$_.Name -in @('node.exe','ngrok.exe')}).Count
    port3000Count=@($connections | Where-Object {$_.LocalPort -eq 3000 -and $_.State -eq 'Listen'}).Count
    databaseProcessCount=@($processes | Where-Object {$_.Name -in @('postgres.exe','mysqld.exe','sqlservr.exe','mongod.exe')}).Count
    credentialExclusionsPass=($credentialFiles.Count -eq 0 -and $credentialEnvironmentCount -eq 0);localNtfsRoots=$localNtfs;pathOwnershipPass=$true
    incomingFreeBytes=[int64]$incomingDisk.FreeSpace;restoreFreeBytes=[int64]$restoreDisk.FreeSpace
    incomingChildCount=@(Get-ChildItem -LiteralPath $b.incomingRoot -Force -ErrorAction Stop).Count
    restoreChildCount=@(Get-ChildItem -LiteralPath $b.restoreRoot -Force -ErrorAction Stop).Count
  }
}

function Assert-Phase7BWP2CGuestPreMutation {
  param($Contract,[switch]$AfterRestore)
  $observation=Get-Phase7BWP2CGuestObservation $Contract
  $result=Test-Phase7BWP2CGuestObservation $observation $Contract.bindings -AfterRestore:$AfterRestore
  Assert-Phase7BWP2C $result.pass 'GUEST_PREMUTATION_INERT_FAIL'
  $observation
}

function Assert-Phase7BWP2CEntryValidation {
  param($Evidence,$Bindings)
  Assert-Phase7BWP2C ($Evidence.schemaVersion -eq 1 -and $Evidence.kind -ceq 'wp2c-synthetic-entry-validation' -and $Evidence.method -ceq '1password-type-in-window-provisional-v1' -and $Evidence.guestIdentitySha256 -ceq $Bindings.guestIdentitySha256 -and $Evidence.toolingManifestSha256 -ceq $Bindings.toolingManifestSha256) 'ENTRY_VALIDATION_BINDING'
  foreach($name in @('invalidSyntheticValueOnly','noTotp','automaticSubmissionDisabled','firstFieldExact','secondFieldExact','wrongFieldTestPass','guestFocusLossTestPass','hostFocusChangeTestPass','minimizationTestPass','cancellationTestPass','interruptionTestPass','canaryTestPass','hostClipboardUnchanged','guestClipboardUnchanged','noToolingSecretFileWrites')) {Assert-Phase7BWP2C ($Evidence.$name -ceq $true) 'ENTRY_VALIDATION_REJECTED'}
  Assert-Phase7BWP2C ($Evidence.realIdentityUsed -ceq $false -and $Evidence.unexpectedDestinationInput -ceq $false -and $Evidence.universalFocusGuarantee -ceq $false -and $Evidence.founderReviewed -ceq $true) 'ENTRY_VALIDATION_REJECTED'
  foreach($name in @('onePasswordVersion','vmwareVersion','guestDialogVersion','testedAt')) {Assert-Phase7BWP2C (-not [string]::IsNullOrWhiteSpace($Evidence.$name)) 'ENTRY_CONFIGURATION_REQUIRED'}
}

function Assert-Phase7BWP2CZipBounds {
  param([string]$LiteralPath,[int64]$MaximumExpandedBytes)
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive=[IO.Compression.ZipFile]::OpenRead($LiteralPath)
  try {
    [int64]$total=0;$seen=@{}
    Assert-Phase7BWP2C ($archive.Entries.Count -gt 0 -and $archive.Entries.Count -le 100000) 'ZIP_ENTRY_COUNT'
    foreach($entry in $archive.Entries) {
      $path=Test-Phase7BWorkPackage2RelativePath $entry.FullName
      Assert-Phase7BWP2C (($path.pass -or $entry.FullName -ceq 'packet-manifest.json') -and -not [string]::IsNullOrWhiteSpace($entry.Name) -and -not $seen.ContainsKey($entry.FullName.ToLowerInvariant())) 'ZIP_PATH'
      $seen[$entry.FullName.ToLowerInvariant()]=$true
      Assert-Phase7BWP2C ($entry.Length -ge 0 -and $entry.Length -le $MaximumExpandedBytes-$total) 'ZIP_CAPACITY'
      $total+=$entry.Length
    }
    $total
  } finally {$archive.Dispose()}
}

function Test-Phase7BWP2CRestoredPacket {
  param([string]$Root,[string]$AttemptId)
  $contract=Get-Phase7BWorkPackage2Contract
  $manifestPath = Join-Path $Root "packet-manifest.json"
  if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw "PHASE7B_WP2_RESTORED_MANIFEST_MISSING" }
  $manifest = Get-Content -LiteralPath $manifestPath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
  if ([int]$manifest.schemaVersion -ne 2 -or [string]$manifest.classification -ne "PHASE7B_WP2_DECRYPTED_PACKET_MANIFEST" -or
      [string]$manifest.attemptId -ne $AttemptId -or [string]$manifest.applicationCommit -ne $contract.applicationCommit -or
      [string]$manifest.environmentId -ne $contract.environmentId -or [string]$manifest.vmDisplayName -ne $contract.vmDisplayName -or
      [string]$manifest.manifestDigest -ne $contract.manifestDigest) { throw "PHASE7B_WP2_RESTORED_MANIFEST_BINDING_MISMATCH" }
  $files = @($manifest.files)
  if ($files.Count -eq 0 -or $files.Count -ne [int]$manifest.fileCount) { throw "PHASE7B_WP2_RESTORED_MANIFEST_CARDINALITY_FAIL" }
  $seen = @{}
  $totalBytes = [int64]0
  foreach ($file in $files) {
    $pathCheck = Test-Phase7BWorkPackage2RelativePath -RelativePath ([string]$file.logicalPath)
    if (-not $pathCheck.pass -or $seen.ContainsKey($pathCheck.normalizedPath.ToLowerInvariant())) { throw "PHASE7B_WP2_RESTORED_MANIFEST_PATH_FAIL" }
    $seen[$pathCheck.normalizedPath.ToLowerInvariant()] = $true
    $path = [IO.Path]::GetFullPath((Join-Path $Root $pathCheck.normalizedPath.Replace('/', '\')))
    [void](Assert-Phase7BWP2CLocalPath $path $Root)
    if (-not $path.StartsWith([IO.Path]::GetFullPath($Root).TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase) -or
        -not (Test-Path -LiteralPath $path -PathType Leaf) -or (Get-Phase7BSha256 -LiteralPath $path) -ne [string]$file.sha256 -or
        (Get-Item -LiteralPath $path).Length -ne [int64]$file.bytes) { throw "PHASE7B_WP2_RESTORED_FILE_DIGEST_FAIL" }
    if (-not (Test-Phase7BWorkPackage2CredentialSignal -LiteralPath $path).pass) { throw "PHASE7B_WP2_RESTORED_CREDENTIAL_SIGNAL" }
    $totalBytes += [int64]$file.bytes
  }
  $reference = $manifest.referenceIndex
  $referencePath = Join-Path $Root 'reference-index.json'
  $referencePass = Test-Phase7BWorkPackage2ReferenceIndexFile -LiteralPath $referencePath -ExpectedFileSha256 ([string]$reference.fileSha256) -ExpectedSemanticSha256 ([string]$reference.semanticSha256) -ExpectedBytes ([int64]$reference.bytes)
  if (-not $referencePass.pass -or [string]$reference.fileName -ne 'reference-index.json' -or [string]$reference.version -ne 'phase7b-wp2-reference-index-v1') { throw 'PHASE7B_WP2_RESTORED_REFERENCE_INDEX_FAIL' }
  $prefix = [IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
  $actualFiles = @(Get-ChildItem -LiteralPath $Root -File -Recurse | ForEach-Object { $_.FullName.Substring($prefix.Length).Replace('\', '/') })
  if ($actualFiles.Count -ne $files.Count + 2 -or @($actualFiles | Where-Object { $_ -notin @('packet-manifest.json','reference-index.json') -and -not $seen.ContainsKey($_.ToLowerInvariant()) }).Count -gt 0) { throw "PHASE7B_WP2_RESTORED_UNEXPECTED_FILE_SET" }
  [pscustomobject][ordered]@{ pass = $true; fileCount = $files.Count; totalBytes = $totalBytes; sourceInventorySha256 = [string]$manifest.sourceInventorySha256; referenceIndexSha256 = $referencePass.referenceIndexSha256; referenceRecordCount = $referencePass.recordCount }
}

Export-ModuleMember -Function *-Phase7BWP2C*
