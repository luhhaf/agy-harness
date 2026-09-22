'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { hintsFor, queueHints, REMIND_EVERY_MS } = require('../post-tool-lint');
const { runHook, tmpWorkspace, payload } = require('./helpers');

test('no config -> no hints', () => {
  assert.deepEqual(hintsFor(tmpWorkspace()), []);
});
test('prettier + maven with spotless -> hints', () => {
  const ws = tmpWorkspace();
  fs.writeFileSync(path.join(ws, '.prettierrc'), '{}');
  fs.writeFileSync(path.join(ws, 'pom.xml'), '<project><plugin>spotless-maven-plugin</plugin></project>');
  const h = hintsFor(ws);
  assert.equal(h.length, 2);
  assert.match(h[1], /spotless/);
});
test('maven without spotless -> no maven hint', () => {
  const ws = tmpWorkspace();
  fs.writeFileSync(path.join(ws, 'pom.xml'), '<project/>');
  assert.deepEqual(hintsFor(ws), []);
});
test('queueHints writes lint.json and repeats a hint only after REMIND_EVERY_MS', () => {
  const ws = tmpWorkspace();
  const dir = path.join(ws, '.agents/state');
  const t0 = Date.parse('2026-09-22T10:00:00Z');
  assert.deepEqual(queueHints(dir, ['A', 'B'], t0), ['A', 'B']);
  assert.deepEqual(queueHints(dir, ['A', 'B'], t0 + 1000), []);
  assert.deepEqual(queueHints(dir, ['A', 'C'], t0 + REMIND_EVERY_MS + 1), ['A', 'C']);
  const data = JSON.parse(fs.readFileSync(path.join(dir, 'lint.json'), 'utf8'));
  assert.equal(data.notices.length, 4);
  assert.equal(data.notices[0].source, 'hx-formatter');
  assert.equal(data.notices[0].text, 'A');
  assert.ok(data.reminded.A && data.reminded.B && data.reminded.C);
  assert.deepEqual(queueHints(null, ['A']), []);
});
test('e2e: always {} on stdout; hint lands in lint.json, not only stderr', () => {
  const ws = tmpWorkspace();
  fs.writeFileSync(path.join(ws, '.editorconfig'), 'root=true');
  const r = runHook('post-tool-lint.js', payload({ stepIdx: 5, error: 'exit status 1' }, ws));
  assert.equal(r.status, 0);
  assert.deepEqual(r.json, {});
  const data = JSON.parse(fs.readFileSync(path.join(ws, '.agents/state/lint.json'), 'utf8'));
  assert.equal(data.notices.length, 1);
  assert.match(data.notices[0].text, /editorconfig/);
  assert.deepEqual(runHook('post-tool-lint.js', payload({ stepIdx: 6 }, ws)).json, {});
  assert.equal(JSON.parse(fs.readFileSync(path.join(ws, '.agents/state/lint.json'), 'utf8')).notices.length, 1, 'no duplicate within the remind window');
});
