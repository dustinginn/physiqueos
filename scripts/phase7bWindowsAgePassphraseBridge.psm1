$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$script:Phase7BAgePassphraseMaximumCharacters = 256
$script:Phase7BAgePassphraseMinimumCharacters = 16

function Initialize-Phase7BWindowsConsoleInputBridge {
  if ($null -ne ('Phase7BWindowsConsoleInputBridge' -as [type])) { return }

  Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

public static class Phase7BWindowsConsoleInputBridge
{
    private const uint GENERIC_READ = 0x80000000;
    private const uint GENERIC_WRITE = 0x40000000;
    private const uint FILE_SHARE_READ = 0x00000001;
    private const uint FILE_SHARE_WRITE = 0x00000002;
    private const uint OPEN_EXISTING = 3;
    private const short KEY_EVENT = 0x0001;

    [StructLayout(LayoutKind.Explicit, CharSet = CharSet.Unicode, Size = 20)]
    private struct INPUT_RECORD
    {
        [FieldOffset(0)] public short EventType;
        [FieldOffset(4)] public int KeyDown;
        [FieldOffset(8)] public ushort RepeatCount;
        [FieldOffset(10)] public ushort VirtualKeyCode;
        [FieldOffset(12)] public ushort VirtualScanCode;
        [FieldOffset(14)] public char UnicodeChar;
        [FieldOffset(16)] public uint ControlKeyState;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeFileHandle CreateFileW(
        string fileName,
        uint desiredAccess,
        uint shareMode,
        IntPtr securityAttributes,
        uint creationDisposition,
        uint flagsAndAttributes,
        IntPtr templateFile);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetNumberOfConsoleInputEvents(SafeFileHandle consoleInput, out uint count);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool FlushConsoleInputBuffer(SafeFileHandle consoleInput);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool WriteConsoleInputW(
        SafeFileHandle consoleInput,
        [In] INPUT_RECORD[] buffer,
        uint length,
        out uint written);

    private static SafeFileHandle OpenConsoleInput()
    {
        SafeFileHandle handle = CreateFileW(
            "CONIN$",
            GENERIC_READ | GENERIC_WRITE,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            IntPtr.Zero,
            OPEN_EXISTING,
            0,
            IntPtr.Zero);
        if (handle == null || handle.IsInvalid)
        {
            if (handle != null) handle.Dispose();
            throw new Win32Exception(Marshal.GetLastWin32Error());
        }
        return handle;
    }

    public static int GetPendingInputRecordCount()
    {
        using (SafeFileHandle handle = OpenConsoleInput())
        {
            uint count;
            if (!GetNumberOfConsoleInputEvents(handle, out count))
                throw new Win32Exception(Marshal.GetLastWin32Error());
            if (count > Int32.MaxValue) throw new InvalidOperationException("Console input count exceeds the supported bound.");
            return (int)count;
        }
    }

    public static void ClearPendingInputRecords()
    {
        using (SafeFileHandle handle = OpenConsoleInput())
        {
            if (!FlushConsoleInputBuffer(handle))
                throw new Win32Exception(Marshal.GetLastWin32Error());
        }
    }

    public static int WriteConfirmedPassphraseLines(char[] passphrase)
    {
        if (passphrase == null || passphrase.Length == 0)
            throw new ArgumentException("A nonempty passphrase is required.", "passphrase");

        int recordCount = checked((passphrase.Length + 1) * 2);
        INPUT_RECORD[] records = new INPUT_RECORD[recordCount];
        int offset = 0;
        for (int line = 0; line < 2; line++)
        {
            for (int index = 0; index < passphrase.Length; index++)
            {
                records[offset++] = NewKeyDownRecord(passphrase[index]);
            }
            records[offset++] = NewKeyDownRecord('\r');
        }

        try
        {
            using (SafeFileHandle handle = OpenConsoleInput())
            {
                uint written;
                if (!WriteConsoleInputW(handle, records, (uint)records.Length, out written))
                    throw new Win32Exception(Marshal.GetLastWin32Error());
                if (written > Int32.MaxValue) throw new InvalidOperationException("Console write count exceeds the supported bound.");
                return (int)written;
            }
        }
        finally
        {
            Array.Clear(records, 0, records.Length);
        }
    }

    private static INPUT_RECORD NewKeyDownRecord(char value)
    {
        INPUT_RECORD record = new INPUT_RECORD();
        record.EventType = KEY_EVENT;
        record.KeyDown = 1;
        record.RepeatCount = 1;
        record.UnicodeChar = value;
        return record;
    }
}
'@
}

function New-Phase7BSecureStringFromText {
  param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Value)

  $secure = New-Object Security.SecureString
  foreach ($character in $Value.ToCharArray()) { $secure.AppendChar($character) }
  $secure.MakeReadOnly()
  return $secure
}

