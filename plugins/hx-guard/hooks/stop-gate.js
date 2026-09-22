#!/usr/bin/env node
'use strict';
// Stop hook: while a goal is active, the agent may only stop when
// .agents/state/verify.json (written by the verify script) proves the checks
// passed for that goal. A hand-set "done": true without evidence does not
// count. Bounded by maxContinues so it can never loop forever.
// stdin:  { terminationReason, fullyIdle, error, ... }
// stdout: { decision: "continue", reason } or {}
const path = require('path');
const { run, stateDir, readJsonIfExists, writeJson, log } = require('./lib');

const DEFAULT_MAX = 5;
const VERIFY_HINT = 'Run the verify script (skill /hx-workflows:verify → node <hx-workflows>/skills/verify/scripts/verify.js --root <workspace>); it records evidence and closes the goal itself.';

/** True when verify.json is passing evidence for this goal. Exported for tests. */
function verified(goal, verify) {
  if (!verify || verify.passed !== true) return false;
  if (typeof goal.goal === 'string' && typeof verify.goal === 'string' && verify.goal !== goal.goal) return false;
  return true;
}

/**
 * Pure decision. Returns { output, goal } where goal is the updated goal to
 * persist (or null when nothing to persist). Exported for tests.
 */
function decide(goal, input, verify = null) {
  if (!goal || !goal.active) return { output: {}, goal: null };
  if (goal.done && verified(goal, verify)) return { output: {}, goal: null };
  if (input && /error/i.test(String(input.terminationReason || ''))) {
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
  const n = `(${used + 1}/${max})`;
  const failedRun = verify && verify.passed === false && (!verify.goal || !goal.goal || verify.goal === goal.goal);
  const failing = failedRun ? (verify.checks || []).find((c) => !c.skipped && c.exit !== 0) : null;
  const failNote = failedRun ? ` Last verify FAILED${failing ? `: \`${failing.command}\` (exit ${failing.exit})` : ''}.` : '';
  let reason;
  if (goal.done) {
    reason = `[hx-guard] goal.json says done but there is no passing verify evidence for "${goal.goal || ''}" ${n}.${failNote} ${VERIFY_HINT}`;
  } else if (failedRun) {
    reason = `[hx-guard] Goal is still active and the last verify FAILED ${n}: ${goal.goal || ''}.${failNote} Fix it and run the verify script again.`;
  } else {
    reason = `[hx-guard] Goal is still active and not verified ${n}: ${goal.goal || ''}. Continue working. ` +
      `If everything is really done, ${VERIFY_HINT}`;
  }
  reason += ' If you are blocked, explain the blocker to the user and set "active": false in .agents/state/goal.json.';
  return { output: { decision: 'continue', reason }, goal: next };
}

if (require.main === module) {
  run((input) => {
    const dir = stateDir(input);
    if (!dir) { log('workspace unknown; skipping stop gate'); return {}; }
    const file = path.join(dir, 'goal.json');
    const { output, goal } = decide(readJsonIfExists(file), input, readJsonIfExists(path.join(dir, 'verify.json')));
    if (goal) writeJson(file, goal);
    return output;
  }, {});
}

module.exports = { decide, verified };
