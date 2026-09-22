'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { frontmatter, stateIgnored, appendGitignore } = require('../lib/fs');
const { tmpProject } = require('./helpers');

test('frontmatter parses scalars, inline lists, block lists and folded strings', () => {
  const fm = frontmatter(`---
name: reviewer
description: >-
  Reviews a diff
  for bugs.
tools: [view_file, "grep_search"]
globs:
  - "**/*.ts"
  - '**/*.tsx'
trigger: glob
---
# body`);
  assert.equal(fm.name, 'reviewer');
  assert.equal(fm.description, 'Reviews a diff for bugs.');
  assert.deepEqual(fm.tools, ['view_file', 'grep_search']);
  assert.deepEqual(fm.globs, ['**/*.ts', '**/*.tsx']);
  assert.equal(fm.trigger, 'glob');
});

test('frontmatter returns null when the file has none', () => {
  assert.equal(frontmatter('# just markdown\n---\nnot frontmatter'), null);
});

test('stateIgnored accepts the common spellings and appendGitignore adds a line', () => {
  assert.equal(stateIgnored(tmpProject({ '.gitignore': 'node_modules\n.agents/state/\n' })), true);
  assert.equal(stateIgnored(tmpProject({ '.gitignore': '/.agents/state' })), true);
  assert.equal(stateIgnored(tmpProject({ '.gitignore': 'node_modules' })), false);
  const root = tmpProject({ '.gitignore': 'node_modules' });
  appendGitignore(root, '.agents/state/');
  assert.equal(stateIgnored(root), true);
  const fresh = tmpProject({});
  appendGitignore(fresh, '.agents/state/');
  assert.equal(stateIgnored(fresh), true);
});
