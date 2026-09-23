'use strict';
// Tiny argv parser shared by the setup and doctor scripts.
const path = require('path');
const fs = require('fs');

/**
 * @param {string[]} argv
 * @param {{flags: string[], valueFlags?: string[], usage: string}} spec  flags without the leading --
 * @returns {{root: string, [flag: string]: boolean}} exits 2 on bad input
 */
function parseArgs(argv, spec) {
  const out = { root: process.cwd() };
  const valueFlags = spec.valueFlags || [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root') {
      out.root = path.resolve(argv[++i] || '');
      continue;
    }
    if (a === '-h' || a === '--help') usage(spec, 0);
    const flag = a.startsWith('--') ? a.slice(2) : null;
    if (flag && valueFlags.includes(flag)) {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) usage(spec, 2, `--${flag} needs a value`);
      out[camel(flag)] = v;
      continue;
    }
    if (!flag || !spec.flags.includes(flag)) usage(spec, 2, `unknown argument: ${a}`);
    out[camel(flag)] = true;
  }
  if (!fs.existsSync(out.root) || !fs.statSync(out.root).isDirectory()) usage(spec, 2, `not a directory: ${out.root}`);
  return out;
}

function camel(s) {
  return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function usage(spec, code, msg) {
  const out = code === 0 ? process.stdout : process.stderr;
  if (msg) out.write(`${msg}\n`);
  out.write(`usage: ${spec.usage}\n`);
  process.exit(code);
}

module.exports = { parseArgs };
