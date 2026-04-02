# Claude Status Setup Script
# Injects Claude Code hooks to detect usage limits
# No admin required (uses schtasks without elevation)

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "Claude Status Setup" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Check config.json exists
$configPath = Join-Path $projectRoot "config.json"
if (-not (Test-Path $configPath)) {
  Write-Host "ERROR: config.json not found" -ForegroundColor Red
  exit 1
}

# Find node.exe
$nodePath = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $nodePath) {
  Write-Host "ERROR: node.exe not found in PATH" -ForegroundColor Red
  Write-Host "Please install Node.js from https://nodejs.org/" -ForegroundColor Yellow
  exit 1
}

Write-Host "Found Node.js at: $nodePath" -ForegroundColor Green

# Install npm dependencies
Write-Host ""
Write-Host "Installing npm dependencies..." -ForegroundColor Cyan
& npm install
if ($LASTEXITCODE -ne 0) {
  Write-Host "ERROR: npm install failed" -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "Dependencies installed" -ForegroundColor Green

# Get settings.json path
$settingsPath = "$env:USERPROFILE/.claude/settings.json"
$settingsDir = Split-Path -Parent $settingsPath

# Create .claude directory if needed
if (-not (Test-Path $settingsDir)) {
  New-Item -ItemType Directory -Path $settingsDir -Force | Out-Null
  Write-Host "Created .claude directory" -ForegroundColor Green
}

# Load or create settings.json
Write-Host ""
Write-Host "Configuring Claude Code hooks..." -ForegroundColor Cyan

$settings = @{ hooks = @{} }

if (Test-Path $settingsPath) {
  try {
    $settings = Get-Content $settingsPath -Raw | ConvertFrom-Json -ErrorAction Stop
    if (-not $settings.hooks) {
      $settings | Add-Member -NotePropertyName "hooks" -NotePropertyValue @{} -Force
    }
  } catch {
    Write-Host "WARNING: Could not parse settings.json, using defaults" -ForegroundColor Yellow
  }
}

# Hook configuration
$hookDetectorPath = Join-Path $projectRoot "src\hook-detector.js"
$hookCommand = "node `"$hookDetectorPath`""
$hookEntry = @{
  matcher = ""
  hooks = @(@{ type = "command"; command = $hookCommand; timeout = 5 })
}

# Helper: add hook only if not already present (prevents duplicates on re-run)
function Add-HookIfMissing($existing, $entry) {
  if ($existing) {
    $arr = @($existing)
    $alreadyExists = $arr | Where-Object { $_.hooks -and $_.hooks[0].command -eq $entry.hooks[0].command }
    if ($alreadyExists) { return $arr }
    return $arr + $entry
  }
  return @($entry)
}

$settings.hooks | Add-Member -NotePropertyName "PostToolUse" `
  -NotePropertyValue (Add-HookIfMissing $settings.hooks.PostToolUse $hookEntry) -Force
$settings.hooks | Add-Member -NotePropertyName "Stop" `
  -NotePropertyValue (Add-HookIfMissing $settings.hooks.Stop $hookEntry) -Force

# Write settings.json
try {
  $settings | ConvertTo-Json -Depth 10 | Set-Content $settingsPath -Encoding UTF8
  Write-Host "Hooks injected into settings.json" -ForegroundColor Green
} catch {
  Write-Host "ERROR: Failed to write settings.json: $_" -ForegroundColor Red
  exit 1
}

# Verify hooks were written correctly
$verify = Get-Content $settingsPath -Raw
if ($verify -like "*hook-detector*") {
  Write-Host "Hooks verified in settings.json" -ForegroundColor Green
} else {
  Write-Host "WARNING: Hook verification failed - please re-run setup" -ForegroundColor Red
}

# Register tray auto-start on login
Write-Host ""
Write-Host "Registering tray auto-start on login..." -ForegroundColor Cyan

$trayScript = Join-Path $projectRoot "src\tray.js"

try {
  # Use HKCU Run registry key (no admin required, current user only)
  $regKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
  $regValue = "`"$nodePath`" `"$trayScript`""
  Set-ItemProperty -Path $regKey -Name "ClaudeStatus" -Value $regValue -ErrorAction Stop
  Write-Host "Tray auto-start registered (starts on next login)" -ForegroundColor Green
} catch {
  Write-Host "WARNING: Could not register tray auto-start: $_" -ForegroundColor Yellow
  Write-Host "Run manually: npm run tray" -ForegroundColor Yellow
}

# Remove old tasks
Write-Host ""
Write-Host "Cleaning up old scheduled tasks..." -ForegroundColor Cyan

@("ClaudeStatusHourly", "ClaudeStatusWeekly") | ForEach-Object {
  schtasks /query /tn $_ 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) {
    schtasks /delete /tn $_ /f 2>$null | Out-Null
    Write-Host "Removed old task: $_" -ForegroundColor Green
  }
}

Write-Host ""
Write-Host "Setup Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "1. Run 'npm run tray' to start the tray icon now" -ForegroundColor White
Write-Host "2. Tray will auto-start on every future login" -ForegroundColor White
Write-Host "3. Limits are detected automatically - check status with: npm run status" -ForegroundColor White
Write-Host ""
Write-Host "To uninstall: npm run uninstall" -ForegroundColor Yellow
Write-Host ""
