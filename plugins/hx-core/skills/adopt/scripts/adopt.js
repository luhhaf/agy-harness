#!/usr/bin/env node
'use strict';
// Adopt a Claude Code project harness into agy files. See ../SKILL.md and lib/adopt/index.js.
// Exit: 0 done, 1 unexpected error, 2 usage, 3 no Claude Code files found.
const { parseArgs } = require('../../../lib/cli');
const { runAdopt, formatReport, hasSources, countSources, KINDS } = require('../../../lib/adopt');

const USAGE = `node adopt.js [--root <dir>] [--apply] [--force] [--only <kinds>] [--json]\n  kinds: ${KINDS.join(',')}`;
const args = parseArgs(process.argv.slice(2), { flags: ['json', 'apply', 'force'], valueFlags: ['only'], usage: USAGE });
const only = args.only !== undefined ? String(args.only).split(',').map((s) => s.trim()).filter(Boolean) : null;
if (only && only.length === 0) {
  process.stderr.write(`--only requires at least one kind\nusage: ${USAGE}\n`);
  process.exit(2);
}
if (only && only.some((k) => !KINDS.includes(k))) {
  process.stderr.write(`unknown --only kind: ${only.filter((k) => !KINDS.includes(k)).join(', ')}\nusage: ${USAGE}\n`);
  process.exit(2);
}
// Deduplicate kinds
const onlyDedup = only ? [...new Set(only)] : null;

try {
  // Check for sources FIRST before calling runAdopt to avoid filesystem mutations
  const sources = countSources(args.root);
  if (!hasSources(sources)) {
    process.stderr.write('adopt: no Claude Code files found (CLAUDE.md, .claude/, .mcp.json, auto-memory). Nothing to adopt.\n');
    process.exit(3);
  }
  const r = runAdopt(args.root, { apply: args.apply, force: args.force, only: onlyDedup });
  process.stdout.write((args.json ? JSON.stringify(r, null, 2) : formatReport(r)) + '\n');
  process.exit(0);
} catch (err) {
  process.stderr.write(`adopt failed: ${err.stack || err}\n`);
  process.exit(1);
}
