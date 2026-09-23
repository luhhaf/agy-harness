'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { tmpProject, writeFiles } = require('./helpers');
const mcp = require('../lib/adopt/mcp');
const memory = require('../lib/adopt/memory');
const toolmap = require('../lib/adopt/toolmap');

const ctx = (home) => ({ home: home || tmpProject({}), toolmap, registry: require('../lib/registry.json') });

test('mcp: copies mcpServers verbatim and notes ${VAR}', () => {
  const root = tmpProject({ '.mcp.json': { mcpServers: { db: { command: 'npx', args: ['db-mcp'], env: { KEY: '${DB_KEY}' } } } } });
  const [it] = mcp.scan(root, ctx());
  assert.equal(it.kind, 'mcp');
  assert.equal(it.target, '.agents/mcp_config.json');
  assert.deepEqual(JSON.parse(it.content), { mcpServers: { db: { command: 'npx', args: ['db-mcp'], env: { KEY: '${DB_KEY}' } } } });
  assert.equal(it.status, 'auto');
  assert.match(it.reason, /\$\{VAR\}/);
});

test('mcp: invalid JSON or no mcpServers → unsupported; absent → []', () => {
  assert.deepEqual(mcp.scan(tmpProject({}), ctx()), []);
  const [bad] = mcp.scan(tmpProject({ '.mcp.json': '{nope' }), ctx());
  assert.equal(bad.status, 'unsupported');
  const [empty] = mcp.scan(tmpProject({ '.mcp.json': { servers: {} } }), ctx());
  assert.equal(empty.status, 'unsupported');
  const [arr] = mcp.scan(tmpProject({ '.mcp.json': { mcpServers: [] } }), ctx());
  assert.equal(arr.status, 'unsupported');
});

test('mcp: invalid JSON with ${VAR} notes both errors', () => {
  const [bad] = mcp.scan(tmpProject({ '.mcp.json': '{nope ${DB_KEY}' }), ctx());
  assert.equal(bad.status, 'unsupported');
  assert.match(bad.reason, /not valid JSON/);
  assert.match(bad.reason, /\$\{VAR\}/);
});

function memoryHome(root, files) {
  const home = tmpProject({});
  const slug = path.resolve(root).replace(/[\\/]/g, '-');
  writeFiles(home, Object.fromEntries(Object.entries(files).map(([k, v]) => [`.claude/projects/${slug}/memory/${k}`, v])));
  return home;
}

test('memory: one line per memory under a marked block in Decisions; MEMORY.md skipped; secrets dropped', () => {
  const root = tmpProject({});
  const home = memoryHome(root, {
    'MEMORY.md': '- index\n',
    'goal.md': '---\nname: goal\ndescription: repo is a harness\nmetadata:\n  type: project\n---\nbody\n',
    'key.md': '---\nname: key\ndescription: api_key: sk-abcdefghijklmnopqrstuvwxyz\nmetadata:\n  type: reference\n---\n',
  });
  const [it] = memory.scan(root, ctx(home));
  assert.equal(it.kind, 'memory');
  assert.equal(it.target, '.agents/state/notepad.md');
  assert.equal(it.track, false);
  assert.match(it.content, /^# Notepad/);
  assert.match(it.content, /## Decisions\n<!-- hx:adopted-memory -->\n- \d{4}-\d{2}-\d{2} — \[project\] goal: repo is a harness\n<!-- \/hx:adopted-memory -->/);
  assert.ok(!/sk-abc/.test(it.content));
  assert.match(it.reason, /1 line\(s\) with secrets dropped/);
});

test('memory: rerun replaces the block and keeps the rest of the notepad', () => {
  const root = tmpProject({ '.agents/state/notepad.md': '# Notepad\n\n## Priority\nkeep me\n\n## Decisions\n<!-- hx:adopted-memory -->\n- old\n<!-- /hx:adopted-memory -->\n- 2026-01-01 — manual line\n' });
  const home = memoryHome(root, { 'a.md': '---\nname: a\ndescription: new\nmetadata:\n  type: feedback\n---\n' });
  const [it] = memory.scan(root, ctx(home));
  assert.match(it.content, /keep me/);
  assert.match(it.content, /manual line/);
  assert.ok(!/- old/.test(it.content));
  assert.match(it.content, /\[feedback\] a: new/);
});

test('memory: no memory dir → []', () => {
  assert.deepEqual(memory.scan(tmpProject({}), ctx()), []);
});
