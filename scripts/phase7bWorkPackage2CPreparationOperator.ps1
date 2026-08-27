[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][ValidateSet('Initialize','BuildTooling','CreateContinuation','CreateVmBindingContinuation','CreateBaselineHandoffContinuation','Ram','PreBootBaseline','ImportBaseline','BuildPreparation','PreBoot','EntryReview','ImportReturn','Record')][string]$Mode,
  [string]$SessionRoot,[string]$ToolingCommit,[string]$VmxPath,[string]$SnapshotMetadataPath,
  [string]$DescriptorPath,[string]$DescriptorSha256,[string]$AgePath,[string]$AgeKeygenPath,
  [string]$OriginalSessionSha256,[string]$OriginalInventorySha256,[string]$OriginalVmxSha256,
  [string]$ContinuationPath,[string]$ContinuationSha256,
  [string]$VmBindingPath,[string]$VmBindingSha256,[string]$StoppedVmxSha256,
  [string]$BaselineHandoffPath,[string]$BaselineHandoffSha256,
  [switch]$FounderPreparationApproved
)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bIsolatedGuestContract.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2Contract.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CContract.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CGuest.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CHost.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CMedia.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CPreparationContinuation.psm1')

function Read-OperatorJson([string]$Name) {
  $path=Join-Path $SessionRoot $Name
  Read-Phase7BWP2CBoundJson $path (Get-Phase7BWP2CIdentity $path).sha256
}
function Save-OperatorJson([string]$Name,$Value) {
  Write-Phase7BWP2CCreateNewJson (Join-Path $SessionRoot $Name) $Value
}
function Read-ReturnToken {
  Write-Host 'Paste ONLY the NONSECRET WP2CP1 return block captured from the guest. Then type END on a separate line. Never paste a real identity.'
  $builder=New-Object Text.StringBuilder
  while($true){$line=Read-Host;if($line -ceq 'END'){break};Assert-Phase7BWP2C ($builder.Length+$line.Length -le 20000) 'PREPARATION_RETURN_TOO_LARGE';[void]$builder.AppendLine($line)}
  $document=ConvertFrom-Phase7BWP2CPreparationReturnText $builder.ToString()
  $document
}
function Assert-ColdHardware {
  $vmx=Read-Phase7BVmx $VmxPath;$snapshots=Read-Phase7BVmx $SnapshotMetadataPath
  Assert-Phase7BWP2C (Test-Phase7BVmxContract $vmx).pass 'VM_HARDWARE'
  Assert-Phase7BWP2C (Test-Phase7BVmdkContract $vmx $VmxPath).pass 'VM_STORAGE_CONTRACT'
  Assert-Phase7BWP2C (@(Get-CimInstance Win32_Process -Filter "Name='vmware-vmx.exe'" -ErrorAction Stop).Count -eq 0 -and @(Get-ChildItem -LiteralPath (Split-Path -Parent $VmxPath) -Filter '*.vmss' -File).Count -eq 0) 'VM_NOT_COLD'
  $names=@(foreach($key in $snapshots.Keys){if($key -match '^snapshot\d+\.uid$' -and $snapshots[$key] -ceq $snapshots['snapshot.current']){$snapshots[$key.Replace('.uid','.displayname')]}})
  Assert-Phase7BWP2C ($names.Count -eq 1 -and $names[0] -ceq 'S1-physiqueos-bootstrap-inert' -and @($snapshots.Values|Where-Object {$_ -ceq 'S0-clean-windows-pre-bootstrap'}).Count -eq 1) 'S1_LINEAGE_REQUIRED'
}
function Show-GuestCommands($Settings,$Tooling,$Preparation) {
  Write-Host 'Guest: NEW elevated Windows PowerShell 5.1 Desktop ConsoleHost, powershell.exe -NoProfile. These are guest commands, NOT host commands.'
  Write-Host 'Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force'
  Write-Host '$t=@(Get-CimInstance Win32_LogicalDisk -Filter "DriveType=5"|Where-Object {$_.VolumeName -ceq ''P7B_C_TOOLS''}); if($t.Count -ne 1){throw ''TOOLS_CD''}; $t=$t[0].DeviceID+''\'''
  if($null -eq $Preparation){
    if($Tooling.PSObject.Properties.Name -contains 'baselineBindingIdentity'){
      Write-Output '& ($t+''phase7bRunWorkPackage2CGuestBaseline.ps1'') -FounderPreparationApproved'
    }else{
      Write-Output ('& ($t+''phase7bInspectWorkPackage2CGuestPreparation.ps1'') -Operation Baseline -ExpectedGuestIdentitySha256 '''+$Settings.expectedGuestIdentitySha256+''' -ExpectedToolingManifestSha256 '''+$Tooling.manifestIdentity.sha256+''' -FounderPreparationApproved')
    }
  }else{
    Write-Host '$p=@(Get-CimInstance Win32_LogicalDisk -Filter "DriveType=5"|Where-Object {$_.VolumeName -ceq ''P7B_C_PREP''}); if($p.Count -ne 1){throw ''PREP_CD''}; $p=$p[0].DeviceID+''\'''
    Write-Output ('$pin='''+$Preparation.descriptorIdentity.sha256+'''')
    Write-Host '& ($t+''phase7bInspectWorkPackage2CGuestPreparation.ps1'') -Operation Install -PreparationOpticalRoot $p -PreparationDescriptorSha256 $pin -FounderPreparationApproved'
    Write-Host 'After INSTALL PASS, close that guest shell. Open NEW elevated powershell.exe -NoProfile; use the following self-contained command.'
    Write-Host '$p=@(Get-CimInstance Win32_LogicalDisk -Filter "DriveType=5"|Where-Object {$_.VolumeName -ceq ''P7B_C_PREP''}); if($p.Count -ne 1){throw ''PREP_CD''}; $p=$p[0].DeviceID+''\'''
    Write-Output ('& ''C:\Phase7B\isolated\379bb303\tooling\'+$Tooling.manifestIdentity.sha256+'\phase7bInspectWorkPackage2CGuestPreparation.ps1'' -Operation Session -PreparationOpticalRoot $p -PreparationDescriptorSha256 '''+$Preparation.descriptorIdentity.sha256+''' -FounderPreparationApproved')
  }
}

try {
  Assert-Phase7BWP2C ($PSVersionTable.PSEdition -ceq 'Desktop' -and $PSVersionTable.PSVersion.Major -eq 5 -and $PSVersionTable.PSVersion.Minor -eq 1 -and [Environment]::Is64BitProcess) 'PS51_REQUIRED'
  if($Mode -ceq 'Ram'){Get-Phase7BWP2CPreparationRam|ConvertTo-Json;return}
  Assert-Phase7BWP2C $FounderPreparationApproved.IsPresent 'FOUNDER_PREPARATION_REQUIRED'
  $principal=New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  Assert-Phase7BWP2C ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) 'ADMIN_REQUIRED'
  $fixed=Get-Phase7BIsolatedGuestContract
  [void](Assert-Phase7BWP2CLocalPath $SessionRoot 'C:\Phase7B\host-evidence\379bb303\wp2c')
  $repo=Split-Path -Parent $PSScriptRoot
  $continuation=$null
  Assert-Phase7BWP2C (([bool]$ContinuationPath -eq [bool]$ContinuationSha256) -and
    ([bool]$VmBindingPath -eq [bool]$VmBindingSha256) -and
    ([bool]$BaselineHandoffPath -eq [bool]$BaselineHandoffSha256) -and
    @(@($ContinuationPath,$VmBindingPath,$BaselineHandoffPath)|Where-Object {$_}).Count -le 1) 'CONTINUATION_EXPLICIT_SELECTION'
  Assert-Phase7BWP2C (-not $ContinuationPath -or $Mode -notin @('Initialize','BuildTooling','CreateContinuation')) 'CONTINUATION_EXPLICIT_SELECTION'
  Assert-Phase7BWP2C (-not $VmBindingPath -or $Mode -notin @('Initialize','BuildTooling','CreateContinuation')) 'CONTINUATION_EXPLICIT_SELECTION'
  Assert-Phase7BWP2C (-not $BaselineHandoffPath -or $Mode -notin @('Initialize','BuildTooling','CreateContinuation','CreateVmBindingContinuation','CreateBaselineHandoffContinuation')) 'CONTINUATION_EXPLICIT_SELECTION'
  Assert-Phase7BWP2C (-not $StoppedVmxSha256 -or $Mode -in @('CreateVmBindingContinuation','CreateBaselineHandoffContinuation')) 'VM_BINDING_CONTINUATION_INPUT'
  if($Mode -ceq 'CreateContinuation'){
    $made=New-Phase7BWP2CPreparationContinuation $SessionRoot $OriginalSessionSha256 $OriginalInventorySha256 $OriginalVmxSha256 $repo $ToolingCommit
    $selected=Read-Phase7BWP2CPreparationContinuation $made.path $made.identity.sha256 $repo
    Show-GuestCommands $selected.settings $selected.tooling.content $null
    $made|ConvertTo-Json -Depth 5
    return
  }
  if($Mode -ceq 'CreateVmBindingContinuation'){
    Assert-Phase7BWP2C ($ContinuationPath -and $SessionRoot -ceq (Split-Path -Parent $ContinuationPath) -and $StoppedVmxSha256 -cmatch '^[0-9a-f]{64}$') 'VM_BINDING_CONTINUATION_INPUT'
    $made=New-Phase7BWP2CVmBindingContinuation $ContinuationPath $ContinuationSha256 $StoppedVmxSha256 $repo $ToolingCommit
    $selected=Read-Phase7BWP2CVmBindingContinuation $made.path $made.identity.sha256 $repo
    Show-GuestCommands $selected.settings $selected.tooling.content $null
    $made|ConvertTo-Json -Depth 5
    return
  }
  if($Mode -ceq 'CreateBaselineHandoffContinuation'){
    Assert-Phase7BWP2C ($VmBindingPath -and $SessionRoot -ceq (Split-Path -Parent $VmBindingPath) -and $StoppedVmxSha256 -cmatch '^[0-9a-f]{64}$') 'BASELINE_HANDOFF_INPUT'
    $made=New-Phase7BWP2CBaselineHandoffContinuation $VmBindingPath $VmBindingSha256 $StoppedVmxSha256 $repo $ToolingCommit
    $selected=Read-Phase7BWP2CBaselineHandoffContinuation $made.path $made.identity.sha256 $repo
    Show-GuestCommands $selected.settings $selected.tooling.content $null
    $made|ConvertTo-Json -Depth 5
    return
  }
  if($Mode -ceq 'Initialize'){
    Assert-Phase7BWP2CPublishedRepository $repo $ToolingCommit
    [void](Assert-Phase7BWP2CLocalPath $VmxPath);[void](Assert-Phase7BWP2CLocalPath $SnapshotMetadataPath (Split-Path -Parent $VmxPath))
    Assert-ColdHardware
    $descriptor=Read-Phase7BWP2CBoundJson $DescriptorPath $DescriptorSha256
    Assert-Phase7BWP2C ($descriptor.classification -ceq 'PHASE7B_WP2_ENCRYPTED_PACKET_AND_REPLICA_PASS' -and $descriptor.applicationCommit -ceq $fixed.applicationCommit -and $descriptor.decryptRoundTripPass -ceq $true) 'PREPARATION_DESCRIPTOR'
    foreach($path in @($AgePath,$AgeKeygenPath)){
      [void](Assert-Phase7BWP2CLocalPath $path);$lines=@(& $path --version 2>&1)
      Assert-Phase7BWP2C (Test-Phase7BWorkPackage2AgeVersionOutput @($lines|ForEach-Object {[string]$_}) $LASTEXITCODE).pass 'AGE_VERSION'
    }
    $age=Get-Phase7BWP2CIdentity $AgePath;$keygen=Get-Phase7BWP2CIdentity $AgeKeygenPath
    Assert-Phase7BWP2C ($age.sha256 -ceq $descriptor.ageExeSha256 -and $keygen.sha256 -ceq $descriptor.ageKeygenSha256) 'PREPARATION_PINNED_AGE'
    $hostUuid=(Get-CimInstance Win32_ComputerSystemProduct -ErrorAction Stop).UUID
    $settings=[pscustomobject][ordered]@{schemaVersion=1;kind='wp2c-preparation-operator-session';toolingCommit=$ToolingCommit;preparedStateId='wp2c-prepared-'+[guid]::NewGuid().ToString('N');hostIdentitySha256=Get-Phase7BWP2CObjectHash ([string]$hostUuid).ToLowerInvariant();expectedGuestIdentitySha256=Get-Phase7BWP2CExpectedGuestIdentity (Read-Phase7BVmx $VmxPath);vmxPath=$VmxPath;snapshotMetadataPath=$SnapshotMetadataPath;snapshotSha256=Get-Phase7BSha256 -LiteralPath $SnapshotMetadataPath;descriptorPath=$DescriptorPath;descriptorSha256=$DescriptorSha256;agePath=$AgePath;age=$age;ageKeygenPath=$AgeKeygenPath;ageKeygen=$keygen;operator=Get-Phase7BWP2CIdentity $PSCommandPath}
    Assert-Phase7BWP2C (-not (Test-Path -LiteralPath $SessionRoot)) 'PREPARATION_OUTPUT_COLLISION'
    New-Item -ItemType Directory -Path $SessionRoot -ErrorAction Stop|Out-Null
    $id=Save-OperatorJson 'session.json' $settings
    [IO.File]::Copy((Join-Path $repo 'docs\PHASE7B_WP2C_PREPARATION_OPERATOR.md'),(Join-Path $SessionRoot 'OPERATOR.md'),$false)
    [ordered]@{classification='PHASE7B_WP2C_PREPARATION_OPERATOR_INITIALIZED';session=$id;preparedStateId=$settings.preparedStateId;vmBooted=$false;wp2cExecuted=$false}|ConvertTo-Json -Depth 4
    return
  }
  $toolsPath=Join-Path $SessionRoot 'tooling.iso'
  if($BaselineHandoffPath){
    $continuation=Read-Phase7BWP2CBaselineHandoffContinuation $BaselineHandoffPath $BaselineHandoffSha256 $repo
    Assert-Phase7BWP2C ($SessionRoot -ceq $continuation.root) 'CONTINUATION_SESSION_ROOT'
    $settings=$continuation.settings;$toolsPath=$continuation.document.current.toolingMediaPath
  }elseif($VmBindingPath){
    $continuation=Read-Phase7BWP2CVmBindingContinuation $VmBindingPath $VmBindingSha256 $repo
    Assert-Phase7BWP2C ($SessionRoot -ceq $continuation.root) 'CONTINUATION_SESSION_ROOT'
    $settings=$continuation.settings;$toolsPath=$continuation.document.current.toolingMediaPath
  }elseif($ContinuationPath){
    $continuation=Read-Phase7BWP2CPreparationContinuation $ContinuationPath $ContinuationSha256 $repo
    Assert-Phase7BWP2C ($SessionRoot -ceq $continuation.root) 'CONTINUATION_SESSION_ROOT'
    $settings=$continuation.settings;$toolsPath=$continuation.document.current.toolingMediaPath
  }else{
    Assert-Phase7BWP2C ($SessionRoot -notmatch '(?i)[\\/]continuations[\\/]') 'CONTINUATION_SELECTION_REQUIRED'
    $settings=Read-OperatorJson 'session.json'
  }
  Assert-Phase7BWP2C ($settings.kind -ceq 'wp2c-preparation-operator-session' -and $settings.schemaVersion -eq 1) 'PREPARATION_OPERATOR_SESSION'
  Assert-Phase7BWP2CPublishedRepository $repo $settings.toolingCommit
  Assert-Phase7BWP2CFile $PSCommandPath $settings.operator
  $hostUuid=(Get-CimInstance Win32_ComputerSystemProduct -ErrorAction Stop).UUID
  Assert-Phase7BWP2C ((Get-Phase7BWP2CObjectHash ([string]$hostUuid).ToLowerInvariant()) -ceq $settings.hostIdentitySha256) 'WRONG_HOST'
  $VmxPath=$settings.vmxPath;$SnapshotMetadataPath=$settings.snapshotMetadataPath
  Assert-Phase7BWP2C ((Get-Phase7BSha256 -LiteralPath $SnapshotMetadataPath) -ceq $settings.snapshotSha256) 'SNAPSHOT_CHANGED'
  switch($Mode){
    'BuildTooling' {
      Assert-ColdHardware
      Assert-Phase7BWP2CFile $settings.agePath $settings.age;Assert-Phase7BWP2CFile $settings.ageKeygenPath $settings.ageKeygen
      $inputs=[pscustomobject]@{agePath=$settings.agePath;age=$settings.age;ageKeygenPath=$settings.ageKeygenPath;ageKeygen=$settings.ageKeygen}
      [void](Save-OperatorJson 'tooling-inputs.json' $inputs)
      $raw=& (Join-Path $PSScriptRoot 'phase7bBuildWorkPackage2CMedia.ps1') -Kind Tooling -InputsPath (Join-Path $SessionRoot 'tooling-inputs.json') -OutputPath (Join-Path $SessionRoot 'tooling.iso') -FounderMediaPreparationApproved
      $made=($raw -join "`n")|ConvertFrom-Json
      [void](Save-OperatorJson 'tooling-result.json' $made)
      Show-GuestCommands $settings $made.content $null
      $made|ConvertTo-Json -Depth 12
    }
    'ImportBaseline' {
      Assert-ColdHardware
      $baseline=Read-ReturnToken
      Assert-Phase7BWP2CPreparationBaseline $baseline
      Assert-Phase7BWP2C ($baseline.guestIdentitySha256 -ceq $settings.expectedGuestIdentitySha256) 'WRONG_GUEST'
      $id=Save-OperatorJson 'baseline.json' $baseline
      [ordered]@{classification='PHASE7B_WP2C_PREPARATION_BASELINE_IMPORTED';identity=$id;wp2cExecuted=$false}|ConvertTo-Json -Depth 4
    }
    'BuildPreparation' {
      Assert-ColdHardware
      $tool=Read-OperatorJson 'tooling-result.json'
      $baselinePath=Join-Path $SessionRoot 'baseline.json';$planPath=Join-Path $SessionRoot 'preparation-plan.json'
      $raw=& (Join-Path $PSScriptRoot 'phase7bNewWorkPackage2CPreparationPlan.ps1') -BaselinePath $baselinePath -BaselineSha256 (Get-Phase7BWP2CIdentity $baselinePath).sha256 -DescriptorPath $settings.descriptorPath -DescriptorSha256 $settings.descriptorSha256 -ToolingMediaPath $toolsPath -ToolingMediaSha256 $tool.identity.sha256 -AgePath $settings.agePath -AgeKeygenPath $settings.ageKeygenPath -ToolingCommit $settings.toolingCommit -PreparedStateId $settings.preparedStateId -VmxPath $VmxPath -SnapshotMetadataPath $SnapshotMetadataPath -OutputPath $planPath -FounderPreparationApproved
      $planResult=($raw -join "`n")|ConvertFrom-Json
      [void](Save-OperatorJson 'preparation-inputs.json' ([pscustomobject]@{planPath=$planPath;planSha256=$planResult.identity.sha256}))
      $raw=& (Join-Path $PSScriptRoot 'phase7bBuildWorkPackage2CMedia.ps1') -Kind Preparation -InputsPath (Join-Path $SessionRoot 'preparation-inputs.json') -OutputPath (Join-Path $SessionRoot 'preparation.iso') -FounderMediaPreparationApproved
      $made=($raw -join "`n")|ConvertFrom-Json
      [void](Save-OperatorJson 'preparation-result.json' $made)
      Show-GuestCommands $settings $tool.content $made.content
      $made|ConvertTo-Json -Depth 12
    }
    {$_ -in @('PreBootBaseline','PreBoot')} {
      $ram=Get-Phase7BWP2CPreparationRam;$ram|ConvertTo-Json
      Assert-Phase7BWP2C $ram.pass 'PREBOOT_RAM_STOP'
      $cold=Get-Phase7BWP2CHostObservation $VmxPath $SnapshotMetadataPath
      Assert-Phase7BWP2C (Test-Phase7BWP2CHostObservation $cold $cold).pass 'PREPARATION_HOST_ISOLATION'
      $vmx=Read-Phase7BWP2COpticalVmx $VmxPath
      $tool=Read-OperatorJson 'tooling-result.json'
      Assert-Phase7BWP2CFile $toolsPath $tool.identity
      $prepPath=$null
      if($Mode -ceq 'PreBoot'){
        $prep=Read-OperatorJson 'preparation-result.json';$prepPath=Join-Path $SessionRoot 'preparation.iso'
        Assert-Phase7BWP2CFile $prepPath $prep.identity
        $carrier=Read-Phase7BWP2CPreparationContent ($prepPath+'.content') $prep.content.descriptorIdentity.sha256
        Assert-Phase7BWP2C (Test-Phase7BWP2CHostObservation $cold $carrier.plan.bindings).pass 'PREPARATION_HOST_ISOLATION'
      }
      Assert-Phase7BWP2CPreparationBootMedia $vmx $toolsPath $prepPath
      [ordered]@{classification='PHASE7B_WP2C_PREPARATION_PREBOOT_PASS';vmBooted=$false;wp2cExecuted=$false;mode=$Mode;checkedAt=[datetime]::UtcNow.ToString('o')}|ConvertTo-Json
    }
    'EntryReview' {
      if(-not ('Phase7BWP2COperatorClipboard' -as [type])){Add-Type 'using System.Runtime.InteropServices; public static class Phase7BWP2COperatorClipboard { [DllImport("user32.dll")] public static extern uint GetClipboardSequenceNumber(); }'}
      $before=[Phase7BWP2COperatorClipboard]::GetClipboardSequenceNumber()
      [void](Read-Host 'Now perform ONLY the three guest synthetic groups. Return here and press Enter BEFORE any screenshot/text copying')
      $after=[Phase7BWP2COperatorClipboard]::GetClipboardSequenceNumber()
      Assert-Phase7BWP2C ($before -eq $after) 'PREPARATION_CLIPBOARD_CHANGED'
      $r=[ordered]@{schemaVersion=1;kind='wp2c-preparation-founder-review';preparedStateId=$settings.preparedStateId;onePasswordVersion=Read-Host 'Observed host 1Password version (not a vault value)';vmwareVersion=Read-Host 'Observed VMware version';clipboardSequenceBefore=[long]$before;clipboardSequenceAfter=[long]$after;founderReviewed=$true;realIdentityUsed=$false;invalidSyntheticValueOnly=$true;unexpectedDestinationInput=$false;reviewedAt=[datetime]::UtcNow.ToString('o')}
      Assert-Phase7BWP2C ((Read-Host 'Confirm ONLY invalid synthetic input, no real identity, and NO unexpected input. Type YES') -ceq 'YES') 'PREPARATION_SYNTHETIC_STOP'
      foreach($name in @('wrongFieldTestPass','guestFocusLossTestPass','hostFocusChangeTestPass','minimizationTestPass','cancellationTestPass','interruptionTestPass','canaryTestPass','noToolingSecretFileWrites','noTotp','automaticSubmissionDisabled')){
        Assert-Phase7BWP2C ((Read-Host ('Confirm performed and passed '+$name+' (YES or STOP)')) -ceq 'YES') 'PREPARATION_SYNTHETIC_STOP';$r[$name]=$true
      }
      $id=Save-OperatorJson 'founder-review.json' ([pscustomobject]$r)
      [ordered]@{classification='PHASE7B_WP2C_PREPARATION_FOUNDER_REVIEW_RECORDED';identity=$id;wp2cExecuted=$false}|ConvertTo-Json -Depth 4
    }
    'ImportReturn' {
      Assert-ColdHardware
      $returned=Read-ReturnToken
      Assert-Phase7BWP2CPreparationReturnShape $returned
      $prep=Read-OperatorJson 'preparation-result.json'
      $carrier=Read-Phase7BWP2CPreparationContent ((Join-Path $SessionRoot 'preparation.iso')+'.content') $prep.content.descriptorIdentity.sha256
      $review=Read-OperatorJson 'founder-review.json';$cold=Get-Phase7BWP2CHostObservation $VmxPath $SnapshotMetadataPath
      [void](New-Phase7BWP2CPreparationHandoffEvidence $carrier.plan $returned $review $cold $prep.identity $carrier.descriptorIdentity)
      $text=ConvertTo-Phase7BWP2CPreparationReturnText $returned
      $path=Join-Path $SessionRoot 'return.txt';$bytes=[Text.Encoding]::ASCII.GetBytes($text)
      $stream=New-Object IO.FileStream($path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
      try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
      [ordered]@{classification='PHASE7B_WP2C_PREPARATION_RETURN_CHECKED';identity=Get-Phase7BWP2CIdentity $path;wp2cExecuted=$false}|ConvertTo-Json -Depth 4
    }
    'Record' {
      $prep=Read-OperatorJson 'preparation-result.json';$reviewPath=Join-Path $SessionRoot 'founder-review.json'
      $lineageArgs=@{}
      if($BaselineHandoffPath){$lineageArgs=@{BaselineHandoffPath=$BaselineHandoffPath;BaselineHandoffSha256=$BaselineHandoffSha256}}
      elseif($VmBindingPath){$lineageArgs=@{VmBindingPath=$VmBindingPath;VmBindingSha256=$VmBindingSha256}}
      elseif($continuation){$lineageArgs=@{ContinuationPath=$ContinuationPath;ContinuationSha256=$ContinuationSha256}}
      & (Join-Path $PSScriptRoot 'phase7bRecordWorkPackage2CPreparation.ps1') -PreparationContentRoot ((Join-Path $SessionRoot 'preparation.iso')+'.content') -PreparationDescriptorSha256 $prep.content.descriptorIdentity.sha256 -PreparationMediaPath (Join-Path $SessionRoot 'preparation.iso') -PreparationMediaSha256 $prep.identity.sha256 -ToolingMediaPath $toolsPath -ReturnTextPath (Join-Path $SessionRoot 'return.txt') -FounderReviewPath $reviewPath -FounderReviewSha256 (Get-Phase7BWP2CIdentity $reviewPath).sha256 -VmxPath $VmxPath -SnapshotMetadataPath $SnapshotMetadataPath -OutputDirectory (Join-Path $SessionRoot 'accepted') -FounderPreparationReviewed @lineageArgs
    }
  }
} catch {
  [ordered]@{classification='PHASE7B_WP2C_PREPARATION_OPERATOR_STOP';pass=$false;mode=$Mode;safeExceptionType=$_.Exception.GetType().Name;safeCode=if($_.Exception.Message -cmatch '^PHASE7B_[A-Z0-9_]+$'){$_.Exception.Message}else{'PREPARATION_OPERATOR_EXCEPTION'};automaticRetryAllowed=$false;wp2cExecuted=$false}|ConvertTo-Json
  throw 'PHASE7B_WP2C_PREPARATION_OPERATOR_STOP'
}
