param(
    [switch]$NoLaunch,
    [switch]$NoPath,
    [string]$InstallRoot = (Join-Path $env:USERPROFILE '.symbiote')
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
if ($env:NODE_OPTIONS -notmatch '(^|\s)--experimental-strip-types(\s|$)') {
    $env:NODE_OPTIONS = "$env:NODE_OPTIONS --experimental-strip-types".Trim()
}
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12

$root = [IO.Path]::GetFullPath($InstallRoot)
$app = Join-Path $root 'app'
$runtime = Join-Path $root 'runtime\node-v22.19.0'
$bin = Join-Path $root 'bin'
$work = Join-Path ([IO.Path]::GetTempPath()) ('symbiote-install-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $root, $work | Out-Null

function Test-NodeTypeScript([string]$Executable, [string]$Probe) {
    $previousPreference = $ErrorActionPreference
    try {
        # Node 22 may print an experimental warning even when the probe succeeds.
        $ErrorActionPreference = 'Continue'
        & $Executable $Probe 2>$null
        return $LASTEXITCODE -eq 0
    } finally { $ErrorActionPreference = $previousPreference }
}

try {
    $probe = Join-Path $work 'node-probe.ts'
    [IO.File]::WriteAllText($probe, 'const value: number = 1; if (value !== 1) process.exit(1);', [Text.Encoding]::ASCII)
    if (-not (Test-Path -LiteralPath $app)) {
        Write-Host 'Downloading Symbiote...'
        $archive = Join-Path $work 'symbiote.zip'
        Invoke-WebRequest -UseBasicParsing 'https://github.com/rajarshidattapy/Symbiote/archive/refs/heads/master.zip' -OutFile $archive
        Expand-Archive -LiteralPath $archive -DestinationPath $work
        $extracted = Join-Path $work 'Symbiote-master'
        if (-not (Test-Path -LiteralPath (Join-Path $extracted 'ai-service/package.json'))) { throw 'The downloaded archive is missing required files.' }
        Move-Item -LiteralPath $extracted -Destination $app
    } elseif (-not (Test-Path -LiteralPath (Join-Path $app 'ai-service/package.json'))) {
        throw "The installation directory $app already exists and is not a Symbiote installation. It was not changed."
    } else {
        Write-Host 'Using your existing Symbiote installation; local files and credentials will be preserved.'
    }

    $node = Join-Path $runtime 'node.exe'
    if (-not (Test-Path -LiteralPath $node)) {
        $systemNode = Get-Command node.exe -ErrorAction SilentlyContinue
        $systemNpm = Get-Command npm.cmd -ErrorAction SilentlyContinue
        if ($systemNode -and $systemNpm) {
            $versionText = & $systemNode.Source -p 'process.versions.node'
            if ($LASTEXITCODE -eq 0 -and [version]$versionText -ge [version]'22.19.0') {
                if (Test-NodeTypeScript $systemNode.Source $probe) { $node = $systemNode.Source }
            }
        }
    }
    if (-not (Test-Path -LiteralPath $node)) {
        if (Test-Path -LiteralPath $runtime) { throw "The Node runtime directory $runtime is incomplete and was not changed." }
        $architecture = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'arm64' } else { 'x64' }
        $filename = "node-v22.19.0-win-$architecture.zip"
        $expected = if ($architecture -eq 'arm64') { 'e4a7336010d58ff35b53d9dd5869095c56089c70913cf22508cf8183593e56b2' } else { 'ea3fad0e67a991d8477d8c01344b56e69c676ccb733f065b22436994b1253f86' }
        $archive = Join-Path $work $filename
        Write-Host 'Installing a private Node.js runtime...'
        Invoke-WebRequest -UseBasicParsing "https://nodejs.org/dist/v22.19.0/$filename" -OutFile $archive
        if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ine $expected) { throw 'Node.js download checksum did not match.' }
        Expand-Archive -LiteralPath $archive -DestinationPath $work
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $runtime) | Out-Null
        Move-Item -LiteralPath (Join-Path $work "node-v22.19.0-win-$architecture") -Destination $runtime
        $node = Join-Path $runtime 'node.exe'
    }
    if (-not (Test-NodeTypeScript $node $probe)) { throw 'The selected Node.js runtime cannot execute TypeScript.' }
    $env:Path = (Split-Path -Parent $node) + ';' + $env:Path
    $npm = Get-Command npm.cmd -ErrorAction Stop

    Write-Host 'Installing the AI service and building Pi...'
    Push-Location (Join-Path $app 'ai-service')
    try { & $npm.Source ci --ignore-scripts --no-audit --no-fund; if ($LASTEXITCODE -ne 0) { throw 'AI service dependency installation failed.' } }
    finally { Pop-Location }
    Push-Location (Join-Path $app 'harness')
    try {
        & $npm.Source ci --ignore-scripts --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw 'Pi dependency installation failed.' }
        & $npm.Source run hydrate:model-data
        if ($LASTEXITCODE -ne 0) { throw 'Pi model catalog download failed. Check your network connection and retry.' }
        & $npm.Source run build:offline
        if ($LASTEXITCODE -ne 0) { throw 'Pi build failed.' }
    } finally { Pop-Location }
    Write-Host 'Installing the sign-in browser...'
    & $node (Join-Path $app 'ai-service/node_modules/playwright/cli.js') install chromium --no-shell
    if ($LASTEXITCODE -ne 0) { throw 'Browser installation failed.' }

    New-Item -ItemType Directory -Force -Path $bin | Out-Null
    $shim = Join-Path $bin 'symbiote.cmd'
    $content = '@echo off' + "`r`n" + 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\app\symbiote.ps1" %*' + "`r`n"
    if ((Test-Path -LiteralPath $shim) -and (Get-Content -LiteralPath $shim -Raw) -ne $content) { throw "A different command exists at $shim; it was not overwritten." }
    [IO.File]::WriteAllText($shim, $content, [Text.Encoding]::ASCII)
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    if (-not $NoPath -and -not (($userPath -split ';') | Where-Object { $_.TrimEnd('\') -ieq $bin.TrimEnd('\') })) {
        $updatedPath = if ([string]::IsNullOrWhiteSpace($userPath)) { $bin } else { $bin + ';' + $userPath }
        [Environment]::SetEnvironmentVariable('Path', $updatedPath, 'User')
    }
    Write-Host 'Symbiote is installed. Open a new terminal to use the symbiote command.'
    if (-not $NoLaunch) {
        Write-Host 'Starting first-time setup...'
        & $node (Join-Path $app 'ai-service/launcher.ts')
        if ($LASTEXITCODE -ne 0) { throw 'First-time setup did not finish. Run symbiote in a new terminal to retry.' }
    }
} finally {
    if (Test-Path -LiteralPath $work) {
        $tempRoot = (Resolve-Path -LiteralPath ([IO.Path]::GetTempPath())).Path.TrimEnd('\') + '\'
        $resolved = (Resolve-Path -LiteralPath $work).Path
        if ($resolved.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) { Remove-Item -LiteralPath $resolved -Recurse -Force }
    }
}
