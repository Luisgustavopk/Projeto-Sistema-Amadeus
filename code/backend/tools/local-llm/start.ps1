param([int]$Port = 8003, [int]$Threads = 4)
$ErrorActionPreference = 'Stop'
if ($Port -lt 1024 -or $Port -gt 65535 -or $Threads -lt 1 -or $Threads -gt 12) { throw 'Invalid port or thread count.' }
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '../../../../')).Path
$runtime = Join-Path $projectRoot '.cache/local-llm/runtime/llama-server.exe'
$model = Join-Path $projectRoot '.cache/local-llm/Qwen3-1.7B-Q8_0.gguf'
if (-not (Test-Path -LiteralPath $runtime) -or -not (Test-Path -LiteralPath $model)) { throw 'Run local-llm/setup.py first.' }
$credentialFile = Join-Path $projectRoot '.cache/local-llm/access-token'
if (-not (Test-Path -LiteralPath $credentialFile)) {
    $buffer = New-Object byte[] 32
    $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($buffer) } finally { $generator.Dispose() }
    [IO.File]::WriteAllText($credentialFile, [Convert]::ToBase64String($buffer), (New-Object Text.UTF8Encoding($false)))
}
& $runtime --api-key-file $credentialFile --model $model --alias amadeus-local --host 127.0.0.1 --port $Port --n-gpu-layers 0 --threads $Threads --threads-batch $Threads --ctx-size 8192 --parallel 1 --no-webui --jinja --reasoning off --no-context-shift
