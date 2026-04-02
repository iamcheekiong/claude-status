# Claude Status Uninstall Script
# Removes hooks and clears state

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "Claude Status Uninstall" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

# Remove scheduled tasks
Write-Host "Cleaning up scheduled tasks..." -ForegroundColor Cyan
schtasks /query /tn "ClaudeStatusReset" 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) {
  schtasks /delete /tn "ClaudeStatusReset" /f 2>$null | Out-Null
  Write-Host "Removed ClaudeStatusReset task" -ForegroundColor Green
}

# Remove startup registry entry
$regKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
if (Get-ItemProperty -Path $regKey -Name "ClaudeStatus" -ErrorAction SilentlyContinue) {
  Remove-ItemProperty -Path $regKey -Name "ClaudeStatus" -ErrorAction SilentlyContinue
  Write-Host "Removed tray auto-start from startup" -ForegroundColor Green
}

# Remove hooks from settings.json
Write-Host "Removing Claude Code hooks..." -ForegroundColor Cyan
$settingsPath = "$env:USERPROFILE/.claude/settings.json"

if (Test-Path $settingsPath) {
  try {
    $settings = Get-Content $settingsPath -Raw | ConvertFrom-Json

    # Filter out our hooks from PostToolUse
    if ($settings.hooks.PostToolUse) {
      $settings.hooks.PostToolUse = @($settings.hooks.PostToolUse | Where-Object {
        -not ($_.command -like "*hook-detector*")
      })
    }

    # Filter out our hooks from Stop
    if ($settings.hooks.Stop) {
      $settings.hooks.Stop = @($settings.hooks.Stop | Where-Object {
        -not ($_.command -like "*hook-detector*")
      })
    }

    # Write back
    $settings | ConvertTo-Json -Depth 10 | Set-Content $settingsPath -Encoding UTF8
    Write-Host "✓ Hooks removed from settings.json" -ForegroundColor Green
  } catch {
    Write-Host "WARNING: Could not update settings.json: $_" -ForegroundColor Yellow
  }
} else {
  Write-Host "✓ settings.json not found (hooks not present)" -ForegroundColor Green
}

# Clear state
Write-Host "Clearing application state..." -ForegroundColor Cyan
& node "$projectRoot\src\notify.js" --clear 2>$null

Write-Host ""
Write-Host "Uninstall Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "To remove the project, delete: $projectRoot" -ForegroundColor Yellow
Write-Host ""
