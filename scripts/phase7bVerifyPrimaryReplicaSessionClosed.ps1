[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$AttemptId,
  [Parameter(Mandatory = $true)][string]$ReceiverUncRoot,
  [Parameter(Mandatory = $true)][string]$EvidenceNonce,
  [Parameter(Mandatory = $true)][string]$EvidenceOutputPath
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bBoundedReplicaTransport.psm1') -Force
$stage = 'validate-input'
try {
  if ($AttemptId -notmatch '^phase7b-wp2-[0-9a-f]{32}$' -or $EvidenceNonce -notmatch '^[0-9a-f]{32}$' -or $ReceiverUncRoot -notmatch '^\\\\(?<server>[^\\]+)\\(?<share>[^\\]+)$') { throw 'PHASE7B_WP2_PRIMARY_REPLICA_SESSION_ARGUMENT_FAIL' }
  $server = [string]$Matches.server; $share = [string]$Matches.share
  $expectedShare = "P7B$($AttemptId.Substring($AttemptId.Length - 8))`$"
  if ($server -ne 'LAPTOP-4G5UOU2R' -or $share -ne $expectedShare) { throw 'PHASE7B_WP2_PRIMARY_REPLICA_SESSION_IDENTITY_FAIL' }
  $expectedEvidenceName = "$AttemptId-primary-teardown-$EvidenceNonce.json"
  if ((Split-Path -Leaf $EvidenceOutputPath) -cne $expectedEvidenceName -or (Test-Path -LiteralPath $EvidenceOutputPath)) { throw 'PHASE7B_WP2_PRIMARY_REPLICA_EVIDENCE_PATH_REJECTED' }
  $stage = 'inspect-session-residue'
  $psDrives = @(Get-PSDrive -PSProvider FileSystem | Where-Object { [string]$_.Root -like "\\$server\$share*" })
  $mappings = @(Get-SmbMapping -ErrorAction SilentlyContinue | Where-Object { [string]$_.RemotePath -like "\\$server\$share*" })
  $priorPreference = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  try { $cmdkeyOutput = @(& "$env:SystemRoot\System32\cmdkey.exe" /list 2>&1) -join "`n"; $cmdkeyExit = $LASTEXITCODE } finally { $ErrorActionPreference = $priorPreference }
  if ($cmdkeyExit -ne 0) { throw 'PHASE7B_WP2_PRIMARY_REPLICA_CREDENTIAL_ENUMERATION_FAIL' }
  $credentialTargets = @($cmdkeyOutput -split "`r?`n" | Where-Object { $_ -match '(?i)^\s*Target:' -and $_ -match [regex]::Escape($server) })
  $evidence = [pscustomobject][ordered]@{ schemaVersion = 1; classification = 'PHASE7B_WP2_PRIMARY_REPLICA_SESSION_TEARDOWN_PASS'; pass = $true; attemptId = $AttemptId; evidenceNonce = $EvidenceNonce; observedAt = [DateTime]::UtcNow.ToString('o'); evidenceFileName = $expectedEvidenceName; serverName = $server; shareName = $share; matchingPsDriveCount = $psDrives.Count; matchingSmbMappingCount = $mappings.Count; savedCredentialTargetCount = $credentialTargets.Count; mappingPersistent = $false; credentialsPersisted = $false; sessionTornDown = ($psDrives.Count -eq 0 -and $mappings.Count -eq 0 -and $credentialTargets.Count -eq 0); mutationPerformed = $false; reportPersisted = $true; automaticRetryAllowed = $false }
  if (-not (Test-Phase7BPrimaryReplicaSessionTeardownEvidence -Evidence $evidence -ExpectedAttemptId $AttemptId -ExpectedServerName $server -ExpectedShareName $share).pass) { throw 'PHASE7B_WP2_PRIMARY_REPLICA_SESSION_RESIDUE_FAIL' }
  $persisted = Write-Phase7BSafeEvidenceFile -LiteralPath $EvidenceOutputPath -Evidence $evidence
  $global:LASTEXITCODE = 0
  [ordered]@{ classification = $evidence.classification; pass = $true; attemptId = $AttemptId; evidenceNonce = $EvidenceNonce; evidenceFileName = $persisted.fileName; evidenceSha256 = $persisted.sha256; matchingPsDriveCount = 0; matchingSmbMappingCount = 0; savedCredentialTargetCount = 0; sessionTornDown = $true; reportPersisted = $true; automaticRetryAllowed = $false } | ConvertTo-Json -Depth 4
} catch {
  $safeCode = if ($_.Exception.Message -match '^PHASE7B_') { $_.Exception.Message } else { 'PHASE7B_WP2_PRIMARY_REPLICA_SESSION_EXCEPTION' }
  [ordered]@{ classification = 'PHASE7B_WP2_PRIMARY_REPLICA_SESSION_TEARDOWN_FAIL'; pass = $false; safeStage = $stage; safeErrorCode = $safeCode; mutationPerformed = $false; reportPersisted = $false; automaticRetryAllowed = $false } | ConvertTo-Json -Depth 4
  $global:LASTEXITCODE = 1
  return
}
