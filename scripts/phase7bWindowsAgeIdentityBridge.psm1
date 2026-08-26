Set-StrictMode -Version Latest

function Test-Phase7BAgeRecipientShape {
  [CmdletBinding()] param([Parameter(Mandatory = $true)][string]$Value)
  return [bool]($Value -cmatch '^age1[023456789acdefghjklmnpqrstuvwxyz]{58}$')
}

function ConvertTo-Phase7BSecureStringFromCharacters {
  [CmdletBinding()] param([Parameter(Mandatory = $true)][char[]]$Characters)
  $secure = New-Object Security.SecureString
  try {
    foreach ($character in $Characters) { $secure.AppendChar($character) }
    $secure.MakeReadOnly()
    return $secure
  } catch {
    $secure.Dispose()
    throw
  }
}

function ConvertTo-Phase7BSecretCharacterBuffer {
  [CmdletBinding()] param([Parameter(Mandatory = $true)][Security.SecureString]$SecureValue)
  $pointer = [IntPtr]::Zero
  try {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToGlobalAllocUnicode($SecureValue)
    $characters = New-Object char[] $SecureValue.Length
    for ($index = 0; $index -lt $characters.Length; $index++) {
      $characters[$index] = [char][Runtime.InteropServices.Marshal]::ReadInt16($pointer, $index * 2)
    }
    return $characters
  } finally {
    if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeGlobalAllocUnicode($pointer) }
  }
}

function Clear-Phase7BSecretCharacterBuffer {
  [CmdletBinding()] param([Parameter()][AllowNull()][char[]]$Characters)
  if ($null -ne $Characters) { [Array]::Clear($Characters, 0, $Characters.Length) }
}

function Test-Phase7BAgeIdentityCharacters {
  [CmdletBinding()] param([Parameter(Mandatory = $true)][char[]]$Characters)
  if ($Characters.Length -lt 32 -or $Characters.Length -gt 256) { return $false }
  $prefix = 'AGE-SECRET-KEY-1'.ToCharArray()
  if ($Characters.Length -lt $prefix.Length) { return $false }
  for ($index = 0; $index -lt $prefix.Length; $index++) {
    if ($Characters[$index] -cne $prefix[$index]) { return $false }
  }
  for ($index = 0; $index -lt $Characters.Length; $index++) {
    if ($Characters[$index] -eq [char]0 -or [char]::IsWhiteSpace($Characters[$index])) { return $false }
  }
  return $true
}

function ConvertTo-Phase7BAgeIdentityCandidate {
  [CmdletBinding()] param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$RawValue)
  $rawCharacters = $null
  $normalizedCharacters = $null
  try {
    $rawCharacters = $RawValue.ToCharArray()
    $start = 0
    while ($start -lt $rawCharacters.Length -and [char]::IsWhiteSpace($rawCharacters[$start])) { $start++ }
    $end = $rawCharacters.Length - 1
    while ($end -ge $start -and [char]::IsWhiteSpace($rawCharacters[$end])) { $end-- }
    if ($end -lt $start) { throw 'PHASE7B_WP2_AGE_IDENTITY_FORMAT_FAIL' }

    $normalizedCharacters = New-Object char[] ($end - $start + 1)
    [Array]::Copy($rawCharacters, $start, $normalizedCharacters, 0, $normalizedCharacters.Length)
    if (-not (Test-Phase7BAgeIdentityCharacters -Characters $normalizedCharacters)) {
      throw 'PHASE7B_WP2_AGE_IDENTITY_FORMAT_FAIL'
    }
    $result = [pscustomobject][ordered]@{
      classification = 'PHASE7B_WP2_AGE_IDENTITY_CANDIDATE_NORMALIZED'
      characters = $normalizedCharacters
    }
    $normalizedCharacters = $null
    return $result
  } finally {
    Clear-Phase7BSecretCharacterBuffer -Characters $rawCharacters
    Clear-Phase7BSecretCharacterBuffer -Characters $normalizedCharacters
  }
}

