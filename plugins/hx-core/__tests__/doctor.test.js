'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { tmpProject, writeFiles, read, exists } = require('./helpers');
const { runSetup } = require('../lib/setup');
const { runDoctor } = require('../lib/doctor');

const PROJECT = {
  'package.json': { name: 'demo', scripts: { test: 'vitest run', lint: 'eslint .' } },
  'package-lock.json': '{}',
  '.gitignore': 'node_modules\n',
};

function healthy(extra = {}) {
  const root = tmpProject({ ...PROJECT, ...extra });
  runSetup(root, {});
  return root;
}
function byId(r, id) {
  return r.results.find((x) => x.id === id);
}
// Keep the host machine's ~/.gemini out of the assertions.
const OPTS = { home: tmpProject({}) };

test('a freshly set up project passes with only placeholder and hx-plugins warnings', () => {
  const r = runDoctor(healthy(), OPTS);
  assert.equal(r.ok, true, JSON.stringify(r.results));
  assert.equal(r.errors, 0);
  const warnIds = r.results.filter((x) => x.level === 'warn').map((x) => x.id).sort();
  assert.deepEqual(warnIds, ['hx-plugins', 'placeholders']);
  assert.equal(byId(r, 'checks-runnable').level, 'ok');
  assert.equal(byId(r, 'hooks').level, 'ok');
});

test('missing .agents and manifest are errors', () => {
  const r = runDoctor(tmpProject(PROJECT), OPTS);
  assert.equal(r.ok, false);
  assert.equal(byId(r, 'agents-dir').level, 'error');
  assert.equal(byId(r, 'manifest').level, 'error');
  assert.match(byId(r, 'manifest').fix, /hx-core:setup/);
});

test('manifest must parse and declare harness "hx" with a checks array', () => {
  const root = healthy();
  fs.writeFileSync(path.join(root, '.agents/harness.json'), '{ "harness": "other" }');
  const r = runDoctor(root, OPTS);
  assert.equal(byId(r, 'manifest').level, 'error');
  fs.writeFileSync(path.join(root, '.agents/harness.json'), '{ nope');
  assert.equal(byId(runDoctor(root, OPTS), 'manifest').level, 'error');
});

test('root AGENTS.md: missing is error, > 4000 chars warns, > 12000 chars is error', () => {
  const root = healthy();
  fs.unlinkSync(path.join(root, 'AGENTS.md'));
  assert.equal(byId(runDoctor(root, OPTS), 'root-rules').level, 'error');
  fs.writeFileSync(path.join(root, 'AGENTS.md'), 'x'.repeat(5000));
  assert.equal(byId(runDoctor(root, OPTS), 'root-rules').level, 'warn');
  fs.writeFileSync(path.join(root, 'AGENTS.md'), 'x'.repeat(13000));
  assert.equal(byId(runDoctor(root, OPTS), 'root-rules').level, 'error');
});

test('rules: bad trigger, glob without globs, and oversized rule are errors', () => {
  const root = healthy();
  writeFiles(root, {
    '.agents/rules/bad-trigger.md': '---\ntrigger: sometimes\n---\nx',
    '.agents/rules/no-globs.md': '---\ntrigger: glob\ndescription: d\n---\nx',
    '.agents/rules/huge.md': '---\ntrigger: always_on\n---\n' + 'x'.repeat(12500),
  });
  const c = byId(runDoctor(root, OPTS), 'rules-frontmatter');
  assert.equal(c.level, 'error');
  assert.match(c.message, /bad-trigger\.md/);
  assert.match(c.message, /no-globs\.md/);
  assert.match(c.message, /huge\.md/);
});

test('rules without frontmatter are accepted as always-on', () => {
  const root = healthy({ '.agents/rules/plain.md': '# plain rule' });
  assert.equal(byId(runDoctor(root, OPTS), 'rules-frontmatter').level, 'ok');
});

test('placeholders warn and list the files; filled files pass', () => {
  const root = healthy();
  let c = byId(runDoctor(root, OPTS), 'placeholders');
  assert.equal(c.level, 'warn');
  assert.match(c.message, /AGENTS\.md/);
  for (const f of ['AGENTS.md', '.agents/rules/tests.md', '.agents/skills/project-checks/SKILL.md']) {
    fs.writeFileSync(path.join(root, f), read(root, f).replace(/<!--\s*hx:fill:[^]*?-->/g, 'filled'));
  }
  c = byId(runDoctor(root, OPTS), 'placeholders');
  assert.equal(c.level, 'ok');
});

test('skills: name must match directory and regex, description required, hx shadow warns', () => {
  const root = healthy();
  writeFiles(root, {
    '.agents/skills/Bad_Name/SKILL.md': '---\nname: Bad_Name\ndescription: d\n---\nx',
    '.agents/skills/mismatch/SKILL.md': '---\nname: other\ndescription: d\n---\nx',
    '.agents/skills/nodesc/SKILL.md': '---\nname: nodesc\n---\nx',
    '.agents/skills/empty/README.md': 'no SKILL.md here',
  });
  const c = byId(runDoctor(root, OPTS), 'skills');
  assert.equal(c.level, 'error');
  for (const s of ['Bad_Name', 'mismatch', 'nodesc', 'empty']) assert.match(c.message, new RegExp(s));
  const root2 = healthy({ '.agents/skills/verify/SKILL.md': '---\nname: verify\ndescription: d\n---\nx' });
  const c2 = byId(runDoctor(root2, OPTS), 'skills');
  assert.equal(c2.level, 'warn');
  assert.match(c2.message, /verify/);
});

