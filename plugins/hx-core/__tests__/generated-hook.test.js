'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const { tmpProject } = require('./helpers');
const { runSetup } = require('../lib/setup');
const { postEditLintHook } = require('../lib/templates');

const LINT_FILE = '.agents/state/lint.json';
const readLint = (root) => JSON.parse(fs.readFileSync(path.join(root, LINT_FILE), 'utf8'));

function runHook(root, payload) {
  const agentsDir = path.join(root, '.agents');
  const r = spawnSync(process.execPath, ['./hooks/post-edit-lint.js'], {
    cwd: agentsDir, input: JSON.stringify(payload), encoding: 'utf8', timeout: 10000,
  });
  return r;
}

test('generated hook always answers {} and exit 0, even with no eslint and garbage input', () => {
  const root = tmpProject({ 'package.json': { name: 'x', scripts: { test: 'vitest' } } });
  runSetup(root, {});
  const hook = fs.readFileSync(path.join(root, '.agents/hooks/post-edit-lint.js'), 'utf8');
  assert.match(hook, /const LINT = ""/); // no eslint config → linting disabled
  const r = runHook(root, { workspacePaths: [root], toolCall: { name: 'write_to_file', args: { TargetFile: path.join(root, 'a.js') } } });
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), '{}');
  const g = spawnSync(process.execPath, ['./hooks/post-edit-lint.js'], { cwd: path.join(root, '.agents'), input: 'not json', encoding: 'utf8' });
  assert.equal(g.status, 0);
  assert.equal(g.stdout.trim(), '{}');
});

test('generated hook with eslint config lints the edited file and records a notice in lint.json', () => {
  const root = tmpProject({
    'package.json': { name: 'x', scripts: { test: 'vitest' } },
    'eslint.config.js': 'export default []',
    'src/a.js': 'var x = 1\n',
  });
  runSetup(root, {});
  const hook = fs.readFileSync(path.join(root, '.agents/hooks/post-edit-lint.js'), 'utf8');
  assert.match(hook, /npx eslint/);
  assert.match(hook, /lint\.json/);
  // Replace the lint command with a stub so the test does not need eslint installed.
  const stubbed = hook.replace(/const LINT = ".*?";/, `const LINT = ${JSON.stringify(process.execPath + ' -e process.stderr.write("lint-problem");process.exit(1)')};`);
  fs.writeFileSync(path.join(root, '.agents/hooks/post-edit-lint.js'), stubbed);
  fs.rmSync(path.join(root, '.agents/state'), { recursive: true, force: true }); // hook must recreate it
  const r = runHook(root, { workspacePaths: [root], toolCall: { name: 'replace_file_content', args: { TargetFile: 'src/a.js' } } });
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), '{}');
  assert.equal(r.stderr, '', 'nothing on stderr: agy shows it to nobody');
  const lint = readLint(root);
  assert.equal(lint.notices.length, 1);
  assert.equal(lint.notices[0].source, 'project-lint');
  assert.equal(lint.notices[0].file, 'src/a.js');
  assert.match(lint.notices[0].text, /lint-problem/);
  assert.ok(Date.parse(lint.notices[0].at) > 0);
  assert.deepEqual(lint.reminded, {});
  // Non-JS files are ignored and add nothing.
  runHook(root, { workspacePaths: [root], toolCall: { name: 'write_to_file', args: { TargetFile: 'README.md' } } });
  assert.equal(readLint(root).notices.length, 1);
});

test('generated hook from a hand-built stack: failing linter appends, passing linter does not, corrupt lint.json is replaced, cap at 20', () => {
  const root = tmpProject({ 'src/a.go': 'package a\n' });
  const fail = path.join(root, 'fail.js');
  fs.writeFileSync(fail, 'process.stdout.write("bad format"); process.exit(1);');
  const pass = path.join(root, 'pass.js');
  fs.writeFileSync(pass, 'process.exit(0);');
  const write = (cmd, nonEmptyIsIssue) => {
    fs.mkdirSync(path.join(root, '.agents/hooks'), { recursive: true });
    fs.writeFileSync(path.join(root, '.agents/hooks/post-edit-lint.js'), postEditLintHook({ lint: { cmd, exts: ['.go'], nonEmptyIsIssue } }));
  };
  const call = () => runHook(root, { workspacePaths: [root], toolCall: { name: 'write_to_file', args: { TargetFile: path.join(root, 'src/a.go') } } });

  fs.mkdirSync(path.join(root, '.agents/state'), { recursive: true });
  fs.writeFileSync(path.join(root, LINT_FILE), '{ corrupt');
  write(`${process.execPath} ${fail}`, false);
  let r = call();
  assert.equal(r.stdout.trim(), '{}');
  assert.equal(readLint(root).notices.length, 1);
  assert.match(readLint(root).notices[0].text, /bad format/);

  write(`${process.execPath} ${pass}`, false);
  call();
  assert.equal(readLint(root).notices.length, 1, 'clean lint adds nothing');

  // gofmt-style: exit 0 but stdout names the file → issue only when nonEmptyIsIssue.
  const gofmt = path.join(root, 'gofmt.js');
  fs.writeFileSync(gofmt, 'process.stdout.write("src/a.go\\n");');
  write(`${process.execPath} ${gofmt}`, false);
  call();
  assert.equal(readLint(root).notices.length, 1);
  write(`${process.execPath} ${gofmt}`, true);
  call();
  assert.equal(readLint(root).notices.length, 2);

  write(`${process.execPath} ${fail}`, false);
  for (let i = 0; i < 25; i++) call();
  assert.equal(readLint(root).notices.length, 20);
});
