const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const LOG_FILE = path.join(PROJECT_ROOT, 'logs', 'notify.log');
const LOGS_DIR = path.dirname(LOG_FILE);

// Ensure logs directory exists
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

/**
 * Append a message to the log file with ISO timestamp
 */
function log(message) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}\n`;

  try {
    fs.appendFileSync(LOG_FILE, logEntry, 'utf-8');
    console.log(logEntry.trim());
  } catch (err) {
    console.error(`Failed to write to log: ${err.message}`);
    console.log(logEntry.trim());
  }
}

/**
 * Append an error message to the log file with ISO timestamp
 */
function logError(message) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ERROR: ${message}\n`;

  try {
    fs.appendFileSync(LOG_FILE, logEntry, 'utf-8');
    console.error(logEntry.trim());
  } catch (err) {
    console.error(`Failed to write to log: ${err.message}`);
    console.error(logEntry.trim());
  }
}

module.exports = { log, logError };
