'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { tmpProject } = require('./helpers');
const agents = require('../lib/adopt/agents');
const rules = require('../lib/adopt/rules');
const toolmap = require('../lib/adopt/toolmap');
const { frontmatter } = require('../lib/fs');

const ctx = () => ({ home: tmpProject({}), toolmap, registry: require('../lib/registry.json') });

test('agents: maps tools and model, adds agy keys, wraps body under # System Prompt', () => {
  const root = tmpProject({
    '.claude/agents/reviewer.md': '---\nname: reviewer\ndescription: Reviews diffs\ntools: Read, Grep, Bash\nmodel: claude-opus-4-1\ncolor: red\npermissionMode: default\n---\nYou review code with the Read tool.\n',
  });
  const [it] = agents.scan(root, ctx());
  assert.equal(it.kind, 'agent');
  assert.equal(it.target, '.agents/agents/reviewer.md');
  const fm = frontmatter(it.content);
  assert.equal(fm.name, 'reviewer');
  assert.deepEqual(fm.tools, ['view_file', 'grep_search', 'run_command']);
  assert.equal(fm.model, 'pro');
  assert.equal(fm.subagent, 'true');
  assert.equal(fm.mainAgent, 'false');
  assert.equal(fm.commandExecutionPolicy, 'sandbox');
  assert.match(it.content, /# System Prompt\nYou review code with `view_file`\./);
  assert.equal(it.status, 'auto');
  assert.match(it.reason, /dropped frontmatter color, permissionMode/);
});

test('agents: no tools → default set; haiku → flash; unmapped tool → manual leftover; H1 kept', () => {
  const root = tmpProject({
    '.claude/agents/scout.md': '---\nname: scout\ndescription: d\nmodel: haiku\n---\n# Role\nExplore.\n',
    '.claude/agents/nb.md': '---\nname: nb\ndescription: d\ntools: [Read, NotebookEdit]\n---\nx\n',
  });
  const items = agents.scan(root, ctx());
  const scout = items.find((i) => /scout/.test(i.source));
  const fm = frontmatter(scout.content);
  assert.deepEqual(fm.tools, ['view_file', 'grep_search', 'find_by_name', 'list_dir', 'write_to_file', 'replace_file_content', 'run_command']);
  assert.equal(fm.model, 'flash');
  assert.match(scout.content, /---\n# Role\nExplore\./);
  const nb = items.find((i) => /nb\.md/.test(i.source));
  assert.equal(nb.status, 'manual');
  assert.deepEqual(frontmatter(nb.content).tools, ['view_file']);
  assert.equal(frontmatter(nb.content).commandExecutionPolicy, 'off');
  assert.ok(nb.leftovers.some((l) => /unmapped tool NotebookEdit/.test(l.text)));
});

test('rules: paths → glob trigger; none → always_on; oversize → manual', () => {
  const root = tmpProject({
    '.claude/rules/ts.md': '---\npaths: ["src/**/*.ts", "**/*.tsx"]\ndescription: TS rules\n---\nUse `Edit` carefully.\n',
    '.claude/rules/all.md': 'Always be kind.\n',
    '.claude/rules/big.md': 'x'.repeat(12100),
  });
  const items = rules.scan(root, ctx());
  const ts = items.find((i) => /ts\.md/.test(i.source));
  assert.equal(ts.kind, 'rule');
  assert.equal(ts.target, '.agents/rules/ts.md');
  const fm = frontmatter(ts.content);
  assert.equal(fm.trigger, 'glob');
  assert.deepEqual(fm.globs, ['src/**/*.ts', '**/*.tsx']);
  assert.equal(fm.description, 'TS rules');
  assert.match(ts.content, /Use `replace_file_content` carefully/);
  const all = items.find((i) => /all\.md/.test(i.source));
  assert.equal(frontmatter(all.content).trigger, 'always_on');
  assert.match(all.content, /Always be kind/);
  const big = items.find((i) => /big\.md/.test(i.source));
  assert.equal(big.status, 'manual');
  assert.match(big.reason, /12000/);
});
