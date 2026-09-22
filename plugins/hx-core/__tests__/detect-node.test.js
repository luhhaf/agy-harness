'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { tmpProject } = require('./helpers');
const { detect } = require('../lib/detect');

test('no package.json → unknown stack with no checks', () => {
  const root = tmpProject({ 'README.md': '# x' });
  const r = detect(root);
  assert.equal(r.kind, 'unknown');
  assert.deepEqual(r.checks, []);
});

test('npm project with default lockfile-less setup uses npm and only real scripts', () => {
  const root = tmpProject({
    'package.json': { name: 'a', scripts: { test: 'echo "Error: no test specified" && exit 1', lint: 'eslint .' } },
  });
  const r = detect(root);
  assert.equal(r.kind, 'node');
  assert.equal(r.packageManager, 'npm');
  assert.deepEqual(r.checks, ['npm run lint']);
  assert.equal(r.typescript, false);
});

test('pnpm + typescript project orders checks typecheck, lint, test, build', () => {
  const root = tmpProject({
    'package.json': { name: 'a', scripts: { build: 'tsc -p .', test: 'vitest run', lint: 'eslint .', typecheck: 'tsc --noEmit' } },
    'pnpm-lock.yaml': '',
    'tsconfig.json': {},
  });
  const r = detect(root);
  assert.equal(r.packageManager, 'pnpm');
  assert.equal(r.typescript, true);
  assert.deepEqual(r.checks, ['pnpm run typecheck', 'pnpm run lint', 'pnpm test', 'pnpm run build']);
});

test('yarn / bun lockfiles and type-check alias are recognised', () => {
  const y = detect(tmpProject({ 'package.json': { scripts: { 'type-check': 'tsc' } }, 'yarn.lock': '' }));
  assert.equal(y.packageManager, 'yarn');
  assert.deepEqual(y.checks, ['yarn run type-check']);
  const b = detect(tmpProject({ 'package.json': { scripts: { test: 'bun test' } }, 'bun.lock': '' }));
  assert.equal(b.packageManager, 'bun');
  assert.deepEqual(b.checks, ['bun test']);
});

test('eslint config and workspaces are reported', () => {
  const r = detect(tmpProject({
    'package.json': { workspaces: ['packages/*'], scripts: { test: 'vitest' } },
    'eslint.config.js': 'export default []',
    'package-lock.json': '{}',
  }));
  assert.equal(r.eslint, true);
  assert.equal(r.workspaces, true);
  assert.equal(r.packageManager, 'npm');
  assert.deepEqual(r.checks, ['npm test']);
});

test('invalid package.json falls back to node stack with a note instead of throwing', () => {
  const r = detect(tmpProject({ 'package.json': '{ not json' }));
  assert.equal(r.kind, 'node');
  assert.deepEqual(r.checks, []);
  assert.ok(r.notes.some((n) => /package\.json/.test(n)));
});
