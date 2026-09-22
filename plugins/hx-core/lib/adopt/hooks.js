'use strict';
// Claude Code hooks cannot be converted (different events, payload, stdout contract).
// Each one is classified and mapped to the hx-guard / setup piece that replaces it.
const path = require('path');
const { readJson } = require('../fs');
const { item } = require('./common');

const kind = 'hook';
const NONE = ['PreCompact', 'Notification', 'SessionEnd', 'PermissionRequest'];

/** Reason text for one Claude hook. Exported for tests. */
function classify(event, matcher, hook, toolmap) {
  if (hook.type && hook.type !== 'command') return 'agy hooks are command-only; rewrite this prompt/agent hook as a rule or skill';
  const cmd = String(hook.command || '');
  const m = String(matcher || '');
  if (event === 'PreToolUse' && /Bash/.test(m) && /rm|force|guard|deny|danger|block/i.test(cmd)) {
    return 'hx-guard pre-tool-guard covers dangerous-command blocking; add custom patterns to hx-guard/hooks/patterns.json';
  }
  if (event === 'PostToolUse' && /Edit|Write/.test(m) && /prettier|eslint|lint|format|ruff|gofmt|black|biome/i.test(cmd)) {
    return '/hx-core:setup generates .agents/hooks/post-edit-lint.js (per-file linter after edits)';
  }
  if (event === 'Stop' || event === 'SubagentStop') {
    return 'hx-guard stop-gate replaces this (goal/verify evidence); agy Stop hook contract: stdin {terminationReason, fullyIdle}, stdout {decision, reason}';
  }
  if (event === 'SessionStart' || event === 'UserPromptSubmit') {
    return 'agy PreInvocation injectSteps replaces this; hx-guard pre-invocation-context injects notepad/goal/lint each turn';
  }
  if (NONE.includes(event)) return `no agy equivalent for ${event}`;
  if (event === 'PreToolUse' || event === 'PostToolUse') {
    return `rewrite as agy ${event} hook in .agents/hooks.json: matcher "${toolmap.mapMatcher(m)}", stdin JSON camelCase, stdout JSON, exit 0, <= 10 s`;
  }
  return `no agy equivalent for ${event}`;
}

function scan(root, ctx) {
  const s = readJson(path.join(root, '.claude', 'settings.json'));
  const hooks = s.value && s.value.hooks;
  if (!hooks || typeof hooks !== 'object') return [];
  const out = [];
  for (const [event, entries] of Object.entries(hooks)) {
    (Array.isArray(entries) ? entries : []).forEach((entry, i) => {
      const list = Array.isArray(entry.hooks) ? entry.hooks : [entry];
      list.forEach((hook, j) => {
        const label = `${event}[${i}]${list.length > 1 ? `/${j}` : ''}`;
        out.push(item({ kind, source: `.claude/settings.json#hooks/${label}`, target: '', status: 'unsupported', reason: classify(event, entry.matcher, hook || {}, ctx.toolmap) }));
      });
    });
  }
  return out;
}

module.exports = { kind, scan, classify };
