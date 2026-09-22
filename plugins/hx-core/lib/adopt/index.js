'use strict';
// Adopt a Claude Code project harness into agy-native files. Converters are pure;
// this module decides what to write (against the filesystem and .agents/adopt.json)
// and writes only when opts.apply is set.
const fs = require('fs');
const os = require('os');
const path = require('path');
const registry = require('../registry.json');
const toolmap = require('./toolmap');
const { sha256, walk, walkSymlinks, item } = require('./common');
const { exists, readJson, writeText, stateIgnored, appendGitignore, listDirs } = require('../fs');
const { memoryDirs } = require('./memory');

const VERSION = require('../../plugin.json').version;
const ADOPT_FILE = '.agents/adopt.json';
const CONVERTERS = {
  'claude-md': require('./claude-md'),
  skills: require('./skills'),
  commands: require('./commands'),
  agents: require('./agents'),
  rules: require('./rules'),
  hooks: require('./hooks'),
  permissions: require('./permissions'),
  mcp: require('./mcp'),
  memory: require('./memory'),
};
const KINDS = Object.keys(CONVERTERS);

// .claude/ directories that can hold a symlinked source, mapped to the kind reported
// for a symlink item found under them. `walk()`/`listDirs()`/`listFiles()` all use
// readdirSync(withFileTypes) filtered on isDirectory()/isFile(), neither of which is
// true for a symlink (it is not followed), so a symlinked source silently vanishes
// from every converter that scans these dirs unless it is reported here first.
const SYMLINK_DIRS = { skills: 'skill', commands: 'command', agents: 'agent', rules: 'rule' };
const SYMLINK_REASON = 'symlinked source is not followed; copy the real file into .claude/ or adopt its target directly';

function makeCtx(opts) {
  return { home: opts.home || os.homedir(), registry, toolmap };
}

/** Run the selected converters. Pure. A throwing converter cannot abort the whole scan. */
function scan(root, opts = {}) {
  const ctx = makeCtx(opts);
  const kinds = opts.only && opts.only.length ? opts.only : KINDS;
  const absRoot = path.resolve(root);
  const out = [];
  for (const k of kinds) {
    if (!CONVERTERS[k]) continue;
    try {
      out.push(...CONVERTERS[k].scan(absRoot, ctx));
    } catch (err) {
      // converterFailed is an explicit flag runAdopt reads to suppress pruning for this
      // run (a failed converter produces no real items, so its live targets would
      // otherwise look stale and get pruned out from under untouched, correctly
      // adopted files). `k` (the CONVERTERS key, e.g. "skills") is used here rather
      // than the converter module's own `kind` (e.g. "skill": singular, per-item
      // vocabulary) because this note is compared against KINDS / --only, which are
      // spelled in the plural.
      out.push(item({ kind: k, source: `${k} converter`, target: '', status: 'unsupported', reason: `converter failed: ${err.message}`, converterFailed: true }));
    }
    if (SYMLINK_DIRS[k]) {
      for (const rel of walkSymlinks(path.join(absRoot, '.claude', k))) {
        out.push(item({ kind: SYMLINK_DIRS[k], source: `.claude/${k}/${rel}`, target: '', status: 'unsupported', reason: SYMLINK_REASON }));
      }
    }
  }
  dedupeTargets(out);
  return out;
}

/**
 * Detect items (or their files[] entries) that would write to the same target and
 * neutralise every claimant after the first, so a duplicate target never silently
 * loses data and never oscillates between claimants on repeated --apply runs (each
 * run would otherwise see the *other* claimant's file on disk, "restore" its own, and
 * flip forever). Runs after every converter has scanned, so it protects all of them —
 * not just the skill-vs-command clash commands.js already guards on its own.
 */
function dedupeTargets(items) {
  const claimed = new Map(); // target -> source of the first (kept) claimant
  const claims = [];
  for (const it of items) {
    if (it.status !== 'unsupported' && it.content !== null && it.target) claims.push({ it, isMain: true, target: it.target, source: it.source });
    for (const f of it.files || []) claims.push({ it, isMain: false, target: f.target, source: f.source, file: f });
  }
  for (const c of claims) {
    if (!claimed.has(c.target)) { claimed.set(c.target, c.source); continue; }
    const reason = `target ${c.target} already claimed by ${claimed.get(c.target)}; rename it`;
    if (c.isMain) {
      c.it.status = 'unsupported';
      c.it.content = null;
      c.it.files = [];
      c.it.reason = reason;
    } else {
      // A companion file collided, not the item's own target: drop just that file so
      // the rest of the item (and its other companions) still adopts normally.
      c.it.files = c.it.files.filter((f) => f !== c.file);
      c.it.reason = c.it.reason ? `${c.it.reason}; ${reason}` : reason;
    }
  }
}

