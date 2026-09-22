#!/usr/bin/env node
'use strict';
// Run the project's real checks and record the evidence.
//
//   node verify.js [--root <dir>] [--json] [--check "<cmd>"]... [--timeout <sec>]
//
// Checks come from, in order: --check args, .agents/harness.json (checks),
// .agents/state/goal.json (checks), then simple heuristics (package.json
// scripts, Maven/Gradle wrappers, go.mod, pytest, Makefile).
// Each check runs in the project root; the run stops at the first failure.
//
// Evidence goes to .agents/state/verify.json. When every check passes and
// .agents/state/goal.json exists, the goal is marked done/inactive. This script
// is the only thing that should set "done": true — the hx-guard stop hook trusts
// verify.json, not the flag alone, and the pre-tool guard denies hand edits.
//
// Exit: 0 all pass, 1 a check failed, 2 usage, 3 no checks found.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const TAIL_LINES = 30;
const TAIL_CHARS = 2000;
const IS_WIN = process.platform === 'win32';

function parseArgs(argv) {
  const out = { root: process.cwd(), json: false, checks: [], timeout: 1800 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root') out.root = path.resolve(argv[++i] || '');
    else if (a === '--json') out.json = true;
    else if (a === '--check') out.checks.push(String(argv[++i] || ''));
    else if (a === '--timeout') out.timeout = Number(argv[++i]);
    else if (a === '-h' || a === '--help') usage(0);
    else usage(2, `unknown argument: ${a}`);
  }
  if (!fs.existsSync(out.root) || !fs.statSync(out.root).isDirectory()) usage(2, `not a directory: ${out.root}`);
  if (!Number.isFinite(out.timeout) || out.timeout <= 0) usage(2, '--timeout must be a positive number of seconds');
  out.checks = out.checks.filter((c) => c.trim());
  return out;
}

function usage(code, msg) {
  const out = code === 0 ? process.stdout : process.stderr;
  if (msg) out.write(`${msg}\n`);
  out.write('usage: node verify.js [--root <dir>] [--json] [--check "<cmd>"]... [--timeout <sec>]\n');
  process.exit(code);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return null;
  }
}

const exists = (p) => fs.existsSync(p);

/** Where the checks come from: { source, checks }. Exported for tests. */
function findChecks(root, explicit = []) {
  if (explicit.length) return { source: 'args', checks: explicit };
  const manifest = readJson(path.join(root, '.agents', 'harness.json'));
  if (manifest && Array.isArray(manifest.checks) && manifest.checks.length) return { source: 'harness.json', checks: manifest.checks };
  const goal = readJson(path.join(root, '.agents', 'state', 'goal.json'));
  if (goal && Array.isArray(goal.checks) && goal.checks.length) return { source: 'goal.json', checks: goal.checks };
  return { source: 'heuristic', checks: heuristics(root) };
}

function heuristics(root) {
  const has = (f) => exists(path.join(root, f));
  const pkg = readJson(path.join(root, 'package.json'));
  if (pkg && pkg.scripts) {
    const pm = has('pnpm-lock.yaml') ? 'pnpm' : has('yarn.lock') ? 'yarn' : (has('bun.lockb') || has('bun.lock')) ? 'bun' : 'npm';
    const out = [];
    for (const [aliases, run] of [[['typecheck', 'type-check'], true], [['lint'], true], [['test'], false], [['build'], true]]) {
      const name = aliases.find((a) => typeof pkg.scripts[a] === 'string');
      if (!name || (name === 'test' && /no test specified/.test(pkg.scripts[name]))) continue;
      out.push(run ? `${pm} run ${name}` : `${pm} test`);
    }
    if (out.length) return out;
  }
  if (has('pom.xml')) return [has('mvnw') ? (IS_WIN ? 'mvnw.cmd -q test' : './mvnw -q test') : 'mvn -q test'];
  if (has('build.gradle') || has('build.gradle.kts') || has('settings.gradle') || has('settings.gradle.kts')) {
    return [has('gradlew') ? (IS_WIN ? 'gradlew.bat check' : './gradlew check') : 'gradle check'];
  }
  if (has('go.mod')) return ['go build ./...', 'go vet ./...', 'go test ./...'];
  if (has('pyproject.toml') || has('pytest.ini') || has('setup.py') || has('requirements.txt')) {
    const prefix = has('uv.lock') ? 'uv run ' : has('poetry.lock') ? 'poetry run ' : '';
    return [`${prefix}pytest -q`];
  }
  if (has('Makefile')) {
    const mk = fs.readFileSync(path.join(root, 'Makefile'), 'utf8');
    const out = [];
    for (const t of ['lint', 'test', 'build']) if (new RegExp(`^${t}\\s*:`, 'm').test(mk)) out.push(`make ${t}`);
    if (out.length) return out;
  }
  return [];
}