function Resolve-Phase7BAgeIdentityDialogEntries {
  [CmdletBinding()] param(
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$FirstRaw,
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$SecondRaw
  )
  $firstCandidate = $null
  $secondCandidate = $null
  $firstSecure = $null
  $secondSecure = $null
  try {
    $firstCandidate = ConvertTo-Phase7BAgeIdentityCandidate -RawValue $FirstRaw
    $secondCandidate = ConvertTo-Phase7BAgeIdentityCandidate -RawValue $SecondRaw
    if ($firstCandidate.characters.Length -ne $secondCandidate.characters.Length) {
      throw 'PHASE7B_WP2_AGE_IDENTITY_CONFIRMATION_FAIL'
    }
    for ($index = 0; $index -lt $firstCandidate.characters.Length; $index++) {
      if ($firstCandidate.characters[$index] -cne $secondCandidate.characters[$index]) {
        throw 'PHASE7B_WP2_AGE_IDENTITY_CONFIRMATION_FAIL'
      }
    }
    $firstSecure = ConvertTo-Phase7BSecureStringFromCharacters -Characters $firstCandidate.characters
    $secondSecure = ConvertTo-Phase7BSecureStringFromCharacters -Characters $secondCandidate.characters
    $result = [pscustomobject][ordered]@{ first = $firstSecure; second = $secondSecure }
    $firstSecure = $null
    $secondSecure = $null
    return $result
  } finally {
    if ($null -ne $firstCandidate) { Clear-Phase7BSecretCharacterBuffer -Characters $firstCandidate.characters }
    if ($null -ne $secondCandidate) { Clear-Phase7BSecretCharacterBuffer -Characters $secondCandidate.characters }
    if ($null -ne $firstSecure) { $firstSecure.Dispose() }
    if ($null -ne $secondSecure) { $secondSecure.Dispose() }
  }
}

function Set-Phase7BAgeIdentityMaskState {
  [CmdletBinding()] param(
    [Parameter(Mandatory = $true)][object]$FirstControl,
    [Parameter(Mandatory = $true)][object]$SecondControl,
    [Parameter(Mandatory = $true)][bool]$Masked
  )
  $FirstControl.UseSystemPasswordChar = $Masked
  $SecondControl.UseSystemPasswordChar = $Masked
}

function Add-Phase7BAgeIdentityCountHandlers {
  [CmdletBinding()] param(
    [Parameter(Mandatory = $true)][object]$FirstControl,
    [Parameter(Mandatory = $true)][object]$SecondControl,
    [Parameter(Mandatory = $true)][object]$FirstCountLabel,
    [Parameter(Mandatory = $true)][object]$SecondCountLabel
  )
  $getMetadata = {
    param([string]$RawValue)
    $start = 0
    while ($start -lt $RawValue.Length -and [char]::IsWhiteSpace($RawValue[$start])) { $start++ }
    $end = $RawValue.Length - 1
    while ($end -ge $start -and [char]::IsWhiteSpace($RawValue[$end])) { $end-- }
    [pscustomobject][ordered]@{
      rawLength = $RawValue.Length
      normalizedLength = if ($end -ge $start) { $end - $start + 1 } else { 0 }
    }
  }.GetNewClosure()
  $update = {
    $firstMetadata = & $getMetadata $FirstControl.Text
    $secondMetadata = & $getMetadata $SecondControl.Text
    $FirstCountLabel.Text = 'Raw: {0} | Normalized: {1}' -f $firstMetadata.rawLength, $firstMetadata.normalizedLength
    $SecondCountLabel.Text = 'Raw: {0} | Normalized: {1}' -f $secondMetadata.rawLength, $secondMetadata.normalizedLength
  }.GetNewClosure()
  $FirstControl.Add_TextChanged({ & $update }.GetNewClosure())
  $SecondControl.Add_TextChanged({ & $update }.GetNewClosure())
  & $update
  return $update
}

