[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$ControlRoot,[Parameter(Mandatory=$true)][string]$RecoveryRoot,[Parameter(Mandatory=$true)][string]$InvocationSha256,[Parameter(Mandatory=$true)][string]$AuthorizationSha256,[Parameter(Mandatory=$true)][string]$HostClaimSha256,[Parameter(Mandatory=$true)][ValidatePattern('^[0-9a-f]{64}$')][string]$HostBootPermitSha256,[Parameter(Mandatory=$true)][switch]$FounderOneShotExecutionGo,[Parameter(Mandatory=$true)][switch]$FounderRealIdentityUseApproved)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bIsolatedGuestContract.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2Contract.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWindowsAgeIdentityBridge.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CContract.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CGuest.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CHost.psm1')
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CMedia.psm1')
$stage='execution-preflight';$claim=$null;$secret=$null;$zip=$null;$zipOwned=$false
try {
  Assert-Phase7BWP2C ($FounderOneShotExecutionGo.IsPresent -and $FounderRealIdentityUseApproved.IsPresent) 'FOUNDER_EXECUTION_GO_REQUIRED'
  Assert-Phase7BWP2C ($PSVersionTable.PSEdition -ceq 'Desktop' -and $PSVersionTable.PSVersion.Major -eq 5 -and $PSVersionTable.PSVersion.Minor -eq 1 -and $Host.Name -ceq 'ConsoleHost' -and [Threading.Thread]::CurrentThread.ApartmentState -eq 'STA' -and -not [Console]::IsInputRedirected) 'INTERACTIVE_PS51_REQUIRED'
  $principal=New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  Assert-Phase7BWP2C ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) 'ADMIN_REQUIRED'
  $computer=Get-CimInstance Win32_ComputerSystem -ErrorAction Stop
  Assert-Phase7BWP2C ($computer.Manufacturer -ceq 'VMware, Inc.' -and $computer.Model -match '^VMware') 'WRONG_MACHINE'
  foreach($source in @(@{root=$ControlRoot;label='P7B_C_CONTROL'},@{root=$RecoveryRoot;label='P7B_C_RESTORE'})) {
    Assert-Phase7BWP2C ($source.root -cmatch '^[A-Z]:\\$') 'OPTICAL_ROOT_REQUIRED'
    $volumes=@(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=5' -ErrorAction Stop | Where-Object {$_.DeviceID -ceq $source.root.Substring(0,2) -and $_.VolumeName -ceq $source.label})
    Assert-Phase7BWP2C ($volumes.Count -eq 1) 'OPTICAL_VOLUME_IDENTITY'
  }
  Assert-Phase7BWP2CExactFileSet $ControlRoot @('invocation.json','authorization.json','host-claim.json','preparation.json','identity-entry-validation.json')
  $c=Read-Phase7BWP2CBoundJson (Join-Path $ControlRoot 'invocation.json') $InvocationSha256
  $a=Read-Phase7BWP2CBoundJson (Join-Path $ControlRoot 'authorization.json') $AuthorizationSha256
  Assert-Phase7BWP2CAuthorization $a $c $InvocationSha256
  $b=$c.bindings
  $hostClaim=Read-Phase7BWP2CBoundJson (Join-Path $ControlRoot 'host-claim.json') $HostClaimSha256
  Assert-Phase7BWP2CClaim $hostClaim $a $AuthorizationSha256 'host'
  $preparation=Read-Phase7BWP2CBoundJson (Join-Path $ControlRoot 'preparation.json') $b.preparationEvidenceSha256
  Assert-Phase7BWP2CPreparation $preparation $b
  $entry=Read-Phase7BWP2CBoundJson (Join-Path $ControlRoot 'identity-entry-validation.json') $b.identityEntryValidationSha256
  Assert-Phase7BWP2CEntryValidation $entry $b
  $packetName=$b.attemptId+'.zip.age'
  Assert-Phase7BWP2CExactFileSet $RecoveryRoot @($packetName,'final-descriptor.json','wp2c-media.json')
  $media=Read-Phase7BWP2CBoundJson (Join-Path $RecoveryRoot 'wp2c-media.json') $b.mediaDescriptor.sha256
  Assert-Phase7BWP2CFile (Join-Path $RecoveryRoot 'wp2c-media.json') $b.mediaDescriptor
  Assert-Phase7BWP2C ($media.kind -ceq 'wp2c-recovery-media' -and $media.executionAuthorityIncluded -ceq $false -and $media.attemptId -ceq $b.attemptId -and $media.ageRecipient -ceq $b.ageRecipient) 'RECOVERY_MEDIA_BINDING'
  Assert-Phase7BWP2C ((Get-Phase7BWP2CObjectHash $media.packet) -ceq (Get-Phase7BWP2CObjectHash $b.packet) -and (Get-Phase7BWP2CObjectHash $media.finalDescriptor) -ceq (Get-Phase7BWP2CObjectHash $b.finalDescriptor)) 'MEDIA_CONTENT_BINDING'
  $descriptorPath=Join-Path $RecoveryRoot 'final-descriptor.json';$packetPath=Join-Path $RecoveryRoot $packetName
  Assert-Phase7BWP2CFile $descriptorPath $b.finalDescriptor
  Assert-Phase7BWP2CFile $packetPath $b.packet
  $descriptor=Read-Phase7BWP2CBoundJson $descriptorPath $b.finalDescriptor.sha256
  Assert-Phase7BWP2C (Test-Phase7BWorkPackage2FinalizationProvenance $descriptor).pass 'FINAL_DESCRIPTOR_PROVENANCE'
  Assert-Phase7BWP2C ($descriptor.attemptId -ceq $b.attemptId -and $descriptor.applicationCommit -ceq $b.applicationCommit -and $descriptor.ageRecipient -ceq $b.ageRecipient -and $descriptor.ageEncryptionMode -ceq $b.ageEncryptionMode -and $descriptor.decryptRoundTripPass -ceq $true -and $descriptor.plaintextZipSha256 -ceq $b.plaintextZip.sha256 -and $descriptor.plaintextZipBytes -eq $b.plaintextZip.bytes) 'FINAL_DESCRIPTOR_BINDING'
  Assert-Phase7BWP2C ($descriptor.classification -ceq 'PHASE7B_WP2_ENCRYPTED_PACKET_AND_REPLICA_PASS' -and $descriptor.packetSha256 -ceq $b.packet.sha256 -and $descriptor.packetBytes -eq $b.packet.bytes -and $descriptor.decryptedStreamSha256 -ceq $b.plaintextZip.sha256 -and $descriptor.decryptedStreamBytes -eq $b.plaintextZip.bytes) 'FINAL_DESCRIPTOR_PACKET_BINDING'
  Assert-Phase7BWP2C (Test-Phase7BEncryptedPacket $packetPath $b.packet.sha256).pass 'PACKET_HEADER'
  Assert-Phase7BWP2C ((Get-Phase7BWP2CExecutionState $b.stateRoot $a.authorizationId) -ceq 'UNCLAIMED') 'EXECUTION_REPLAY'
  [void](Assert-Phase7BWP2CGuestPreMutation $c)
  $secret=Request-Phase7BVerifiedAgeIdentity -AgeKeygenPath (Join-Path $b.toolingRoot 'age-keygen.exe') -ExpectedAgeRecipient $b.ageRecipient -GuestEntry
  # Identity/UI failure leaves all guest restore paths untouched. Host claim is NEVER released.
  [void](Assert-Phase7BWP2CGuestPreMutation $c)
  Assert-Phase7BWP2CAuthorization $a $c $InvocationSha256
  $stage='claimed'
  $claim=New-Phase7BWP2CExecutionClaim $b.stateRoot $a $AuthorizationSha256 'guest' $HostClaimSha256
  $stage='staged'
  $staged=Join-Path $b.incomingRoot $packetName
  [IO.File]::Copy($packetPath,$staged,$false)
  Assert-Phase7BWP2CFile $staged $b.packet
  $zip=Join-Path $b.restoreRoot ('.decrypted-'+$b.attemptId+'.zip')
  Assert-Phase7BWP2C (-not (Test-Path -LiteralPath $zip)) 'RESTORE_COLLISION'
  $stage='decrypt';$zipOwned=$true
  [void](Invoke-Phase7BAgeNativeIdentityDecryptionToFile -AgeExePath (Join-Path $b.toolingRoot 'age.exe') -CiphertextPath $staged -OutputPath $zip -Identity $secret.identity)
  $secret.identity.Dispose();$secret=$null
  $stage='zip'
  Assert-Phase7BWP2CFile $zip $b.plaintextZip
  [void](Assert-Phase7BWP2CZipBounds $zip $b.maximumExpandedBytes)
  $stage='extract';$restored=Join-Path $b.restoreRoot 'packet'
  [void](Expand-Phase7BSafePacketZip -LiteralPath $zip -DestinationRoot $restored)
  $stage='verify';$verified=Test-Phase7BWP2CRestoredPacket $restored $b.attemptId
  $post=Assert-Phase7BWP2CGuestPreMutation $c -AfterRestore
  [void](Assert-Phase7BWP2CLocalPath $zip $b.restoreRoot)
  Remove-Item -LiteralPath $zip -Force -ErrorAction Stop
  Assert-Phase7BWP2C (-not (Test-Path -LiteralPath $zip)) 'ZIP_CLEANUP_FAIL';$zipOwned=$false
  $evidence=New-Phase7BWP2CPassEvidence $a $AuthorizationSha256 $HostClaimSha256 $HostBootPermitSha256 $claim.identity.sha256 $verified
  Assert-Phase7BWP2CPassEvidence $evidence $a $AuthorizationSha256 $HostClaimSha256
  $stage='evidence-written'
  Assert-Phase7BWP2CAuthorization $a $c $InvocationSha256
  $evidencePath=Join-Path $b.stateRoot ($a.authorizationId+'.evidence.json')
  $evidenceIdentity=Write-Phase7BWP2CCreateNewJson $evidencePath $evidence
  $completion=Complete-Phase7BWP2CExecution $b.stateRoot $a $claim.identity.sha256 $evidenceIdentity.sha256
  $stage='completed'
  $completionDocument=Read-Phase7BWP2CBoundJson (Join-Path $b.stateRoot ($a.authorizationId+'.complete.json')) $completion.sha256
  # Complete nonsecret return data permits checksum-verified console transport;
  # no guest network/clipboard/share needs to be enabled to return these records.
  [ordered]@{classification=$evidence.classification;pass=$true;evidencePath=$evidencePath;evidenceSha256=$evidenceIdentity.sha256;completionSha256=$completion.sha256;evidence=$evidence;completion=$completionDocument;hostCloseoutComplete=$false;automaticRetryAllowed=$false;wp2cAuthorized=$false}|ConvertTo-Json -Depth 20
} catch {
  $safeCode=if($_.Exception.Message -cmatch '^PHASE7B_[A-Z0-9_]+$'){$_.Exception.Message}else{'PHASE7B_WP2C_EXCEPTION'}
  [ordered]@{classification='PHASE7B_WP2C_RESTORE_FAIL';pass=$false;safeStage=$stage;safeErrorCode=$safeCode;guestClaimCreated=($null -ne $claim);hostClaimRequiredBySupportedPath=$true;recovery=Get-Phase7BWP2CRecoveryDecision $stage -HostClaimExists;automaticRetryAllowed=$false;wp2cAuthorized=$false}|ConvertTo-Json -Depth 5
  throw $safeCode
} finally {
  if($null -ne $secret){$secret.identity.Dispose()}
  # Only this invocation's exact temporary ZIP is removable here; all claims and ambiguous restore evidence remain.
  if($zipOwned -and $zip -and (Test-Path -LiteralPath $zip)) {
    [void](Assert-Phase7BWP2CLocalPath $zip $b.restoreRoot)
    Remove-Item -LiteralPath $zip -Force -ErrorAction Stop
  }
}
