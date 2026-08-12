[CmdletBinding()]
param(
    [string]$SourceRoot = "C:\Users\dusti\Documents\GitHub\physiqueos",
    [switch]$UsePrebuiltArtifact
)

$ErrorActionPreference = "Stop"

$RepoRoot = "C:\Users\dusti\Documents\GitHub\physiqueos"
$ResolvedSourceRoot = if (Test-Path -LiteralPath $SourceRoot) {
    (Resolve-Path -LiteralPath $SourceRoot).Path
} else {
    $SourceRoot
}
$UsesIsolatedSource = $ResolvedSourceRoot -ne $RepoRoot
$LocalUrl = "http://localhost:3000"
$HealthUrl = "$LocalUrl/api/health"
$PublicUrl = "https://float-departed-symphony.ngrok-free.dev"

$StopScript = Join-Path $RepoRoot "scripts\stopPhysiqueOS.ps1"
$StartScript = Join-Path $RepoRoot "scripts\startPhysiqueOS.ps1"
$StatusScript = Join-Path $RepoRoot "scripts\statusPhysiqueOS.ps1"
$StagedBuildPath = Join-Path $RepoRoot ".next.release-$PID"
$RollbackBuildPath = Join-Path $RepoRoot ".next.rollback-$PID"
$FailedBuildPath = Join-Path $RepoRoot ".next.failed-$PID"
$ReplacementPromoted = $false
$RuntimeStopped = $false
$ExpectedBuildId = $null
$ExpectedSourceCommit = $null

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

function Invoke-ProductionStop {
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

    $script:RuntimeStopped = $true
    Write-Host "Production runtime stopped successfully."
}

function Invoke-SourceBuild {
    Set-Location $ResolvedSourceRoot
    & npm.cmd run build

    if ($LASTEXITCODE -ne 0) {
        throw "npm run build failed with exit code $LASTEXITCODE."
    }

    $BuildIdPath = Join-Path $ResolvedSourceRoot ".next\BUILD_ID"
    if (-not (Test-Path -LiteralPath $BuildIdPath -PathType Leaf)) {
        throw "The supplied source did not produce a Next.js build identity."
    }

    $script:ExpectedBuildId = (Get-Content -LiteralPath $BuildIdPath -Raw).Trim()
    if (-not $script:ExpectedBuildId) {
        throw "The supplied source produced an empty Next.js build identity."
    }
    Set-Content -LiteralPath (Join-Path $ResolvedSourceRoot ".next\SOURCE_COMMIT") -Value $ExpectedSourceCommit -Encoding Ascii -NoNewline

    Write-Host "Production build completed successfully."
    Write-Host "Build ID: $script:ExpectedBuildId"
}

function Use-PrebuiltSourceArtifact {
    $BuildIdPath = Join-Path $ResolvedSourceRoot ".next\BUILD_ID"
    $SourceCommitPath = Join-Path $ResolvedSourceRoot ".next\SOURCE_COMMIT"
    if (-not (Test-Path -LiteralPath $BuildIdPath -PathType Leaf)) {
        throw "The prebuilt source artifact does not contain a Next.js build identity."
    }
    $script:ExpectedBuildId = (Get-Content -LiteralPath $BuildIdPath -Raw).Trim()
    if (-not $script:ExpectedBuildId) {
        throw "The prebuilt source artifact contains an empty Next.js build identity."
    }
    if (-not (Test-Path -LiteralPath $SourceCommitPath -PathType Leaf)) {
        throw "The prebuilt source artifact does not contain an immutable source identity."
    }
    $ArtifactSourceCommit = (Get-Content -LiteralPath $SourceCommitPath -Raw).Trim()
    if ($ArtifactSourceCommit -ne $ExpectedSourceCommit) {
        throw "Prebuilt artifact source '$ArtifactSourceCommit' does not match deployment source '$ExpectedSourceCommit'."
    }
    Write-Host "Using the explicitly supplied preflighted artifact."
    Write-Host "Build ID: $script:ExpectedBuildId"
}

