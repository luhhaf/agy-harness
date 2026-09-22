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

const ADOPT = path.join(__dirname, '..', 'skills', 'adopt', 'scripts', 'adopt.js');
const CLAUDE_PROJECT = { 'CLAUDE.md': '# Rules\nUse `Bash`.\n', '.gitignore': '' };

test('adopt.js is dry-run by default, --apply writes, exit 3 with no Claude files', () => {
  const root = tmpProject(CLAUDE_PROJECT);
  const dry = run(ADOPT, [], root, HOME);
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /\[created\] CLAUDE\.md → AGENTS\.md/);
  assert.match(dry.stdout, /Dry run/);
  assert.equal(exists(root, 'AGENTS.md'), false);
  const ap = run(ADOPT, ['--apply', '--json', '--root', root], tmpProject({}), HOME);
  assert.equal(ap.status, 0, ap.stderr);
  assert.ok(ap.json && ap.json.apply === true);
  assert.ok(exists(root, 'AGENTS.md'));
  assert.ok(exists(root, '.agents/adopt.json'));
  const none = run(ADOPT, [], tmpProject(PROJECT), HOME);
  assert.equal(none.status, 3);
  assert.match(none.stderr, /no Claude Code files/i);
});

test('adopt.js --only accepts known kinds; unknown kind or flag exits 2', () => {
  const root = tmpProject(CLAUDE_PROJECT);
  assert.equal(run(ADOPT, ['--only', 'claude-md,mcp'], root, HOME).status, 0);
  const bad = run(ADOPT, ['--only', 'nope'], root, HOME);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /usage/i);
  assert.equal(run(ADOPT, ['--bogus'], root, HOME).status, 2);
});

test('adopt.js --apply with no Claude files exits 3 without creating .agents dir', () => {
  const empty = tmpProject({});
  const r = run(ADOPT, ['--apply', '--root', empty], tmpProject({}), HOME);
  assert.equal(r.status, 3);
  assert.match(r.stderr, /no Claude Code files/i);
  assert.equal(exists(empty, '.agents'), false, '.agents directory should not be created');
  assert.equal(exists(empty, '.agents/state'), false, '.agents/state directory should not be created');
});

test('adopt.js --only deduplicates kinds; empty --only exits 2', () => {
  const root = tmpProject(CLAUDE_PROJECT);
  // assert.match on the text report would pass whether the row appeared once or
  // twice (both contain the substring); read the JSON form and count rows instead so
  // a regression that re-processes the "claude-md,claude-md" duplicate is caught.
  const dup = run(ADOPT, ['--only', 'claude-md,claude-md,mcp', '--json'], root, HOME);
  assert.equal(dup.status, 0, dup.stderr);
  assert.ok(dup.json, 'stdout must be JSON');
  assert.equal(dup.json.items.filter((i) => i.target === 'AGENTS.md').length, 1);
  const empty = run(ADOPT, ['--only', ''], root, HOME);
  assert.equal(empty.status, 2);
  assert.match(empty.stderr, /usage/i);
  const comma = run(ADOPT, ['--only', ',,,'], root, HOME);
  assert.equal(comma.status, 2);
  assert.match(comma.stderr, /usage/i);
});
