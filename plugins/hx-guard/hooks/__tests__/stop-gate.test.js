'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { decide, verified } = require('../stop-gate');
const { runHook, tmpWorkspace, payload } = require('./helpers');

const stop = (extra) => ({ terminationReason: 'model_stop', fullyIdle: true, executionNum: 1, ...extra });

test('no goal / inactive -> {}', () => {
  assert.deepEqual(decide(null, stop()).output, {});
  assert.deepEqual(decide({ active: false, goal: 'x' }, stop()).output, {});
  assert.deepEqual(decide({ active: false, done: true, goal: 'x' }, stop()).output, {});
});
test('done + passing verify evidence for the same goal -> {}', () => {
  const v = { passed: true, goal: 'x', checks: [{ command: 'npm test', exit: 0 }] };
  assert.deepEqual(decide({ active: true, done: true, goal: 'x' }, stop(), v).output, {});
  assert.equal(verified({ goal: 'x' }, v), true);
  assert.equal(verified({ goal: 'x' }, { passed: true, goal: 'other' }), false);
  assert.equal(verified({ goal: 'x' }, { passed: false, goal: 'x' }), false);
  assert.equal(verified({ goal: 'x' }, null), false);
});
test('done by hand without evidence -> continue with an evidence reason', () => {
  const r = decide({ active: true, done: true, goal: 'x' }, stop(), null);
  assert.equal(r.output.decision, 'continue');
  assert.match(r.output.reason, /no passing verify evidence/);
  assert.equal(r.goal.continues, 1);
  const r2 = decide({ active: true, done: true, goal: 'x' }, stop(), { passed: true, goal: 'another goal' });
  assert.equal(r2.output.decision, 'continue');
});
test('last verify failed -> reason names the failing check', () => {
  const v = { passed: false, goal: 'x', checks: [{ command: 'npm run lint', exit: 0 }, { command: 'npm test', exit: 1 }] };
  const r = decide({ active: true, done: false, goal: 'x' }, stop(), v);
  assert.equal(r.output.decision, 'continue');
  assert.match(r.output.reason, /verify FAILED/);
  assert.match(r.output.reason, /npm test.*exit 1/);
});
test('active goal -> continue and count', () => {
  const r = decide({ active: true, done: false, goal: 'Add login' }, stop());
  assert.equal(r.output.decision, 'continue');
  assert.match(r.output.reason, /1\/5/);
  assert.equal(r.goal.continues, 1);
});
test('respects maxContinues and deactivates', () => {
  const r = decide({ active: true, goal: 'x', continues: 2, maxContinues: 2 }, stop());
  assert.deepEqual(r.output, {});
  assert.equal(r.goal.active, false);
  assert.equal(r.goal.stoppedReason, 'max_continues');
});
test('error termination or busy background -> do not force', () => {
  assert.deepEqual(decide({ active: true, goal: 'x' }, stop({ terminationReason: 'error' })).output, {});
  assert.deepEqual(decide({ active: true, goal: 'x' }, stop({ fullyIdle: false })).output, {});
});
test('e2e: persists continues to goal.json and stops after max', () => {
  const ws = tmpWorkspace();
  const file = path.join(ws, '.agents/state/goal.json');
  fs.writeFileSync(file, JSON.stringify({ active: true, done: false, goal: 'Add login', maxContinues: 2 }));
  const r1 = runHook('stop-gate.js', payload(stop(), ws));
  assert.equal(r1.json.decision, 'continue');
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).continues, 1);
  const r2 = runHook('stop-gate.js', payload(stop(), ws));
  assert.equal(r2.json.decision, 'continue');
  const r3 = runHook('stop-gate.js', payload(stop(), ws));
  assert.deepEqual(r3.json, {});
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).active, false);
});
test('e2e: verify.json evidence lets a done goal stop; stale evidence does not', () => {
  const ws = tmpWorkspace();
  fs.writeFileSync(path.join(ws, '.agents/state/goal.json'), JSON.stringify({ active: true, done: true, goal: 'Add login' }));
  fs.writeFileSync(path.join(ws, '.agents/state/verify.json'), JSON.stringify({ passed: true, goal: 'Add login', checks: [] }));
  assert.deepEqual(runHook('stop-gate.js', payload(stop(), ws)).json, {});
  fs.writeFileSync(path.join(ws, '.agents/state/verify.json'), JSON.stringify({ passed: false, goal: 'Add login', checks: [{ command: 'npm test', exit: 1 }] }));
  const r = runHook('stop-gate.js', payload(stop(), ws));
  assert.equal(r.json.decision, 'continue');
  assert.match(r.json.reason, /npm test/);
});
test('e2e: corrupt goal.json -> {} and exit 0', () => {
  const ws = tmpWorkspace();
  fs.writeFileSync(path.join(ws, '.agents/state/goal.json'), '{bad');
  const r = runHook('stop-gate.js', payload(stop(), ws));
  assert.equal(r.status, 0);
  assert.deepEqual(r.json, {});
});
test('terminationReason is matched case-insensitively', () => {
  assert.deepEqual(decide({ active: true, goal: 'x' }, stop({ terminationReason: 'ERROR' })).output, {});
  assert.equal(decide({ active: true, goal: 'x' }, stop({ terminationReason: 'NO_TOOL_CALL' })).output.decision, 'continue');
});
test('e2e: print mode (empty workspacePaths) resolves workspace via last_conversations.json', () => {
  const ws = tmpWorkspace();
  const appData = path.join(ws, 'appdata');
  fs.mkdirSync(path.join(appData, 'cache'), { recursive: true });
  fs.writeFileSync(path.join(appData, 'cache', 'last_conversations.json'), JSON.stringify({ [ws]: 'conv-42', '/nope': 'x' }));
  fs.writeFileSync(path.join(ws, '.agents/state/goal.json'), JSON.stringify({ active: true, goal: 'g' }));
  const r = runHook('stop-gate.js', {
    conversationId: 'conv-42', workspacePaths: [], terminationReason: 'NO_TOOL_CALL', fullyIdle: true,
    transcriptPath: path.join(appData, 'brain', 'conv-42', 'transcript.jsonl'),
  });
  assert.equal(r.json.decision, 'continue');
  assert.equal(JSON.parse(fs.readFileSync(path.join(ws, '.agents/state/goal.json'), 'utf8')).continues, 1);
});
test('e2e: unknown workspace -> {} and no crash', () => {
  const r = runHook('stop-gate.js', { conversationId: 'nope-1', workspacePaths: [], terminationReason: 'NO_TOOL_CALL', fullyIdle: true, transcriptPath: '/nonexistent/brain/x/t.jsonl' });
  assert.equal(r.status, 0);
  assert.deepEqual(r.json, {});
});
