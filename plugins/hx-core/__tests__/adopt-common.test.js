'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { tmpProject } = require('./helpers');
const { sha256, splitDoc, renderFrontmatter, walk, item } = require('../lib/adopt/common');
const { frontmatter } = require('../lib/fs');

test('sha256 is stable and prefixed', () => {
  assert.equal(sha256('abc'), sha256(Buffer.from('abc')));
  assert.match(sha256('abc'), /^sha256:[0-9a-f]{64}$/);
});

test('splitDoc separates frontmatter and body; no frontmatter → fm null', () => {
  const d = splitDoc('---\nname: x\ndescription: hi\n---\n# Body\ntext\n');
  assert.deepEqual(d.fm, { name: 'x', description: 'hi' });
  assert.equal(d.body, '# Body\ntext\n');
  assert.deepEqual(splitDoc('just text'), { fm: null, body: 'just text' });
});

test('renderFrontmatter round-trips through fs.frontmatter', () => {
  const fm = { name: 'deploy', description: 'Deploy the app when the user says ship or deploy.', tools: ['view_file', 'run_command'], subagent: true, model: 'pro', globs: ['**/*.ts'] };
  const text = renderFrontmatter(fm);
  assert.ok(text.startsWith('---\n') && text.endsWith('---\n'));
  const back = frontmatter(text + 'body');
  assert.equal(back.name, 'deploy');
  assert.equal(back.description, fm.description);
  assert.deepEqual(back.tools, ['view_file', 'run_command']);
  assert.equal(back.subagent, 'true');
  assert.deepEqual(back.globs, ['**/*.ts']);
});

test('renderFrontmatter folds long descriptions and skips undefined', () => {
  const long = 'a'.repeat(50) + ' ' + 'b'.repeat(50) + ' ' + 'c'.repeat(30);
  const text = renderFrontmatter({ name: 'x', description: long, extra: undefined });
  assert.match(text, /description: >-\n  a+\n  b+/);
  assert.equal(frontmatter(text + 'x').description, long);
  assert.ok(!/extra/.test(text));
});

test('walk lists files recursively with / separators, sorted', () => {
  const root = tmpProject({ 'a/b/c.txt': '1', 'a/d.txt': '2', 'e.md': '3' });
  assert.deepEqual(walk(root), ['a/b/c.txt', 'a/d.txt', 'e.md']);
  assert.deepEqual(walk(path.join(root, 'nope')), []);
});

test('item fills defaults', () => {
  const it = item({ kind: 'k', source: 's', target: 't' });
  assert.deepEqual(it, { kind: 'k', source: 's', target: 't', status: 'auto', reason: '', leftovers: [], content: null });
});
