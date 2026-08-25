[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$AttemptId,
  [Parameter(Mandatory = $true)][string]$InvocationContractPath,
  [Parameter(Mandatory = $true)][string]$ExpectedInvocationContractSha256,
  [Parameter(Mandatory = $true)][string]$ExpectedPacketSha256,
  [Parameter(Mandatory = $true)][int64]$ExpectedPacketBytes
)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bIsolatedGuestContract.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2Contract.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2Orchestration.psm1') -Force
$invocation=Assert-Phase7BWorkPackage2InvocationContract -LiteralPath $InvocationContractPath -ExpectedSha256 $ExpectedInvocationContractSha256 -ExpectedAttemptId $AttemptId
$self=@($invocation.artifacts|Where-Object{$_.relativePath -ceq 'scripts/phase7bRunWorkPackage2Stage4.ps1'})
if ($self.Count -ne 1 -or (Get-Phase7BSha256 -LiteralPath $PSCommandPath) -cne [string]$self[0].sha256 -or
    $ExpectedPacketSha256 -cnotmatch '^[0-9a-f]{64}$' -or $ExpectedPacketBytes -lt 1) { throw 'PHASE7B_WP2B_STAGE4_INPUT_OR_SELF_IDENTITY_FAIL' }
$needed=@('phase7bVerifyAndCloseBoundedReplicaReceiver.ps1','phase7bBoundedReplicaTransport.psm1','phase7bWorkPackage2Contract.psm1','phase7bIsolatedGuestContract.psm1','phase7bSecondComputerReplicaContract.psm1')
$toolRoot=Join-Path $env:TEMP "phase7b-wp2b-stage4-$(([string]$invocation.toolingCommit).Substring(0,8))-$($AttemptId.Substring($AttemptId.Length-8))"
if (Test-Path -LiteralPath $toolRoot) { throw 'PHASE7B_WP2B_STAGE4_TOOL_ROOT_COLLISION' }
try {
  [void](New-Item -ItemType Directory -Path $toolRoot -ErrorAction Stop)
  [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
  foreach($name in $needed){
    $identity=@($invocation.artifacts|Where-Object{$_.relativePath -ceq "scripts/$name"})
    if($identity.Count -ne 1){throw 'PHASE7B_WP2B_STAGE4_DEPENDENCY_IDENTITY_FAIL'}
    $destination=Join-Path $toolRoot $name
    Invoke-WebRequest -UseBasicParsing -Uri "https://raw.githubusercontent.com/dustinginn/physiqueos/$([string]$invocation.toolingCommit)/scripts/$name" -OutFile $destination -ErrorAction Stop
    if((Get-Phase7BSha256 -LiteralPath $destination) -cne [string]$identity[0].sha256){throw 'PHASE7B_WP2B_STAGE4_DEPENDENCY_HASH_FAIL'}
  }
  $nonce=[guid]::NewGuid().ToString('N')
  $evidencePath="D:\Phase7B\wp2-replica\$AttemptId\$AttemptId-replica-receipt-$nonce.json"
  $lines=@(& (Join-Path $toolRoot 'phase7bVerifyAndCloseBoundedReplicaReceiver.ps1') -AttemptId $AttemptId `
    -ExpectedPacketSha256 $ExpectedPacketSha256 -ExpectedPacketBytes $ExpectedPacketBytes -EvidenceNonce $nonce `
    -EvidenceOutputPath $evidencePath -AuthorizationAcknowledgement 'WP2B_CAPTURE_VERIFY_REPLICA_AND_TEARDOWN_EXACTLY_ONCE' 2>&1)
  $exitCode=$LASTEXITCODE;$text=$lines -join [Environment]::NewLine;$result=$text|ConvertFrom-Json -ErrorAction Stop
  if($exitCode -ne 0 -or -not [bool]$result.pass -or [string]$result.classification -cne 'PHASE7B_WP2_BOUNDED_REPLICA_INDEPENDENT_READBACK_PASS'){Write-Host $text;throw 'PHASE7B_WP2B_STAGE4_VERIFY_STOP'}
  [ordered]@{classification='PHASE7B_WP2B_LAPTOP_READBACK_RECEIPT_TEARDOWN_PASS';pass=$true;attemptId=$AttemptId;packetSha256=$ExpectedPacketSha256;packetBytes=$ExpectedPacketBytes;evidenceNonce=$nonce;evidenceSha256=[string]$result.evidenceSha256;evidenceTransportBase64=[string]$result.evidenceTransportBase64;receiverTornDown=$true;automaticRetryAllowed=$false;wp2cAuthorized=$false}|ConvertTo-Json -Depth 4
} finally {
  if(Test-Path -LiteralPath $toolRoot -PathType Container){Remove-Item -LiteralPath $toolRoot -Recurse -Force -ErrorAction SilentlyContinue}
}
