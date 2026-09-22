'use strict';
// Claude Code auto-memory for this repo -> a marked block under "## Decisions"
// in .agents/state/notepad.md. Per machine (state dir is gitignored), so untracked.
const fs = require('fs');
const path = require('path');
const { exists, readText, listFiles, frontmatter } = require('../fs');
const { item } = require('./common');

const kind = 'memory';
const START = '<!-- hx:adopted-memory -->';
const END = '<!-- /hx:adopted-memory -->';
const SECRET_RE = /(api[_-]?key|token|secret|password)\s*[:=]|sk-[A-Za-z0-9]{16,}/i;
const NOTEPAD_TEMPLATE = `# Notepad

## Priority
<!-- max ~1500 chars. Things every turn must know: current goal, hard constraints. -->

## Decisions
<!-- one line each: YYYY-MM-DD — decision — why -->

## Working notes
<!-- timestamped notes; delete when no longer useful -->

## Open questions
- [ ] question — who can answer
`;

/** Candidate memory dirs: Claude names the project dir after the absolute path. */
function memoryDirs(root, home) {
  const abs = path.resolve(root);
  const slugs = [abs.replace(/[\\/]/g, '-'), abs.replace(/[^A-Za-z0-9]/g, '-')];
  return [...new Set(slugs)].map((s) => path.join(home, '.claude', 'projects', s, 'memory'));
}

function typeOf(raw, fm) {
  const m = /^\s+type:\s*([\w-]+)/m.exec(raw);
  return (m && m[1]) || fm.type || 'note';
}

/** Insert or replace the marked block under "## Decisions". Exported for tests. */
function mergeBlock(notepad, block) {
  const base = notepad === null ? NOTEPAD_TEMPLATE : notepad;
  const s = base.indexOf(START);
  const e = base.indexOf(END);
  if (s >= 0 && e > s) return base.slice(0, s) + block + base.slice(e + END.length);
  const m = /^## Decisions[ \t]*\r?\n/m.exec(base);
  if (m) {
    const at = m.index + m[0].length;
    return base.slice(0, at) + block + '\n' + base.slice(at);
  }
  return base.replace(/\s*$/, '') + `\n\n## Decisions\n${block}\n`;
}

function scan(root, ctx) {
  const dir = memoryDirs(root, ctx.home).find(exists);
  if (!dir) return [];
  const lines = [];
  let dropped = 0;
  for (const f of listFiles(dir, '.md')) {
    if (f === 'MEMORY.md') continue;
    const abs = path.join(dir, f);
    const raw = readText(abs) || '';
    const fm = frontmatter(raw) || {};
    const date = fs.statSync(abs).mtime.toISOString().slice(0, 10);
    const line = `- ${date} — [${typeOf(raw, fm)}] ${fm.name || f.replace(/\.md$/, '')}: ${fm.description || ''}`.trimEnd();
    if (SECRET_RE.test(line)) { dropped++; continue; }
    lines.push(line);
  }
  if (!lines.length && !dropped) return [];
  const block = `${START}\n${lines.join('\n')}\n${END}`;
  const target = '.agents/state/notepad.md';
  const it = item({ kind, source: path.relative(ctx.home, dir).split(path.sep).join('/').replace(/^/, '~/'), target, content: mergeBlock(readText(path.join(root, target)), block), track: false });
  it.reason = dropped ? `${dropped} line(s) with secrets dropped` : '';
  return [it];
}

module.exports = { kind, scan, memoryDirs, mergeBlock, NOTEPAD_TEMPLATE };
