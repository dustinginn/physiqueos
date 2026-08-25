[CmdletBinding()]
param(
  [Parameter()][switch]$RunAttachedConsoleAgeIntegration,
  [Parameter()][string]$AgeExePath
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$script:assertions = 0

function Assert-True([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw "ASSERTION_FAILED:$Message" }
  $script:assertions++
}

$modulePath = Join-Path $PSScriptRoot 'phase7bWindowsAgePassphraseBridge.psm1'
$tokens = $null
$parseErrors = $null
$moduleAst = [Management.Automation.Language.Parser]::ParseFile($modulePath, [ref]$tokens, [ref]$parseErrors)
Assert-True (@($parseErrors).Count -eq 0) 'secure-input bridge parses under Windows PowerShell 5.1 grammar'
$rawExits = @($moduleAst.FindAll({ param($node) $node -is [Management.Automation.Language.ExitStatementAst] }, $true))
Assert-True ($rawExits.Count -eq 0) 'secure-input bridge contains no raw exit'

$moduleText = Get-Content -LiteralPath $modulePath -Raw
Assert-True ($moduleText.Contains('UseSystemPasswordChar = $true') -and $moduleText.Contains('ShortcutsEnabled = $true')) 'dialog is masked and paste-capable'
Assert-True ($moduleText.Contains('WriteConsoleInputW') -and $moduleText.Contains('PeekConsoleInputW') -and $moduleText.Contains('ReadConsoleInputW') -and $moduleText.Contains('GetNumberOfConsoleInputEvents') -and $moduleText.Contains('FlushConsoleInputBuffer')) 'bridge uses typed bounded console input APIs'
Assert-True ($moduleText.Contains('KEY_EVENT') -and $moduleText.Contains('MOUSE_EVENT') -and $moduleText.Contains('WINDOW_BUFFER_SIZE_EVENT') -and $moduleText.Contains('MENU_EVENT') -and $moduleText.Contains('FOCUS_EVENT')) 'bridge classifies every supported Windows console input record type'
Assert-True ($moduleText.Contains('PHASE7B_WP2_AGE_CONSOLE_INPUT_UNKNOWN_EVENT') -and $moduleText.Contains('PHASE7B_WP2_AGE_CONSOLE_INPUT_SEQUENCE_MISMATCH')) 'bridge fails closed for unknown records and exact-sequence mismatch'
Assert-True (-not $moduleText.Contains('SetConsoleMode')) 'bridge never changes console input mode, preserving the exact original mode on success and failure'
Assert-True ($moduleText.Contains('SecureStringToGlobalAllocUnicode') -and $moduleText.Contains('ZeroFreeGlobalAllocUnicode')) 'secure-string marshal buffer is zero-freed'
Assert-True ($moduleText -notmatch '(?i)AGE_PASSPHRASE(?:_FD)?\s*=|SetEnvironmentVariable|RedirectStandardInput\s*=\s*\$true|(?<!Redirect)StandardInput\s*=') 'bridge never exports the passphrase through environment or redirected stdin'
Assert-True ($moduleText.Contains('StandardOutput.BaseStream') -and $moduleText.Contains('TransformBlock')) 'decrypt verification hashes the binary stdout stream incrementally'
Assert-True ($moduleText -notmatch '(?i)Set-Content|Add-Content|Out-File|WriteAllText|WriteAllBytes') 'bridge has no secret-file persistence primitive'

$module = Import-Module $modulePath -Force -PassThru
try {
  & $module { Initialize-Phase7BWindowsConsoleInputBridge }

  function Invoke-TypedSyntheticPolicy {
    param(
      [Parameter(Mandatory = $true)][int16[]]$EventTypes,
      [Parameter(Mandatory = $true)][char[]]$Characters,
      [Parameter()][AllowNull()][char[]]$ExpectedPassphrase,
      [Parameter()][int]$LineCount = 0,
      [Parameter()][bool]$RequireExactSequence = $false,
      [Parameter()][string]$KeyboardErrorCode = 'PHASE7B_WP2_AGE_CONSOLE_INPUT_CONTAMINATED'
    )
    $keyDown = New-Object 'int[]' $EventTypes.Length
    $repeatCounts = New-Object 'int[]' $EventTypes.Length
    for ($index = 0; $index -lt $EventTypes.Length; $index++) {
      if ($EventTypes[$index] -eq 0x0001) { $keyDown[$index] = 1; $repeatCounts[$index] = 1 }
    }
    [Phase7BWindowsConsoleInputBridge]::EvaluateSyntheticRecords(
      $EventTypes, $keyDown, $repeatCounts, $Characters, $ExpectedPassphrase, $LineCount,
      $RequireExactSequence, $KeyboardErrorCode)
  }

  $nonKeyTypes = [int16[]](0x0002,0x0004,0x0008,0x0010)
  $nonKeyCharacters = [char[]]([char]0,[char]0,[char]0,[char]0)
  foreach ($recordType in $nonKeyTypes) {
    $typedHarmless = Invoke-TypedSyntheticPolicy -EventTypes ([int16[]]@($recordType)) -Characters ([char[]]@([char]0))
    Assert-True ($typedHarmless.Pass -and $typedHarmless.HarmlessRecordCount -eq 1 -and $typedHarmless.KeyboardRecordCount -eq 0) "known harmless console record type $recordType is accepted for bounded drain"
  }
  $typedHarmlessCombination = Invoke-TypedSyntheticPolicy -EventTypes $nonKeyTypes -Characters $nonKeyCharacters
  Assert-True ($typedHarmlessCombination.Pass -and $typedHarmlessCombination.HarmlessRecordCount -eq 4) 'combined mouse, resize, menu, and focus records are accepted for bounded drain'

  foreach ($keyboardCharacter in [char[]]('x',"`r")) {
    $typedKeyboard = Invoke-TypedSyntheticPolicy -EventTypes ([int16[]]@(0x0001)) -Characters ([char[]]@($keyboardCharacter))
    Assert-True (-not $typedKeyboard.Pass -and $typedKeyboard.SafeErrorCode -ceq 'PHASE7B_WP2_AGE_CONSOLE_INPUT_CONTAMINATED' -and $typedKeyboard.KeyboardRecordCount -eq 1) 'preexisting character, paste-derived, or Enter keyboard input remains fatal'
  }
  $keyUpResult = [Phase7BWindowsConsoleInputBridge]::EvaluateSyntheticRecords(
    [int16[]]@(0x0001,0x0001), [int[]]@(0,1), [int[]]@(1,1), [char[]]@('x',[char]"`r"), [char[]]'x', 1, $true,
    'PHASE7B_WP2_AGE_CONSOLE_INPUT_SEQUENCE_MISMATCH')
  Assert-True (-not $keyUpResult.Pass) 'unexpected key-up record is rejected from the injected sequence'
  $repeatResult = [Phase7BWindowsConsoleInputBridge]::EvaluateSyntheticRecords(
    [int16[]]@(0x0001,0x0001), [int[]]@(1,1), [int[]]@(2,1), [char[]]@('x',[char]"`r"), [char[]]'x', 1, $true,
    'PHASE7B_WP2_AGE_CONSOLE_INPUT_SEQUENCE_MISMATCH')
  Assert-True (-not $repeatResult.Pass) 'unexpected repeated keyboard record is rejected from the injected sequence'
  $typedUnknown = Invoke-TypedSyntheticPolicy -EventTypes ([int16[]]@(0x0020)) -Characters ([char[]]@([char]0))
  Assert-True (-not $typedUnknown.Pass -and $typedUnknown.SafeErrorCode -ceq 'PHASE7B_WP2_AGE_CONSOLE_INPUT_UNKNOWN_EVENT' -and $typedUnknown.UnknownRecordCount -eq 1) 'unknown console input record type fails closed'

  $sequenceSecret = [char[]]'Synthetic-Secret-32-Characters!!'
  $sequenceTypes = New-Object Collections.Generic.List[int16]
  $sequenceCharacters = New-Object Collections.Generic.List[char]
  for ($line = 0; $line -lt 2; $line++) {
    for ($index = 0; $index -lt $sequenceSecret.Length; $index++) {
      $sequenceTypes.Add([int16]0x0001)
      $sequenceCharacters.Add($sequenceSecret[$index])
      if ($index -eq 3) { $sequenceTypes.Add([int16]0x0010); $sequenceCharacters.Add([char]0) }
    }
    $sequenceTypes.Add([int16]0x0001)
    $sequenceCharacters.Add([char]"`r")
  }
  $exactSequence = Invoke-TypedSyntheticPolicy -EventTypes ([int16[]]$sequenceTypes.ToArray()) -Characters ([char[]]$sequenceCharacters.ToArray()) -ExpectedPassphrase $sequenceSecret -LineCount 2 -RequireExactSequence $true -KeyboardErrorCode 'PHASE7B_WP2_AGE_CONSOLE_INPUT_SEQUENCE_MISMATCH'
  Assert-True ($exactSequence.Pass -and $exactSequence.KeyboardRecordCount -eq (($sequenceSecret.Length + 1) * 2) -and $exactSequence.HarmlessRecordCount -eq 2) 'exact injected keyboard sequence is accepted with harmless non-key records interleaved'

  function Copy-CharacterList([Collections.Generic.List[char]]$Source) { return New-Object Collections.Generic.List[char] (,$Source) }
  function Copy-ShortList([Collections.Generic.List[int16]]$Source) { return New-Object Collections.Generic.List[int16] (,$Source) }
  $extraTypes = Copy-ShortList $sequenceTypes; $extraCharacters = Copy-CharacterList $sequenceCharacters
  $extraTypes.Add([int16]0x0001); $extraCharacters.Add([char]'z')
  $extraSequence = Invoke-TypedSyntheticPolicy -EventTypes ([int16[]]$extraTypes.ToArray()) -Characters ([char[]]$extraCharacters.ToArray()) -ExpectedPassphrase $sequenceSecret -LineCount 2 -RequireExactSequence $true -KeyboardErrorCode 'PHASE7B_WP2_AGE_CONSOLE_INPUT_SEQUENCE_MISMATCH'
  Assert-True (-not $extraSequence.Pass) 'extra injected keyboard record is rejected'
  $missingTypes = Copy-ShortList $sequenceTypes; $missingCharacters = Copy-CharacterList $sequenceCharacters
  $missingTypes.RemoveAt(1); $missingCharacters.RemoveAt(1)
  $missingSequence = Invoke-TypedSyntheticPolicy -EventTypes ([int16[]]$missingTypes.ToArray()) -Characters ([char[]]$missingCharacters.ToArray()) -ExpectedPassphrase $sequenceSecret -LineCount 2 -RequireExactSequence $true -KeyboardErrorCode 'PHASE7B_WP2_AGE_CONSOLE_INPUT_SEQUENCE_MISMATCH'
  Assert-True (-not $missingSequence.Pass) 'missing injected keyboard record is rejected'
  $reorderedCharacters = Copy-CharacterList $sequenceCharacters
  $swap = $reorderedCharacters[1]; $reorderedCharacters[1] = $reorderedCharacters[2]; $reorderedCharacters[2] = $swap
  $reorderedSequence = Invoke-TypedSyntheticPolicy -EventTypes ([int16[]]$sequenceTypes.ToArray()) -Characters ([char[]]$reorderedCharacters.ToArray()) -ExpectedPassphrase $sequenceSecret -LineCount 2 -RequireExactSequence $true -KeyboardErrorCode 'PHASE7B_WP2_AGE_CONSOLE_INPUT_SEQUENCE_MISMATCH'
  Assert-True (-not $reorderedSequence.Pass) 'reordered injected keyboard sequence is rejected'
  $unexpectedCharacters = Copy-CharacterList $sequenceCharacters; $unexpectedCharacters[0] = [char]'?'
  $unexpectedSequence = Invoke-TypedSyntheticPolicy -EventTypes ([int16[]]$sequenceTypes.ToArray()) -Characters ([char[]]$unexpectedCharacters.ToArray()) -ExpectedPassphrase $sequenceSecret -LineCount 2 -RequireExactSequence $true -KeyboardErrorCode 'PHASE7B_WP2_AGE_CONSOLE_INPUT_SEQUENCE_MISMATCH'
  Assert-True (-not $unexpectedSequence.Pass) 'unexpected injected character is rejected'
  $unexpectedEnterCharacters = Copy-CharacterList $sequenceCharacters
  $firstEnterIndex = $sequenceCharacters.IndexOf([char]"`r")
  $unexpectedEnterCharacters[$firstEnterIndex] = [char]'x'
  $unexpectedEnterSequence = Invoke-TypedSyntheticPolicy -EventTypes ([int16[]]$sequenceTypes.ToArray()) -Characters ([char[]]$unexpectedEnterCharacters.ToArray()) -ExpectedPassphrase $sequenceSecret -LineCount 2 -RequireExactSequence $true -KeyboardErrorCode 'PHASE7B_WP2_AGE_CONSOLE_INPUT_SEQUENCE_MISMATCH'
  Assert-True (-not $unexpectedEnterSequence.Pass) 'unexpected Enter position is rejected'

  $postHarmless = Invoke-TypedSyntheticPolicy -EventTypes $nonKeyTypes -Characters $nonKeyCharacters -KeyboardErrorCode 'PHASE7B_WP2_AGE_CONSOLE_INPUT_NOT_FULLY_CONSUMED'
  Assert-True ($postHarmless.Pass) 'known harmless non-key records after age are accepted for bounded drain'
  $postKeyboard = Invoke-TypedSyntheticPolicy -EventTypes ([int16[]]@(0x0001)) -Characters ([char[]]@('x')) -KeyboardErrorCode 'PHASE7B_WP2_AGE_CONSOLE_INPUT_NOT_FULLY_CONSUMED'
  Assert-True (-not $postKeyboard.Pass -and $postKeyboard.SafeErrorCode -ceq 'PHASE7B_WP2_AGE_CONSOLE_INPUT_NOT_FULLY_CONSUMED') 'remaining keyboard record after age is rejected'
  $postUnknown = Invoke-TypedSyntheticPolicy -EventTypes ([int16[]]@(0x0020)) -Characters ([char[]]@([char]0)) -KeyboardErrorCode 'PHASE7B_WP2_AGE_CONSOLE_INPUT_NOT_FULLY_CONSUMED'
  Assert-True (-not $postUnknown.Pass -and $postUnknown.SafeErrorCode -ceq 'PHASE7B_WP2_AGE_CONSOLE_INPUT_UNKNOWN_EVENT') 'unknown record after age remains fail closed'

  function Invoke-SyntheticBridgeCase {
    param(
      [Parameter()][AllowEmptyString()][string]$First = ('a' * 32),
      [Parameter()][AllowEmptyString()][string]$Confirmation = ('a' * 32),
      [Parameter()][bool]$Cancelled = $false,
      [Parameter()][int[]]$PendingCounts = @(0, 0, 66, 0, 0),
      [Parameter()][ValidateSet('Exact','Partial','Throw')][string]$WriterMode = 'Exact',
      [Parameter()][ValidateSet('Pass','Nonzero','Throw')][string]$AgeMode = 'Pass'
    )

    $state = [ordered]@{
      policyIndex = 0
      clearCount = 0
      writerCount = 0
      ageCount = 0
      injectedText = $null
      ageArguments = @()
    }
    $result = & $module {
      param($CaseFirst, $CaseConfirmation, $CaseCancelled, $CasePendingCounts, $CaseWriterMode, $CaseAgeMode, $CaseState)

      $promptProvider = {
        if ($CaseCancelled) { return [pscustomobject]@{ cancelled = $true; first = $null; confirmation = $null } }
        return [pscustomobject]@{
          cancelled = $false
          first = New-Phase7BSecureStringFromText -Value $CaseFirst
          confirmation = New-Phase7BSecureStringFromText -Value $CaseConfirmation
        }
      }
      $policyProvider = {
        param([string]$Operation, [AllowNull()][char[]]$Characters, [int]$LineCount)
        $index = [int]$CaseState.policyIndex
        $CaseState.policyIndex = $index + 1
        $observed = if ($index -lt $CasePendingCounts.Count) { [int]$CasePendingCounts[$index] } else { 0 }
        $expected = if ($Operation -ceq 'VerifyInjected') { [int](($Characters.Length + 1) * $LineCount) } else { 0 }
        $pass = $observed -eq $expected
        $code = if ($pass) { $null } elseif ($Operation -ceq 'VerifyInjected') { 'PHASE7B_WP2_AGE_CONSOLE_INPUT_SEQUENCE_MISMATCH' } elseif ($Operation -ceq 'PostAge') { 'PHASE7B_WP2_AGE_CONSOLE_INPUT_NOT_FULLY_CONSUMED' } elseif ($Operation -ceq 'CleanupVerify') { 'PHASE7B_WP2_AGE_CONSOLE_INPUT_CLEANUP_FAIL' } else { 'PHASE7B_WP2_AGE_CONSOLE_INPUT_CONTAMINATED' }
        return [pscustomobject]@{ Pass=$pass;SafeErrorCode=$code;TotalRecordCount=$observed;KeyboardRecordCount=$observed;HarmlessRecordCount=0;UnknownRecordCount=0 }
      }
      $clearer = { $CaseState.clearCount = [int]$CaseState.clearCount + 1 }
      $writer = {
        param([char[]]$Characters)
        $CaseState.writerCount = [int]$CaseState.writerCount + 1
        $CaseState.injectedText = New-Object string (,$Characters)
        $expected = [int](($Characters.Length + 1) * 2)
        if ($CaseWriterMode -eq 'Throw') { throw 'synthetic writer failure' }
        if ($CaseWriterMode -eq 'Partial') { return $expected - 1 }
        return $expected
      }
      $ageInvoker = {
        param([string]$Executable, [string]$OutputFile, [string]$InputFile)
        $CaseState.ageCount = [int]$CaseState.ageCount + 1
        $CaseState.ageArguments = @($Executable, '-p', '-o', $OutputFile, $InputFile)
        if ($CaseAgeMode -eq 'Throw') { throw 'synthetic age launch failure' }
        if ($CaseAgeMode -eq 'Nonzero') { return 1 }
        return 0
      }
      Invoke-Phase7BAgeEncryptionBridgeCore -AgeExePath 'C:\synthetic\age.exe' -InputPath 'C:\synthetic\input.zip' `
        -OutputPath 'C:\synthetic\output.zip.age' -PromptProvider $promptProvider -InputPolicyProvider $policyProvider `
        -InputClearer $clearer -InputWriter $writer -AgeInvoker $ageInvoker
    } $First $Confirmation $Cancelled $PendingCounts $WriterMode $AgeMode $state

    return [pscustomobject]@{ result = $result; state = [pscustomobject]$state }
  }

  $normalSecret = ('Ab9-_!~+' * 4)
  $normal = Invoke-SyntheticBridgeCase -First $normalSecret -Confirmation $normalSecret
  Assert-True ([bool]$normal.result.pass -and [string]$normal.result.classification -ceq 'PHASE7B_WP2_AGE_SECURE_INPUT_BRIDGE_PASS') 'matching nonempty 32-character input passes'
  Assert-True ($normal.state.writerCount -eq 1 -and $normal.state.ageCount -eq 1) 'matching input injects once and launches age once'
  Assert-True ([string]$normal.state.injectedText -ceq $normalSecret) 'input writer receives the exact intended passphrase buffer'
  Assert-True ($normal.state.ageArguments.Count -eq 5 -and -not (($normal.state.ageArguments -join '|').Contains($normalSecret))) 'age command line contains paths and flags but no passphrase'
  Assert-True ([bool]$normal.result.explicitPassphraseConfirmationSupplied -and -not [bool]$normal.result.autogeneratedPassphrasePathReachable) 'success requires explicit confirmation and excludes autogenerated passphrase'

  function Invoke-SyntheticDecryptCase {
    param([string]$First=('a'*32),[string]$Confirmation=('a'*32),[bool]$Cancelled=$false,[int]$ExitCode=0)
    $state=[ordered]@{policyIndex=0;clearCount=0;writerCount=0;ageCount=0}
    $result=& $module {
      param($CaseFirst,$CaseConfirmation,$CaseCancelled,$CaseExitCode,$CaseState)
      $counts=@(0,0,33,0,0)
      $prompt={if($CaseCancelled){[pscustomobject]@{cancelled=$true;first=$null;confirmation=$null}}else{[pscustomobject]@{cancelled=$false;first=New-Phase7BSecureStringFromText $CaseFirst;confirmation=New-Phase7BSecureStringFromText $CaseConfirmation}}}
      $policy={param([string]$Operation,[AllowNull()][char[]]$Characters,[int]$LineCount)$i=[int]$CaseState.policyIndex;$CaseState.policyIndex=$i+1;$observed=if($i -lt $counts.Count){[int]$counts[$i]}else{0};$expected=if($Operation -ceq 'VerifyInjected'){[int](($Characters.Length+1)*$LineCount)}else{0};$pass=$observed -eq $expected;$code=if($pass){$null}elseif($Operation -ceq 'VerifyInjected'){'PHASE7B_WP2_AGE_CONSOLE_INPUT_SEQUENCE_MISMATCH'}elseif($Operation -ceq 'PostAge'){'PHASE7B_WP2_AGE_CONSOLE_INPUT_NOT_FULLY_CONSUMED'}elseif($Operation -ceq 'CleanupVerify'){'PHASE7B_WP2_AGE_CONSOLE_INPUT_CLEANUP_FAIL'}else{'PHASE7B_WP2_AGE_CONSOLE_INPUT_CONTAMINATED'};[pscustomobject]@{Pass=$pass;SafeErrorCode=$code}}
      $clear={$CaseState.clearCount=[int]$CaseState.clearCount+1}
      $writer={param([char[]]$Characters)$CaseState.writerCount=[int]$CaseState.writerCount+1;return $Characters.Length+1}
      $invoker={param($Executable,$Ciphertext)$CaseState.ageCount=[int]$CaseState.ageCount+1;[pscustomobject]@{exitCode=$CaseExitCode;sha256='f'*64;bytes=[int64]4096}}
      Invoke-Phase7BAgeDecryptionToHashBridgeCore -AgeExePath 'C:\synthetic\age.exe' -CiphertextPath 'C:\synthetic\packet.age' -PromptProvider $prompt -InputPolicyProvider $policy -InputClearer $clear -InputWriter $writer -AgeInvoker $invoker
    } $First $Confirmation $Cancelled $ExitCode $state
    [pscustomobject]@{result=$result;state=[pscustomobject]$state}
  }
  $decrypt=Invoke-SyntheticDecryptCase -First $normalSecret -Confirmation $normalSecret
  Assert-True ($decrypt.result.pass -and $decrypt.result.decryptedStreamSha256 -ceq ('f'*64) -and $decrypt.result.decryptedStreamBytes -eq 4096) 'decrypt-to-hash returns exact binary identity'
  Assert-True ($decrypt.state.writerCount -eq 1 -and $decrypt.state.ageCount -eq 1 -and $decrypt.state.clearCount -eq 1) 'decrypt bridge writes one line, invokes age once, and clears console input'
  $wrongDecrypt=Invoke-SyntheticDecryptCase -First $normalSecret -Confirmation $normalSecret -ExitCode 1
  Assert-True (-not $wrongDecrypt.result.pass -and $wrongDecrypt.result.safeErrorCode -ceq 'PHASE7B_WP2_AGE_DECRYPTION_FAILED') 'wrong decrypt passphrase/nonzero age result fails closed'
  $cancelDecrypt=Invoke-SyntheticDecryptCase -Cancelled $true
  Assert-True (-not $cancelDecrypt.result.pass -and $cancelDecrypt.result.safeErrorCode -ceq 'PHASE7B_WP2_AGE_PASSPHRASE_CANCELLED' -and $cancelDecrypt.state.ageCount -eq 0) 'decrypt cancellation launches no age process'

  $emptyFirst = Invoke-SyntheticBridgeCase -First '' -Confirmation ('b' * 32) -PendingCounts @(0,0)
  Assert-True (-not [bool]$emptyFirst.result.pass -and [string]$emptyFirst.result.safeErrorCode -ceq 'PHASE7B_WP2_AGE_PASSPHRASE_EMPTY' -and $emptyFirst.state.ageCount -eq 0) 'empty first entry fails before age launch'
  $emptyConfirmation = Invoke-SyntheticBridgeCase -First ('b' * 32) -Confirmation '' -PendingCounts @(0,0)
  Assert-True (-not [bool]$emptyConfirmation.result.pass -and [string]$emptyConfirmation.result.safeErrorCode -ceq 'PHASE7B_WP2_AGE_PASSPHRASE_CONFIRMATION_EMPTY' -and $emptyConfirmation.state.ageCount -eq 0) 'empty confirmation fails before age launch'
  $mismatch = Invoke-SyntheticBridgeCase -First ('b' * 32) -Confirmation ('c' * 32) -PendingCounts @(0,0)
  Assert-True (-not [bool]$mismatch.result.pass -and [string]$mismatch.result.safeErrorCode -ceq 'PHASE7B_WP2_AGE_PASSPHRASE_MISMATCH' -and $mismatch.state.ageCount -eq 0) 'mismatch fails before age launch'
  $tooShort = Invoke-SyntheticBridgeCase -First ('b' * 15) -Confirmation ('b' * 15) -PendingCounts @(0,0)
  Assert-True (-not [bool]$tooShort.result.pass -and [string]$tooShort.result.safeErrorCode -ceq 'PHASE7B_WP2_AGE_PASSPHRASE_TOO_SHORT' -and $tooShort.state.ageCount -eq 0) 'weak under-bound passphrase fails before age launch'
  $cancel = Invoke-SyntheticBridgeCase -Cancelled $true -PendingCounts @(0,0)
  Assert-True (-not [bool]$cancel.result.pass -and [string]$cancel.result.safeErrorCode -ceq 'PHASE7B_WP2_AGE_PASSPHRASE_CANCELLED' -and $cancel.state.ageCount -eq 0) 'Founder cancellation fails before age launch'

  $unicode = Invoke-SyntheticBridgeCase -First (('d' * 31) + [char]0x00e9) -Confirmation (('d' * 31) + [char]0x00e9) -PendingCounts @(0,0)
  Assert-True (-not [bool]$unicode.result.pass -and [string]$unicode.result.safeErrorCode -ceq 'PHASE7B_WP2_AGE_PASSPHRASE_CHARACTER_SET_UNSUPPORTED' -and $unicode.state.ageCount -eq 0) 'Unicode requiring console translation is rejected instead of silently mistranslated'
  $longSecret = 'e' * 200
  $long = Invoke-SyntheticBridgeCase -First $longSecret -Confirmation $longSecret -PendingCounts @(0,0,402,0,0)
  Assert-True ([bool]$long.result.pass -and [string]$long.state.injectedText -ceq $longSecret) 'long safe passphrase within the contract passes without truncation'
  $tooLong = Invoke-SyntheticBridgeCase -First ('f' * 257) -Confirmation ('f' * 257) -PendingCounts @(0,0)
  Assert-True (-not [bool]$tooLong.result.pass -and [string]$tooLong.result.safeErrorCode -ceq 'PHASE7B_WP2_AGE_PASSPHRASE_LENGTH_UNSUPPORTED' -and $tooLong.state.ageCount -eq 0) 'over-bound input is rejected instead of truncated'

  $partial = Invoke-SyntheticBridgeCase -WriterMode Partial -PendingCounts @(0,0,0)
  Assert-True (-not [bool]$partial.result.pass -and [string]$partial.result.safeErrorCode -ceq 'PHASE7B_WP2_AGE_CONSOLE_INPUT_PARTIAL_WRITE' -and $partial.state.ageCount -eq 0) 'partial WriteConsoleInput result fails before age launch'
  $writerFailure = Invoke-SyntheticBridgeCase -WriterMode Throw -PendingCounts @(0,0,0)
  Assert-True (-not [bool]$writerFailure.result.pass -and [string]$writerFailure.result.safeErrorCode -ceq 'PHASE7B_WP2_AGE_SECURE_INPUT_BRIDGE_EXCEPTION' -and $writerFailure.state.ageCount -eq 0) 'console injection exception fails before age launch'
  $extra = Invoke-SyntheticBridgeCase -PendingCounts @(0,0,67,0)
  Assert-True (-not [bool]$extra.result.pass -and [string]$extra.result.safeErrorCode -ceq 'PHASE7B_WP2_AGE_CONSOLE_INPUT_SEQUENCE_MISMATCH' -and $extra.state.ageCount -eq 0) 'unexpected extra console keyboard record fails before age launch'
  $contaminated = Invoke-SyntheticBridgeCase -PendingCounts @(1,0)
  Assert-True (-not [bool]$contaminated.result.pass -and [string]$contaminated.result.safeErrorCode -ceq 'PHASE7B_WP2_AGE_CONSOLE_INPUT_CONTAMINATED' -and $contaminated.state.writerCount -eq 0 -and $contaminated.state.ageCount -eq 0) 'preexisting console input contamination fails closed'
  $ageNonzero = Invoke-SyntheticBridgeCase -AgeMode Nonzero
  Assert-True (-not [bool]$ageNonzero.result.pass -and [string]$ageNonzero.result.safeErrorCode -ceq 'PHASE7B_WP2_AGE_ENCRYPTION_FAILED' -and $ageNonzero.state.ageCount -eq 1) 'age nonzero exit fails closed'
  $ageLaunchFailure = Invoke-SyntheticBridgeCase -AgeMode Throw
  Assert-True (-not [bool]$ageLaunchFailure.result.pass -and [string]$ageLaunchFailure.result.safeErrorCode -ceq 'PHASE7B_WP2_AGE_SECURE_INPUT_BRIDGE_EXCEPTION' -and $ageLaunchFailure.state.ageCount -eq 1) 'age launch exception fails closed'
  $notFullyConsumed = Invoke-SyntheticBridgeCase -PendingCounts @(0,0,66,1,0)
  Assert-True (-not [bool]$notFullyConsumed.result.pass -and [string]$notFullyConsumed.result.safeErrorCode -ceq 'PHASE7B_WP2_AGE_CONSOLE_INPUT_NOT_FULLY_CONSUMED') 'unconsumed console input after age fails closed'

  foreach ($case in @($emptyFirst,$emptyConfirmation,$mismatch,$tooShort,$cancel,$unicode,$tooLong,$partial,$writerFailure,$extra,$contaminated,$ageNonzero,$ageLaunchFailure,$notFullyConsumed)) {
    Assert-True ($case.state.clearCount -eq 1 -and [bool]$case.result.consoleInputCleanupPass) 'every failure and cancellation path clears and verifies console input'
  }
  $serializedResults = @($normal,$emptyFirst,$emptyConfirmation,$mismatch,$tooShort,$cancel,$unicode,$long,$tooLong,$partial,$writerFailure,$extra,$contaminated,$ageNonzero,$ageLaunchFailure,$notFullyConsumed | ForEach-Object { $_.result | ConvertTo-Json -Compress }) -join [Environment]::NewLine
  Assert-True (-not $serializedResults.Contains($normalSecret) -and -not $serializedResults.Contains($longSecret)) 'safe bridge results contain no synthetic secret'
  Assert-True (-not (Test-Path Env:\AGE_PASSPHRASE) -and -not (Test-Path Env:\AGE_PASSPHRASE_FD)) 'bridge creates no age passphrase environment channel'

  if ($RunAttachedConsoleAgeIntegration) {
    if ([string]::IsNullOrWhiteSpace($AgeExePath) -or -not (Test-Path -LiteralPath $AgeExePath -PathType Leaf)) { throw 'ATTACHED_CONSOLE_AGE_PATH_REQUIRED' }
    if ($null -eq ('Phase7BConsoleInputTestInjector' -as [type])) {
      Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

public static class Phase7BConsoleInputTestInjector
{
    private const uint GENERIC_READ = 0x80000000;
    private const uint GENERIC_WRITE = 0x40000000;
    private const uint FILE_SHARE_READ = 0x00000001;
    private const uint FILE_SHARE_WRITE = 0x00000002;
    private const uint OPEN_EXISTING = 3;

    [StructLayout(LayoutKind.Explicit, CharSet = CharSet.Unicode, Size = 20)]
    private struct INPUT_RECORD
    {
        [FieldOffset(0)] public short EventType;
        [FieldOffset(4)] public int KeyDown;
        [FieldOffset(8)] public ushort RepeatCount;
        [FieldOffset(14)] public char UnicodeChar;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeFileHandle CreateFileW(string fileName, uint desiredAccess, uint shareMode, IntPtr securityAttributes, uint creationDisposition, uint flagsAndAttributes, IntPtr templateFile);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool WriteConsoleInputW(SafeFileHandle consoleInput, [In] INPUT_RECORD[] buffer, uint length, out uint written);

    public static int Write(short[] eventTypes, int[] keyDown, int[] repeatCounts, char[] unicodeCharacters)
    {
        if (eventTypes == null || keyDown == null || repeatCounts == null || unicodeCharacters == null ||
            eventTypes.Length != keyDown.Length || eventTypes.Length != repeatCounts.Length || eventTypes.Length != unicodeCharacters.Length)
            throw new ArgumentException("Synthetic input arrays must be non-null and have identical lengths.");
        INPUT_RECORD[] records = new INPUT_RECORD[eventTypes.Length];
        for (int index = 0; index < records.Length; index++)
        {
            records[index].EventType = eventTypes[index];
            records[index].KeyDown = keyDown[index];
            records[index].RepeatCount = (ushort)repeatCounts[index];
            records[index].UnicodeChar = unicodeCharacters[index];
        }
        try
        {
            using (SafeFileHandle handle = CreateFileW("CONIN$", GENERIC_READ | GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE, IntPtr.Zero, OPEN_EXISTING, 0, IntPtr.Zero))
            {
                if (handle == null || handle.IsInvalid) throw new Win32Exception(Marshal.GetLastWin32Error());
                uint written;
                if (!WriteConsoleInputW(handle, records, (uint)records.Length, out written)) throw new Win32Exception(Marshal.GetLastWin32Error());
                return (int)written;
            }
        }
        finally
        {
            Array.Clear(records, 0, records.Length);
        }
    }
}
'@
    }

    [Phase7BWindowsConsoleInputBridge]::ClearPendingInputRecords()
    $realHarmlessWritten = [Phase7BConsoleInputTestInjector]::Write(
      [int16[]](0x0002,0x0004,0x0008,0x0010), [int[]](0,0,0,0), [int[]](0,0,0,0), [char[]]([char]0,[char]0,[char]0,[char]0))
    $realHarmlessPolicy = [Phase7BWindowsConsoleInputBridge]::DrainHarmlessInputAndRequireNoKeyboard('PHASE7B_WP2_AGE_CONSOLE_INPUT_CONTAMINATED')
    Assert-True ($realHarmlessWritten -eq 4 -and $realHarmlessPolicy.Pass -and $realHarmlessPolicy.HarmlessRecordCount -eq 4 -and [Phase7BWindowsConsoleInputBridge]::GetPendingInputRecordCount() -eq 0) 'real attached ConsoleHost drains queued mouse, resize, menu, and focus records'

    [void][Phase7BConsoleInputTestInjector]::Write([int16[]]@(0x0001), [int[]]@(1), [int[]]@(1), [char[]]@('x'))
    $realKeyboardPolicy = [Phase7BWindowsConsoleInputBridge]::DrainHarmlessInputAndRequireNoKeyboard('PHASE7B_WP2_AGE_CONSOLE_INPUT_CONTAMINATED')
    Assert-True (-not $realKeyboardPolicy.Pass -and $realKeyboardPolicy.SafeErrorCode -ceq 'PHASE7B_WP2_AGE_CONSOLE_INPUT_CONTAMINATED') 'real attached ConsoleHost rejects queued keyboard input'
    [Phase7BWindowsConsoleInputBridge]::ClearPendingInputRecords()

    [void][Phase7BConsoleInputTestInjector]::Write([int16[]]@(0x0020), [int[]]@(0), [int[]]@(0), [char[]]@([char]0))
    $realUnknownPolicy = [Phase7BWindowsConsoleInputBridge]::DrainHarmlessInputAndRequireNoKeyboard('PHASE7B_WP2_AGE_CONSOLE_INPUT_CONTAMINATED')
    Assert-True (-not $realUnknownPolicy.Pass -and $realUnknownPolicy.SafeErrorCode -ceq 'PHASE7B_WP2_AGE_CONSOLE_INPUT_UNKNOWN_EVENT') 'real attached ConsoleHost rejects unknown input record types'
    [Phase7BWindowsConsoleInputBridge]::ClearPendingInputRecords()

    $integrationRoot = Join-Path ([IO.Path]::GetTempPath()) ("phase7b-age-bridge-test-" + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $integrationRoot -ErrorAction Stop | Out-Null
    try {
      $inputPath = Join-Path $integrationRoot 'synthetic-input.bin'
      $outputPath = Join-Path $integrationRoot 'synthetic-output.age'
      [IO.File]::WriteAllBytes($inputPath, [byte[]](1,2,3,4,5,6,7,8))
      $integrationSecret = ('Ab9-_!~+' * 4)
      $integrationResult = & $module {
        param($Executable,$SyntheticInputPath,$SyntheticOutputPath,$Secret)
        Initialize-Phase7BWindowsConsoleInputBridge
        $prompt = {
          [pscustomobject]@{
            cancelled = $false
            first = New-Phase7BSecureStringFromText -Value $Secret
            confirmation = New-Phase7BSecureStringFromText -Value $Secret
          }
        }
        $policy = { param([string]$Operation,[AllowNull()][char[]]$Characters,[int]$LineCount);switch($Operation){'Prepare'{[Phase7BWindowsConsoleInputBridge]::DrainHarmlessInputAndRequireNoKeyboard('PHASE7B_WP2_AGE_CONSOLE_INPUT_CONTAMINATED')}'VerifyInjected'{[Phase7BWindowsConsoleInputBridge]::VerifyPassphraseLines($Characters,$LineCount)}'PostAge'{[Phase7BWindowsConsoleInputBridge]::DrainHarmlessInputAndRequireNoKeyboard('PHASE7B_WP2_AGE_CONSOLE_INPUT_NOT_FULLY_CONSUMED')}'CleanupVerify'{[Phase7BWindowsConsoleInputBridge]::RequireEmptyInput()}default{throw 'PHASE7B_WP2_AGE_CONSOLE_INPUT_POLICY_OPERATION_FAIL'}} }
        $clearer = { [Phase7BWindowsConsoleInputBridge]::ClearPendingInputRecords() }
        $writer = { param([char[]]$Characters) [Phase7BWindowsConsoleInputBridge]::WritePassphraseLines($Characters, 2) }
        $invoker = { param($Exe,$OutputFile,$InputFile) & $Exe -p -o $OutputFile $InputFile; [int]$LASTEXITCODE }
        Invoke-Phase7BAgeEncryptionBridgeCore -AgeExePath $Executable -InputPath $SyntheticInputPath -OutputPath $SyntheticOutputPath `
          -PromptProvider $prompt -InputPolicyProvider $policy -InputClearer $clearer -InputWriter $writer -AgeInvoker $invoker
      } $AgeExePath $inputPath $outputPath $integrationSecret
      if (-not [bool]$integrationResult.pass) { Write-Output ($integrationResult | ConvertTo-Json -Compress) }
      Assert-True ([bool]$integrationResult.pass -and [int]$integrationResult.ageExitCode -eq 0) 'real attached-console age v1.3.1 accepts the exact synthetic passphrase twice'
      Assert-True ((Test-Path -LiteralPath $outputPath -PathType Leaf) -and (Get-Item -LiteralPath $outputPath).Length -gt 0) 'synthetic attached-console encryption creates a nonempty encrypted fixture'
      Assert-True (-not (($integrationResult | ConvertTo-Json -Compress).Contains($integrationSecret))) 'attached-console result contains no synthetic passphrase'
      $decryptResult = & $module {
        param($Executable,$CiphertextPath,$Secret)
        Initialize-Phase7BWindowsConsoleInputBridge
        $prompt={ [pscustomobject]@{cancelled=$false;first=New-Phase7BSecureStringFromText $Secret;confirmation=New-Phase7BSecureStringFromText $Secret} }
        $policy={param([string]$Operation,[AllowNull()][char[]]$Characters,[int]$LineCount);switch($Operation){'Prepare'{[Phase7BWindowsConsoleInputBridge]::DrainHarmlessInputAndRequireNoKeyboard('PHASE7B_WP2_AGE_CONSOLE_INPUT_CONTAMINATED')}'VerifyInjected'{[Phase7BWindowsConsoleInputBridge]::VerifyPassphraseLines($Characters,$LineCount)}'PostAge'{[Phase7BWindowsConsoleInputBridge]::DrainHarmlessInputAndRequireNoKeyboard('PHASE7B_WP2_AGE_CONSOLE_INPUT_NOT_FULLY_CONSUMED')}'CleanupVerify'{[Phase7BWindowsConsoleInputBridge]::RequireEmptyInput()}default{throw 'PHASE7B_WP2_AGE_CONSOLE_INPUT_POLICY_OPERATION_FAIL'}}}
        $clearer={ [Phase7BWindowsConsoleInputBridge]::ClearPendingInputRecords() }
        $writer={param([char[]]$Characters)[Phase7BWindowsConsoleInputBridge]::WritePassphraseLines($Characters,1)}
        $invoker={
          param($Exe,$Cipher)
          $start=New-Object Diagnostics.ProcessStartInfo;$start.FileName=$Exe;$start.Arguments="--decrypt `"$Cipher`"";$start.UseShellExecute=$false;$start.RedirectStandardOutput=$true
          $process=New-Object Diagnostics.Process;$process.StartInfo=$start;$sha=[Security.Cryptography.SHA256]::Create();$buffer=New-Object byte[] 4096;$count=[int64]0
          try{[void]$process.Start();$stream=$process.StandardOutput.BaseStream;while(($read=$stream.Read($buffer,0,$buffer.Length))-gt 0){[void]$sha.TransformBlock($buffer,0,$read,$null,0);$count+=$read};[void]$sha.TransformFinalBlock((New-Object byte[] 0),0,0);$process.WaitForExit();[pscustomobject]@{exitCode=$process.ExitCode;sha256=([BitConverter]::ToString($sha.Hash)).Replace('-','').ToLowerInvariant();bytes=$count}}finally{[Array]::Clear($buffer,0,$buffer.Length);$sha.Dispose();$process.Dispose()}
        }
        Invoke-Phase7BAgeDecryptionToHashBridgeCore -AgeExePath $Executable -CiphertextPath $CiphertextPath -PromptProvider $prompt -InputPolicyProvider $policy -InputClearer $clearer -InputWriter $writer -AgeInvoker $invoker
      } $AgeExePath $outputPath $integrationSecret
      if (-not [bool]$decryptResult.pass) { Write-Output ($decryptResult | ConvertTo-Json -Compress) }
      $inputBytes = [IO.File]::ReadAllBytes($inputPath)
      $inputSha = [Security.Cryptography.SHA256]::Create()
      try {
        $inputHash = ([BitConverter]::ToString($inputSha.ComputeHash($inputBytes))).Replace('-','').ToLowerInvariant()
      } finally {
        [Array]::Clear($inputBytes, 0, $inputBytes.Length)
        $inputSha.Dispose()
      }
      Assert-True ($decryptResult.pass -and $decryptResult.decryptedStreamSha256 -ceq $inputHash -and $decryptResult.decryptedStreamBytes -eq 8) 'real age decrypts binary output directly to the expected SHA-256 and byte count'
      Assert-True (-not (Test-Path -LiteralPath (Join-Path $integrationRoot 'decrypted.bin'))) 'real decrypt round trip writes no plaintext output file'
    } finally {
      if (Test-Path -LiteralPath $integrationRoot) { Remove-Item -LiteralPath $integrationRoot -Recurse -Force }
    }
  }
} finally {
  Remove-Module $module -Force -ErrorAction SilentlyContinue
}

[ordered]@{
  classification = 'PHASE7B_WINDOWS_AGE_PASSPHRASE_BRIDGE_TESTS_PASS'
  pass = $true
  assertions = $script:assertions
  attachedConsoleAgeIntegration = [bool]$RunAttachedConsoleAgeIntegration
  syntheticSecretsOnly = $true
  liveMigrationExecutionPerformed = $false
  automaticRetryAllowed = $false
  wp2cAuthorized = $false
} | ConvertTo-Json -Compress
