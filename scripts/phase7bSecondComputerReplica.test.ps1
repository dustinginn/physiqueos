$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

Import-Module (Join-Path $PSScriptRoot 'phase7bSecondComputerReplicaContract.psm1') -Force
$script:assertions = 0

function Assert-True([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw "ASSERTION_FAILED:$Message" }
  $script:assertions++
}
function Assert-Throws([scriptblock]$Action, [string]$Pattern, [string]$Message) {
  $threw = $false
  try { & $Action } catch { $threw = $_.Exception.Message -match $Pattern }
  Assert-True $threw $Message
}

$attemptId = 'phase7b-wp2-6cce4f4197ae4651a33ec123825326f9'
$hostSha = 'ea6696e8a0fc4d9242544568d62cd979fd57bd2478fac4f40755b3546776ac3c'
$diskSha = '336d31be1f1e6dd4bde254fae94ffebf2b23829520a26c2f5d9bc5deda169896'
$localRoot = 'D:\Phase7B\replicas\379bb303\wp2b\encrypted-replica'
$uncRoot = '\\LAPTOP-4G5U0U2R\PhysiqueOS-Phase7B-WP2B$\encrypted-replica'
$shareName = 'PhysiqueOS-Phase7B-WP2B$'
$primaryIp = '192.168.1.69'
$attestationSha = 'a' * 64

$contract = Get-Phase7BSecondComputerReplicaContract
Assert-True ($contract.minimumFreeBytes -eq 1GB) 'minimum free-space contract'
Assert-True ($contract.requireEncryption -and $contract.encryptionSuppliesIntegrity) 'SMB encryption and integrity contract'
Assert-True (-not $contract.mappingPersistent -and -not $contract.saveCredentials) 'mapping and credentials are nonpersistent'

$unc = Get-Phase7BSecondComputerReplicaUncIdentity -UncReplicaRoot $uncRoot
Assert-True ($unc.serverName -eq 'LAPTOP-4G5U0U2R' -and $unc.shareName -eq $shareName) 'exact UNC identity parsed'
Assert-Throws { Get-Phase7BSecondComputerReplicaUncIdentity -UncReplicaRoot 'D:\replica' } 'PHASE7B_WP2_REPLICA_UNC_INVALID' 'local path rejected as second-computer UNC'
Assert-Throws { Get-Phase7BSecondComputerReplicaUncIdentity -UncReplicaRoot '\\bad host\share' } 'PHASE7B_WP2_REPLICA_UNC_IDENTITY_INVALID' 'ambiguous server identity rejected'

$same = Test-Phase7BSecondComputerNetworkBinding -PrimaryIpv4 '192.168.1.69' -PrimaryPrefixLength 24 -ReplicaIpv4 '192.168.1.26' -ReplicaPrefixLength 24
$different = Test-Phase7BSecondComputerNetworkBinding -PrimaryIpv4 '192.168.1.69' -PrimaryPrefixLength 24 -ReplicaIpv4 '10.0.0.26' -ReplicaPrefixLength 24
Assert-True $same.pass 'same private subnet accepted'
Assert-True (-not $different.pass) 'current cross-subnet evidence rejected'

