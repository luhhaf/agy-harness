'use strict';
// Check that a project's Antigravity harness is set up correctly. Every check
// is deterministic and read-only unless opts.fix is set (only the two state
// checks can fix themselves).
const path = require('path');
const fs = require('fs');
const os = require('os');
const registry = require('./registry.json');
const { GENERATED, MANIFEST } = require('./setup');
const { exists, readText, readJson, listDirs, listFiles, frontmatter, stateIgnored, appendGitignore } = require('./fs');
const { FILL_RE } = require('./templates');

const NAME_RE = new RegExp(registry.nameRegex);

function result(id, level, message, fix) {
  return fix ? { id, level, message, fix } : { id, level, message };
}
const ok = (id, message) => result(id, 'ok', message);
const warn = (id, message, fix) => result(id, 'warn', message, fix);
const fail = (id, message, fix) => result(id, 'error', message, fix);

// ---- individual checks: (ctx) => result ----------------------------------

function agentsDir({ root }) {
  return exists(path.join(root, '.agents'))
    ? ok('agents-dir', '.agents/ exists')
    : fail('agents-dir', '.agents/ is missing', 'run /hx-core:setup');
}

function manifest({ root }) {
  const m = readJson(path.join(root, MANIFEST));
  if (m.error === 'missing') return fail('manifest', `${MANIFEST} is missing`, 'run /hx-core:setup');
  if (m.error) return fail('manifest', `${MANIFEST} is not valid JSON: ${m.error}`, 'fix the JSON or delete the file and run /hx-core:setup');
  const v = m.value;
  if (v.harness !== 'hx' || !Array.isArray(v.checks)) return fail('manifest', `${MANIFEST} must have "harness": "hx" and a "checks" array`, 'delete the file and run /hx-core:setup');
  return ok('manifest', `${MANIFEST} v${v.version || '?'}, stack ${v.stack ? v.stack.kind : '?'}, ${v.checks.length} check(s)`);
}

function rootRules({ root }) {
  const text = readText(path.join(root, 'AGENTS.md'));
  if (text === null) return fail('root-rules', 'AGENTS.md is missing at the project root', 'run /hx-core:setup');
  if (text.length > registry.ruleMaxChars) return fail('root-rules', `AGENTS.md is ${text.length} chars; agy truncates rules over ${registry.ruleMaxChars}`, 'move details into .agents/rules/*.md or skills');
  if (text.length > registry.rootRulesWarnChars) return warn('root-rules', `AGENTS.md is ${text.length} chars; keep it under ${registry.rootRulesWarnChars} to save context`, 'move long sections into .agents/rules/ or a skill');
  return ok('root-rules', `AGENTS.md ${text.length} chars`);
}

function rulesFrontmatter({ root }) {
  const dir = path.join(root, '.agents', 'rules');
  const problems = [];
  for (const f of listFiles(dir, '.md')) {
    const text = readText(path.join(dir, f)) || '';
    if (text.length > registry.ruleMaxChars) problems.push(`${f}: ${text.length} chars (max ${registry.ruleMaxChars})`);
    const fm = frontmatter(text);
    if (!fm) continue; // no frontmatter = always on, allowed
    if (fm.trigger !== undefined && !registry.ruleTriggers.includes(fm.trigger)) problems.push(`${f}: trigger "${fm.trigger}" (use ${registry.ruleTriggers.join('|')})`);
    if (fm.trigger === 'glob' && !(Array.isArray(fm.globs) && fm.globs.length)) problems.push(`${f}: trigger glob needs a non-empty globs list`);
  }
  return problems.length
    ? fail('rules-frontmatter', problems.join('; '), 'fix the frontmatter of each file listed')
    : ok('rules-frontmatter', `${listFiles(dir, '.md').length} rule file(s) valid`);
}

function placeholders({ root }) {
  const left = [];
  for (const rel of GENERATED) {
    const text = readText(path.join(root, rel));
    if (text === null) continue;
    const n = (text.match(FILL_RE) || []).length;
    if (n) left.push(`${rel} (${n})`);
  }
  return left.length
    ? warn('placeholders', `hx:fill placeholders left in ${left.join(', ')}`, 'fill them from the real code (/hx-core:setup does this) or delete the marker')
    : ok('placeholders', 'no hx:fill placeholders left');
}

