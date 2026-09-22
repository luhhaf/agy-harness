'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { tmpProject } = require('./helpers');
const { detect } = require('../lib/detect');

const SHAPE = ['kind', 'packageManager', 'typescript', 'eslint', 'workspaces', 'scripts', 'checks', 'testGlobs', 'lint', 'notes'];
const MVNW = process.platform === 'win32' ? 'mvnw.cmd' : './mvnw';
const GRADLEW = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';

test('every detector result has the common shape', () => {
  for (const files of [
    { 'package.json': { scripts: { test: 'vitest' } } },
    { 'pom.xml': '<project/>' },
    { 'build.gradle.kts': '' },
    { 'go.mod': 'module x' },
    { 'pyproject.toml': '' },
    { 'README.md': '' },
  ]) {
    const r = detect(tmpProject(files));
    for (const k of SHAPE) assert.ok(k in r, `${r.kind} lacks ${k}`);
    assert.ok(Array.isArray(r.testGlobs) && Array.isArray(r.checks) && Array.isArray(r.notes));
  }
});

test('node: testGlobs and eslint-driven lint', () => {
  const a = detect(tmpProject({ 'package.json': { scripts: { test: 'vitest' } } }));
  assert.equal(a.lint, null);
  assert.deepEqual(a.testGlobs, ['**/*.test.*', '**/*.spec.*', '**/__tests__/**']);
  const b = detect(tmpProject({ 'package.json': { scripts: { test: 'vitest' } }, '.eslintrc.json': '{}' }));
  assert.match(b.lint.cmd, /npx eslint/);
  assert.ok(b.lint.exts.includes('.ts'));
});

test('maven: wrapper vs plain mvn, spotless on/off', () => {
  const plain = detect(tmpProject({ 'pom.xml': '<project/>' }));
  assert.equal(plain.kind, 'maven');
  assert.equal(plain.packageManager, 'mvn');
  assert.deepEqual(plain.checks, ['mvn -q test']);
  assert.deepEqual(plain.testGlobs, ['**/src/test/**']);
  assert.equal(plain.lint, null);
  assert.ok(plain.notes.some((n) => /verify/.test(n)));
  const wrapped = detect(tmpProject({ 'pom.xml': '<project><artifactId>spotless-maven-plugin</artifactId></project>', mvnw: '#!/bin/sh' }));
  assert.equal(wrapped.packageManager, MVNW);
  assert.deepEqual(wrapped.checks, [`${MVNW} -q spotless:check`, `${MVNW} -q test`]);
});

test('gradle: wrapper vs plain gradle, kts and settings files', () => {
  const plain = detect(tmpProject({ 'build.gradle': '' }));
  assert.equal(plain.kind, 'gradle');
  assert.deepEqual(plain.checks, ['gradle check']);
  const wrapped = detect(tmpProject({ 'settings.gradle.kts': '', gradlew: '#!/bin/sh' }));
  assert.equal(wrapped.packageManager, GRADLEW);
  assert.deepEqual(wrapped.checks, [`${GRADLEW} check`]);
  assert.deepEqual(wrapped.testGlobs, ['**/src/test/**']);
});

test('go: build, vet, optional golangci-lint, test; gofmt lint with nonEmptyIsIssue', () => {
  const r = detect(tmpProject({ 'go.mod': 'module x' }));
  assert.equal(r.kind, 'go');
  assert.equal(r.packageManager, 'go');
  assert.deepEqual(r.checks, ['go build ./...', 'go vet ./...', 'go test ./...']);
  assert.deepEqual(r.testGlobs, ['**/*_test.go']);
  assert.deepEqual(r.lint, { cmd: 'gofmt -l', exts: ['.go'], nonEmptyIsIssue: true });
  const lint = detect(tmpProject({ 'go.mod': 'module x', '.golangci.yml': '' }));
  assert.deepEqual(lint.checks, ['go build ./...', 'go vet ./...', 'golangci-lint run', 'go test ./...']);
});

test('python: uv / poetry / pip prefixes, ruff, mypy, pytest detection', () => {
  const uv = detect(tmpProject({ 'pyproject.toml': '[tool.ruff]\nline-length = 100\n[tool.mypy]\nstrict = true\n', 'uv.lock': '', 'tests/test_a.py': '' }));
  assert.equal(uv.kind, 'python');
  assert.equal(uv.packageManager, 'uv');
  assert.deepEqual(uv.checks, ['uv run ruff check .', 'uv run mypy .', 'uv run pytest -q']);
  assert.deepEqual(uv.lint, { cmd: 'uv run ruff check', exts: ['.py'] });
  assert.ok(uv.testGlobs.includes('**/tests/**'));

  const poetry = detect(tmpProject({ 'pyproject.toml': '[tool.poetry]\nname = "x"\n', 'pytest.ini': '' }));
  assert.equal(poetry.packageManager, 'poetry');
  assert.deepEqual(poetry.checks, ['poetry run pytest -q']);
  assert.equal(poetry.lint, null);

  const pip = detect(tmpProject({ 'requirements.txt': 'pytest\nruff\n', 'ruff.toml': '' }));
  assert.equal(pip.packageManager, 'pip');
  assert.deepEqual(pip.checks, ['ruff check .', 'pytest -q']);
  assert.deepEqual(pip.lint, { cmd: 'ruff check', exts: ['.py'] });

  const bare = detect(tmpProject({ 'setup.py': '' }));
  assert.equal(bare.kind, 'python');
  assert.deepEqual(bare.checks, []);
});

test('detector order: node wins over maven, maven over gradle, go over python', () => {
  assert.equal(detect(tmpProject({ 'package.json': {}, 'pom.xml': '<project/>' })).kind, 'node');
  assert.equal(detect(tmpProject({ 'pom.xml': '<project/>', 'build.gradle': '' })).kind, 'maven');
  assert.equal(detect(tmpProject({ 'go.mod': '', 'pyproject.toml': '' })).kind, 'go');
});

test('unknown stack has the shape with empty globs and no lint', () => {
  const r = detect(tmpProject({ 'README.md': '' }));
  assert.equal(r.kind, 'unknown');
  assert.deepEqual(r.testGlobs, []);
  assert.equal(r.lint, null);
});