$attestation = [pscustomobject][ordered]@{
  schemaVersion = 1
  classification = $contract.attestationClassification
  pass = $true
  attemptId = $attemptId
  computerName = 'LAPTOP-4G5U0U2R'
  hostIdentitySha256 = $hostSha
  diskIdentitySha256 = $diskSha
  localReplicaRoot = $localRoot
  uncReplicaRoot = $uncRoot
  shareName = $shareName
  fileSystem = 'NTFS'
  physicalDiskBusType = 'SATA'
  freeBytes = [int64](900GB)
  physicallyAttached = $true
  rootExists = $true
  rootEmpty = $true
  shareEncryptData = $true
  shareCachingMode = 'None'
  shareFolderEnumerationMode = 'AccessBased'
  replicaAccountIsAdministrator = $false
  firewallProfile = 'Private'
  firewallProtocol = 'TCP'
  firewallLocalPort = 445
  firewallRemoteAddress = $primaryIp
  transportClassification = $contract.transportClassification
  automaticRetryAllowed = $false
}
$accepted = Test-Phase7BSecondComputerReplicaAttestation -Attestation $attestation -ExpectedAttemptId $attemptId -ExpectedComputerName 'LAPTOP-4G5U0U2R' -ExpectedHostIdentitySha256 $hostSha -ExpectedDiskIdentitySha256 $diskSha -ExpectedLocalReplicaRoot $localRoot -ExpectedUncReplicaRoot $uncRoot -ExpectedShareName $shareName -ExpectedPrimaryIpv4 $primaryIp
Assert-True $accepted.pass 'complete exact replica attestation accepted'
$wrongDisk = $attestation.PSObject.Copy()
$wrongDisk.diskIdentitySha256 = 'b' * 64
Assert-True (-not (Test-Phase7BSecondComputerReplicaAttestation -Attestation $wrongDisk -ExpectedAttemptId $attemptId -ExpectedComputerName 'LAPTOP-4G5U0U2R' -ExpectedHostIdentitySha256 $hostSha -ExpectedDiskIdentitySha256 $diskSha -ExpectedLocalReplicaRoot $localRoot -ExpectedUncReplicaRoot $uncRoot -ExpectedShareName $shareName -ExpectedPrimaryIpv4 $primaryIp).pass) 'wrong disk rejected'
$adminAccount = $attestation.PSObject.Copy()
$adminAccount.replicaAccountIsAdministrator = $true
Assert-True (-not (Test-Phase7BSecondComputerReplicaAttestation -Attestation $adminAccount -ExpectedAttemptId $attemptId -ExpectedComputerName 'LAPTOP-4G5U0U2R' -ExpectedHostIdentitySha256 $hostSha -ExpectedDiskIdentitySha256 $diskSha -ExpectedLocalReplicaRoot $localRoot -ExpectedUncReplicaRoot $uncRoot -ExpectedShareName $shareName -ExpectedPrimaryIpv4 $primaryIp).pass) 'administrator replica account rejected'
$unencrypted = $attestation.PSObject.Copy()
$unencrypted.shareEncryptData = $false
Assert-True (-not (Test-Phase7BSecondComputerReplicaAttestation -Attestation $unencrypted -ExpectedAttemptId $attemptId -ExpectedComputerName 'LAPTOP-4G5U0U2R' -ExpectedHostIdentitySha256 $hostSha -ExpectedDiskIdentitySha256 $diskSha -ExpectedLocalReplicaRoot $localRoot -ExpectedUncReplicaRoot $uncRoot -ExpectedShareName $shareName -ExpectedPrimaryIpv4 $primaryIp).pass) 'unencrypted share rejected'
$broadFirewall = $attestation.PSObject.Copy()
$broadFirewall.firewallRemoteAddress = 'LocalSubnet'
Assert-True (-not (Test-Phase7BSecondComputerReplicaAttestation -Attestation $broadFirewall -ExpectedAttemptId $attemptId -ExpectedComputerName 'LAPTOP-4G5U0U2R' -ExpectedHostIdentitySha256 $hostSha -ExpectedDiskIdentitySha256 $diskSha -ExpectedLocalReplicaRoot $localRoot -ExpectedUncReplicaRoot $uncRoot -ExpectedShareName $shareName -ExpectedPrimaryIpv4 $primaryIp).pass) 'broad firewall scope rejected'

$session = [pscustomobject]@{ serverName = 'LAPTOP-4G5U0U2R'; shareName = $shareName; dialect = '3.1.1'; encrypted = $true; signed = $false; credentialed = $true; guest = $false; mappingPersistent = $false; credentialsSaved = $false; writeThrough = $true; remoteAttestationSha256 = $attestationSha }
$sessionResult = Test-Phase7BSecondComputerSmbSessionEvidence -Evidence $session -ExpectedServerName 'LAPTOP-4G5U0U2R' -ExpectedShareName $shareName -ExpectedAttestationSha256 $attestationSha
Assert-True ($sessionResult.pass -and $sessionResult.encryptionSuppliesIntegrity) 'encrypted SMB 3.1.1 session accepted without redundant signing requirement'
$plainSession = $session.PSObject.Copy()
$plainSession.encrypted = $false
Assert-True (-not (Test-Phase7BSecondComputerSmbSessionEvidence -Evidence $plainSession -ExpectedServerName 'LAPTOP-4G5U0U2R' -ExpectedShareName $shareName -ExpectedAttestationSha256 $attestationSha).pass) 'unencrypted SMB session rejected'
$persistentSession = $session.PSObject.Copy()
$persistentSession.mappingPersistent = $true
Assert-True (-not (Test-Phase7BSecondComputerSmbSessionEvidence -Evidence $persistentSession -ExpectedServerName 'LAPTOP-4G5U0U2R' -ExpectedShareName $shareName -ExpectedAttestationSha256 $attestationSha).pass) 'persistent mapping rejected'
$wrongAttestation = $session.PSObject.Copy()
$wrongAttestation.remoteAttestationSha256 = 'b' * 64
Assert-True (-not (Test-Phase7BSecondComputerSmbSessionEvidence -Evidence $wrongAttestation -ExpectedServerName 'LAPTOP-4G5U0U2R' -ExpectedShareName $shareName -ExpectedAttestationSha256 $attestationSha).pass) 'wrong remote attestation rejected'

