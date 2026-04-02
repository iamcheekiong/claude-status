# Claude Status — Usage Limit Notifier

Get Windows toast notifications when your Claude usage limits reset — the 5-hour rolling window and the weekly cap. Automatically detects when you hit a limit and notifies you when it resets.

## New Computer Setup

1. Install **[Node.js LTS](https://nodejs.org)** (if not already installed)
2. Copy the project folder to `C:\projects\claudeStatus`
3. Open a terminal in the project folder and run:
   ```bash
   npm run setup
   ```
4. Start the tray icon now:
   ```bash
   npm run tray
   ```

That's it. The tray icon will **auto-start on every future login** (30 seconds after login). Limits are detected automatically — no further configuration needed.

> **Want to change your plan tier?** Edit `config.json` and set `"tier"` to `"pro"`, `"max5x"`, or `"max20x"`. Default is `"pro"` (45 messages per 5h window).

## How It Works

- **Automatic detection**: Claude Code hooks monitor for "usage limit reached" errors
- **Precise timing**: Calculates exact reset time (5 hours from limit hit, or 7 days for weekly cap)
- **One-shot notification**: Creates a single Task Scheduler task that fires at reset time, then cleans up
- **Manual fallback**: Can manually stamp a limit with `npm run hit-5h` or `npm run hit-weekly`
- **No background process**: Uses Windows Task Scheduler; exits immediately after notification

## Installation

### 1. Install Dependencies
```bash
cd C:\projects\claudeStatus
npm install
```

### 2. Run Setup
```bash
npm run setup
```

This:
- Injects hooks into `~/.claude/settings.json` to detect limit errors
- Removes any old scheduled tasks from the previous version
- Installs npm dependencies

**Note**: `setup.ps1` does NOT require admin privileges.

### 3. Done

When you hit a limit, Claude Code automatically detects it. A Windows Task Scheduler task is created to fire a notification at reset time.

## Usage

### Check Current Status
```bash
npm run status
```

Shows:
- Whether a limit is currently active
- Which type (5-hour or weekly)
- When it was hit
- Countdown to reset

### Manually Stamp a Limit

If the hook doesn't catch it (rare):
```bash
npm run hit-5h        # Stamp a 5-hour rate-limit hit
npm run hit-weekly    # Stamp a weekly cap hit
```

### View Logs
```bash
cat logs/notify.log
```

All notifications and state changes are logged with timestamps.

### Clear State
```bash
npm run clear
```

Removes the scheduled task and clears the active limit state.

## Configuration

Edit `config.json`:

```json
{
  "tier": "pro",
  "claudeUrl": "https://claude.ai"
}
```

| Field | Values | Purpose |
|---|---|---|
| `tier` | `"pro"` \| `"max5x"` \| `"max20x"` | Display only; shown in toast messages |
| `claudeUrl` | URL string | Opened when you click the notification |

## Uninstall

```bash
npm run uninstall
```

This:
- Removes hooks from `~/.claude/settings.json`
- Deletes any pending reset tasks
- Clears application state

Or manually delete the `C:\projects\claudeStatus` folder.

## How the Limits Work

### 5-Hour Rolling Window
- Resets exactly **5 hours from the first message** in that window (not clock-aligned)
- Message caps: ~45 (Pro), ~225 (Max 5x), ~900 (Max 20x)
- **Most common limit** (~98% of users stay well within the weekly cap)

### Weekly Hard Cap
- Resets exactly **7 calendar days from when the cap was hit** (not a fixed day-of-week)
- Hour caps: 40-80 (Pro), 140-280 (Max 5x), 240-480 (Max 20x)
- Shared across claude.ai, IDE integrations, and Claude Code

**Source**: https://usagebar.com/blog/claude-code-weekly-limit-vs-5-hour-lockout

## Troubleshooting

### No notification when I hit a limit

1. Check if the hook was properly installed:
   ```powershell
   type $env:USERPROFILE\.claude\settings.json | findstr "hook-detector"
   ```
   Should show the hook-detector command.

2. Test manual stamping:
   ```bash
   npm run hit-5h
   npm run status
   ```

3. Check logs:
   ```bash
   cat logs/notify.log
   ```

4. Re-run setup:
   ```bash
   npm run setup
   ```

### "node.exe not found" error

Install [Node.js LTS](https://nodejs.org) and ensure it's in your PATH.

### Notification doesn't appear in Action Center

1. Ensure you're logged into Windows (notifications only appear in active sessions)
2. Check Windows Settings → System → Notifications are enabled
3. Ensure "Claude Status" app notifications are enabled in Windows

### Too many old tasks in Task Scheduler

The `setup.ps1` script cleans up old `ClaudeStatusHourly` and `ClaudeStatusWeekly` tasks from version 1. If there are other stale tasks, delete them manually:

```powershell
schtasks /query /tn "ClaudeStatus*"
schtasks /delete /tn "ClaudeStatusXXX" /f
```

## CLI Reference

```bash
npm run setup                 # Initial setup (inject hooks)
npm run uninstall            # Remove hooks, clear state
npm run status               # Show current limit status and countdown
npm run hit-5h               # Manually stamp 5-hour limit
npm run hit-weekly           # Manually stamp weekly limit
npm run clear                # Remove pending task and clear state
```

Or use `node src/notify.js` directly:
```bash
node src/notify.js --help
node src/notify.js --status
node src/notify.js --hit-now 5h
node src/notify.js --hit-now weekly
node src/notify.js --notify      # Called by Task Scheduler; fires toast
node src/notify.js --clear       # Clear state
```

## Architecture

```
Claude Code (running)
    ↓ PostToolUse / Stop hook fires
src/hook-detector.js  ← detects "usage limit reached" error
    ↓ on match
state.json            ← { limitType, hitTime, resetTime }
    ↓
src/scheduler.js      ← creates one-shot schtasks entry
    ↓ at resetTime
Windows Task Scheduler fires
    ↓
src/notify.js --notify ← fires toast notification
    ↓
state.json cleared, task deleted
```

## Files

| File | Purpose |
|---|---|
| `src/hook-detector.js` | Claude Code hook entry point; detects usage limit errors |
| `src/scheduler.js` | Manages one-shot Task Scheduler tasks via `schtasks` |
| `src/notify.js` | CLI entry point; fires toasts, shows status, manual stamping |
| `src/state.js` | Read/write `state.json` (runtime limit state) |
| `src/logger.js` | Shared logging to `logs/notify.log` |
| `config.json` | User config (tier, Claude URL) |
| `state.json` | Runtime state (auto-managed, don't edit) |
| `setup.ps1` | Initial setup (inject hooks into settings.json) |
| `uninstall.ps1` | Cleanup (remove hooks, clear state) |
| `logs/notify.log` | Append-only log file |

## License

MIT
