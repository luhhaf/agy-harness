'use strict';
// Scaffold the standard hx harness inside a project. Pure function of the
// filesystem: creates only missing files, never edits a user's root AGENTS.md.
const path = require('path');
const fs = require('fs');
const { detect } = require('./detect');
const { TEMPLATES, fillsIn } = require('./templates');
const { exists, readJson, writeText, stateIgnored, appendGitignore } = require('./fs');

const VERSION = require('../plugin.json').version;
const MANIFEST = '.agents/harness.json';
const GENERATED = TEMPLATES.map(([rel]) => rel);
const NEVER_FORCE = new Set(['AGENTS.md']);

function projectName(root) {
  const pkg = readJson(path.join(root, 'package.json'));
  return (pkg.value && typeof pkg.value.name === 'string' && pkg.value.name) || path.basename(root);
}

/**
 * @param {string} root absolute project root
 * @param {{dryRun?: boolean, force?: boolean}} opts
 * @returns {{root, stack, checks, created: string[], skipped: string[], fills: {file, hint}[], notes: string[]}}
 */
function runSetup(root, opts = {}) {
  root = path.resolve(root);
  const stack = detect(root);
  const name = projectName(root);
  const report = { root, stack, checks: stack.checks, created: [], skipped: [], fills: [], notes: [...(stack.notes || [])] };
  const previous = readJson(path.join(root, MANIFEST));
  const previouslyGenerated = new Set((previous.value && previous.value.generated) || []);

  for (const [rel, render, when] of TEMPLATES) {
    if (when && !when(stack)) continue;
    const abs = path.join(root, rel);
    const present = exists(abs);
    const canForce = opts.force && !NEVER_FORCE.has(rel) && (previouslyGenerated.has(rel) || !present);
    if (present && !canForce) {
      report.skipped.push(rel);
      if (rel === 'AGENTS.md') report.notes.push('AGENTS.md already exists and was left untouched; make sure it has a "Build and test" section with the exact commands.');
      continue;
    }
    const text = render(stack, name);
    if (!opts.dryRun) writeText(abs, text);
    report.created.push(rel);
    for (const hint of fillsIn(text)) report.fills.push({ file: rel, hint });
  }

  if (opts.dryRun) {
    if (!exists(path.join(root, MANIFEST))) report.created.push(MANIFEST);
    return report;
  }
  fs.mkdirSync(path.join(root, '.agents', 'state'), { recursive: true });
  if (!stateIgnored(root)) appendGitignore(root, '.agents/state/');
  writeManifest(root, stack, report, previous.value);
  return report;
}

function writeManifest(root, stack, report, previous) {
  const generated = new Set([...(previous ? previous.generated || [] : []), ...report.created]);
  generated.delete(MANIFEST);
  const manifest = {
    harness: 'hx',
    version: VERSION,
    createdAt: (previous && previous.createdAt) || new Date().toISOString().slice(0, 10),
    stack: { kind: stack.kind, packageManager: stack.packageManager, typescript: stack.typescript, workspaces: stack.workspaces },
    checks: stack.checks,
    generated: GENERATED.filter((g) => generated.has(g)),
  };
  const abs = path.join(root, MANIFEST);
  const fresh = !exists(abs);
  writeText(abs, JSON.stringify(manifest, null, 2) + '\n');
  if (fresh) report.created.push(MANIFEST);
}

module.exports = { runSetup, GENERATED, MANIFEST, VERSION };
