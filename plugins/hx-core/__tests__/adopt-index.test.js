'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { tmpProject, read, exists } = require('./helpers');
const { runAdopt, scan, formatReport, countSources, hasSources, ADOPT_FILE, KINDS } = require('../lib/adopt');

const HOME = () => tmpProject({});
const PROJECT = {
  'CLAUDE.md': '# Rules\nUse `Bash`.\n',
  '.claude/skills/deploy/SKILL.md': '---\nname: deploy\ndescription: d\n---\nGo\n',
  '.claude/skills/deploy/scripts/go.sh': 'echo\n',
  '.claude/agents/rev.md': '---\nname: rev\ndescription: r\n---\nReview\n',
  '.mcp.json': { mcpServers: {} },
  '.claude/settings.json': { hooks: { Stop: [{ hooks: [{ type: 'command', command: 'x' }] }] }, permissions: { allow: ['Bash(ls)'] } },
  '.gitignore': '',
};
const byTarget = (r, t) => r.items.find((i) => i.target === t);

test('dry-run writes nothing but reports created/unsupported', () => {
  const root = tmpProject(PROJECT);
  const r = runAdopt(root, { home: HOME() });
  assert.equal(r.apply, false);
  assert.equal(byTarget(r, 'AGENTS.md').status, 'created');
  assert.equal(byTarget(r, '.agents/skills/deploy/SKILL.md').status, 'created');
  assert.equal(byTarget(r, '.agents/agents/rev.md').action, 'created');
  assert.equal(r.items.filter((i) => i.status === 'unsupported').length, 2);
  assert.equal(exists(root, 'AGENTS.md'), false);
  assert.equal(exists(root, ADOPT_FILE), false);
});