test('agents: unknown tool names are errors, known ones pass', () => {
  const root = healthy({
    '.agents/agents/good.md': '---\nname: good\ndescription: d\ntools: [view_file, grep_search, run_command]\nsubagent: true\n---\nx',
    '.agents/agents/bad.md': '---\nname: bad\ndescription: d\ntools:\n  - view_file\n  - command_status\n  - edit_file\n---\nx',
  });
  const c = byId(runDoctor(root, OPTS), 'agents');
  assert.equal(c.level, 'error');
  assert.match(c.message, /bad\.md.*command_status/);
  assert.match(c.message, /edit_file/);
  assert.doesNotMatch(c.message, /good\.md/);
});

test('hooks: missing script file, timeout > 10 and invalid json are errors', () => {
  const root = healthy();
  fs.unlinkSync(path.join(root, '.agents/hooks/post-edit-lint.js'));
  let c = byId(runDoctor(root, OPTS), 'hooks');
  assert.equal(c.level, 'error');
  assert.match(c.message, /post-edit-lint\.js/);
  writeFiles(root, { '.agents/hooks/post-edit-lint.js': '' });
  const hooks = JSON.parse(read(root, '.agents/hooks.json'));
  hooks['project-post-edit-lint'].PostToolUse[0].hooks[0].timeout = 30;
  fs.writeFileSync(path.join(root, '.agents/hooks.json'), JSON.stringify(hooks));
  c = byId(runDoctor(root, OPTS), 'hooks');
  assert.equal(c.level, 'error');
  assert.match(c.message, /timeout/);
  fs.writeFileSync(path.join(root, '.agents/hooks.json'), '{');
  assert.equal(byId(runDoctor(root, OPTS), 'hooks').level, 'error');
});

test('state: not ignored / missing dir warn and --fix repairs both', () => {
  const root = healthy();
  fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules\n');
  fs.rmSync(path.join(root, '.agents/state'), { recursive: true });
  let r = runDoctor(root, OPTS);
  assert.equal(byId(r, 'state-ignored').level, 'warn');
  assert.equal(byId(r, 'state-dir').level, 'warn');
  r = runDoctor(root, { ...OPTS, fix: true });
  assert.ok(r.fixed.includes('state-ignored'));
  assert.ok(r.fixed.includes('state-dir'));
  assert.match(read(root, '.gitignore'), /\.agents\/state\//);
  assert.ok(exists(root, '.agents/state'));
  r = runDoctor(root, OPTS);
  assert.equal(byId(r, 'state-ignored').level, 'ok');
  assert.equal(byId(r, 'state-dir').level, 'ok');
});

test('goal.json schema is validated when present', () => {
  const root = healthy({ '.agents/state/goal.json': { active: 'yes', done: false } });
  const c = byId(runDoctor(root, OPTS), 'goal');
  assert.equal(c.level, 'error');
  writeFiles(root, { '.agents/state/goal.json': { active: true, done: false, goal: 'g', checks: ['npm test'] } });
  assert.equal(byId(runDoctor(root, OPTS), 'goal').level, 'ok');
});

test('checks-runnable warns when a manifest check names a script that is gone', () => {
  const root = healthy();
  writeFiles(root, { 'package.json': { name: 'demo', scripts: { test: 'vitest run' } } });
  const c = byId(runDoctor(root, OPTS), 'checks-runnable');
  assert.equal(c.level, 'warn');
  assert.match(c.message, /npm run lint/);
});

test('hx-plugins reads the global config: entry path, installed dir, or disabled plugin', () => {
  const root = healthy();
  const home = tmpProject({});
  assert.equal(byId(runDoctor(root, { home }), 'hx-plugins').level, 'warn');
  writeFiles(home, { '.gemini/config/plugins.json': { entries: [{ path: path.join(home, 'nowhere') }] } });
  assert.equal(byId(runDoctor(root, { home }), 'hx-plugins').level, 'warn');
  const hxHome = tmpProject({});
  fs.mkdirSync(path.join(hxHome, 'plugins', 'hx-core'), { recursive: true });
  writeFiles(home, { '.gemini/config/plugins.json': { entries: [{ path: path.join(hxHome, 'plugins') }] } });
  assert.equal(byId(runDoctor(root, { home }), 'hx-plugins').level, 'ok');
  writeFiles(home, { '.gemini/config/config.json': { plugins: { 'hx-core': { enabled: false } } } });
  const c = byId(runDoctor(root, { home }), 'hx-plugins');
  assert.equal(c.level, 'warn');
  assert.match(c.message, /hx-core.*disabled/);
  const home2 = tmpProject({});
  fs.mkdirSync(path.join(home2, '.gemini/config/plugins/hx-core'), { recursive: true });
  assert.equal(byId(runDoctor(root, { home: home2 }), 'hx-plugins').level, 'ok');
});

test('report shape: ok, errors, warnings counts and every result has id/level/message', () => {
  const r = runDoctor(healthy(), OPTS);
  assert.equal(typeof r.ok, 'boolean');
  assert.equal(r.errors, r.results.filter((x) => x.level === 'error').length);
  assert.equal(r.warnings, r.results.filter((x) => x.level === 'warn').length);
  for (const x of r.results) {
    assert.ok(x.id && ['ok', 'warn', 'error'].includes(x.level) && typeof x.message === 'string');
  }
});