function skills({ root }) {
  const dir = path.join(root, '.agents', 'skills');
  const problems = [];
  const shadows = [];
  for (const name of listDirs(dir)) {
    const text = readText(path.join(dir, name, 'SKILL.md'));
    if (text === null) { problems.push(`${name}: no SKILL.md`); continue; }
    const fm = frontmatter(text) || {};
    if (!NAME_RE.test(name)) problems.push(`${name}: directory name must match ${registry.nameRegex}`);
    if (fm.name !== name) problems.push(`${name}: frontmatter name "${fm.name || ''}" must equal the directory name`);
    if (!fm.description) problems.push(`${name}: description is required`);
    if (registry.hxSkills.includes(name)) shadows.push(name);
  }
  if (problems.length) return fail('skills', problems.join('; '), 'fix each SKILL.md listed');
  if (shadows.length) return warn('skills', `skill name(s) ${shadows.join(', ')} shadow hx-* skills of the same name`, 'rename the project skill');
  return ok('skills', `${listDirs(dir).length} project skill(s) valid`);
}

function agents({ root }) {
  const dir = path.join(root, '.agents', 'agents');
  const problems = [];
  for (const f of listFiles(dir, '.md')) {
    const fm = frontmatter(readText(path.join(dir, f)) || '') || {};
    const tools = Array.isArray(fm.tools) ? fm.tools : [];
    const unknown = tools.filter((t) => !registry.tools.includes(t));
    if (unknown.length) problems.push(`${f}: unknown tool(s) ${unknown.join(', ')}`);
  }
  return problems.length
    ? fail('agents', problems.join('; '), 'remove the tool names; an unknown tool makes the subagent fail to start')
    : ok('agents', `${listFiles(dir, '.md').length} project agent(s) valid`);
}

function hooks({ root }) {
  const agentsDirAbs = path.join(root, '.agents');
  const file = path.join(agentsDirAbs, 'hooks.json');
  const h = readJson(file);
  if (h.error === 'missing') return ok('hooks', 'no .agents/hooks.json');
  if (h.error) return fail('hooks', `.agents/hooks.json is not valid JSON: ${h.error}`, 'fix the JSON');
  const problems = [];
  for (const [hookName, events] of Object.entries(h.value || {})) {
    for (const [event, entries] of Object.entries(events || {})) {
      const flat = [];
      for (const e of Array.isArray(entries) ? entries : []) {
        if (Array.isArray(e.hooks)) flat.push(...e.hooks); else flat.push(e);
      }
      for (const cmd of flat) {
        if (typeof cmd.timeout === 'number' && cmd.timeout > registry.hookMaxTimeout) problems.push(`${hookName}/${event}: timeout ${cmd.timeout} > ${registry.hookMaxTimeout}`);
        const script = scriptOf(cmd.command);
        if (script && !exists(path.resolve(agentsDirAbs, script))) problems.push(`${hookName}/${event}: script ${script} not found (relative to .agents/)`);
      }
    }
  }
  return problems.length
    ? fail('hooks', problems.join('; '), 'point each command at an existing script and keep timeout <= 10')
    : ok('hooks', '.agents/hooks.json valid');
}