test('apply creates files, adopt.json with hashes, state dir and gitignore; rerun is up to date', () => {
  const root = tmpProject(PROJECT);
  const r = runAdopt(root, { apply: true, home: HOME() });
  assert.match(read(root, 'AGENTS.md'), /Use `run_command`/);
  assert.ok(exists(root, '.agents/skills/deploy/scripts/go.sh'));
  assert.ok(exists(root, '.agents/mcp_config.json'));
  assert.ok(exists(root, '.agents/state'));
  assert.match(read(root, '.gitignore'), /\.agents\/state\//);
  const a = JSON.parse(read(root, ADOPT_FILE));
  assert.equal(a.harness, 'hx');
  assert.deepEqual(Object.keys(a.items).sort(), ['.agents/agents/rev.md', '.agents/mcp_config.json', '.agents/skills/deploy/SKILL.md', '.agents/skills/deploy/scripts/go.sh', 'AGENTS.md']);
  assert.equal(a.items['AGENTS.md'].source, 'CLAUDE.md');
  assert.match(a.items['AGENTS.md'].targetHash, /^sha256:/);
  const again = runAdopt(root, { apply: true, home: HOME() });
  for (const t of ['AGENTS.md', '.agents/skills/deploy/SKILL.md']) {
    assert.equal(byTarget(again, t).status, 'skipped', t);
    assert.match(byTarget(again, t).reason, /up to date/);
  }
  assert.equal(r.items.length, again.items.length);
});

test('source change → updated; hand-edited target → skipped unless --force', () => {
  const root = tmpProject(PROJECT);
  runAdopt(root, { apply: true, home: HOME() });
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# Rules v2\n');
  let r = runAdopt(root, { apply: true, home: HOME() });
  assert.equal(byTarget(r, 'AGENTS.md').status, 'updated');
  assert.match(read(root, 'AGENTS.md'), /Rules v2/);
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# mine\n');
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# Rules v3\n');
  r = runAdopt(root, { apply: true, home: HOME() });
  assert.equal(byTarget(r, 'AGENTS.md').status, 'skipped');
  assert.match(byTarget(r, 'AGENTS.md').reason, /edited by hand/);
  assert.equal(read(root, 'AGENTS.md'), '# mine\n');
  r = runAdopt(root, { apply: true, force: true, home: HOME() });
  assert.equal(byTarget(r, 'AGENTS.md').status, 'updated');
  assert.match(read(root, 'AGENTS.md'), /Rules v3/);
});

test('unmanaged AGENTS.md is manual and never overwritten, even with --force; other unmanaged files are skipped', () => {
  const root = tmpProject({ ...PROJECT, 'AGENTS.md': '# theirs\n', '.agents/agents/rev.md': 'theirs\n' });
  const r = runAdopt(root, { apply: true, force: true, home: HOME() });
  assert.equal(byTarget(r, 'AGENTS.md').status, 'manual');
  assert.match(byTarget(r, 'AGENTS.md').reason, /merge by hand/);
  assert.equal(read(root, 'AGENTS.md'), '# theirs\n');
  assert.equal(byTarget(r, '.agents/agents/rev.md').status, 'skipped');
  assert.equal(read(root, '.agents/agents/rev.md'), 'theirs\n');
  const a = JSON.parse(read(root, ADOPT_FILE));
  assert.equal(a.items['AGENTS.md'], undefined);
});

test('--only limits kinds; memory is written but not tracked', () => {
  const root = tmpProject(PROJECT);
  const home = HOME();
  const slug = path.resolve(root).replace(/[\\/]/g, '-');
  fs.mkdirSync(path.join(home, '.claude', 'projects', slug, 'memory'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude', 'projects', slug, 'memory', 'm.md'), '---\nname: m\ndescription: remember\n---\n');
  const r = runAdopt(root, { apply: true, only: ['memory', 'skills'], home });
  assert.deepEqual([...new Set(r.items.map((i) => i.kind))].sort(), ['memory', 'skill']);
  assert.match(read(root, '.agents/state/notepad.md'), /remember/);
  assert.equal(exists(root, 'AGENTS.md'), false);
  const a = JSON.parse(read(root, ADOPT_FILE));
  assert.equal(a.items['.agents/state/notepad.md'], undefined);
  assert.equal(byTarget(r, '.agents/state/notepad.md').status, 'created');
  assert.equal(runAdopt(root, { apply: true, only: ['memory'], home }).items[0].status, 'skipped');
});

test('countSources / hasSources; formatReport lists items, totals and leftovers', () => {
  assert.equal(hasSources(countSources(tmpProject({}), HOME())), false);
  const root = tmpProject({ 'CLAUDE.md': 'Use the NotebookEdit tool\n' });
  const s = countSources(root, HOME());
  assert.equal(s.claudeMd, true);
  assert.equal(hasSources(s), true);
  const text = formatReport(runAdopt(root, { home: HOME() }));
  assert.match(text, /\[manual\] CLAUDE\.md → AGENTS\.md/);
  assert.match(text, /created 0, updated 0, skipped 0, manual 1, unsupported 0/);
  assert.match(text, /AGENTS\.md:1 — Use the NotebookEdit tool/);
  assert.match(text, /Dry run/);
  assert.deepEqual(KINDS, ['claude-md', 'skills', 'commands', 'agents', 'rules', 'hooks', 'permissions', 'mcp', 'memory']);
  assert.ok(Array.isArray(scan(root, { home: HOME() })));
});

test('multi-file item reports an honest per-file status, not one collapsed action', () => {
  const root = tmpProject(PROJECT);
  runAdopt(root, { apply: true, home: HOME() });
  // Hand-edit the deployed SKILL.md target directly, and change only the go.sh source.
  fs.writeFileSync(path.join(root, '.agents', 'skills', 'deploy', 'SKILL.md'), '# mine\n');
  fs.writeFileSync(path.join(root, '.claude', 'skills', 'deploy', 'scripts', 'go.sh'), 'echo v2\n');
  const r = runAdopt(root, { apply: true, home: HOME() });
  const row = byTarget(r, '.agents/skills/deploy/SKILL.md');
  const skillMdFile = row.files.find((f) => f.target === '.agents/skills/deploy/SKILL.md');
  const goShFile = row.files.find((f) => f.target === '.agents/skills/deploy/scripts/go.sh');
  assert.equal(skillMdFile.action, 'skipped');
  assert.match(skillMdFile.reason, /edited by hand/);
  assert.equal(goShFile.action, 'updated');
  assert.match(read(root, '.agents/skills/deploy/SKILL.md'), /# mine/);
  const text = formatReport(r);
  assert.match(text, /skills\/deploy\/SKILL\.md — skipped: .*edited by hand/);
});

test('adopt.json entries are pruned on a full run but survive an --only run', () => {
  const root = tmpProject(PROJECT);
  const home = HOME();
  runAdopt(root, { apply: true, home });
  fs.rmSync(path.join(root, '.claude', 'skills', 'deploy'), { recursive: true, force: true });

  // --only run first: the unscanned skill source is now gone, but pruning must not
  // touch it because this run never looked at skills at all.
  const only = runAdopt(root, { apply: true, only: ['claude-md'], home });
  let a = JSON.parse(read(root, ADOPT_FILE));
  assert.notEqual(a.items['.agents/skills/deploy/SKILL.md'], undefined);
  assert.notEqual(a.items['.agents/skills/deploy/scripts/go.sh'], undefined);
  assert.equal(only.notes.some((n) => /pruned/.test(n)), false);

  // Full run: the now-source-less skill entries are stale and must be pruned.
  const full = runAdopt(root, { apply: true, home });
  a = JSON.parse(read(root, ADOPT_FILE));
  assert.equal(a.items['.agents/skills/deploy/SKILL.md'], undefined);
  assert.equal(a.items['.agents/skills/deploy/scripts/go.sh'], undefined);
  assert.ok(full.notes.some((n) => /pruned 2 stale adopt\.json entry\(ies\)/.test(n)), full.notes.join('\n'));
});
