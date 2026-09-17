# 注册 Windows 计划任务：每天定时跑多模态队列
# 用法：
#   .\scripts\schedule.ps1 -DryRun                  # 只预览要执行的命令
#   .\scripts\schedule.ps1 -TaskName CodexQueue -Time 09:00
#   .\scripts\schedule.ps1 -Remove                  # 删除计划任务
param(
  [string]$TaskName = 'CodexMultimodalQueue',
  [string]$QueueFile = '',
  [string]$Time = '09:00',
  [switch]$DryRun,
  [switch]$Remove
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not $QueueFile) { $QueueFile = Join-Path $root 'data\tasks\queue.example.json' }
$cmdPath = Join-Path $PSScriptRoot 'queue-run.cmd'

if ($Remove) {
  $sch = 'schtasks /Delete /TN "' + $TaskName + '" /F'
  if ($DryRun) { Write-Host $sch } else { Invoke-Expression $sch; Write-Host ('已删除计划任务: ' + $TaskName) }
  exit 0
}

$sch = 'schtasks /Create /TN "' + $TaskName + '" /TR "' + $cmdPath + '" "' + $QueueFile + '" /SC DAILY /ST ' + $Time + ' /F'
if ($DryRun) {
  Write-Host '将执行:'
  Write-Host $sch
  Write-Host ''
  Write-Host '说明：计划任务运行于非交互会话，仅适合网页(headless)任务；桌面任务请在已登录会话手动运行。'
} else {
  Invoke-Expression $sch
  Write-Host ('已注册计划任务: ' + $TaskName + '（每日 ' + $Time + '），队列文件: ' + $QueueFile)
}