function Stage-IsolatedBuild {
    if (Test-Path -LiteralPath $StagedBuildPath) {
        throw "Deployment staging path already exists: $StagedBuildPath"
    }
    Copy-Item `
        -LiteralPath (Join-Path $ResolvedSourceRoot ".next") `
        -Destination $StagedBuildPath `
        -Recurse `
        -Force
    if (-not (Test-Path -LiteralPath (Join-Path $StagedBuildPath "BUILD_ID"))) {
        throw "The isolated build was not copied into the production staging path."
    }
    Write-Host "Isolated build staged for promotion: $StagedBuildPath"
}

function Promote-IsolatedBuild {
    $CurrentBuildPath = Join-Path $RepoRoot ".next"
    if (-not (Test-Path -LiteralPath $CurrentBuildPath -PathType Container)) {
        throw "The current production build is missing: $CurrentBuildPath"
    }
    if (Test-Path -LiteralPath $RollbackBuildPath) {
        throw "Deployment rollback path already exists: $RollbackBuildPath"
    }
    Move-Item -LiteralPath $CurrentBuildPath -Destination $RollbackBuildPath
    try {
        Move-Item -LiteralPath $StagedBuildPath -Destination $CurrentBuildPath
        $script:ReplacementPromoted = $true
    }
    catch {
        Move-Item -LiteralPath $RollbackBuildPath -Destination $CurrentBuildPath
        throw
    }
    Write-Host "Isolated build promoted to the canonical production destination."
    Write-Host "Previous build retained at: $RollbackBuildPath"
}

