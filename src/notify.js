#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { log, logError } = require('./logger');
const { readState, writeState, clearState } = require('./state');
const { deleteTask, taskExists, TASK_NAME } = require('./scheduler');
const { stampLimitHit } = require('./hook-detector');

const PROJECT_ROOT = path.join(__dirname, '..');
const CONFIG_FILE = path.join(PROJECT_ROOT, 'config.json');

// Load configuration
let config = { tier: 'pro', claudeUrl: 'https://claude.ai' };
try {
  if (fs.existsSync(CONFIG_FILE)) {
    config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  }
} catch (err) {
  logError(`Failed to load config.json: ${err.message}`);
}

/**
 * Fire a Windows toast notification using node-notifier
 */
function fireToastNodeNotifier(title, message) {
  try {
    const notifier = require('node-notifier');

    notifier.notify({
      title: title,
      message: message,
      appID: '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe',
      sound: false,
      wait: false,
      open: config.claudeUrl
    }, (err, response) => {
      if (err) {
        logError(`node-notifier failed: ${err.message}`);
        fireToastPowerShell(title, message);
      } else {
        log(`Toast fired (node-notifier): "${title}" - "${message}"`);
      }
    });
  } catch (err) {
    logError(`node-notifier not available: ${err.message}`);
    fireToastPowerShell(title, message);
  }
}

/**
 * Fire a Windows toast notification using PowerShell WinRT (fallback)
 */
function fireToastPowerShell(title, message) {
  const psScript = `
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.UI.Notifications.ToastNotification, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null

$toast_xml = @"
<toast>
    <visual>
        <binding template="ToastText02">
            <text id="1">${title}</text>
            <text id="2">${message}</text>
        </binding>
    </visual>
</toast>
"@

$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml($toast_xml)

$toast = New-Object Windows.UI.Notifications.ToastNotification $xml
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("Claude Status").Show($toast)
`;

  const ps = spawn('powershell.exe', ['-NoProfile', '-Command', psScript], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  ps.on('error', (err) => {
    logError(`PowerShell toast failed: ${err.message}`);
  });

  ps.on('exit', (code) => {
    if (code === 0) {
      log(`Toast fired (PowerShell): "${title}" - "${message}"`);
    } else {
      logError(`PowerShell exited with code ${code}`);
    }
  });
}

/**
 * Format countdown time
 * @param {Date} resetTime
 * @returns {string}
 */
function formatCountdown(resetTime) {
  const now = new Date();
  const diff = resetTime.getTime() - now.getTime();

  if (diff <= 0) {
    return 'Reset time has passed — notification may have been missed';
  }

  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / (24 * 60 * 60));
  const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}

/**
 * Handle --notify mode: fire toast and clean up
 */
function handleNotify() {
  const state = readState();

  if (!state) {
    log('No active limit state; --notify called without active limit');
    return;
  }

  const resetTime = new Date(state.resetTime);
  const limitType = state.limitType;
  const tierInfo = config.tier === 'pro' ? '~45 messages' : 'messages';

  let title, message;

  if (limitType === 'weekly') {
    title = 'Claude Subscription Renewed';
    message = 'Your weekly usage cap has reset — full usage available again!';
  } else {
    title = 'Claude Rate-Limit Window Reset';
    message = `Your 5-hour rate-limit window has reset (${tierInfo}/5h).`;
  }

  fireToastNodeNotifier(title, message);

  // Clean up
  if (taskExists(TASK_NAME)) {
    deleteTask(TASK_NAME);
  }
  clearState();

  log(`Notification fired for ${limitType} reset`);
}

/**
 * Handle --status mode: show current state
 */
function handleStatus() {
  const state = readState();

  if (!state) {
    console.log('No active limit detected.');
    return;
  }

  const hitTime = new Date(state.hitTime);
  const resetTime = new Date(state.resetTime);
  const limitType = state.limitType;
  const countdown = formatCountdown(resetTime);

  console.log('');
  console.log(`Claude Usage Limit Status`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Limit Type:  ${limitType === '5h' ? '5-Hour Rolling Window' : 'Weekly Cap'}`);
  console.log(`Hit Time:    ${hitTime.toLocaleString()}`);
  console.log(`Reset Time:  ${resetTime.toLocaleString()}`);
  console.log(`Countdown:   ${countdown}`);
  console.log(`Task Name:   ${state.taskName}`);

  if (taskExists(TASK_NAME)) {
    console.log(`Scheduled:   ✓ (Task Scheduler active)`);
  } else {
    console.log(`Scheduled:   ✗ (Task not found in scheduler)`);
  }

  console.log('');
}

/**
 * Handle --hit-now mode: manually stamp a limit hit
 * @param {string} limitType - "5h" or "weekly"
 */
function handleHitNow(limitType) {
  if (limitType !== '5h' && limitType !== 'weekly') {
    console.error(`Invalid limit type: ${limitType}`);
    console.error('Use: node notify.js --hit-now [5h|weekly]');
    process.exit(1);
  }

  console.log(`Stamping ${limitType} limit hit...`);
  stampLimitHit(limitType);

  // Show status
  setTimeout(() => {
    handleStatus();
  }, 100);
}

/**
 * Handle --clear mode: remove state and task
 */
function handleClear() {
  console.log('Clearing Claude Status state...');

  if (taskExists(TASK_NAME)) {
    deleteTask(TASK_NAME);
  }

  clearState();
  console.log('✓ State cleared');
}

/**
 * Print usage help
 */
function printUsage() {
  console.log(`
Claude Status — Usage Renewal Notifier

Usage:
  node notify.js --notify              Fire reset notification (called by Task Scheduler)
  node notify.js --status              Show current limit status and countdown
  node notify.js --hit-now <type>      Manually stamp a limit hit (type: 5h|weekly)
  node notify.js --clear               Clear state and remove scheduled task
  node notify.js --help                Show this help message

Examples:
  node notify.js --status
  node notify.js --hit-now 5h
  node notify.js --hit-now weekly

npm scripts:
  npm run status                        Show current status
  npm run hit-5h                        Manual: stamp 5-hour limit
  npm run hit-weekly                    Manual: stamp weekly limit
  npm run clear                         Clear state and task
  npm run setup                         Initial setup (inject hooks, create tasks)
  npm run uninstall                     Uninstall (remove hooks, tasks, clear state)
`);
}

/**
 * Main entry point
 */
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  if (args.includes('--notify')) {
    handleNotify();
  } else if (args.includes('--status')) {
    handleStatus();
  } else if (args.includes('--hit-now')) {
    const index = args.indexOf('--hit-now');
    const limitType = args[index + 1];
    handleHitNow(limitType);
  } else if (args.includes('--clear')) {
    handleClear();
  } else {
    console.error(`Unknown option: ${args[0]}`);
    console.error('Use: node notify.js --help');
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { fireToastNodeNotifier, formatCountdown };
