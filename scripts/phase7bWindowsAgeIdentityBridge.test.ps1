[CmdletBinding()]
param(
  [Parameter()][string]$AgeExePath,
  [Parameter()][string]$AgeKeygenPath
)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
$script:assertions=0
function Assert-True([bool]$Condition,[string]$Message){if(-not $Condition){throw "ASSERTION_FAILED:$Message"};$script:assertions++}
function New-Secure([string]$Value){ConvertTo-SecureString -String $Value -AsPlainText -Force}
function Dispose-Pair($Pair){if($null-ne $Pair){if($null-ne $Pair.first){$Pair.first.Dispose()};if($null-ne $Pair.second){$Pair.second.Dispose()}}}

$modulePath=Join-Path $PSScriptRoot 'phase7bWindowsAgeIdentityBridge.psm1'
$tokens=$null;$errors=$null;$ast=[Management.Automation.Language.Parser]::ParseFile($modulePath,[ref]$tokens,[ref]$errors)
Assert-True (@($errors).Count -eq 0) 'native identity bridge parses under Windows PowerShell 5.1'
Assert-True (@($ast.FindAll({param($n)$n -is [Management.Automation.Language.ExitStatementAst]},$true)).Count -eq 0) 'native identity bridge has no raw exit'
$source=Get-Content -LiteralPath $modulePath -Raw
Assert-True ($source.Contains('UseSystemPasswordChar = $true') -and $source.Contains('ShortcutsEnabled = $true')) 'masked dialog supports paste and confirmation'
Assert-True ($source.Contains('Invoke-Phase7BAgeIdentityDialogEntryValidation -FirstRaw $first.Text -SecondRaw $second.Text')) 'the actual dialog click path uses the shared normalization resolver and remask boundary'
Assert-True ($source -notmatch '\$first\.Text\.Length\s+-ne\s+74|\$second\.Text\.Length\s+-ne\s+74') 'the raw TextBox fixed-length gate is removed'
Assert-True ($source -notmatch '\$Characters\.Length\s+-ne\s+74|\$alphabet\s*=') 'the local guard no longer duplicates canonical length or alphabet parsing'
Assert-True ($source.Contains("'Raw: {0} | Normalized: {1}'") -and $source.Contains('Add_TextChanged')) 'dialog shows live raw and normalized character counts'
Assert-True ($source.Contains('$reveal.Text = ''Hold to reveal''') -and $source.Contains('Add_MouseDown') -and $source.Contains('Add_MouseUp') -and $source.Contains('Add_MouseLeave')) 'hold-to-reveal uses nonpersistent mouse press handlers'
Assert-True ($source.Contains('Add_Deactivate') -and $source.Contains('Add_FormClosing') -and $source.Contains('FormWindowState]::Minimized') -and $source.Contains('Keys]::Escape')) 'focus, close, minimize, and Escape paths remask'
Assert-True ($source -notmatch '(?i)Windows\.Forms\.Clipboard|Clipboard\]::|SetText\(|GetText\(') 'preview performs no clipboard read or mutation'
Assert-True ($source.Contains("Arguments = '-y'") -and $source.Contains("Arguments = '--decrypt -i -")) 'official age tools receive native identity only through stdin'
Assert-True ($source.Contains("Arguments = '-r '") -and $source.Contains('AgeRecipient')) 'encryption uses only the public recipient'
Assert-True ($source.Contains('SecureStringToGlobalAllocUnicode') -and $source.Contains('ZeroFreeGlobalAllocUnicode') -and $source.Contains('[Array]::Clear')) 'transient identity buffers are cleared'
Assert-True ($source -notmatch 'WriteConsoleInputW|PeekConsoleInputW|ReadConsoleInputW|GetNumberOfConsoleInputEvents|CONIN\$') 'retired ConsoleHost injection path is absent'
Assert-True ($source -notmatch '(?i)batchpass|AGE_PASSPHRASE|SetEnvironmentVariable|passphrase-file') 'batchpass and secret environment/file channels are absent'
Assert-True ($source -notmatch '(?i)Set-Content|Add-Content|Out-File|WriteAllText|WriteAllBytes') 'bridge never persists the native secret identity'
Assert-True ($source.Contains('StandardOutput.BaseStream') -and $source.Contains('TransformBlock')) 'decrypt verification hashes binary stdout incrementally'

