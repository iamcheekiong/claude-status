const fs = require('fs');
const path = require('path');
const { log, logError } = require('./logger');

const PROJECT_ROOT = path.join(__dirname, '..');
const STATE_FILE = path.join(PROJECT_ROOT, 'state.json');

/**
 * Schema:
 * {
 *   limitType: "5h" | "weekly",
 *   hitTime: ISO string,
 *   resetTime: ISO string,
 *   taskName: "ClaudeStatusReset"
 * }
 */

/**
 * Read state from state.json
 * @returns {Object|null} State object or null if not exists/empty
 */
function readState() {
  try {
    if (!fs.existsSync(STATE_FILE)) {
      return null;
    }

    const content = fs.readFileSync(STATE_FILE, 'utf-8').trim();
    if (!content) {
      return null;
    }

    return JSON.parse(content);
  } catch (err) {
    logError(`Failed to read state.json: ${err.message}`);
    return null;
  }
}

/**
 * Write state to state.json
 * @param {Object} obj - State object
 */
function writeState(obj) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(obj, null, 2), 'utf-8');
    log(`State written: limitType=${obj.limitType}, resetTime=${obj.resetTime}`);
  } catch (err) {
    logError(`Failed to write state.json: ${err.message}`);
  }
}

/**
 * Clear state by deleting state.json
 */
function clearState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      fs.unlinkSync(STATE_FILE);
      log('State cleared');
    }
  } catch (err) {
    logError(`Failed to clear state.json: ${err.message}`);
  }
}

module.exports = { readState, writeState, clearState };
