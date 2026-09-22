#!/usr/bin/env node
'use strict';
// Check a project's hx harness. Exit 0 = no errors, 1 = errors, 2 = usage.
const { parseArgs } = require('../../../lib/cli');
const { runDoctor, formatReport } = require('../../../lib/doctor');

const args = parseArgs(process.argv.slice(2), {
  flags: ['json', 'fix'],
  usage: 'node doctor.js [--root <dir>] [--fix] [--json]',
});

try {
  const r = runDoctor(args.root, { fix: args.fix });
  process.stdout.write((args.json ? JSON.stringify(r, null, 2) : formatReport(r)) + '\n');
  process.exit(r.ok ? 0 : 1);
} catch (err) {
  process.stderr.write(`doctor failed: ${err.stack || err}\n`);
  process.exit(1);
}
