'use strict';
// CLAUDE.md (+ @imports) -> AGENTS.md. agy reads AGENTS.md, not CLAUDE.md.
const fs = require('fs');
const path = require('path');
const { exists, readText } = require('../fs');
const { sha256, item } = require('./common');

const kind = 'claude-md';
const MAX_DEPTH = 3;
const ROOT_WARN = 4000;
// "@path" tokens at line start or after whitespace; the path must look like a path.
const IMPORT_RE = /(^|\s)@((?:~\/|\.{1,2}\/|\/)?[\w.-]+(?:\/[\w.-]+)*)/g;
const BOILERPLATE_RE = /This file provides guidance to Claude Code/;

function resolveImports(file, root, home, depth, seen, leftovers, topFile) {
  const text = readText(file) || '';
  const relFile = path.relative(root, file).replace(/\\/g, '/');
  const isTopLevel = file === topFile;

  // At depth limit, scan for imports but don't resolve them
  if (depth >= MAX_DEPTH) {
    text.split('\n').forEach((line, i) => {
      const matches = Array.from(line.matchAll(IMPORT_RE));
      for (const m of matches) {
        const p = m[2];
        if (!/\//.test(p) && !/\.md$/.test(p)) continue; // skip non-paths
        const suffix = isTopLevel ? '' : ` (in ${relFile})`;
        leftovers.push({ line: i + 1, text: `import depth limit reached @${p}${suffix}` });
      }
    });
    return text;
  }

  seen.add(file);
  return text.split('\n').map((line, i) => line.replace(IMPORT_RE, (m, pre, p) => {
    if (!/\//.test(p) && !/\.md$/.test(p)) return m; // skip non-paths

    // Resolve path
    const abs = p.startsWith('~/') ? path.join(home, p.slice(2)) : path.resolve(path.dirname(file), p);

    // Validate path is within root or home
    const relToRoot = path.relative(root, abs).replace(/\\/g, '/');
    const relToHome = path.relative(home, abs).replace(/\\/g, '/');
    const isInRoot = !relToRoot.startsWith('..') && !path.isAbsolute(relToRoot);
    const isInHome = !relToHome.startsWith('..') && !path.isAbsolute(relToHome);

    if (!isInRoot && !isInHome) {
      const suffix = isTopLevel ? '' : ` (in ${relFile})`;
      leftovers.push({ line: i + 1, text: `import outside repo/home @${p}${suffix}` });
      return m;
    }

    // Check if file exists
    let isFile = false;
    try { isFile = fs.statSync(abs).isFile(); } catch (_) { /* missing */ }
    if (!isFile) {
      const suffix = isTopLevel ? '' : ` (in ${relFile})`;
      leftovers.push({ line: i + 1, text: `unresolved import @${p}${suffix}` });
      return m;
    }

    // Check for cycles
    if (seen.has(abs)) return `${pre}<!-- adopted from @${p}: already included -->`;

    // Recurse
    const inner = resolveImports(abs, root, home, depth + 1, seen, leftovers, topFile).trim();
    return `${pre}<!-- adopted from @${p} -->\n${inner}\n<!-- /adopted -->`;
  })).join('\n');
}

function scan(root, ctx) {
  const src = ['CLAUDE.md', '.claude/CLAUDE.md'].find((f) => exists(path.join(root, f)));
  if (!src) return [];
  const topFile = path.join(root, src);
  const leftovers = [];
  const resolved = resolveImports(topFile, root, ctx.home, 0, new Set(), leftovers, topFile);
  const cleaned = resolved
    .replace(/^# CLAUDE\.md[ \t]*$/m, '# AGENTS.md')
    .split('\n').filter((l) => !BOILERPLATE_RE.test(l)).join('\n');
  const rw = ctx.toolmap.rewrite(cleaned);
  const it = item({ kind, source: src, target: 'AGENTS.md', content: rw.text, sourceHash: sha256(resolved), leftovers: [...leftovers, ...rw.leftovers] });
  if (rw.text.length > ROOT_WARN) {
    it.status = 'manual';
    it.reason = `${rw.text.length} chars; keep AGENTS.md under ${ROOT_WARN} (agy truncates rules over 12000) — move sections into .agents/rules/`;
  } else if (it.leftovers.length) {
    it.status = 'manual';
    it.reason = 'unresolved imports or Claude-only text left; see leftovers';
  }
  return [it];
}

module.exports = { kind, scan };