function Show-Phase7BAgePassphraseDialog {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing

  $form = New-Object Windows.Forms.Form
  $first = New-Object Windows.Forms.TextBox
  $confirmation = New-Object Windows.Forms.TextBox
  try {
    $form.Text = 'PhysiqueOS encrypted capture passphrase'
    $form.StartPosition = [Windows.Forms.FormStartPosition]::CenterScreen
    $form.FormBorderStyle = [Windows.Forms.FormBorderStyle]::FixedDialog
    $form.MinimizeBox = $false
    $form.MaximizeBox = $false
    $form.ShowInTaskbar = $true
    $form.ClientSize = New-Object Drawing.Size(560, 238)

    $message = New-Object Windows.Forms.Label
    $message.Location = New-Object Drawing.Point(18, 14)
    $message.Size = New-Object Drawing.Size(524, 48)
    $message.Text = 'Paste the existing Founder-controlled age passphrase twice. Both masked entries must contain 16-256 printable ASCII characters and exactly match before age starts.'

    $firstLabel = New-Object Windows.Forms.Label
    $firstLabel.Location = New-Object Drawing.Point(18, 72)
    $firstLabel.Size = New-Object Drawing.Size(524, 20)
    $firstLabel.Text = 'Passphrase'
    $first.Location = New-Object Drawing.Point(18, 94)
    $first.Size = New-Object Drawing.Size(524, 24)
    $first.UseSystemPasswordChar = $true
    $first.ShortcutsEnabled = $true

    $confirmationLabel = New-Object Windows.Forms.Label
    $confirmationLabel.Location = New-Object Drawing.Point(18, 126)
    $confirmationLabel.Size = New-Object Drawing.Size(524, 20)
    $confirmationLabel.Text = 'Confirm passphrase'
    $confirmation.Location = New-Object Drawing.Point(18, 148)
    $confirmation.Size = New-Object Drawing.Size(524, 24)
    $confirmation.UseSystemPasswordChar = $true
    $confirmation.ShortcutsEnabled = $true

    $ok = New-Object Windows.Forms.Button
    $ok.Location = New-Object Drawing.Point(362, 190)
    $ok.Size = New-Object Drawing.Size(84, 30)
    $ok.Text = 'Continue'
    $ok.DialogResult = [Windows.Forms.DialogResult]::OK

    $cancel = New-Object Windows.Forms.Button
    $cancel.Location = New-Object Drawing.Point(458, 190)
    $cancel.Size = New-Object Drawing.Size(84, 30)
    $cancel.Text = 'Cancel'
    $cancel.DialogResult = [Windows.Forms.DialogResult]::Cancel

    $form.Controls.AddRange(@($message, $firstLabel, $first, $confirmationLabel, $confirmation, $ok, $cancel))
    $form.AcceptButton = $ok
    $form.CancelButton = $cancel
    $form.ActiveControl = $first

    $dialogResult = $form.ShowDialog()
    if ($dialogResult -ne [Windows.Forms.DialogResult]::OK) {
      return [pscustomobject]@{ cancelled = $true; first = $null; confirmation = $null }
    }

    return [pscustomobject]@{
      cancelled = $false
      first = New-Phase7BSecureStringFromText -Value $first.Text
      confirmation = New-Phase7BSecureStringFromText -Value $confirmation.Text
    }
  } finally {
    $first.Clear()
    $confirmation.Clear()
    $form.Dispose()
  }
}

function ConvertTo-Phase7BSecretCharacterBuffer {
  param([Parameter(Mandatory = $true)][Security.SecureString]$SecureValue)

  $pointer = [IntPtr]::Zero
  $buffer = New-Object 'char[]' $SecureValue.Length
  try {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToGlobalAllocUnicode($SecureValue)
    for ($index = 0; $index -lt $buffer.Length; $index++) {
      $buffer[$index] = [char][Runtime.InteropServices.Marshal]::ReadInt16($pointer, $index * 2)
    }
    return ,$buffer
  } finally {
    if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeGlobalAllocUnicode($pointer) }
  }
}

function Clear-Phase7BSecretCharacterBuffer {
  param([AllowNull()][char[]]$Buffer)
  if ($null -eq $Buffer) { return }
  for ($index = 0; $index -lt $Buffer.Length; $index++) { $Buffer[$index] = [char]0 }
}

