param(
    [ValidateSet('chatgpt', 'gemini')]
    [string]$Provider = 'chatgpt',
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$PiArguments
)

$cli = Join-Path $PSScriptRoot 'harness/packages/coding-agent/dist/cli.js'
$extension = Join-Path $PSScriptRoot 'ai-service/pi-provider.ts'
if (-not (Test-Path -LiteralPath $cli)) {
    Write-Error 'Pi is not built. In the harness folder run npm install --ignore-scripts and npm run build:offline.'
    exit 1
}
& node $cli -e $extension --provider symbiote --model $Provider @PiArguments
exit $LASTEXITCODE
