[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ExpectedAttemptId,
  [Parameter(Mandatory = $true)][string]$RefreshNonce,
  [Parameter(Mandatory = $true)][string]$ExpectedToolingCommit,
  [Parameter(Mandatory = $true)][string]$SourceRoot,
  [Parameter(Mandatory = $true)][string]$OutputDirectory,
  [Parameter(Mandatory = $true)][string]$QuiescenceEvidencePath,
  [Parameter(Mandatory = $true)][string]$ExpectedQuiescenceEvidenceSha256,
  [Parameter(Mandatory = $true)][string]$AuthorizationAcknowledgement
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2OperatorLifecycle.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2Contract.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bIsolatedGuestContract.psm1') -Force
$stage = 'validate-input'; $writeStarted = $false
function Write-NewCanonical([string]$Path,$Value) {
  $bytes=(New-Object Text.UTF8Encoding($false)).GetBytes((ConvertTo-Phase7BCanonicalJson $Value))
  $stream=New-Object IO.FileStream($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
}
function Get-Selection([string]$Root) {
  $definitions=@(
    [pscustomobject]@{category='canonical-runtime';sourceRelativePath='private/founder/runtime-store.json';recursive=$false},
    [pscustomobject]@{category='migration-control';sourceRelativePath='private/founder/migration-control.json';recursive=$false},
    [pscustomobject]@{category='canonical-media';sourceRelativePath='private/founder/evidence';recursive=$true},
    [pscustomobject]@{category='canonical-media';sourceRelativePath='private/founder/photos';recursive=$true},
    [pscustomobject]@{category='canonical-media';sourceRelativePath='private/founder/dexa';recursive=$true})
  $prefix=@{'canonical-runtime'='windows/canonical';'migration-control'='windows/control';'canonical-media'='windows/media'}
  $entries=New-Object System.Collections.Generic.List[object]
  foreach($definition in $definitions){
    $selected=[IO.Path]::GetFullPath((Join-Path $Root $definition.sourceRelativePath.Replace('/','\')))
    if(Test-Path $selected -PathType Leaf){$files=@(Get-Item $selected -Force);$selectionRoot=Split-Path -Parent $selected}
    elseif(Test-Path $selected -PathType Container){$files=@(Get-ChildItem $selected -File -Recurse -Force);$selectionRoot=$selected}
    else{throw 'PHASE7B_WP2_SELECTED_SOURCE_MISSING'}
    foreach($file in $files){
      $sourceRelative=$file.FullName.Substring(($Root+'\').Length).Replace('\','/')
      $categoryRelative=if($file.FullName.Equals($selected,[StringComparison]::OrdinalIgnoreCase)){$file.Name}else{$file.FullName.Substring(($selectionRoot.TrimEnd('\')+'\').Length).Replace('\','/')}
      $entries.Add([pscustomobject][ordered]@{sourceRelativePath=$sourceRelative;logicalPath="$($prefix[$definition.category])/$categoryRelative"})
    }
  }
  [pscustomobject]@{definitions=$definitions;entries=@($entries)}
}
try {
  if($ExpectedAttemptId -cnotmatch '^phase7b-wp2-[0-9a-f]{32}$' -or $RefreshNonce -cnotmatch '^[0-9a-f]{32}$' -or $ExpectedToolingCommit -notmatch '^[0-9a-f]{40}$' -or $ExpectedQuiescenceEvidenceSha256 -notmatch '^[0-9a-f]{64}$' -or
     $AuthorizationAcknowledgement -ne 'WP2B_CAPTURE_REFRESH_STABLE_INVENTORY_EXACTLY_ONCE'){throw 'PHASE7B_WP2B_STABLE_REFRESH_ARGUMENT_FAIL'}
  $attempt=Assert-Phase7BWorkPackage2AttemptIdentity -ExpectedAttemptId $ExpectedAttemptId -ObservedAttemptId $ExpectedAttemptId
  $repositoryRoot=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path.TrimEnd('\');$source=(Resolve-Path $SourceRoot).Path.TrimEnd('\')
  $head=(& git -C $repositoryRoot rev-parse HEAD).Trim().ToLowerInvariant();$branch=(& git -C $repositoryRoot branch --show-current).Trim();$delta=(& git -C $repositoryRoot rev-list --left-right --count 'HEAD...origin/combined-app-platform-cutover').Trim();$dirty=@(& git -C $repositoryRoot status --short --untracked-files=no)
  if($head -ne $ExpectedToolingCommit -or $branch -ne 'combined-app-platform-cutover' -or $delta -ne "0`t0" -or $dirty.Count -ne 0){throw 'PHASE7B_WP2B_STABLE_REFRESH_REPOSITORY_FAIL'}
  if(-not(Test-Path $QuiescenceEvidencePath -PathType Leaf) -or (Get-Phase7BSha256 -LiteralPath $QuiescenceEvidencePath) -ne $ExpectedQuiescenceEvidenceSha256){throw 'PHASE7B_WP2B_STABLE_REFRESH_QUIESCENCE_HASH_FAIL'}
  $quiescence=Get-Content $QuiescenceEvidencePath -Raw|ConvertFrom-Json
  if(-not(Test-Phase7BWorkPackage2QuiescenceEvidence $quiescence $head).pass){throw 'PHASE7B_WP2B_STABLE_REFRESH_QUIESCENCE_FAIL'}
  if(-not(Test-Path $OutputDirectory -PathType Container)){throw 'PHASE7B_WP2B_STABLE_REFRESH_OUTPUT_ROOT_MISSING'}
  $stage='audit-stable-source-before'
  $auditScript=Join-Path $PSScriptRoot 'phase7bAuditWorkPackage2CaptureSource.mjs';$beforeText=@(& node --no-warnings $auditScript $source)-join [Environment]::NewLine
  if($LASTEXITCODE -ne 0){throw 'PHASE7B_WP2B_CAPTURE_SOURCE_AUDIT_NONZERO'};$before=$beforeText|ConvertFrom-Json
  if(-not $before.pass -or $before.requiredCollectionPresentCount -ne 39 -or $before.missingCollectionCount -ne 0 -or $before.unknownCollectionCount -ne 0 -or $before.missingMediaReferenceCount -ne 0){throw 'PHASE7B_WP2B_CAPTURE_SOURCE_AUDIT_FAIL'}
  $selectionData=Get-Selection $source;$inventory=New-Phase7BWorkPackage2Inventory -SourceRoot $source -Entries $selectionData.entries
  $outputSet=Assert-Phase7BWorkPackage2StableRefreshOutputSet -ExpectedAttemptId $ExpectedAttemptId -RefreshNonce $RefreshNonce -OutputDirectory $OutputDirectory
  $selectionPath=$outputSet.selectionPath;$inventoryAuthPath=$outputSet.inventoryAuthorizationPath;$planPath=$outputSet.capturePlanPath
  $wp2=Get-Phase7BWorkPackage2Contract;$sourceSha=Get-Phase7BSha256 -Text $source.ToLowerInvariant();$observed=[DateTime]::UtcNow
  $selection=[ordered]@{schemaVersion=1;classification='PHASE7B_WP2_WINDOWS_SELECTION';attemptId=$attempt;inventoryTimestamp=$observed.ToString('o');toolingCommit=$head;applicationCommit=$wp2.applicationCommit;environmentId=$wp2.environmentId;vmDisplayName=$wp2.vmDisplayName;windowsHostId=$wp2.windowsHostId;manifestDigest=$wp2.manifestDigest;sourceRootSha256=$sourceSha;canonicalEvidence=[ordered]@{classification='PHASE7B_WP2B_CANONICAL_AND_MEDIA_COMPLETENESS_PASS';runtimeRevision=[int64]$before.runtimeRevision;runtimeSha256=[string]$before.runtimeSha256;controlSha256=[string]$before.controlSha256;requiredCollectionCount=39;requiredCollectionPresentCount=39;missingCollectionCount=0;unknownCollectionCount=0;totalCanonicalRecordCount=[int]$before.totalCanonicalRecordCount;mediaFileCount=[int]$before.physicalMediaFileCount;mediaBytes=[int64]$before.physicalMediaBytes;missingMediaReferenceCount=0;mediaRelationshipCount=[int]$before.mediaRelationshipCount};exclusionEvidence=[ordered]@{classification='PHASE7B_WP2B_SELECTION_EXCLUSIONS_PASS';credentialSignalCount=0;cacheOrBuildArtifactsSelected=$false;previousMigrationPacketsSelected=$false;restoreArtifactsSelected=$false;unrelatedFounderPrivatePathsSelected=$false};selections=$selectionData.definitions}
  Write-NewCanonical $selectionPath $selection;$writeStarted=$true;$selectionSha=Get-Phase7BSha256 -LiteralPath $selectionPath
  $inventoryAuth=[ordered]@{schemaVersion=1;classification=$wp2.authorizationClassification;authorizedStages=@([ordered]@{stage='WP2B_INVENTORY';mutationBudget=1});attemptId=$attempt;toolingCommit=$head;applicationCommit=$wp2.applicationCommit;environmentId=$wp2.environmentId;vmDisplayName=$wp2.vmDisplayName;windowsHostId=$wp2.windowsHostId;manifestDigest=$wp2.manifestDigest;sourceRootSha256=$sourceSha;capturePlanSha256=$selectionSha;sourceInventorySha256=('0'*64);localOutputRootSha256=('0'*64);replicaRootSha256=('0'*64);packetSha256=('0'*64);founderApproved=$true;automaticRetryAllowed=$false;issuedAt=$observed.ToString('o');expiresAt=$observed.AddHours(2).ToString('o')}
  Write-NewCanonical $inventoryAuthPath $inventoryAuth;$inventoryAuthSha=Get-Phase7BSha256 -LiteralPath $inventoryAuthPath
  $stage='source-owned-plan-refresh';$planner=Join-Path $PSScriptRoot 'phase7bPlanWorkPackage2Capture.ps1'
  $plannerText=@(& "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $planner -AttemptId $attempt -AuthorizationPath $inventoryAuthPath -ExpectedAuthorizationSha256 $inventoryAuthSha -SourceRoot $source -SelectionPath $selectionPath -ExpectedSelectionSha256 $selectionSha -OutputPath $planPath)-join [Environment]::NewLine
  if($LASTEXITCODE -ne 0){throw 'PHASE7B_WP2B_STABLE_REFRESH_PLANNER_NONZERO'};$plannerResult=$plannerText|ConvertFrom-Json
  $selectionRead=Get-Content -LiteralPath $selectionPath -Raw|ConvertFrom-Json -ErrorAction Stop
  $inventoryAuthorizationRead=Get-Content -LiteralPath $inventoryAuthPath -Raw|ConvertFrom-Json -ErrorAction Stop
  $planRead=Get-Content -LiteralPath $planPath -Raw|ConvertFrom-Json -ErrorAction Stop
  foreach($observedAttemptId in @($selectionRead.attemptId,$inventoryAuthorizationRead.attemptId,$planRead.attemptId,$plannerResult.attemptId)){
    [void](Assert-Phase7BWorkPackage2AttemptIdentity -ExpectedAttemptId $ExpectedAttemptId -ObservedAttemptId ([string]$observedAttemptId))
  }
  $stage='audit-stable-source-after';$afterText=@(& node --no-warnings $auditScript $source)-join [Environment]::NewLine;if($LASTEXITCODE -ne 0){throw 'PHASE7B_WP2B_CAPTURE_SOURCE_AUDIT_NONZERO'};$after=$afterText|ConvertFrom-Json
  $post=New-Phase7BWorkPackage2Inventory -SourceRoot $source -Entries $selectionData.entries
  if([string]$before.runtimeSha256 -ne [string]$after.runtimeSha256 -or [string]$before.controlSha256 -ne [string]$after.controlSha256 -or [string]$inventory.inventorySha256 -ne [string]$post.inventorySha256 -or [string]$plannerResult.sourceInventorySha256 -ne [string]$post.inventorySha256){throw 'PHASE7B_WP2B_SOURCE_CHANGED_DURING_STABLE_REFRESH'}
  [ordered]@{classification='PHASE7B_WP2B_POST_QUIESCENCE_STABLE_INVENTORY_PASS';pass=$true;attemptId=$attempt;expectedAttemptId=$ExpectedAttemptId;attemptIdentityExact=$true;refreshNonce=$RefreshNonce;toolingCommit=$head;runtimeRevision=[int64]$after.runtimeRevision;runtimeSha256=[string]$after.runtimeSha256;selectionFileName=Split-Path -Leaf $selectionPath;selectionSha256=$selectionSha;inventoryAuthorizationFileName=Split-Path -Leaf $inventoryAuthPath;inventoryAuthorizationSha256=$inventoryAuthSha;capturePlanFileName=Split-Path -Leaf $planPath;capturePlanSha256=Get-Phase7BSha256 -LiteralPath $planPath;sourceInventorySha256=[string]$post.inventorySha256;fileCount=[int]$post.fileCount;totalBytes=[int64]$post.totalBytes;sourceStableAcrossRefresh=$true;sourceMutationPerformed=$false;automaticRetryAllowed=$false;wp2cAuthorized=$false}|ConvertTo-Json -Depth 5
} catch {
  $safeCode=if($_.Exception.Message -match '^PHASE7B_'){$_.Exception.Message}else{'PHASE7B_WP2B_STABLE_REFRESH_EXCEPTION'}
  [ordered]@{classification='PHASE7B_WP2B_POST_QUIESCENCE_STABLE_INVENTORY_FAIL';pass=$false;safeStage=$stage;safeErrorCode=$safeCode;writeStarted=$writeStarted;sourceMutationPerformed=$false;automaticRetryAllowed=$false;wp2cAuthorized=$false}|ConvertTo-Json -Depth 4
  exit 1
}
