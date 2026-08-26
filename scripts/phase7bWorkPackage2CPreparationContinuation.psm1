Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bIsolatedGuestContract.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2Contract.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CContract.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CHost.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CMedia.psm1')

# Host-only preparation provenance. Never imported by guest tooling. No VM,
# execution-claim, secret, recovery-packet or original-session write operation.
function Get-Phase7BWP2COriginalPreparationInventory {
  param([string]$Root)
  $rootPath=Assert-Phase7BWP2CLocalPath $Root 'C:\Phase7B\host-evidence\379bb303\wp2c'
  $items=@(Get-ChildItem -LiteralPath $rootPath -Recurse -Force -ErrorAction Stop)
  Assert-Phase7BWP2C (@($items|Where-Object {$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count -eq 0) 'CONTINUATION_ORIGINAL_REPARSE'
  $files=@(foreach($item in @($items|Where-Object {-not $_.PSIsContainer}|Sort-Object FullName)){
    [pscustomobject][ordered]@{name=$item.FullName.Substring($rootPath.Length+1).Replace('\','/');identity=Get-Phase7BWP2CIdentity $item.FullName}
  })
  [pscustomobject][ordered]@{schemaVersion=1;kind='wp2c-original-preparation-inventory';files=$files}
}

function Read-Phase7BWP2COriginalPreparation {
  param([string]$Root,[string]$SessionSha256,[string]$InventorySha256)
  $Root=Assert-Phase7BWP2CLocalPath $Root 'C:\Phase7B\host-evidence\379bb303\wp2c'
  $inventory=Get-Phase7BWP2COriginalPreparationInventory $Root
  Assert-Phase7BWP2C ($InventorySha256 -cmatch '^[0-9a-f]{64}$' -and (Get-Phase7BWP2CObjectHash $inventory) -ceq $InventorySha256) 'CONTINUATION_ORIGINAL_INVENTORY'
  $top=@(Get-ChildItem -LiteralPath $Root -Force)
  $names=@('session.json','OPERATOR.md','tooling-inputs.json','tooling-result.json','tooling.iso','tooling.iso.content')
  if('tooling-step.txt' -in @($top.Name)){$names+=@('tooling-step.txt')}
  Assert-Phase7BWP2C (@(Compare-Object $names @($top.Name)).Count -eq 0 -and @($top|Where-Object {$_.PSIsContainer -and $_.Name -cne 'tooling.iso.content'}).Count -eq 0) 'CONTINUATION_NOT_PREBASELINE'
  $sessionPath=Join-Path $Root 'session.json';$s=Read-Phase7BWP2CBoundJson $sessionPath $SessionSha256
  Assert-Phase7BWP2CExactProperties $s @('schemaVersion','kind','toolingCommit','preparedStateId','hostIdentitySha256','expectedGuestIdentitySha256','vmxPath','snapshotMetadataPath','snapshotSha256','descriptorPath','descriptorSha256','agePath','age','ageKeygenPath','ageKeygen','operator')
  Assert-Phase7BWP2C ($s.schemaVersion -eq 1 -and $s.kind -ceq 'wp2c-preparation-operator-session' -and $s.toolingCommit -cmatch '^[0-9a-f]{40}$' -and $s.preparedStateId -cmatch '^wp2c-prepared-[0-9a-f]{32}$') 'CONTINUATION_ORIGINAL_SESSION'
  $resultPath=Join-Path $Root 'tooling-result.json';$result=Read-Phase7BWP2CBoundJson $resultPath (Get-Phase7BWP2CIdentity $resultPath).sha256
  Assert-Phase7BWP2C ($result.classification -ceq 'PHASE7B_WP2C_MEDIA_CREATED' -and $result.kind -ceq 'Tooling' -and $result.wp2cExecuted -ceq $false -and $result.secretIncluded -ceq $false -and $result.automaticRetryAllowed -ceq $false) 'CONTINUATION_ORIGINAL_MEDIA'
  $mediaPath=Join-Path $Root 'tooling.iso';Assert-Phase7BWP2CFile $mediaPath $result.identity
  $content=$mediaPath+'.content';$manifestPath=Join-Path $content 'wp2c-tooling-manifest.json'
  $manifest=Read-Phase7BWP2CBoundJson $manifestPath $result.content.manifestIdentity.sha256
  Assert-Phase7BWP2C ((Get-Phase7BWP2CObjectHash $manifest) -ceq (Get-Phase7BWP2CObjectHash $result.content.manifest) -and @($manifest.files).Count -eq 12 -and $manifest.secretsIncluded -ceq $false) 'CONTINUATION_ORIGINAL_MANIFEST'
  Assert-Phase7BWP2CExactFileSet $content (@($manifest.files.name)+@('age.exe','age-keygen.exe','wp2c-tooling-manifest.json'))
  foreach($f in $manifest.files){Assert-Phase7BWP2C ($f.name -cmatch '^phase7b[A-Za-z0-9]+\.(ps1|psm1)$') 'CONTINUATION_PAYLOAD_PATH';Assert-Phase7BWP2CFile (Join-Path $content $f.name) $f}
  Assert-Phase7BWP2CFile (Join-Path $content 'age.exe') $s.age;Assert-Phase7BWP2CFile (Join-Path $content 'age-keygen.exe') $s.ageKeygen
  $descriptor=Read-Phase7BWP2CBoundJson $s.descriptorPath $s.descriptorSha256;$fixed=Get-Phase7BIsolatedGuestContract
  Assert-Phase7BWP2C ($descriptor.classification -ceq 'PHASE7B_WP2_ENCRYPTED_PACKET_AND_REPLICA_PASS' -and $descriptor.applicationCommit -ceq $fixed.applicationCommit -and $descriptor.environmentId -ceq $fixed.environmentId -and $descriptor.decryptRoundTripPass -ceq $true) 'CONTINUATION_DESCRIPTOR'
  $origin=[pscustomobject][ordered]@{root=Assert-Phase7BWP2CLocalPath $Root;sessionId=$s.preparedStateId;initializationCommit=$s.toolingCommit;operator=$s.operator;sessionMetadata=Get-Phase7BWP2CIdentity $sessionPath;inventory=$inventory;inventorySha256=$InventorySha256;toolingMedia=$result.identity;toolingManifest=Get-Phase7BWP2CIdentity $manifestPath;descriptor=Get-Phase7BWP2CIdentity $s.descriptorPath;attemptId=$descriptor.attemptId;applicationCommit=$fixed.applicationCommit;environmentId=$fixed.environmentId;baselineCaptured=$false;planCreated=$false;preparationAccepted=$false}
  [pscustomobject]@{origin=$origin;settings=$s}
}

function Get-Phase7BWP2CContinuationRoot {
  param([string]$OriginalRoot,[string]$SessionId,[string]$Commit)
  Assert-Phase7BWP2C ($SessionId -cmatch '^wp2c-prepared-[0-9a-f]{32}$' -and $Commit -cmatch '^[0-9a-f]{40}$') 'CONTINUATION_PATH_ID'
  $path=Join-Path (Split-Path -Parent $OriginalRoot) ('continuations\'+$SessionId+'\'+$Commit)
  Assert-Phase7BWP2CLocalPath $path 'C:\Phase7B\host-evidence\379bb303\wp2c'
}

function Assert-Phase7BWP2CContinuationShape {
  param($Context)
  $c=$Context
  Assert-Phase7BWP2CExactProperties $c @('schemaVersion','kind','classification','original','current','vm','createdAt','nonExecutable','preparationOnly','automaticRetryAllowed','wp2cExecutionAuthorized','laterMigrationAuthorized')
  Assert-Phase7BWP2C ($c.schemaVersion -eq 1 -and $c.kind -ceq 'wp2c-preparation-continuation' -and $c.classification -ceq 'PHASE7B_WP2C_PREPARATION_CONTINUATION_NONEXECUTABLE') 'CONTINUATION_SCHEMA'
  foreach($name in @('nonExecutable','preparationOnly')){Assert-Phase7BWP2CBoolean $c.$name $true 'CONTINUATION_AUTHORITY'}
  foreach($name in @('automaticRetryAllowed','wp2cExecutionAuthorized','laterMigrationAuthorized')){Assert-Phase7BWP2CBoolean $c.$name $false 'CONTINUATION_AUTHORITY'}
  Assert-Phase7BWP2CExactProperties $c.current @('toolingCommit','operator','hostModule','hostDependencies','toolingManifest','toolingManifestIdentity','toolingMediaPath','toolingMedia','toolingResult')
  Assert-Phase7BWP2CExactProperties $c.original @('root','sessionId','initializationCommit','operator','sessionMetadata','inventory','inventorySha256','toolingMedia','toolingManifest','descriptor','attemptId','applicationCommit','environmentId','baselineCaptured','planCreated','preparationAccepted')
  Assert-Phase7BWP2CExactProperties $c.vm @('originalVmx','vmsd','configSha256','guestIdentitySha256','snapshotName')
  [void][datetimeoffset]::Parse($c.createdAt)
}

function Assert-Phase7BWP2CContinuationRegistry {
  param([string]$Root,[string]$OriginalSessionId,[switch]$RequirePreBaseline)
  $parent=Split-Path -Parent $Root
  if(-not (Test-Path -LiteralPath $parent)){return}
  foreach($item in @(Get-ChildItem -LiteralPath $parent -Force)){
    Assert-Phase7BWP2C ($item.PSIsContainer -and $item.Name -cmatch '^[0-9a-f]{40}$' -and -not ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) 'CONTINUATION_CONFLICT'
    $path=Join-Path $item.FullName 'continuation.json'
    Assert-Phase7BWP2C (Test-Path -LiteralPath $path -PathType Leaf) 'CONTINUATION_PARTIAL_RECONCILIATION_REQUIRED'
    $c=Read-Phase7BWP2CBoundJson $path (Get-Phase7BWP2CIdentity $path).sha256
    Assert-Phase7BWP2CContinuationShape $c
    Assert-Phase7BWP2C ($c.kind -ceq 'wp2c-preparation-continuation' -and $c.schemaVersion -eq 1 -and $c.current.toolingCommit -ceq $item.Name -and $c.original.sessionId -ceq $OriginalSessionId) 'CONTINUATION_CONFLICT'
    if($RequirePreBaseline){
      # A later tooling commit cannot restart from the frozen original after an
      # earlier continuation has progressed. Historical count is not the gate;
      # observed lifecycle state is. Existing exact contexts remain readable.
      $allowed=@('continuation.json','tooling-inputs.json','tooling-result.json','tooling-current.iso','tooling-current.iso.content')
      Assert-Phase7BWP2C (@(Get-ChildItem -LiteralPath $item.FullName -Force|Where-Object {$_.Name -cnotin $allowed}).Count -eq 0) 'CONTINUATION_PRIOR_PROGRESS_RECONCILIATION_REQUIRED'
    }
    # No historical cardinality gate and no latest-context selection.
  }
}

function Read-Phase7BInternalPreparationContinuation {
  param([string]$Path,[string]$Sha256,[string]$RepositoryRoot,[switch]$HistoricalOnly)
  [void](Assert-Phase7BWP2CLocalPath $Path 'C:\Phase7B\host-evidence\379bb303\wp2c')
  $c=Read-Phase7BWP2CBoundJson $Path $Sha256
  Assert-Phase7BWP2CContinuationShape $c
  $original=Read-Phase7BWP2COriginalPreparation $c.original.root $c.original.sessionMetadata.sha256 $c.original.inventorySha256
  Assert-Phase7BWP2C ((Get-Phase7BWP2CObjectHash $original.origin) -ceq (Get-Phase7BWP2CObjectHash $c.original)) 'CONTINUATION_ORIGINAL_BINDING'
  $root=Get-Phase7BWP2CContinuationRoot $c.original.root $c.original.sessionId $c.current.toolingCommit
  Assert-Phase7BWP2C ((Assert-Phase7BWP2CLocalPath $Path) -ceq (Join-Path $root 'continuation.json')) 'CONTINUATION_EXACT_PATH'
  Assert-Phase7BWP2CContinuationRegistry $root $c.original.sessionId
  $source=Join-Path $RepositoryRoot 'scripts'
  if($HistoricalOnly){
    $manifest=$c.current.toolingManifest
  }else{
    Assert-Phase7BWP2CPublishedRepository $RepositoryRoot $c.current.toolingCommit
    Assert-Phase7BWP2CFile (Join-Path $source 'phase7bWorkPackage2CPreparationOperator.ps1') $c.current.operator
    Assert-Phase7BWP2CFile (Join-Path $source 'phase7bWorkPackage2CHost.psm1') $c.current.hostModule
    $hostDependencies=Get-Phase7BWP2CDependencyManifest $source @('phase7bWorkPackage2CPreparationOperator.ps1','phase7bRecordWorkPackage2CPreparation.ps1')
    Assert-Phase7BWP2C ((Get-Phase7BWP2CObjectHash $hostDependencies) -ceq (Get-Phase7BWP2CObjectHash $c.current.hostDependencies)) 'CONTINUATION_HOST_DEPENDENCIES'
    $manifest=Get-Phase7BWP2CDependencyManifest $source
    Assert-Phase7BWP2C ((Get-Phase7BWP2CObjectHash $manifest) -ceq (Get-Phase7BWP2CObjectHash $c.current.toolingManifest)) 'CONTINUATION_CURRENT_MANIFEST'
  }
  Assert-Phase7BWP2C ($c.current.toolingMediaPath -ceq (Join-Path $root 'tooling-current.iso')) 'CONTINUATION_CURRENT_MEDIA_PATH'
  Assert-Phase7BWP2CFile $c.current.toolingMediaPath $c.current.toolingMedia
  $tool=Read-Phase7BWP2CBoundJson (Join-Path $root 'tooling-result.json') $c.current.toolingResult.sha256
  Assert-Phase7BWP2CFile (Join-Path $root 'tooling-result.json') $c.current.toolingResult
  Assert-Phase7BWP2C ((Get-Phase7BWP2CObjectHash $tool.identity) -ceq (Get-Phase7BWP2CObjectHash $c.current.toolingMedia) -and (Get-Phase7BWP2CObjectHash $tool.content.manifest) -ceq (Get-Phase7BWP2CObjectHash $manifest)) 'CONTINUATION_TOOLING_RESULT'
  $content=$c.current.toolingMediaPath+'.content';Assert-Phase7BWP2CExactFileSet $content (@($manifest.files.name)+@('age.exe','age-keygen.exe','wp2c-tooling-manifest.json'))
  Assert-Phase7BWP2CFile (Join-Path $content 'wp2c-tooling-manifest.json') $c.current.toolingManifestIdentity
  Assert-Phase7BWP2C ($c.current.toolingManifestIdentity.sha256 -ceq (Get-Phase7BWP2CObjectHash $manifest)) 'CONTINUATION_CURRENT_MANIFEST'
  foreach($f in $manifest.files){Assert-Phase7BWP2CFile (Join-Path $content $f.name) $f}
  $s=$original.settings
  foreach($pair in @(@('age.exe','age'),@('age-keygen.exe','ageKeygen'))){Assert-Phase7BWP2CFile (Join-Path $content $pair[0]) $s.($pair[1])}
  Assert-Phase7BWP2C ($c.vm.originalVmx.sha256 -cmatch '^[0-9a-f]{64}$' -and $c.vm.originalVmx.bytes -gt 0 -and $c.vm.snapshotName -ceq 'S1-physiqueos-bootstrap-inert' -and $c.vm.vmsd.sha256 -ceq $s.snapshotSha256) 'CONTINUATION_VM_BINDING'
  Assert-Phase7BWP2CFile $s.snapshotMetadataPath $c.vm.vmsd
  Assert-Phase7BWP2C ($c.vm.guestIdentitySha256 -ceq $s.expectedGuestIdentitySha256) 'CONTINUATION_VM_BINDING'
  if(-not $HistoricalOnly){
    $vmx=Read-Phase7BWP2COpticalVmx $s.vmxPath
    Assert-Phase7BWP2C ((Get-Phase7BWP2CVmxIdentity $vmx).sha256 -ceq $c.vm.configSha256 -and (Get-Phase7BWP2CExpectedGuestIdentity $vmx) -ceq $c.vm.guestIdentitySha256) 'CONTINUATION_VM_BINDING'
  }
  # Read-only validation remains usable during Founder EntryReview while the
  # guest is running. Cold/RAM gates remain owned by each existing lifecycle mode.
  $settings=ConvertTo-Phase7BCanonicalJson $s|ConvertFrom-Json
  $settings.toolingCommit=$c.current.toolingCommit;$settings.operator=$c.current.operator
  [pscustomobject]@{document=$c;identity=Get-Phase7BWP2CIdentity $Path;root=$root;settings=$settings;tooling=$tool;historicalOnly=[bool]$HistoricalOnly}
}

function Read-Phase7BWP2CPreparationContinuation {
  param([string]$Path,[string]$Sha256,[string]$RepositoryRoot)
  Read-Phase7BInternalPreparationContinuation $Path $Sha256 $RepositoryRoot
}

function New-Phase7BWP2CPreparationContinuation {
  param([string]$OriginalRoot,[string]$OriginalSessionSha256,[string]$OriginalInventorySha256,[string]$OriginalVmxSha256,[string]$RepositoryRoot,[string]$ToolingCommit)
  Assert-Phase7BWP2CPublishedRepository $RepositoryRoot $ToolingCommit
  $original=Read-Phase7BWP2COriginalPreparation $OriginalRoot $OriginalSessionSha256 $OriginalInventorySha256;$s=$original.settings
  $OriginalRoot=$original.origin.root
  $root=Get-Phase7BWP2CContinuationRoot $OriginalRoot $s.preparedStateId $ToolingCommit
  Assert-Phase7BWP2CContinuationRegistry $root $s.preparedStateId
  $path=Join-Path $root 'continuation.json'
  if(Test-Path -LiteralPath $root){
    $existing=Read-Phase7BWP2CPreparationContinuation $path (Get-Phase7BWP2CIdentity $path).sha256 $RepositoryRoot
    Assert-Phase7BWP2C ($existing.document.vm.originalVmx.sha256 -ceq $OriginalVmxSha256) 'CONTINUATION_ORIGINAL_VMX'
    return [pscustomobject]@{classification='PHASE7B_WP2C_PREPARATION_CONTINUATION_EXISTS';path=$path;identity=$existing.identity;created=$false;wp2cExecuted=$false}
  }
  Assert-Phase7BWP2CContinuationRegistry $root $s.preparedStateId -RequirePreBaseline
  Assert-Phase7BWP2C ((Get-Phase7BWP2CIdentity $s.vmxPath).sha256 -ceq $OriginalVmxSha256 -and (Get-Phase7BWP2CIdentity $s.snapshotMetadataPath).sha256 -ceq $s.snapshotSha256) 'CONTINUATION_ORIGINAL_VM'
  $cold=Get-Phase7BWP2CHostObservation $s.vmxPath $s.snapshotMetadataPath
  # Context/media preparation is not VM boot: do not demand spare RAM here.
  # Both actual boot gates still require >=7 GiB immediately before boot.
  Assert-Phase7BWP2C ($cold.poweredOff -ceq $true -and $cold.memorySnapshotPresent -ceq $false -and $cold.vmContractPass -ceq $true -and $cold.nicStartConnected -ceq $false -and $cold.clipboardDisabled -ceq $true -and $cold.dragDropDisabled -ceq $true -and $cold.sharedFoldersDisabled -ceq $true -and $cold.hostIdentitySha256 -ceq $s.hostIdentitySha256) 'CONTINUATION_COLD_ISOLATION'
  $vmx=Read-Phase7BWP2COpticalVmx $s.vmxPath
  Assert-Phase7BWP2CPreparationBootMedia $vmx (Join-Path $OriginalRoot 'tooling.iso')
  Assert-Phase7BWP2C ((Get-Phase7BWP2CExpectedGuestIdentity $vmx) -ceq $s.expectedGuestIdentitySha256) 'CONTINUATION_WRONG_GUEST'
  $snaps=Read-Phase7BVmx $s.snapshotMetadataPath
  Assert-Phase7BWP2C (@($snaps.Values|Where-Object {$_ -ceq 'S0-clean-windows-pre-bootstrap'}).Count -eq 1) 'CONTINUATION_S0_REQUIRED'
  Assert-Phase7BWP2CFile $s.agePath $s.age;Assert-Phase7BWP2CFile $s.ageKeygenPath $s.ageKeygen
  $source=Join-Path $RepositoryRoot 'scripts'
  $manifest=Get-Phase7BWP2CDependencyManifest $source
  $hostDependencies=Get-Phase7BWP2CDependencyManifest $source @('phase7bWorkPackage2CPreparationOperator.ps1','phase7bRecordWorkPackage2CPreparation.ps1')
  $vm=[pscustomobject][ordered]@{originalVmx=Get-Phase7BWP2CIdentity $s.vmxPath;vmsd=Get-Phase7BWP2CIdentity $s.snapshotMetadataPath;configSha256=$cold.vmConfigSha256;guestIdentitySha256=$s.expectedGuestIdentitySha256;snapshotName='S1-physiqueos-bootstrap-inert'}
  # First mutation: a distinct create-new directory. Any partial failure remains
  # for reconciliation; no automatic retry, removal or original-directory write.
  New-Item -ItemType Directory -Path $root -ErrorAction Stop|Out-Null
  $inputs=[pscustomobject]@{agePath=$s.agePath;age=$s.age;ageKeygenPath=$s.ageKeygenPath;ageKeygen=$s.ageKeygen}
  $inputPath=Join-Path $root 'tooling-inputs.json';[void](Write-Phase7BWP2CCreateNewJson $inputPath $inputs)
  $mediaPath=Join-Path $root 'tooling-current.iso'
  $raw=& (Join-Path $PSScriptRoot 'phase7bBuildWorkPackage2CMedia.ps1') -Kind Tooling -InputsPath $inputPath -OutputPath $mediaPath -FounderMediaPreparationApproved
  $tool=($raw -join "`n")|ConvertFrom-Json
  Assert-Phase7BWP2C ((Get-Phase7BWP2CObjectHash $tool.content.manifest) -ceq (Get-Phase7BWP2CObjectHash $manifest)) 'CONTINUATION_BUILD_SOURCE_CHANGED'
  $resultId=Write-Phase7BWP2CCreateNewJson (Join-Path $root 'tooling-result.json') $tool
  [void](Read-Phase7BWP2COriginalPreparation $OriginalRoot $OriginalSessionSha256 $OriginalInventorySha256)
  Assert-Phase7BWP2CFile $s.vmxPath $vm.originalVmx;Assert-Phase7BWP2CFile $s.snapshotMetadataPath $vm.vmsd
  $current=[pscustomobject][ordered]@{toolingCommit=$ToolingCommit;operator=Get-Phase7BWP2CIdentity (Join-Path $source 'phase7bWorkPackage2CPreparationOperator.ps1');hostModule=Get-Phase7BWP2CIdentity (Join-Path $source 'phase7bWorkPackage2CHost.psm1');hostDependencies=$hostDependencies;toolingManifest=$manifest;toolingManifestIdentity=$tool.content.manifestIdentity;toolingMediaPath=$mediaPath;toolingMedia=$tool.identity;toolingResult=$resultId}
  $c=[pscustomobject][ordered]@{schemaVersion=1;kind='wp2c-preparation-continuation';classification='PHASE7B_WP2C_PREPARATION_CONTINUATION_NONEXECUTABLE';original=$original.origin;current=$current;vm=$vm;createdAt=[datetime]::UtcNow.ToString('o');nonExecutable=$true;preparationOnly=$true;automaticRetryAllowed=$false;wp2cExecutionAuthorized=$false;laterMigrationAuthorized=$false}
  $id=Write-Phase7BWP2CCreateNewJson $path $c
  [void](Read-Phase7BWP2CPreparationContinuation $path $id.sha256 $RepositoryRoot)
  [pscustomobject]@{classification=$c.classification;path=$path;identity=$id;created=$true;wp2cExecuted=$false}
}

function Get-Phase7BWP2CVmBindingContinuationRoot {
  param([string]$ParentRoot,[string]$Commit)
  Assert-Phase7BWP2C ($Commit -cmatch '^[0-9a-f]{40}$') 'VM_BINDING_CONTINUATION_COMMIT'
  $sessionId=Split-Path -Leaf (Split-Path -Parent $ParentRoot)
  Assert-Phase7BWP2C ($sessionId -cmatch '^wp2c-prepared-[0-9a-f]{32}$') 'VM_BINDING_CONTINUATION_SESSION'
  $wp2cRoot=Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $ParentRoot))
  # Keep current tooling content below the Windows PowerShell 5.1/.NET
  # Framework MAX_PATH boundary. The parent continuation identity is bound in
  # the document; filesystem nesting is not provenance.
  Assert-Phase7BWP2CLocalPath (Join-Path $wp2cRoot ('vm-bindings\'+$sessionId+'\'+$Commit)) 'C:\Phase7B\host-evidence\379bb303\wp2c'
}

function Assert-Phase7BWP2CVmBindingContinuationShape {
  param($Binding)
  $b=$Binding
  Assert-Phase7BWP2CExactProperties $b @('schemaVersion','kind','classification','parent','current','vm','createdAt','nonExecutable','preparationOnly','automaticRetryAllowed','wp2cExecutionAuthorized','laterMigrationAuthorized')
  Assert-Phase7BWP2C ($b.schemaVersion -eq 1 -and $b.kind -ceq 'wp2c-preparation-vm-binding-continuation' -and $b.classification -ceq 'PHASE7B_WP2C_PREPARATION_VM_BINDING_CONTINUATION_NONEXECUTABLE') 'VM_BINDING_CONTINUATION_SCHEMA'
  Assert-Phase7BWP2CExactProperties $b.parent @('path','identity','toolingCommit','toolingMedia','legacyVmConfigSha256')
  Assert-Phase7BWP2CExactProperties $b.current @('toolingCommit','operator','hostModule','hostDependencies','toolingManifest','toolingManifestIdentity','toolingMediaPath','toolingMedia','toolingResult')
  Assert-Phase7BWP2CExactProperties $b.vm @('semanticMode','semanticSha256','stoppedVmx','vmsd','guestIdentitySha256','snapshotName')
  Assert-Phase7BWP2C ($b.vm.semanticMode -ceq 'wp2c-semantic-vmx-v2' -and $b.vm.semanticSha256 -cmatch '^[0-9a-f]{64}$' -and $b.vm.snapshotName -ceq 'S1-physiqueos-bootstrap-inert') 'VM_BINDING_CONTINUATION_VM'
  foreach($name in @('nonExecutable','preparationOnly')){Assert-Phase7BWP2CBoolean $b.$name $true 'VM_BINDING_CONTINUATION_AUTHORITY'}
  foreach($name in @('automaticRetryAllowed','wp2cExecutionAuthorized','laterMigrationAuthorized')){Assert-Phase7BWP2CBoolean $b.$name $false 'VM_BINDING_CONTINUATION_AUTHORITY'}
  [void][datetimeoffset]::Parse($b.createdAt)
}

function Read-Phase7BWP2CVmBindingContinuation {
  param([string]$Path,[string]$Sha256,[string]$RepositoryRoot)
  [void](Assert-Phase7BWP2CLocalPath $Path 'C:\Phase7B\host-evidence\379bb303\wp2c')
  $b=Read-Phase7BWP2CBoundJson $Path $Sha256;Assert-Phase7BWP2CVmBindingContinuationShape $b
  $parent=Read-Phase7BInternalPreparationContinuation $b.parent.path $b.parent.identity.sha256 $RepositoryRoot -HistoricalOnly
  Assert-Phase7BWP2C ((Get-Phase7BWP2CObjectHash $parent.identity) -ceq (Get-Phase7BWP2CObjectHash $b.parent.identity) -and $parent.document.current.toolingCommit -ceq $b.parent.toolingCommit -and (Get-Phase7BWP2CObjectHash $parent.document.current.toolingMedia) -ceq (Get-Phase7BWP2CObjectHash $b.parent.toolingMedia) -and $parent.document.vm.configSha256 -ceq $b.parent.legacyVmConfigSha256) 'VM_BINDING_CONTINUATION_PARENT'
  $root=Get-Phase7BWP2CVmBindingContinuationRoot $parent.root $b.current.toolingCommit
  Assert-Phase7BWP2C ((Assert-Phase7BWP2CLocalPath $Path) -ceq (Join-Path $root 'vm-binding.json')) 'VM_BINDING_CONTINUATION_PATH'
  Assert-Phase7BWP2CPublishedRepository $RepositoryRoot $b.current.toolingCommit
  $source=Join-Path $RepositoryRoot 'scripts'
  Assert-Phase7BWP2CFile (Join-Path $source 'phase7bWorkPackage2CPreparationOperator.ps1') $b.current.operator
  Assert-Phase7BWP2CFile (Join-Path $source 'phase7bWorkPackage2CHost.psm1') $b.current.hostModule
  $hostDependencies=Get-Phase7BWP2CDependencyManifest $source @('phase7bWorkPackage2CPreparationOperator.ps1','phase7bRecordWorkPackage2CPreparation.ps1')
  Assert-Phase7BWP2C ((Get-Phase7BWP2CObjectHash $hostDependencies) -ceq (Get-Phase7BWP2CObjectHash $b.current.hostDependencies)) 'VM_BINDING_CONTINUATION_HOST_DEPENDENCIES'
  $manifest=Get-Phase7BWP2CDependencyManifest $source
  Assert-Phase7BWP2C ((Get-Phase7BWP2CObjectHash $manifest) -ceq (Get-Phase7BWP2CObjectHash $b.current.toolingManifest)) 'VM_BINDING_CONTINUATION_MANIFEST'
  Assert-Phase7BWP2C ($b.current.toolingMediaPath -ceq (Join-Path $root 'tooling-semantic-current.iso')) 'VM_BINDING_CONTINUATION_MEDIA_PATH'
  Assert-Phase7BWP2CFile $b.current.toolingMediaPath $b.current.toolingMedia
  $tool=Read-Phase7BWP2CBoundJson (Join-Path $root 'tooling-result.json') $b.current.toolingResult.sha256
  Assert-Phase7BWP2CFile (Join-Path $root 'tooling-result.json') $b.current.toolingResult
  Assert-Phase7BWP2C ((Get-Phase7BWP2CObjectHash $tool.identity) -ceq (Get-Phase7BWP2CObjectHash $b.current.toolingMedia) -and (Get-Phase7BWP2CObjectHash $tool.content.manifest) -ceq (Get-Phase7BWP2CObjectHash $manifest)) 'VM_BINDING_CONTINUATION_TOOLING'
  $content=$b.current.toolingMediaPath+'.content';Assert-Phase7BWP2CExactFileSet $content (@($manifest.files.name)+@('age.exe','age-keygen.exe','wp2c-tooling-manifest.json'))
  Assert-Phase7BWP2CFile (Join-Path $content 'wp2c-tooling-manifest.json') $b.current.toolingManifestIdentity
  foreach($f in $manifest.files){Assert-Phase7BWP2CFile (Join-Path $content $f.name) $f}
  Assert-Phase7BWP2CFile (Join-Path $content 'age.exe') $parent.settings.age
  Assert-Phase7BWP2CFile (Join-Path $content 'age-keygen.exe') $parent.settings.ageKeygen
  Assert-Phase7BWP2CFile $parent.settings.snapshotMetadataPath $b.vm.vmsd
  $vmx=Read-Phase7BWP2COpticalVmx $parent.settings.vmxPath;$semantic=Get-Phase7BWP2CVmxIdentity $vmx
  Assert-Phase7BWP2C ($semantic.mode -ceq $b.vm.semanticMode -and $semantic.sha256 -ceq $b.vm.semanticSha256 -and (Get-Phase7BWP2CExpectedGuestIdentity $vmx) -ceq $b.vm.guestIdentitySha256 -and $b.vm.guestIdentitySha256 -ceq $parent.settings.expectedGuestIdentitySha256) 'VM_BINDING_CONTINUATION_VM'
  $settings=ConvertTo-Phase7BCanonicalJson $parent.settings|ConvertFrom-Json;$settings.toolingCommit=$b.current.toolingCommit;$settings.operator=$b.current.operator
  $effective=[pscustomobject][ordered]@{original=$parent.document.original;current=$b.current;vm=[pscustomobject][ordered]@{originalVmx=$parent.document.vm.originalVmx;vmsd=$b.vm.vmsd;configSha256=$b.vm.semanticSha256;guestIdentitySha256=$b.vm.guestIdentitySha256;snapshotName=$b.vm.snapshotName};vmBindingContinuation=Get-Phase7BWP2CIdentity $Path}
  [pscustomobject]@{document=$effective;binding=$b;identity=Get-Phase7BWP2CIdentity $Path;root=$root;settings=$settings;tooling=$tool;parent=$parent}
}

function New-Phase7BWP2CVmBindingContinuation {
  param([string]$ParentPath,[string]$ParentSha256,[string]$StoppedVmxSha256,[string]$RepositoryRoot,[string]$ToolingCommit)
  Assert-Phase7BWP2CPublishedRepository $RepositoryRoot $ToolingCommit
  $parent=Read-Phase7BInternalPreparationContinuation $ParentPath $ParentSha256 $RepositoryRoot -HistoricalOnly
  $s=$parent.settings;$root=Get-Phase7BWP2CVmBindingContinuationRoot $parent.root $ToolingCommit;$path=Join-Path $root 'vm-binding.json'
  if(Test-Path -LiteralPath $root){
    $existing=Read-Phase7BWP2CVmBindingContinuation $path (Get-Phase7BWP2CIdentity $path).sha256 $RepositoryRoot
    Assert-Phase7BWP2C ($existing.binding.vm.stoppedVmx.sha256 -ceq $StoppedVmxSha256) 'VM_BINDING_CONTINUATION_STOPPED_VMX'
    return [pscustomobject]@{classification='PHASE7B_WP2C_PREPARATION_VM_BINDING_CONTINUATION_EXISTS';path=$path;identity=$existing.identity;created=$false;wp2cExecuted=$false}
  }
  $allowed=@('continuation.json','tooling-inputs.json','tooling-result.json','tooling-current.iso','tooling-current.iso.content')
  Assert-Phase7BWP2C (@(Get-ChildItem -LiteralPath $parent.root -Force|Where-Object {$_.Name -cnotin $allowed}).Count -eq 0) 'VM_BINDING_CONTINUATION_PARENT_PROGRESS'
  Assert-Phase7BWP2C ((Get-Phase7BWP2CIdentity $s.vmxPath).sha256 -ceq $StoppedVmxSha256) 'VM_BINDING_CONTINUATION_STOPPED_VMX'
  $cold=Get-Phase7BWP2CHostObservation $s.vmxPath $s.snapshotMetadataPath
  Assert-Phase7BWP2C ($cold.poweredOff -ceq $true -and $cold.memorySnapshotPresent -ceq $false -and $cold.vmContractPass -ceq $true -and $cold.nicStartConnected -ceq $false -and $cold.clipboardDisabled -ceq $true -and $cold.dragDropDisabled -ceq $true -and $cold.sharedFoldersDisabled -ceq $true -and $cold.hostIdentitySha256 -ceq $s.hostIdentitySha256) 'VM_BINDING_CONTINUATION_COLD'
  $vmx=Read-Phase7BWP2COpticalVmx $s.vmxPath;Assert-Phase7BWP2CPreparationBootMedia $vmx $parent.document.current.toolingMediaPath
  $semantic=Get-Phase7BWP2CVmxIdentity $vmx
  Assert-Phase7BWP2C ($semantic.mode -ceq 'wp2c-semantic-vmx-v2' -and (Get-Phase7BWP2CExpectedGuestIdentity $vmx) -ceq $s.expectedGuestIdentitySha256) 'VM_BINDING_CONTINUATION_VM'
  $source=Join-Path $RepositoryRoot 'scripts';$manifest=Get-Phase7BWP2CDependencyManifest $source;$hostDependencies=Get-Phase7BWP2CDependencyManifest $source @('phase7bWorkPackage2CPreparationOperator.ps1','phase7bRecordWorkPackage2CPreparation.ps1')
  New-Item -ItemType Directory -Path $root -ErrorAction Stop|Out-Null
  $inputs=[pscustomobject]@{agePath=$s.agePath;age=$s.age;ageKeygenPath=$s.ageKeygenPath;ageKeygen=$s.ageKeygen}
  $inputPath=Join-Path $root 'tooling-inputs.json';[void](Write-Phase7BWP2CCreateNewJson $inputPath $inputs)
  $mediaPath=Join-Path $root 'tooling-semantic-current.iso'
  $raw=& (Join-Path $PSScriptRoot 'phase7bBuildWorkPackage2CMedia.ps1') -Kind Tooling -InputsPath $inputPath -OutputPath $mediaPath -FounderMediaPreparationApproved
  $tool=($raw -join "`n")|ConvertFrom-Json
  Assert-Phase7BWP2C ((Get-Phase7BWP2CObjectHash $tool.content.manifest) -ceq (Get-Phase7BWP2CObjectHash $manifest)) 'VM_BINDING_CONTINUATION_BUILD_CHANGED'
  $resultId=Write-Phase7BWP2CCreateNewJson (Join-Path $root 'tooling-result.json') $tool
  Assert-Phase7BWP2C ((Get-Phase7BWP2CIdentity $s.vmxPath).sha256 -ceq $StoppedVmxSha256) 'VM_BINDING_CONTINUATION_STOPPED_VMX'
  $current=[pscustomobject][ordered]@{toolingCommit=$ToolingCommit;operator=Get-Phase7BWP2CIdentity (Join-Path $source 'phase7bWorkPackage2CPreparationOperator.ps1');hostModule=Get-Phase7BWP2CIdentity (Join-Path $source 'phase7bWorkPackage2CHost.psm1');hostDependencies=$hostDependencies;toolingManifest=$manifest;toolingManifestIdentity=$tool.content.manifestIdentity;toolingMediaPath=$mediaPath;toolingMedia=$tool.identity;toolingResult=$resultId}
  $b=[pscustomobject][ordered]@{schemaVersion=1;kind='wp2c-preparation-vm-binding-continuation';classification='PHASE7B_WP2C_PREPARATION_VM_BINDING_CONTINUATION_NONEXECUTABLE';parent=[pscustomobject][ordered]@{path=$ParentPath;identity=$parent.identity;toolingCommit=$parent.document.current.toolingCommit;toolingMedia=$parent.document.current.toolingMedia;legacyVmConfigSha256=$parent.document.vm.configSha256};current=$current;vm=[pscustomobject][ordered]@{semanticMode=$semantic.mode;semanticSha256=$semantic.sha256;stoppedVmx=Get-Phase7BWP2CIdentity $s.vmxPath;vmsd=Get-Phase7BWP2CIdentity $s.snapshotMetadataPath;guestIdentitySha256=$s.expectedGuestIdentitySha256;snapshotName='S1-physiqueos-bootstrap-inert'};createdAt=[datetime]::UtcNow.ToString('o');nonExecutable=$true;preparationOnly=$true;automaticRetryAllowed=$false;wp2cExecutionAuthorized=$false;laterMigrationAuthorized=$false}
  $id=Write-Phase7BWP2CCreateNewJson $path $b;[void](Read-Phase7BWP2CVmBindingContinuation $path $id.sha256 $RepositoryRoot)
  [pscustomobject]@{classification=$b.classification;path=$path;identity=$id;created=$true;wp2cExecuted=$false}
}

function Add-Phase7BWP2CPreparationLineage {
  param($Preparation,$Plan,$Continuation,[string]$Path)
  $c=$Continuation.document;$b=$Plan.bindings
  $hasVmBinding='binding' -in @($Continuation.PSObject.Properties.Name)
  Assert-Phase7BWP2C ($b.toolingCommit -ceq $c.current.toolingCommit -and $b.preparedStateId -ceq $c.original.sessionId -and $b.snapshotSha256 -ceq $c.vm.vmsd.sha256 -and $b.vmConfigSha256 -ceq $c.vm.configSha256 -and $b.finalDescriptor.sha256 -ceq $c.original.descriptor.sha256 -and $b.toolingManifestSha256 -ceq $c.current.toolingManifestIdentity.sha256 -and (Get-Phase7BWP2CObjectHash $b.toolingMedia) -ceq (Get-Phase7BWP2CObjectHash $c.current.toolingMedia)) 'CONTINUATION_PLAN_BINDING'
  $lineage=[pscustomobject][ordered]@{schemaVersion=if($hasVmBinding){2}else{1};kind='wp2c-preparation-continuation-provenance';continuationPath=$Path;continuation=$Continuation.identity;originalSessionId=$c.original.sessionId;originalSession=$c.original.sessionMetadata;originalInitializationCommit=$c.original.initializationCommit;originalOperator=$c.original.operator;originalToolingMedia=$c.original.toolingMedia;originalToolingManifest=$c.original.toolingManifest;currentToolingCommit=$c.current.toolingCommit;currentOperator=$c.current.operator;currentHostModule=$c.current.hostModule;currentToolingMedia=$c.current.toolingMedia;currentToolingManifest=$c.current.toolingManifestIdentity;nonExecutable=$true}
  if($hasVmBinding){
    $lineage|Add-Member NoteProperty parentContinuationPath $Continuation.binding.parent.path
    $lineage|Add-Member NoteProperty parentContinuation $Continuation.binding.parent.identity
    $lineage|Add-Member NoteProperty legacyVmConfigSha256 $Continuation.binding.parent.legacyVmConfigSha256
    $lineage|Add-Member NoteProperty semanticVmBinding ([pscustomobject][ordered]@{mode=$Continuation.binding.vm.semanticMode;sha256=$Continuation.binding.vm.semanticSha256;stoppedVmx=$Continuation.binding.vm.stoppedVmx})
  }
  $Preparation|Add-Member NoteProperty preparationLineage $lineage
}

Export-ModuleMember -Function *-Phase7BWP2C*
