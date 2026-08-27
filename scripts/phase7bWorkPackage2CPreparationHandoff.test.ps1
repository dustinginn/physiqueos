[CmdletBinding()]
param([string]$AgeExePath,[string]$AgeKeygenPath)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
if($PSVersionTable.PSEdition -cne 'Desktop' -or $PSVersionTable.PSVersion.Major -ne 5){throw 'WINDOWS_PS51_REQUIRED'}
# Final descriptor from the actual finalizer; guest observations/baseline from
# actual collectors in a fresh synthetic OS-boundary fixture process.
. (Join-Path $PSScriptRoot 'phase7bWorkPackage2Finalization.test.ps1') -FixturesOnly
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CContract.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CGuest.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CHost.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CMedia.psm1') -Force
function Reject([scriptblock]$Action,[string]$Message){$failed=$false;try{& $Action|Out-Null}catch{$failed=$true};Assert-True $failed $Message}
function Clone($Value){$Value|ConvertTo-Json -Depth 30|ConvertFrom-Json}
function Id([char]$Char){[pscustomobject]@{sha256=([string]$Char*64);bytes=[int64]4097}}
try {
  $s=New-Case 'preparation-handoff';$final=Invoke-SyntheticFinalizer $s
  Assert-True $final.pass 'actual finalizer fixture'
  $descriptor=Get-Content -LiteralPath $s.finalPath -Raw|ConvertFrom-Json
  $lines=@(& "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'phase7bWorkPackage2CCollector.test.ps1') -ExportSourceFixture)
  Assert-True ($LASTEXITCODE -eq 0) 'actual guest producer fixture process'
  $fixture=($lines -join "`n")|ConvertFrom-Json
  $baseline=$fixture.baseline
  $toolingPinPath=Join-Path $s.root 'synthetic-tooling-media.bin';[IO.File]::WriteAllBytes($toolingPinPath,[byte[]]@(1,2,3,4))
  $toolingId=Get-Phase7BWP2CIdentity $toolingPinPath
  $plan=New-Phase7BWP2CPreparationPlan $baseline $descriptor (Get-Phase7BWP2CIdentity $s.finalPath) $toolingId (Id 'b') (Id 'c') $PSScriptRoot ('d'*40) ('wp2c-prepared-'+('e'*32)) ('f'*64) ('a'*64) ('b'*64)
  $planPath=Join-Path $s.root 'plan.json';$planId=Write-Phase7BWP2CCreateNewJson $planPath $plan
  $again=New-Phase7BWP2CPreparationPlan $baseline $descriptor (Get-Phase7BWP2CIdentity $s.finalPath) $toolingId (Id 'b') (Id 'c') $PSScriptRoot ('d'*40) ('wp2c-prepared-'+('e'*32)) ('f'*64) ('a'*64) ('b'*64)
  $againId=Write-Phase7BWP2CCreateNewJson (Join-Path $s.root 'plan-again.json') $again
  Assert-True ($planId.sha256 -ceq $againId.sha256 -and $planId.bytes -eq $againId.bytes) 'deterministic canonical plan bytes'
  Assert-True (@($plan.toolingManifest.files).Count -eq 14 -and 'b.cmd' -cin @($plan.toolingManifest.files.name)) 'current tooling closure is 13 PS plus b.cmd, two binaries and manifest'
  $content=Join-Path $s.root 'prep-content'
  $made=New-Phase7BWP2CPreparationContent $planPath $planId.sha256 $content
  $received=Read-Phase7BWP2CPreparationContent $content $made.descriptorIdentity.sha256
  Assert-True ((Get-Phase7BWP2CObjectHash $received.plan) -ceq $planId.sha256) 'actual plan producer -> carrier -> consumer'
  Assert-True (@(Get-ChildItem -LiteralPath $content).Count -eq 2) 'prep carrier exactly two nonsecret files'
  Reject {New-Phase7BWP2CPreparationContent $planPath $planId.sha256 $content} 'create-new carrier'
  Reject {Read-Phase7BWP2CPreparationContent $content ('0'*64)} 'wrong descriptor hash'
  foreach($name in @('unexpected.txt','authorization.json','host-claim.json','completion.json','packet.zip.age','AGE-SECRET-KEY.txt')){
    $extra=Join-Path $content $name;[IO.File]::WriteAllText($extra,'synthetic-nonsecret')
    Reject {Read-Phase7BWP2CPreparationContent $content $made.descriptorIdentity.sha256} ('extra forbidden carrier file '+$name)
    Remove-Item -LiteralPath $extra
  }
  $saved=[IO.File]::ReadAllBytes((Join-Path $content 'preparation-plan.json'))
  Remove-Item -LiteralPath (Join-Path $content 'preparation-plan.json')
  Reject {Read-Phase7BWP2CPreparationContent $content $made.descriptorIdentity.sha256} 'missing plan'
  [IO.File]::WriteAllBytes((Join-Path $content 'preparation-plan.json'),$saved)
  [IO.File]::AppendAllText((Join-Path $content 'preparation-plan.json'),' ')
  Reject {Read-Phase7BWP2CPreparationContent $content $made.descriptorIdentity.sha256} 'plan wrong bytes/hash'
  [IO.File]::WriteAllBytes((Join-Path $content 'preparation-plan.json'),$saved)
  foreach($field in @('applicationCommit','environmentId','toolingManifestSha256','toolingRoot','networkPolicy')){
    $bad=Clone $plan;$bad.bindings.$field='wrong';Reject {Assert-Phase7BWP2CPreparationPlan $bad} ('wrong plan '+$field)
  }
  foreach($name in @('authorization','hostClaim','packetFile','passphrase')){
    $bad=Clone $plan;$bad|Add-Member NoteProperty $name 'forbidden';Reject {Assert-Phase7BWP2CPreparationPlan $bad} ('unknown plan field '+$name)
  }
  $bad=Clone $plan;$bad.toolingManifest.files[0]|Add-Member NoteProperty authorization 'forbidden'
  $bad.bindings.toolingManifestSha256=Get-Phase7BWP2CObjectHash $bad.toolingManifest
  $bad.bindings.toolingRoot=Join-Path (Get-Phase7BIsolatedGuestContract).isolatedRoot ('tooling\'+$bad.bindings.toolingManifestSha256)
  Reject {Assert-Phase7BWP2CPreparationPlan $bad} 'nested unknown manifest payload rejected even with recomputed hash'
  # Optical-only selector calls the real content consumer, with only CIM
  # DriveType/volume metadata substituted; no actual media mount/guest access.
  $mediaModule=Get-Module phase7bWorkPackage2CMedia
  $contentReader=(Get-Command Read-Phase7BWP2CPreparationContent -Module phase7bWorkPackage2CMedia).ScriptBlock
  $optical=& $mediaModule {
    param($Content,$Hash,$Reader)
    function Get-CimInstance {param($ClassName,$Filter,$ErrorAction);[pscustomobject]@{DeviceID='F:';VolumeName='P7B_C_PREP'}}
    function Read-Phase7BWP2CPreparationContent {param($Root,$DescriptorSha256);if($Root -cne 'F:\'){throw 'WRONG_OPTICAL'};& $Reader $Content $DescriptorSha256}
    Read-Phase7BWP2CPreparationOptical 'F:\' $Hash
  } $content $made.descriptorIdentity.sha256 $contentReader
  Assert-True ($optical.descriptorIdentity.sha256 -ceq $made.descriptorIdentity.sha256 -and (Get-Phase7BWP2CObjectHash $optical.plan) -ceq $planId.sha256) 'optical selector -> actual content reader -> actual plan'
  Reject {Read-Phase7BWP2CPreparationOptical $content $made.descriptorIdentity.sha256} 'writable plan path cannot bypass optical entry'
  $iso=Join-Path $s.root 'disposable-preparation.iso'
  $isoId=New-Phase7BWP2COpticalImage $content 'P7B_C_PREP' $iso
  Assert-True ($isoId.bytes -gt 0 -and (Get-Phase7BIsoVolumeIdentity $iso).primaryVolumeLabel -ceq 'P7B_C_PREP') 'real disposable prep ISO; not mounted'
  $report=[pscustomobject][ordered]@{schemaVersion=1;kind='wp2c-guest-preparation-observation';planSha256=$planId.sha256;observation=$fixture.observation;observedAt='2026-08-26T00:00:00Z';wp2cExecuted=$false;packetDecrypted=$false;executionClaimCreated=$false;authorizationConsumed=$false;reportPersisted=$false}
  Assert-True (Test-Phase7BWP2CGuestObservation $report.observation $plan.bindings).pass 'source-produced collector matches source-produced plan'
  # Harness output comes through its actual public script; UI/CIM/clipboard
  # metadata alone are synthetic. No dialog or real input mechanism runs.
  $observations=@(foreach($case in @('first-field','canary','interrupt')){
    & {
      param($Case,$ScriptPath)
      function Import-Module {param($Name)}
      function Get-CimInstance {param($ClassName,$ErrorAction);[pscustomobject]@{Manufacturer='VMware, Inc.';Model='VMware Virtual Platform'}}
      function Show-Phase7BGuestSyntheticIdentityObservation {
        [pscustomobject][ordered]@{firstFieldExact=($Case -ceq 'first-field');secondFieldExact=($Case -ceq 'first-field');firstCount=if($Case -ceq 'first-field'){74}else{0};secondCount=if($Case -ceq 'first-field'){74}else{0};dialogConfirmed=($Case -ceq 'first-field');syntheticObservationOnly=$true}
      }
      # Read-only sequence API is real; no clipboard content read/write.
      (& $ScriptPath -Case $Case -FounderSyntheticGuestTestApproved)|ConvertFrom-Json
    } $case (Join-Path $PSScriptRoot 'phase7bTestWorkPackage2GuestIdentityEntry.ps1')
  })
  $returned=New-Phase7BWP2CPreparationReturn $plan $made.descriptorIdentity $report $observations
  $token=ConvertTo-Phase7BWP2CPreparationReturnText $returned
  $decoded=ConvertFrom-Phase7BWP2CPreparationReturnText $token
  Assert-True ((Get-Phase7BWP2CObjectHash $decoded) -ceq (Get-Phase7BWP2CObjectHash $returned)) 'lossless checked nonsecret return'
  Assert-True ($token.Length -lt 6000) 'finite screenshot-sized return, no large JSON transcription'
  Assert-True ((Get-Phase7BWP2CObjectHash (ConvertFrom-Phase7BWP2CPreparationReturnText ($token -replace '(.{70})',"`$1`n"))) -ceq (Get-Phase7BWP2CObjectHash $returned)) 'line wrapping harmless'
  $baselineText=ConvertTo-Phase7BWP2CPreparationReturnText $baseline
  Assert-True ((Get-Phase7BWP2CObjectHash (ConvertFrom-Phase7BWP2CPreparationReturnText $baselineText)) -ceq (Get-Phase7BWP2CObjectHash $baseline)) 'source baseline return lossless'
  foreach($bad in @('{"pass":true}',('x'*20001),($token -replace '^WP2CP1:\d+:','WP2CP1:1:'),($token.Substring(0,$token.Length-3)))){Reject {ConvertFrom-Phase7BWP2CPreparationReturnText $bad} 'malformed/oversize/truncated/wrong length'}
  foreach($field in @('realIdentityUsed','invalidSyntheticValueOnly')){$bad=Clone $returned;$bad.$field=-not $bad.$field;Reject {ConvertTo-Phase7BWP2CPreparationReturnText $bad} ('wrong synthetic flag '+$field)}
  $bad=Clone $returned;$bad.reportIdentity.sha256='0'*64;Reject {ConvertTo-Phase7BWP2CPreparationReturnText $bad} 'report hash'
  $bad=Clone $returned;$bad.reportIdentity.bytes++;Reject {ConvertTo-Phase7BWP2CPreparationReturnText $bad} 'report bytes'
  $bad=Clone $returned;$bad.report.kind='PHASE7B_WP2_ISOLATED_RESTORE_VERIFICATION_PASS_INERT';Reject {ConvertTo-Phase7BWP2CPreparationReturnText $bad} 'execution PASS cannot be prep output'
  $bad=Clone $returned;$bad.report.observation|Add-Member NoteProperty secret 'arbitrary';Reject {ConvertTo-Phase7BWP2CPreparationReturnText $bad} 'unknown report property is not a secret channel'
  $review=[pscustomobject][ordered]@{schemaVersion=1;kind='wp2c-preparation-founder-review';preparedStateId=$plan.bindings.preparedStateId;onePasswordVersion='8.0';vmwareVersion='26.0';clipboardSequenceBefore=42;clipboardSequenceAfter=42;founderReviewed=$true;realIdentityUsed=$false;invalidSyntheticValueOnly=$true;unexpectedDestinationInput=$false;reviewedAt='2026-08-26T00:01:00Z';wrongFieldTestPass=$true;guestFocusLossTestPass=$true;hostFocusChangeTestPass=$true;minimizationTestPass=$true;cancellationTestPass=$true;interruptionTestPass=$true;canaryTestPass=$true;noToolingSecretFileWrites=$true;noTotp=$true;automaticSubmissionDisabled=$true}
  $b=$plan.bindings
  $ho=[pscustomobject]@{hostIdentitySha256=$b.hostIdentitySha256;vmConfigSha256=$b.vmConfigSha256;snapshotSha256=$b.snapshotSha256;availableMemoryBytes=[int64]7GB;freeDiskBytes=[int64]120GB;poweredOff=$true;vmContractPass=$true;nicStartConnected=$false;clipboardDisabled=$true;dragDropDisabled=$true;sharedFoldersDisabled=$true;memorySnapshotPresent=$false}
  $accepted=New-Phase7BWP2CPreparationHandoffEvidence $plan $decoded $review $ho $isoId $made.descriptorIdentity
  Assert-True ($accepted.preparation.kind -ceq 'wp2c-preparation' -and -not $accepted.preparation.wp2cExecuted -and $accepted.preparation.preparationHandoff.preparationControlMedia.sha256 -ceq $isoId.sha256) 'actual return -> preparation producer/validator accepted'
  foreach($field in @('guestIdentitySha256','applicationCommit','toolingManifestSha256')){
    $bad=Clone $returned;$bad.report.observation.$field='0'*64;$bad.reportIdentity.sha256=Get-Phase7BWP2CObjectHash $bad.report;$bad.reportIdentity.bytes=[Text.Encoding]::UTF8.GetByteCount((ConvertTo-Phase7BCanonicalJson $bad.report))
    Reject {New-Phase7BWP2CPreparationHandoffEvidence $plan $bad $review $ho $isoId $made.descriptorIdentity} ('wrong returned '+$field)
  }
  foreach($field in @('realIdentityUsed','invalidSyntheticValueOnly','wrongFieldTestPass','founderReviewed')){$bad=Clone $review;$bad.$field=-not $bad.$field;Reject {New-Phase7BWP2CPreparationHandoffEvidence $plan $returned $bad $ho $isoId $made.descriptorIdentity} ('review rejects '+$field)}
  $bad=Clone $review;$bad.clipboardSequenceAfter++;Reject {New-Phase7BWP2CPreparationHandoffEvidence $plan $returned $bad $ho $isoId $made.descriptorIdentity} 'host clipboard change'
  $bad=Clone $ho;$bad.availableMemoryBytes=3GB;Reject {New-Phase7BWP2CPreparationHandoffEvidence $plan $returned $review $bad $isoId $made.descriptorIdentity} 'RAM gate unchanged'
  $bad=Clone $returned;$bad.syntheticObservations[0].dialog.firstCount=73;Reject {New-Phase7BWP2CPreparationHandoffEvidence $plan $bad $review $ho $isoId $made.descriptorIdentity} 'synthetic wrong count'
  # Actual public recorder: only host observation, publication and output-root
  # machine boundaries substituted. Carrier, codec, schemas and all four writes
  # execute unchanged against disposable source-produced bytes.
  $reviewPath=Join-Path $s.root 'review.json';$reviewId=Write-Phase7BWP2CCreateNewJson $reviewPath $review
  $textPath=Join-Path $s.root 'return.txt';[IO.File]::WriteAllText($textPath,$token)
  $recorderPath=Join-Path $PSScriptRoot 'phase7bRecordWorkPackage2CPreparation.ps1'
  function Invoke-TestRecorder([string]$Destination) {
    function Import-Module {param($Name)}
    function Assert-Phase7BWP2CPublishedRepository {param($RepositoryRoot,$ExpectedCommit);if($ExpectedCommit -cne ('d'*40)){throw 'TEST_COMMIT'}}
    function Get-Phase7BWP2CHostObservation {param($VmxPath,$SnapshotMetadataPath);$ho}
    function Assert-Phase7BWP2CLocalPath {param($LiteralPath,$WithinRoot);if($WithinRoot -cne 'C:\Phase7B\host-evidence\379bb303\wp2c' -or -not $LiteralPath.StartsWith($s.root+'\')){throw 'TEST_BOUNDARY'};$LiteralPath}
    (& $recorderPath -PreparationContentRoot $content -PreparationDescriptorSha256 $made.descriptorIdentity.sha256 -PreparationMediaPath $iso -PreparationMediaSha256 $isoId.sha256 -ToolingMediaPath $toolingPinPath -ReturnTextPath $textPath -FounderReviewPath $reviewPath -FounderReviewSha256 $reviewId.sha256 -VmxPath 'synthetic-only' -SnapshotMetadataPath 'synthetic-only' -OutputDirectory $Destination -FounderPreparationReviewed)|ConvertFrom-Json
  }
  $destination=Join-Path $s.root 'recorded'
  $recorded=Invoke-TestRecorder $destination
  Assert-True ($recorded.classification -ceq 'PHASE7B_WP2C_PREPARATION_RECORDED_NONEXECUTABLE' -and -not $recorded.wp2cExecuted) 'public recorder accepts actual checked return'
  Assert-True (@(Get-ChildItem -LiteralPath $destination).Count -eq 4) 'recorder exact four evidence files'
  Assert-True ((Get-Phase7BWP2CIdentity (Join-Path $destination 'guest-report.json')).sha256 -ceq $returned.reportIdentity.sha256) 'recorder persists exact source report bytes'
  Reject {Invoke-TestRecorder $destination} 'recorder evidence collision cannot overwrite'
  [IO.File]::WriteAllText($textPath,'{"pass":true}')
  $rejectedDestination=Join-Path $s.root 'fake-pass'
  Reject {Invoke-TestRecorder $rejectedDestination} 'public recorder rejects caller fake PASS'
  Assert-True (-not (Test-Path -LiteralPath $rejectedDestination)) 'fake PASS no host output mutation'
  [IO.File]::WriteAllText($textPath,($token -replace '^WP2CP1:\d+:','WP2CP1:1:'))
  Reject {Invoke-TestRecorder $rejectedDestination} 'public recorder wrong return bytes'
  Assert-True (-not (Test-Path -LiteralPath $rejectedDestination)) 'wrong bytes no host output mutation'
  $expectedUuid=New-Object Guid(,[byte[]]@(0x56,0x4d,0x29,0xd3,0xc2,0x39,0xb8,0x6b,0x4b,0xe4,0xce,0x8c,0xa3,0,0x80,0xa4))
  Assert-True ((Get-Phase7BWP2CExpectedGuestIdentity @{'uuid.bios'='56 4d 29 d3 c2 39 b8 6b-4b e4 ce 8c a3 00 80 a4'}) -ceq (Get-Phase7BWP2CObjectHash $expectedUuid.ToString().ToLowerInvariant())) 'guest UUID derives from VM SMBIOS bytes not host UUID'
  # Extract only the pure command-printer function. Never execute the host
  # operator/session lifecycle in tests. Parse its real emitted guest commands.
  $operatorPath=Join-Path $PSScriptRoot 'phase7bWorkPackage2CPreparationOperator.ps1'
  $tokens=$null;$parseErrors=$null
  $operatorAst=[Management.Automation.Language.Parser]::ParseFile($operatorPath,[ref]$tokens,[ref]$parseErrors)
  Assert-True (@($parseErrors).Count -eq 0) 'operator PS51 AST'
  $printer=$operatorAst.Find({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -ceq 'Show-GuestCommands'},$true)
  . ([scriptblock]::Create($printer.Extent.Text))
  $printed=@(Show-GuestCommands ([pscustomobject]@{expectedGuestIdentitySha256=$b.guestIdentitySha256}) ([pscustomobject]@{manifestIdentity=[pscustomobject]@{sha256=$b.toolingManifestSha256}}) $made 6>&1|ForEach-Object {[string]$_})
  $commands=@($printed|Where-Object {$_ -match '^[&$]'})
  Assert-True ($commands.Count -eq 6 -and ($commands -join "`n") -notmatch '<PREP-CD|<manifest|<hash') 'complete generated commands, no operator editing'
  [void][Management.Automation.Language.Parser]::ParseInput(($commands -join "`n"),[ref]$tokens,[ref]$parseErrors)
  Assert-True (@($parseErrors).Count -eq 0) 'generated guest install/session commands PS51 parse'
  $guide=Get-Content -LiteralPath (Join-Path $repo 'docs\PHASE7B_WP2C_PREPARATION_OPERATOR.md') -Raw
  $blocks=[regex]::Matches($guide,'(?s)```powershell\r?\n(.*?)```')
  Assert-True ($blocks.Count -ge 10) 'entire offline host/guest procedure frozen'
  foreach($block in $blocks){[void][Management.Automation.Language.Parser]::ParseInput($block.Groups[1].Value,[ref]$tokens,[ref]$parseErrors);Assert-True (@($parseErrors).Count -eq 0) 'guide block PS51 parse'}
  if($AgeExePath -and $AgeKeygenPath){
    $tools=Join-Path $s.root 'tooling';$toolResult=New-Phase7BWP2CToolingContent $PSScriptRoot $AgeExePath $AgeKeygenPath $tools
    Assert-True (@(Get-ChildItem -LiteralPath $tools).Count -eq 17) 'actual generic tooling producer is exactly 17 files'
    [IO.File]::Copy($planPath,(Join-Path $tools 'preparation-plan.json'))
    Reject {Assert-Phase7BWP2CExactFileSet $tools (@($toolResult.manifest.files.name)+@('age.exe','age-keygen.exe','wp2c-tooling-manifest.json'))} 'plan still forbidden on tooling media'
  }
  $result=[ordered]@{classification='PHASE7B_WP2C_PREPARATION_HANDOFF_TESTS_PASS';pass=$true;assertions=$script:assertions;returnCharacters=$token.Length;baselineCharacters=$baselineText.Length;actualSourceProducers=$true;liveVmAccess=$false;mediaMounted=$false;realIdentityUsed=$false;liveEvidenceCreated=$false}
} finally {
  if(Test-Path -LiteralPath $testRoot){$resolved=(Resolve-Path -LiteralPath $testRoot).Path;if(-not $resolved.StartsWith((Join-Path $repo '.tmp\phase7b-finalization-tests-'),[StringComparison]::OrdinalIgnoreCase)){throw 'SYNTHETIC_CLEANUP_BOUNDARY'};Remove-Item -LiteralPath $resolved -Recurse -Force}
}
$result|ConvertTo-Json -Compress
