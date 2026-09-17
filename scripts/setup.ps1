# 初始化项目：安装依赖 + 生成 .env（若不存在）
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path node_modules)) {
  Write-Host '>> npm install ...'
  npm install --no-audit --no-fund
} else {
  Write-Host '>> node_modules 已存在，跳过安装'
}

if (-not (Test-Path .env)) {
  Copy-Item .env.example .env
  Write-Host '>> 已生成 .env，请打开填写 KIMI_API_KEY'
} else {
  Write-Host '>> .env 已存在'
}

Write-Host '>> 完成。常用命令：'
Write-Host '   npm run self-test      # 离线自测（不联网）'
Write-Host '   npm run task:local     # 本地测试页任务（live）'
Write-Host '   npm run task:sauce     # 真实网页：SauceDemo 登录（live）'