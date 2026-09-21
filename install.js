#!/usr/bin/env node
'use strict';
// Cross-platform installer for agy-harness (macOS, Linux, Windows). Node >= 18, no deps.
//
//   node install.js            register this clone in ~/.gemini/config/plugins.json (method A)
//   node install.js --copy     agy plugin install <this repo>  (method B, copies plugins)
//   node install.js --uninstall
//   node install.js --dir <path>   use another clone location
//
// On Windows "~" means %USERPROFILE%. agy itself resolves "~/" in plugins.json on every OS,
// but we write an absolute path so the file is easy to read.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const argValue = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };

const ROOT = path.resolve(argValue('--dir') || __dirname);
const PLUGINS_DIR = path.join(ROOT, 'plugins');
const CONFIG_DIR = path.join(os.homedir(), '.gemini', 'config');
const PLUGINS_JSON = path.join(CONFIG_DIR, 'plugins.json');
const PLUGIN_NAMES = ['hx-core', 'hx-workflows', 'hx-agents', 'hx-guard'];

function run(cmd, cmdArgs, opts = {}) {
  // shell:true lets Windows find agy.cmd / agy.exe the same way the terminal does.
  const r = spawnSync(cmd, cmdArgs, { stdio: 'inherit', shell: process.platform === 'win32', ...opts });
  return r.status === 0;
}
function have(cmd) {
  const r = spawnSync(cmd, ['--version'], { stdio: 'ignore', shell: process.platform === 'win32' });
  return !r.error && r.status === 0;
}
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return fallback; }
}
function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n');
}
function samePath(a, b) {
  const n = (p) => path.resolve(String(p).replace(/^~(?=$|[\\/])/, os.homedir())).replace(/[\\/]+$/, '').toLowerCase();
  return n(a) === n(b);
}

function main() {
  if (!fs.existsSync(path.join(PLUGINS_DIR, 'hx-core', 'plugin.json'))) {
    console.error(`No plugins/ directory found under ${ROOT}. Run this from a clone of agy-harness or pass --dir <clone>.`);
    process.exit(1);
  }
  const majorNode = Number(process.versions.node.split('.')[0]);
  if (majorNode < 18) console.warn(`WARNING: Node ${process.versions.node} found; hx-guard hooks need Node >= 18.`);
  if (!have('agy')) {
    console.error('agy not found in PATH. Install Antigravity CLI first: https://antigravity.google/docs/cli');
    process.exit(1);
  }

  if (has('--uninstall')) return uninstall();
  console.log(`Harness directory: ${ROOT}`);

  if (has('--copy')) {
    if (!run('agy', ['plugin', 'install', ROOT])) process.exit(1);
  } else {
    const cfg = readJson(PLUGINS_JSON, null) || { entries: [] };
    if (!Array.isArray(cfg.entries)) cfg.entries = [];
    if (cfg.entries.some((e) => e && samePath(e.path, PLUGINS_DIR))) {
      console.log(`Already registered in ${PLUGINS_JSON}`);
    } else {
      cfg.entries.push({ path: PLUGINS_DIR });
      writeJson(PLUGINS_JSON, cfg);
      console.log(`Registered ${PLUGINS_DIR} in ${PLUGINS_JSON}`);
    }
  }

  console.log('Validating plugins...');
  let ok = true;
  for (const name of fs.readdirSync(PLUGINS_DIR)) {
    const dir = path.join(PLUGINS_DIR, name);
    if (!fs.existsSync(path.join(dir, 'plugin.json'))) continue;
    if (!run('agy', ['plugin', 'validate', dir])) ok = false;
  }
  console.log(ok ? '\nDone. Start agy and run /plugins to check. Disable what you do not need: agy plugin disable <name>'
                 : '\nSome plugins failed validation (see above).');
  process.exit(ok ? 0 : 1);
}

function uninstall() {
  const cfg = readJson(PLUGINS_JSON, null);
  if (cfg && Array.isArray(cfg.entries)) {
    const before = cfg.entries.length;
    cfg.entries = cfg.entries.filter((e) => !(e && samePath(e.path, PLUGINS_DIR)));
    if (cfg.entries.length !== before) { writeJson(PLUGINS_JSON, cfg); console.log(`Removed entry from ${PLUGINS_JSON}`); }
  }
  for (const name of PLUGIN_NAMES) {
    if (fs.existsSync(path.join(CONFIG_DIR, 'plugins', name))) run('agy', ['plugin', 'uninstall', name]);
  }
  console.log('Done. The clone itself was not deleted.');
}

main();
