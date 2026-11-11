$ErrorActionPreference = 'Stop'

$statusLines = & npx.cmd supabase status --output env 2>$null
if ($LASTEXITCODE -ne 0) { throw 'Supabase status failed. Start the local services with: npx supabase start' }
$values = @{}
foreach ($line in $statusLines) {
  if ($line -match '^([A-Z0-9_]+)=(.*)$') { $values[$Matches[1]] = $Matches[2].Trim('"') }
}
if (-not $values.API_URL -or -not $values.PUBLISHABLE_KEY -or -not $values.SERVICE_ROLE_KEY) {
  throw 'Supabase services are not all running. Start them with: npx supabase start'
}

$envPath = Join-Path (Get-Location) '.env.local'
$existing = @{}
if (Test-Path -LiteralPath $envPath) {
  foreach ($line in Get-Content -LiteralPath $envPath) {
    if ($line -match '^([A-Z0-9_]+)=(.*)$') { $existing[$Matches[1]] = $Matches[2] }
  }
}
$existing['NEXT_PUBLIC_SUPABASE_URL'] = $values.API_URL
$existing['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'] = $values.PUBLISHABLE_KEY
$existing['SUPABASE_SERVICE_ROLE_KEY'] = $values.SERVICE_ROLE_KEY
$existing['DATABASE_URL'] = $values.DB_URL
if (-not $existing.ContainsKey('NEBIUS_API_KEY')) { $existing['NEBIUS_API_KEY'] = '' }
if (-not $existing.ContainsKey('NEBIUS_BASE_URL')) { $existing['NEBIUS_BASE_URL'] = 'https://api.tokenfactory.nebius.com/v1' }
if (-not $existing.ContainsKey('NEBIUS_MODEL')) { $existing['NEBIUS_MODEL'] = 'Qwen/Qwen3.5-397B-A17B' }
if (-not $existing.ContainsKey('NEBIUS_EMBEDDING_MODEL')) { $existing['NEBIUS_EMBEDDING_MODEL'] = 'Qwen/Qwen3-Embedding-8B' }
if (-not $existing.ContainsKey('GITHUB_TOKEN')) { $existing['GITHUB_TOKEN'] = '' }
if (-not $existing.ContainsKey('EXTRACTOR_URL')) { $existing['EXTRACTOR_URL'] = 'http://127.0.0.1:8000' }
$existing['RELAYOPS_WEB_URL'] = 'http://127.0.0.1:3000'
if (-not $existing['EXTRACTOR_SHARED_TOKEN']) {
  $sharedKeyBytes = [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
  $existing['EXTRACTOR_SHARED_TOKEN'] = [Convert]::ToHexString($sharedKeyBytes).ToLowerInvariant()
}

$lines = foreach ($key in ($existing.Keys | Sort-Object)) { "$key=$($existing[$key])" }
Set-Content -LiteralPath $envPath -Value $lines -Encoding utf8
Write-Host 'Wrote local Supabase connection settings to .env.local (secret values hidden).'
