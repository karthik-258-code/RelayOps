$ErrorActionPreference = 'Stop'
$serviceRoot = Split-Path -Parent $PSScriptRoot
$repoRoot = (Resolve-Path (Join-Path $serviceRoot '../..')).Path
Set-Location $serviceRoot
if (-not (Test-Path -LiteralPath (Join-Path $repoRoot '.env.local'))) {
  throw 'Run scripts/setup-local-env.ps1 from the repository root first.'
}
& .venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --env-file (Join-Path $repoRoot '.env.local')