function Add-Phase7BAgeIdentityRevealHandlers {
  [CmdletBinding()] param(
    [Parameter(Mandatory = $true)][object]$Form,
    [Parameter(Mandatory = $true)][object]$RevealControl,
    [Parameter(Mandatory = $true)][object]$FirstControl,
    [Parameter(Mandatory = $true)][object]$SecondControl
  )
  $reveal = {
    $FirstControl.UseSystemPasswordChar = $false
    $SecondControl.UseSystemPasswordChar = $false
  }.GetNewClosure()
  $remask = {
    $FirstControl.UseSystemPasswordChar = $true
    $SecondControl.UseSystemPasswordChar = $true
  }.GetNewClosure()

  $RevealControl.Add_MouseDown({ & $reveal }.GetNewClosure())
  $RevealControl.Add_MouseUp({ & $remask }.GetNewClosure())
  $RevealControl.Add_MouseLeave({ & $remask }.GetNewClosure())
  $RevealControl.Add_Click({ & $remask }.GetNewClosure())
  $Form.Add_Deactivate({ & $remask }.GetNewClosure())
  $Form.Add_FormClosing({ & $remask }.GetNewClosure())
  $Form.Add_Resize({
    if ($Form.WindowState -eq [Windows.Forms.FormWindowState]::Minimized) { & $remask }
  }.GetNewClosure())
  $Form.Add_KeyDown({
    param($sender, $eventArguments)
    if ($eventArguments.KeyCode -eq [Windows.Forms.Keys]::Escape) { & $remask }
  }.GetNewClosure())

  return [pscustomobject][ordered]@{ reveal = $reveal; remask = $remask }
}

function Invoke-Phase7BAgeIdentityDialogEntryValidation {
  [CmdletBinding()] param(
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$FirstRaw,
    [Parameter(Mandatory = $true)][AllowEmptyString()][string]$SecondRaw,
    [Parameter(Mandatory = $true)][object]$FirstControl,
    [Parameter(Mandatory = $true)][object]$SecondControl
  )
  Set-Phase7BAgeIdentityMaskState -FirstControl $FirstControl -SecondControl $SecondControl -Masked $true
  return Resolve-Phase7BAgeIdentityDialogEntries -FirstRaw $FirstRaw -SecondRaw $SecondRaw
}

function Test-Phase7BSecureStringsEqual {
  [CmdletBinding()] param(
    [Parameter(Mandatory = $true)][Security.SecureString]$First,
    [Parameter(Mandatory = $true)][Security.SecureString]$Second
  )
  if ($First.Length -ne $Second.Length) { return $false }
  $firstCharacters = $null
  $secondCharacters = $null
  try {
    $firstCharacters = ConvertTo-Phase7BSecretCharacterBuffer -SecureValue $First
    $secondCharacters = ConvertTo-Phase7BSecretCharacterBuffer -SecureValue $Second
    for ($index = 0; $index -lt $firstCharacters.Length; $index++) {
      if ($firstCharacters[$index] -cne $secondCharacters[$index]) { return $false }
    }
    return $true
  } finally {
    Clear-Phase7BSecretCharacterBuffer -Characters $firstCharacters
    Clear-Phase7BSecretCharacterBuffer -Characters $secondCharacters
  }
}