function tail(text) {
  const lines = String(text || '').split(/\r?\n/).filter((l) => l.trim());
  let out = lines.slice(-TAIL_LINES).join('\n');
  if (out.length > TAIL_CHARS) out = out.slice(-TAIL_CHARS);
  return out;
}

/** Run one check; never throws. Exported for tests. */
function runCheck(command, root, timeoutSec) {
  const started = Date.now();
  const r = spawnSync(command, { cwd: root, shell: true, encoding: 'utf8', timeout: timeoutSec * 1000, maxBuffer: 64 * 1024 * 1024 });
  const ms = Date.now() - started;
  const timedOut = r.error && r.error.code === 'ETIMEDOUT';
  const exit = timedOut ? 124 : r.error ? 127 : (r.status === null ? 1 : r.status);
  const output = (r.stdout || '') + (r.stderr || '') + (r.error && !timedOut ? `\n${r.error.message}` : '');
  return { command, exit, ms, tail: tail(output), timedOut: Boolean(timedOut) };
}

function summary(c) {
  if (c.skipped) return 'skipped (earlier check failed)';
  if (c.timedOut) return `timed out after ${Math.round(c.ms / 1000)}s`;
  const last = c.tail.split('\n').filter(Boolean).pop() || '';
  const testLine = c.tail.split('\n').reverse().find((l) => /\b(tests?|passed|failed|failures|ok|FAIL|error)\b/i.test(l)) || last;
  return (c.exit === 0 ? 'pass' : `exit ${c.exit}`) + (testLine ? ` — ${testLine.trim().slice(0, 120)}` : '');
}

/** Run all checks in order, stop at first failure. Exported for tests. */
function runAll(checks, root, timeoutSec) {
  const results = [];
  let failed = false;
  for (const c of checks) {
    if (failed) { results.push({ command: c, exit: null, ms: 0, tail: '', skipped: true }); continue; }
    const r = runCheck(c, root, timeoutSec);
    results.push(r);
    if (r.exit !== 0) failed = true;
  }
  return { passed: !failed && checks.length > 0, results };
}

function updateGoal(root, passed, ran) {
  const file = path.join(root, '.agents', 'state', 'goal.json');
  const goal = readJson(file);
  if (!goal || typeof goal !== 'object') return null;
  if (!passed) return goal;
  const next = { ...goal, done: true, active: false, updated: ran, verifiedAt: ran };
  fs.writeFileSync(file, JSON.stringify(next, null, 2) + '\n');
  return next;
}

function report(ev) {
  const lines = [`Verification: ${ev.passed ? 'PASS' : 'FAIL'}`, '| check | command | exit | summary |', '|---|---|---|---|'];
  ev.checks.forEach((c, i) => lines.push(`| ${i + 1} | \`${c.command}\` | ${c.skipped ? '-' : c.exit} | ${summary(c)} |`));
  const failures = ev.checks.filter((c) => !c.skipped && c.exit !== 0);
  lines.push(`Failures: ${failures.length ? '' : 'none'}`);
  for (const f of failures) {
    lines.push(`--- ${f.command} (exit ${f.exit}) ---`);
    lines.push(f.tail || '(no output)');
  }
  lines.push(`Evidence: .agents/state/verify.json (source: ${ev.source}, ${ev.ran})`);
  if (ev.goal) lines.push(ev.passed ? `Goal closed: "${ev.goal.goal || ''}" (done=true, active=false)` : `Goal still open: "${ev.goal.goal || ''}"`);
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { source, checks } = findChecks(args.root, args.checks);
  if (!checks.length) {
    process.stderr.write('verify: no checks found. Add "checks" to .agents/harness.json (run /hx-core:setup) or pass --check "<cmd>".\n');
    process.exit(3);
  }
  const ran = new Date().toISOString();
  const { passed, results } = runAll(checks, args.root, args.timeout);
  const goalBefore = readJson(path.join(args.root, '.agents', 'state', 'goal.json'));
  const evidence = {
    ran, root: args.root, source, passed,
    goal: goalBefore && typeof goalBefore.goal === 'string' ? goalBefore.goal : null,
    checks: results,
  };
  const stateDir = path.join(args.root, '.agents', 'state');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'verify.json'), JSON.stringify(evidence, null, 2) + '\n');
  const goal = updateGoal(args.root, passed, ran);
  const out = { ...evidence, goal };
  process.stdout.write((args.json ? JSON.stringify(out, null, 2) : report(out)) + '\n');
  process.exit(passed ? 0 : 1);
}

if (require.main === module) main();

module.exports = { findChecks, heuristics, runCheck, runAll, report, tail };
