#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const SysTray = require('systray2').default;
const { readState, clearState } = require('./state');
const { stampLimitHit } = require('./hook-detector');
const { formatCountdown } = require('./notify');
const { getUsage } = require('./counter');
const { ICON_IDLE, ICON_ACTIVE } = require('./icons');

const PROJECT_ROOT = path.join(__dirname, '..');
const CONFIG_FILE = path.join(PROJECT_ROOT, 'config.json');
const POLL_INTERVAL = 30000;

// Load config
let config = { claudeUrl: 'https://claude.ai' };
try {
  if (fs.existsSync(CONFIG_FILE)) {
    config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  }
} catch {}

// Track current icon state to avoid redundant sends
let currentIconState = 'idle';

// ─── Menu item objects (mutated in-place on refresh) ─────────────────────────

function buildMenuItems() {
  return {
    itemHeader:       { title: 'Claude Status', tooltip: '', enabled: false, checked: false },
    sep1:             SysTray.separator,
    itemStatus:       { title: 'Loading...', tooltip: '', enabled: false, checked: false },
    sep2:             SysTray.separator,
    itemOpen:         { title: 'Open Claude.ai', tooltip: '', enabled: true, checked: false },
    sep3:             SysTray.separator,
    itemStamp5h:      { title: 'Stamp 5h limit', tooltip: '', enabled: true, checked: false },
    itemStampWeekly:  { title: 'Stamp Weekly limit', tooltip: '', enabled: true, checked: false },
    itemClear:        { title: 'Clear state', tooltip: '', enabled: true, checked: false },
    sep4:             SysTray.separator,
    itemQuit:         { title: 'Quit', tooltip: '', enabled: true, checked: false },
  };
}

// ─── Refresh tray state ───────────────────────────────────────────────────────

function refreshTray(items, systray) {
  const state = readState();

  let tooltip, statusTitle, iconState;

  const usage = getUsage(config.tier || 'pro');
  const usageLine = `Session: ${usage.count}/${usage.limit} (${usage.percent}%)`;

  if (!state) {
    tooltip = `Claude Status — No limit active | ${usageLine}`;
    statusTitle = `No limit | ${usageLine}`;
    iconState = 'idle';
  } else {
    const countdown = formatCountdown(new Date(state.resetTime));
    const label = state.limitType === 'weekly' ? 'Weekly' : '5h';
    tooltip = `Claude Status — ${label}: ${countdown} remaining | ${usageLine}`;
    statusTitle = `${label}: ${countdown} | ${usageLine}`;
    iconState = 'active';
  }

  // Update status menu item title
  items.itemStatus.title = statusTitle;

  try {
    systray.sendAction({ type: 'update-item', item: items.itemStatus });
  } catch {}

  // Update tooltip via menu update
  try {
    systray.sendAction({ type: 'update-menu', menu: buildMenu(items, tooltip, currentIconState === 'active' ? ICON_ACTIVE : ICON_IDLE) });
  } catch {}

  // Switch icon if state changed
  if (iconState !== currentIconState) {
    currentIconState = iconState;
    try {
      systray.sendAction({
        type: 'update-icon',
        icon: iconState === 'active' ? ICON_ACTIVE : ICON_IDLE
      });
    } catch {}
  }
}

// ─── Build menu array ─────────────────────────────────────────────────────────

function buildMenu(items, tooltip, icon) {
  return {
    icon: icon || ICON_IDLE,
    title: 'Claude Status',
    tooltip: tooltip || 'Claude Status',
    items: [
      items.itemHeader,
      items.sep1,
      items.itemStatus,
      items.sep2,
      items.itemOpen,
      items.sep3,
      items.itemStamp5h,
      items.itemStampWeekly,
      items.itemClear,
      items.sep4,
      items.itemQuit,
    ]
  };
}

// ─── File watcher ─────────────────────────────────────────────────────────────

function startWatchers(items, systray) {
  // Immediate refresh on startup
  refreshTray(items, systray);

  // Watch project directory for state.json changes
  try {
    fs.watch(PROJECT_ROOT, (_eventType, filename) => {
      if (filename === 'state.json') {
        // Small delay to let file write complete
        setTimeout(() => refreshTray(items, systray), 200);
      }
    });
  } catch (err) {
    console.error('fs.watch failed:', err.message);
  }

  // 30-second polling fallback
  setInterval(() => refreshTray(items, systray), POLL_INTERVAL);
}

// ─── Click handler ────────────────────────────────────────────────────────────

function handleClick(action, items, systray) {
  const item = action.item;

  if (item === items.itemOpen) {
    spawn('cmd', ['/c', 'start', '', config.claudeUrl], { detached: true, stdio: 'ignore' }).unref();

  } else if (item === items.itemStamp5h) {
    stampLimitHit('5h');
    setTimeout(() => refreshTray(items, systray), 300);

  } else if (item === items.itemStampWeekly) {
    stampLimitHit('weekly');
    setTimeout(() => refreshTray(items, systray), 300);

  } else if (item === items.itemClear) {
    clearState();
    setTimeout(() => refreshTray(items, systray), 300);

  } else if (item === items.itemQuit) {
    systray.kill(false);
    process.exit(0);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const items = buildMenuItems();

  const systray = new SysTray({
    menu: buildMenu(items, 'Claude Status — Starting...', ICON_IDLE),
    debug: false,
    copyDir: true,
  });

  systray.onClick(action => handleClick(action, items, systray));

  systray.ready().then(() => {
    console.log('Claude Status tray icon started');
    startWatchers(items, systray);
  }).catch(err => {
    console.error('Tray failed to start:', err.message);
    process.exit(1);
  });

  // Handle clean exit
  process.on('SIGINT', () => {
    systray.kill(false);
    process.exit(0);
  });
}

main();
