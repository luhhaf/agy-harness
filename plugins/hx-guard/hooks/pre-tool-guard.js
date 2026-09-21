#!/usr/bin/env node
'use strict';
// PreToolUse hook for run_command: deny or ask for dangerous commands.
// stdin:  { toolCall: { name, args: { CommandLine } }, ... }
// stdout: { decision: "allow"|"deny"|"ask", reason? }
const path = require('path');
const { run, readJsonIfExists, log } = require('./lib');

const PATTERNS = readJsonIfExists(path.join(__dirname, 'patterns.json')) || { deny: [], ask: [] };

function commandOf(input) {
  const args = (input.toolCall && input.toolCall.args) || {};
  // agy uses CommandLine; be tolerant to other casings.
  return String(args.CommandLine || args.commandLine || args.command || '');
}

function match(list, cmd) {
  for (const p of list) {
    try {
      if (new RegExp(p.regex, 'i').test(cmd)) return p;
    } catch (err) {
      log(`bad regex ${p.id}: ${err.message}`);
    }
  }
  return null;
}

// Commands that only print/search: text inside quotes is data, not a command.
const READ_ONLY_HEADS = new Set(['grep', 'rg', 'ag', 'echo', 'printf', 'cat', 'head', 'tail', 'less', 'wc', 'ls']);

/** For read-only commands, drop quoted strings so `grep "rm -rf"` is not flagged. */
function normalize(cmd) {
  const head = (cmd.trim().split(/\s+/)[0] || '').split('/').pop();
  if (!READ_ONLY_HEADS.has(head)) return cmd;
  return cmd.replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, '""');
}

/** Pure decision function, exported for tests. */
function decide(rawCmd, patterns = PATTERNS) {
  if (!rawCmd.trim()) return { decision: 'allow' };
  const cmd = normalize(rawCmd);
  const deny = match(patterns.deny || [], cmd);
  if (deny) return { decision: 'deny', reason: `[hx-guard:${deny.id}] ${deny.reason}` };
  const ask = match(patterns.ask || [], cmd);
  if (ask) return { decision: 'ask', reason: `[hx-guard:${ask.id}] ${ask.reason}` };
  return { decision: 'allow' };
}

if (require.main === module) {
  run((input) => decide(commandOf(input)), { decision: 'allow' });
}

module.exports = { decide, commandOf, normalize };