$root=Join-Path (Resolve-Path (Join-Path $PSScriptRoot '..\.tmp')).Path "phase7b-age-identity-$([guid]::NewGuid().ToString('N'))"
$module=Import-Module $modulePath -Force -PassThru
try{
  [void](New-Item -ItemType Directory -Path $root)
  $fakeKeygen=Join-Path $root 'age-keygen.exe';[IO.File]::WriteAllBytes($fakeKeygen,[byte[]](1))
  $identityText='AGE-SECRET-KEY-1'+('A'*58)
  $recipient='age1'+('q'*58)
  Add-Type -AssemblyName System.Windows.Forms
  function Resolve-DialogText([string]$FirstValue,[string]$SecondValue){
    $firstBox=New-Object Windows.Forms.TextBox;$secondBox=New-Object Windows.Forms.TextBox
    try{
      $firstBox.Text=$FirstValue;$secondBox.Text=$SecondValue
      & $module {param($firstRaw,$secondRaw) Resolve-Phase7BAgeIdentityDialogEntries -FirstRaw $firstRaw -SecondRaw $secondRaw} $firstBox.Text $secondBox.Text
    }finally{$firstBox.Clear();$secondBox.Clear();$firstBox.Dispose();$secondBox.Dispose()}
  }
  function Assert-DialogPass([string]$FirstValue,[string]$SecondValue,[string]$Message){
    $pair=$null
    try{$pair=Resolve-DialogText $FirstValue $SecondValue;Assert-True ($pair.first.Length -eq 74 -and $pair.second.Length -eq 74) $Message}finally{Dispose-Pair $pair}
  }
  function Assert-DialogFail([string]$FirstValue,[string]$SecondValue,[string]$Expected,[string]$Message){
    $pair=$null;$threw=$false
    try{$pair=Resolve-DialogText $FirstValue $SecondValue}catch{$threw=$_.Exception.Message -match $Expected}finally{Dispose-Pair $pair}
    Assert-True $threw $Message
  }
  function Invoke-ProtectedControlEvent($Control,[string]$MethodName,$EventArguments){
    $method=$Control.GetType().GetMethod($MethodName,[Reflection.BindingFlags]'Instance,NonPublic')
    if($null-eq $method){throw "CONTROL_EVENT_METHOD_MISSING:$MethodName"}
    [void]$method.Invoke($Control,[object[]]@($EventArguments.PSObject.BaseObject))
  }

  $previewForm=New-Object Windows.Forms.Form
  $previewButton=New-Object Windows.Forms.Button
  $previewFirst=New-Object Windows.Forms.TextBox
  $previewSecond=New-Object Windows.Forms.TextBox
  $previewFirstCount=New-Object Windows.Forms.Label
  $previewSecondCount=New-Object Windows.Forms.Label
  try{
    $previewFirst.UseSystemPasswordChar=$true;$previewSecond.UseSystemPasswordChar=$true
    $countUpdater=& $module {param($one,$two,$oneLabel,$twoLabel) Add-Phase7BAgeIdentityCountHandlers -FirstControl $one -SecondControl $two -FirstCountLabel $oneLabel -SecondCountLabel $twoLabel} $previewFirst $previewSecond $previewFirstCount $previewSecondCount
    $previewFirst.Text="  $identityText`r`n";$previewSecond.Text=$identityText
    Assert-True ($previewFirstCount.Text -ceq 'Raw: 78 | Normalized: 74' -and $previewSecondCount.Text -ceq 'Raw: 74 | Normalized: 74') 'raw and normalized count metadata reflects actual TextBox content without revealing it'

    $previewController=& $module {param($form,$button,$one,$two) Add-Phase7BAgeIdentityRevealHandlers -Form $form -RevealControl $button -FirstControl $one -SecondControl $two} $previewForm $previewButton $previewFirst $previewSecond
    Assert-True ($previewFirst.UseSystemPasswordChar -and $previewSecond.UseSystemPasswordChar) 'identity preview is masked by default'
    $firstBefore=$previewFirst.Text;$secondBefore=$previewSecond.Text
    $mouseArgs=New-Object Windows.Forms.MouseEventArgs([Windows.Forms.MouseButtons]::Left,1,1,1,0)
    Invoke-ProtectedControlEvent $previewButton 'OnMouseDown' $mouseArgs
    Assert-True (-not $previewFirst.UseSystemPasswordChar -and -not $previewSecond.UseSystemPasswordChar) 'mouse hold reveals both existing TextBoxes'
    Invoke-ProtectedControlEvent $previewButton 'OnMouseUp' $mouseArgs
    Assert-True ($previewFirst.UseSystemPasswordChar -and $previewSecond.UseSystemPasswordChar) 'mouse release remasks both fields'

    & $previewController.reveal
    Invoke-ProtectedControlEvent $previewButton 'OnMouseLeave' ([EventArgs]::Empty)
    Assert-True ($previewFirst.UseSystemPasswordChar -and $previewSecond.UseSystemPasswordChar) 'mouse leave remasks both fields'
    & $previewController.reveal
    Invoke-ProtectedControlEvent $previewForm 'OnDeactivate' ([EventArgs]::Empty)
    Assert-True ($previewFirst.UseSystemPasswordChar -and $previewSecond.UseSystemPasswordChar) 'dialog deactivation remasks both fields'
    & $previewController.reveal
    $previewForm.WindowState=[Windows.Forms.FormWindowState]::Minimized
    Invoke-ProtectedControlEvent $previewForm 'OnResize' ([EventArgs]::Empty)
    Assert-True ($previewFirst.UseSystemPasswordChar -and $previewSecond.UseSystemPasswordChar) 'minimizing the dialog remasks both fields'
    $previewForm.WindowState=[Windows.Forms.FormWindowState]::Normal
    & $previewController.reveal
    $escapeArgs=New-Object Windows.Forms.KeyEventArgs([Windows.Forms.Keys]::Escape)
    Invoke-ProtectedControlEvent $previewForm 'OnKeyDown' $escapeArgs
    Assert-True ($previewFirst.UseSystemPasswordChar -and $previewSecond.UseSystemPasswordChar) 'Escape remasks both fields'
    & $previewController.reveal
    $closingArgs=New-Object Windows.Forms.FormClosingEventArgs([Windows.Forms.CloseReason]::UserClosing,$false)
    Invoke-ProtectedControlEvent $previewForm 'OnFormClosing' $closingArgs
    Assert-True ($previewFirst.UseSystemPasswordChar -and $previewSecond.UseSystemPasswordChar) 'cancel or form close remasks both fields'

    & $previewController.reveal
    $validationFailed=$false
    try{[void](& $module {param($one,$two,$oneControl,$twoControl) Invoke-Phase7BAgeIdentityDialogEntryValidation -FirstRaw $one -SecondRaw $two -FirstControl $oneControl -SecondControl $twoControl} $identityText ($identityText+'EXTRA') $previewFirst $previewSecond)}catch{$validationFailed=$true}
    Assert-True ($validationFailed -and $previewFirst.UseSystemPasswordChar -and $previewSecond.UseSystemPasswordChar) 'validation failure and exception path leave both fields masked'
    Assert-True ($previewFirst.Text -ceq $firstBefore -and $previewSecond.Text -ceq $secondBefore) 'preview and validation metadata never modify TextBox secret content'
    Assert-True ($previewFirstCount.Text -notmatch [regex]::Escape($identityText) -and $previewSecondCount.Text -notmatch [regex]::Escape($identityText)) 'count labels contain no identity characters'
  }finally{
    & $module {param($one,$two) Set-Phase7BAgeIdentityMaskState -FirstControl $one -SecondControl $two -Masked $true} $previewFirst $previewSecond
    $previewFirst.Clear();$previewSecond.Clear();$previewFirst.Dispose();$previewSecond.Dispose();$previewFirstCount.Dispose();$previewSecondCount.Dispose();$previewButton.Dispose();$previewForm.Dispose()
  }

  Assert-DialogPass $identityText $identityText 'canonical identity passes the actual TextBox normalization path'
  Assert-DialogPass "   $identityText" "   $identityText" 'leading spaces are normalized by the dialog path'
  Assert-DialogPass "$identityText   " "$identityText   " 'trailing spaces are normalized by the dialog path'
  Assert-DialogPass "`r`n $identityText `t`r`n" "`r`n $identityText `t`r`n" 'leading and trailing mixed whitespace is normalized by the dialog path'
  Assert-DialogPass "$identityText`r`n" "$identityText`r`n" 'clipboard-style trailing CRLF is normalized by the dialog path'
  Assert-DialogPass "    $identityText    `r`n" "    $identityText    `r`n" 'console-copy outer padding is normalized by the dialog path'
  Assert-DialogFail "$identityText`r`n$identityText" "$identityText`r`n$identityText" 'FORMAT_FAIL' 'two identities separated by CRLF are rejected'
  Assert-DialogFail "$identityText`r`nEXTRA" "$identityText`r`nEXTRA" 'FORMAT_FAIL' 'identity plus a second line is rejected'
  Assert-DialogFail ($identityText.Insert(30,' ')) ($identityText.Insert(30,' ')) 'FORMAT_FAIL' 'internal space is rejected'
  Assert-DialogFail ($identityText.Insert(30,"`t")) ($identityText.Insert(30,"`t")) 'FORMAT_FAIL' 'embedded tab is rejected'
  Assert-DialogFail ($identityText.Insert(30,"`n")) ($identityText.Insert(30,"`n")) 'FORMAT_FAIL' 'embedded newline is rejected'
  Assert-DialogFail ($identityText.Insert(30,[char]0)) ($identityText.Insert(30,[char]0)) 'FORMAT_FAIL' 'NUL is rejected'
  Assert-DialogFail '  ' "`r`n" 'FORMAT_FAIL' 'whitespace-only input is rejected'
  Assert-DialogFail $identityText ('AGE-SECRET-KEY-1'+('C'*58)) 'CONFIRMATION_FAIL' 'different normalized entries are rejected'
  Assert-DialogFail ('NOT-'+$identityText) ('NOT-'+$identityText) 'FORMAT_FAIL' 'malformed prefix is rejected'

  $prompt={ [pscustomobject]@{first=(New-Secure $identityText);second=(New-Secure $identityText)} }.GetNewClosure()
  $derive={param($path,$identity)$recipient}.GetNewClosure()
  $verified=Request-Phase7BVerifiedAgeIdentity -AgeKeygenPath $fakeKeygen -ExpectedAgeRecipient $recipient -PromptProvider $prompt -RecipientDeriver $derive
  try{Assert-True ($verified.pass -and $verified.ageRecipient -ceq $recipient -and -not $verified.secretPersisted) 'matching confirmed identity and derived recipient pass'}finally{$verified.identity.Dispose()}

  $mismatchPrompt={ [pscustomobject]@{first=(New-Secure $identityText);second=(New-Secure ('AGE-SECRET-KEY-1'+('C'*58)))} }.GetNewClosure()
  $threw=$false;try{[void](Request-Phase7BVerifiedAgeIdentity -AgeKeygenPath $fakeKeygen -ExpectedAgeRecipient $recipient -PromptProvider $mismatchPrompt -RecipientDeriver $derive)}catch{$threw=$_.Exception.Message -match 'CONFIRMATION_FAIL'}
  Assert-True $threw 'two-field mismatch is rejected'
  foreach($badCase in @(
    [pscustomobject]@{name='empty';value=''},
    [pscustomobject]@{name='multi-line';value="$identityText`n$identityText"},
    [pscustomobject]@{name='malformed-prefix';value=('NOT-'+$identityText)}
  )){
    $bad=$badCase.value
    $badPrompt={ [pscustomobject]@{first=(New-Secure $bad);second=(New-Secure $bad)} }.GetNewClosure()
    $threw=$false;try{[void](Request-Phase7BVerifiedAgeIdentity -AgeKeygenPath $fakeKeygen -ExpectedAgeRecipient $recipient -PromptProvider $badPrompt -RecipientDeriver $derive)}catch{$threw=$true}
    Assert-True $threw ("{0} identity input is rejected" -f $badCase.name)
  }
  $wrongDeriver={param($path,$identity)'age1'+('p'*58)}
  $threw=$false;try{[void](Request-Phase7BVerifiedAgeIdentity -AgeKeygenPath $fakeKeygen -ExpectedAgeRecipient $recipient -PromptProvider $prompt -RecipientDeriver $wrongDeriver)}catch{$threw=$_.Exception.Message -match 'RECIPIENT_MISMATCH'}
  Assert-True $threw 'different native identity recipient is rejected before mutation'

  $realIntegration=$false
  if(-not [string]::IsNullOrWhiteSpace($AgeExePath) -and -not [string]::IsNullOrWhiteSpace($AgeKeygenPath)){
    if(-not(Test-Path -LiteralPath $AgeExePath -PathType Leaf)-or -not(Test-Path -LiteralPath $AgeKeygenPath -PathType Leaf)){throw 'REAL_AGE_BINARY_MISSING'}
    $psi=New-Object Diagnostics.ProcessStartInfo;$psi.FileName=$AgeKeygenPath;$psi.UseShellExecute=$false;$psi.CreateNoWindow=$true;$psi.RedirectStandardOutput=$true;$psi.RedirectStandardError=$true
    $process=New-Object Diagnostics.Process;$process.StartInfo=$psi;[void]$process.Start();$generated=$process.StandardOutput.ReadToEnd();$generatedError=$process.StandardError.ReadToEnd();$process.WaitForExit()
    if($process.ExitCode -ne 0){throw 'REAL_AGE_KEYGEN_FAIL'}
    $secret=@($generated -split "`r?`n"|Where-Object{$_ -cmatch '^AGE-SECRET-KEY-'})[0]
    $publicLine=@(($generated -split "`r?`n")+($generatedError -split "`r?`n")|Where-Object{$_ -cmatch '^# public key: age1'})[0]
    $realRecipient=($publicLine -replace '^# public key:\s*','').Trim()
    Assert-True ($secret -cmatch '^AGE-SECRET-KEY-1[023456789ACDEFGHJKLMNPQRSTUVWXYZ]{58}$' -and (Test-Phase7BAgeRecipientShape $realRecipient)) 'real age v1.3.1 emits supported native identity and recipient shapes'
    Assert-DialogPass " `r`n$secret`t " "`r`n$secret `r`n" 'real age identity passes through actual TextBox normalization with outer clipboard whitespace'
    $realPrompt={ [pscustomobject]@{first=(New-Secure $secret);second=(New-Secure $secret)} }.GetNewClosure()
    $realVerified=Request-Phase7BVerifiedAgeIdentity -AgeKeygenPath $AgeKeygenPath -ExpectedAgeRecipient $realRecipient -PromptProvider $realPrompt
    $process2=$null
    try{
      $replacement=if($secret[$secret.Length-1] -cne 'Q'){'Q'}else{'P'}
      $malformed=$secret.Substring(0,$secret.Length-1)+$replacement
      $malformedPrompt={ [pscustomobject]@{first=(New-Secure $malformed);second=(New-Secure $malformed)} }.GetNewClosure()
      $threw=$false;try{[void](Request-Phase7BVerifiedAgeIdentity -AgeKeygenPath $AgeKeygenPath -ExpectedAgeRecipient $realRecipient -PromptProvider $malformedPrompt)}catch{$threw=$_.Exception.Message -match 'DERIVATION_FAIL'}
      Assert-True $threw 'real age-keygen authoritatively rejects a malformed identity checksum'

      $extraPrompt={ [pscustomobject]@{first=(New-Secure ($secret+'EXTRA'));second=(New-Secure ($secret+'EXTRA'))} }.GetNewClosure()
      $threw=$false;try{[void](Request-Phase7BVerifiedAgeIdentity -AgeKeygenPath $AgeKeygenPath -ExpectedAgeRecipient $realRecipient -PromptProvider $extraPrompt)}catch{$threw=$_.Exception.Message -match 'DERIVATION_FAIL'}
      Assert-True $threw 'real age-keygen authoritatively rejects non-whitespace suffix content'

      $psi2=New-Object Diagnostics.ProcessStartInfo;$psi2.FileName=$AgeKeygenPath;$psi2.UseShellExecute=$false;$psi2.CreateNoWindow=$true;$psi2.RedirectStandardOutput=$true;$psi2.RedirectStandardError=$true
      $process2=New-Object Diagnostics.Process;$process2.StartInfo=$psi2;[void]$process2.Start();$generated2=$process2.StandardOutput.ReadToEnd();$generatedError2=$process2.StandardError.ReadToEnd();$process2.WaitForExit()
      if($process2.ExitCode -ne 0){throw 'SECOND_REAL_AGE_KEYGEN_FAIL'}
      $secret2=@($generated2 -split "`r?`n"|Where-Object{$_ -cmatch '^AGE-SECRET-KEY-'})[0]
      $wrongPrompt={ [pscustomobject]@{first=(New-Secure $secret2);second=(New-Secure $secret2)} }.GetNewClosure()
      $threw=$false;try{[void](Request-Phase7BVerifiedAgeIdentity -AgeKeygenPath $AgeKeygenPath -ExpectedAgeRecipient $realRecipient -PromptProvider $wrongPrompt)}catch{$threw=$_.Exception.Message -match 'RECIPIENT_MISMATCH'}
      Assert-True $threw 'a different valid identity is rejected against the bound recipient by real age-keygen derivation'

      $plain=Join-Path $root 'synthetic.bin';$cipher=Join-Path $root 'synthetic.age'
      $bytes=New-Object byte[] 4097;(New-Object Random 73021).NextBytes($bytes);[IO.File]::WriteAllBytes($plain,$bytes)
      $expectedHash=(Get-FileHash -LiteralPath $plain -Algorithm SHA256).Hash.ToLowerInvariant()
      $encrypted=Invoke-Phase7BAgeNativeRecipientEncryption -AgeExePath $AgeExePath -InputPath $plain -OutputPath $cipher -AgeRecipient $realRecipient
      $roundTrip=Invoke-Phase7BAgeNativeIdentityDecryptionToHash -AgeExePath $AgeExePath -CiphertextPath $cipher -Identity $realVerified.identity
      Assert-True ($encrypted.pass -and $roundTrip.pass -and $roundTrip.decryptedStreamSha256 -ceq $expectedHash -and $roundTrip.decryptedStreamBytes -eq 4097) 'real age v1.3.1 native recipient encrypt and stdin identity decrypt round trip matches exact bytes'
      $restored=Join-Path $root 'restored.bin'
      $fileResult=Invoke-Phase7BAgeNativeIdentityDecryptionToFile -AgeExePath $AgeExePath -CiphertextPath $cipher -OutputPath $restored -Identity $realVerified.identity
      Assert-True ($fileResult.pass -and (Get-FileHash -LiteralPath $restored -Algorithm SHA256).Hash.ToLowerInvariant() -ceq $expectedHash) 'WP2-C native stdin identity decrypt-to-file path is compatible'
      $secretFileMatches=@(Get-ChildItem -LiteralPath $root -File|Where-Object{(Get-Content -LiteralPath $_.FullName -Raw -ErrorAction SilentlyContinue) -cmatch [regex]::Escape($secret)})
      Assert-True ($secretFileMatches.Count -eq 0) 'synthetic native identity is not persisted to a file'
      $realIntegration=$true
    }finally{
      $realVerified.identity.Dispose();$secret=$null;$malformed=$null;$secret2=$null;$generated=$null;$generatedError=$null;$generated2=$null;$generatedError2=$null
      if($null-ne $process2){$process2.Dispose()};$process.Dispose()
    }
  }
}finally{if(Test-Path -LiteralPath $root){Remove-Item -LiteralPath $root -Recurse -Force}}
[ordered]@{classification='PHASE7B_WP2_AGE_NATIVE_IDENTITY_BRIDGE_TESTS_PASS';pass=$true;assertions=$script:assertions;realAgeIntegrationPass=$realIntegration;founderSecretUsed=$false;liveMigrationPerformed=$false;automaticRetryAllowed=$false;wp2cAuthorized=$false}|ConvertTo-Json -Compress
