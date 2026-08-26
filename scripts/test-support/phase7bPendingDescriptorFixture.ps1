# Synthetic test support only. Evaluate the actual producer's descriptor expression, never
# its capture body. This prevents fixtures from adding fields the producer does not emit.
function New-Phase7BSyntheticPacketManifest {
  param($Authorization,[object[]]$Files,$ReferenceResult,[string]$ReferencePath)
  $tokens=$null;$errors=$null
  $ast=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot '..\phase7bPrepareWorkPackage2EncryptedPacket.ps1'),[ref]$tokens,[ref]$errors)
  $assignments=@($ast.FindAll({param($n)$n -is [Management.Automation.Language.AssignmentStatementAst] -and $n.Left.Extent.Text -ceq '$packetManifest'},$true))
  if(@($errors).Count -ne 0 -or $assignments.Count -ne 1){throw 'SYNTHETIC_MANIFEST_PRODUCER_SHAPE'}
  $rhs=$assignments[0].Right
  if(@($rhs.FindAll({param($n)$n -is [Management.Automation.Language.CommandAst] -or ($n -is [Management.Automation.Language.InvokeMemberExpressionAst] -and $n.Member.Value -cne 'ToLowerInvariant')},$true)).Count -ne 0){throw 'SYNTHETIC_MANIFEST_NOT_PURE'}
  $contract=Get-Phase7BWorkPackage2Contract;$AttemptId=$Authorization.attemptId
  [int64]$total=0;foreach($file in $Files){$total+=[int64]$file.bytes}
  $inventory=[pscustomobject]@{inventorySha256=$Authorization.sourceInventorySha256;fileCount=$Files.Count;totalBytes=$total}
  $publicFiles=$Files;$sourceRootSha256=$Authorization.sourceRootSha256;$ExpectedCapturePlanSha256=$Authorization.capturePlanSha256
  $ExpectedInvocationContractSha256=$Authorization.invocationContractSha256;$ExpectedStage3LauncherSha256=$Authorization.stage3LauncherSha256
  $AgeRecipient=$Authorization.ageRecipient;$ExpectedAuthorizationSha256='a'*64;$toolingCommit=$Authorization.toolingCommit
  $localOutputRootSha256=$Authorization.localOutputRootSha256;$replicaRootSha256=$Authorization.replicaRootSha256
  $referenceFileSha256=Get-Phase7BSha256 -LiteralPath $ReferencePath;$referenceFileBytes=[int64](Get-Item -LiteralPath $ReferencePath).Length
  [pscustomobject](& ([scriptblock]::Create($rhs.Extent.Text)))
}

function New-Phase7BSyntheticPendingDescriptor {
  param([Parameter(Mandatory = $true)]$Authorization,
    [Parameter(Mandatory = $true)][string]$PacketSha256,
    [Parameter(Mandatory = $true)][int64]$PacketBytes)
  $tokens=$null;$errors=$null
  $producerPath=Join-Path $PSScriptRoot '..\phase7bPrepareWorkPackage2EncryptedPacket.ps1'
  $ast=[Management.Automation.Language.Parser]::ParseFile($producerPath,[ref]$tokens,[ref]$errors)
  if (@($errors).Count -ne 0) { throw 'SYNTHETIC_PRODUCER_PARSE_FAIL' }
  $assignments=@($ast.FindAll({param($n) $n -is [Management.Automation.Language.AssignmentStatementAst] -and
    $n.Left.Extent.Text -ceq '$descriptor' -and $n.Right.Extent.Text.Contains('PHASE7B_WP2_ENCRYPTED_PACKET_REPLICA_COPY_PENDING_INDEPENDENT_READBACK')},$true))
  if ($assignments.Count -ne 1) { throw 'SYNTHETIC_PRODUCER_EXPRESSION_CARDINALITY_FAIL' }
  $rhs=$assignments[0].Right
  if (@($rhs.FindAll({param($n) ($n -is [Management.Automation.Language.CommandAst] -and $n.GetCommandName() -cne 'Split-Path') -or
      ($n -is [Management.Automation.Language.InvokeMemberExpressionAst] -and $n.Member.Value -cne 'ToLowerInvariant')},$true)).Count -ne 0) {
    throw 'SYNTHETIC_PRODUCER_EXPRESSION_NOT_PURE'
  }
  $contract=Get-Phase7BWorkPackage2Contract
  $AttemptId=[string]$Authorization.attemptId
  $ExpectedInvocationContractSha256=[string]$Authorization.invocationContractSha256
  $ExpectedStage3LauncherSha256=[string]$Authorization.stage3LauncherSha256
  $inventory=[pscustomobject]@{inventorySha256=[string]$Authorization.sourceInventorySha256}
  $sourceRootSha256=[string]$Authorization.sourceRootSha256
  $ExpectedCapturePlanSha256=[string]$Authorization.capturePlanSha256
  $localOutputRootSha256=[string]$Authorization.localOutputRootSha256
  $replicaRootSha256=[string]$Authorization.replicaRootSha256
  $localPacketPath="$AttemptId.zip.age"
  $packetSha=$PacketSha256
  $packet=[pscustomobject]@{packetBytes=$PacketBytes}
  $zipIdentity=[pscustomobject]@{sha256=('f'*64);bytes=[int64]2048}
  $roundTrip=[pscustomobject]@{decryptedStreamSha256=$zipIdentity.sha256;decryptedStreamBytes=$zipIdentity.bytes}
  $AgeRecipient=[string]$Authorization.ageRecipient
  $ExpectedAgeExeSha256=[string]$Authorization.ageExeSha256
  $ExpectedAgeKeygenSha256=[string]$Authorization.ageKeygenSha256
  $ageVersion=[pscustomobject]@{normalizedVersion='1.3.1'}
  $ageKeygenVersion=[pscustomobject]@{normalizedVersion='1.3.1'}
  $referenceResult=[pscustomobject]@{referenceIndexSha256=('d'*64)}
  $referenceFileSha256='e'*64
  [pscustomobject](& ([scriptblock]::Create($rhs.Extent.Text)))
}
