#!/usr/bin/env node
'use strict';
// End-to-end checks against a real agy install (any OS).
//   node scripts/e2e.js          free: skill + hook discovery via print-mode slash commands
//   node scripts/e2e.js --full   + 3 real model turns (uses quota)
// The harness must be registered globally (install.js) or installed with `agy plugin install`,
// because print mode does not load workspace plugins.
const { requireCmd, agyJson } = require('./lib');
requireCmd('agy');
const FULL = process.argv.includes('--full');
let fail = 0;
const ok = (m) => console.log(`  ok   ${m}`);
const bad = (m) => { console.log(`  FAIL ${m}`); fail++; };

console.log('== skills discovered ==');
const sk = agyJson('/skills');
const skills = new Set(((sk && sk.command && sk.command.data && sk.command.data.skills) || []).map((s) => s.name));
for (const s of ['hx-core:using-harness', 'hx-core:notepad', 'hx-core:handoff', 'hx-core:setup', 'hx-core:doctor', 'hx-workflows:brainstorm', 'hx-workflows:plan',
  'hx-workflows:tdd', 'hx-workflows:debug', 'hx-workflows:review', 'hx-workflows:verify', 'hx-workflows:ship']) {
  skills.has(s) ? ok(s) : bad(`missing ${s}`);
}

console.log('== hooks discovered ==');
const hk = agyJson('/hooks');
const hooks = new Set(((hk && hk.command && hk.command.data && hk.command.data.hooks) || []).map((h) => h.name));
for (const h of ['hx-pre-tool-guard', 'hx-post-tool-lint', 'hx-pre-invocation-context', 'hx-stop-gate']) {
  hooks.has(h) ? ok(h) : bad(`missing ${h}`);
}

if (FULL) {
  const turn = (prompt, t = '240s') => ((agyJson(prompt, ['--print-timeout', t]) || {}).response || '');
  console.log('== full: skill content loads (1 model turn) ==');
  turn('/hx-core:using-harness Do not use tools. Quote exactly the table row for "create a todo / task list".').includes('ArtifactType')
    ? ok('skill body injected') : bad('skill body not injected');
  console.log('== full: deny hook blocks a matching command (1 model turn) ==');
  turn('Run exactly this harmless command and report the result verbatim: dd if=/dev/zero of=/dev/null bs=1 count=1').includes('hx-guard:dd-disk')
    ? ok('pre-tool-guard denied') : bad('pre-tool-guard did not deny');
  console.log('== full: explorer subagent constructs and answers (1 model turn) ==');
  turn("Use invoke_subagent with TypeName 'explorer' and task: 'List the path of every plugin.json in this repository.' Report its answer verbatim.").includes('hx-guard')
    ? ok('explorer answered') : bad('explorer');
}
console.log(fail ? 'E2E FAILED' : 'E2E OK');
process.exit(fail ? 1 : 0);