function Show-Phase7BAgeIdentityDialog {
  [CmdletBinding()] param([switch]$GuestEntry,[switch]$SyntheticObservationOnly)
  if ($SyntheticObservationOnly -and -not $GuestEntry) { throw 'PHASE7B_WP2_SYNTHETIC_GUEST_ONLY' }
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  $form = New-Object Windows.Forms.Form
  $first = New-Object Windows.Forms.TextBox
  $second = New-Object Windows.Forms.TextBox
  $revealController = $null
  try {
    $form.Text = 'PhysiqueOS age recovery identity'
    $form.Size = New-Object Drawing.Size(720, 275)
    $form.StartPosition = 'CenterScreen'
    $form.FormBorderStyle = 'FixedDialog'
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false
    $form.TopMost = $true
    $form.KeyPreview = $true

    $instructions = New-Object Windows.Forms.Label
    $instructions.Location = New-Object Drawing.Point(18, 15)
    $instructions.Size = New-Object Drawing.Size(670, 42)
    $instructions.Text = 'Paste the single Founder AGE-SECRET-KEY identity twice. The secret remains masked and is never written to disk or command-line arguments.'
    if ($GuestEntry) { $instructions.Text = 'Isolated guest: use only the separately synthetic-validated input method. Check destination focus before each field. This dialog cannot prevent host-side misdelivery.' }
    if ($SyntheticObservationOnly) { $instructions.Text = 'SYNTHETIC ONLY: enter the public invalid test value, never a real identity. The same guest dialog controls are under focus/target testing.' }
    $form.Controls.Add($instructions)

    $firstLabel = New-Object Windows.Forms.Label
    $firstLabel.Location = New-Object Drawing.Point(18, 68)
    $firstLabel.Size = New-Object Drawing.Size(160, 20)
    $firstLabel.Text = 'Recovery identity'
    $form.Controls.Add($firstLabel)
    $first.Location = New-Object Drawing.Point(180, 65)
    $first.Size = New-Object Drawing.Size(340, 22)
    $first.UseSystemPasswordChar = $true
    $first.ShortcutsEnabled = $true
    $form.Controls.Add($first)
    $firstCount = New-Object Windows.Forms.Label
    $firstCount.Location = New-Object Drawing.Point(530, 68)
    $firstCount.Size = New-Object Drawing.Size(165, 20)
    $form.Controls.Add($firstCount)

    $secondLabel = New-Object Windows.Forms.Label
    $secondLabel.Location = New-Object Drawing.Point(18, 106)
    $secondLabel.Size = New-Object Drawing.Size(160, 20)
    $secondLabel.Text = 'Confirm identity'
    $form.Controls.Add($secondLabel)
    $second.Location = New-Object Drawing.Point(180, 103)
    $second.Size = New-Object Drawing.Size(340, 22)
    $second.UseSystemPasswordChar = $true
    $second.ShortcutsEnabled = $true
    $form.Controls.Add($second)
    $secondCount = New-Object Windows.Forms.Label
    $secondCount.Location = New-Object Drawing.Point(530, 106)
    $secondCount.Size = New-Object Drawing.Size(165, 20)
    $form.Controls.Add($secondCount)

    $status = New-Object Windows.Forms.Label
    $status.Location = New-Object Drawing.Point(18, 140)
    $status.Size = New-Object Drawing.Size(670, 24)
    $status.Text = 'Both fields must contain the same single native age identity.'
    $form.Controls.Add($status)

    $reveal = New-Object Windows.Forms.Button
    $reveal.Location = New-Object Drawing.Point(365, 174)
    $reveal.Size = New-Object Drawing.Size(125, 28)
    $reveal.Text = 'Hold to reveal'
    $reveal.TabStop = $false
    $form.Controls.Add($reveal)
    if ($GuestEntry) { $reveal.Visible = $false }

    $ok = New-Object Windows.Forms.Button
    $ok.Location = New-Object Drawing.Point(505, 174)
    $ok.Size = New-Object Drawing.Size(80, 28)
    $ok.Text = 'Verify'
    $form.Controls.Add($ok)
    $cancel = New-Object Windows.Forms.Button
    $cancel.Location = New-Object Drawing.Point(597, 174)
    $cancel.Size = New-Object Drawing.Size(80, 28)
    $cancel.Text = 'Cancel'
    $cancel.DialogResult = [Windows.Forms.DialogResult]::Cancel
    $form.Controls.Add($cancel)
    $form.CancelButton = $cancel

    $updateCounts = Add-Phase7BAgeIdentityCountHandlers -FirstControl $first -SecondControl $second -FirstCountLabel $firstCount -SecondCountLabel $secondCount
    $revealController = Add-Phase7BAgeIdentityRevealHandlers -Form $form -RevealControl $reveal -FirstControl $first -SecondControl $second

    $ok.Add_Click({
      if ($SyntheticObservationOnly) {
        $form.DialogResult = [Windows.Forms.DialogResult]::OK
        $form.Close()
        return
      }
      try {
        $form.Tag = Invoke-Phase7BAgeIdentityDialogEntryValidation -FirstRaw $first.Text -SecondRaw $second.Text -FirstControl $first -SecondControl $second
      } catch {
        Set-Phase7BAgeIdentityMaskState -FirstControl $first -SecondControl $second -Masked $true
        if ($_.Exception.Message -match 'CONFIRMATION_FAIL') {
          $status.Text = 'The two masked entries do not match.'
        } else {
          $status.Text = 'Identity format is invalid.'
        }
        return
      }
      Set-Phase7BAgeIdentityMaskState -FirstControl $first -SecondControl $second -Masked $true
      $first.Clear()
      $second.Clear()
      $form.DialogResult = [Windows.Forms.DialogResult]::OK
      $form.Close()
    })
    if (-not $GuestEntry) { $form.AcceptButton = $ok }
    $result = $form.ShowDialog()
    if ($SyntheticObservationOnly) {
      # This path never returns a SecureString or invokes age. Invalid fixed value only.
      $expectedSynthetic = 'AGE-SECRET-KEY-' + ('I' * 59)
      return [pscustomobject][ordered]@{firstFieldExact=($first.Text -ceq $expectedSynthetic);secondFieldExact=($second.Text -ceq $expectedSynthetic);firstCount=$first.Text.Length;secondCount=$second.Text.Length;dialogConfirmed=($result -eq [Windows.Forms.DialogResult]::OK);syntheticObservationOnly=$true}
    }
    if ($result -ne [Windows.Forms.DialogResult]::OK -or $null -eq $form.Tag) {
      throw 'PHASE7B_WP2_AGE_IDENTITY_ENTRY_CANCELLED'
    }
    $pair = $form.Tag
    $form.Tag = $null
    return $pair
  } finally {
    Set-Phase7BAgeIdentityMaskState -FirstControl $first -SecondControl $second -Masked $true
    if ($null -ne $form.Tag) {
      if ($null -ne $form.Tag.first) { $form.Tag.first.Dispose() }
      if ($null -ne $form.Tag.second) { $form.Tag.second.Dispose() }
      $form.Tag = $null
    }
    $first.Clear()
    $second.Clear()
    $revealController = $null
    $first.Dispose()
    $second.Dispose()
    $form.Dispose()
  }
}