function Invoke-Phase7BAgeEncryptionBridgeCore {
  param(
    [Parameter(Mandatory = $true)][string]$AgeExePath,
    [Parameter(Mandatory = $true)][string]$InputPath,
    [Parameter(Mandatory = $true)][string]$OutputPath,
    [Parameter(Mandatory = $true)][scriptblock]$PromptProvider,
    [Parameter(Mandatory = $true)][scriptblock]$PendingInputProvider,
    [Parameter(Mandatory = $true)][scriptblock]$InputClearer,
    [Parameter(Mandatory = $true)][scriptblock]$InputWriter,
    [Parameter(Mandatory = $true)][scriptblock]$AgeInvoker
  )

  $safeErrorCode = $null
  $ageLaunched = $false
  $ageExitCode = $null
  $firstSecure = $null
  $confirmationSecure = $null
  $firstBuffer = $null
  $confirmationBuffer = $null
  $inputRecordsWritten = 0
  $cleanupPass = $true
  try {
    if ([int](& $PendingInputProvider) -ne 0) { throw 'PHASE7B_WP2_AGE_CONSOLE_INPUT_CONTAMINATED' }

    $prompt = & $PromptProvider
    if ($null -eq $prompt -or [bool]$prompt.cancelled) { throw 'PHASE7B_WP2_AGE_PASSPHRASE_CANCELLED' }
    $firstSecure = $prompt.first
    $confirmationSecure = $prompt.confirmation
    if ($null -eq $firstSecure -or $null -eq $confirmationSecure) { throw 'PHASE7B_WP2_AGE_PASSPHRASE_PROMPT_INVALID' }

    $firstBuffer = ConvertTo-Phase7BSecretCharacterBuffer -SecureValue $firstSecure
    $confirmationBuffer = ConvertTo-Phase7BSecretCharacterBuffer -SecureValue $confirmationSecure
    if ($firstBuffer.Length -eq 0) { throw 'PHASE7B_WP2_AGE_PASSPHRASE_EMPTY' }
    if ($confirmationBuffer.Length -eq 0) { throw 'PHASE7B_WP2_AGE_PASSPHRASE_CONFIRMATION_EMPTY' }
    if ($firstBuffer.Length -lt $script:Phase7BAgePassphraseMinimumCharacters -or
        $confirmationBuffer.Length -lt $script:Phase7BAgePassphraseMinimumCharacters) { throw 'PHASE7B_WP2_AGE_PASSPHRASE_TOO_SHORT' }
    if ($firstBuffer.Length -gt $script:Phase7BAgePassphraseMaximumCharacters -or
        $confirmationBuffer.Length -gt $script:Phase7BAgePassphraseMaximumCharacters) { throw 'PHASE7B_WP2_AGE_PASSPHRASE_LENGTH_UNSUPPORTED' }
    if ($firstBuffer.Length -ne $confirmationBuffer.Length) { throw 'PHASE7B_WP2_AGE_PASSPHRASE_MISMATCH' }

    for ($index = 0; $index -lt $firstBuffer.Length; $index++) {
      if ([int]$firstBuffer[$index] -lt 0x20 -or [int]$firstBuffer[$index] -gt 0x7e) { throw 'PHASE7B_WP2_AGE_PASSPHRASE_CHARACTER_SET_UNSUPPORTED' }
      if ($firstBuffer[$index] -cne $confirmationBuffer[$index]) { throw 'PHASE7B_WP2_AGE_PASSPHRASE_MISMATCH' }
    }

    if ([int](& $PendingInputProvider) -ne 0) { throw 'PHASE7B_WP2_AGE_CONSOLE_INPUT_CONTAMINATED' }
    $expectedRecords = [int](($firstBuffer.Length + 1) * 2)
    $inputRecordsWritten = [int](& $InputWriter $firstBuffer)
    if ($inputRecordsWritten -ne $expectedRecords) { throw 'PHASE7B_WP2_AGE_CONSOLE_INPUT_PARTIAL_WRITE' }
    if ([int](& $PendingInputProvider) -ne $expectedRecords) { throw 'PHASE7B_WP2_AGE_CONSOLE_INPUT_RECORD_COUNT_MISMATCH' }

    $ageLaunched = $true
    $ageExitCode = [int](& $AgeInvoker $AgeExePath $OutputPath $InputPath)
    if ($ageExitCode -ne 0) { throw 'PHASE7B_WP2_AGE_ENCRYPTION_FAILED' }
    if ([int](& $PendingInputProvider) -ne 0) { throw 'PHASE7B_WP2_AGE_CONSOLE_INPUT_NOT_FULLY_CONSUMED' }
  } catch {
    $safeErrorCode = if ($_.Exception.Message -match '^PHASE7B_') { $_.Exception.Message } else { 'PHASE7B_WP2_AGE_SECURE_INPUT_BRIDGE_EXCEPTION' }
  } finally {
    try {
      & $InputClearer
      if ([int](& $PendingInputProvider) -ne 0) { $cleanupPass = $false }
    } catch {
      $cleanupPass = $false
    }
    Clear-Phase7BSecretCharacterBuffer -Buffer $firstBuffer
    Clear-Phase7BSecretCharacterBuffer -Buffer $confirmationBuffer
    if ($null -ne $firstSecure) { $firstSecure.Dispose() }
    if ($null -ne $confirmationSecure) { $confirmationSecure.Dispose() }
    Remove-Variable prompt,firstSecure,confirmationSecure,firstBuffer,confirmationBuffer -ErrorAction SilentlyContinue
  }

  if (-not $cleanupPass) { $safeErrorCode = 'PHASE7B_WP2_AGE_CONSOLE_INPUT_CLEANUP_FAIL' }
  $pass = [string]::IsNullOrWhiteSpace($safeErrorCode)
  return [pscustomobject][ordered]@{
    classification = if ($pass) { 'PHASE7B_WP2_AGE_SECURE_INPUT_BRIDGE_PASS' } else { 'PHASE7B_WP2_AGE_SECURE_INPUT_BRIDGE_FAIL' }
    pass = $pass
    safeErrorCode = $safeErrorCode
    ageLaunched = $ageLaunched
    ageExitCode = $ageExitCode
    explicitPassphraseConfirmationSupplied = [bool]($pass -and $inputRecordsWritten -gt 0)
    autogeneratedPassphrasePathReachable = $false
    commandLineSecretUsed = $false
    environmentSecretUsed = $false
    plaintextSecretFileUsed = $false
    reportSecretUsed = $false
    consoleInputCleanupPass = $cleanupPass
    automaticRetryAllowed = $false
  }
}

