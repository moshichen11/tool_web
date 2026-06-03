param(
  [ValidateSet("cookie", "token")]
  [string]$Mode = "cookie"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $repoRoot ".env.local"
$key = if ($Mode -eq "token") { "XUEQIU_TOKEN" } else { "XUEQIU_COOKIE" }

function Convert-SecureStringToPlainText {
  param([Parameter(Mandatory = $true)] [securestring]$SecureValue)
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
  try {
    [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  } finally {
    if ($ptr -ne [IntPtr]::Zero) {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    }
  }
}

function Set-EnvLine {
  param(
    [Parameter(Mandatory = $true)] [string[]]$Lines,
    [Parameter(Mandatory = $true)] [string]$Name,
    [Parameter(Mandatory = $true)] [string]$Value
  )

  $escaped = $Value.Replace("\", "\\").Replace('"', '\"')
  $line = "$Name=""$escaped"""
  $pattern = "^$([Regex]::Escape($Name))="
  $found = $false

  $updated = foreach ($existing in $Lines) {
    if ($existing -match $pattern) {
      $found = $true
      $line
    } else {
      $existing
    }
  }

  if (-not $found) {
    $updated += $line
  }

  $updated
}

if (-not (Test-Path -LiteralPath $envPath)) {
  @(
    "STOCK_DATA_SOURCE=xueqiu",
    "XUEQIU_COOKIE=",
    "XUEQIU_TOKEN=",
    "XUEQIU_TIMEOUT_MS=6000",
    "XUEQIU_RETRY_ATTEMPTS=3",
    "XUEQIU_RETRY_DELAY_MS=250",
    "XUEQIU_CACHE_TTL_MS=5000",
    "XUEQIU_RATE_LIMIT_WINDOW_MS=60000",
    "XUEQIU_RATE_LIMIT_MAX_REQUESTS=90"
  ) | Set-Content -LiteralPath $envPath -Encoding utf8
}

$secureValue = Read-Host "Enter $key" -AsSecureString
$plainValue = Convert-SecureStringToPlainText -SecureValue $secureValue

if ([string]::IsNullOrWhiteSpace($plainValue)) {
  throw "$key cannot be empty."
}

$lines = Get-Content -LiteralPath $envPath
$lines = Set-EnvLine -Lines $lines -Name "STOCK_DATA_SOURCE" -Value "xueqiu"
$lines = Set-EnvLine -Lines $lines -Name $key -Value $plainValue
$lines | Set-Content -LiteralPath $envPath -Encoding utf8

Write-Host "$key configured in .env.local"
