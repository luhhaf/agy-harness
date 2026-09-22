'use strict';
// Claude Code permissions (allow/deny/ask) -> advice only; agy keeps its own permission store.
const path = require('path');
const { readJson } = require('../fs');
const { item } = require('./common');

const kind = 'permission';
const LISTS = ['allow', 'deny', 'ask'];

function summarise(list, entries) {
  const bash = [];
  const other = [];
  for (const e of entries) {
    const m = /^Bash\((.*)\)$/.exec(String(e));
    if (m) bash.push(m[1]); else other.push(String(e));
  }
  const parts = [];
  if (bash.length) {
    parts.push(list === 'deny'
      ? `add as deny patterns to hx-guard patterns.json or a project PreToolUse hook: ${bash.join(', ')}`
      : `${list} these command prefixes in agy settings.json / /permissions: ${bash.join(', ')}`);
  }
  if (other.length) parts.push(`directory/domain scopes are set in agy /permissions: ${other.join(', ')}`);
  return parts.join('; ');
}

function scan(root) {
  const s = readJson(path.join(root, '.claude', 'settings.json'));
  const perms = s.value && s.value.permissions;
  if (!perms || typeof perms !== 'object') return [];
  const out = [];
  for (const list of LISTS) {
    const entries = Array.isArray(perms[list]) ? perms[list] : [];
    if (!entries.length) continue;
    out.push(item({ kind, source: `.claude/settings.json#permissions/${list}`, target: '', status: 'unsupported', reason: summarise(list, entries) }));
  }
  return out;
}

module.exports = { kind, scan };
