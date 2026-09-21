'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { decide } = require('../stop-gate');
const { runHook, tmpWorkspace, payload } = require('./helpers');

const stop = (extra) => ({ terminationReason: 'model_stop', fullyIdle: true, executionNum: 1, ...extra });

test('no goal / inactive / done -> {}', () => {
  assert.deepEqual(decide(null, stop()).output, {});
  assert.deepEqual(decide({ active: false, goal: 'x' }, stop()).output, {});
  assert.deepEqual(decide({ active: true, done: true, goal: 'x' }, stop()).output, {});
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
