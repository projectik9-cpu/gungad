param(
    [string]$TargetUrl = "https://webapp-rosy-psi-26.vercel.app"
)

$ErrorActionPreference = "Continue"

$env:NoColor = "1"

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  GunGad Casino - DEPLOY TO VERCEL" -ForegroundColor Cyan
Write-Host "  Target: $TargetUrl" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

$RepoRoot = Split-Path -Parent $PSScriptRoot
$WebAppDir = Join-Path $RepoRoot "gungad-casino"

# --- 1. Check Node.js ------------------------------------
Write-Host "[1/7] Checking Node.js..." -ForegroundColor Yellow
try {
    $nodeVer = node --version
    Write-Host "  OK: Node $nodeVer" -ForegroundColor Green
} catch {
    Write-Host "  ERROR: Node.js not found. Download from https://nodejs.org (LTS)" -ForegroundColor Red
    exit 1
}

# --- 2. Install dependencies -----------------------------
Write-Host "[2/7] Installing webapp dependencies (gungad-casino)..." -ForegroundColor Yellow
Set-Location -Path $WebAppDir
npm install
if (-not $?) {
    Write-Host "  ERROR: npm install failed" -ForegroundColor Red
    exit 1
}
Write-Host "  OK" -ForegroundColor Green

# --- 3. Build webapp --------------------------------------
Write-Host "[3/7] Building webapp..." -ForegroundColor Yellow
npm run build
if (-not $?) {
    Write-Host "  ERROR: build failed" -ForegroundColor Red
    exit 1
}
Write-Host "  OK: built to gungad-casino/dist" -ForegroundColor Green

# --- 4. Vercel login (if not logged in) -------------------
Write-Host "[4/7] Checking Vercel login..." -ForegroundColor Yellow
Set-Location -Path $RepoRoot
& npx vercel whoami 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  Not logged in. A browser window will open. Click Continue -> Authorize." -ForegroundColor Yellow
    npx vercel login
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ERROR: Vercel login failed" -ForegroundColor Red
        exit 1
    }
    Write-Host "  OK: logged in" -ForegroundColor Green
} else {
    Write-Host "  OK: logged in" -ForegroundColor Green
}

# --- 5. Link to the 'webapp' project ----------------------
Write-Host "[5/7] Linking to Vercel project 'webapp'..." -ForegroundColor Yellow
& npx vercel link --yes --project webapp 2>$null | Out-Host
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERROR: linking failed. Check that project 'webapp' exists in your Vercel team." -ForegroundColor Red
    exit 1
}
Write-Host "  OK" -ForegroundColor Green

# --- 6. Deploy --------------------------------------------
Write-Host "[6/7] Deploying to Vercel..." -ForegroundColor Yellow
$deployOutput = & npx vercel --prod --yes 2>$null | Out-String
Write-Host $deployOutput
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERROR: deploy failed. Check error above." -ForegroundColor Red
    exit 1
}

# Verify the alias with an HTTP check
try {
    $response = Invoke-WebRequest -Uri $TargetUrl -UseBasicParsing -TimeoutSec 30
    if ($response.StatusCode -eq 200) {
        Write-Host "  OK: $TargetUrl responds with HTTP $($response.StatusCode)" -ForegroundColor Green
    } else {
        Write-Host "  WARNING: $TargetUrl responded with HTTP $($response.StatusCode)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  WARNING: could not reach $TargetUrl : $($_.Exception.Message)" -ForegroundColor Yellow
}

# --- 7. Update .env files with the target URL -------------
Write-Host "[7/7] Updating .env files..." -ForegroundColor Yellow

$envFile = Join-Path $RepoRoot ".env"
if (Test-Path $envFile) {
    $content = Get-Content $envFile -Raw
    if ($content -match 'WEB_APP_URL=') {
        $content = $content -replace '(?<=WEB_APP_URL=).*', $TargetUrl
    } else {
        $content += "`nWEB_APP_URL=$TargetUrl`n"
    }
    Set-Content $envFile $content -NoNewline -Encoding ASCII
    Write-Host "  Updated WEB_APP_URL in .env -> $TargetUrl" -ForegroundColor Gray
}

# --- Final instructions -----------------------------------
Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  DEPLOY COMPLETE!" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Your webapp is live at:" -ForegroundColor White
Write-Host "  $TargetUrl" -ForegroundColor Green
Write-Host ""
Write-Host "  --- WHAT TO DO NEXT ---" -ForegroundColor Yellow
Write-Host ""
Write-Host "  1. OPEN BOTFATHER in Telegram" -ForegroundColor White
Write-Host "     https://t.me/BotFather"
Write-Host ""
Write-Host "  2. Send: /mybots -> choose your bot ->" -ForegroundColor White
Write-Host "     Bot Settings -> Menu Button" -ForegroundColor White
Write-Host "     Send URL: $TargetUrl" -ForegroundColor Green
Write-Host ""
Write-Host "  3. Bot Settings -> Domain Whitelist" -ForegroundColor White
Write-Host "     Add: $TargetUrl" -ForegroundColor Green
Write-Host ""
Write-Host "  4. Start the bot locally (repo root):" -ForegroundColor White
Write-Host "     npm install" -ForegroundColor Gray
Write-Host "     npm start" -ForegroundColor Gray
Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