function Invoke-Phase7BAgeKeygenRecipientDerivation {
  [CmdletBinding()] param(
    [Parameter(Mandatory = $true)][string]$AgeKeygenPath,
    [Parameter(Mandatory = $true)][Security.SecureString]$Identity
  )
  $characters = $null
  $process = $null
  try {
    $characters = ConvertTo-Phase7BSecretCharacterBuffer -SecureValue $Identity
    if (-not (Test-Phase7BAgeIdentityCharacters -Characters $characters)) { throw 'PHASE7B_WP2_AGE_IDENTITY_FORMAT_FAIL' }
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = [IO.Path]::GetFullPath($AgeKeygenPath)
    $start.Arguments = '-y'
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardInput = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $start
    if (-not $process.Start()) { throw 'PHASE7B_WP2_AGE_IDENTITY_DERIVATION_START_FAIL' }
    $errorTask = $process.StandardError.ReadToEndAsync()
    $process.StandardInput.Write($characters, 0, $characters.Length)
    $process.StandardInput.Write([char]10)
    $process.StandardInput.Close()
    $output = $process.StandardOutput.ReadToEnd()
    $process.WaitForExit()
    [void]$errorTask.Result
    $recipient = $output.Trim()
    if ($process.ExitCode -ne 0 -or -not (Test-Phase7BAgeRecipientShape -Value $recipient)) {
      throw 'PHASE7B_WP2_AGE_IDENTITY_DERIVATION_FAIL'
    }
    return $recipient
  } finally {
    Clear-Phase7BSecretCharacterBuffer -Characters $characters
    if ($null -ne $process) { $process.Dispose() }
  }
}

