#!/usr/bin/env node
'use strict';
// PreInvocation hook: inject, as an ephemeral message the model sees this turn,
//   1. the notepad "Priority" section,
//   2. the active goal and the result of the last verify run,
//   3. pending lint notices queued by PostToolUse hooks (drained once shown).
const path = require('path');
const { run, stateDir, readJsonIfExists, readTextIfExists, drainNotices } = require('./lib');

const MAX_CHARS = 3000;
const NOTICE_CHARS = 400;

/** Extract the "## Priority" section body from notepad markdown. */
function prioritySection(md) {
  if (!md) return '';
  const m = md.match(/^##\s+Priority\s*\n([\s\S]*?)(?=^##\s|\s*$(?![\s\S]))/m);
  if (!m) return '';
  return m[1].replace(/<!--[\s\S]*?-->/g, '').trim();
}

function goalPart(goal, verify) {
  if (!goal || !goal.active) return '';
  const checks = Array.isArray(goal.checks) && goal.checks.length ? `\nChecks to pass: ${goal.checks.join('; ')}` : '';
  let s;
  if (goal.done) s = `Active goal marked done WITHOUT verify evidence: ${goal.goal || '(no description)'}${checks}\nRun the verify script (/hx-workflows:verify) so it is closed with evidence.`;
  else s = `Active goal (not verified yet): ${goal.goal || '(no description)'}${checks}\nRun /hx-workflows:verify (its script) before saying it is done.`;
  if (verify && verify.passed === false && (!verify.goal || verify.goal === goal.goal)) {
    const failing = (verify.checks || []).find((c) => !c.skipped && c.exit !== 0);
    s += `\nLast verify FAILED at ${verify.ran || '?'}${failing ? `: \`${failing.command}\` exit ${failing.exit}` : ''}.`;
  }
  return s;
}

function noticesPart(notices) {
  if (!notices || !notices.length) return '';
  const lines = notices.map((n) => {
    const where = n.file ? `${n.file}: ` : '';
    const text = String(n.text || '').replace(/\s+/g, ' ').trim().slice(0, NOTICE_CHARS);
    return `- [${n.source || 'hook'}] ${where}${text}`;
  });
  return `Lint/format notices from hooks (fix or acknowledge):\n${lines.join('\n')}`;
}

/** Build the message. Exported for tests. Returns '' when nothing to inject. */
function buildMessage({ notepad, goal, verify, notices }) {
  const parts = [];
  const prio = prioritySection(notepad);
  if (prio) parts.push(`Notepad priority:\n${prio}`);
  const g = goalPart(goal, verify);
  if (g) parts.push(g);
  const n = noticesPart(notices);
  if (n) parts.push(n);
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
      verify: readJsonIfExists(path.join(dir, 'verify.json')),
      notices: drainNotices(dir),
    });
    return msg ? { injectSteps: [{ ephemeralMessage: msg }] } : {};
  }, {});
}

module.exports = { buildMessage, prioritySection, MAX_CHARS };
