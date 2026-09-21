#!/usr/bin/env node
'use strict';
// PreInvocation hook: inject the notepad "Priority" section and the active goal
// as an ephemeral message so the model sees them every turn.
const path = require('path');
const { run, stateDir, readJsonIfExists, readTextIfExists } = require('./lib');

const MAX_CHARS = 1500;

/** Extract the "## Priority" section body from notepad markdown. */
function prioritySection(md) {
  if (!md) return '';
  const m = md.match(/^##\s+Priority\s*\n([\s\S]*?)(?=^##\s|\s*$(?![\s\S]))/m);
  if (!m) return '';
  return m[1].replace(/<!--[\s\S]*?-->/g, '').trim();
}

/** Build the message. Exported for tests. Returns '' when nothing to inject. */
function buildMessage({ notepad, goal }) {
  const parts = [];
  const prio = prioritySection(notepad);
  if (prio) parts.push(`Notepad priority:\n${prio}`);
  if (goal && goal.active && !goal.done) {
    const checks = Array.isArray(goal.checks) && goal.checks.length ? `\nChecks to pass: ${goal.checks.join('; ')}` : '';
    parts.push(`Active goal (not verified yet): ${goal.goal || '(no description)'}${checks}\nRun /hx-workflows:verify before saying it is done.`);
  }
  if (!parts.length) return '';
  let msg = `[hx-harness]\n${parts.join('\n\n')}`;
  if (msg.length > MAX_CHARS) msg = msg.slice(0, MAX_CHARS - 20) + '\n…(truncated)';
  return msg;
}

if (require.main === module) {
  run((input) => {
    const dir = stateDir(input);
    if (!dir) return {};
    const msg = buildMessage({
      notepad: readTextIfExists(path.join(dir, 'notepad.md')),
      goal: readJsonIfExists(path.join(dir, 'goal.json')),
    });
    return msg ? { injectSteps: [{ ephemeralMessage: msg }] } : {};
  }, {});
}

module.exports = { buildMessage, prioritySection };
