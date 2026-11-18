param(
    [ValidateSet('chatgpt', 'gemini')]
    [string]$Provider,
    [switch]$Login,
    [switch]$ManualLogin,
    [switch]$Select,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$PiArguments
)

$launcher = Join-Path $PSScriptRoot 'ai-service/launcher.ts'
if (-not (Test-Path -LiteralPath $launcher)) {
    Write-Error 'Symbiote AI service was not found; reinstall Symbiote.'
    exit 1
}
$launcherArguments = @()
if ($Provider) { $launcherArguments += @('--provider', $Provider) }
if ($Login) { $launcherArguments += '--login' }
if ($ManualLogin) { $launcherArguments += '--manual-login' }
if ($Select) { $launcherArguments += '--select' }
$launcherArguments += '--'
if ($PiArguments) { $launcherArguments += $PiArguments }
if ($env:NODE_OPTIONS -notmatch '(^|\s)--experimental-strip-types(\s|$)') {
    $env:NODE_OPTIONS = "$env:NODE_OPTIONS --experimental-strip-types".Trim()
}
$installRoot = Split-Path -Parent $PSScriptRoot
$portableNode = Join-Path $installRoot 'runtime\node-v22.19.0\node.exe'
if (Test-Path -LiteralPath $portableNode) { $node = $portableNode }
else {
    $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
    if (-not $nodeCommand) { Write-Error 'Node.js 22.19 or newer is required. Run the Symbiote installer.'; exit 1 }
    $node = $nodeCommand.Source
}
& $node $launcher @launcherArguments
exit $LASTEXITCODE
