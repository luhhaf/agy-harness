'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { rewrite, mapToolList, mapMatcher, MAP } = require('../lib/adopt/toolmap');

test('rewrite maps names inside code spans only', () => {
  const r = rewrite('Use `Read` then `Edit`; Read the docs.\nRun `Bash` and `Grep`.');
  assert.equal(r.text, 'Use `view_file` then `replace_file_content`; Read the docs.\nRun `run_command` and `grep_search`.');
  assert.deepEqual(r.leftovers, []);
});

test('rewrite maps "the X tool" / "X tool" forms', () => {
  const r = rewrite('Call the Bash tool, or the Glob tool.\nWrite tool creates files.');
  assert.equal(r.text, 'Call `run_command`, or `find_by_name`.\n`write_to_file` creates files.');
});

test('TodoWrite becomes a task-artifact note', () => {
  assert.equal(rewrite('Use `TodoWrite`.').text, 'Use `write_to_file` (task artifact).');
});

test('unmapped tools and "Claude Code" are reported as leftovers with line numbers', () => {
  const r = rewrite('line one\nUse the NotebookEdit tool here.\nThis file guides Claude Code.\n`SlashCommand` too');
  assert.deepEqual(r.leftovers.map((l) => l.line), [2, 3, 4]);
  assert.match(r.leftovers[0].text, /NotebookEdit/);
});

test('mapToolList handles arrays, comma strings, Bash(prefix) and mcp__ names', () => {
  assert.deepEqual(mapToolList(['Read', 'Edit', 'MultiEdit', 'Bash(git:*)', 'mcp__x__y']), { tools: ['view_file', 'replace_file_content', 'run_command'], unmapped: ['mcp__x__y'] });
  assert.deepEqual(mapToolList('Read, Grep, LS'), { tools: ['view_file', 'grep_search', 'list_dir'], unmapped: [] });
  assert.deepEqual(mapToolList('view_file'), { tools: ['view_file'], unmapped: [] });
});

test('mapMatcher maps each alternative', () => {
  assert.equal(mapMatcher('Edit|Write|MultiEdit'), 'replace_file_content|write_to_file');
  assert.equal(mapMatcher('Bash'), 'run_command');
  assert.equal(mapMatcher(''), '');
  assert.equal(MAP.Agent, 'invoke_subagent');
});
