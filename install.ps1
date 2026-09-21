# Windows wrapper (PowerShell 5+). Clones (or pulls) the repo if needed, then runs node install.js.
#
#   powershell -ExecutionPolicy Bypass -File install.ps1 [--copy]
#   irm https://raw.githubusercontent.com/luhhaf/agy-harness/main/install.ps1 | iex
param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Rest)
$ErrorActionPreference = 'Stop'
$RepoUrl = if ($env:AGY_HARNESS_REPO) { $env:AGY_HARNESS_REPO } else { 'https://github.com/luhhaf/agy-harness.git' }
$SelfDir = if ($PSScriptRoot) { $PSScriptRoot } else { '' }
if ($SelfDir -and (Test-Path (Join-Path $SelfDir 'install.js'))) {
  $Dir = $SelfDir
} else {
  $Dir = if ($env:AGY_HARNESS_DIR) { $env:AGY_HARNESS_DIR } else { Join-Path $HOME 'agy-harness' }
  if (Test-Path (Join-Path $Dir '.git')) { git -C $Dir pull --ff-only } else { git clone $RepoUrl $Dir }
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Write-Error 'node not found. Install Node.js >= 18 first.'; exit 1 }
& node (Join-Path $Dir 'install.js') @Rest
exit $LASTEXITCODE
