'use strict';
// Shared helpers for hx-guard hooks. Node >= 18, no dependencies.
const fs = require('fs');
const path = require('path');

/** Read all of stdin and parse JSON. Returns {} on empty or invalid input. */
function readInput() {
  let raw = '';
  try {
    raw = fs.readFileSync(0, 'utf8');
  } catch (_) {
    return {};
  }
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch (err) {
    log(`invalid JSON on stdin: ${err.message}`);
    return {};
  }
}

/** Write the hook result as a single JSON line on stdout. */
function writeOutput(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function log(msg) {
  process.stderr.write(`[hx-guard] ${msg}\n`);
}

/**
 * Resolve the workspace root for this hook call.
 * 1. `workspacePaths[0]` from the payload (interactive sessions).
 * 2. Print mode (`agy -p`) sends an empty list: look the conversation up in
 *    `<appDataDir>/cache/last_conversations.json` ({workspace: conversationId}).
 * 3. Otherwise null. Never fall back to cwd: agy runs hooks from the plugin dir.
 */
function workspaceRoot(input) {
  const paths = (input && input.workspacePaths) || [];
  if (paths.length) return paths[0];
  const convId = (input && input.conversationId) || process.env.ANTIGRAVITY_CONVERSATION_ID;
  if (!convId) return null;
  for (const dir of appDataDirs(input)) {
    const map = readJsonIfExists(path.join(dir, 'cache', 'last_conversations.json'));
    if (!map) continue;
    for (const [ws, id] of Object.entries(map)) {
      if (id === convId && fs.existsSync(ws)) return ws;
    }
  }
  return null;
}

/** Candidate app data dirs: derived from transcriptPath, then the known defaults. */
function appDataDirs(input) {
  const out = [];
  const tp = input && input.transcriptPath;
  if (tp) {
    const i = tp.indexOf(`${path.sep}brain${path.sep}`);
    if (i > 0) out.push(tp.slice(0, i));
  }
  const home = process.env.HOME || require('os').homedir();
  for (const d of ['antigravity-cli', 'antigravity', 'antigravity-ide']) out.push(path.join(home, '.gemini', d));
  return out;
}

/** `<workspace>/.agents/state`, or null when the workspace is unknown. */
function stateDir(input) {
  const ws = workspaceRoot(input);
  return ws ? path.join(ws, '.agents', 'state') : null;
}

function readJsonIfExists(file) {
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    log(`cannot read ${file}: ${err.message}`);
    return null;
  }
}

function readTextIfExists(file) {
  try {
    if (!fs.existsSync(file)) return null;
    return fs.readFileSync(file, 'utf8');
  } catch (err) {
    log(`cannot read ${file}: ${err.message}`);
    return null;
  }
}

function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n');
}

/**
 * Run a hook body safely: any thrown error becomes `fallback` on stdout
 * and a line on stderr, and the process always exits 0.
 */
function run(fn, fallback) {
  let out;
  try {
    out = fn(readInput());
  } catch (err) {
    log(`hook error: ${err && err.stack ? err.stack : err}`);
    out = fallback;
  }
  writeOutput(out === undefined ? fallback : out);
}

module.exports = { readInput, writeOutput, log, workspaceRoot, appDataDirs, stateDir, readJsonIfExists, readTextIfExists, writeJson, run };
