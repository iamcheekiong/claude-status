#!/usr/bin/env node

const { log, logError } = require('./logger');
const { writeState } = require('./state');
const { scheduleReset } = require('./scheduler');
const { incrementCounter, resetCounter } = require('./counter');

/**
 * Classify limit type from error message
 * @param {string} errorText
 * @returns {"5h"|"weekly"|null}
 */
function classifyLimit(errorText) {
  if (!errorText) return null;

  const lowerText = errorText.toLowerCase();

  // Check for weekly limit
  if (
    lowerText.includes('usage limit') &&
    (lowerText.includes('weekly') || lowerText.includes('week'))
  ) {
    return 'weekly';
  }

  // Check for 5h rate limit
  if (lowerText.includes('usage limit')) {
    return '5h';
  }

  return null;
}

/**
 * Stamp a limit hit and schedule the reset notification
 * @param {string} limitType - "5h" or "weekly"
 */
function stampLimitHit(limitType) {
  try {
    const hitTime = new Date();

    // Calculate reset time
    let resetTime;
    if (limitType === 'weekly') {
      // 7 days from now
      resetTime = new Date(hitTime.getTime() + 7 * 24 * 60 * 60 * 1000);
    } else {
      // 5 hours from now
      resetTime = new Date(hitTime.getTime() + 5 * 60 * 60 * 1000);
    }

    // Schedule the notification task
    scheduleReset(resetTime);

    // Write state
    const state = {
      limitType,
      hitTime: hitTime.toISOString(),
      resetTime: resetTime.toISOString(),
      taskName: 'ClaudeStatusReset'
    };
    writeState(state);

    log(
      `Limit detected: ${limitType} (reset at ${resetTime.toISOString()})`
    );
  } catch (err) {
    logError(`Failed to stamp limit hit: ${err.message}`);
  }
}

/**
 * Main entry point: read hook JSON from stdin
 */
async function main() {
  try {
    let inputData = '';

    // Read from stdin
    process.stdin.setEncoding('utf-8');

    for await (const chunk of process.stdin) {
      inputData += chunk;
    }

    // Parse the hook input JSON
    let hookInput;
    try {
      hookInput = JSON.parse(inputData);
    } catch (parseErr) {
      // Not valid JSON; silently exit
      console.log(JSON.stringify({}));
      process.exit(0);
    }

    // Extract error text from various possible locations
    let errorText = '';

    if (hookInput.tool_response) {
      errorText += String(hookInput.tool_response);
    }

    if (hookInput.stop_reason) {
      errorText += ' ' + String(hookInput.stop_reason);
    }

    if (hookInput.error) {
      errorText += ' ' + String(hookInput.error);
    }

    if (hookInput.message) {
      errorText += ' ' + String(hookInput.message);
    }

    // Detect limit
    const limitType = classifyLimit(errorText);

    if (limitType) {
      stampLimitHit(limitType);
      // Reset window counter when limit is hit (new window starts from reset time)
      if (limitType === '5h') resetCounter();
    } else if (hookInput.stop_reason !== undefined) {
      // Stop hook fired without a limit error = Claude completed a turn = 1 message
      incrementCounter();
    }

    // Always return empty JSON and exit 0 (non-blocking)
    console.log(JSON.stringify({}));
    process.exit(0);
  } catch (err) {
    // Silently fail; exit 0 to not block Claude Code
    console.log(JSON.stringify({}));
    process.exit(0);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(() => {
    console.log(JSON.stringify({}));
    process.exit(0);
  });
}

module.exports = { stampLimitHit, classifyLimit };
