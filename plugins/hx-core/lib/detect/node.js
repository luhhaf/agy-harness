'use strict';
// Node.js stack detector: package manager, scripts, TypeScript, eslint, workspaces.
const path = require('path');
const { exists, readJson } = require('../fs');

const LOCKFILES = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lockb', 'bun'],
  ['bun.lock', 'bun'],
  ['package-lock.json', 'npm'],
];
const ESLINT_FILES = ['eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', 'eslint.config.ts',
  '.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json', '.eslintrc.yml', '.eslintrc.yaml'];
// Order matters: cheap and fast checks first.
const CHECK_SCRIPTS = [['typecheck', 'type-check'], ['lint'], ['test'], ['build']];
const NPM_DEFAULT_TEST = /no test specified/;

function detectNode(root) {
  const pkgPath = path.join(root, 'package.json');
  if (!exists(pkgPath)) return null;
  const notes = [];
  const pkg = readJson(pkgPath);
  if (pkg.error) notes.push(`package.json could not be parsed (${pkg.error}); fill the commands by hand`);
  const scripts = (pkg.value && pkg.value.scripts) || {};
  const packageManager = (LOCKFILES.find(([f]) => exists(path.join(root, f))) || [null, 'npm'])[1];
  const checks = [];
  for (const aliases of CHECK_SCRIPTS) {
    const name = aliases.find((a) => typeof scripts[a] === 'string');
    if (!name) continue;
    if (name === 'test' && NPM_DEFAULT_TEST.test(scripts[name])) continue;
    checks.push(name === 'test' ? `${packageManager} test` : `${packageManager} run ${name}`);
  }
  const eslint = ESLINT_FILES.some((f) => exists(path.join(root, f))) || Boolean(pkg.value && pkg.value.eslintConfig);
  return {
    kind: 'node',
    packageManager,
    typescript: exists(path.join(root, 'tsconfig.json')),
    eslint,
    workspaces: Boolean(pkg.value && pkg.value.workspaces),
    scripts: Object.keys(scripts),
    checks,
    notes,
  };
}

module.exports = { detectNode };
