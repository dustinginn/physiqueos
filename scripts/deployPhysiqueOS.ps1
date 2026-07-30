$ErrorActionPreference = "Stop"

$RepoRoot = "C:\Users\dusti\Documents\GitHub\physiqueos"
$LocalUrl = "http://localhost:3000"
$HealthUrl = "$LocalUrl/api/health"
$PublicUrl = "https://float-departed-symphony.ngrok-free.dev"

$StopScript = Join-Path $RepoRoot "scripts\stopPhysiqueOS.ps1"
$StartScript = Join-Path $RepoRoot "scripts\startPhysiqueOS.ps1"
$StatusScript = Join-Path $RepoRoot "scripts\statusPhysiqueOS.ps1"

function Write-Step {
    param([string]$Message)

    Write-Host ""
    Write-Host "============================================================"
    Write-Host $Message
    Write-Host "============================================================"
}

function Test-HttpEndpoint {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Url,

        [int]$TimeoutSeconds = 10
    )

    try {
        $Response = Invoke-WebRequest `
            -Uri $Url `
            -UseBasicParsing `
            -TimeoutSec $TimeoutSeconds

        return [pscustomobject]@{
            Url         = $Url
            Success     = $Response.StatusCode -eq 200
            StatusCode  = $Response.StatusCode
            ContentType = $Response.Headers["Content-Type"]
            Content     = $Response.Content
        }
    }
    catch {
        return [pscustomobject]@{
            Url         = $Url
            Success     = $false
            StatusCode  = $null
            ContentType = $null
            Content     = $null
            Error       = $_.Exception.Message
        }
    }
}

function Wait-ForHealth {
    param(
        [string]$Url,
        [int]$MaximumWaitSeconds = 60
    )

    $Deadline = (Get-Date).AddSeconds($MaximumWaitSeconds)

    while ((Get-Date) -lt $Deadline) {
        $Result = Test-HttpEndpoint -Url $Url -TimeoutSeconds 5

        if ($Result.Success) {
            return $Result
        }

        Start-Sleep -Seconds 2
    }

    throw "PhysiqueOS did not become healthy within $MaximumWaitSeconds seconds."
}

function Assert-Administrator {
    $Identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $Principal = New-Object Security.Principal.WindowsPrincipal($Identity)

    $IsAdministrator = $Principal.IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator
    )

    if (-not $IsAdministrator) {
        throw @"
This deployment must run from an Administrator PowerShell terminal.

Close VS Code, right-click Visual Studio Code, select 'Run as administrator',
reopen the PhysiqueOS project, and run the deployment again.
"@
    }
}

try {
    Write-Step "PhysiqueOS Production Deployment"

    Assert-Administrator

    if (-not (Test-Path $RepoRoot)) {
        throw "Repository not found: $RepoRoot"
    }

    if (-not (Test-Path $StopScript)) {
        throw "Canonical stop script not found: $StopScript"
    }

    if (-not (Test-Path $StartScript)) {
        throw "Canonical start script not found: $StartScript"
    }

    if (-not (Test-Path $StatusScript)) {
        throw "Runtime status script not found: $StatusScript"
    }

    Set-Location $RepoRoot

    Write-Host "Repository: $RepoRoot"
    Write-Host "Started:    $((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))"

    Write-Step "1. Stopping the current production runtime"

    & powershell.exe `
        -NoProfile `
        -ExecutionPolicy Bypass `
        -File $StopScript

    if ($LASTEXITCODE -ne 0) {
        throw "The canonical stop script failed with exit code $LASTEXITCODE."
    }

    $RemainingListener = Get-NetTCPConnection `
        -LocalPort 3000 `
        -State Listen `
        -ErrorAction SilentlyContinue

    if ($RemainingListener) {
        throw "Port 3000 is still listening after the canonical stop."
    }

    Write-Host "Production runtime stopped successfully."

    Write-Step "2. Building the current source"

    & npm.cmd run build

    if ($LASTEXITCODE -ne 0) {
        throw "npm run build failed with exit code $LASTEXITCODE. Production was not restarted."
    }

    Write-Host "Production build completed successfully."

    Write-Step "3. Starting the canonical production runtime"

    & powershell.exe `
        -NoProfile `
        -ExecutionPolicy Bypass `
        -File $StartScript

    if ($LASTEXITCODE -ne 0) {
        throw "The canonical start script failed with exit code $LASTEXITCODE."
    }

    Write-Step "4. Waiting for the health endpoint"

    $HealthResult = Wait-ForHealth `
        -Url $HealthUrl `
        -MaximumWaitSeconds 60

    Write-Host "Health endpoint: HTTP $($HealthResult.StatusCode)"

    Write-Step "5. Verifying the application page"

    $PageResult = Test-HttpEndpoint -Url $LocalUrl

    if (-not $PageResult.Success) {
        throw "The local application did not return HTTP 200."
    }

    Write-Host "Application page: HTTP $($PageResult.StatusCode)"

    Write-Step "6. Verifying current CSS and JavaScript assets"

    $AssetPaths = [regex]::Matches(
        $PageResult.Content,
        '(?:href|src)="(?<path>/_next/static/[^"]+)"'
    ) | ForEach-Object {
        $_.Groups["path"].Value
    } | Sort-Object -Unique

    if ($AssetPaths.Count -eq 0) {
        throw "The application page did not reference any Next.js static assets."
    }

    $AssetResults = foreach ($AssetPath in $AssetPaths) {
        $AssetResult = Test-HttpEndpoint -Url "$LocalUrl$AssetPath"

        [pscustomobject]@{
            Status      = $AssetResult.StatusCode
            ContentType = $AssetResult.ContentType
            Path        = $AssetPath
            Success     = $AssetResult.Success
        }
    }

    $FailedAssets = @($AssetResults | Where-Object { -not $_.Success })

    $AssetResults |
        Select-Object Status, ContentType, Path |
        Format-Table -AutoSize

    if ($FailedAssets.Count -gt 0) {
        throw "$($FailedAssets.Count) referenced static asset(s) failed validation."
    }

    Write-Host "All $($AssetResults.Count) referenced static assets returned HTTP 200."

    Write-Step "7. Verifying canonical runtime ownership"

    $RuntimeStatusJson = & powershell.exe `
        -NoProfile `
        -ExecutionPolicy Bypass `
        -File $StatusScript

    if ($LASTEXITCODE -ne 0) {
        throw "The runtime status script failed with exit code $LASTEXITCODE."
    }

    $RuntimeStatus = $RuntimeStatusJson | ConvertFrom-Json

    if ($RuntimeStatus.overallState -ne "healthy") {
        throw "Runtime status is '$($RuntimeStatus.overallState)' instead of 'healthy'."
    }

    Write-Host "Runtime ownership: healthy"

    Write-Step "8. Verifying the public ngrok URL"

    $PublicResult = Test-HttpEndpoint `
        -Url $PublicUrl `
        -TimeoutSeconds 15

    if (-not $PublicResult.Success) {
        throw "The public ngrok URL did not return HTTP 200: $PublicUrl"
    }

    Write-Host "Public application: HTTP $($PublicResult.StatusCode)"
    Write-Host "Public URL: $PublicUrl"

    Write-Step "Deployment completed successfully"

    Write-Host "Local URL:  $LocalUrl"
    Write-Host "Public URL: $PublicUrl"
    Write-Host "Completed:  $((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))"
    Write-Host ""
    Write-Host "The running application now uses the latest production build."
}
catch {
    Write-Host ""
    Write-Host "DEPLOYMENT FAILED"
    Write-Host "Reason: $($_.Exception.Message)"
    Write-Host ""
    Write-Host "Do not manually kill node.exe."
    Write-Host "Review the failure before attempting another deployment."
    exit 1
}