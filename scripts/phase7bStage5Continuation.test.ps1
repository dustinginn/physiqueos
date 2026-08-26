$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'phase7bWorkPackage2Finalization.test.ps1') -FixturesOnly
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2Stage5Continuation.psm1') -Force
$script:assertions=0
function New-ContinuationCase([string]$Name){
  $s=New-Case $Name
  $packetPath=Join-Path $s.root ($s.inputs.AttemptId+'.zip.age')
  $bytes=New-Object byte[] 4097;[Text.Encoding]::ASCII.GetBytes("age-encryption.org/v1`n").CopyTo($bytes,0)
  [IO.File]::WriteAllBytes($packetPath,$bytes)
  $s.pending.packetSha256=Get-Phase7BSha256 -LiteralPath $packetPath;$s.inputs.ExpectedPacketSha256=$s.pending.packetSha256;Save-Pending $s
  $s.receipt.packetSha256=$s.pending.packetSha256;Write-Json $s.receiptPath $s.receipt
  $build=@{CaptureInputs=$s.inputs;PacketPath=$packetPath;ReceiptTransportPath=$s.receiptPath;
    ExpectedReceiptSha256=(Get-Phase7BSha256 -LiteralPath $s.receiptPath);ExpectedReceiptNonce=$s.receipt.evidenceNonce;FinalizationToolingCommit=('9'*40)}
  $binding=New-Phase7BStage5ContinuationBindingDocument @build
  $bindingPath=Join-Path $s.root 'continuation.json';Write-Json $bindingPath $binding
  $s|Add-Member -NotePropertyName build -NotePropertyValue $build
  $s|Add-Member -NotePropertyName bindingPath -NotePropertyValue $bindingPath
  $s|Add-Member -NotePropertyName binding -NotePropertyValue (Get-Content $bindingPath -Raw|ConvertFrom-Json)
  $s
}
function Invoke-ContinuationFinalizer($s){
  $parameters=$s.inputs.Clone()
  $parameters.ReplicaReceiptPath=$s.receiptPath;$parameters.ExpectedReplicaReceiptSha256=Get-Phase7BSha256 -LiteralPath $s.receiptPath
  $parameters.PrimaryTeardownEvidencePath=$s.teardownPath;$parameters.ExpectedPrimaryTeardownEvidenceSha256=Get-Phase7BSha256 -LiteralPath $s.teardownPath
  $parameters.AuthorizationAcknowledgement='WP2B_CAPTURE_FINALIZE_INDEPENDENT_REPLICA_EXACTLY_ONCE';$parameters.OutputPath=$s.finalPath
  $parameters.ContinuationBindingPath=$s.bindingPath;$parameters.ExpectedContinuationBindingSha256=Get-Phase7BSha256 -LiteralPath $s.bindingPath
  $parameters.FinalizationToolingCommit=$s.build.FinalizationToolingCommit;$parameters.LocalPacketPath=$s.build.PacketPath
  $parameters.FounderContinuationAcknowledgement='WP2B_STAGE5_FINALIZE_ACCEPTED_CAPTURE_LINEAGE_EXACTLY_ONCE'
  (@(& $finalizer @parameters)-join [Environment]::NewLine)|ConvertFrom-Json -ErrorAction Stop
}
try{
  [void](New-Item -ItemType Directory -Path $testRoot)
  foreach($name in @('cross-commit','same-commit')){
    $s=New-ContinuationCase $name
    if($name -ceq 'same-commit'){$s.build.FinalizationToolingCommit=$s.inputs.ExpectedToolingCommit;$build=$s.build;Write-Json $s.bindingPath (New-Phase7BStage5ContinuationBindingDocument @build)}
    $build=$s.build;$hash=Get-Phase7BSha256 -LiteralPath $s.bindingPath
    $validated=Assert-Phase7BStage5ContinuationBinding -LiteralPath $s.bindingPath -ExpectedSha256 $hash @build
    Assert-True (-not $validated.executionAuthorized -and $validated.founderExecutionAuthorizationRequired) "$name binding is not execution authority"
    Assert-True ((Get-Phase7BSha256 -Text (ConvertTo-Phase7BCanonicalJson (New-Phase7BStage5ContinuationBindingDocument @build))) -ceq $hash) 'deterministic regeneration'
    $immutable=@($s.inputs.PendingDescriptorPath,$s.inputs.CaptureAuthorizationPath,$s.inputs.InvocationContractPath,$s.receiptPath,$s.build.PacketPath)|ForEach-Object{Get-Phase7BSha256 -LiteralPath $_}
    $result=Invoke-ContinuationFinalizer $s
    Assert-True ($result.pass -and $result.captureAuthorizationConsumed) "$name synthetic finalization consumes original authorization"
    $final=Get-Content $s.finalPath -Raw|ConvertFrom-Json
    Assert-True ((Test-Phase7BWorkPackage2FinalizationProvenance -Descriptor $final).pass) 'portable WP2C provenance validator accepts descriptor'
    $guestPath=Join-Path $PSScriptRoot 'phase7bIsolatedGuestRestoreInterface.ps1';$tokens=$null;$errors=$null
    $guestAst=[Management.Automation.Language.Parser]::ParseFile($guestPath,[ref]$tokens,[ref]$errors)
    $readers=@($guestAst.FindAll({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -ceq 'Read-BoundDescriptor'},$true))
    $readBack=& {
      $DescriptorPath=$s.finalPath;$ExpectedDescriptorSha256=Get-Phase7BSha256 -LiteralPath $DescriptorPath
      $AttemptId=$s.inputs.AttemptId;$PacketPath=$s.build.PacketPath;$ExpectedSha256=$s.pending.packetSha256;$contract=Get-Phase7BWorkPackage2Contract
      . ([scriptblock]::Create($readers[0].Extent.Text))
      Read-BoundDescriptor
    }
    Assert-True ($readBack.stage5Provenance.bindingSha256 -ceq $hash) 'actual WP2C descriptor reader accepts portable continuation without VM execution'
    Assert-True ($final.stage5Provenance.binding.capture.toolingCommit -ceq $s.inputs.ExpectedToolingCommit -and
      $final.stage5Provenance.binding.finalization.toolingCommit -ceq $s.build.FinalizationToolingCommit -and
      $final.captureAuthorizationId -ceq $s.auth.authorizationId -and (Test-Path -LiteralPath $s.markerPath)) 'truthful two-layer provenance and one original marker'
    $after=@($s.inputs.PendingDescriptorPath,$s.inputs.CaptureAuthorizationPath,$s.inputs.InvocationContractPath,$s.receiptPath,$s.build.PacketPath)|ForEach-Object{Get-Phase7BSha256 -LiteralPath $_}
    Assert-True (@(Compare-Object @($immutable) @($after)).Count -eq 0) 'original inputs immutable'
    foreach($damage in @('hash','commit','receipt','partial','schema','time','artifact')){
      $bad=$final|ConvertTo-Json -Depth 30|ConvertFrom-Json
      switch($damage){
        'hash' {$bad.stage5Provenance.bindingSha256='0'*64}
        'commit' {$bad.stage5Provenance.binding.capture.toolingCommit='0'*40}
        'receipt' {$bad.replicaReceiptSha256='0'*64}
        'partial' {$bad.stage5Provenance.PSObject.Properties.Remove('founderAcknowledgement')}
        'schema' {$bad.stage5Provenance.schemaVersion=2}
        'time' {$bad.stage5Provenance.finalizedAt=[DateTime]::Parse($s.auth.expiresAt).AddSeconds(1).ToString('o')}
        'artifact' {$bad.stage5Provenance.binding.finalization.artifacts[0].sha256='invalid'}
      }
      Assert-True (-not (Test-Phase7BWorkPackage2FinalizationProvenance -Descriptor $bad).pass) "restore rejects $damage provenance"
    }
  }
  $cases=@('capture-commit','finalization-commit','invocation','binding-hash','stage5-hash','authorization-id','authorization-hash','expired','future-issued','overlong-lifetime','consumed',
    'pending-hash','packet-sha','packet-bytes','quiescence','recipient','roundtrip','receipt-nonce','receipt-hash','partial','schema','unknown-field','go-in-binding')
  foreach($name in $cases){
    $s=New-ContinuationCase $name;$expectedBinding=Get-Phase7BSha256 -LiteralPath $s.bindingPath
    switch($name){
      'capture-commit' {$s.binding.capture.toolingCommit='8'*40}
      'finalization-commit' {$s.build.FinalizationToolingCommit='8'*40}
      'invocation' {$s.inputs.ExpectedInvocationContractSha256='8'*64}
      'binding-hash' {$expectedBinding='8'*64}
      'stage5-hash' {$entry=@($s.binding.finalization.artifacts|Where-Object{$_.relativePath -ceq 'scripts/phase7bRunWorkPackage2Stage5.ps1'});$entry[0].sha256='8'*64}
      'authorization-id' {$s.binding.capture.authorizationId='phase7b-wp2b-capture-auth-'+('8'*32)}
      'authorization-hash' {$s.inputs.ExpectedCaptureAuthorizationSha256='8'*64}
      'expired' {$s.auth.issuedAt=[DateTime]::UtcNow.AddHours(-2).ToString('o');$s.auth.expiresAt=[DateTime]::UtcNow.AddHours(-1).ToString('o');Save-Authorization $s}
      'future-issued' {$s.auth.issuedAt=[DateTime]::UtcNow.AddMinutes(1).ToString('o');Save-Authorization $s}
      'overlong-lifetime' {$s.auth.expiresAt=[DateTime]::UtcNow.AddHours(25).ToString('o');Save-Authorization $s}
      'consumed' {Write-Json $s.markerPath ([ordered]@{test=$true})}
      'pending-hash' {$s.inputs.ExpectedPendingDescriptorSha256='8'*64}
      'packet-sha' {$s.inputs.ExpectedPacketSha256='8'*64}
      'packet-bytes' {$s.inputs.ExpectedPacketBytes++}
      'quiescence' {$s.binding.capture.quiescenceToolingCommit='8'*40}
      'recipient' {$s.binding.capture.ageRecipient='age1'+('p'*58)}
      'roundtrip' {$s.binding.capture.decryptedStreamBytes++}
      'receipt-nonce' {$s.build.ExpectedReceiptNonce='8'*32}
      'receipt-hash' {$s.build.ExpectedReceiptSha256='8'*64}
      'partial' {$s.binding.capture.PSObject.Properties.Remove('authorizationExpiresAt')}
      'schema' {$s.binding.schemaVersion=2}
      'unknown-field' {$s.binding|Add-Member -NotePropertyName surprise -NotePropertyValue 'no'}
      'go-in-binding' {$s.binding.executionAuthorized=$true}
    }
    if($name -cne 'binding-hash'){Write-Json $s.bindingPath $s.binding;$expectedBinding=Get-Phase7BSha256 -LiteralPath $s.bindingPath}
    $snapshot=@(Get-ChildItem -LiteralPath $s.root -File|ForEach-Object{$_.Name+':'+(Get-Phase7BSha256 -LiteralPath $_.FullName)})
    $build=$s.build;$rejected=$false
    try{[void](Assert-Phase7BStage5ContinuationBinding -LiteralPath $s.bindingPath -ExpectedSha256 $expectedBinding @build)}catch{$rejected=$true}
    Assert-True $rejected "pre-write validator rejects $name"
    $after=@(Get-ChildItem -LiteralPath $s.root -File|ForEach-Object{$_.Name+':'+(Get-Phase7BSha256 -LiteralPath $_.FullName)})
    Assert-True (@(Compare-Object $snapshot $after).Count -eq 0) "$name is read-only"
  }
  $s=New-ContinuationCase 'file-import';$out=Join-Path $s.root 'import';[void](New-Item -ItemType Directory -Path $out)
  $destination=Join-Path $out $s.receipt.evidenceFileName
  $import=@(& (Join-Path $PSScriptRoot 'phase7bImportBoundedReplicaReceipt.ps1') -AttemptId $s.inputs.AttemptId -ExpectedEvidenceNonce $s.receipt.evidenceNonce `
    -ExpectedEvidenceSha256 $s.build.ExpectedReceiptSha256 -ExpectedPacketSha256 $s.pending.packetSha256 -ExpectedPacketBytes $s.pending.packetBytes `
    -EvidenceInputPath $s.receiptPath -OutputPath $destination -AuthorizationAcknowledgement 'WP2B_CAPTURE_IMPORT_SAFE_REPLICA_RECEIPT_EXACTLY_ONCE') -join [Environment]::NewLine|ConvertFrom-Json
  Assert-True ($import.pass -and (Get-Phase7BSha256 -LiteralPath $destination) -ceq $s.build.ExpectedReceiptSha256) 'synthetic file import is byte-identical without clipboard or prompt'
  $late=$s.auth.PSObject.Copy();$late.expiresAt=[DateTime]::UtcNow.AddSeconds(-1).ToString('o');$reject=$false
  try{Use-Phase7BWorkPackage2CaptureAuthorization -AuthorizationPath $s.inputs.CaptureAuthorizationPath -Authorization $late}catch{$reject=$true}
  Assert-True ($reject -and -not (Test-Path -LiteralPath $s.markerPath)) 'expiry rechecked at consumption boundary'
  foreach($consumer in @('phase7bBuildWorkPackage2RestoreIso.ps1','phase7bIsolatedGuestRestoreInterface.ps1')){
    Assert-True ((Get-Content (Join-Path $PSScriptRoot $consumer) -Raw).Contains('Test-Phase7BWorkPackage2FinalizationProvenance')) "$consumer validates portable extension"
  }
  $stage5=Get-Content (Join-Path $PSScriptRoot 'phase7bRunWorkPackage2Stage5.ps1') -Raw
  Assert-True ($stage5.IndexOf('Assert-Phase7BStage5ContinuationBinding') -lt $stage5.IndexOf('phase7bVerifyPrimaryReplicaSessionClosed.ps1') -and
    $stage5.IndexOf('Assert-Phase7BStage5ClosureStartState') -lt $stage5.IndexOf('phase7bVerifyPrimaryReplicaSessionClosed.ps1')) 'complete continuation and collision checks precede first durable write'
  $cleanRoot=Join-Path $s.root 'clean-closure';[void](New-Item -ItemType Directory -Path $cleanRoot)
  $cleanPacket=Join-Path $cleanRoot (Split-Path -Leaf $s.build.PacketPath);$cleanPending=Join-Path $cleanRoot (Split-Path -Leaf $s.inputs.PendingDescriptorPath)
  Copy-Item -LiteralPath $s.build.PacketPath -Destination $cleanPacket;Copy-Item -LiteralPath $s.inputs.PendingDescriptorPath -Destination $cleanPending
  Assert-Phase7BStage5ClosureStartState -PacketPath $cleanPacket -PendingDescriptorPath $cleanPending
  Assert-True $true 'shared read-only readiness accepts fresh closure state'
  Write-Json (Join-Path $cleanRoot 'unexpected-final.json') ([ordered]@{synthetic=$true});$reject=$false
  try{Assert-Phase7BStage5ClosureStartState -PacketPath $cleanPacket -PendingDescriptorPath $cleanPending}catch{$reject=$true}
  Assert-True $reject 'shared read-only readiness rejects finalization residue'
  $returnPath=Join-Path $PSScriptRoot 'phase7bWorkPackage2ReceiptReturn.ps1'
  $tokens=$null;$errors=$null;$returnAst=[Management.Automation.Language.Parser]::ParseFile($returnPath,[ref]$tokens,[ref]$errors)
  Assert-True (@($errors).Count -eq 0) 'standalone receipt return PS51 parse'
  foreach($name in @('Read-TransportReceipt','Get-ByteHash')){
    $definitions=@($returnAst.FindAll({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -ceq $name},$true))
    Assert-True ($definitions.Count -eq 1) "pure transport function $name found"
    . ([scriptblock]::Create($definitions[0].Extent.Text))
  }
  $AttemptId=$s.inputs.AttemptId;$ExpectedPacketSha256=$s.pending.packetSha256;$ExpectedPacketBytes=$s.pending.packetBytes
  $receiptBytes=[IO.File]::ReadAllBytes($s.receiptPath)
  Assert-True ((Read-TransportReceipt $receiptBytes).evidenceNonce -ceq $s.receipt.evidenceNonce) 'transport accepts exact synthetic receipt shape'
  foreach($name in @('unknown','packet','secret-field','false-teardown','array','oversize')){
    $bad=$s.receipt|ConvertTo-Json -Depth 10|ConvertFrom-Json
    switch($name){
      'unknown' {$bad.classification='UNKNOWN'}
      'packet' {$bad.packetSha256='0'*64}
      'secret-field' {$bad|Add-Member -NotePropertyName forbiddenExtraField -NotePropertyValue 'synthetic-only'}
      'false-teardown' {$bad.sessionTornDown=$false}
      'array' {$bad=@($bad,$bad)}
    }
    $badBytes=[Text.Encoding]::UTF8.GetBytes((ConvertTo-Phase7BCanonicalJson $bad));if($name -ceq 'oversize'){$badBytes=New-Object byte[] 65537}
    $reject=$false;try{[void](Read-TransportReceipt $badBytes)}catch{$reject=$true}
    Assert-True $reject "receipt transport rejects $name"
  }
  $returnText=Get-Content $returnPath -Raw
  $returnCommands=@($returnAst.FindAll({param($n)$n -is [Management.Automation.Language.CommandAst]},$true)|ForEach-Object{$_.GetCommandName()})
  Assert-True (@($returnCommands|Where-Object{$_ -cin @('Get-Credential','New-SmbShare','Remove-SmbShare','New-PSDrive','Remove-Item')}).Count -eq 0) 'receipt transport cannot request secrets, map, mutate receiver or delete evidence'
  Assert-True ($returnText.Contains('-LocalAddress $laptop -LocalPort $port -RemoteAddress $primary') -and
    $returnText.Contains('-Profile ([string]$profiles[0].NetworkCategory)') -and -not $returnText.Contains('-Profile Any') -and
    $returnText.Contains('$accept.Wait(300000)') -and $returnText.Contains('$listener.Stop()') -and $returnText.Contains('TEARDOWN_FAIL')) 'bounded actual-profile transport and teardown contract'
  # Exercise the actual generator in fresh PS5.1 processes, inside an isolated synthetic
  # repository. No live attempt contract, authorization, source or remote ref is changed.
  $s=New-ContinuationCase 'fresh-generator'
  $synthetic=Join-Path $testRoot 'generator-repository';$scripts=Join-Path $synthetic 'scripts';$outputRoot=Join-Path $synthetic '.tmp'
  [void](New-Item -ItemType Directory -Path $scripts -Force);[void](New-Item -ItemType Directory -Path $outputRoot)
  foreach($name in @((Get-Phase7BWorkPackage2FinalizationArtifactNames)+'phase7bNewWorkPackage2Stage5ContinuationBinding.ps1')){
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $scripts $name)
  }
  & git -C $synthetic init -q
  & git -C $synthetic config user.name 'Synthetic WP2 Test'
  & git -C $synthetic config user.email 'wp2-synthetic@example.invalid'
  & git -C $synthetic checkout -q -b combined-app-platform-cutover
  & git -C $synthetic add scripts
  & git -C $synthetic commit -q -m 'Synthetic continuation fixture'
  if($LASTEXITCODE -ne 0){throw 'SYNTHETIC_REPO_FAIL'}
  $syntheticCommit=(& git -C $synthetic rev-parse HEAD).Trim()
  & git -C $synthetic update-ref refs/remotes/origin/combined-app-platform-cutover $syntheticCommit
  $output=Join-Path $outputRoot "$($s.inputs.AttemptId)-stage5-continuation-$syntheticCommit.json"
  $ps51=Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $parameters=@{AttemptId=$s.inputs.AttemptId;CaptureInvocationContractPath=$s.inputs.InvocationContractPath;
    ExpectedCaptureInvocationContractSha256=$s.inputs.ExpectedInvocationContractSha256;CaptureAuthorizationPath=$s.inputs.CaptureAuthorizationPath;
    ExpectedCaptureAuthorizationSha256=$s.inputs.ExpectedCaptureAuthorizationSha256;PendingDescriptorPath=$s.inputs.PendingDescriptorPath;
    ExpectedPendingDescriptorSha256=$s.inputs.ExpectedPendingDescriptorSha256;PacketPath=$s.build.PacketPath;ReceiptTransportPath=$s.receiptPath;
    ExpectedReceiptSha256=$s.build.ExpectedReceiptSha256;ExpectedReceiptNonce=$s.receipt.evidenceNonce;OutputPath=$output;
    Acknowledgement='WP2B_STAGE5_PREPARE_NONEXECUTABLE_CONTINUATION_BINDING_ONLY'}
  foreach($run in @(1,2)){
    $lines=@(& $ps51 -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $scripts 'phase7bNewWorkPackage2Stage5ContinuationBinding.ps1') @parameters)
    Assert-True ($LASTEXITCODE -eq 0) "fresh PS51 continuation generator run $run"
    $generated=($lines -join [Environment]::NewLine)|ConvertFrom-Json
    Assert-True ($generated.pass -and -not $generated.executionAuthorized -and -not (Test-Path -LiteralPath $s.markerPath)) 'generator creates binding only'
    if($run -eq 1){$firstHash=Get-Phase7BSha256 -LiteralPath $output;Remove-Item -LiteralPath $output -Force}
    else{Assert-True ((Get-Phase7BSha256 -LiteralPath $output) -ceq $firstHash) 'fresh-process generator recreation byte-identical'}
  }
}finally{
  $resolved=[IO.Path]::GetFullPath($testRoot);$allowed=[IO.Path]::GetFullPath((Join-Path $repo '.tmp')).TrimEnd('\')+'\phase7b-finalization-tests-'
  if(-not $resolved.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase)){throw 'SYNTHETIC_CLEANUP_BOUNDARY_FAIL'}
  if(Test-Path -LiteralPath $resolved){Remove-Item -LiteralPath $resolved -Recurse -Force}
}
[ordered]@{classification='PHASE7B_STAGE5_CONTINUATION_PS51_TESTS_PASS';pass=$true;assertions=$script:assertions;liveStageExecuted=$false;liveEvidenceTouched=$false;wp2cAuthorized=$false}|ConvertTo-Json -Compress
