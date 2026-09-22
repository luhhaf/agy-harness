#!/usr/bin/env node
'use strict';
// Scaffold the hx harness in a project. See ../SKILL.md and lib/setup.js.
const path = require('path');
const { parseArgs } = require('../../../lib/cli');
const { runSetup } = require('../../../lib/setup');

const args = parseArgs(process.argv.slice(2), {
  flags: ['json', 'dry-run', 'force'],
  usage: 'node setup.js [--root <dir>] [--dry-run] [--force] [--json]',
});

try {
  const r = runSetup(args.root, { dryRun: args.dryRun, force: args.force });
  if (args.json) {
    process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  } else {
    const lines = [`hx setup — ${path.basename(r.root)} (${r.stack.kind}${r.stack.packageManager ? ', ' + r.stack.packageManager : ''})${args.dryRun ? ' [dry-run]' : ''}`];
    lines.push(`checks: ${r.checks.length ? r.checks.join(' · ') : '(none detected — fill by hand)'}`);
    lines.push(`created (${r.created.length}): ${r.created.join(', ') || '-'}`);
    lines.push(`skipped (${r.skipped.length}): ${r.skipped.join(', ') || '-'}`);
    if (r.fills.length) {
      lines.push(`to fill (${r.fills.length} hx:fill placeholders):`);
      for (const f of r.fills) lines.push(`  - ${f.file}: ${f.hint}`);
    }
    for (const n of r.notes) lines.push(`note: ${n}`);
    process.stdout.write(lines.join('\n') + '\n');
  }
} catch (err) {
  process.stderr.write(`setup failed: ${err.stack || err}\n`);
  process.exit(1);
}
