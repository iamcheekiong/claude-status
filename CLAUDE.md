# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview
**claude-status** is a Windows 11 Node.js app that detects Claude Code usage limits (5-hour rolling window and weekly cap) and fires Windows toast notifications when limits reset. It uses Claude Code hooks for automatic detection and Windows Task Scheduler for timed notifications. An optional system tray icon shows live session usage %.

## Commands

```bash
npm run setup        # Inject hooks into ~/.claude/settings.json (run once)
npm run tray         # Start the persistent system tray icon
npm run status       # Show current limit state and countdown in terminal
npm run hit-5h       # Manually stamp a 5-hour limit hit (for testing)
npm run hit-weekly   # Manually stamp a weekly limit hit (for testing)
npm run clear        # Clear state.json and delete the scheduled task
npm run uninstall    # Remove hooks from settings.json, clear all state
```

Manual testing of hook detection:
```bash
echo '{"stop_reason": "end_turn"}' | node src/hook-detector.js       # increments counter
echo '{"tool_response": "usage limit reached"}' | node src/hook-detector.js  # stamps 5h limit
echo '{"tool_response": "weekly usage limit reached"}' | node src/hook-detector.js  # stamps weekly
```

## Architecture

### Event-Driven Flow
```
Claude Code session
  → PostToolUse / Stop hook fires src/hook-detector.js
      → Stop without error  → increments message-count.json
      → "usage limit reached" → writes state.json + creates schtasks entry
                                         ↓
                              Windows Task Scheduler fires at reset time
                                         ↓
                              node src/notify.js --notify  → toast fires
                                         ↓
                              state.json deleted, task removed
```

### Key Files
- **`src/hook-detector.js`** — Claude Code hook entry point. Reads JSON from stdin. Classifies errors as `5h` or `weekly`. On match: calls `stampLimitHit()` which writes `state.json` and schedules a one-shot task. On clean Stop: increments the session counter.
- **`src/scheduler.js`** — Wraps `schtasks /create|delete|query` (no admin required). Creates `ClaudeStatusReset` as a one-shot task. Date format must be `MM/DD/YYYY` for `/SD` argument.
- **`src/notify.js`** — CLI entry point with four modes: `--notify` (fire toast + cleanup), `--status` (terminal output), `--hit-now <type>` (manual stamp), `--clear`. Exports `formatCountdown()` used by the tray.
- **`src/tray.js`** — Persistent systray2 process. Watches project directory for `state.json` changes via `fs.watch`. Polls every 30s. Exports `ICON_IDLE` / `ICON_ACTIVE` base64 ICO via `src/icons.js`.
- **`src/counter.js`** — Tracks `message-count.json`: `{ windowStart, messageCount }`. Auto-resets after 5h. `getUsage(tier)` returns `{ count, limit, percent }`.
- **`src/state.js`** — Read/write/clear `state.json`: `{ limitType, hitTime, resetTime, taskName }`.
- **`setup.ps1`** — Injects `PostToolUse` and `Stop` hooks into `~/.claude/settings.json`. Does NOT require admin. Removes old clock-based tasks (`ClaudeStatusHourly`, `ClaudeStatusWeekly`).

### Runtime Files (auto-managed, don't edit)
- `state.json` — active limit state; deleted after notification fires
- `message-count.json` — session message counter
- `logs/notify.log` — append-only log

### Configuration (`config.json`)
```json
{ "tier": "pro", "claudeUrl": "https://claude.ai" }
```
`tier` values: `"pro"` (45 msg/5h), `"max5x"` (225), `"max20x"` (900)

### Toast Notification
`node-notifier` is primary; PowerShell WinRT is fallback. AppID must be a registered Windows executable — currently uses PowerShell's AppUserModelID `{1AC14E77-...}\powershell.exe`. Using an unregistered appID silently drops the toast.

### Hook Registration
Hooks are stored in `~/.claude/settings.json` under `hooks.PostToolUse` and `hooks.Stop` as:
```json
{ "type": "command", "command": "node \"C:\\projects\\claudeStatus\\src\\hook-detector.js\"", "timeout": 5 }
```
The hook must always exit 0 to avoid blocking Claude Code.

---

# Workflow Orchestration

## 1. Plan Node Default
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately – don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

## 2. Subagent Strategy
- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

## 3. Self-Improvement Loop
- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

## 4. Verification Before Done
- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

## 5. Demand Elegance (Balanced)
- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes – don't over-engineer
- Challenge your own work before presenting it

## 6. Autonomous Bug Fizzing
- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests – then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management
1. **↻Plan First↻**: Write plan to `tasks/todo.md` with checkable items
2. **↻Verify Plan↻**: Check in before starting implementation
3. **↻Track Progress↻**: Mark items complete as you go
4. **↻Explain Changes↻**: High-level summary at each step
5. **↻Document Results↻**: Add review section to `tasks/todo.md`
6. **↻Capture Lessons↻**: Update `tasks/lessons.md` after corrections

## Core Principles
- **↻Simplicity First↻**: Make every change as simple as possible. Impact minimal code.
- **↻No Laziness↻**: Find root causes. No temporary fixes. Senior developer standards.
- **↻Minimal Impact↻**: Changes should only touch what's necessary. Avoid introducing bugs.
