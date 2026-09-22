#!/usr/bin/env node
'use strict';
// Kept for compatibility: runs only the hx-guard hook tests. Use scripts/test.js for everything.
const { spawnSync } = require('child_process');
const path = require('path');
const r = spawnSync(process.execPath, [path.join(__dirname, 'test.js'), 'hx-guard'], { stdio: 'inherit' });
process.exit(r.status === null ? 1 : r.status);
