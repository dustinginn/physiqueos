Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bIsolatedGuestContract.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2Contract.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2Orchestration.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2OperatorLifecycle.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2AuthorizationEligibility.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bBoundedReplicaTransport.psm1')

function Get-Phase7BStage5FinalizationArtifacts {
  [CmdletBinding()] param()
  @(Get-Phase7BWorkPackage2FinalizationArtifactNames | Sort-Object -CaseSensitive | ForEach-Object {
    $path=Join-Path $PSScriptRoot $_
    [ordered]@{relativePath="scripts/$_";sha256=Get-Phase7BSha256 -LiteralPath $path;bytes=[int64](Get-Item -LiteralPath $path).Length}
  })
}

function Read-Phase7BStage5ReceiptTransport {
  [CmdletBinding()] param(
    [Parameter(Mandatory=$true)][string]$LiteralPath,
    [Parameter(Mandatory=$true)][string]$ExpectedSha256,
    [Parameter(Mandatory=$true)][string]$ExpectedNonce,
    [Parameter(Mandatory=$true)][string]$AttemptId,
    [Parameter(Mandatory=$true)][string]$PacketSha256,
    [Parameter(Mandatory=$true)][int64]$PacketBytes
  )
  if($ExpectedSha256 -cnotmatch '^[0-9a-f]{64}$' -or $ExpectedNonce -cnotmatch '^[0-9a-f]{32}$' -or
      (Get-Phase7BSha256 -LiteralPath $LiteralPath) -cne $ExpectedSha256){throw 'PHASE7B_WP2_STAGE5_RECEIPT_TRANSPORT_HASH_FAIL'}
  $length=[int64](Get-Item -LiteralPath $LiteralPath).Length
  if($length -lt 1 -or $length -gt 65536){throw 'PHASE7B_WP2_STAGE5_RECEIPT_TRANSPORT_SIZE_FAIL'}
  $receipt=Get-Content -LiteralPath $LiteralPath -Raw|ConvertFrom-Json -ErrorAction Stop
  if([string]$receipt.evidenceNonce -cne $ExpectedNonce -or
      [string]$receipt.evidenceFileName -cne "$AttemptId-replica-receipt-$ExpectedNonce.json" -or
      -not (Test-Phase7BBoundedReplicaReceipt -Receipt $receipt -ExpectedAttemptId $AttemptId -ExpectedPacketSha256 $PacketSha256 -ExpectedPacketBytes $PacketBytes).pass -or
      (Get-Phase7BSha256 -Text (ConvertTo-Phase7BCanonicalJson $receipt)) -cne $ExpectedSha256){
    throw 'PHASE7B_WP2_STAGE5_RECEIPT_TRANSPORT_BINDING_FAIL'
  }
  [pscustomobject]@{receipt=$receipt;bytes=$length;sha256=$ExpectedSha256;nonce=$ExpectedNonce;mutationPerformed=$false}
}

