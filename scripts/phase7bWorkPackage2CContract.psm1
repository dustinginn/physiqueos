Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bIsolatedGuestContract.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2Contract.psm1')

# WP2-C is deliberately independent of capture/finalization authorization history.
function Assert-Phase7BWP2C {
  param([bool]$Condition, [string]$Code)
  if (-not $Condition) { throw "PHASE7B_WP2C_$Code" }
}

function Assert-Phase7BWP2CBoolean {
  param($Value,[bool]$Expected,[string]$Code)
  Assert-Phase7BWP2C ($Value -is [bool] -and $Value -eq $Expected) $Code
}

function Get-Phase7BWP2CIdentity {
  param([Parameter(Mandatory=$true)][string]$LiteralPath)
  $item = Get-Item -LiteralPath $LiteralPath -ErrorAction Stop
  Assert-Phase7BWP2C (-not $item.PSIsContainer -and -not ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) 'FILE_REQUIRED'
  [pscustomobject][ordered]@{ sha256=Get-Phase7BSha256 -LiteralPath $item.FullName; bytes=[int64]$item.Length }
}

function Assert-Phase7BWP2CFile {
  param([string]$LiteralPath, $Identity)
  Assert-Phase7BWP2C ($Identity.sha256 -cmatch '^[0-9a-f]{64}$' -and $Identity.bytes -is [ValueType] -and [int64]$Identity.bytes -gt 0) 'FILE_IDENTITY_SHAPE'
  $actual = Get-Phase7BWP2CIdentity $LiteralPath
  Assert-Phase7BWP2C ($actual.sha256 -ceq $Identity.sha256 -and $actual.bytes -eq $Identity.bytes) 'FILE_IDENTITY_MISMATCH'
}

function Get-Phase7BWP2CObjectHash {
  param($Value)
  $bytes = [Text.Encoding]::UTF8.GetBytes((ConvertTo-Phase7BCanonicalJson $Value))
  $algorithm = [Security.Cryptography.SHA256]::Create()
  try { ([BitConverter]::ToString($algorithm.ComputeHash($bytes))).Replace('-','').ToLowerInvariant() } finally { $algorithm.Dispose() }
}

