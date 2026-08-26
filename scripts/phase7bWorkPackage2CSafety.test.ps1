$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
if($PSVersionTable.PSEdition -cne 'Desktop' -or $PSVersionTable.PSVersion.Major -ne 5){throw 'WINDOWS_PS51_REQUIRED'}
Import-Module (Join-Path $PSScriptRoot 'phase7bWorkPackage2CContract.psm1')
$count=0
function Check([bool]$Value,[string]$Code){if(-not $Value){throw ('WP2C_SAFETY_TEST:'+ $Code)};$script:count++}
$guest=Get-Phase7BWP2CDependencyManifest $PSScriptRoot
$hostManifest=Get-Phase7BWP2CDependencyManifest $PSScriptRoot (Get-Phase7BWP2CHostEntryPoints)
$preparationOnly=@('phase7bNewWorkPackage2CPreparationPlan.ps1','phase7bWorkPackage2CPreparationOperator.ps1')
foreach($name in @(@($guest.files.name)+@($hostManifest.files.name)+$preparationOnly|Sort-Object -Unique)) {
  $path=Join-Path $PSScriptRoot $name;$tokens=$null;$errors=$null
  $ast=[Management.Automation.Language.Parser]::ParseFile($path,[ref]$tokens,[ref]$errors)
  Check (@($errors).Count -eq 0) ('parse '+$name)
  Check (@($ast.FindAll({param($n)$n -is [Management.Automation.Language.ExitStatementAst]},$true)).Count -eq 0) ('raw exit '+$name)
  $own=@($ast.FindAll({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst]},$true)|ForEach-Object {$_.Name})
  $imports=@($ast.FindAll({param($n)$n -is [Management.Automation.Language.CommandAst] -and $n.GetCommandName() -eq 'Import-Module'},$true))
  $direct=@();$importPaths=@()
  foreach($import in $imports){
    $literal=@($import.FindAll({param($n)$n -is [Management.Automation.Language.StringConstantExpressionAst] -and $n.Value -match '^phase7b.*\.psm1$'},$true))[0].Value
    $importPath=Join-Path $PSScriptRoot $literal;$importPaths+=$importPath
    $moduleAst=[Management.Automation.Language.Parser]::ParseFile($importPath,[ref]$tokens,[ref]$errors)
    $direct+=@($moduleAst.FindAll({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst]},$true)|ForEach-Object {$_.Name})
  }
  $calls=@($ast.FindAll({param($n)$n -is [Management.Automation.Language.CommandAst] -and $n.GetCommandName() -match '^[A-Za-z]+-Phase7B'},$true)|ForEach-Object {$_.GetCommandName()}|Sort-Object -Unique)
  $external=@($calls|Where-Object {$_ -notin $own})
  foreach($call in $external){Check ($call -in $direct) ('direct ownership '+$name+':'+$call)}
  # Fresh Desktop process verifies that direct imports actually export each command.
  $code='$ErrorActionPreference="Stop";'+(@($importPaths|ForEach-Object {"Import-Module -LiteralPath '"+$_.Replace("'","''")+"'"}) -join ';')
  # Import-Module uses -Name, not a filesystem -LiteralPath parameter.
  $code=$code.Replace('Import-Module -LiteralPath','Import-Module -Name')
  foreach($call in $external){$code+=";Get-Command -Name '$call' -ErrorAction Stop | Out-Null"}
  $encoded=[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($code))
  $lines=@(& "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand $encoded 2>&1)
  Check ($LASTEXITCODE -eq 0) ('fresh command availability '+$name+':'+($lines -join ' '))
  $text=$ast.Extent.Text
  Check ($text -notmatch '(?i)WriteConsoleInput|age-plugin-batchpass|Set-Clipboard|Get-Clipboard') ('retired secret channel '+$name)
  Check ($text -notmatch 'AGE-SECRET-KEY-1[023456789ACDEFGHJKLMNPQRSTUVWXYZ]{58}') ('no complete private identity '+$name)
  foreach($assignment in @($ast.FindAll({param($n)$n -is [Management.Automation.Language.AssignmentStatementAst] -and $n.Left.Extent.Text -match '\.Arguments$'},$true))){Check ($assignment.Right.Extent.Text -notmatch '\$(Identity|Secret|Passphrase)\b') ('secret argv '+$name)}
}
$entry=Get-Content (Join-Path $PSScriptRoot 'phase7bRunWorkPackage2GuestRestore.ps1') -Raw
Check ($entry -notmatch 'vmrun|Start-VM|Start-Process|Start-Service|Set-Net|Enable-Net') 'guest cannot start runtime/network/VM'
$claim=Get-Content (Join-Path $PSScriptRoot 'phase7bClaimWorkPackage2CHostExecution.ps1') -Raw
Check ($claim.IndexOf('Assert-Phase7BWP2CFile $RecoveryMediaPath') -lt $claim.IndexOf('New-Phase7BWP2CExecutionClaim')) 'media verification before host claim'
Check ($claim -notmatch 'Remove-Item|Set-Content|vmrun') 'host claim not automatically erased and no VM action'
$bridge=Get-Content (Join-Path $PSScriptRoot 'phase7bWindowsAgeIdentityBridge.psm1') -Raw
Check ($bridge.Contains('if (-not $GuestEntry) { $form.AcceptButton = $ok }')) 'guest no automatic submission'
Check ($bridge.Contains('if ($GuestEntry) { $reveal.Visible = $false }')) 'guest remains masked'
$harness=Get-Content (Join-Path $PSScriptRoot 'phase7bTestWorkPackage2GuestIdentityEntry.ps1') -Raw
Check ($harness.Contains('Show-Phase7BGuestSyntheticIdentityObservation') -and $bridge.Contains('Show-Phase7BAgeIdentityDialog -GuestEntry -SyntheticObservationOnly')) 'synthetic test uses real guest UI'
Check ($harness -notmatch 'WriteAll|Set-Content|Out-File|StandardInput|Invoke-Phase7BAge') 'synthetic UI writes neither files nor cryptographic input'
$preparationEntry=Get-Content (Join-Path $PSScriptRoot 'phase7bInspectWorkPackage2CGuestPreparation.ps1') -Raw
Check ($preparationEntry.IndexOf('Read-Phase7BWP2CPreparationOptical') -lt $preparationEntry.IndexOf('Assert-Phase7BWP2CGuestPreMutation')) 'prep optical validation before real collector'
Check ($preparationEntry.IndexOf('Assert-Phase7BWP2CGuestPreMutation') -lt $preparationEntry.IndexOf('New-Item -ItemType Directory')) 'prep real collector before output mutation'
$recorder=Get-Content (Join-Path $PSScriptRoot 'phase7bRecordWorkPackage2CPreparation.ps1') -Raw
Check ($recorder.IndexOf('New-Phase7BWP2CPreparationHandoffEvidence') -lt $recorder.IndexOf('New-Item -ItemType Directory')) 'checked returned bytes before host evidence mutation'
$operator=Get-Content (Join-Path $PSScriptRoot 'phase7bWorkPackage2CPreparationOperator.ps1') -Raw
Check ($operator -notmatch 'vmrun|Start-VM|Stop-VM|Set-Net|Set-VM|Invoke-Phase7BAge|New-Phase7BWP2CExecutionClaim') 'prep operator has no power/network/crypto/claim action'
Check ($operator -notmatch 'Remove-Item|Stop-Process|Stop-Service|Restart-Computer') 'prep operator no cleanup or automatic RAM management'
[ordered]@{classification='PHASE7B_WP2C_SAFETY_TESTS_PASS';pass=$true;assertions=$count;freshDesktopImportChecks=$true;liveMutationPerformed=$false}|ConvertTo-Json -Compress