function Request-Phase7BVerifiedAgeIdentity {
  [CmdletBinding()] param(
    [Parameter(Mandatory = $true)][string]$AgeKeygenPath,
    [Parameter(Mandatory = $true)][string]$ExpectedAgeRecipient,
    [Parameter()][scriptblock]$PromptProvider,
    [Parameter()][scriptblock]$RecipientDeriver,
    [Parameter()][switch]$GuestEntry
  )
  if (-not (Test-Path -LiteralPath $AgeKeygenPath -PathType Leaf) -or -not (Test-Phase7BAgeRecipientShape -Value $ExpectedAgeRecipient)) {
    throw 'PHASE7B_WP2_AGE_IDENTITY_VERIFICATION_ARGUMENT_FAIL'
  }
  if ($null -eq $PromptProvider) { $PromptProvider = { Show-Phase7BAgeIdentityDialog -GuestEntry:$GuestEntry } }
  if ($null -eq $RecipientDeriver) {
    $RecipientDeriver = { param($path, $identity) Invoke-Phase7BAgeKeygenRecipientDerivation -AgeKeygenPath $path -Identity $identity }
  }
  $pair = $null
  try {
    $pair = & $PromptProvider
    if ($null -eq $pair -or $null -eq $pair.first -or $null -eq $pair.second -or
        $pair.first -isnot [Security.SecureString] -or $pair.second -isnot [Security.SecureString]) {
      throw 'PHASE7B_WP2_AGE_IDENTITY_ENTRY_FAIL'
    }
    $firstCharacters = $null
    try {
      $firstCharacters = ConvertTo-Phase7BSecretCharacterBuffer -SecureValue $pair.first
      if (-not (Test-Phase7BAgeIdentityCharacters -Characters $firstCharacters)) { throw 'PHASE7B_WP2_AGE_IDENTITY_FORMAT_FAIL' }
    } finally { Clear-Phase7BSecretCharacterBuffer -Characters $firstCharacters }
    if (-not (Test-Phase7BSecureStringsEqual -First $pair.first -Second $pair.second)) { throw 'PHASE7B_WP2_AGE_IDENTITY_CONFIRMATION_FAIL' }
    $derivedRecipient = & $RecipientDeriver $AgeKeygenPath $pair.first
    if ([string]$derivedRecipient -cne $ExpectedAgeRecipient) { throw 'PHASE7B_WP2_AGE_IDENTITY_RECIPIENT_MISMATCH' }
    $pair.second.Dispose()
    $pair.second = $null
    return [pscustomobject][ordered]@{
      classification = 'PHASE7B_WP2_AGE_IDENTITY_VERIFIED'
      pass = $true
      identity = $pair.first
      ageRecipient = $derivedRecipient
      nativeRecipientRequired = $true
      identityInputMode = 'stdin'
      secretPersisted = $false
    }
  } catch {
    if ($null -ne $pair) {
      if ($null -ne $pair.first) { $pair.first.Dispose() }
      if ($null -ne $pair.second) { $pair.second.Dispose() }
    }
    throw
  }
}

function Assert-Phase7BAgeIdentityRecipient {
  [CmdletBinding()] param(
    [Parameter(Mandatory = $true)][string]$AgeKeygenPath,
    [Parameter(Mandatory = $true)][Security.SecureString]$Identity,
    [Parameter(Mandatory = $true)][string]$ExpectedAgeRecipient
  )
  if (-not (Test-Path -LiteralPath $AgeKeygenPath -PathType Leaf) -or -not (Test-Phase7BAgeRecipientShape -Value $ExpectedAgeRecipient)) {
    throw 'PHASE7B_WP2_AGE_IDENTITY_VERIFICATION_ARGUMENT_FAIL'
  }
  $derived = Invoke-Phase7BAgeKeygenRecipientDerivation -AgeKeygenPath $AgeKeygenPath -Identity $Identity
  if ($derived -cne $ExpectedAgeRecipient) { throw 'PHASE7B_WP2_AGE_IDENTITY_RECIPIENT_MISMATCH' }
  [pscustomobject][ordered]@{ classification='PHASE7B_WP2_AGE_IDENTITY_VERIFIED';pass=$true;ageRecipient=$derived;secretPersisted=$false }
}

function Quote-Phase7BProcessArgument {
  [CmdletBinding()] param([Parameter(Mandatory = $true)][string]$Value)
  if ($Value.Contains('"')) { throw 'PHASE7B_WP2_AGE_PROCESS_ARGUMENT_FAIL' }
  return '"' + $Value + '"'
}