function Write-Phase7BWP2CCreateNewJson {
  param([string]$LiteralPath, $Value)
  $bytes = (New-Object Text.UTF8Encoding($false)).GetBytes((ConvertTo-Phase7BCanonicalJson $Value))
  $stream = New-Object IO.FileStream($LiteralPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try { $stream.Write($bytes,0,$bytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }
  Get-Phase7BWP2CIdentity $LiteralPath
}

function Read-Phase7BWP2CBoundJson {
  param([string]$LiteralPath,[string]$ExpectedSha256)
  Assert-Phase7BWP2C ($ExpectedSha256 -cmatch '^[0-9a-f]{64}$' -and (Get-Phase7BSha256 -LiteralPath $LiteralPath) -ceq $ExpectedSha256) 'JSON_HASH_MISMATCH'
  Assert-Phase7BWP2C ((Get-Item -LiteralPath $LiteralPath).Length -le 4MB) 'JSON_TOO_LARGE'
  Get-Content -LiteralPath $LiteralPath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
}

function Assert-Phase7BWP2CLocalPath {
  param([string]$LiteralPath,[string]$WithinRoot)
  Assert-Phase7BWP2C ($LiteralPath -match '^[A-Za-z]:\\' -and $LiteralPath.Substring(2) -notmatch '[:*?]' -and $LiteralPath -notmatch '(^|[\\/])\.\.?([\\/]|$)') 'LOCAL_PATH_REQUIRED'
  $fullWithRoot = [IO.Path]::GetFullPath($LiteralPath)
  $full = $fullWithRoot.TrimEnd('\')
  $pathRoot = [IO.Path]::GetPathRoot($fullWithRoot).TrimEnd('\')
  if ($WithinRoot) {
    $root = [IO.Path]::GetFullPath($WithinRoot).TrimEnd('\')
    Assert-Phase7BWP2C ($full.StartsWith($root+'\',[StringComparison]::OrdinalIgnoreCase)) 'PATH_ESCAPE'
  }
  $cursor = $full
  while ($cursor) {
    if (Test-Path -LiteralPath $cursor) {
      $item = Get-Item -LiteralPath $cursor -Force -ErrorAction Stop
      Assert-Phase7BWP2C (-not ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) 'REPARSE_PATH'
    }
    if ($cursor -ceq $pathRoot) { break }
    $parent = Split-Path -Parent $cursor
    if (-not $parent -or $parent -ceq $cursor) { break }
    $cursor = $parent
  }
  $full
}

function Get-Phase7BWP2CDependencyManifest {
  param([string]$SourceDirectory=$PSScriptRoot,
    [string[]]$EntryPoints=@('b.cmd','phase7bRunWorkPackage2GuestRestore.ps1','phase7bInstallWorkPackage2GuestTooling.ps1','phase7bInspectWorkPackage2CGuestPreparation.ps1','phase7bTestWorkPackage2GuestIdentityEntry.ps1','phase7bRunWorkPackage2CGuestBaseline.ps1'))
  $pending = New-Object 'Collections.Generic.Queue[string]'
  foreach ($name in $EntryPoints) { $pending.Enqueue($name) }
  $seen = @{}
  while ($pending.Count -gt 0) {
    $name = $pending.Dequeue()
    Assert-Phase7BWP2C ($name -ceq 'b.cmd' -or $name -cmatch '^phase7b[A-Za-z0-9]+\.(ps1|psm1)$') 'DEPENDENCY_PATH'
    if ($seen.ContainsKey($name)) { continue }
    $path = Join-Path $SourceDirectory $name
    # The single batch entry point is manifest-bound but has no transitive
    # imports: it may invoke only the separately parsed Baseline launcher.
    if($name -ceq 'b.cmd'){
      $seen[$name]=Get-Phase7BWP2CIdentity $path
      continue
    }
    $tokens=$null; $errors=$null
    $ast=[Management.Automation.Language.Parser]::ParseFile($path,[ref]$tokens,[ref]$errors)
    Assert-Phase7BWP2C (@($errors).Count -eq 0) 'DEPENDENCY_PARSE'
    $seen[$name]=Get-Phase7BWP2CIdentity $path
    # Only executable imports/calls, NOT filenames retained as provenance data.
    foreach ($import in @($ast.FindAll({param($n) $n -is [Management.Automation.Language.CommandAst] -and $n.GetCommandName() -eq 'Import-Module'},$true))) {
      $literalNames=@($import.FindAll({param($n) $n -is [Management.Automation.Language.StringConstantExpressionAst] -and $n.Value -cmatch '^phase7b[A-Za-z0-9]+\.psm1$'},$true))
      Assert-Phase7BWP2C ($literalNames.Count -eq 1 -and $import.Extent.Text.Contains('(Join-Path $PSScriptRoot ')) 'DYNAMIC_IMPORT_REJECTED'
      $pending.Enqueue($literalNames[0].Value)
    }
    foreach($call in @($ast.FindAll({param($n) $n -is [Management.Automation.Language.CommandAst] -and $n.InvocationOperator -in @('Ampersand','Dot')},$true))) {
      foreach($node in @($call.CommandElements[0].FindAll({param($n) $n -is [Management.Automation.Language.StringConstantExpressionAst] -and $n.Value -cmatch '^phase7b[A-Za-z0-9]+\.ps1$'},$true))){$pending.Enqueue($node.Value)}
    }
  }
  $files=@(foreach($name in @($seen.Keys | Sort-Object -CaseSensitive)) {
    [pscustomobject][ordered]@{name=$name;sha256=$seen[$name].sha256;bytes=$seen[$name].bytes}
  })
  [pscustomobject][ordered]@{schemaVersion=1;kind='wp2c-tooling-manifest';entryPoints=@($EntryPoints | Sort-Object -CaseSensitive);files=$files;secretsIncluded=$false}
}

function Get-Phase7BWP2CHostEntryPoints {
  @('phase7bClaimWorkPackage2CHostExecution.ps1','phase7bPermitWorkPackage2CGuestBoot.ps1','phase7bCompleteWorkPackage2CHostExecution.ps1','phase7bImportWorkPackage2CGuestEvidence.ps1','phase7bPrepareWorkPackage2CAuthorization.ps1','phase7bNewWorkPackage2CInvocationContract.ps1','phase7bBuildWorkPackage2CMedia.ps1','phase7bRecordWorkPackage2CPreparation.ps1')
}

# Preparation inputs are data, not an execution invocation/authorization. Keep
# their producer here; the authoritative Baseline launcher and its manifest-bound
# b.cmd ergonomic entry point are the only intentional guest closure additions.
function Assert-Phase7BWP2CExactProperties {
  param($Value,[string[]]$Names)
  Assert-Phase7BWP2C ($null -ne $Value -and $Value -isnot [string] -and
    @(Compare-Object @($Names|Sort-Object) @($Value.PSObject.Properties.Name|Sort-Object)).Count -eq 0) 'PREPARATION_SCHEMA'
}

function Assert-Phase7BWP2CBaselineBinding {
  param($Binding)
  $fixed=Get-Phase7BIsolatedGuestContract
  Assert-Phase7BWP2CExactProperties $Binding @(
    'schemaVersion','kind','classification','applicationCommit','environmentId',
    'preparedStateId','operation','toolingCommit','toolingManifestSha256',
    'guestIdentitySha256','semanticVm','parentBridge','founderPreparationApprovalRequired',
    'nonExecutable','preparationOnly','restoreAuthorized','wp2cExecutionAuthorized',
    'laterMigrationAuthorized'
  )
  Assert-Phase7BWP2C ($Binding.schemaVersion -eq 1 -and
    $Binding.kind -ceq 'wp2c-guest-baseline-binding' -and
    $Binding.classification -ceq 'PHASE7B_WP2C_GUEST_BASELINE_BINDING_NONEXECUTABLE' -and
    $Binding.applicationCommit -ceq $fixed.applicationCommit -and
    $Binding.environmentId -ceq $fixed.environmentId -and
    $Binding.preparedStateId -cmatch '^wp2c-prepared-[0-9a-f]{32}$' -and
    $Binding.operation -ceq 'Baseline' -and $Binding.toolingCommit -cmatch '^[0-9a-f]{40}$') 'BASELINE_BINDING_SCHEMA'
  foreach($name in @('toolingManifestSha256','guestIdentitySha256')){
    Assert-Phase7BWP2C ($Binding.$name -cmatch '^[0-9a-f]{64}$') 'BASELINE_BINDING_HASH'
  }
  Assert-Phase7BWP2CExactProperties $Binding.semanticVm @('mode','sha256')
  Assert-Phase7BWP2C ($Binding.semanticVm.mode -ceq 'wp2c-semantic-vmx-v2' -and
    $Binding.semanticVm.sha256 -cmatch '^[0-9a-f]{64}$') 'BASELINE_BINDING_VM'
  Assert-Phase7BWP2CExactProperties $Binding.parentBridge @('sha256','bytes')
  Assert-Phase7BWP2C ($Binding.parentBridge.sha256 -cmatch '^[0-9a-f]{64}$' -and
    $Binding.parentBridge.bytes -is [ValueType] -and [int64]$Binding.parentBridge.bytes -gt 0) 'BASELINE_BINDING_PARENT'
  foreach($name in @('founderPreparationApprovalRequired','nonExecutable','preparationOnly')){
    Assert-Phase7BWP2CBoolean $Binding.$name $true 'BASELINE_BINDING_AUTHORITY'
  }
  foreach($name in @('restoreAuthorized','wp2cExecutionAuthorized','laterMigrationAuthorized')){
    Assert-Phase7BWP2CBoolean $Binding.$name $false 'BASELINE_BINDING_AUTHORITY'
  }
  Assert-Phase7BWP2C ((ConvertTo-Phase7BCanonicalJson $Binding) -notmatch
    'AGE-SECRET-KEY-|password|passphrase|credential') 'BASELINE_BINDING_SECRET'
}

function Read-Phase7BWP2CBaselineBinding {
  param([string]$ToolingRoot,[string]$ExpectedSha256)
  $root=Assert-Phase7BWP2CLocalPath $ToolingRoot
  $path=Join-Path $root 'wp2c-baseline-binding.json'
  Assert-Phase7BWP2C (Test-Path -LiteralPath $path -PathType Leaf) 'BASELINE_BINDING_MISSING'
  $identity=Get-Phase7BWP2CIdentity $path
  if($ExpectedSha256){Assert-Phase7BWP2C ($identity.sha256 -ceq $ExpectedSha256) 'BASELINE_BINDING_HASH'}
  Assert-Phase7BWP2C ($identity.bytes -le 16KB) 'BASELINE_BINDING_SIZE'
  $raw=Get-Content -LiteralPath $path -Raw -ErrorAction Stop
  $binding=$raw|ConvertFrom-Json -ErrorAction Stop
  Assert-Phase7BWP2C ($raw -ceq (ConvertTo-Phase7BCanonicalJson $binding)) 'BASELINE_BINDING_CANONICAL'
  Assert-Phase7BWP2CBaselineBinding $binding
  [pscustomobject]@{document=$binding;identity=$identity;path=$path}
}

function Get-Phase7BWP2CToolingMediaFileNames {
  param([string]$ToolingRoot,$Manifest)
  $names=@($Manifest.files.name)+@('age.exe','age-keygen.exe','wp2c-tooling-manifest.json')
  if(Test-Path -LiteralPath (Join-Path $ToolingRoot 'wp2c-baseline-binding.json') -PathType Leaf){
    [void](Read-Phase7BWP2CBaselineBinding $ToolingRoot)
    $names+=@('wp2c-baseline-binding.json')
  }
  @($names)
}

function Get-Phase7BWP2CPreparationBaselineFields {
  @('guestIdentitySha256','guestComputerName','guestMarkerSha256','guestOsBuild','guestOsCaption','vmwareToolsVersion','git')
}

function Assert-Phase7BWP2CPreparationBaseline {
  param($Baseline)
  $fixed=Get-Phase7BIsolatedGuestContract
  Assert-Phase7BWP2CExactProperties $Baseline (@('schemaVersion','kind','applicationCommit','environmentId','observedAt','mutationPerformed')+(Get-Phase7BWP2CPreparationBaselineFields))
  Assert-Phase7BWP2C ($Baseline.schemaVersion -eq 1 -and $Baseline.kind -ceq 'wp2c-guest-preparation-baseline' -and
    $Baseline.applicationCommit -ceq $fixed.applicationCommit -and $Baseline.environmentId -ceq $fixed.environmentId) 'PREPARATION_BASELINE'
  Assert-Phase7BWP2CBoolean $Baseline.mutationPerformed $false 'PREPARATION_BASELINE'
  foreach($name in @('guestIdentitySha256','guestMarkerSha256')){Assert-Phase7BWP2C ($Baseline.$name -cmatch '^[0-9a-f]{64}$') 'PREPARATION_BASELINE'}
  Assert-Phase7BWP2C ($Baseline.guestComputerName -cmatch '^[A-Z0-9-]{1,15}$' -and $Baseline.guestOsBuild -cmatch '^\d{4,6}$' -and
    $Baseline.guestOsCaption -cmatch '^Microsoft Windows 11 [A-Za-z ]{1,64}$' -and $Baseline.vmwareToolsVersion -cmatch '^[0-9A-Za-z., ()-]{1,80}$') 'PREPARATION_BASELINE'
  Assert-Phase7BWP2CExactProperties $Baseline.git @('sha256','bytes')
  Assert-Phase7BWP2C ($Baseline.git.sha256 -cmatch '^[0-9a-f]{64}$' -and [int64]$Baseline.git.bytes -gt 0) 'PREPARATION_BASELINE'
  [void][datetimeoffset]::Parse($Baseline.observedAt)
}

function New-Phase7BWP2CPreparationPlan {
  param($Baseline,$FinalDescriptor,$FinalDescriptorIdentity,$ToolingMedia,$Age,$AgeKeygen,
    [string]$SourceDirectory,[string]$ToolingCommit,[string]$PreparedStateId,
    [string]$HostIdentitySha256,[string]$VmConfigSha256,[string]$SnapshotSha256)
  Assert-Phase7BWP2CPreparationBaseline $Baseline
  $fixed=Get-Phase7BIsolatedGuestContract;$d=$FinalDescriptor
  Assert-Phase7BWP2C ($d.classification -ceq 'PHASE7B_WP2_ENCRYPTED_PACKET_AND_REPLICA_PASS' -and
    $d.applicationCommit -ceq $fixed.applicationCommit -and $d.environmentId -ceq $fixed.environmentId -and
    $d.decryptRoundTripPass -ceq $true -and $d.plaintextZipSha256 -ceq $d.decryptedStreamSha256 -and
    $d.plaintextZipBytes -eq $d.decryptedStreamBytes -and (Test-Phase7BWorkPackage2FinalizationProvenance $d).pass) 'PREPARATION_DESCRIPTOR'
  $manifest=Get-Phase7BWP2CDependencyManifest $SourceDirectory
  $b=[ordered]@{
    attemptId=$d.attemptId;applicationCommit=$fixed.applicationCommit;environmentId=$fixed.environmentId;vmDisplayName=$fixed.vmDisplayName
    toolingCommit=$ToolingCommit;preparedStateId=$PreparedStateId;hostIdentitySha256=$HostIdentitySha256;vmConfigSha256=$VmConfigSha256;snapshotSha256=$SnapshotSha256
    snapshotName='S1-physiqueos-bootstrap-inert';toolingManifestSha256=Get-Phase7BWP2CObjectHash $manifest
    toolingMedia=$ToolingMedia;finalDescriptor=$FinalDescriptorIdentity;age=$Age;ageKeygen=$AgeKeygen
    packet=[pscustomobject]@{sha256=$d.packetSha256;bytes=[int64]$d.packetBytes}
    plaintextZip=[pscustomobject]@{sha256=$d.plaintextZipSha256;bytes=[int64]$d.plaintextZipBytes};maximumExpandedBytes=[int64]$d.plaintextZipBytes
    networkPolicy='disconnected-v1';identityEntryMethod='1password-type-in-window-provisional-v1'
    incomingRoot=Join-Path $fixed.isolatedRoot 'incoming';restoreRoot=Join-Path $fixed.isolatedRoot 'restore\canonical';stateRoot=Join-Path $fixed.isolatedRoot 'wp2c-state'
    toolingRoot=Join-Path $fixed.isolatedRoot ('tooling\'+(Get-Phase7BWP2CObjectHash $manifest))
  }
  foreach($name in Get-Phase7BWP2CPreparationBaselineFields){$b[$name]=$Baseline.$name}
  $plan=[pscustomobject][ordered]@{schemaVersion=1;kind='wp2c-preparation-observation-plan';bindings=[pscustomobject]$b;toolingManifest=$manifest;baselineSha256=Get-Phase7BWP2CObjectHash $Baseline;executionAuthorityIncluded=$false}
  Assert-Phase7BWP2CPreparationPlan $plan
  $plan
}

function Assert-Phase7BWP2CPreparationPlan {
  param($Plan)
  Assert-Phase7BWP2CExactProperties $Plan @('schemaVersion','kind','bindings','toolingManifest','baselineSha256','executionAuthorityIncluded')
  Assert-Phase7BWP2C ($Plan.schemaVersion -eq 1 -and $Plan.kind -ceq 'wp2c-preparation-observation-plan' -and $Plan.baselineSha256 -cmatch '^[0-9a-f]{64}$') 'PREPARATION_PLAN'
  Assert-Phase7BWP2CBoolean $Plan.executionAuthorityIncluded $false 'PREPARATION_IS_NOT_EXECUTION'
  $b=$Plan.bindings;$fixed=Get-Phase7BIsolatedGuestContract
  $names=@('attemptId','applicationCommit','environmentId','vmDisplayName','toolingCommit','preparedStateId','hostIdentitySha256','vmConfigSha256','snapshotSha256','snapshotName','toolingManifestSha256','toolingMedia','finalDescriptor','age','ageKeygen','packet','plaintextZip','maximumExpandedBytes','networkPolicy','identityEntryMethod','incomingRoot','restoreRoot','stateRoot','toolingRoot')+(Get-Phase7BWP2CPreparationBaselineFields)
  Assert-Phase7BWP2CExactProperties $b $names
  Assert-Phase7BWP2C ($b.attemptId -cmatch '^phase7b-wp2-[0-9a-f]{32}$' -and $b.toolingCommit -cmatch '^[0-9a-f]{40}$' -and $b.preparedStateId -cmatch '^wp2c-prepared-[0-9a-f]{32}$') 'PREPARATION_PLAN_BINDING'
  Assert-Phase7BWP2C ($b.applicationCommit -ceq $fixed.applicationCommit -and $b.environmentId -ceq $fixed.environmentId -and $b.vmDisplayName -ceq $fixed.vmDisplayName -and $b.snapshotName -ceq 'S1-physiqueos-bootstrap-inert') 'PREPARATION_PLAN_BINDING'
  foreach($name in @('hostIdentitySha256','vmConfigSha256','snapshotSha256','toolingManifestSha256','guestIdentitySha256','guestMarkerSha256')){Assert-Phase7BWP2C ($b.$name -cmatch '^[0-9a-f]{64}$') 'PREPARATION_PLAN_BINDING'}
  foreach($name in @('toolingMedia','finalDescriptor','age','ageKeygen','packet','plaintextZip','git')){
    Assert-Phase7BWP2CExactProperties $b.$name @('sha256','bytes')
    Assert-Phase7BWP2C ($b.$name.sha256 -cmatch '^[0-9a-f]{64}$' -and $b.$name.bytes -is [ValueType] -and [int64]$b.$name.bytes -gt 0) 'PREPARATION_PLAN_BINDING'
  }
  Assert-Phase7BWP2C ($b.maximumExpandedBytes -eq $b.plaintextZip.bytes -and $b.networkPolicy -ceq 'disconnected-v1' -and $b.identityEntryMethod -ceq '1password-type-in-window-provisional-v1') 'PREPARATION_PLAN_POLICY'
  foreach($pair in @(@('incomingRoot','incoming'),@('restoreRoot','restore\canonical'),@('stateRoot','wp2c-state'),@('toolingRoot',('tooling\'+$b.toolingManifestSha256)))){
    Assert-Phase7BWP2C ($b.($pair[0]) -ceq (Join-Path $fixed.isolatedRoot $pair[1])) 'PREPARATION_PLAN_ROOT'
  }
  Assert-Phase7BWP2C ((Get-Phase7BWP2CObjectHash $Plan.toolingManifest) -ceq $b.toolingManifestSha256 -and @($Plan.toolingManifest.files).Count -eq 14 -and $Plan.toolingManifest.secretsIncluded -ceq $false) 'PREPARATION_TOOLING_MANIFEST'
  Assert-Phase7BWP2CExactProperties $Plan.toolingManifest @('schemaVersion','kind','entryPoints','files','secretsIncluded')
  Assert-Phase7BWP2C ($Plan.toolingManifest.schemaVersion -eq 1 -and $Plan.toolingManifest.kind -ceq 'wp2c-tooling-manifest') 'PREPARATION_TOOLING_MANIFEST'
  foreach($file in $Plan.toolingManifest.files){
    Assert-Phase7BWP2CExactProperties $file @('name','sha256','bytes')
    Assert-Phase7BWP2C (($file.name -ceq 'b.cmd' -or $file.name -cmatch '^phase7b[A-Za-z0-9]+\.(ps1|psm1)$') -and $file.sha256 -cmatch '^[0-9a-f]{64}$' -and [int64]$file.bytes -gt 0) 'PREPARATION_TOOLING_MANIFEST'
  }
  foreach($name in $Plan.toolingManifest.entryPoints){Assert-Phase7BWP2C ($name -ceq 'b.cmd' -or $name -cmatch '^phase7b[A-Za-z0-9]+\.ps1$') 'PREPARATION_TOOLING_MANIFEST'}
  # Reject unknown strings/secret-shaped content before any persistence/return.
  $baseline=[ordered]@{schemaVersion=1;kind='wp2c-guest-preparation-baseline';applicationCommit=$b.applicationCommit;environmentId=$b.environmentId;observedAt='2000-01-01T00:00:00Z';mutationPerformed=$false}
  foreach($name in Get-Phase7BWP2CPreparationBaselineFields){$baseline[$name]=$b.$name}
  Assert-Phase7BWP2CPreparationBaseline ([pscustomobject]$baseline)
  Assert-Phase7BWP2C ((ConvertTo-Phase7BCanonicalJson $Plan) -notmatch 'AGE-SECRET-KEY-') 'PREPARATION_SECRET_FORBIDDEN'
}

function Assert-Phase7BWP2CPublishedRepository {
  param([string]$RepositoryRoot,[string]$ExpectedCommit)
  $branch=@(& git --no-optional-locks -C $RepositoryRoot branch --show-current)
  Assert-Phase7BWP2C ($LASTEXITCODE -eq 0 -and $branch.Count -eq 1 -and $branch[0] -ceq 'combined-app-platform-cutover') 'REPOSITORY_BRANCH'
  $head=@(& git --no-optional-locks -C $RepositoryRoot rev-parse HEAD)
  Assert-Phase7BWP2C ($LASTEXITCODE -eq 0 -and $head.Count -eq 1 -and $head[0] -ceq $ExpectedCommit) 'TOOLING_COMMIT_MISMATCH'
  $origin=@(& git --no-optional-locks -C $RepositoryRoot rev-parse refs/remotes/origin/combined-app-platform-cutover 2>$null)
  Assert-Phase7BWP2C ($LASTEXITCODE -eq 0 -and $origin.Count -eq 1 -and $origin[0] -ceq $ExpectedCommit) 'PUBLISHED_REF_MISMATCH'
  $status=@(& git --no-optional-locks -C $RepositoryRoot status --porcelain=v1 --untracked-files=all)
  Assert-Phase7BWP2C ($LASTEXITCODE -eq 0 -and $status.Count -eq 0) 'REPOSITORY_NOT_CLEAN'
  # This is a local publication guard, not a network fetch. Founder publication /
  # GO review separately verifies the real remote. No guest network is required.
}

function Assert-Phase7BWP2CBindings {
  param($Bindings)
  $b=$Bindings; $fixed=Get-Phase7BIsolatedGuestContract
  Assert-Phase7BWP2C ((ConvertTo-Phase7BCanonicalJson $b) -notmatch 'AGE-SECRET-KEY-') 'PRIVATE_IDENTITY_FORBIDDEN'
  Assert-Phase7BWP2C ($b.attemptId -cmatch '^phase7b-wp2-[0-9a-f]{32}$' -and $b.toolingCommit -cmatch '^[0-9a-f]{40}$') 'ATTEMPT_OR_COMMIT'
  Assert-Phase7BWP2C ($b.applicationCommit -ceq $fixed.applicationCommit -and $b.environmentId -ceq $fixed.environmentId -and $b.vmDisplayName -ceq $fixed.vmDisplayName) 'APPLICATION_BINDING'
  foreach($name in @('hostIdentitySha256','guestIdentitySha256','vmConfigSha256','snapshotSha256','preparationEvidenceSha256','toolingManifestSha256')) {
    Assert-Phase7BWP2C ($b.$name -cmatch '^[0-9a-f]{64}$') 'BINDING_HASH_SHAPE'
  }
  foreach($name in @('finalDescriptor','packet','restoreMedia','mediaDescriptor','toolingMedia','age','ageKeygen','git')) {
    Assert-Phase7BWP2C ($b.$name.sha256 -cmatch '^[0-9a-f]{64}$' -and [int64]$b.$name.bytes -gt 0) 'ARTIFACT_BINDING_SHAPE'
  }
  Assert-Phase7BWP2C ($b.ageRecipient -cmatch '^age1[023456789acdefghjklmnpqrstuvwxyz]{58}$' -and $b.ageEncryptionMode -ceq 'native-recipient-v1') 'NATIVE_RECIPIENT'
  Assert-Phase7BWP2C ($b.ageVersion -ceq '1.3.1' -and $b.ageKeygenVersion -ceq '1.3.1') 'AGE_VERSION'
  Assert-Phase7BWP2C ($b.guestMarkerSha256 -cmatch '^[0-9a-f]{64}$' -and $b.guestComputerName -cmatch '^[A-Z0-9-]{1,15}$') 'GUEST_MARKER'
  foreach($name in @('guestOsBuild','guestOsCaption','vmwareToolsVersion')) {Assert-Phase7BWP2C (-not [string]::IsNullOrWhiteSpace($b.$name)) 'GUEST_PLATFORM_BINDING'}
  Assert-Phase7BWP2C ($b.snapshotName -ceq 'S1-physiqueos-bootstrap-inert' -and $b.preparedStateId -cmatch '^wp2c-prepared-[0-9a-f]{32}$') 'SNAPSHOT_LINEAGE'
  Assert-Phase7BWP2C ($b.identityEntryMethod -ceq '1password-type-in-window-provisional-v1' -and $b.identityEntryValidationSha256 -cmatch '^[0-9a-f]{64}$') 'ENTRY_NOT_VALIDATED'
  Assert-Phase7BWP2C ($b.networkPolicy -ceq 'disconnected-v1' -and $b.claimSchemaVersion -eq 1 -and $b.completionSchemaVersion -eq 1) 'POLICY_BINDING'
  Assert-Phase7BWP2C ($b.vmConfigIdentityMode -ceq 'wp2c-offline-optical-projection-v1') 'VM_CONFIG_IDENTITY_MODE'
  Assert-Phase7BWP2C ($b.plaintextZip.sha256 -cmatch '^[0-9a-f]{64}$' -and [int64]$b.plaintextZip.bytes -gt 0 -and [int64]$b.maximumExpandedBytes -gt 0 -and [int64]$b.maximumExpandedBytes -le [int64]$b.plaintextZip.bytes) 'PLAINTEXT_BOUNDS'
  foreach($name in @('incomingRoot','restoreRoot','stateRoot','toolingRoot')) { [void](Assert-Phase7BWP2CLocalPath $b.$name $fixed.isolatedRoot) }
  Assert-Phase7BWP2C ($b.incomingRoot -ceq (Join-Path $fixed.isolatedRoot 'incoming') -and $b.restoreRoot -ceq (Join-Path $fixed.isolatedRoot 'restore\canonical') -and $b.stateRoot -ceq (Join-Path $fixed.isolatedRoot 'wp2c-state')) 'ROOT_BINDING'
  Assert-Phase7BWP2C ($b.toolingRoot -ceq (Join-Path $fixed.isolatedRoot ('tooling\'+$b.toolingManifestSha256))) 'TOOLING_ROOT'
}

function New-Phase7BWP2CInvocationContract {
  param($Bindings,$ToolingManifest,$HostArtifacts)
  Assert-Phase7BWP2CBindings $Bindings
  Assert-Phase7BWP2C ((Get-Phase7BWP2CObjectHash $ToolingManifest) -ceq $Bindings.toolingManifestSha256) 'MANIFEST_BINDING'
  Assert-Phase7BWP2C ($null -ne $HostArtifacts -and @($HostArtifacts.files).Count -gt 0) 'HOST_ARTIFACTS_REQUIRED'
  [pscustomobject][ordered]@{schemaVersion=1;kind='wp2c-invocation';bindings=$Bindings;toolingManifest=$ToolingManifest;hostArtifacts=$HostArtifacts;stage='WP2C_ISOLATED_RESTORE';oneUse=$true;automaticRetryAllowed=$false;laterMigrationAuthorized=$false}
}

function Assert-Phase7BWP2CInvocation {
  param($Contract)
  foreach($name in @('oneUse','automaticRetryAllowed','laterMigrationAuthorized')) {Assert-Phase7BWP2CBoolean $Contract.$name ($name -ceq 'oneUse') 'INVOCATION_BOOLEAN'}
  Assert-Phase7BWP2C ($Contract.schemaVersion -eq 1 -and $Contract.kind -ceq 'wp2c-invocation' -and $Contract.stage -ceq 'WP2C_ISOLATED_RESTORE' -and $Contract.oneUse -ceq $true -and $Contract.automaticRetryAllowed -ceq $false -and $Contract.laterMigrationAuthorized -ceq $false) 'INVOCATION_SCHEMA'
  Assert-Phase7BWP2CBindings $Contract.bindings
  Assert-Phase7BWP2C ((Get-Phase7BWP2CObjectHash $Contract.toolingManifest) -ceq $Contract.bindings.toolingManifestSha256) 'MANIFEST_BINDING'
  Assert-Phase7BWP2C (@($Contract.hostArtifacts.files).Count -gt 0) 'HOST_ARTIFACTS_REQUIRED'
}

function New-Phase7BWP2CAuthorization {
  param($Contract,[string]$InvocationContractSha256,[datetime]$Now=[datetime]::UtcNow)
  Assert-Phase7BWP2CInvocation $Contract
  Assert-Phase7BWP2C ($InvocationContractSha256 -cmatch '^[0-9a-f]{64}$') 'INVOCATION_HASH'
  [pscustomobject][ordered]@{schemaVersion=1;kind='wp2c-authorization';authorizationId='wp2c-auth-'+[Guid]::NewGuid().ToString('N');stage='WP2C_ISOLATED_RESTORE';bindings=$Contract.bindings;invocationContractSha256=$InvocationContractSha256;issuedAt=$Now.ToUniversalTime().ToString('o');expiresAt=$Now.ToUniversalTime().AddHours(24).ToString('o');oneUse=$true;mutationBudget=1;automaticRetryAllowed=$false;wp2cAuthorized=$true;laterMigrationAuthorized=$false}
}

function Assert-Phase7BWP2CAuthorization {
  param($Authorization,$Contract,[string]$InvocationContractSha256,[datetime]$Now=[datetime]::UtcNow)
  Assert-Phase7BWP2CInvocation $Contract
  $a=$Authorization
  foreach($name in @('oneUse','automaticRetryAllowed','wp2cAuthorized','laterMigrationAuthorized')) {Assert-Phase7BWP2CBoolean $a.$name ($name -in @('oneUse','wp2cAuthorized')) 'AUTHORIZATION_BOOLEAN'}
  Assert-Phase7BWP2C ($a.mutationBudget -is [int] -or $a.mutationBudget -is [long]) 'AUTHORIZATION_BUDGET_TYPE'
  Assert-Phase7BWP2C ($a.schemaVersion -eq 1 -and $a.kind -ceq 'wp2c-authorization' -and $a.authorizationId -cmatch '^wp2c-auth-[0-9a-f]{32}$' -and $a.stage -ceq 'WP2C_ISOLATED_RESTORE') 'AUTHORIZATION_SCHEMA'
  Assert-Phase7BWP2C ($a.oneUse -ceq $true -and $a.mutationBudget -eq 1 -and $a.automaticRetryAllowed -ceq $false -and $a.wp2cAuthorized -ceq $true -and $a.laterMigrationAuthorized -ceq $false) 'AUTHORIZATION_BUDGET'
  Assert-Phase7BWP2C ($a.invocationContractSha256 -ceq $InvocationContractSha256 -and (Get-Phase7BWP2CObjectHash $a.bindings) -ceq (Get-Phase7BWP2CObjectHash $Contract.bindings)) 'AUTHORIZATION_BINDING'
  $issued=[datetimeoffset]::Parse($a.issuedAt);$expires=[datetimeoffset]::Parse($a.expiresAt)
  Assert-Phase7BWP2C ($issued -le $Now -and $expires -gt $Now -and $expires -gt $issued -and ($expires-$issued).TotalHours -le 24) 'AUTHORIZATION_EXPIRED_OR_TIME_INVALID'
}

function Get-Phase7BWP2CExecutionState {
  param([string]$LedgerRoot,[string]$AuthorizationId)
  Assert-Phase7BWP2C ($AuthorizationId -cmatch '^wp2c-auth-[0-9a-f]{32}$') 'AUTHORIZATION_ID'
  [void](Assert-Phase7BWP2CLocalPath $LedgerRoot)
  Assert-Phase7BWP2C (Test-Path -LiteralPath $LedgerRoot -PathType Container) 'LEDGER_MISSING'
  if (Test-Path -LiteralPath (Join-Path $LedgerRoot "$AuthorizationId.complete.json")) { return 'COMPLETED_TERMINAL' }
  if (Test-Path -LiteralPath (Join-Path $LedgerRoot "$AuthorizationId.claim.json")) { return 'CLAIMED_RECONCILIATION_REQUIRED' }
  if (Test-Path -LiteralPath (Join-Path $LedgerRoot "$AuthorizationId.boot.json")) { return 'CLAIMED_RECONCILIATION_REQUIRED' }
  'UNCLAIMED'
}

function Assert-Phase7BWP2CNoCurrentConflict {
  param([string]$AuthorizationDirectory,$Contract,[string]$LedgerRoot,[datetime]$Now=[datetime]::UtcNow)
  # No historical count. Unreadable candidate documents fail closed; older valid identities are audit-only.
  foreach($file in @(Get-ChildItem -LiteralPath $AuthorizationDirectory -Filter 'wp2c-auth-*.json' -File -ErrorAction Stop)) {
    if ($file.Name -match '\.(claim|complete)\.json$') { continue }
    $a=Get-Content -LiteralPath $file.FullName -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
    if ($a.bindings.attemptId -cne $Contract.bindings.attemptId -or $a.bindings.toolingCommit -cne $Contract.bindings.toolingCommit) { continue }
    if ((Get-Phase7BWP2CExecutionState $LedgerRoot $a.authorizationId) -cne 'UNCLAIMED') { throw 'PHASE7B_WP2C_CURRENT_CLAIM_REQUIRES_RECONCILIATION' }
    # Validate shape/bindings even if expired. Expired well-formed authorization alone is terminal evidence.
    Assert-Phase7BWP2CAuthorization $a $Contract $a.invocationContractSha256 ([datetimeoffset]::Parse($a.issuedAt).UtcDateTime)
    if ([datetimeoffset]::Parse($a.expiresAt) -gt $Now) { throw 'PHASE7B_WP2C_CURRENT_AUTHORIZATION_CONFLICT' }
  }
}

function New-Phase7BWP2CExecutionClaim {
  param([string]$LedgerRoot,$Authorization,[string]$AuthorizationSha256,[ValidateSet('host','guest')][string]$Side,[string]$ParentClaimSha256)
  Assert-Phase7BWP2C ((Get-Phase7BWP2CExecutionState $LedgerRoot $Authorization.authorizationId) -ceq 'UNCLAIMED') 'EXECUTION_REPLAY'
  Assert-Phase7BWP2C ($AuthorizationSha256 -cmatch '^[0-9a-f]{64}$') 'AUTHORIZATION_HASH'
  if($Side -ceq 'guest'){Assert-Phase7BWP2C ($ParentClaimSha256 -cmatch '^[0-9a-f]{64}$') 'HOST_CLAIM_REQUIRED'}
  $claim=[pscustomobject][ordered]@{schemaVersion=1;kind='wp2c-execution-claim';side=$Side;authorizationId=$Authorization.authorizationId;authorizationSha256=$AuthorizationSha256;invocationContractSha256=$Authorization.invocationContractSha256;bindingsSha256=Get-Phase7BWP2CObjectHash $Authorization.bindings;claimId=[Guid]::NewGuid().ToString('N');parentClaimSha256=$ParentClaimSha256;claimedAt=[datetime]::UtcNow.ToString('o');automaticRetryAllowed=$false}
  $path=Join-Path $LedgerRoot ($Authorization.authorizationId+'.claim.json')
  $identity=Write-Phase7BWP2CCreateNewJson $path $claim
  [pscustomobject]@{document=$claim;identity=$identity;path=$path}
}

function Assert-Phase7BWP2CClaim {
  param($Claim,$Authorization,[string]$AuthorizationSha256,[string]$Side)
  Assert-Phase7BWP2C ($Claim.schemaVersion -eq 1 -and $Claim.kind -ceq 'wp2c-execution-claim' -and $Claim.side -ceq $Side -and $Claim.authorizationId -ceq $Authorization.authorizationId -and $Claim.authorizationSha256 -ceq $AuthorizationSha256 -and $Claim.invocationContractSha256 -ceq $Authorization.invocationContractSha256 -and $Claim.bindingsSha256 -ceq (Get-Phase7BWP2CObjectHash $Authorization.bindings) -and $Claim.automaticRetryAllowed -ceq $false) 'CLAIM_BINDING'
  Assert-Phase7BWP2C ($Claim.claimId -cmatch '^[0-9a-f]{32}$' -and [datetimeoffset]::Parse($Claim.claimedAt) -ge [datetimeoffset]::Parse($Authorization.issuedAt) -and [datetimeoffset]::Parse($Claim.claimedAt) -lt [datetimeoffset]::Parse($Authorization.expiresAt)) 'CLAIM_TIME'
}

function Complete-Phase7BWP2CExecution {
  param([string]$LedgerRoot,$Authorization,[string]$ClaimSha256,[string]$EvidenceSha256)
  Assert-Phase7BWP2C ((Get-Phase7BWP2CExecutionState $LedgerRoot $Authorization.authorizationId) -ceq 'CLAIMED_RECONCILIATION_REQUIRED') 'COMPLETION_STATE'
  $claimPath=Join-Path $LedgerRoot ($Authorization.authorizationId+'.claim.json')
  Assert-Phase7BWP2C ((Get-Phase7BSha256 -LiteralPath $claimPath) -ceq $ClaimSha256 -and $EvidenceSha256 -cmatch '^[0-9a-f]{64}$') 'COMPLETION_BINDING'
  $marker=[pscustomobject][ordered]@{schemaVersion=1;kind='wp2c-completion';authorizationId=$Authorization.authorizationId;claimSha256=$ClaimSha256;evidenceSha256=$EvidenceSha256;completedAt=[datetime]::UtcNow.ToString('o');authorizationConsumed=$true;automaticRetryAllowed=$false;wp2cAuthorized=$false;laterMigrationAuthorized=$false}
  Write-Phase7BWP2CCreateNewJson (Join-Path $LedgerRoot ($Authorization.authorizationId+'.complete.json')) $marker
}

function Get-Phase7BWP2CRecoveryDecision {
  param([ValidateSet('preparation-preflight','tooling-install','media-attach','guest-boot','synthetic-entry','execution-preflight','claimed','staged','decrypt','zip','extract','verify','evidence-written','completed','shutdown','snapshot','outer-closeout')][string]$State,[switch]$HostClaimExists)
  $claimed=$HostClaimExists.IsPresent -or $State -in @('claimed','staged','decrypt','zip','extract','verify','evidence-written','completed','shutdown','snapshot','outer-closeout')
  $completed=$State -in @('completed','shutdown','snapshot','outer-closeout')
  [pscustomobject][ordered]@{classification=if($completed){'WP2C_COMPLETED_CLOSEOUT_RECONCILIATION'}elseif($claimed){'WP2C_CLAIMED_RECONCILIATION_REQUIRED'}else{'WP2C_PRE_EXECUTION_STOP'};state=$State;restoreReplayAllowed=$false;automaticRetryAllowed=$false;claimMustRemain=$claimed;completionExpected=$completed;newFounderReviewRequired=$true;automaticRevertAllowed=$false;manualDeletionAllowed=$false;plaintextMayRemain=$State -in @('decrypt','zip','extract','verify','evidence-written','completed','shutdown','snapshot','outer-closeout');wp2cAuthorized=$false}
}

Export-ModuleMember -Function *-Phase7BWP2C*