/** What Claude Code material exists (for the report and the exit-3 decision). */
function countSources(root, home) {
  const r = path.resolve(root);
  const s = readJson(path.join(r, '.claude', 'settings.json')).value || {};
  const hooks = Object.values(s.hooks || {}).reduce((n, e) => n + (Array.isArray(e) ? e.length : 0), 0);
  const perms = ['allow', 'deny', 'ask'].reduce((n, l) => n + ((s.permissions && Array.isArray(s.permissions[l])) ? s.permissions[l].length : 0), 0);
  const memDir = memoryDirs(r, home || os.homedir()).find(exists);
  // A symlinked source (e.g. a shared .claude/agents/*.md, common when a team's
  // harness is shared via symlink) is invisible to listDirs()/walk() — see
  // SYMLINK_DIRS above — so it is added back in here. Without this, a project whose
  // Claude sources are entirely symlinked would count as sourceless and wrongly hit
  // the CLI's exit-3 "no Claude Code files found" path instead of a report explaining
  // why nothing converted.
  const symlinkCount = (dir) => walkSymlinks(path.join(r, '.claude', dir)).length;
  return {
    claudeMd: exists(path.join(r, 'CLAUDE.md')) || exists(path.join(r, '.claude', 'CLAUDE.md')),
    skills: listDirs(path.join(r, '.claude', 'skills')).length + symlinkCount('skills'),
    commands: walk(path.join(r, '.claude', 'commands')).filter((f) => f.endsWith('.md')).length + symlinkCount('commands'),
    agents: walk(path.join(r, '.claude', 'agents')).filter((f) => f.endsWith('.md')).length + symlinkCount('agents'),
    rules: walk(path.join(r, '.claude', 'rules')).filter((f) => f.endsWith('.md')).length + symlinkCount('rules'),
    hooks,
    permissions: perms,
    mcp: exists(path.join(r, '.mcp.json')),
    memory: memDir ? walk(memDir).filter((f) => f.endsWith('.md') && f !== 'MEMORY.md').length : 0,
  };
}

function hasSources(sources) {
  return Object.values(sources).some(Boolean);
}

/** Decide the write action for one target. Exported for tests via runAdopt behaviour. */
function decide(root, entry, prev, opts) {
  const abs = path.join(root, entry.target);
  const newHash = sha256(entry.content);
  if (!exists(abs)) return { action: 'created', reason: '' };
  const cur = sha256(fs.readFileSync(abs));
  if (newHash === cur) return { action: 'skipped', reason: 'up to date' };
  if (opts.tracked === false) return { action: 'updated', reason: '' };
  if (!prev) {
    return entry.target === 'AGENTS.md'
      ? { action: 'skipped', reason: 'AGENTS.md exists and was not written by adopt; merge by hand', manual: true }
      : { action: 'skipped', reason: 'exists, not managed by adopt' };
  }
  if (cur !== prev.targetHash && !opts.force) return { action: 'skipped', reason: 'edited by hand since adopt (use --force to overwrite)' };
  return { action: 'updated', reason: '' };
}

const RANK = { skipped: 0, created: 1, updated: 2 };

/**
 * @param {string} root
 * @param {{apply?: boolean, force?: boolean, only?: string[]|null, home?: string}} opts
 */
