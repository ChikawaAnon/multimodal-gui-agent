# 便捷运行：.scriptsun.ps1 [任务名或URL] [参数]
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
if (-not (Test-Path node_modules)) { & (Join-Path $PSScriptRoot 'setup.ps1') }
$argsStr = $args -join ' '
node src/run.js $argsStr
exit $LASTEXITCODE