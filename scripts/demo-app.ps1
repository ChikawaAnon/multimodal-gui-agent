﻿# 多模态 Agent 桌面控制测试窗（WPF）
Add-Type -AssemblyName PresentationFramework
$xaml = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="多模态Agent测试窗" Height="500" Width="720"
        WindowStartupLocation="CenterScreen">
  <Grid Margin="16">
    <Grid.RowDefinitions><RowDefinition Height="Auto"/><RowDefinition Height="*"/></Grid.RowDefinitions>
    <TextBlock Grid.Row="0" Text="多模态 Agent 桌面控制测试窗：请在下方输入框输入文字" FontSize="15" Margin="0,0,0,12"/>
    <TextBox Grid.Row="1" x:Name="Editor" AcceptsReturn="True" VerticalScrollBarVisibility="Auto" FontSize="14" TextWrapping="Wrap"/>
  </Grid>
</Window>
'@
$win = [System.Windows.Markup.XamlReader]::Parse($xaml)
$win.ShowDialog() | Out-Null