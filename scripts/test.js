#!/usr/bin/env node
'use strict';
// Run every `__tests__/*.test.js` under plugins/ with node --test (Node >= 18, no dependencies, any OS).
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const { ROOT } = require('./lib');

function testFiles(dir, out = []) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) {
      if (d.name === 'node_modules' || d.name.startsWith('.')) continue;
      if (d.name === '__tests__') out.push(...fs.readdirSync(p).filter((f) => f.endsWith('.test.js')).map((f) => path.join(p, f)));
      else testFiles(p, out);
    }
  }
  return out;
}

const filter = process.argv[2]; // optional plugin name, e.g. hx-core
const files = testFiles(path.join(ROOT, 'plugins')).filter((f) => !filter || f.includes(`${path.sep}${filter}${path.sep}`)).sort();
if (!files.length) { console.error('no test files found'); process.exit(1); }
const r = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit', cwd: ROOT });
process.exit(r.status === null ? 1 : r.status);
