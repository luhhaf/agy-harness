'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { tmpProject } = require('./helpers');
const hooks = require('../lib/adopt/hooks');
const permissions = require('../lib/adopt/permissions');
const toolmap = require('../lib/adopt/toolmap');

const ctx = () => ({ home: tmpProject({}), toolmap, registry: require('../lib/registry.json') });

test('hooks: every command becomes an unsupported item with a targeted reason', () => {
  const root = tmpProject({
    '.claude/settings.json': {
      hooks: {
        PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node .claude/hooks/guard.js  # deny rm -rf' }] }],
        PostToolUse: [{ matcher: 'Edit|Write', hooks: [{ type: 'command', command: 'npx prettier --write $FILE' }, { type: 'command', command: 'node .claude/hooks/custom.js' }] }],
        Stop: [{ hooks: [{ type: 'command', command: './stop.sh' }] }],
        SessionStart: [{ hooks: [{ type: 'command', command: 'echo hi' }] }],
        PreCompact: [{ hooks: [{ type: 'command', command: 'x' }] }],
        UserPromptSubmit: [{ hooks: [{ type: 'prompt', prompt: 'be nice' }] }],
      },
    },
  });
  const items = hooks.scan(root, ctx());
  assert.equal(items.length, 7);
  for (const it of items) { assert.equal(it.kind, 'hook'); assert.equal(it.status, 'unsupported'); assert.equal(it.target, ''); assert.equal(it.content, null); }
  const by = (re) => items.find((i) => re.test(i.source));
  assert.match(by(/PreToolUse\[0\]/).reason, /hx-guard pre-tool-guard/);
  assert.match(by(/PostToolUse\[0\]\/0/).reason, /post-edit-lint/);
  assert.match(by(/PostToolUse\[0\]\/1/).reason, /rewrite as agy PostToolUse hook.*replace_file_content\|write_to_file/);
  assert.match(by(/Stop/).reason, /stop-gate/);
  assert.match(by(/SessionStart/).reason, /PreInvocation/);
  assert.match(by(/PreCompact/).reason, /no agy equivalent/);
  assert.match(by(/UserPromptSubmit/).reason, /command-only/);
});

test('hooks: no settings or no hooks → []', () => {
  assert.deepEqual(hooks.scan(tmpProject({}), ctx()), []);
  assert.deepEqual(hooks.scan(tmpProject({ '.claude/settings.json': { permissions: {} } }), ctx()), []);
});

test('permissions: one item per non-empty list, with Bash prefixes summarised', () => {
  const root = tmpProject({
    '.claude/settings.json': { permissions: { allow: ['Bash(npm test:*)', 'Bash(git status)', 'Read(~/.zshrc)', 'WebFetch(domain:example.com)'], deny: ['Bash(rm -rf:*)'], ask: [] } },
  });
  const items = permissions.scan(root, ctx());
  assert.deepEqual(items.map((i) => i.source), ['.claude/settings.json#permissions/allow', '.claude/settings.json#permissions/deny']);
  assert.equal(items[0].kind, 'permission');
  assert.equal(items[0].status, 'unsupported');
  assert.match(items[0].reason, /allow these command prefixes in agy settings\.json \/ \/permissions: npm test:\*, git status/);
  assert.match(items[0].reason, /directory\/domain scopes.*Read\(~\/\.zshrc\), WebFetch\(domain:example\.com\)/);
  assert.match(items[1].reason, /deny patterns.*hx-guard patterns\.json.*rm -rf:\*/);
});
