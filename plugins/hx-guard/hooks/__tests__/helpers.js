'use strict';
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const HOOKS = path.join(__dirname, '..');

/** Run a hook script exactly like agy does: JSON on stdin, JSON on stdout. */
function runHook(script, input, opts = {}) {
  const r = spawnSync(process.execPath, [path.join(HOOKS, script)], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
    cwd: opts.cwd || path.join(HOOKS, '..'),
    timeout: 10000,
  });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch (_) { /* leave null */ }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json };
}

function tmpWorkspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hx-guard-'));
  fs.mkdirSync(path.join(dir, '.agents', 'state'), { recursive: true });
  return dir;
}

function payload(extra, ws) {
  return {
    conversationId: 'test-conv',
    workspacePaths: [ws],
    transcriptPath: path.join(ws, 'transcript.jsonl'),
    artifactDirectoryPath: path.join(ws, 'artifacts'),
    modelName: 'test',
    ...extra,
  };
}

module.exports = { runHook, tmpWorkspace, payload };