function runAdopt(root, opts = {}) {
  root = path.resolve(root);
  const home = opts.home || os.homedir();
  const items = scan(root, { ...opts, home });
  const prevFile = readJson(path.join(root, ADOPT_FILE));
  const prevItems = (prevFile.value && prevFile.value.items) || {};
  const nextItems = { ...prevItems };
  const report = { root, apply: Boolean(opts.apply), sources: countSources(root, home), items: [], notes: [] };
  const writes = [];

  for (const it of items) {
    const row = { kind: it.kind, source: it.source, target: it.target, status: it.status, action: null, reason: it.reason, leftovers: it.leftovers || [], files: [] };
    if (it.status === 'unsupported' || it.content === null) { report.items.push(row); continue; }
    const tracked = it.track !== false;
    const entries = [{ source: it.source, target: it.target, content: it.content, sourceHash: it.sourceHash }, ...(it.files || [])];
    let action = 'skipped';
    let reason = '';
    let manual = false;
    for (const e of entries) {
      const d = decide(root, e, prevItems[e.target], { force: opts.force, tracked });
      if (d.action !== 'skipped') {
        writes.push(e);
        if (tracked) nextItems[e.target] = { source: e.source, sourceHash: e.sourceHash, targetHash: sha256(e.content) };
      }
      if (d.manual) manual = true;
      if (RANK[d.action] > RANK[action] || (action === 'skipped' && !reason)) { action = d.action; reason = d.reason; }
      row.files.push({ target: e.target, action: d.action, reason: d.reason });
    }
    row.action = action;
    if (action === 'skipped') { row.status = manual ? 'manual' : 'skipped'; row.reason = [reason, it.reason].filter(Boolean).join('; '); }
    else row.status = it.status === 'manual' ? 'manual' : action;
    report.items.push(row);
  }

  // Prune stale adopt.json entries only on a full run. An --only run does not scan
  // every kind, so its item list has no entries at all for the unscanned kinds; if we
  // pruned "unproduced" targets here, every entry from a kind the user didn't ask to
  // touch would look stale and get deleted — silent data loss, worse than the cruft
  // this is meant to clean up. Never simplify this away.
  //
  // A full run is also not enough on its own: if any converter threw, it produced no
  // real items for its kind (only the failure stub, target: ''), so every previously
  // tracked target for that kind would look unproduced too. Pruning would then wipe
  // drift tracking for files that are still correctly adopted and untouched on disk —
  // losing that tracking is worse than leaving stale cruft, so prune is skipped
  // entirely (not just for the failed kind) whenever any converter failed this run.
  const fullRun = !(opts.only && opts.only.length);
  const failedConverters = [...new Set(items.filter((it) => it.converterFailed).map((it) => it.kind))];
  if (fullRun && failedConverters.length) {
    for (const k of failedConverters) report.notes.push(`prune skipped: ${k} converter failed`);
  } else if (fullRun) {
    const live = new Set();
    for (const it of items) {
      if (it.target) live.add(it.target);
      for (const f of it.files || []) live.add(f.target);
    }
    const stale = Object.keys(nextItems).filter((t) => !live.has(t));
    if (stale.length) {
      for (const t of stale) delete nextItems[t];
      const verb = opts.apply ? 'pruned' : 'would prune';
      report.notes.push(`${verb} ${stale.length} stale adopt.json entry(ies): ${stale.join(', ')}`);
    }
  }

  if (opts.apply) {
    for (const e of writes) {
      const abs = path.join(root, e.target);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, e.content);
    }
    // Only create state dir and modify gitignore if there is something to write or adopt.json exists
    if (writes.length || Object.keys(nextItems).length || prevFile.value) {
      fs.mkdirSync(path.join(root, '.agents', 'state'), { recursive: true });
      if (!stateIgnored(root)) appendGitignore(root, '.agents/state/');
    }
    if (Object.keys(nextItems).length || prevFile.value) {
      const manifest = { harness: 'hx', version: VERSION, at: new Date().toISOString().slice(0, 10), items: nextItems };
      writeText(path.join(root, ADOPT_FILE), JSON.stringify(manifest, null, 2) + '\n');
    }
  } else if (writes.length) {
    report.notes.push(`Dry run: ${writes.length} file(s) would be written. Re-run with --apply.`);
  } else {
    report.notes.push('Dry run: nothing to write.');
  }
  return report;
}

function formatReport(r) {
  const lines = [`hx adopt — ${path.basename(r.root)}${r.apply ? '' : ' [dry-run]'}`];
  for (const it of r.items) {
    lines.push(`[${it.status}] ${it.source}${it.target ? ` → ${it.target}` : ''}${it.reason ? ` — ${it.reason}` : ''}`);
    // Sub-lines exist to surface per-file divergence in a multi-file item (a skill's
    // SKILL.md plus companions). A single-file item's one entry always shares the row's
    // own action, so its sub-line would just restate the line above — skip it.
    const files = it.files || [];
    if (files.length > 1) {
      for (const f of files) {
        if (f.action !== it.action || f.reason) lines.push(`    ${f.target} — ${f.action}: ${f.reason}`);
      }
    }
  }
  const count = (s) => r.items.filter((i) => i.status === s).length;
  lines.push(`created ${count('created')}, updated ${count('updated')}, skipped ${count('skipped')}, manual ${count('manual')}, unsupported ${count('unsupported')}`);
  const left = r.items.flatMap((i) => (i.leftovers || []).map((l) => `  ${i.target || i.source}:${l.line} — ${l.text}`));
  if (left.length) lines.push('Leftovers to fix by hand:', ...left);
  for (const n of r.notes) lines.push(n);
  return lines.join('\n');
}

module.exports = { scan, runAdopt, formatReport, countSources, hasSources, ADOPT_FILE, KINDS, VERSION };
