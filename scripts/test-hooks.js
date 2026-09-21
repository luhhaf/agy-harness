#!/usr/bin/env node
'use strict';
// Unit + contract tests for hx-guard hooks (Node >= 18, no dependencies, any OS).
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const { ROOT } = require('./lib');
const dir = path.join(ROOT, 'plugins', 'hx-guard', 'hooks', '__tests__');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.test.js')).map((f) => path.join(dir, f));
const r = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit', cwd: ROOT });
process.exit(r.status === null ? 1 : r.status);
