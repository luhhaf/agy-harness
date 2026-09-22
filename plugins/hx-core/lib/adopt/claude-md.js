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

function resolveImports(file, home, depth, seen, leftovers) {
  const text = readText(file) || '';
  if (depth >= MAX_DEPTH) return text;
  seen.add(file);
  return text.split('\n').map((line, i) => line.replace(IMPORT_RE, (m, pre, p) => {
    if (!/\//.test(p) && !/\.md$/.test(p)) return m; // handle, e-mail, decorator: not a path
    const abs = p.startsWith('~/') ? path.join(home, p.slice(2)) : path.resolve(path.dirname(file), p);
    let isFile = false;
    try { isFile = fs.statSync(abs).isFile(); } catch (_) { /* missing */ }
    if (!isFile) { leftovers.push({ line: i + 1, text: `unresolved import @${p}` }); return m; }
    if (seen.has(abs)) return `${pre}<!-- adopted from @${p}: already included -->`;
    const inner = resolveImports(abs, home, depth + 1, seen, leftovers).trim();
    return `${pre}<!-- adopted from @${p} -->\n${inner}\n<!-- /adopted -->`;
  })).join('\n');
}

function scan(root, ctx) {
  const src = ['CLAUDE.md', '.claude/CLAUDE.md'].find((f) => exists(path.join(root, f)));
  if (!src) return [];
  const leftovers = [];
  const resolved = resolveImports(path.join(root, src), ctx.home, 0, new Set(), leftovers);
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