function Invoke-Phase7BAgeNativeRecipientEncryption {
  [CmdletBinding()] param(
    [Parameter(Mandatory = $true)][string]$AgeExePath,
    [Parameter(Mandatory = $true)][string]$InputPath,
    [Parameter(Mandatory = $true)][string]$OutputPath,
    [Parameter(Mandatory = $true)][string]$AgeRecipient
  )
  if (-not (Test-Path -LiteralPath $AgeExePath -PathType Leaf) -or -not (Test-Path -LiteralPath $InputPath -PathType Leaf) -or
      (Test-Path -LiteralPath $OutputPath) -or -not (Test-Phase7BAgeRecipientShape -Value $AgeRecipient)) {
    throw 'PHASE7B_WP2_AGE_NATIVE_ENCRYPT_ARGUMENT_FAIL'
  }
  $process = $null
  try {
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = [IO.Path]::GetFullPath($AgeExePath)
    $start.Arguments = '-r ' + $AgeRecipient + ' -o ' + (Quote-Phase7BProcessArgument -Value ([IO.Path]::GetFullPath($OutputPath))) + ' ' + (Quote-Phase7BProcessArgument -Value ([IO.Path]::GetFullPath($InputPath)))
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $start
    if (-not $process.Start()) { throw 'PHASE7B_WP2_AGE_NATIVE_ENCRYPT_START_FAIL' }
    $outputTask = $process.StandardOutput.ReadToEndAsync()
    $errorTask = $process.StandardError.ReadToEndAsync()
    $process.WaitForExit()
    [void]$outputTask.Result
    [void]$errorTask.Result
    if ($process.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $OutputPath -PathType Leaf) -or (Get-Item -LiteralPath $OutputPath).Length -lt 1) {
      throw 'PHASE7B_WP2_AGE_NATIVE_ENCRYPT_FAIL'
    }
    [pscustomobject][ordered]@{ classification='PHASE7B_WP2_AGE_NATIVE_RECIPIENT_ENCRYPT_PASS';pass=$true;ageRecipient=$AgeRecipient;secretInputUsed=$false }
  } finally { if ($null -ne $process) { $process.Dispose() } }
}

