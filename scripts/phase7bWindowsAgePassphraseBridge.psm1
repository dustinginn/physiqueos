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
    private const short MOUSE_EVENT = 0x0002;
    private const short WINDOW_BUFFER_SIZE_EVENT = 0x0004;
    private const short MENU_EVENT = 0x0008;
    private const short FOCUS_EVENT = 0x0010;
    private const int MAX_INPUT_RECORDS = 4096;

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

    public sealed class InputPolicyResult
    {
        public bool Pass { get; internal set; }
        public string SafeErrorCode { get; internal set; }
        public int TotalRecordCount { get; internal set; }
        public int KeyboardRecordCount { get; internal set; }
        public int HarmlessRecordCount { get; internal set; }
        public int UnknownRecordCount { get; internal set; }
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

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool PeekConsoleInputW(
        SafeFileHandle consoleInput,
        [Out] INPUT_RECORD[] buffer,
        uint length,
        out uint read);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool ReadConsoleInputW(
        SafeFileHandle consoleInput,
        [Out] INPUT_RECORD[] buffer,
        uint length,
        out uint read);

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

    public static InputPolicyResult DrainHarmlessInputAndRequireNoKeyboard(string keyboardErrorCode)
    {
        if (String.IsNullOrWhiteSpace(keyboardErrorCode))
            throw new ArgumentException("A safe keyboard error code is required.", "keyboardErrorCode");

        using (SafeFileHandle handle = OpenConsoleInput())
        {
            int drained = 0;
            for (int round = 0; round < 16; round++)
            {
                INPUT_RECORD[] records = PeekAll(handle);
                try
                {
                    InputPolicyResult result = Evaluate(records, null, 0, false, keyboardErrorCode);
                    if (!result.Pass) return result;
                    if (records.Length == 0)
                    {
                        result.HarmlessRecordCount = drained;
                        return result;
                    }

                    INPUT_RECORD[] removed = new INPUT_RECORD[records.Length];
                    try
                    {
                        uint read;
                        if (!ReadConsoleInputW(handle, removed, (uint)removed.Length, out read))
                            throw new Win32Exception(Marshal.GetLastWin32Error());
                        if (read != (uint)removed.Length)
                            throw new InvalidOperationException("Console input drain was incomplete.");
                        InputPolicyResult removedResult = Evaluate(removed, null, 0, false, keyboardErrorCode);
                        if (!removedResult.Pass) return removedResult;
                        drained = checked(drained + removedResult.HarmlessRecordCount);
                    }
                    finally
                    {
                        Array.Clear(removed, 0, removed.Length);
                    }
                }
                finally
                {
                    Array.Clear(records, 0, records.Length);
                }
            }
            throw new InvalidOperationException("Console input did not stabilize within the supported bound.");
        }
    }

    public static InputPolicyResult VerifyPassphraseLines(char[] passphrase, int lineCount)
    {
        if (passphrase == null || passphrase.Length == 0)
            throw new ArgumentException("A nonempty passphrase is required.", "passphrase");
        if (lineCount < 1 || lineCount > 2)
            throw new ArgumentOutOfRangeException("lineCount");

        using (SafeFileHandle handle = OpenConsoleInput())
        {
            INPUT_RECORD[] records = PeekAll(handle);
            try
            {
                return Evaluate(records, passphrase, lineCount, true, "PHASE7B_WP2_AGE_CONSOLE_INPUT_SEQUENCE_MISMATCH");
            }
            finally
            {
                Array.Clear(records, 0, records.Length);
            }
        }
    }

    public static InputPolicyResult RequireEmptyInput()
    {
        using (SafeFileHandle handle = OpenConsoleInput())
        {
            INPUT_RECORD[] records = PeekAll(handle);
            try
            {
                if (records.Length == 0) return NewPassResult(0, 0, 0, 0);
                return NewFailResult("PHASE7B_WP2_AGE_CONSOLE_INPUT_CLEANUP_FAIL", records.Length, 0, 0, 0);
            }
            finally
            {
                Array.Clear(records, 0, records.Length);
            }
        }
    }

    public static InputPolicyResult EvaluateSyntheticRecords(
        short[] eventTypes,
        int[] keyDown,
        int[] repeatCounts,
        char[] unicodeCharacters,
        char[] expectedPassphrase,
        int lineCount,
        bool requireExactSequence,
        string keyboardErrorCode)
    {
        if (eventTypes == null || keyDown == null || repeatCounts == null || unicodeCharacters == null)
            throw new ArgumentNullException("Synthetic console record arrays are required.");
        if (eventTypes.Length != keyDown.Length || eventTypes.Length != repeatCounts.Length || eventTypes.Length != unicodeCharacters.Length)
            throw new ArgumentException("Synthetic console record arrays must have identical lengths.");

        INPUT_RECORD[] records = new INPUT_RECORD[eventTypes.Length];
        try
        {
            for (int index = 0; index < records.Length; index++)
            {
                records[index].EventType = eventTypes[index];
                records[index].KeyDown = keyDown[index];
                if (repeatCounts[index] < 0 || repeatCounts[index] > UInt16.MaxValue)
                    throw new ArgumentOutOfRangeException("repeatCounts");
                records[index].RepeatCount = (ushort)repeatCounts[index];
                records[index].UnicodeChar = unicodeCharacters[index];
            }
            return Evaluate(records, expectedPassphrase, lineCount, requireExactSequence, keyboardErrorCode);
        }
        finally
        {
            Array.Clear(records, 0, records.Length);
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

    private static INPUT_RECORD[] PeekAll(SafeFileHandle handle)
    {
        uint count;
        if (!GetNumberOfConsoleInputEvents(handle, out count))
            throw new Win32Exception(Marshal.GetLastWin32Error());
        if (count > MAX_INPUT_RECORDS)
            throw new InvalidOperationException("Console input exceeds the supported bound.");
        if (count == 0) return new INPUT_RECORD[0];

        INPUT_RECORD[] records = new INPUT_RECORD[(int)count];
        uint read;
        if (!PeekConsoleInputW(handle, records, count, out read))
            throw new Win32Exception(Marshal.GetLastWin32Error());
        if (read != count)
            throw new InvalidOperationException("Console input snapshot was incomplete.");
        return records;
    }

    private static InputPolicyResult Evaluate(
        INPUT_RECORD[] records,
        char[] expectedPassphrase,
        int lineCount,
        bool requireExactSequence,
        string keyboardErrorCode)
    {
        int keyboard = 0;
        int harmless = 0;
        int unknown = 0;
        for (int index = 0; index < records.Length; index++)
        {
            short eventType = records[index].EventType;
            if (eventType == KEY_EVENT) keyboard++;
            else if (IsHarmlessNonKeyEvent(eventType)) harmless++;
            else unknown++;
        }

        if (unknown != 0)
            return NewFailResult("PHASE7B_WP2_AGE_CONSOLE_INPUT_UNKNOWN_EVENT", records.Length, keyboard, harmless, unknown);

        if (!requireExactSequence)
        {
            if (keyboard != 0)
                return NewFailResult(keyboardErrorCode, records.Length, keyboard, harmless, unknown);
            return NewPassResult(records.Length, keyboard, harmless, unknown);
        }

        if (expectedPassphrase == null || expectedPassphrase.Length == 0 || lineCount < 1 || lineCount > 2)
            throw new ArgumentException("Exact sequence validation requires a nonempty passphrase and one or two lines.");
        int expectedKeyboardCount = checked((expectedPassphrase.Length + 1) * lineCount);
        if (keyboard != expectedKeyboardCount)
            return NewFailResult(keyboardErrorCode, records.Length, keyboard, harmless, unknown);

        int keyboardIndex = 0;
        for (int recordIndex = 0; recordIndex < records.Length; recordIndex++)
        {
            INPUT_RECORD record = records[recordIndex];
            if (record.EventType != KEY_EVENT) continue;
            int lineOffset = keyboardIndex % (expectedPassphrase.Length + 1);
            char expected = lineOffset == expectedPassphrase.Length ? '\r' : expectedPassphrase[lineOffset];
            if (record.KeyDown != 1 || record.RepeatCount != 1 ||
                record.VirtualKeyCode != 0 || record.VirtualScanCode != 0 || record.ControlKeyState != 0 ||
                record.UnicodeChar != expected)
                return NewFailResult(keyboardErrorCode, records.Length, keyboard, harmless, unknown);
            keyboardIndex++;
        }
        return NewPassResult(records.Length, keyboard, harmless, unknown);
    }

    private static bool IsHarmlessNonKeyEvent(short eventType)
    {
        return eventType == MOUSE_EVENT ||
               eventType == WINDOW_BUFFER_SIZE_EVENT ||
               eventType == MENU_EVENT ||
               eventType == FOCUS_EVENT;
    }

    private static InputPolicyResult NewPassResult(int total, int keyboard, int harmless, int unknown)
    {
        return new InputPolicyResult
        {
            Pass = true,
            SafeErrorCode = null,
            TotalRecordCount = total,
            KeyboardRecordCount = keyboard,
            HarmlessRecordCount = harmless,
            UnknownRecordCount = unknown
        };
    }

    private static InputPolicyResult NewFailResult(string code, int total, int keyboard, int harmless, int unknown)
    {
        return new InputPolicyResult
        {
            Pass = false,
            SafeErrorCode = code,
            TotalRecordCount = total,
            KeyboardRecordCount = keyboard,
            HarmlessRecordCount = harmless,
            UnknownRecordCount = unknown
        };
    }

    public static int WritePassphraseLines(char[] passphrase, int lineCount)
    {
        if (passphrase == null || passphrase.Length == 0)
            throw new ArgumentException("A nonempty passphrase is required.", "passphrase");
        if (lineCount < 1 || lineCount > 2)
            throw new ArgumentOutOfRangeException("lineCount");

        int recordCount = checked((passphrase.Length + 1) * lineCount);
        INPUT_RECORD[] records = new INPUT_RECORD[recordCount];
        int offset = 0;
        for (int line = 0; line < lineCount; line++)
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
  param([ValidateSet('encryption','decrypt verification')][string]$Purpose = 'encryption')
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing

  $form = New-Object Windows.Forms.Form
  $first = New-Object Windows.Forms.TextBox
  $confirmation = New-Object Windows.Forms.TextBox
  try {
    $form.Text = "PhysiqueOS age passphrase - $Purpose"
    $form.StartPosition = [Windows.Forms.FormStartPosition]::CenterScreen
    $form.FormBorderStyle = [Windows.Forms.FormBorderStyle]::FixedDialog
    $form.MinimizeBox = $false
    $form.MaximizeBox = $false
    $form.ShowInTaskbar = $true
    $form.ClientSize = New-Object Drawing.Size(560, 238)

    $message = New-Object Windows.Forms.Label
    $message.Location = New-Object Drawing.Point(18, 14)
    $message.Size = New-Object Drawing.Size(524, 48)
    $message.Text = "Paste the existing Founder-controlled age passphrase twice for $Purpose. Both masked entries must contain 16-256 printable ASCII characters and exactly match before age starts."

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

function Assert-Phase7BConsoleInputPolicyResult {
  param([Parameter(Mandatory = $true)]$Result)

  if ($null -eq $Result -or -not [bool]$Result.Pass) {
    $safeCode = if ($null -ne $Result -and [string]$Result.SafeErrorCode -match '^PHASE7B_') {
      [string]$Result.SafeErrorCode
    } else {
      'PHASE7B_WP2_AGE_CONSOLE_INPUT_POLICY_FAIL'
    }
    throw $safeCode
  }
}

function Invoke-Phase7BAgeEncryptionBridgeCore {
  param(
    [Parameter(Mandatory = $true)][string]$AgeExePath,
    [Parameter(Mandatory = $true)][string]$InputPath,
    [Parameter(Mandatory = $true)][string]$OutputPath,
    [Parameter(Mandatory = $true)][scriptblock]$PromptProvider,
    [Parameter(Mandatory = $true)][scriptblock]$InputPolicyProvider,
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
    Assert-Phase7BConsoleInputPolicyResult -Result (& $InputPolicyProvider 'Prepare' $null 0)

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

    Assert-Phase7BConsoleInputPolicyResult -Result (& $InputPolicyProvider 'Prepare' $null 0)
    $expectedRecords = [int](($firstBuffer.Length + 1) * 2)
    $inputRecordsWritten = [int](& $InputWriter $firstBuffer)
    if ($inputRecordsWritten -ne $expectedRecords) { throw 'PHASE7B_WP2_AGE_CONSOLE_INPUT_PARTIAL_WRITE' }
    Assert-Phase7BConsoleInputPolicyResult -Result (& $InputPolicyProvider 'VerifyInjected' $firstBuffer 2)

    $ageLaunched = $true
    $ageExitCode = [int](& $AgeInvoker $AgeExePath $OutputPath $InputPath)
    if ($ageExitCode -ne 0) { throw 'PHASE7B_WP2_AGE_ENCRYPTION_FAILED' }
    Assert-Phase7BConsoleInputPolicyResult -Result (& $InputPolicyProvider 'PostAge' $null 0)
  } catch {
    $safeErrorCode = if ($_.Exception.Message -match '^PHASE7B_') { $_.Exception.Message } else { 'PHASE7B_WP2_AGE_SECURE_INPUT_BRIDGE_EXCEPTION' }
  } finally {
    try {
      & $InputClearer
      $cleanupResult = & $InputPolicyProvider 'CleanupVerify' $null 0
      if ($null -eq $cleanupResult -or -not [bool]$cleanupResult.Pass) { $cleanupPass = $false }
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
  $policyProvider = {
    param([string]$Operation, [AllowNull()][char[]]$Passphrase, [int]$LineCount)
    switch ($Operation) {
      'Prepare' { return [Phase7BWindowsConsoleInputBridge]::DrainHarmlessInputAndRequireNoKeyboard('PHASE7B_WP2_AGE_CONSOLE_INPUT_CONTAMINATED') }
      'VerifyInjected' { return [Phase7BWindowsConsoleInputBridge]::VerifyPassphraseLines($Passphrase, $LineCount) }
      'PostAge' { return [Phase7BWindowsConsoleInputBridge]::DrainHarmlessInputAndRequireNoKeyboard('PHASE7B_WP2_AGE_CONSOLE_INPUT_NOT_FULLY_CONSUMED') }
      'CleanupVerify' { return [Phase7BWindowsConsoleInputBridge]::RequireEmptyInput() }
      default { throw 'PHASE7B_WP2_AGE_CONSOLE_INPUT_POLICY_OPERATION_FAIL' }
    }
  }
  $clearer = { [Phase7BWindowsConsoleInputBridge]::ClearPendingInputRecords() }
  $writer = { param([char[]]$Passphrase) [Phase7BWindowsConsoleInputBridge]::WritePassphraseLines($Passphrase, 2) }
  $invoker = {
    param([string]$Executable, [string]$OutputFile, [string]$InputFile)
    & $Executable -p -o $OutputFile $InputFile
    return [int]$LASTEXITCODE
  }
  return Invoke-Phase7BAgeEncryptionBridgeCore -AgeExePath $AgeExePath -InputPath $InputPath -OutputPath $OutputPath `
    -PromptProvider ${function:Show-Phase7BAgePassphraseDialog} -InputPolicyProvider $policyProvider `
    -InputClearer $clearer -InputWriter $writer -AgeInvoker $invoker
}

function Invoke-Phase7BAgeDecryptionToHashBridgeCore {
  param(
    [Parameter(Mandatory = $true)][string]$AgeExePath,
    [Parameter(Mandatory = $true)][string]$CiphertextPath,
    [Parameter(Mandatory = $true)][scriptblock]$PromptProvider,
    [Parameter(Mandatory = $true)][scriptblock]$InputPolicyProvider,
    [Parameter(Mandatory = $true)][scriptblock]$InputClearer,
    [Parameter(Mandatory = $true)][scriptblock]$InputWriter,
    [Parameter(Mandatory = $true)][scriptblock]$AgeInvoker
  )
  $safeErrorCode = $null
  $ageLaunched = $false
  $ageResult = $null
  $firstSecure = $null
  $confirmationSecure = $null
  $firstBuffer = $null
  $confirmationBuffer = $null
  $cleanupPass = $true
  try {
    Assert-Phase7BConsoleInputPolicyResult -Result (& $InputPolicyProvider 'Prepare' $null 0)
    $prompt = & $PromptProvider
    if ($null -eq $prompt -or [bool]$prompt.cancelled) { throw 'PHASE7B_WP2_AGE_PASSPHRASE_CANCELLED' }
    $firstSecure = $prompt.first
    $confirmationSecure = $prompt.confirmation
    if ($null -eq $firstSecure -or $null -eq $confirmationSecure) { throw 'PHASE7B_WP2_AGE_PASSPHRASE_PROMPT_INVALID' }
    $firstBuffer = ConvertTo-Phase7BSecretCharacterBuffer -SecureValue $firstSecure
    $confirmationBuffer = ConvertTo-Phase7BSecretCharacterBuffer -SecureValue $confirmationSecure
    if ($firstBuffer.Length -lt $script:Phase7BAgePassphraseMinimumCharacters -or $firstBuffer.Length -gt $script:Phase7BAgePassphraseMaximumCharacters -or
        $confirmationBuffer.Length -ne $firstBuffer.Length) { throw 'PHASE7B_WP2_AGE_PASSPHRASE_MISMATCH' }
    for ($index = 0; $index -lt $firstBuffer.Length; $index++) {
      if ([int]$firstBuffer[$index] -lt 0x20 -or [int]$firstBuffer[$index] -gt 0x7e) { throw 'PHASE7B_WP2_AGE_PASSPHRASE_CHARACTER_SET_UNSUPPORTED' }
      if ($firstBuffer[$index] -cne $confirmationBuffer[$index]) { throw 'PHASE7B_WP2_AGE_PASSPHRASE_MISMATCH' }
    }
    Assert-Phase7BConsoleInputPolicyResult -Result (& $InputPolicyProvider 'Prepare' $null 0)
    $expectedRecords = $firstBuffer.Length + 1
    if ([int](& $InputWriter $firstBuffer) -ne $expectedRecords) {
      throw 'PHASE7B_WP2_AGE_CONSOLE_INPUT_PARTIAL_WRITE'
    }
    Assert-Phase7BConsoleInputPolicyResult -Result (& $InputPolicyProvider 'VerifyInjected' $firstBuffer 1)
    $ageLaunched = $true
    $ageResult = & $AgeInvoker $AgeExePath $CiphertextPath
    if ($null -eq $ageResult -or [int]$ageResult.exitCode -ne 0) { throw 'PHASE7B_WP2_AGE_DECRYPTION_FAILED' }
    if ([string]$ageResult.sha256 -cnotmatch '^[0-9a-f]{64}$' -or [int64]$ageResult.bytes -lt 1) { throw 'PHASE7B_WP2_AGE_DECRYPT_STREAM_IDENTITY_FAIL' }
    Assert-Phase7BConsoleInputPolicyResult -Result (& $InputPolicyProvider 'PostAge' $null 0)
  } catch {
    $safeErrorCode = if ($_.Exception.Message -match '^PHASE7B_') { $_.Exception.Message } else { 'PHASE7B_WP2_AGE_DECRYPT_TO_HASH_BRIDGE_EXCEPTION' }
  } finally {
    try {
      & $InputClearer
      $cleanupResult = & $InputPolicyProvider 'CleanupVerify' $null 0
      if ($null -eq $cleanupResult -or -not [bool]$cleanupResult.Pass) { $cleanupPass = $false }
    } catch { $cleanupPass = $false }
    Clear-Phase7BSecretCharacterBuffer -Buffer $firstBuffer
    Clear-Phase7BSecretCharacterBuffer -Buffer $confirmationBuffer
    if ($null -ne $firstSecure) { $firstSecure.Dispose() }
    if ($null -ne $confirmationSecure) { $confirmationSecure.Dispose() }
    Remove-Variable prompt,firstSecure,confirmationSecure,firstBuffer,confirmationBuffer -ErrorAction SilentlyContinue
  }
  if (-not $cleanupPass) { $safeErrorCode = 'PHASE7B_WP2_AGE_CONSOLE_INPUT_CLEANUP_FAIL' }
  $pass = [string]::IsNullOrWhiteSpace($safeErrorCode)
  [pscustomobject][ordered]@{
    classification = if ($pass) { 'PHASE7B_WP2_AGE_DECRYPT_TO_HASH_PASS' } else { 'PHASE7B_WP2_AGE_DECRYPT_TO_HASH_FAIL' }
    pass = $pass; safeErrorCode = $safeErrorCode; ageLaunched = $ageLaunched
    ageExitCode = if ($null -ne $ageResult) { [int]$ageResult.exitCode } else { $null }
    decryptedStreamSha256 = if ($pass) { [string]$ageResult.sha256 } else { '' }
    decryptedStreamBytes = if ($pass) { [int64]$ageResult.bytes } else { [int64]0 }
    explicitPassphraseConfirmationSupplied = $pass; autogeneratedPassphrasePathReachable = $false
    commandLineSecretUsed = $false; environmentSecretUsed = $false; plaintextSecretFileUsed = $false; reportSecretUsed = $false
    consoleInputCleanupPass = $cleanupPass; automaticRetryAllowed = $false
  }
}

function Invoke-Phase7BAgeDecryptionToHashWithSecureWindowsInput {
  [CmdletBinding()] param(
    [Parameter(Mandatory = $true)][string]$AgeExePath,
    [Parameter(Mandatory = $true)][string]$CiphertextPath
  )
  if ($PSVersionTable.PSEdition -cne 'Desktop' -or $PSVersionTable.PSVersion.Major -ne 5 -or
      $Host.Name -cne 'ConsoleHost' -or -not [Environment]::UserInteractive -or [Console]::IsInputRedirected -or
      -not (Test-Path -LiteralPath $AgeExePath -PathType Leaf) -or -not (Test-Path -LiteralPath $CiphertextPath -PathType Leaf) -or
      $AgeExePath.Contains('"') -or $CiphertextPath.Contains('"')) {
    return [pscustomobject][ordered]@{ classification='PHASE7B_WP2_AGE_DECRYPT_TO_HASH_FAIL';pass=$false;safeErrorCode='PHASE7B_WP2_AGE_DECRYPT_TO_HASH_PATH_OR_CONSOLE_FAIL';ageLaunched=$false;automaticRetryAllowed=$false }
  }
  Initialize-Phase7BWindowsConsoleInputBridge
  $policyProvider = {
    param([string]$Operation, [AllowNull()][char[]]$Passphrase, [int]$LineCount)
    switch ($Operation) {
      'Prepare' { return [Phase7BWindowsConsoleInputBridge]::DrainHarmlessInputAndRequireNoKeyboard('PHASE7B_WP2_AGE_CONSOLE_INPUT_CONTAMINATED') }
      'VerifyInjected' { return [Phase7BWindowsConsoleInputBridge]::VerifyPassphraseLines($Passphrase, $LineCount) }
      'PostAge' { return [Phase7BWindowsConsoleInputBridge]::DrainHarmlessInputAndRequireNoKeyboard('PHASE7B_WP2_AGE_CONSOLE_INPUT_NOT_FULLY_CONSUMED') }
      'CleanupVerify' { return [Phase7BWindowsConsoleInputBridge]::RequireEmptyInput() }
      default { throw 'PHASE7B_WP2_AGE_CONSOLE_INPUT_POLICY_OPERATION_FAIL' }
    }
  }
  $clearer = { [Phase7BWindowsConsoleInputBridge]::ClearPendingInputRecords() }
  $writer = { param([char[]]$Passphrase) [Phase7BWindowsConsoleInputBridge]::WritePassphraseLines($Passphrase, 1) }
  $promptProvider = { Show-Phase7BAgePassphraseDialog -Purpose 'decrypt verification' }
  $invoker = {
    param([string]$Executable, [string]$CiphertextFile)
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = $Executable
    $start.Arguments = "--decrypt `"$CiphertextFile`""
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $false
    $start.RedirectStandardInput = $false
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $false
    $process = New-Object Diagnostics.Process
    $process.StartInfo = $start
    $sha = [Security.Cryptography.SHA256]::Create()
    $buffer = New-Object byte[] 65536
    $count = [int64]0
    try {
      if (-not $process.Start()) { throw 'PHASE7B_WP2_AGE_DECRYPT_PROCESS_START_FAIL' }
      $stream = $process.StandardOutput.BaseStream
      while (($read = $stream.Read($buffer, 0, $buffer.Length)) -gt 0) {
        [void]$sha.TransformBlock($buffer, 0, $read, $null, 0)
        $count += $read
      }
      [void]$sha.TransformFinalBlock((New-Object byte[] 0), 0, 0)
      $process.WaitForExit()
      [pscustomobject]@{ exitCode=[int]$process.ExitCode;sha256=([BitConverter]::ToString($sha.Hash)).Replace('-','').ToLowerInvariant();bytes=$count }
    } finally {
      [Array]::Clear($buffer, 0, $buffer.Length)
      $sha.Dispose()
      $process.Dispose()
    }
  }
  Invoke-Phase7BAgeDecryptionToHashBridgeCore -AgeExePath $AgeExePath -CiphertextPath $CiphertextPath `
    -PromptProvider $promptProvider -InputPolicyProvider $policyProvider -InputClearer $clearer -InputWriter $writer -AgeInvoker $invoker
}

Export-ModuleMember -Function @(
  'Invoke-Phase7BAgeEncryptionWithSecureWindowsInput',
  'Invoke-Phase7BAgeDecryptionToHashWithSecureWindowsInput'
)
