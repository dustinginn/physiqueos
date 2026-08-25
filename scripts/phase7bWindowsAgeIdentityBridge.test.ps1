[CmdletBinding()]
param(
  [Parameter()][string]$AgeExePath,
  [Parameter()][string]$AgeKeygenPath
)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
$script:assertions=0
function Assert-True([bool]$Condition,[string]$Message){if(-not $Condition){throw "ASSERTION_FAILED:$Message"};$script:assertions++}
function New-Secure([string]$Value){ConvertTo-SecureString -String $Value -AsPlainText -Force}

$modulePath=Join-Path $PSScriptRoot 'phase7bWindowsAgeIdentityBridge.psm1'
$tokens=$null;$errors=$null;$ast=[Management.Automation.Language.Parser]::ParseFile($modulePath,[ref]$tokens,[ref]$errors)
Assert-True (@($errors).Count -eq 0) 'native identity bridge parses under Windows PowerShell 5.1'
Assert-True (@($ast.FindAll({param($n)$n -is [Management.Automation.Language.ExitStatementAst]},$true)).Count -eq 0) 'native identity bridge has no raw exit'
$source=Get-Content -LiteralPath $modulePath -Raw
Assert-True ($source.Contains('UseSystemPasswordChar = $true') -and $source.Contains('ShortcutsEnabled = $true')) 'masked dialog supports paste and confirmation'
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
  $prompt={ [pscustomobject]@{first=(New-Secure $identityText);second=(New-Secure $identityText)} }.GetNewClosure()
  $derive={param($path,$identity)$recipient}.GetNewClosure()
  $verified=Request-Phase7BVerifiedAgeIdentity -AgeKeygenPath $fakeKeygen -ExpectedAgeRecipient $recipient -PromptProvider $prompt -RecipientDeriver $derive
  try{Assert-True ($verified.pass -and $verified.ageRecipient -ceq $recipient -and -not $verified.secretPersisted) 'matching confirmed identity and derived recipient pass'}finally{$verified.identity.Dispose()}

  $mismatchPrompt={ [pscustomobject]@{first=(New-Secure $identityText);second=(New-Secure ('AGE-SECRET-KEY-1'+('C'*58)))} }.GetNewClosure()
  $threw=$false;try{[void](Request-Phase7BVerifiedAgeIdentity -AgeKeygenPath $fakeKeygen -ExpectedAgeRecipient $recipient -PromptProvider $mismatchPrompt -RecipientDeriver $derive)}catch{$threw=$_.Exception.Message -match 'CONFIRMATION_FAIL'}
  Assert-True $threw 'two-field mismatch is rejected'
  foreach($bad in @('',"$identityText`n$identityText",'AGE-SECRET-KEY-1'+('I'*58),'AGE-SECRET-KEY-1'+('A'*57))){
    $badPrompt={ [pscustomobject]@{first=(New-Secure $bad);second=(New-Secure $bad)} }.GetNewClosure()
    $threw=$false;try{[void](Request-Phase7BVerifiedAgeIdentity -AgeKeygenPath $fakeKeygen -ExpectedAgeRecipient $recipient -PromptProvider $badPrompt -RecipientDeriver $derive)}catch{$threw=$true}
    Assert-True $threw 'empty, multi-line, invalid-alphabet, and wrong-length identity input is rejected'
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
    $realPrompt={ [pscustomobject]@{first=(New-Secure $secret);second=(New-Secure $secret)} }.GetNewClosure()
    $realVerified=Request-Phase7BVerifiedAgeIdentity -AgeKeygenPath $AgeKeygenPath -ExpectedAgeRecipient $realRecipient -PromptProvider $realPrompt
    try{
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
    }finally{$realVerified.identity.Dispose();$secret=$null;$generated=$null;$generatedError=$null;$process.Dispose()}
  }
}finally{if(Test-Path -LiteralPath $root){Remove-Item -LiteralPath $root -Recurse -Force}}
[ordered]@{classification='PHASE7B_WP2_AGE_NATIVE_IDENTITY_BRIDGE_TESTS_PASS';pass=$true;assertions=$script:assertions;realAgeIntegrationPass=$realIntegration;founderSecretUsed=$false;liveMigrationPerformed=$false;automaticRetryAllowed=$false;wp2cAuthorized=$false}|ConvertTo-Json -Compress
