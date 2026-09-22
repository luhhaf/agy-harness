'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { buildMessage, prioritySection, MAX_CHARS } = require('../pre-invocation-context');
const { runHook, tmpWorkspace, payload } = require('./helpers');

const NOTEPAD = `# Notepad

## Priority
<!-- comment -->
Ship login feature by Friday.
Do not touch payments module.

## Decisions
- 2026-09-21 — use JWT

## Working notes
`;

test('prioritySection extracts only the Priority body without comments', () => {
  const p = prioritySection(NOTEPAD);
  assert.equal(p, 'Ship login feature by Friday.\nDo not touch payments module.');
  assert.equal(prioritySection('# nothing here'), '');
  assert.equal(prioritySection(null), '');
});
test('buildMessage: nothing -> empty', () => {
  assert.equal(buildMessage({ notepad: null, goal: null }), '');
  assert.equal(buildMessage({ notepad: '# Notepad\n## Priority\n', goal: { active: false } }), '');
  assert.equal(buildMessage({ notepad: null, goal: { active: false, done: true, goal: 'x' } }), '');
  assert.equal(buildMessage({ notepad: null, goal: null, notices: [] }), '');
});
test('buildMessage: done without evidence, failed verify, notices', () => {
  assert.match(buildMessage({ goal: { active: true, done: true, goal: 'x' } }), /WITHOUT verify evidence/);
  const m = buildMessage({ goal: { active: true, done: false, goal: 'x' }, verify: { passed: false, goal: 'x', ran: '2026-09-22T10:00:00Z', checks: [{ command: 'npm test', exit: 1 }] } });
  assert.match(m, /Last verify FAILED at 2026-09-22T10:00:00Z: `npm test` exit 1/);
  const n = buildMessage({ notices: [{ source: 'project-lint', file: 'src/a.ts', text: 'error  no-unused-vars\n  1:1' }, { source: 'hx-formatter', text: 'Prettier config found' }] });
  assert.match(n, /Lint\/format notices/);
  assert.match(n, /\[project-lint\] src\/a\.ts: error no-unused-vars 1:1/);
  assert.match(n, /\[hx-formatter\] Prettier/);
});
test('buildMessage: goal + notepad', () => {
  const m = buildMessage({ notepad: NOTEPAD, goal: { active: true, done: false, goal: 'Add login', checks: ['mvn verify', 'npm test'] } });
  assert.match(m, /Ship login feature/);
  assert.match(m, /Active goal .*Add login/);
  assert.match(m, /mvn verify; npm test/);
});
test('buildMessage truncates', () => {
  const m = buildMessage({ notepad: `## Priority\n${'x'.repeat(5000)}`, goal: null });
  assert.ok(m.length <= MAX_CHARS);
  assert.match(m, /truncated/);
});
test('e2e: injectSteps with ephemeralMessage', () => {
  const ws = tmpWorkspace();
  fs.writeFileSync(path.join(ws, '.agents/state/notepad.md'), NOTEPAD);
  fs.writeFileSync(path.join(ws, '.agents/state/goal.json'), JSON.stringify({ active: true, done: false, goal: 'Add login' }));
  const r = runHook('pre-invocation-context.js', payload({ invocationNum: 2, initialNumSteps: 4 }, ws));
  assert.equal(r.status, 0);
  assert.equal(r.json.injectSteps.length, 1);
  assert.match(r.json.injectSteps[0].ephemeralMessage, /Add login/);
});
test('e2e: lint notices are injected once and drained', () => {
  const ws = tmpWorkspace();
  const lint = path.join(ws, '.agents/state/lint.json');
  fs.writeFileSync(lint, JSON.stringify({ notices: [{ at: 'x', source: 'project-lint', file: 'a.js', text: 'boom' }], reminded: { h: 'x' } }));
  const r1 = runHook('pre-invocation-context.js', payload({}, ws));
  assert.match(r1.json.injectSteps[0].ephemeralMessage, /a\.js: boom/);
  const after = JSON.parse(fs.readFileSync(lint, 'utf8'));
  assert.deepEqual(after.notices, []);
  assert.deepEqual(after.reminded, { h: 'x' });
  assert.deepEqual(runHook('pre-invocation-context.js', payload({}, ws)).json, {});
});
test('e2e: empty workspace -> {}', () => {
  const r = runHook('pre-invocation-context.js', payload({}, tmpWorkspace()));
  assert.deepEqual(r.json, {});
});
