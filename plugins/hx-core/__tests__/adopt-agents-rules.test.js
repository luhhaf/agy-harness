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
    '.claude/agents/code-reviewer.md': '---\nname: code-reviewer\ndescription: Reviews diffs\ntools: Read, Grep, Bash\nmodel: claude-opus-4-1\ncolor: red\npermissionMode: default\n---\nYou review code with the Read tool.\n',
  });
  const [it] = agents.scan(root, ctx());
  assert.equal(it.kind, 'agent');
  assert.equal(it.target, '.agents/agents/code-reviewer.md');
  const fm = frontmatter(it.content);
  assert.equal(fm.name, 'code-reviewer');
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

test('agents: all unmapped tools → empty tools array, commandExecutionPolicy off, manual status', () => {
  const root = tmpProject({
    '.claude/agents/none.md': '---\nname: none\ndescription: None map\ntools: [NotebookEdit, SlashCommand]\n---\nx\n',
  });
  const [it] = agents.scan(root, ctx());
  const fm = frontmatter(it.content);
  assert.deepEqual(fm.tools, []);
  assert.equal(fm.commandExecutionPolicy, 'off');
  assert.equal(it.status, 'manual');
  assert.ok(it.leftovers.some((l) => /unmapped tool NotebookEdit/.test(l.text)));
  assert.ok(it.leftovers.some((l) => /unmapped tool SlashCommand/.test(l.text)));
});

test('agents: no model key → defaults to inherit', () => {
  const root = tmpProject({
    '.claude/agents/nomodel.md': '---\nname: nomodel\ndescription: No model\ntools: [Read]\n---\nx\n',
  });
  const [it] = agents.scan(root, ctx());
  const fm = frontmatter(it.content);
  assert.equal(fm.model, 'inherit');
  assert.deepEqual(fm.tools, ['view_file']);
});

test('rules: scalar paths value converts to glob array', () => {
  const root = tmpProject({
    '.claude/rules/one.md': '---\npaths: src/**/*.ts\ndescription: One\n---\nx\n',
  });
  const [it] = rules.scan(root, ctx());
  const fm = frontmatter(it.content);
  assert.equal(fm.trigger, 'glob');
  assert.deepEqual(fm.globs, ['src/**/*.ts']);
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

test('agents: hxAgents collision (reviewer) → manual status; non-colliding agent → auto', () => {
  const root = tmpProject({
    '.claude/agents/reviewer.md': '---\nname: reviewer\ndescription: Reviews code\ntools: Read\n---\nReviews.\n',
    '.claude/agents/custom-agent.md': '---\nname: custom-agent\ndescription: Custom\ntools: Read\n---\nCustom.\n',
  });
  const items = agents.scan(root, ctx());
  const reviewerItem = items.find((i) => /reviewer\.md/.test(i.source));
  assert.equal(reviewerItem.status, 'manual');
  assert.match(reviewerItem.reason, /shadows the hx-agents subagent reviewer; rename it or the project copy wins/);
  const customItem = items.find((i) => /custom-agent\.md/.test(i.source));
  assert.equal(customItem.status, 'auto');
});
