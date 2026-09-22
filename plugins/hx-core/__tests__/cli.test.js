'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawnSync } = require('child_process');
const { tmpProject, exists } = require('./helpers');

const SETUP = path.join(__dirname, '..', 'skills', 'setup', 'scripts', 'setup.js');
const DOCTOR = path.join(__dirname, '..', 'skills', 'doctor', 'scripts', 'doctor.js');
const PROJECT = { 'package.json': { name: 'demo', scripts: { test: 'vitest run' } }, '.gitignore': '' };

function run(script, args, cwd, env = {}) {
  const r = spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...env } });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch (_) { /* not json */ }
  return { ...r, json };
}
const HOME = { HOME: tmpProject({}), USERPROFILE: tmpProject({}) };

test('setup.js runs in cwd by default, prints a readable summary and exits 0', () => {
  const root = tmpProject(PROJECT);
  const r = run(SETUP, [], root);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /created/i);
  assert.match(r.stdout, /AGENTS\.md/);
  assert.match(r.stdout, /hx:fill|fill/i);
  assert.ok(exists(root, '.agents/harness.json'));
});

test('setup.js --json --root <dir> prints the report as JSON only', () => {
  const root = tmpProject(PROJECT);
  const r = run(SETUP, ['--json', '--root', root], tmpProject({}));
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.json, 'stdout must be JSON');
  assert.ok(r.json.created.includes('AGENTS.md'));
  assert.equal(r.json.stack.kind, 'node');
});

test('setup.js --dry-run writes nothing and exit 0; unknown flag exits 2 with usage', () => {
  const root = tmpProject(PROJECT);
  assert.equal(run(SETUP, ['--dry-run'], root).status, 0);
  assert.equal(exists(root, 'AGENTS.md'), false);
  const bad = run(SETUP, ['--bogus'], root);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /usage/i);
  assert.equal(run(SETUP, ['--root', path.join(root, 'nope')], root).status, 2);
});

test('doctor.js exits 1 on a project without a harness and 0 after setup', () => {
  const root = tmpProject(PROJECT);
  const before = run(DOCTOR, [], root, HOME);
  assert.equal(before.status, 1);
  assert.match(before.stdout, /\[FAIL\] agents-dir/);
  run(SETUP, [], root);
  const after = run(DOCTOR, [], root, HOME);
  assert.equal(after.status, 0, after.stdout);
  assert.match(after.stdout, /\[warn\] placeholders/);
  assert.match(after.stdout, /Harness OK/);
});

test('doctor.js --json prints the report; --fix repairs the state checks', () => {
  const root = tmpProject(PROJECT);
  run(SETUP, [], root);
  require('fs').writeFileSync(path.join(root, '.gitignore'), '');
  const r = run(DOCTOR, ['--json', '--fix'], root, HOME);
  assert.equal(r.status, 0);
  assert.ok(r.json && Array.isArray(r.json.results));
  assert.ok(r.json.fixed.includes('state-ignored'));
});
