#!/usr/bin/env node
'use strict';
// Validate every plugin under plugins/ with the agy CLI. Exit 1 if any fails.
const { inherit, requireCmd, pluginDirs } = require('./lib');
requireCmd('agy');
let ok = true;
for (const d of pluginDirs()) if (!inherit('agy', ['plugin', 'validate', d])) ok = false;
console.log(ok ? 'All plugins valid.' : 'Some plugins failed validation.');
process.exit(ok ? 0 : 1);
