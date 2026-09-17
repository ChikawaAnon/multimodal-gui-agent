param(
  [Parameter(Mandatory=$true)][string]$Action,
  [string]$OutFile = '',
  [int]$X = 0,
  [int]$Y = 0,
  [string]$Text = '',
  [string]$Keys = '',
  [string]$Title = '',
  [string]$Content = ''
)
$ErrorActionPreference = 'Stop'
$OutputEncoding = [System.Text.Encoding]::UTF8

if ($OutFile) { $dir = Split-Path $OutFile -Parent; if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null } }

Add-Type -AssemblyName System.Windows.Forms, System.Drawing

function Add-User32 {
  if (-not ('Win32.Mouse' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class M {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
}
'@
  }
}

function Get-WindowByTitle([string]$t) {
  Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
  for ($try = 0; $try -lt 4; $try++) {
    $root = [System.Windows.Automation.AutomationElement]::RootElement
    $allWins = $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
    foreach ($w in $allWins) { if ($w.Current.Name -like ('*' + $t + '*')) { return $w } }
    Start-Sleep -Milliseconds 300
  }
  return $null
}

function Get-ProcByTitle([string]$t) {
  return Get-Process | Where-Object { $_.MainWindowTitle -like ('*' + $t + '*') } | Select-Object -First 1
}

function Out-JsonFile($obj) {
  if ($OutFile) { $obj | ConvertTo-Json -Depth 4 | Set-Content -Path $OutFile -Encoding UTF8; Write-Output ('written ' + ($obj | Measure-Object).Count) } else { $obj | ConvertTo-Json -Compress }
}

switch ($Action) {
  'Screenshot' {
    $b = [System.Windows.Forms.SystemInformation]::VirtualScreen
    $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($b.X, $b.Y, 0, 0, $bmp.Size)
    $bmp.Save($OutFile, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
    Write-Output $OutFile
  }
  'Click' {
    Add-User32
    [M]::SetCursorPos($X, $Y) | Out-Null
    Start-Sleep -Milliseconds 80
    [M]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero) | Out-Null
    [M]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero) | Out-Null
    Write-Output ('clicked ' + $X + ',' + $Y)
  }
  'Key' {
    [System.Windows.Forms.SendKeys]::SendWait($Keys)
    Start-Sleep -Milliseconds 150
    Write-Output ('key ' + $Keys)
  }
  'Activate' {
    if ($Title) {
      Add-Type -AssemblyName Microsoft.VisualBasic
      [Microsoft.VisualBasic.Interaction]::AppActivate($Title) | Out-Null
      Start-Sleep -Milliseconds 300
      Write-Output ('activated ' + $Title)
    } else { Write-Output 'no title' }
  }
  'Maximize' {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class W2 {
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
'@
    $proc = Get-ProcByTitle $Title
    if ($proc -and $proc.MainWindowHandle -ne 0) {
      [W2]::ShowWindow($proc.MainWindowHandle, 3) | Out-Null
      [W2]::SetForegroundWindow($proc.MainWindowHandle) | Out-Null
      Write-Output ('maximized')
    } else { Write-Output 'no-window' }
  }
  'WindowShot' {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class PW3 {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hwnd, IntPtr hdc, uint flags);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
}
'@
    $win = Get-WindowByTitle $Title
    if (-not $win) { Write-Output 'no-window'; return }
    $h = [IntPtr]$win.Current.NativeWindowHandle
    $rect = New-Object PW3+RECT
    [PW3]::GetWindowRect($h, [ref]$rect) | Out-Null
    $w = $rect.Right - $rect.Left; $ht = $rect.Bottom - $rect.Top
    if ($w -le 0 -or $ht -le 0) { Write-Output 'bad-rect'; return }
    $bmp = New-Object System.Drawing.Bitmap $w, $ht
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $hdc = $g.GetHdc()
    [PW3]::PrintWindow($h, $hdc, 2) | Out-Null
    $g.ReleaseHdc($hdc)
    $g.Dispose()
    $bmp.Save($OutFile, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Output (($rect.Left) + ' ' + ($rect.Top) + ' ' + $w + ' ' + $ht)
  }
  'TypeSafe' {
    Add-Type -AssemblyName Microsoft.VisualBasic, System.Windows.Forms, UIAutomationClient, UIAutomationTypes
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class FG3 {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
}
'@
    $proc = Get-ProcByTitle $Title
    $win = Get-WindowByTitle $Title
    if (-not $proc -or -not $win) { Write-Output 'no-window'; return }
    [Microsoft.VisualBasic.Interaction]::AppActivate($proc.Id) | Out-Null
    Start-Sleep -Milliseconds 500
    $fg = [FG3]::GetForegroundWindow()
    if ($fg -ne $proc.MainWindowHandle) { Write-Output 'not-foreground'; return }
    $editCond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit)
    $edit = $win.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $editCond)
    $editRect = $null
    if ($edit) { $editRect = $edit.Current.BoundingRectangle }
    if ($editRect -and $editRect.Width -gt 0 -and $editRect.Height -gt 0) {
      [FG3]::SetCursorPos([int]($editRect.X + $editRect.Width / 2), [int]($editRect.Y + $editRect.Height / 2)) | Out-Null
      Start-Sleep -Milliseconds 80
      [FG3]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero) | Out-Null
      [FG3]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero) | Out-Null
      Start-Sleep -Milliseconds 150
    }
    [System.Windows.Forms.SendKeys]::SendWait('^a')
    Start-Sleep -Milliseconds 120
    [System.Windows.Forms.SendKeys]::SendWait('{DELETE}')
    Start-Sleep -Milliseconds 150
    Set-Clipboard -Value $Content
    Start-Sleep -Milliseconds 120
    [System.Windows.Forms.SendKeys]::SendWait('^v')
    Start-Sleep -Milliseconds 200
    Write-Output ('typed ' + $Content.Length + ' chars')
  }
  'Windows' {
    Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
    $root = [System.Windows.Automation.AutomationElement]::RootElement
    $cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::IsOffscreenProperty, $false)
    $wins = $root.FindAll([System.Windows.Automation.TreeScope]::Children, $cond)
    for ($try = 0; $try -lt 3 -and $wins.Count -eq 0; $try++) { Start-Sleep -Milliseconds 300; $wins = $root.FindAll([System.Windows.Automation.TreeScope]::Children, $cond) }
    $arr = @()
    foreach ($w in $wins) {
      $name = $w.Current.Name
      if (-not $name) { continue }
      $r = $w.Current.BoundingRectangle
      if ($r.Width -le 0 -or $r.Height -le 0) { continue }
      $arr += [PSCustomObject]@{ name = $name; x = [int]$r.X; y = [int]$r.Y; w = [int]$r.Width; h = [int]$r.Height }
    }
    Out-JsonFile $arr
  }
  'UiText' {
    Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
    $win = $null
    if ($Title) { $win = Get-WindowByTitle $Title } else { $win = [System.Windows.Automation.AutomationElement]::FocusedElement }
    $texts = New-Object System.Collections.Generic.List[string]
    if ($win) {
      $all = $win.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
      foreach ($el in $all) {
        try { $v = $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern); if ($v) { $val = $v.Current.Value; if ($val) { $texts.Add($val) } } } catch {}
        try { $tp = $el.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern); if ($tp) { $txt = $tp.DocumentRange.GetText(5000); if ($txt) { $texts.Add($txt) } } } catch {}
        $n = $el.Current.Name
        if ($n -and $n.Length -gt 1 -and $texts -notcontains $n) { $texts.Add($n) }
      }
    }
    $obj = @{ text = (($texts | Select-Object -Unique) -join ' | '); count = $texts.Count }
    if ($OutFile) { $obj | ConvertTo-Json -Depth 4 | Set-Content -Path $OutFile -Encoding UTF8; Write-Output ('written ' + $texts.Count) } else { $obj | ConvertTo-Json -Compress }
  }
  'SetText' {
    Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
    $win = Get-WindowByTitle $Title
    if (-not $win) { Write-Output 'no-window'; return }
    $editCond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit)
    $edit = $win.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $editCond)
    if (-not $edit) { Write-Output 'no-edit'; return }
    $vp = $edit.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
    if ($vp) { $vp.SetValue($Text); Write-Output ('set ' + $Text.Length + ' chars') } else { Write-Output 'no-valuepattern' }
  }
  default { Write-Output ('unknown action: ' + $Action) }
}