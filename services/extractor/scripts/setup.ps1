$ErrorActionPreference = 'Stop'
$serviceRoot = Split-Path -Parent $PSScriptRoot
Set-Location $serviceRoot

if (-not (Test-Path -LiteralPath '.venv/Scripts/python.exe')) {
  python -m venv .venv
}
& .venv/Scripts/python.exe -m pip install --upgrade pip
& .venv/Scripts/python.exe -m pip install -r requirements.txt
& .venv/Scripts/python.exe -m spacy download en_core_web_sm
Write-Host 'Extractor environment is ready. Add a Gemini key to the root .env.local before requesting AI extraction.'
