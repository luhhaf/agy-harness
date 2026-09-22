'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { findChecks, heuristics, runAll, report, tail } = require('../skills/verify/scripts/verify');

const SCRIPT = path.join(__dirname, '..', 'skills', 'verify', 'scripts', 'verify.js');
const NODE = JSON.stringify(process.execPath);

function tmp(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hx-verify-'));
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, typeof content === 'string' ? content : JSON.stringify(content, null, 2) + '\n');
  }
  return dir;
}
const readJson = (dir, rel) => JSON.parse(fs.readFileSync(path.join(dir, rel), 'utf8'));
function run(root, extra = []) {
  const r = spawnSync(process.execPath, [SCRIPT, '--root', root, ...extra], { encoding: 'utf8', timeout: 30000 });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

test('findChecks order: args > harness.json > goal.json > heuristics', () => {
  const root = tmp({
    '.agents/harness.json': { harness: 'hx', checks: ['npm run lint'] },
    '.agents/state/goal.json': { active: true, done: false, checks: ['npm test'] },
    'package.json': { scripts: { build: 'x' } },
  });
  assert.deepEqual(findChecks(root, ['make x']), { source: 'args', checks: ['make x'] });
  assert.deepEqual(findChecks(root), { source: 'harness.json', checks: ['npm run lint'] });
  fs.writeFileSync(path.join(root, '.agents/harness.json'), '{"harness":"hx","checks":[]}');
  assert.deepEqual(findChecks(root), { source: 'goal.json', checks: ['npm test'] });
  fs.unlinkSync(path.join(root, '.agents/state/goal.json'));
  assert.deepEqual(findChecks(root), { source: 'heuristic', checks: ['npm run build'] });
});

test('heuristics per stack', () => {
  assert.deepEqual(heuristics(tmp({ 'package.json': { scripts: { test: 'vitest', lint: 'eslint .' } }, 'pnpm-lock.yaml': '' })), ['pnpm run lint', 'pnpm test']);
  assert.deepEqual(heuristics(tmp({ 'package.json': { scripts: { test: 'echo "Error: no test specified" && exit 1' } } })), []);
  assert.deepEqual(heuristics(tmp({ 'pom.xml': '<project/>' })), ['mvn -q test']);
  const mvnw = heuristics(tmp({ 'pom.xml': '<project/>', mvnw: '' }));
  assert.match(mvnw[0], /mvnw(\.cmd)? -q test/);
  assert.deepEqual(heuristics(tmp({ 'build.gradle.kts': '' })), ['gradle check']);
  assert.deepEqual(heuristics(tmp({ 'go.mod': 'module x' })), ['go build ./...', 'go vet ./...', 'go test ./...']);
  assert.deepEqual(heuristics(tmp({ 'pyproject.toml': '', 'uv.lock': '' })), ['uv run pytest -q']);
  assert.deepEqual(heuristics(tmp({ Makefile: 'build:\n\techo\ntest:\n\techo\n' })), ['make test', 'make build']);
  assert.deepEqual(heuristics(tmp({ 'README.md': '' })), []);
});

test('runAll stops at the first failure and marks the rest skipped', () => {
  const root = tmp();
  const { passed, results } = runAll([`${NODE} -e "console.log('ok 1')"`, `${NODE} -e "console.error('bad'); process.exit(3)"`, `${NODE} -e "console.log('never')"`], root, 30);
  assert.equal(passed, false);
  assert.equal(results[0].exit, 0);
  assert.match(results[0].tail, /ok 1/);
  assert.equal(results[1].exit, 3);
  assert.match(results[1].tail, /bad/);
  assert.equal(results[2].skipped, true);
  assert.equal(runAll([], root, 30).passed, false, 'no checks is not a pass');
});

test('tail keeps the last lines only', () => {
  const t = tail(Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n'));
  assert.ok(!t.includes('line 69'));
  assert.ok(t.includes('line 99'));
  assert.ok(tail('x'.repeat(5000)).length <= 2000);
});

test('report has the exact shape the verify skill promises', () => {
  const text = report({ passed: false, source: 'args', ran: 'now', checks: [{ command: 'a', exit: 0, tail: '3 tests passed' }, { command: 'b', exit: 1, tail: 'FAIL x' }, { command: 'c', skipped: true, tail: '' }], goal: { goal: 'g' } });
  assert.match(text, /^Verification: FAIL/);
  assert.match(text, /\| check \| command \| exit \| summary \|/);
  assert.match(text, /\| 2 \| `b` \| 1 \| exit 1 — FAIL x \|/);
  assert.match(text, /\| 3 \| `c` \| - \| skipped/);
  assert.match(text, /Failures: \n--- b \(exit 1\) ---\nFAIL x/);
  assert.match(text, /Goal still open: "g"/);
});

test('e2e pass: writes verify.json and closes the goal; exit 0', () => {
  const root = tmp({
    '.agents/harness.json': { harness: 'hx', checks: [`${NODE} -e "console.log('12 tests, 0 failures')"`] },
    '.agents/state/goal.json': { active: true, done: false, goal: 'Add login', continues: 2 },
  });
  const r = run(root);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^Verification: PASS/);
  assert.match(r.stdout, /Goal closed: "Add login"/);
  const ev = readJson(root, '.agents/state/verify.json');
  assert.equal(ev.passed, true);
  assert.equal(ev.goal, 'Add login');
  assert.equal(ev.source, 'harness.json');
  assert.equal(ev.checks[0].exit, 0);
  const goal = readJson(root, '.agents/state/goal.json');
  assert.equal(goal.done, true);
  assert.equal(goal.active, false);
  assert.equal(goal.continues, 2, 'other fields are preserved');
  assert.ok(goal.verifiedAt);
});

test('e2e fail: evidence says failed, goal untouched; exit 1; --json works', () => {
  const root = tmp({
    '.agents/state/goal.json': { active: true, done: false, goal: 'g', checks: [`${NODE} -e "process.exit(2)"`, 'echo never'] },
  });
  const r = run(root, ['--json']);
  assert.equal(r.status, 1);
  const out = JSON.parse(r.stdout);
  assert.equal(out.passed, false);
  assert.equal(out.source, 'goal.json');
  assert.equal(out.checks[0].exit, 2);
  assert.equal(out.checks[1].skipped, true);
  assert.equal(readJson(root, '.agents/state/verify.json').passed, false);
  const goal = readJson(root, '.agents/state/goal.json');
  assert.equal(goal.done, false);
  assert.equal(goal.active, true);
});

test('e2e: --check overrides, no goal file is fine, state dir is created', () => {
  const root = tmp();
  const r = run(root, ['--check', `${NODE} -e "0"`]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readJson(root, '.agents/state/verify.json').source, 'args');
  assert.match(r.stdout, /Goal closed|Verification: PASS/);
});

test('e2e: no checks -> exit 3 and no evidence written', () => {
  const root = tmp({ 'README.md': '' });
  const r = run(root);
  assert.equal(r.status, 3);
  assert.match(r.stderr, /no checks found/);
  assert.ok(!fs.existsSync(path.join(root, '.agents/state/verify.json')));
});

test('e2e: usage errors exit 2; timeout is enforced', () => {
  assert.equal(run(tmp(), ['--bogus']).status, 2);
  assert.equal(run('/nonexistent/dir/x').status, 2);
  const root = tmp();
  const r = run(root, ['--timeout', '1', '--check', `${NODE} -e "setTimeout(()=>{}, 5000)"`]);
  assert.equal(r.status, 1);
  assert.equal(readJson(root, '.agents/state/verify.json').checks[0].timedOut, true);
});