/** The first `./something` or `*.js` token of a hook command line, if any. */
function scriptOf(command) {
  if (typeof command !== 'string') return null;
  const tok = command.split(/\s+/).find((t) => t.startsWith('./') || /\.(js|cjs|mjs|sh|ps1|py)$/.test(t));
  return tok ? tok.replace(/^["']|["']$/g, '') : null;
}

function adoptDrift({ root, home }) {
  const { scan, ADOPT_FILE } = require('./adopt');
  const { sha256 } = require('./adopt/common');
  const a = readJson(path.join(root, ADOPT_FILE));
  const claudeDirs = ['skills', 'commands', 'agents', 'rules'].map((d) => path.join(root, '.claude', d));
  const hasClaude = exists(path.join(root, 'CLAUDE.md')) || exists(path.join(root, '.claude', 'CLAUDE.md')) || claudeDirs.some(exists);
  if (a.error === 'missing') {
    return hasClaude
      ? warn('adopt-drift', 'Claude Code config found (CLAUDE.md or .claude/) but not adopted', 'run /hx-core:adopt')
      : ok('adopt-drift', 'no Claude Code config to adopt');
  }
  if (a.error) return fail('adopt-drift', `${ADOPT_FILE} is not valid JSON: ${a.error}`, 'fix or delete the file and run /hx-core:adopt --apply');
  const current = new Map();
  for (const it of scan(root, { home })) {
    if (it.content === null || it.track === false) continue;
    current.set(it.target, it.sourceHash);
    for (const f of it.files || []) current.set(f.target, f.sourceHash);
  }
  const removed = [];
  const changed = [];
  const missing = [];
  let edited = 0;
  const items = Object.entries(a.value.items || {});
  for (const [target, entry] of items) {
    if (!current.has(target)) removed.push(target);
    else if (current.get(target) !== entry.sourceHash) changed.push(target);
    try { if (sha256(fs.readFileSync(path.join(root, target))) !== entry.targetHash) edited++; } catch (_) { missing.push(target); }
  }
  if (changed.length || removed.length || missing.length) {
    const parts = [];
    if (changed.length) parts.push(`${changed.length} source(s) changed`);
    if (removed.length) parts.push(`${removed.length} removed`);
    if (missing.length) parts.push(`${missing.length} adopted file(s) missing`);
    const allTargets = [...changed, ...removed, ...missing];
    return warn('adopt-drift', `${parts.join(', ')} since adopt: ${allTargets.join(', ')}`, 'run /hx-core:adopt --apply to re-create them, or remove the entry from .agents/adopt.json');
  }
  return ok('adopt-drift', `${items.length} adopted file(s) in sync${edited ? `; ${edited} edited by hand (adopt will skip them)` : ''}`);
}

function stateIgnoredCheck({ root, fix, fixed }) {
  if (stateIgnored(root)) return ok('state-ignored', '.agents/state/ is gitignored');
  if (fix) { appendGitignore(root, '.agents/state/'); fixed.push('state-ignored'); return ok('state-ignored', 'added .agents/state/ to .gitignore'); }
  return warn('state-ignored', '.agents/state/ is not in .gitignore (goal.json/notepad.md would be committed)', 'add ".agents/state/" to .gitignore (doctor --fix)');
}

function stateDir({ root, fix, fixed }) {
  const dir = path.join(root, '.agents', 'state');
  if (exists(dir)) return ok('state-dir', '.agents/state/ exists');
  if (fix) { fs.mkdirSync(dir, { recursive: true }); fixed.push('state-dir'); return ok('state-dir', 'created .agents/state/'); }
  return warn('state-dir', '.agents/state/ is missing', 'create it (doctor --fix)');
}

function goal({ root }) {
  const g = readJson(path.join(root, '.agents', 'state', 'goal.json'));
  if (g.error === 'missing') return ok('goal', 'no goal.json');
  if (g.error) return fail('goal', `goal.json is not valid JSON: ${g.error}`, 'fix or delete .agents/state/goal.json');
  const v = g.value;
  const bad = [];
  if (typeof v.active !== 'boolean') bad.push('active must be boolean');
  if (typeof v.done !== 'boolean') bad.push('done must be boolean');
  if (v.checks !== undefined && !Array.isArray(v.checks)) bad.push('checks must be an array');
  return bad.length
    ? fail('goal', `goal.json: ${bad.join(', ')}`, 'fix or delete .agents/state/goal.json')
    : ok('goal', `goal.json ${v.active ? 'active' : 'inactive'}, done=${v.done}`);
}

function checksRunnable({ root }) {
  const m = readJson(path.join(root, MANIFEST));
  if (m.error) return ok('checks-runnable', 'skipped (no manifest)');
  const checks = Array.isArray(m.value.checks) ? m.value.checks : [];
  const pkg = readJson(path.join(root, 'package.json'));
  const scripts = (pkg.value && pkg.value.scripts) || {};
  const missing = [];
  for (const c of checks) {
    const mm = /^(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?([\w:-]+)$/.exec(c);
    if (mm && !pkg.error && !scripts[mm[1]]) missing.push(`${c} (no such package.json script)`);
    const w = /^(?:\.\/)?(mvnw|gradlew)(?:\.cmd|\.bat)?\b/.exec(c);
    if (w && !exists(path.join(root, w[1]))) missing.push(`${c} (wrapper ${w[1]} not found at root)`);
    if (/^uv run\b/.test(c) && !exists(path.join(root, 'uv.lock'))) missing.push(`${c} (uv.lock not found)`);
    if (/^poetry run\b/.test(c) && !(exists(path.join(root, 'poetry.lock')) && exists(path.join(root, 'pyproject.toml')))) missing.push(`${c} (poetry.lock + pyproject.toml not found)`);
  }
  return missing.length
    ? warn('checks-runnable', `manifest check(s) cannot run as written: ${missing.join(', ')}`, 'update .agents/harness.json checks, add the scripts, or restore the wrapper/lockfile')
    : ok('checks-runnable', `${checks.length} manifest check(s) look runnable`);
}

function hxPlugins({ home }) {
  const cfg = path.join(home, '.gemini', 'config');
  let found = exists(path.join(cfg, 'plugins', 'hx-core'));
  const pj = readJson(path.join(cfg, 'plugins.json'));
  for (const e of (pj.value && pj.value.entries) || []) {
    if (e && typeof e.path === 'string' && exists(path.join(e.path, 'hx-core'))) found = true;
  }
  if (!found) return warn('hx-plugins', 'hx-* plugins are not registered on this machine', 'node ~/agy-harness/install.js');
  const c = readJson(path.join(cfg, 'config.json'));
  const disabled = registry.hxPlugins.filter((p) => c.value && c.value.plugins && c.value.plugins[p] && c.value.plugins[p].enabled === false);
  return disabled.length
    ? warn('hx-plugins', `plugin(s) ${disabled.join(', ')} disabled on this machine`, `agy plugin enable ${disabled[0]}`)
    : ok('hx-plugins', 'hx-* plugins registered');
}

const CHECKS = [agentsDir, manifest, rootRules, rulesFrontmatter, placeholders, skills, agents, hooks, adoptDrift,
  stateIgnoredCheck, stateDir, goal, checksRunnable, hxPlugins];

/**
 * @param {string} root project root
 * @param {{fix?: boolean, home?: string}} opts
 * @returns {{root, ok, errors, warnings, fixed: string[], results: {id, level, message, fix?}[]}}
 */
function runDoctor(root, opts = {}) {
  const ctx = { root: path.resolve(root), fix: Boolean(opts.fix), home: opts.home || os.homedir(), fixed: [] };
  const results = CHECKS.map((c) => {
    try {
      return c(ctx);
    } catch (err) {
      return fail(c.name, `check crashed: ${err.message}`);
    }
  });
  const errors = results.filter((r) => r.level === 'error').length;
  const warnings = results.filter((r) => r.level === 'warn').length;
  return { root: ctx.root, ok: errors === 0, errors, warnings, fixed: ctx.fixed, results };
}

/** Human-readable report. */
function formatReport(r) {
  const tag = { ok: '[ok]  ', warn: '[warn]', error: '[FAIL]' };
  const lines = r.results.map((x) => `${tag[x.level]} ${x.id} — ${x.message}${x.fix && x.level !== 'ok' ? ` (fix: ${x.fix})` : ''}`);
  lines.push('', `${r.ok ? 'Harness OK' : 'Harness has problems'}: ${r.errors} error(s), ${r.warnings} warning(s)${r.fixed.length ? `, fixed: ${r.fixed.join(', ')}` : ''}`);
  return lines.join('\n');
}

module.exports = { runDoctor, formatReport, CHECKS };