try {
    Write-Step "PhysiqueOS Production Deployment"

    Assert-Administrator

    if (-not (Test-Path $RepoRoot)) {
        throw "Repository not found: $RepoRoot"
    }

    if (-not (Test-Path -LiteralPath $ResolvedSourceRoot -PathType Container)) {
        throw "Deployment source not found: $ResolvedSourceRoot"
    }

    if (-not (Test-Path -LiteralPath (Join-Path $ResolvedSourceRoot "package.json") -PathType Leaf)) {
        throw "Deployment source is not a PhysiqueOS source root: $ResolvedSourceRoot"
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
    if ($UsePrebuiltArtifact -and -not $UsesIsolatedSource) {
        throw "-UsePrebuiltArtifact requires an explicitly supplied isolated source root."
    }

    Write-Host "Production repository: $RepoRoot"
    Write-Host "Deployment source:    $ResolvedSourceRoot"
    Write-Host "Source mode:          $(if ($UsesIsolatedSource) { 'isolated' } else { 'default' })"
    $SourceCommit = (& git -C $ResolvedSourceRoot rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0) { throw "Unable to identify the deployment source commit." }
    $RepositoryCommit = (& git -C $RepoRoot rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0) { throw "Unable to identify the canonical repository commit." }
    if ($RepositoryCommit -ne $SourceCommit) {
        throw "Deployment source commit $SourceCommit does not match canonical repository HEAD $RepositoryCommit."
    }
    $SourceStatus = @(& git -C $ResolvedSourceRoot status --porcelain --untracked-files=no)
    if ($LASTEXITCODE -ne 0) { throw "Unable to verify deployment source cleanliness." }
    if ($SourceStatus.Count -gt 0) { throw "Deployment source contains tracked working-tree changes." }
    $RepositoryStatus = @(& git -C $RepoRoot status --porcelain --untracked-files=no)
    if ($LASTEXITCODE -ne 0) { throw "Unable to verify canonical repository cleanliness." }
    if ($RepositoryStatus.Count -gt 0) { throw "Canonical repository contains tracked working-tree changes." }
    $ExpectedSourceCommit = $SourceCommit
    Write-Host "Source commit:        $SourceCommit"
    Write-Host "Started:    $((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))"

    if ($UsesIsolatedSource) {
        if ($UsePrebuiltArtifact) {
            Write-Step "1. Verifying the explicitly supplied preflighted artifact"
            Use-PrebuiltSourceArtifact
        }
        else {
            Write-Step "1. Building the explicitly supplied isolated source"
            Invoke-SourceBuild
        }
        Stage-IsolatedBuild

        Write-Step "2. Stopping the current production runtime"
        Set-Location $RepoRoot
        Invoke-ProductionStop
        Promote-IsolatedBuild
    }
    else {
        Write-Step "1. Stopping the current production runtime"
        Set-Location $RepoRoot
        Invoke-ProductionStop

        Write-Step "2. Building the current source"
        Invoke-SourceBuild
    }

    Write-Step "3. Starting the canonical production runtime"

    & powershell.exe `
        -NoProfile `
        -ExecutionPolicy Bypass `
        -File $StartScript

    if ($LASTEXITCODE -ne 0) {
        throw "The canonical start script failed with exit code $LASTEXITCODE."
    }
    $RuntimeStopped = $false

    Write-Step "4. Waiting for the health endpoint"

    $HealthResult = Wait-ForHealth `
        -Url $HealthUrl `
        -MaximumWaitSeconds 60

    try {
        $HealthIdentity = $HealthResult.Content | ConvertFrom-Json
    }
    catch {
        throw "The health endpoint did not return a valid build identity document."
    }
    if ($HealthIdentity.buildId -ne $ExpectedBuildId) {
        throw "Health build identity '$($HealthIdentity.buildId)' does not match promoted build '$ExpectedBuildId'."
    }
    if ($HealthIdentity.gitHead -ne $ExpectedSourceCommit) {
        throw "Health source identity '$($HealthIdentity.gitHead)' does not match deployment source '$ExpectedSourceCommit'."
    }

    Write-Host "Health endpoint: HTTP $($HealthResult.StatusCode)"
    Write-Host "Health build identity: $($HealthIdentity.buildId)"
    Write-Host "Health source identity: $($HealthIdentity.gitHead)"

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

    $FailedAssets = @($AssetResults | Where-Object {
        $ExpectedContentType = if ($_.Path -match '\.css(?:\?|$)') {
            '^text/css(?:;|$)'
        }
        elseif ($_.Path -match '\.js(?:\?|$)') {
            '^(?:application|text)/javascript(?:;|$)'
        }
        else {
            $null
        }
        -not $_.Success -or -not $ExpectedContentType -or $_.ContentType -notmatch $ExpectedContentType
    })

    $AssetResults |
        Select-Object Status, ContentType, Path |
        Format-Table -AutoSize

    if ($FailedAssets.Count -gt 0) {
        throw "$($FailedAssets.Count) referenced static asset(s) failed status or content-type validation."
    }

    Write-Host "All $($AssetResults.Count) referenced static assets returned HTTP 200 with the expected CSS/JavaScript content type."

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
    Write-Host "Source:     $ResolvedSourceRoot"
    Write-Host "Build ID:   $((Get-Content -LiteralPath (Join-Path $RepoRoot '.next\BUILD_ID') -Raw).Trim())"
    Write-Host "Completed:  $((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))"
    Write-Host ""
    Write-Host "The running application now uses the latest production build."
}
catch {
    $DeploymentError = $_
    if ($UsesIsolatedSource -and $ReplacementPromoted -and (Test-Path -LiteralPath $RollbackBuildPath)) {
        Write-Host "Attempting automatic rollback to the previous production build."
        try {
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $StopScript | Out-Null
            $CurrentBuildPath = Join-Path $RepoRoot ".next"
            if (Test-Path -LiteralPath $CurrentBuildPath) {
                Move-Item -LiteralPath $CurrentBuildPath -Destination $FailedBuildPath
            }
            Move-Item -LiteralPath $RollbackBuildPath -Destination $CurrentBuildPath
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $StartScript | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "The rollback runtime did not start." }
            Wait-ForHealth -Url $HealthUrl -MaximumWaitSeconds 60 | Out-Null
            Write-Host "Previous production build restored successfully."
        }
        catch {
            Write-Host "Automatic rollback failed: $($_.Exception.Message)"
        }
    }
    elseif ($UsesIsolatedSource -and $RuntimeStopped) {
        try {
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $StartScript | Out-Null
            Wait-ForHealth -Url $HealthUrl -MaximumWaitSeconds 60 | Out-Null
            Write-Host "Previous production runtime restarted successfully."
        }
        catch {
            Write-Host "Previous production runtime restart failed: $($_.Exception.Message)"
        }
    }
    Write-Host ""
    Write-Host "DEPLOYMENT FAILED"
    Write-Host "Reason: $($DeploymentError.Exception.Message)"
    Write-Host ""
    Write-Host "Do not manually kill node.exe."
    Write-Host "Review the failure before attempting another deployment."
    exit 1
}
