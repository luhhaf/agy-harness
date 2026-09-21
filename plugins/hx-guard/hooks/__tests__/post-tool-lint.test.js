'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { hintsFor } = require('../post-tool-lint');
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
test('e2e: always {} on stdout, hints on stderr', () => {
  const ws = tmpWorkspace();
  fs.writeFileSync(path.join(ws, '.editorconfig'), 'root=true');
  const r = runHook('post-tool-lint.js', payload({ stepIdx: 5, error: 'exit status 1' }, ws));
  assert.equal(r.status, 0);
  assert.deepEqual(r.json, {});
  assert.match(r.stderr, /editorconfig/);
  assert.match(r.stderr, /exit status 1/);
});
