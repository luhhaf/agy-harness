'use strict';
// Shared helpers for repo scripts (cross-platform, Node >= 18).
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const WIN = process.platform === 'win32';

/** Run a command, capture output. shell:true on Windows so agy.cmd resolves. */
function capture(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', shell: WIN, cwd: ROOT, ...opts });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', error: r.error };
}
function inherit(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: WIN, cwd: ROOT, ...opts });
  return r.status === 0;
}
function requireCmd(cmd) {
  const r = capture(cmd, ['--version']);
  if (r.error || r.status !== 0) { console.error(`${cmd} not found in PATH`); process.exit(1); }
}
function pluginDirs() {
  const base = path.join(ROOT, 'plugins');
  return fs.readdirSync(base).map((n) => path.join(base, n)).filter((d) => fs.existsSync(path.join(d, 'plugin.json')));
}
/** Run `agy -p <prompt> --output-format json` and parse the JSON result. */
function agyJson(prompt, extra = [], timeoutMs = 300000) {
  const r = capture('agy', ['-p', prompt, '--output-format', 'json', ...extra], { timeout: timeoutMs });
  const line = r.stdout.split(/\r?\n/).find((l) => l.trim().startsWith('{')) || '';
  try { return JSON.parse(line); } catch (_) { return null; }
}

module.exports = { ROOT, WIN, capture, inherit, requireCmd, pluginDirs, agyJson };
