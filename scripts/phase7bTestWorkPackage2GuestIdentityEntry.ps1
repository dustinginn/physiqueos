[CmdletBinding()]
param([Parameter(Mandatory=$true)][ValidateSet('first-field','second-field','wrong-field','guest-focus-loss','host-focus-change','minimize','cancel','interrupt','canary')][string]$Case,[Parameter(Mandatory=$true)][switch]$FounderSyntheticGuestTestApproved)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
Import-Module (Join-Path $PSScriptRoot 'phase7bWindowsAgeIdentityBridge.psm1')
if(-not $FounderSyntheticGuestTestApproved){throw 'PHASE7B_WP2C_SYNTHETIC_TEST_GO_REQUIRED'}
if($PSVersionTable.PSEdition -cne 'Desktop' -or $PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1){throw 'PHASE7B_WP2C_PS51_REQUIRED'}
$computer=Get-CimInstance Win32_ComputerSystem -ErrorAction Stop
if($computer.Manufacturer -cne 'VMware, Inc.' -or $computer.Model -notmatch '^VMware'){throw 'PHASE7B_WP2C_WRONG_MACHINE'}
# Clipboard sequence only: NEVER read or project clipboard content.
if(-not ('Phase7BWP2CClipboardSequence' -as [type])){Add-Type 'using System.Runtime.InteropServices; public static class Phase7BWP2CClipboardSequence { [DllImport("user32.dll")] public static extern uint GetClipboardSequenceNumber(); }'}
$clipboardSequenceBefore=[Phase7BWP2CClipboardSequence]::GetClipboardSequenceNumber()
# Same guest controls, geometry, masking and focus behavior. Only final format
# validation is replaced with fixed invalid-synthetic-value comparison.
$observation=Show-Phase7BGuestSyntheticIdentityObservation
[ordered]@{classification='PHASE7B_WP2C_SYNTHETIC_ENTRY_OBSERVATION_ONLY';case=$Case;dialog=$observation;guestClipboardSequenceUnchanged=($clipboardSequenceBefore -eq [Phase7BWP2CClipboardSequence]::GetClipboardSequenceNumber());hostDestinationBehaviorVerified=$false;hostClipboardVerified=$false;realIdentityRequested=$false;reportPersisted=$false;universalFocusGuarantee=$false;wp2cExecuted=$false}|ConvertTo-Json -Depth 4
# Observation is not aggregate acceptance. Host canary/clipboard evidence and Founder review are separately required.