function Invoke-Phase7BAgeNativeIdentityDecryptionToHash {
  [CmdletBinding()] param(
    [Parameter(Mandatory = $true)][string]$AgeExePath,
    [Parameter(Mandatory = $true)][string]$CiphertextPath,
    [Parameter(Mandatory = $true)][Security.SecureString]$Identity
  )
  $characters = $null
  $process = $null
  $sha = $null
  try {
    if (-not (Test-Path -LiteralPath $AgeExePath -PathType Leaf) -or -not (Test-Path -LiteralPath $CiphertextPath -PathType Leaf)) {
      throw 'PHASE7B_WP2_AGE_NATIVE_DECRYPT_ARGUMENT_FAIL'
    }
    $characters = ConvertTo-Phase7BSecretCharacterBuffer -SecureValue $Identity
    if (-not (Test-Phase7BAgeIdentityCharacters -Characters $characters)) { throw 'PHASE7B_WP2_AGE_IDENTITY_FORMAT_FAIL' }
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = [IO.Path]::GetFullPath($AgeExePath)
    $start.Arguments = '--decrypt -i - ' + (Quote-Phase7BProcessArgument -Value ([IO.Path]::GetFullPath($CiphertextPath)))
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardInput = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $start
    if (-not $process.Start()) { throw 'PHASE7B_WP2_AGE_NATIVE_DECRYPT_START_FAIL' }
    $errorTask = $process.StandardError.ReadToEndAsync()
    $process.StandardInput.Write($characters, 0, $characters.Length)
    $process.StandardInput.Write([char]10)
    $process.StandardInput.Close()
    $sha = [Security.Cryptography.SHA256]::Create()
    $buffer = New-Object byte[] 65536
    [int64]$totalBytes = 0
    while (($count = $process.StandardOutput.BaseStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
      [void]$sha.TransformBlock($buffer, 0, $count, $buffer, 0)
      $totalBytes += $count
    }
    [void]$sha.TransformFinalBlock((New-Object byte[] 0), 0, 0)
    $process.WaitForExit()
    [void]$errorTask.Result
    if ($process.ExitCode -ne 0 -or $totalBytes -lt 1) { throw 'PHASE7B_WP2_AGE_NATIVE_DECRYPT_FAIL' }
    $digest = ([BitConverter]::ToString($sha.Hash)).Replace('-', '').ToLowerInvariant()
    [pscustomobject][ordered]@{
      classification = 'PHASE7B_WP2_AGE_DECRYPT_TO_HASH_PASS'
      pass = $true
      decryptedStreamSha256 = $digest
      decryptedStreamBytes = $totalBytes
      identityInputMode = 'stdin'
      plaintextPersisted = $false
    }
  } finally {
    Clear-Phase7BSecretCharacterBuffer -Characters $characters
    if ($null -ne $sha) { $sha.Dispose() }
    if ($null -ne $process) { $process.Dispose() }
  }
}

function Invoke-Phase7BAgeNativeIdentityDecryptionToFile {
  [CmdletBinding()] param(
    [Parameter(Mandatory = $true)][string]$AgeExePath,
    [Parameter(Mandatory = $true)][string]$CiphertextPath,
    [Parameter(Mandatory = $true)][string]$OutputPath,
    [Parameter(Mandatory = $true)][Security.SecureString]$Identity
  )
  $characters = $null
  $process = $null
  try {
    if (-not (Test-Path -LiteralPath $AgeExePath -PathType Leaf) -or -not (Test-Path -LiteralPath $CiphertextPath -PathType Leaf) -or
        (Test-Path -LiteralPath $OutputPath)) { throw 'PHASE7B_WP2_AGE_NATIVE_DECRYPT_ARGUMENT_FAIL' }
    $characters = ConvertTo-Phase7BSecretCharacterBuffer -SecureValue $Identity
    if (-not (Test-Phase7BAgeIdentityCharacters -Characters $characters)) { throw 'PHASE7B_WP2_AGE_IDENTITY_FORMAT_FAIL' }
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = [IO.Path]::GetFullPath($AgeExePath)
    $start.Arguments = '--decrypt -i - -o ' + (Quote-Phase7BProcessArgument -Value ([IO.Path]::GetFullPath($OutputPath))) + ' ' + (Quote-Phase7BProcessArgument -Value ([IO.Path]::GetFullPath($CiphertextPath)))
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardInput = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $start
    if (-not $process.Start()) { throw 'PHASE7B_WP2_AGE_NATIVE_DECRYPT_START_FAIL' }
    $outputTask = $process.StandardOutput.ReadToEndAsync()
    $errorTask = $process.StandardError.ReadToEndAsync()
    $process.StandardInput.Write($characters, 0, $characters.Length)
    $process.StandardInput.Write([char]10)
    $process.StandardInput.Close()
    $process.WaitForExit()
    [void]$outputTask.Result
    [void]$errorTask.Result
    if ($process.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $OutputPath -PathType Leaf) -or (Get-Item -LiteralPath $OutputPath).Length -lt 1) {
      throw 'PHASE7B_WP2_AGE_NATIVE_DECRYPT_FAIL'
    }
    [pscustomobject][ordered]@{classification='PHASE7B_WP2_AGE_NATIVE_IDENTITY_DECRYPT_FILE_PASS';pass=$true;identityInputMode='stdin';secretPersisted=$false}
  } finally {
    Clear-Phase7BSecretCharacterBuffer -Characters $characters
    if ($null -ne $process) { $process.Dispose() }
  }
}

function Show-Phase7BGuestSyntheticIdentityObservation {
  [CmdletBinding()] param()
  Show-Phase7BAgeIdentityDialog -GuestEntry -SyntheticObservationOnly
}

Export-ModuleMember -Function @(
  'Show-Phase7BGuestSyntheticIdentityObservation',
  'Test-Phase7BAgeRecipientShape',
  'Request-Phase7BVerifiedAgeIdentity',
  'Assert-Phase7BAgeIdentityRecipient',
  'Invoke-Phase7BAgeNativeRecipientEncryption',
  'Invoke-Phase7BAgeNativeIdentityDecryptionToHash',
  'Invoke-Phase7BAgeNativeIdentityDecryptionToFile'
)