function New-Phase7BStage5ContinuationBindingDocument {
  # Pure construction from independently validated inputs. Not execution authority; no persistence.
  [CmdletBinding()] param(
    [Parameter(Mandatory=$true)][hashtable]$CaptureInputs,
    [Parameter(Mandatory=$true)][string]$PacketPath,
    [Parameter(Mandatory=$true)][string]$ReceiptTransportPath,
    [Parameter(Mandatory=$true)][string]$ExpectedReceiptSha256,
    [Parameter(Mandatory=$true)][string]$ExpectedReceiptNonce,
    [Parameter(Mandatory=$true)][string]$FinalizationToolingCommit
  )
  if($FinalizationToolingCommit -cnotmatch '^[0-9a-f]{40}$'){throw 'PHASE7B_WP2_STAGE5_FINALIZATION_COMMIT_FAIL'}
  $validated=Assert-Phase7BWorkPackage2PendingFinalizationInput @CaptureInputs
  $p=$validated.pending;$a=$validated.authorization
  $eligibility=Get-Phase7BWorkPackage2CaptureAuthorizationEligibility -LiteralPath $CaptureInputs.CaptureAuthorizationPath `
    -ExpectedAttemptId $CaptureInputs.AttemptId -ExpectedToolingCommit $CaptureInputs.ExpectedToolingCommit
  if(-not $eligibility.eligible -or [DateTime]::UtcNow -lt [DateTime]::Parse([string]$a.issuedAt).ToUniversalTime()){
    throw 'PHASE7B_WP2_STAGE5_ORIGINAL_AUTHORIZATION_NOT_ELIGIBLE'
  }
  $packet=Test-Phase7BEncryptedPacket -LiteralPath $PacketPath -ExpectedSha256 ([string]$p.packetSha256)
  if(-not $packet.pass -or $packet.packetBytes -ne [int64]$p.packetBytes -or
      (Split-Path -Leaf $PacketPath) -cne [string]$p.packetFileName){throw 'PHASE7B_WP2_STAGE5_PACKET_FAIL'}
  $receipt=Read-Phase7BStage5ReceiptTransport -LiteralPath $ReceiptTransportPath -ExpectedSha256 $ExpectedReceiptSha256 `
    -ExpectedNonce $ExpectedReceiptNonce -AttemptId $CaptureInputs.AttemptId -PacketSha256 $p.packetSha256 -PacketBytes $p.packetBytes
  $inv=Assert-Phase7BWorkPackage2InvocationContract -LiteralPath $CaptureInputs.InvocationContractPath `
    -ExpectedSha256 $CaptureInputs.ExpectedInvocationContractSha256 -ExpectedAttemptId $CaptureInputs.AttemptId
  $captureIdentities=@{}
  foreach($stage in @(3,4)){
    $found=@($inv.artifacts|Where-Object{$_.relativePath -ceq "scripts/phase7bRunWorkPackage2Stage$stage.ps1"})
    if($found.Count -ne 1 -or [string]$found[0].sha256 -cnotmatch '^[0-9a-f]{64}$' -or [int64]$found[0].bytes -lt 1){throw 'PHASE7B_WP2_STAGE5_CAPTURE_ARTIFACT_FAIL'}
    $captureIdentities["stage$stage"]=[ordered]@{sha256=[string]$found[0].sha256;bytes=[int64]$found[0].bytes}
  }
  $artifacts=@(Get-Phase7BStage5FinalizationArtifacts)
  [ordered]@{
    schemaVersion=1;classification='PHASE7B_WP2B_STAGE5_CONTINUATION_BINDING';attemptId=$CaptureInputs.AttemptId
    executionAuthorized=$false;founderExecutionAuthorizationRequired=$true;stage5Only=$true;automaticRetryAllowed=$false;wp2cAuthorized=$false
    capture=[ordered]@{
      toolingCommit=[string]$a.toolingCommit;invocationContractSha256=$CaptureInputs.ExpectedInvocationContractSha256
      stage3=$captureIdentities.stage3;stage4=$captureIdentities.stage4
      authorizationId=[string]$a.authorizationId;authorizationSha256=$CaptureInputs.ExpectedCaptureAuthorizationSha256
      authorizationPathSha256=Get-Phase7BSha256 -Text ([IO.Path]::GetFullPath($CaptureInputs.CaptureAuthorizationPath).ToLowerInvariant())
      authorizationIssuedAt=[string]$a.issuedAt;authorizationExpiresAt=[string]$a.expiresAt
      pendingDescriptorSha256=$CaptureInputs.ExpectedPendingDescriptorSha256
      packetSha256=[string]$p.packetSha256;packetBytes=[int64]$p.packetBytes
      plaintextZipSha256=[string]$p.plaintextZipSha256;plaintextZipBytes=[int64]$p.plaintextZipBytes
      decryptedStreamSha256=[string]$p.decryptedStreamSha256;decryptedStreamBytes=[int64]$p.decryptedStreamBytes;decryptRoundTripPass=$true
      ageEncryptionMode=[string]$p.ageEncryptionMode;ageRecipient=[string]$p.ageRecipient
      ageExeSha256=[string]$p.ageExeSha256;ageKeygenSha256=[string]$p.ageKeygenSha256
      sourceInventorySha256=[string]$p.sourceInventorySha256;capturePlanSha256=[string]$p.capturePlanSha256
      quiescenceEvidenceSha256=[string]$a.quiescenceEvidenceSha256;quiescenceToolingCommit=[string]$a.quiescenceEvidenceToolingCommit
    }
    finalization=[ordered]@{toolingCommit=$FinalizationToolingCommit;artifacts=$artifacts}
    receipt=[ordered]@{nonce=$receipt.nonce;sha256=$receipt.sha256;bytes=$receipt.bytes;fileName=[string]$receipt.receipt.evidenceFileName}
  }
}

function Assert-Phase7BStage5ContinuationBinding {
  [CmdletBinding()] param(
    [Parameter(Mandatory=$true)][string]$LiteralPath,
    [Parameter(Mandatory=$true)][string]$ExpectedSha256,
    [Parameter(Mandatory=$true)][hashtable]$CaptureInputs,
    [Parameter(Mandatory=$true)][string]$PacketPath,
    [Parameter(Mandatory=$true)][string]$ReceiptTransportPath,
    [Parameter(Mandatory=$true)][string]$ExpectedReceiptSha256,
    [Parameter(Mandatory=$true)][string]$ExpectedReceiptNonce,
    [Parameter(Mandatory=$true)][string]$FinalizationToolingCommit
  )
  if($ExpectedSha256 -cnotmatch '^[0-9a-f]{64}$' -or (Get-Phase7BSha256 -LiteralPath $LiteralPath) -cne $ExpectedSha256){throw 'PHASE7B_WP2_STAGE5_CONTINUATION_HASH_FAIL'}
  $actual=Get-Content -LiteralPath $LiteralPath -Raw|ConvertFrom-Json -ErrorAction Stop
  $expected=New-Phase7BStage5ContinuationBindingDocument -CaptureInputs $CaptureInputs -PacketPath $PacketPath `
    -ReceiptTransportPath $ReceiptTransportPath -ExpectedReceiptSha256 $ExpectedReceiptSha256 -ExpectedReceiptNonce $ExpectedReceiptNonce `
    -FinalizationToolingCommit $FinalizationToolingCommit
  if((ConvertTo-Phase7BCanonicalJson $actual) -cne (ConvertTo-Phase7BCanonicalJson $expected)){throw 'PHASE7B_WP2_STAGE5_CONTINUATION_BINDING_FAIL'}
  $actual
}

function Assert-Phase7BStage5ClosureStartState {
  [CmdletBinding()] param([Parameter(Mandatory=$true)][string]$PacketPath,[Parameter(Mandatory=$true)][string]$PendingDescriptorPath)
  $root=Split-Path -Parent ([IO.Path]::GetFullPath($PacketPath))
  if($root -cne (Split-Path -Parent ([IO.Path]::GetFullPath($PendingDescriptorPath)))){throw 'PHASE7B_WP2B_STAGE5_CONTINUATION_ROOT_FAIL'}
  $children=@(Get-ChildItem -LiteralPath $root -Force -ErrorAction Stop)
  $expected=@((Split-Path -Leaf $PacketPath),(Split-Path -Leaf $PendingDescriptorPath))
  if($children.Count -ne 2 -or @(Compare-Object $expected @($children.Name) -CaseSensitive).Count -ne 0 -or
      @($children|Where-Object{$_.PSIsContainer -or ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0}).Count -ne 0 -or
      ((Get-Item -LiteralPath $root).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'PHASE7B_WP2B_STAGE5_CONTINUATION_RESIDUE_STOP'}
}

Export-ModuleMember -Function @('Get-Phase7BStage5FinalizationArtifacts','Read-Phase7BStage5ReceiptTransport',
  'New-Phase7BStage5ContinuationBindingDocument','Assert-Phase7BStage5ContinuationBinding','Assert-Phase7BStage5ClosureStartState')
