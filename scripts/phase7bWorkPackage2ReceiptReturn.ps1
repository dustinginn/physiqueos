# Nonsecret receipt transport only. No import/finalization, SMB, packet read, or receiver mutation.
# This standalone script can be hash-delivered to the laptop without migration modules.
[CmdletBinding()] param(
  [Parameter(Mandatory=$true)][ValidateSet('InspectLaptop','ServeLaptop','ReceivePrimary')][string]$Operation,
  [Parameter(Mandatory=$true)][string]$AttemptId,
  [Parameter(Mandatory=$true)][string]$ExpectedPacketSha256,
  [Parameter(Mandatory=$true)][int64]$ExpectedPacketBytes,
  [Parameter()][string]$OutputPath,
  [Parameter(Mandatory=$true)][string]$Acknowledgement
)
$ErrorActionPreference='Stop';Set-StrictMode -Version Latest
try {
if($PSVersionTable.PSEdition -cne 'Desktop' -or $PSVersionTable.PSVersion.Major -ne 5 -or $Host.Name -cne 'ConsoleHost' -or
    $AttemptId -cnotmatch '^phase7b-wp2-[0-9a-f]{32}$' -or $ExpectedPacketSha256 -cnotmatch '^[0-9a-f]{64}$' -or $ExpectedPacketBytes -lt 1 -or
    $Acknowledgement -cne 'WP2B_RECEIPT_TRANSPORT_ONLY_NO_STAGE5') {throw 'PHASE7B_RECEIPT_RETURN_ARGUMENT_FAIL'}
$primary='192.168.1.69';$laptop='192.168.1.68';$port=49182
function Get-ByteHash([byte[]]$Bytes){$sha=[Security.Cryptography.SHA256]::Create();try{([BitConverter]::ToString($sha.ComputeHash($Bytes))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}}
function Read-TransportReceipt([byte[]]$Bytes){
  if($Bytes.Length -lt 1 -or $Bytes.Length -gt 65536){throw 'PHASE7B_RECEIPT_RETURN_SIZE_FAIL'}
  $r=(New-Object Text.UTF8Encoding($false,$true)).GetString($Bytes)|ConvertFrom-Json -ErrorAction Stop
  # Transport's projection allowlist prevents unknown/nonreceipt material being served.
  # Primary's authoritative source-owned receipt validator still performs acceptance.
  $names=@('schemaVersion','classification','pass','attemptId','evidenceNonce','observedAt','evidenceFileName','packetFileName','packetSha256','packetBytes',
    'destinationBytesReread','encryptedPacketOnly','computerName','hostIdentitySha256','diskIdentitySha256','driveRoot','fileSystem','diskNumber','busType',
    'physicallyIndependent','freeBytes','persistentAccountCreated','persistentShareRetained','persistentFirewallRuleRetained','persistentMappingRetained',
    'credentialsPersisted','rawProductionFilesAccepted','sessionTornDown','reportPersisted','automaticRetryAllowed')
  if(@(Compare-Object @($r.PSObject.Properties.Name) $names -CaseSensitive).Count -ne 0){throw 'PHASE7B_RECEIPT_RETURN_SHAPE_FAIL'}
  foreach($name in @('pass','destinationBytesReread','encryptedPacketOnly','physicallyIndependent','sessionTornDown','reportPersisted')){if($r.$name -isnot [bool] -or -not $r.$name){throw 'PHASE7B_RECEIPT_RETURN_FLAGS_FAIL'}}
  foreach($name in @('persistentAccountCreated','persistentShareRetained','persistentFirewallRuleRetained','persistentMappingRetained','credentialsPersisted','rawProductionFilesAccepted','automaticRetryAllowed')){if($r.$name -isnot [bool] -or $r.$name){throw 'PHASE7B_RECEIPT_RETURN_FLAGS_FAIL'}}
  foreach($name in @('schemaVersion','packetBytes','diskNumber','freeBytes')){if($r.$name -isnot [int] -and $r.$name -isnot [long]){throw 'PHASE7B_RECEIPT_RETURN_NUMBER_FAIL'}}
  if($r.schemaVersion -ne 1 -or [string]$r.classification -cne 'PHASE7B_WP2_BOUNDED_REPLICA_INDEPENDENT_READBACK_PASS' -or
      [string]$r.attemptId -cne $AttemptId -or [string]$r.evidenceNonce -cnotmatch '^[0-9a-f]{32}$' -or
      [string]$r.evidenceFileName -cne "$AttemptId-replica-receipt-$($r.evidenceNonce).json" -or [string]$r.packetFileName -cne "$AttemptId.zip.age" -or
      [string]$r.packetSha256 -cne $ExpectedPacketSha256 -or $r.packetBytes -ne $ExpectedPacketBytes -or
      [string]$r.computerName -cne 'LAPTOP-4G5UOU2R' -or [string]$r.hostIdentitySha256 -cnotmatch '^[0-9a-f]{64}$' -or
      [string]$r.diskIdentitySha256 -cnotmatch '^[0-9a-f]{64}$' -or [string]$r.driveRoot -cne 'D:\' -or
      [string]$r.fileSystem -cne 'NTFS' -or $r.diskNumber -ne 0 -or [string]$r.busType -cne 'SATA' -or $r.freeBytes -lt 0 -or
      [string]$r.observedAt -cnotmatch '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?Z$'){throw 'PHASE7B_RECEIPT_RETURN_BINDING_FAIL'}
  $r
}
if($Operation -ceq 'ReceivePrimary'){
  if(@(Get-NetIPAddress -IPAddress $primary -AddressFamily IPv4 -ErrorAction Stop).Count -ne 1){throw 'PHASE7B_RECEIPT_RETURN_PRIMARY_IP_FAIL'}
  $token=(Read-Host 'Paste the compact nonsecret pin JSON shown by the laptop receipt server')|ConvertFrom-Json -ErrorAction Stop
  if(@(Compare-Object @($token.PSObject.Properties.Name) @('nonce','sha256','bytes') -CaseSensitive).Count -ne 0 -or
      [string]$token.nonce -cnotmatch '^[0-9a-f]{32}$' -or [string]$token.sha256 -cnotmatch '^[0-9a-f]{64}$' -or
      ($token.bytes -isnot [int] -and $token.bytes -isnot [long]) -or $token.bytes -lt 1 -or $token.bytes -gt 65536){throw 'PHASE7B_RECEIPT_RETURN_PIN_FAIL'}
  $name="$AttemptId-replica-receipt-$($token.nonce).json"
  $repo=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path;$allowed=[IO.Path]::GetFullPath((Join-Path $repo '.tmp')).TrimEnd('\')+'\'
  $out=[IO.Path]::GetFullPath($OutputPath)
  if(-not $out.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase) -or (Split-Path -Leaf $out) -cne $name -or
      -not (Test-Path -LiteralPath (Split-Path -Parent $out) -PathType Container) -or (Test-Path -LiteralPath $out)){throw 'PHASE7B_RECEIPT_RETURN_OUTPUT_FAIL'}
  $request=[Net.HttpWebRequest]::Create("http://${laptop}:$port/$name");$request.Proxy=$null;$request.AllowAutoRedirect=$false
  $request.Timeout=10000;$request.ReadWriteTimeout=10000;$request.KeepAlive=$false
  $response=$null;$stream=$null;$memory=New-Object IO.MemoryStream
  try{
    $response=$request.GetResponse()
    if([int]$response.StatusCode -ne 200 -or $response.ContentLength -ne $token.bytes){throw 'PHASE7B_RECEIPT_RETURN_RESPONSE_FAIL'}
    $stream=$response.GetResponseStream();$buffer=New-Object byte[] 4096
    while(($read=$stream.Read($buffer,0,$buffer.Length)) -gt 0){if($memory.Length+$read -gt $token.bytes){throw 'PHASE7B_RECEIPT_RETURN_OVERSIZE'};$memory.Write($buffer,0,$read)}
    $body=$memory.ToArray()
  }finally{if($null -ne $stream){$stream.Dispose()};if($null -ne $response){$response.Close()};$memory.Dispose()}
  if($body.Length -ne $token.bytes -or (Get-ByteHash $body) -cne $token.sha256){throw 'PHASE7B_RECEIPT_RETURN_HASH_FAIL'}
  $receipt=Read-TransportReceipt $body
  if([string]$receipt.evidenceNonce -cne $token.nonce){throw 'PHASE7B_RECEIPT_RETURN_NONCE_FAIL'}
  $output=[IO.File]::Open($out,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try{$output.Write($body,0,$body.Length);$output.Flush($true)}finally{$output.Dispose()}
  if((Get-FileHash -LiteralPath $out -Algorithm SHA256).Hash.ToLowerInvariant() -cne $token.sha256){throw 'PHASE7B_RECEIPT_RETURN_OUTPUT_HASH_FAIL'}
  $global:LASTEXITCODE=0
  [ordered]@{classification='PHASE7B_RECEIPT_RETURN_TRANSPORT_COPY_PASS';pass=$true;path=$out;nonce=$token.nonce;sha256=$token.sha256;bytes=$token.bytes;
    canonicalReceiptImported=$false;stage5Executed=$false;automaticRetryAllowed=$false;wp2cAuthorized=$false}|ConvertTo-Json
  return
}
if($env:COMPUTERNAME -cne 'LAPTOP-4G5UOU2R'){throw 'PHASE7B_RECEIPT_RETURN_LAPTOP_FAIL'}
$root="D:\Phase7B\wp2-replica\$AttemptId"
$files=@(Get-ChildItem -LiteralPath $root -Force|Where-Object{$_.Name -clike "$AttemptId-replica-receipt-*.json"})
if($files.Count -ne 1 -or $files[0].PSIsContainer -or ($files[0].Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or
    ((Get-Item -LiteralPath $root).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or $files[0].Length -gt 65536){throw 'PHASE7B_RECEIPT_RETURN_RECEIPT_CARDINALITY_FAIL'}
$body=[IO.File]::ReadAllBytes($files[0].FullName);$receipt=Read-TransportReceipt $body
if($files[0].Name -cne [string]$receipt.evidenceFileName){throw 'PHASE7B_RECEIPT_RETURN_FILENAME_FAIL'}
$pin=[ordered]@{nonce=[string]$receipt.evidenceNonce;sha256=Get-ByteHash $body;bytes=$body.Length}
if($Operation -ceq 'InspectLaptop'){$global:LASTEXITCODE=0;$pin|ConvertTo-Json -Compress;return}
$principal=New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if(-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'PHASE7B_RECEIPT_RETURN_ADMIN_REQUIRED'}
$addresses=@(Get-NetIPAddress -IPAddress $laptop -AddressFamily IPv4 -ErrorAction Stop)
if($addresses.Count -ne 1){throw 'PHASE7B_RECEIPT_RETURN_LAPTOP_IP_FAIL'}
$profiles=@(Get-NetConnectionProfile -InterfaceIndex $addresses[0].InterfaceIndex -ErrorAction Stop)
if($profiles.Count -ne 1 -or [string]$profiles[0].NetworkCategory -cnotin @('Public','Private')){throw 'PHASE7B_RECEIPT_RETURN_PROFILE_FAIL'}
if(@(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue).Count -ne 0){throw 'PHASE7B_RECEIPT_RETURN_PORT_BUSY'}
$rule='Phase7B-ReceiptReturn-'+[guid]::NewGuid().ToString('N');$listener=$null;$client=$null;$ruleAttempted=$false;$served=$false
try{
  $ruleAttempted=$true
  New-NetFirewallRule -Name $rule -DisplayName $rule -Direction Inbound -Action Allow -Enabled True -Profile ([string]$profiles[0].NetworkCategory) `
    -Protocol TCP -LocalAddress $laptop -LocalPort $port -RemoteAddress $primary -Program ((Get-Process -Id $PID).Path) -ErrorAction Stop|Out-Null
  $listener=New-Object Net.Sockets.TcpListener([Net.IPAddress]::Parse($laptop),$port);$listener.Start()
  Write-Host 'PHASE7B_RECEIPT_RETURN_READY: copy only this compact nonsecret pin to Primary; no Stage 5 execution.'
  Write-Host ($pin|ConvertTo-Json -Compress)
  $accept=$listener.AcceptTcpClientAsync();if(-not $accept.Wait(300000)){throw 'PHASE7B_RECEIPT_RETURN_TIMEOUT'}
  $client=$accept.Result
  if(([Net.IPEndPoint]$client.Client.RemoteEndPoint).Address.ToString() -cne $primary){throw 'PHASE7B_RECEIPT_RETURN_PEER_FAIL'}
  $stream=$client.GetStream();$stream.WriteTimeout=5000;$requestBytes=New-Object Collections.Generic.List[byte];$watch=[Diagnostics.Stopwatch]::StartNew()
  do{
    if($requestBytes.Count -ge 8192 -or $watch.ElapsedMilliseconds -ge 5000){throw 'PHASE7B_RECEIPT_RETURN_REQUEST_BOUND_FAIL'}
    $stream.ReadTimeout=[Math]::Max(1,5000-[int]$watch.ElapsedMilliseconds);$next=$stream.ReadByte()
    if($next -lt 0){throw 'PHASE7B_RECEIPT_RETURN_REQUEST_TRUNCATED'};$requestBytes.Add([byte]$next)
    $requestText=[Text.Encoding]::ASCII.GetString($requestBytes.ToArray())
  }while(-not $requestText.EndsWith("`r`n`r`n"))
  $line=$requestText.Split([string[]]@("`r`n"),[StringSplitOptions]::None)[0]
  if($line -cne "GET /$($receipt.evidenceFileName) HTTP/1.1" -and $line -cne "GET /$($receipt.evidenceFileName) HTTP/1.0"){throw 'PHASE7B_RECEIPT_RETURN_REQUEST_FAIL'}
  $header=[Text.Encoding]::ASCII.GetBytes("HTTP/1.1 200 OK`r`nContent-Type: application/json`r`nContent-Length: $($body.Length)`r`nConnection: close`r`nCache-Control: no-store`r`n`r`n")
  $stream.Write($header,0,$header.Length);$stream.Write($body,0,$body.Length);$stream.Flush();$served=$true
}finally{
  if($null -ne $client){$client.Close()};if($null -ne $listener){$listener.Stop()}
  if($ruleAttempted -and @(Get-NetFirewallRule -Name $rule -ErrorAction SilentlyContinue).Count -gt 0){Remove-NetFirewallRule -Name $rule -ErrorAction Stop}
  if(@(Get-NetFirewallRule -Name $rule -ErrorAction SilentlyContinue).Count -ne 0 -or
      @(Get-NetTCPConnection -LocalAddress $laptop -LocalPort $port -State Listen -ErrorAction SilentlyContinue).Count -ne 0){throw 'PHASE7B_RECEIPT_RETURN_TEARDOWN_FAIL'}
}
if(-not $served){throw 'PHASE7B_RECEIPT_RETURN_NOT_SERVED'}
$global:LASTEXITCODE=0
[ordered]@{classification='PHASE7B_RECEIPT_RETURN_SERVED_ONCE_PASS';pass=$true;firewallRuleName=$rule;firewallRuleRemoved=$true;listenerStopped=$true;
  receiptModified=$false;packetAccessed=$false;stage5Executed=$false;automaticRetryAllowed=$false;wp2cAuthorized=$false}|ConvertTo-Json
} catch {
  [ordered]@{classification='PHASE7B_RECEIPT_RETURN_FAIL';pass=$false;safeExceptionType=$_.Exception.GetType().Name;
    stage5Executed=$false;automaticRetryAllowed=$false;wp2cAuthorized=$false}|ConvertTo-Json
  $global:LASTEXITCODE=1
  return
}
