'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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

  // Dry run: pruning is computed for the note, but nothing on disk changes, so the
  // note must say "would prune", not "pruned" — and adopt.json itself is untouched.
  const dry = runAdopt(root, { home });
  assert.ok(dry.notes.some((n) => /would prune 2 stale adopt\.json entry\(ies\)/.test(n)), dry.notes.join('\n'));
  let a = JSON.parse(read(root, ADOPT_FILE));
  assert.notEqual(a.items['.agents/skills/deploy/SKILL.md'], undefined);
  assert.notEqual(a.items['.agents/skills/deploy/scripts/go.sh'], undefined);

  // --only run next: the unscanned skill source is now gone, but pruning must not
  // touch it because this run never looked at skills at all.
  const only = runAdopt(root, { apply: true, only: ['claude-md'], home });
  a = JSON.parse(read(root, ADOPT_FILE));
  assert.notEqual(a.items['.agents/skills/deploy/SKILL.md'], undefined);
  assert.notEqual(a.items['.agents/skills/deploy/scripts/go.sh'], undefined);
  assert.equal(only.notes.some((n) => /pruned/.test(n)), false);

  // Full apply run: the now-source-less skill entries are stale and must be pruned.
  const full = runAdopt(root, { apply: true, home });
  a = JSON.parse(read(root, ADOPT_FILE));
  assert.equal(a.items['.agents/skills/deploy/SKILL.md'], undefined);
  assert.equal(a.items['.agents/skills/deploy/scripts/go.sh'], undefined);
  assert.ok(full.notes.some((n) => /^pruned 2 stale adopt\.json entry\(ies\)/.test(n)), full.notes.join('\n'));
});

test('a converter throw suppresses pruning entirely for that run, with a note', () => {
  const root = tmpProject(PROJECT);
  const home = HOME();
  runAdopt(root, { apply: true, home });
  // Monkey-patch the shared, cached skills module in place (same instance the
  // orchestrator's CONVERTERS map holds) and restore it in `finally` so no other
  // test in this file — or any other file — ever sees the throwing version.
  const skills = require('../lib/adopt/skills');
  const origScan = skills.scan;
  skills.scan = () => { throw new Error('boom'); };
  let r;
  try {
    r = runAdopt(root, { apply: true, home });
  } finally {
    skills.scan = origScan;
  }
  const a = JSON.parse(read(root, ADOPT_FILE));
  assert.notEqual(a.items['.agents/skills/deploy/SKILL.md'], undefined);
  assert.notEqual(a.items['.agents/skills/deploy/scripts/go.sh'], undefined);
  assert.equal(r.notes.some((n) => /^pruned/.test(n) || /^would prune/.test(n)), false);
  assert.ok(r.notes.some((n) => n === 'prune skipped: skills converter failed'), r.notes.join('\n'));
});

test('runAdopt with apply:true on a sourceless project creates no .agents/state/ and does not modify .gitignore', () => {
  const root = tmpProject({ '.gitignore': '' });
  const gitignoreBefore = read(root, '.gitignore');
  const r = runAdopt(root, { apply: true, home: HOME() });
  assert.equal(exists(root, '.agents/state'), false, '.agents/state should not be created');
  assert.equal(read(root, '.gitignore'), gitignoreBefore, '.gitignore should not be modified');
  const adoptFile = exists(root, ADOPT_FILE);
  assert.equal(adoptFile, false, 'adopt.json should not be created');
});