function Invoke-Phase7BAgeEncryptionWithSecureWindowsInput {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)][string]$AgeExePath,
    [Parameter(Mandatory = $true)][string]$InputPath,
    [Parameter(Mandatory = $true)][string]$OutputPath
  )

  if ($PSVersionTable.PSEdition -cne 'Desktop' -or $PSVersionTable.PSVersion.Major -ne 5 -or
      $Host.Name -cne 'ConsoleHost' -or -not [Environment]::UserInteractive -or [Console]::IsInputRedirected) {
    return [pscustomobject][ordered]@{
      classification = 'PHASE7B_WP2_AGE_SECURE_INPUT_BRIDGE_FAIL'
      pass = $false
      safeErrorCode = 'PHASE7B_WP2_AGE_SECURE_INPUT_INTERACTIVE_PS51_REQUIRED'
      ageLaunched = $false
      automaticRetryAllowed = $false
    }
  }
  if (-not (Test-Path -LiteralPath $AgeExePath -PathType Leaf) -or
      -not (Test-Path -LiteralPath $InputPath -PathType Leaf) -or
      (Test-Path -LiteralPath $OutputPath)) {
    return [pscustomobject][ordered]@{
      classification = 'PHASE7B_WP2_AGE_SECURE_INPUT_BRIDGE_FAIL'
      pass = $false
      safeErrorCode = 'PHASE7B_WP2_AGE_SECURE_INPUT_PATH_CONTRACT_FAIL'
      ageLaunched = $false
      automaticRetryAllowed = $false
    }
  }

  Initialize-Phase7BWindowsConsoleInputBridge
  $pendingProvider = { [Phase7BWindowsConsoleInputBridge]::GetPendingInputRecordCount() }
  $clearer = { [Phase7BWindowsConsoleInputBridge]::ClearPendingInputRecords() }
  $writer = { param([char[]]$Passphrase) [Phase7BWindowsConsoleInputBridge]::WriteConfirmedPassphraseLines($Passphrase) }
  $invoker = {
    param([string]$Executable, [string]$OutputFile, [string]$InputFile)
    & $Executable -p -o $OutputFile $InputFile
    return [int]$LASTEXITCODE
  }
  return Invoke-Phase7BAgeEncryptionBridgeCore -AgeExePath $AgeExePath -InputPath $InputPath -OutputPath $OutputPath `
    -PromptProvider ${function:Show-Phase7BAgePassphraseDialog} -PendingInputProvider $pendingProvider `
    -InputClearer $clearer -InputWriter $writer -AgeInvoker $invoker
}

Export-ModuleMember -Function Invoke-Phase7BAgeEncryptionWithSecureWindowsInput
