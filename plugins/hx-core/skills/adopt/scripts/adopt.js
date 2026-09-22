#!/usr/bin/env node
'use strict';
// Adopt a Claude Code project harness into agy files. See ../SKILL.md and lib/adopt/index.js.
// Exit: 0 done, 1 unexpected error, 2 usage, 3 no Claude Code files found.
const { parseArgs } = require('../../../lib/cli');
const { runAdopt, formatReport, hasSources, KINDS } = require('../../../lib/adopt');

const USAGE = `node adopt.js [--root <dir>] [--apply] [--force] [--only <kinds>] [--json]\n  kinds: ${KINDS.join(',')}`;
const args = parseArgs(process.argv.slice(2), { flags: ['json', 'apply', 'force'], valueFlags: ['only'], usage: USAGE });
const only = args.only ? String(args.only).split(',').map((s) => s.trim()).filter(Boolean) : null;
if (only && only.some((k) => !KINDS.includes(k))) {
  process.stderr.write(`unknown --only kind: ${only.filter((k) => !KINDS.includes(k)).join(', ')}\nusage: ${USAGE}\n`);
  process.exit(2);
}

try {
  const r = runAdopt(args.root, { apply: args.apply, force: args.force, only });
  if (!hasSources(r.sources)) {
    process.stderr.write('adopt: no Claude Code files found (CLAUDE.md, .claude/, .mcp.json, auto-memory). Nothing to adopt.\n');
    process.exit(3);
  }
  process.stdout.write((args.json ? JSON.stringify(r, null, 2) : formatReport(r)) + '\n');
  process.exit(0);
} catch (err) {
  process.stderr.write(`adopt failed: ${err.stack || err}\n`);
  process.exit(1);
}
