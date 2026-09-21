#!/usr/bin/env node
'use strict';
// Stop hook: if there is an active, unverified goal, ask the agent to continue
// (bounded by maxContinues so it can never loop forever).
// stdin:  { terminationReason, fullyIdle, error, ... }
// stdout: { decision: "continue", reason } or {}
const path = require('path');
const { run, stateDir, readJsonIfExists, writeJson, log } = require('./lib');

const DEFAULT_MAX = 5;

/**
 * Pure decision. Returns { output, goal } where goal is the updated goal to
 * persist (or null when nothing to persist). Exported for tests.
 */
function decide(goal, input) {
  if (!goal || !goal.active || goal.done) return { output: {}, goal: null };
  if (input && /error/i.test(String(input.terminationReason || '')) ) {
    log('agent stopped with an error; not forcing continue');
    return { output: {}, goal: null };
  }
  if (input && input.fullyIdle === false) {
    return { output: {}, goal: null }; // background tasks still running; agy handles it
  }
  const max = Number.isFinite(goal.maxContinues) ? goal.maxContinues : DEFAULT_MAX;
  const used = Number.isFinite(goal.continues) ? goal.continues : 0;
  if (used >= max) {
    log(`goal "${goal.goal}" hit maxContinues=${max}; letting the agent stop`);
    return { output: {}, goal: { ...goal, active: false, stoppedReason: 'max_continues' } };
  }
  const next = { ...goal, continues: used + 1 };
  const reason =
    `[hx-guard] Goal is still active and not verified (${used + 1}/${max}): ${goal.goal || ''}. ` +
    `Continue working. If everything is really done, run /hx-workflows:verify so goal.json is marked done. ` +
    `If you are blocked, explain the blocker and set "active": false in .agents/state/goal.json.`;
  return { output: { decision: 'continue', reason }, goal: next };
}

if (require.main === module) {
  run((input) => {
    const dir = stateDir(input);
    if (!dir) { log('workspace unknown; skipping stop gate'); return {}; }
    const file = path.join(dir, 'goal.json');
    const { output, goal } = decide(readJsonIfExists(file), input);
    if (goal) writeJson(file, goal);
    return output;
  }, {});
}

module.exports = { decide };
