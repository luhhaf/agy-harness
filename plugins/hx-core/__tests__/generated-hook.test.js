'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const { tmpProject } = require('./helpers');
const { runSetup } = require('../lib/setup');

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

test('generated hook with eslint config lints the edited file and reports to stderr only', () => {
  const root = tmpProject({
    'package.json': { name: 'x', scripts: { test: 'vitest' } },
    'eslint.config.js': 'export default []',
    'src/a.js': 'var x = 1\n',
  });
  runSetup(root, {});
  const hook = fs.readFileSync(path.join(root, '.agents/hooks/post-edit-lint.js'), 'utf8');
  assert.match(hook, /npx eslint/);
  // Replace the lint command with a stub so the test does not need eslint installed.
  const stubbed = hook.replace(/const LINT = ".*?";/, `const LINT = ${JSON.stringify(process.execPath + ' -e process.stderr.write("lint-problem");process.exit(1)')};`);
  fs.writeFileSync(path.join(root, '.agents/hooks/post-edit-lint.js'), stubbed);
  const r = runHook(root, { workspacePaths: [root], toolCall: { name: 'replace_file_content', args: { TargetFile: 'src/a.js' } } });
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), '{}');
  assert.match(r.stderr, /\[project-lint\] src\/a\.js/);
  // Non-JS files are ignored.
  const skip = runHook(root, { workspacePaths: [root], toolCall: { name: 'write_to_file', args: { TargetFile: 'README.md' } } });
  assert.equal(skip.stderr, '');
});
