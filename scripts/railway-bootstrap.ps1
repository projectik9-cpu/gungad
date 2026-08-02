#Requires -Version 5.1
<#
  Один раз после railway login:
    .\scripts\railway-bootstrap.ps1

  Что делает:
  - создаёт/линкует Railway project из текущего репо
  - заливает Variables из корневого .env
  - генерит публичный домен
  - печатает VITE_API_URL и (если есть vercel) проставляет его
#>
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

function Get-DotEnv([string]$Path) {
  $map = @{}
  if (-not (Test-Path $Path)) { throw ".env not found: $Path" }
  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#')) { return }
    $i = $line.IndexOf('=')
    if ($i -lt 1) { return }
    $k = $line.Substring(0, $i).Trim()
    $v = $line.Substring($i + 1).Trim().Trim('"').Trim("'")
    $map[$k] = $v
  }
  return $map
}

Write-Host "==> Checking Railway auth..."
npx -y @railway/cli@latest whoami | Out-Host
if ($LASTEXITCODE -ne 0) {
  Write-Host "Сначала залогинься: npx @railway/cli@latest login"
  exit 1
}

$envMap = Get-DotEnv (Join-Path $Root '.env')
$needed = @('BOT_TOKEN', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'WEB_APP_URL')
foreach ($k in $needed) {
  if (-not $envMap[$k]) { throw "Missing $k in .env" }
}

Write-Host "==> Init / link Railway project..."
# Non-interactive-ish: create project named gungad-bot if not linked
if (-not (Test-Path (Join-Path $Root '.railway'))) {
  npx -y @railway/cli@latest init --name gungad-bot 2>&1 | Out-Host
}

Write-Host "==> Setting variables..."
$vars = @{
  BOT_TOKEN                  = $envMap['BOT_TOKEN']
  SUPABASE_URL               = $envMap['SUPABASE_URL']
  SUPABASE_ANON_KEY          = $envMap['SUPABASE_ANON_KEY']
  SUPABASE_SERVICE_ROLE_KEY  = $envMap['SUPABASE_SERVICE_ROLE_KEY']
  WEB_APP_URL                = $envMap['WEB_APP_URL']
  NODE_ENV                   = 'production'
  JWT_SECRET                 = $(if ($envMap['JWT_SECRET']) { $envMap['JWT_SECRET'] } else { 'gg_' + [guid]::NewGuid().ToString('N') })
  ENCRYPTION_KEY             = $(if ($envMap['ENCRYPTION_KEY'] -and $envMap['ENCRYPTION_KEY'].Length -ge 32) { $envMap['ENCRYPTION_KEY'] } else { 'gg_enc_' + [guid]::NewGuid().ToString('N') })
  LOG_LEVEL                  = 'info'
  ADMIN_IDS                  = $(if ($envMap['ADMIN_IDS']) { $envMap['ADMIN_IDS'] } else { '' })
}

foreach ($pair in $vars.GetEnumerator()) {
  Write-Host ("  set {0}" -f $pair.Key)
  npx -y @railway/cli@latest variables set ("{0}={1}" -f $pair.Key, $pair.Value) 2>&1 | Out-Null
}

Write-Host "==> Deploy..."
npx -y @railway/cli@latest up --detach 2>&1 | Out-Host

Write-Host "==> Generate domain..."
npx -y @railway/cli@latest domain 2>&1 | Out-Host

Write-Host ""
Write-Host "DONE. Скопируй Railway URL и поставь в Vercel:"
Write-Host "  VITE_API_URL=https://ТВОЙ-DOMAIN.up.railway.app"
Write-Host ""
Write-Host "Проверка: https://ТВОЙ-DOMAIN.up.railway.app/api/health"