test('duplicate target across items: exactly one item writes, the rest are unsupported; --apply does not oscillate', () => {
  // .claude/commands/db-migrate.md and .claude/commands/db/migrate.md both flatten to
  // the skill name "db-migrate" (commands.js replaces "/" with "-"), so both would
  // otherwise claim .agents/skills/db-migrate/SKILL.md.
  const root = tmpProject({
    '.claude/commands/db-migrate.md': '# DB Migrate\nRun the first migration.\n',
    '.claude/commands/db/migrate.md': '# DB Migrate\nRun the second migration.\n',
  });
  const home = HOME();
  const target = '.agents/skills/db-migrate/SKILL.md';

  const r = runAdopt(root, { apply: true, only: ['commands'], home });
  const rows = r.items.filter((i) => i.target === target);
  assert.equal(rows.length, 2, r.items.map((i) => `${i.source} -> ${i.target}`).join('\n'));
  const writer = rows.find((i) => i.status !== 'unsupported');
  const loser = rows.find((i) => i.status === 'unsupported');
  assert.ok(writer, 'exactly one item must write the target');
  assert.equal(writer.status, 'created');
  assert.equal(writer.source, '.claude/commands/db-migrate.md');
  assert.ok(loser, 'the later claimant must be reported, not silently lost');
  assert.equal(loser.source, '.claude/commands/db/migrate.md');
  assert.match(loser.reason, /already claimed by \.claude\/commands\/db-migrate\.md; rename it/);

  // Oscillation regression: before the fix, decide() ran against the pre-write
  // filesystem for every item, so both were reported "created", only one survived on
  // disk, and each subsequent --apply flipped which content was on disk. Content must
  // now be byte-identical after every re-run.
  const contentAfterFirst = read(root, target);
  for (let i = 1; i <= 3; i++) {
    runAdopt(root, { apply: true, only: ['commands'], home });
    assert.equal(read(root, target), contentAfterFirst, `target content changed after re-run ${i}`);
  }
});

test('symlinked Claude sources are reported as unsupported, not silently dropped; countSources sees them', (t) => {
  const root = tmpProject({});
  const realFile = path.join(root, 'real-shared.md');
  fs.writeFileSync(realFile, '---\nname: shared\ndescription: shared agent\n---\nShared body\n');
  const agentsDir = path.join(root, '.claude', 'agents');
  fs.mkdirSync(agentsDir, { recursive: true });
  const linkPath = path.join(agentsDir, 'shared.md');
  try {
    fs.symlinkSync(realFile, linkPath, 'file');
  } catch (err) {
    t.skip(`platform refused to create a symlink: ${err.message}`);
    return;
  }
  const home = HOME();

  const before = countSources(root, home);
  assert.equal(before.claudeMd, false);
  assert.ok(hasSources(before), 'a symlinked-only source tree must not look sourceless');

  const r = runAdopt(root, { only: ['agents'], home });
  const it = r.items.find((i) => i.source === '.claude/agents/shared.md');
  assert.ok(it, r.items.map((i) => i.source).join('\n'));
  assert.equal(it.status, 'unsupported');
  assert.match(it.reason, /symlinked source is not followed/);
});

test('safety invariant: .claude/** and CLAUDE.md are byte-identical before and after a run', () => {
  const root = tmpProject(PROJECT); // includes a skill dir with a companion file
  const home = HOME();
  const hashTree = () => {
    const map = {};
    const claudeMdPath = path.join(root, 'CLAUDE.md');
    if (fs.existsSync(claudeMdPath)) map['CLAUDE.md'] = crypto.createHash('sha256').update(fs.readFileSync(claudeMdPath)).digest('hex');
    const walkAll = (dir, prefix) => {
      for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = prefix ? `${prefix}/${d.name}` : d.name;
        const abs = path.join(dir, d.name);
        if (d.isDirectory()) walkAll(abs, rel);
        else if (d.isFile()) map[`.claude/${rel}`] = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
      }
    };
    const claudeDir = path.join(root, '.claude');
    if (fs.existsSync(claudeDir)) walkAll(claudeDir, '');
    return map;
  };
  const before = hashTree();
  assert.ok(Object.keys(before).length >= 5, 'fixture must cover CLAUDE.md plus a non-trivial .claude/ tree');
  runAdopt(root, { apply: true, force: true, home });
  const after = hashTree();
  assert.deepEqual(after, before);
});
