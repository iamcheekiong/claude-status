const fs = require('fs');
const path = require('path');
const { logError } = require('./logger');

const PROJECT_ROOT = path.join(__dirname, '..');
const COUNTER_FILE = path.join(PROJECT_ROOT, 'message-count.json');
const WINDOW_MS = 5 * 60 * 60 * 1000; // 5 hours

// Approximate message limits per tier per 5h window
const TIER_LIMITS = {
  pro: 45,
  max5x: 225,
  max20x: 900,
};

/**
 * Schema:
 * {
 *   windowStart: ISO string,
 *   messageCount: number
 * }
 */

function readCounter() {
  try {
    if (!fs.existsSync(COUNTER_FILE)) return null;
    return JSON.parse(fs.readFileSync(COUNTER_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

function writeCounter(obj) {
  try {
    fs.writeFileSync(COUNTER_FILE, JSON.stringify(obj, null, 2), 'utf-8');
  } catch (err) {
    logError(`Failed to write message-count.json: ${err.message}`);
  }
}

/**
 * Increment the message counter.
 * Resets the window if more than 5 hours have passed since windowStart.
 */
function incrementCounter() {
  const now = new Date();
  let counter = readCounter();

  if (!counter) {
    // First message ever
    counter = { windowStart: now.toISOString(), messageCount: 1 };
  } else {
    const windowStart = new Date(counter.windowStart);
    const elapsed = now.getTime() - windowStart.getTime();

    if (elapsed >= WINDOW_MS) {
      // Window expired — start a new one
      counter = { windowStart: now.toISOString(), messageCount: 1 };
    } else {
      counter.messageCount += 1;
    }
  }

  writeCounter(counter);
  return counter;
}

/**
 * Reset the window manually (e.g. when a 5h limit is stamped).
 */
function resetCounter(windowStart) {
  writeCounter({
    windowStart: (windowStart || new Date()).toISOString(),
    messageCount: 0,
  });
}

/**
 * Get current usage info for display.
 * @param {string} tier - "pro" | "max5x" | "max20x"
 * @returns {{ count, limit, percent, windowStart, windowAgeMs, windowRemainingMs }}
 */
function getUsage(tier) {
  const counter = readCounter();
  const limit = TIER_LIMITS[tier] || TIER_LIMITS.pro;
  const now = new Date();

  if (!counter) {
    return { count: 0, limit, percent: 0, windowStart: null, windowAgeMs: 0, windowRemainingMs: WINDOW_MS };
  }

  const windowStart = new Date(counter.windowStart);
  const windowAgeMs = now.getTime() - windowStart.getTime();
  const windowRemainingMs = Math.max(0, WINDOW_MS - windowAgeMs);

  // If window is expired, treat as fresh
  if (windowAgeMs >= WINDOW_MS) {
    return { count: 0, limit, percent: 0, windowStart: null, windowAgeMs: 0, windowRemainingMs: WINDOW_MS };
  }

  const count = counter.messageCount;
  const percent = Math.min(100, Math.round((count / limit) * 100));

  return { count, limit, percent, windowStart, windowAgeMs, windowRemainingMs };
}

module.exports = { incrementCounter, resetCounter, getUsage, TIER_LIMITS };
