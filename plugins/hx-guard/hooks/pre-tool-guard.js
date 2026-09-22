#!/usr/bin/env node
'use strict';
// PreToolUse hook: deny or ask for dangerous commands (run_command) and protect
// the harness evidence files from hand edits (write tools).
// stdin:  { toolCall: { name, args: { CommandLine | TargetFile, ... } }, ... }
// stdout: { decision: "allow"|"deny"|"ask", reason? }
const path = require('path');
const { run, readJsonIfExists, log } = require('./lib');

const PATTERNS = readJsonIfExists(path.join(__dirname, 'patterns.json')) || { deny: [], ask: [] };
const WRITE_TOOLS = new Set(['write_to_file', 'replace_file_content', 'multi_replace_file_content']);

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

/** Pure decision for run_command, exported for tests. */
function decide(rawCmd, patterns = PATTERNS) {
  if (!rawCmd.trim()) return { decision: 'allow' };
  const cmd = normalize(rawCmd);
  const deny = match(patterns.deny || [], cmd);
  if (deny) return { decision: 'deny', reason: `[hx-guard:${deny.id}] ${deny.reason}` };
  const ask = match(patterns.ask || [], cmd);
  if (ask) return { decision: 'ask', reason: `[hx-guard:${ask.id}] ${ask.reason}` };
  return { decision: 'allow' };
}

/** Every string value in the tool args except the target path (content to be written). */
function contentOf(args) {
  const out = [];
  (function walk(v) {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (k !== 'TargetFile') walk(x);
  })(args);
  return out.join('\n');
}

const STATE_FILE = (name) => new RegExp(`[\\\\/]\\.agents[\\\\/]state[\\\\/]${name}$`, 'i');

/**
 * Pure decision for file-writing tools, exported for tests.
 * - .agents/state/verify.json is evidence: only the verify script writes it.
 * - .agents/state/goal.json may be written, but never with "done": true.
 */
function decideWrite(args) {
  const target = String((args && args.TargetFile) || '');
  if (!target) return { decision: 'allow' };
  if (STATE_FILE('verify\\.json').test(target)) {
    return { decision: 'deny', reason: '[hx-guard:verify-evidence] verify.json is written only by the verify script (/hx-workflows:verify). Run the checks instead of editing the evidence.' };
  }
  if (STATE_FILE('goal\\.json').test(target) && /"done"\s*:\s*true/.test(contentOf(args))) {
    return { decision: 'deny', reason: '[hx-guard:goal-done] "done": true is set by the verify script after the checks pass, not by hand. Run /hx-workflows:verify. If you are blocked, set "active": false and tell the user why.' };
  }
  return { decision: 'allow' };
}

/** Route by tool name. Exported for tests. */
function decideTool(toolCall) {
  const name = (toolCall && toolCall.name) || '';
  const args = (toolCall && toolCall.args) || {};
  if (WRITE_TOOLS.has(name)) return decideWrite(args);
  return decide(commandOf({ toolCall }));
}

if (require.main === module) {
  run((input) => decideTool(input.toolCall), { decision: 'allow' });
}

module.exports = { decide, decideWrite, decideTool, commandOf, normalize };