$tracked = @(
  (Join-Path $PSScriptRoot 'phase7bSecondComputerReplicaContract.psm1'),
  (Join-Path $PSScriptRoot 'phase7bAttestSecondComputerReplica.ps1'),
  (Join-Path $PSScriptRoot 'phase7bConfigureAndAttestSecondComputerReplica.ps1'),
  (Join-Path $PSScriptRoot 'phase7bSecondComputerReplica.test.ps1')
)
foreach ($path in $tracked) {
  $tokens = $null
  $errors = $null
  [void][Management.Automation.Language.Parser]::ParseFile($path, [ref]$tokens, [ref]$errors)
  Assert-True (@($errors).Count -eq 0) "PowerShell 5.1 AST:$(Split-Path -Leaf $path)"
}
$text = @($tracked | ForEach-Object { Get-Content -LiteralPath $_ -Raw }) -join [Environment]::NewLine
$operationalText = @(
  Get-Content -LiteralPath (Join-Path $PSScriptRoot 'phase7bSecondComputerReplicaContract.psm1') -Raw
  Get-Content -LiteralPath (Join-Path $PSScriptRoot 'phase7bAttestSecondComputerReplica.ps1') -Raw
  Get-Content -LiteralPath (Join-Path $PSScriptRoot 'phase7bConfigureAndAttestSecondComputerReplica.ps1') -Raw
) -join [Environment]::NewLine
Assert-True (-not ($text -match '(?i)(?:password|secret)\s*=\s*["''][^"'']{8,}["'']')) 'no credential literal'
Assert-True (-not ($operationalText -match '(?i)Export-Clixml|ConvertFrom-SecureString|SaveCredentials\s*=\s*\$true')) 'no durable credential mechanism'

$configurationText = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'phase7bConfigureAndAttestSecondComputerReplica.ps1') -Raw
Assert-True ($configurationText -match "Read-Host\s+-Prompt\s+[^\r\n]+\s+-AsSecureString") 'password collected only as interactive SecureString'
Assert-True ($configurationText -match "phase7b-wp2b-replica-config-6cce4f4197ae4651a33ec123825326f9") 'exact one-shot authorization identity bound'
Assert-True ($configurationText -match "ExpectedReplicaIpv4\s+-ne\s+'192\.168\.1\.68'" -and $configurationText -match "PrimaryHostIpv4\s+-ne\s+'192\.168\.1\.69'") 'exact same-LAN endpoints bound'
Assert-True ($configurationText -match "ExpectedDiskNumber\s+-ne\s+0" -and $configurationText -match "ExpectedDiskBusType\s+-ne\s+'SATA'" -and $configurationText -match "ExpectedFileSystem\s+-ne\s+'NTFS'") 'exact selected D disk contract bound'
Assert-True ($configurationText -match "Get-LocalUser.+ACCOUNT_ALREADY_EXISTS" -and $configurationText -match "ROOT_ALREADY_EXISTS" -and $configurationText -match "SHARE_ALREADY_EXISTS" -and $configurationText -match "FIREWALL_ALREADY_EXISTS") 'fresh target collision gates present'
Assert-True ($configurationText -match "New-LocalUser" -and $configurationText -match "New-SmbShare" -and $configurationText -match "New-NetFirewallRule") 'only authorized configuration primitives present'
Assert-True ($configurationText -match "S-1-5-18" -and $configurationText -match "S-1-5-32-544" -and $configurationText -match "FileSystemRights\]::Modify") 'exact SYSTEM Administrators replica-account ACL contract present'
Assert-True ($configurationText -match '-EncryptData\s+\$true' -and $configurationText -match '-CachingMode\s+None' -and $configurationText -match '-FolderEnumerationMode\s+AccessBased') 'exact encrypted no-cache access-based share contract present'
Assert-True ($configurationText -match '-Profile\s+Private' -and $configurationText -match '-Protocol\s+TCP' -and $configurationText -match '-LocalPort\s+445' -and $configurationText -match '-RemoteAddress\s+\$PrimaryHostIpv4') 'exact restricted firewall contract present'
Assert-True (-not ($configurationText -match '(?i)New-SmbMapping|New-PSDrive|Copy-Item|Start-BitsTransfer|Invoke-WebRequest|Invoke-RestMethod|System\.Net\.WebClient')) 'no probe mapping copy capture or network execution path'
Assert-True ($configurationText -match 'automaticRetryAllowed\s*=\s*\$false' -and $configurationText -match 'newFounderAuthorizationRequired\s*=\s*\$mutationStarted') 'partial mutation fails closed without retry'

[ordered]@{
  classification = 'PHASE7B_WP2_SECOND_COMPUTER_REPLICA_CONTRACT_TESTS_PASS'
  pass = $true
  assertions = $script:assertions
} | ConvertTo-Json -Compress
