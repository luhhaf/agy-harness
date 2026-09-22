'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { tmpProject, read, exists } = require('./helpers');
const { runSetup, GENERATED } = require('../lib/setup');

const TS_PROJECT = {
  'package.json': { name: 'demo', scripts: { test: 'vitest run', lint: 'eslint .', typecheck: 'tsc --noEmit' } },
  'pnpm-lock.yaml': '',
  'tsconfig.json': {},
  'eslint.config.js': 'export default []',
  '.gitignore': 'node_modules\n',
};

test('scaffolds the full harness for a pnpm+ts project', () => {
  const root = tmpProject(TS_PROJECT);
  const r = runSetup(root, {});
  for (const f of ['AGENTS.md', '.agents/harness.json', '.agents/rules/tests.md', '.agents/rules/typescript.md',
    '.agents/skills/project-checks/SKILL.md', '.agents/hooks.json', '.agents/hooks/post-edit-lint.js']) {
    assert.ok(exists(root, f), `${f} should exist`);
    assert.ok(r.created.includes(f), `${f} should be reported as created`);
  }
  assert.ok(fs.statSync(path.join(root, '.agents', 'state')).isDirectory());
  assert.equal(r.skipped.length, 0);
  assert.equal(r.stack.kind, 'node');
  assert.deepEqual(r.checks, ['pnpm run typecheck', 'pnpm run lint', 'pnpm test']);
  assert.match(read(root, '.gitignore'), /\.agents\/state\//);
  const manifest = JSON.parse(read(root, '.agents/harness.json'));
  assert.equal(manifest.harness, 'hx');
  assert.equal(manifest.stack.packageManager, 'pnpm');
  assert.deepEqual(manifest.checks, r.checks);
  assert.deepEqual(manifest.generated, r.created.filter((f) => f !== '.agents/harness.json'));
});

test('generated files carry the detected commands and hx:fill placeholders are reported', () => {
  const root = tmpProject(TS_PROJECT);
  const r = runSetup(root, {});
  const agents = read(root, 'AGENTS.md');
  assert.match(agents, /pnpm run typecheck/);
  assert.match(agents, /pnpm test/);
  assert.ok(agents.length < 4000);
  assert.match(read(root, '.agents/skills/project-checks/SKILL.md'), /^name: project-checks$/m);
  assert.match(read(root, '.agents/skills/project-checks/SKILL.md'), /pnpm run lint/);
  assert.match(read(root, '.agents/rules/tests.md'), /^trigger: glob$/m);
  assert.match(read(root, '.agents/rules/typescript.md'), /\*\*\/\*\.tsx?/);
  const hooks = JSON.parse(read(root, '.agents/hooks.json'));
  assert.match(JSON.stringify(hooks), /post-edit-lint\.js/);
  assert.ok(r.fills.length >= 3);
  assert.ok(r.fills.every((f) => f.file && f.hint));
  assert.ok(r.fills.some((f) => f.file === 'AGENTS.md'));
});

test('second run is a no-op: everything skipped, nothing overwritten', () => {
  const root = tmpProject(TS_PROJECT);
  runSetup(root, {});
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# mine\n');
  const r = runSetup(root, {});
  assert.equal(r.created.length, 0);
  assert.ok(r.skipped.includes('AGENTS.md'));
  assert.equal(read(root, 'AGENTS.md'), '# mine\n');
  assert.equal((read(root, '.gitignore').match(/\.agents\/state\//g) || []).length, 1);
});

test('--force rewrites generated files but never a root AGENTS.md the user wrote', () => {
  const root = tmpProject({ ...TS_PROJECT, 'AGENTS.md': '# user rules\n' });
  const first = runSetup(root, {});
  assert.ok(first.skipped.includes('AGENTS.md'));
  assert.ok(first.notes.some((n) => /AGENTS\.md/.test(n)));
  fs.writeFileSync(path.join(root, '.agents/rules/tests.md'), 'edited\n');
  const r = runSetup(root, { force: true });
  assert.ok(r.created.includes('.agents/rules/tests.md'));
  assert.notEqual(read(root, '.agents/rules/tests.md'), 'edited\n');
  assert.equal(read(root, 'AGENTS.md'), '# user rules\n');
});

test('--dry-run reports the plan and writes nothing', () => {
  const root = tmpProject(TS_PROJECT);
  const r = runSetup(root, { dryRun: true });
  assert.ok(r.created.includes('AGENTS.md'));
  assert.equal(exists(root, 'AGENTS.md'), false);
  assert.equal(exists(root, '.agents'), false);
  assert.doesNotMatch(read(root, '.gitignore'), /\.agents/);
});

test('unknown stack still scaffolds, with placeholder commands and no typescript rule', () => {
  const root = tmpProject({ 'README.md': '# x' });
  const r = runSetup(root, {});
  assert.equal(r.stack.kind, 'unknown');
  assert.deepEqual(r.checks, []);
  assert.equal(exists(root, '.agents/rules/typescript.md'), false);
  assert.match(read(root, 'AGENTS.md'), /hx:fill/);
  assert.ok(r.fills.some((f) => /command/i.test(f.hint)));
  assert.ok(exists(root, '.agents/hooks.json'));
});

test('GENERATED lists every template path so doctor and --force share one source of truth', () => {
  assert.ok(GENERATED.includes('AGENTS.md'));
  assert.ok(GENERATED.includes('.agents/hooks/post-edit-lint.js'));
});
