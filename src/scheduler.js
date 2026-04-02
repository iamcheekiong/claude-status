const { execSync, spawnSync } = require('child_process');
const { log, logError } = require('./logger');

const TASK_NAME = 'ClaudeStatusReset';
const NODE_SCRIPT = 'src\\notify.js';

/**
 * Convert Date to schtasks /ST format (HH:MM)
 * @param {Date} date
 * @returns {string} "HH:MM"
 */
function formatTime(date) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Convert Date to schtasks /SD format (MM/DD/YYYY)
 * @param {Date} date
 * @returns {string} "MM/DD/YYYY"
 */
function formatDate(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
}

/**
 * Check if a task exists in Task Scheduler
 * @param {string} taskName
 * @returns {boolean}
 */
function taskExists(taskName) {
  try {
    const result = spawnSync('schtasks', ['/query', '/tn', taskName], {
      stdio: 'pipe',
      encoding: 'utf-8'
    });
    return result.status === 0;
  } catch (err) {
    return false;
  }
}

/**
 * Delete a scheduled task
 * @param {string} taskName
 */
function deleteTask(taskName) {
  try {
    if (taskExists(taskName)) {
      spawnSync('schtasks', ['/delete', '/tn', taskName, '/f'], {
        stdio: 'pipe'
      });
      log(`Task deleted: ${taskName}`);
    }
  } catch (err) {
    logError(`Failed to delete task ${taskName}: ${err.message}`);
  }
}

/**
 * Schedule a one-shot notification at resetTime
 * @param {Date} resetTime - When to fire the notification (ISO/UTC, will be converted to local)
 * @returns {string} Task name
 */
function scheduleReset(resetTime) {
  try {
    // Delete existing task if present
    if (taskExists(TASK_NAME)) {
      deleteTask(TASK_NAME);
    }

    // Format time/date for schtasks (which uses local time)
    const st = formatTime(resetTime);
    const sd = formatDate(resetTime);

    log(`Scheduling reset task: ${TASK_NAME} at ${sd} ${st}`);

    // Get absolute path to notify.js
    const path = require('path');
    const notifyScript = path.join(__dirname, '..', NODE_SCRIPT);

    // Create the task: one-shot at resetTime
    const result = spawnSync('schtasks', [
      '/create',
      '/tn', TASK_NAME,
      '/tr', `node "${notifyScript}" --notify`,
      '/sc', 'once',
      '/st', st,
      '/sd', sd,
      '/f'
    ], {
      stdio: 'pipe',
      encoding: 'utf-8'
    });

    if (result.status !== 0) {
      throw new Error(result.stderr || 'schtasks /create failed');
    }

    log(`Task scheduled successfully: ${TASK_NAME}`);
    return TASK_NAME;
  } catch (err) {
    logError(`Failed to schedule reset task: ${err.message}`);
    throw err;
  }
}

module.exports = { scheduleReset, deleteTask, taskExists, TASK_NAME };
