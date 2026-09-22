'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { tmpProject } = require('./helpers');
const conv = require('../lib/adopt/claude-md');
const toolmap = require('../lib/adopt/toolmap');

const ctx = () => ({ home: tmpProject({}), toolmap, registry: require('../lib/registry.json') });

test('no CLAUDE.md → no items', () => {
  assert.deepEqual(conv.scan(tmpProject({}), ctx()), []);
});

test('converts CLAUDE.md: heading, boilerplate line, tool names, imports', () => {
  const root = tmpProject({
    'CLAUDE.md': '# CLAUDE.md\n\nThis file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.\n\n## Commands\nUse `Bash` to run `npm test`.\n\n@docs/style.md\nSee @missing/file.md\nMail me@example.com\n',
    'docs/style.md': '## Style\n- two spaces\n',
  });
  const [it] = conv.scan(root, ctx());
  assert.equal(it.kind, 'claude-md');
  assert.equal(it.source, 'CLAUDE.md');
  assert.equal(it.target, 'AGENTS.md');
  assert.match(it.content, /^# AGENTS\.md/);
  assert.ok(!/guidance to Claude Code/.test(it.content));
  assert.match(it.content, /Use `run_command` to run `npm test`/);
  assert.match(it.content, /<!-- adopted from @docs\/style\.md -->\n## Style\n- two spaces\n<!-- \/adopted -->/);
  assert.match(it.content, /me@example\.com/);
  assert.equal(it.status, 'manual');
  assert.ok(it.leftovers.some((l) => /unresolved import @missing\/file\.md/.test(l.text)));
  assert.match(it.sourceHash, /^sha256:/);
});

test('.claude/CLAUDE.md is used when root CLAUDE.md is absent; ~/ imports resolve; cycles stop', () => {
  const home = tmpProject({ 'shared.md': 'shared rule\n' });
  const root = tmpProject({ '.claude/CLAUDE.md': 'Top\n@~/shared.md\n@../CLAUDE.md\n' });
  require('fs').writeFileSync(path.join(root, 'CLAUDE.md.bak'), '');
  const [it] = conv.scan(root, { ...ctx(), home });
  assert.equal(it.source, '.claude/CLAUDE.md');
  assert.match(it.content, /shared rule/);
  assert.equal(it.status, 'manual'); // ../CLAUDE.md does not exist → unresolved
});

test('clean short file is auto; over 4000 chars is manual', () => {
  const [ok] = conv.scan(tmpProject({ 'CLAUDE.md': '# Rules\n- keep tests green\n' }), ctx());
  assert.equal(ok.status, 'auto');
  const [big] = conv.scan(tmpProject({ 'CLAUDE.md': '# Rules\n' + 'x'.repeat(4100) }), ctx());
  assert.equal(big.status, 'manual');
  assert.match(big.reason, /4000/);
});
