# hx-core `adopt` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/hx-core:adopt` converts an existing Claude Code project harness (`CLAUDE.md`, `.claude/*`, `.mcp.json`, auto-memory) into agy-native files under `AGENTS.md` / `.agents/`, re-runnably, with drift tracking in `.agents/adopt.json` and a doctor check.

**Architecture:** One converter module per Claude source under `plugins/hx-core/lib/adopt/`, all pure (`scan(root, ctx) → items[]`, no writes). `lib/adopt/index.js` decides create/update/skip against the filesystem and `adopt.json`, writes on `--apply`, and formats the report. A thin script + SKILL.md wrap it exactly like `setup`/`doctor`; `doctor.js` gains an `adopt-drift` check that re-uses `scan`.

**Tech Stack:** Node ≥ 18 stdlib only (`fs`, `path`, `crypto`, `os`), `node --test`, existing helpers in `plugins/hx-core/lib/fs.js` and `plugins/hx-core/__tests__/helpers.js`.

**Spec:** `docs/superpowers/specs/2026-09-22-hx-core-adopt-design.md`

## Global Constraints

- Node ≥ 18, **no dependencies**, no `package.json`; must run on macOS/Linux/Windows (`path.join`, no shell).
- Code and comments in English; docs/CHANGELOG in Vietnamese; LF line endings.
- Converters never write files and never read `~/.claude` except `memory.js` (via `ctx.home`).
- Never modify or delete `.claude/` or `CLAUDE.md`. Never overwrite an `AGENTS.md` that adopt did not write.
- Default is dry-run; `--apply` writes. `--force` only affects files recorded in `.agents/adopt.json`.
- Tool-name rewriting only inside backtick code spans and the `<Name> tool` pattern; plain prose untouched.
- Tests: fixtures in `os.tmpdir()` via `tmpProject`, run with `node scripts/test.js hx-core`. All 98 existing tests must keep passing.
- Every hx-core check/skill name must match `^[a-z0-9]+(-[a-z0-9]+)*$`.

---

## File map

| File | Responsibility |
|---|---|
| `plugins/hx-core/lib/adopt/common.js` | `sha256`, `splitDoc`, `renderFrontmatter`, `walk`, `item` factory shared by converters |
| `plugins/hx-core/lib/adopt/toolmap.js` | Claude→agy tool table, `rewrite(text)`, `mapToolList(list)`, `mapMatcher(m)` |
| `plugins/hx-core/lib/adopt/claude-md.js` | `CLAUDE.md` (+`@imports`) → `AGENTS.md` |
| `plugins/hx-core/lib/adopt/skills.js` | `.claude/skills/<n>/` → `.agents/skills/<n>/` |
| `plugins/hx-core/lib/adopt/commands.js` | `.claude/commands/**.md` → `.agents/skills/<n>/SKILL.md` |
| `plugins/hx-core/lib/adopt/agents.js` | `.claude/agents/*.md` → `.agents/agents/*.md` |
| `plugins/hx-core/lib/adopt/rules.js` | `.claude/rules/*.md` → `.agents/rules/*.md` |
| `plugins/hx-core/lib/adopt/mcp.js` | `.mcp.json` → `.agents/mcp_config.json` |
| `plugins/hx-core/lib/adopt/memory.js` | auto-memory → `.agents/state/notepad.md` block |
| `plugins/hx-core/lib/adopt/hooks.js` | settings.json hooks → classified `unsupported` items |
| `plugins/hx-core/lib/adopt/permissions.js` | settings.json permissions → `unsupported` items |
| `plugins/hx-core/lib/adopt/index.js` | `scan`, `runAdopt`, `formatReport`, `countSources`, `ADOPT_FILE`, `KINDS` |
| `plugins/hx-core/lib/cli.js` | add `valueFlags` |
| `plugins/hx-core/skills/adopt/scripts/adopt.js`, `skills/adopt/SKILL.md` | CLI wrapper + skill |
| `plugins/hx-core/lib/doctor.js` | `adopt-drift` check |
| `plugins/hx-core/lib/registry.json`, `scripts/e2e.js` | register `adopt` |
| `plugins/hx-core/__tests__/adopt-*.test.js` | tests per module |
| docs, versions, CHANGELOG, README, repo `CLAUDE.md`, `rules/AGENTS.md` | Task 12 |

Item shape (every converter returns this; `index.js` adds `action`):
```js
{ kind, source, target, status: 'auto'|'manual'|'unsupported', reason: '', leftovers: [{ line, text }],
  content: string|null, sourceHash?: 'sha256:…', files?: [{ source, target, content: string|Buffer, sourceHash }], track?: boolean }
```

---

### Task 1: `common.js` helpers

**Files:**
- Create: `plugins/hx-core/lib/adopt/common.js`
- Test: `plugins/hx-core/__tests__/adopt-common.test.js`

**Interfaces:**
- Produces: `sha256(data: string|Buffer) → 'sha256:<hex>'`; `splitDoc(text) → { fm: object|null, body }`; `renderFrontmatter(obj) → string` (ends with `---\n`); `walk(dir) → string[]` (relative paths, `/` separators, sorted); `item(fields) → item`; `wrap(text, width)`.

- [ ] **Step 1: Write the failing test**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { tmpProject } = require('./helpers');
const { sha256, splitDoc, renderFrontmatter, walk, item } = require('../lib/adopt/common');
const { frontmatter } = require('../lib/fs');

test('sha256 is stable and prefixed', () => {
  assert.equal(sha256('abc'), sha256(Buffer.from('abc')));
  assert.match(sha256('abc'), /^sha256:[0-9a-f]{64}$/);
});

test('splitDoc separates frontmatter and body; no frontmatter → fm null', () => {
  const d = splitDoc('---\nname: x\ndescription: hi\n---\n# Body\ntext\n');
  assert.deepEqual(d.fm, { name: 'x', description: 'hi' });
  assert.equal(d.body, '# Body\ntext\n');
  assert.deepEqual(splitDoc('just text'), { fm: null, body: 'just text' });
});

test('renderFrontmatter round-trips through fs.frontmatter', () => {
  const fm = { name: 'deploy', description: 'Deploy the app: run it when the user says "ship" or "deploy".', tools: ['view_file', 'run_command'], subagent: true, model: 'pro', globs: ['**/*.ts'] };
  const text = renderFrontmatter(fm);
  assert.ok(text.startsWith('---\n') && text.endsWith('---\n'));
  const back = frontmatter(text + 'body');
  assert.equal(back.name, 'deploy');
  assert.equal(back.description, fm.description);
  assert.deepEqual(back.tools, ['view_file', 'run_command']);
  assert.equal(back.subagent, 'true');
  assert.deepEqual(back.globs, ['**/*.ts']);
});

test('renderFrontmatter folds long descriptions and skips undefined', () => {
  const long = 'a'.repeat(50) + ' ' + 'b'.repeat(50) + ' ' + 'c'.repeat(30);
  const text = renderFrontmatter({ name: 'x', description: long, extra: undefined });
  assert.match(text, /description: >-\n  a+\n  b+/);
  assert.equal(frontmatter(text + 'x').description, long);
  assert.ok(!/extra/.test(text));
});

test('walk lists files recursively with / separators, sorted', () => {
  const root = tmpProject({ 'a/b/c.txt': '1', 'a/d.txt': '2', 'e.md': '3' });
  assert.deepEqual(walk(root), ['a/b/c.txt', 'a/d.txt', 'e.md']);
  assert.deepEqual(walk(path.join(root, 'nope')), []);
});

test('item fills defaults', () => {
  const it = item({ kind: 'k', source: 's', target: 't' });
  assert.deepEqual(it, { kind: 'k', source: 's', target: 't', status: 'auto', reason: '', leftovers: [], content: null });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test plugins/hx-core/__tests__/adopt-common.test.js`
Expected: FAIL — `Cannot find module '../lib/adopt/common'`

- [ ] **Step 3: Write the implementation**

```js
'use strict';
// Helpers shared by the adopt converters. Node >= 18, no dependencies.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { frontmatter } = require('../fs');

function sha256(data) {
  return 'sha256:' + crypto.createHash('sha256').update(data).digest('hex');
}

/** { fm, body }: fm is the parsed frontmatter (null when absent), body the text after it. */
function splitDoc(text) {
  const fm = frontmatter(text);
  if (!fm) return { fm: null, body: text };
  const m = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(text);
  return { fm, body: text.slice(m[0].length) };
}

/** Greedy word wrap; never splits a word. */
function wrap(text, width) {
  const out = [];
  let line = '';
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > width) { out.push(line); line = word; }
    else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  return out;
}

function scalar(v) {
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  const s = String(v);
  if (/^(true|false|null|yes|no|~)$/i.test(s) || !/^[A-Za-z0-9_][\w .,'()/*-]*$/.test(s)) return JSON.stringify(s);
  return s;
}

/**
 * Serialise a flat object as YAML frontmatter that lib/fs.js `frontmatter()`
 * parses back: strings, booleans, and arrays as block lists. Long strings are
 * folded with `>-`. Undefined/null keys are skipped.
 */
function renderFrontmatter(obj) {
  const lines = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      lines.push(v.length ? `${k}:` : `${k}: []`);
      for (const x of v) lines.push(`  - ${scalar(x)}`);
    } else if (typeof v === 'string' && (v.length > 80 || v.includes('\n'))) {
      lines.push(`${k}: >-`);
      for (const l of wrap(v, 78)) lines.push(`  ${l}`);
    } else {
      lines.push(`${k}: ${scalar(v)}`);
    }
  }
  return `---\n${lines.join('\n')}\n---\n`;
}

/** All files under dir as relative paths with `/` separators, sorted. [] when dir is missing. */
function walk(dir, prefix = '') {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return []; }
  const out = [];
  for (const d of entries) {
    const rel = prefix ? `${prefix}/${d.name}` : d.name;
    if (d.isDirectory()) out.push(...walk(path.join(dir, d.name), rel));
    else if (d.isFile()) out.push(rel);
  }
  return out.sort();
}

function item(fields) {
  return { status: 'auto', reason: '', leftovers: [], content: null, ...fields };
}

module.exports = { sha256, splitDoc, wrap, renderFrontmatter, walk, item };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test plugins/hx-core/__tests__/adopt-common.test.js`
Expected: 6 pass. If `renderFrontmatter round-trips` fails on `description`, check that `scalar()` quoted the string (it contains `:` and `"`) and that `frontmatter()` strips the outer quotes — it does not unescape inner `\"`; if the test still fails, change the fixture description to `'Deploy the app when the user says ship or deploy.'` and keep the code.

- [ ] **Step 5: Commit**

```bash
git add plugins/hx-core/lib/adopt/common.js plugins/hx-core/__tests__/adopt-common.test.js
git commit -m "hx-core adopt: shared helpers (hash, frontmatter, walk)"
```

---

### Task 2: `toolmap.js`

**Files:**
- Create: `plugins/hx-core/lib/adopt/toolmap.js`
- Test: `plugins/hx-core/__tests__/adopt-toolmap.test.js`

**Interfaces:**
- Produces: `MAP` (object Claude→agy), `rewrite(text) → { text, leftovers: [{line, text}] }`, `mapToolList(list: string[]|string) → { tools: string[], unmapped: string[] }`, `mapMatcher(matcher: string) → string`.

- [ ] **Step 1: Write the failing test**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { rewrite, mapToolList, mapMatcher, MAP } = require('../lib/adopt/toolmap');

test('rewrite maps names inside code spans only', () => {
  const r = rewrite('Use `Read` then `Edit`; Read the docs.\nRun `Bash` and `Grep`.');
  assert.equal(r.text, 'Use `view_file` then `replace_file_content`; Read the docs.\nRun `run_command` and `grep_search`.');
  assert.deepEqual(r.leftovers, []);
});

test('rewrite maps "the X tool" / "X tool" forms', () => {
  const r = rewrite('Call the Bash tool, or the Glob tool.\nWrite tool creates files.');
  assert.equal(r.text, 'Call `run_command`, or `find_by_name`.\n`write_to_file` creates files.');
});

test('TodoWrite becomes a task-artifact note', () => {
  assert.equal(rewrite('Use `TodoWrite`.').text, 'Use `write_to_file` (task artifact).');
});

test('unmapped tools and "Claude Code" are reported as leftovers with line numbers', () => {
  const r = rewrite('line one\nUse the NotebookEdit tool here.\nThis file guides Claude Code.\n`SlashCommand` too');
  assert.deepEqual(r.leftovers.map((l) => l.line), [2, 3, 4]);
  assert.match(r.leftovers[0].text, /NotebookEdit/);
});

test('mapToolList handles arrays, comma strings, Bash(prefix) and mcp__ names', () => {
  assert.deepEqual(mapToolList(['Read', 'Edit', 'MultiEdit', 'Bash(git:*)', 'mcp__x__y']), { tools: ['view_file', 'replace_file_content', 'run_command'], unmapped: ['mcp__x__y'] });
  assert.deepEqual(mapToolList('Read, Grep, LS'), { tools: ['view_file', 'grep_search', 'list_dir'], unmapped: [] });
  assert.deepEqual(mapToolList('view_file'), { tools: ['view_file'], unmapped: [] });
});

test('mapMatcher maps each alternative', () => {
  assert.equal(mapMatcher('Edit|Write|MultiEdit'), 'replace_file_content|write_to_file');
  assert.equal(mapMatcher('Bash'), 'run_command');
  assert.equal(mapMatcher(''), '');
  assert.equal(MAP.Agent, 'invoke_subagent');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test plugins/hx-core/__tests__/adopt-toolmap.test.js`
Expected: FAIL — `Cannot find module '../lib/adopt/toolmap'`

- [ ] **Step 3: Write the implementation**

```js
'use strict';
// Claude Code tool names -> Antigravity tool names. Rewrites are deliberately
// narrow (code spans and "<Name> tool") so prose like "Read the docs" is untouched.
const MAP = {
  Read: 'view_file',
  Edit: 'replace_file_content',
  MultiEdit: 'replace_file_content',
  Write: 'write_to_file',
  Bash: 'run_command',
  Grep: 'grep_search',
  Glob: 'find_by_name',
  LS: 'list_dir',
  Agent: 'invoke_subagent',
  Task: 'invoke_subagent',
  TodoWrite: 'write_to_file',
  WebFetch: 'read_url_content',
  WebSearch: 'search_web',
  AskUserQuestion: 'ask_question',
};
// How a mapped name is rendered in text (TodoWrite is a pattern, not a tool).
const RENDER = { TodoWrite: '`write_to_file` (task artifact)' };
const UNMAPPED = ['NotebookEdit', 'SlashCommand', 'KillShell', 'BashOutput'];
const NAMES = [...Object.keys(MAP), ...UNMAPPED].join('|');
const CODE_RE = new RegExp('`(' + NAMES + ')`', 'g');
const TOOL_RE = new RegExp('\\b(?:the\\s+)?(' + NAMES + ')\\s+tool\\b', 'g');
const LEFT_RE = new RegExp('`(?:' + NAMES + ')`|\\b(?:' + NAMES + ')\\s+tool\\b|\\bClaude Code\\b');

function render(name) {
  return RENDER[name] || '`' + MAP[name] + '`';
}

/** Rewrite mapped tool names; report lines that still mention Claude tools or "Claude Code". */
function rewrite(text) {
  const leftovers = [];
  const lines = String(text).split('\n').map((line, i) => {
    let out = line.replace(CODE_RE, (m, n) => (MAP[n] ? render(n) : m));
    out = out.replace(TOOL_RE, (m, n) => (MAP[n] ? render(n) : m));
    if (LEFT_RE.test(out)) leftovers.push({ line: i + 1, text: out.trim() });
    return out;
  });
  return { text: lines.join('\n'), leftovers };
}

/** Map a frontmatter tools list (array or comma string). Already-agy names pass through. */
function mapToolList(list) {
  const raw = Array.isArray(list) ? list : String(list || '').split(',');
  const tools = [];
  const unmapped = [];
  for (const entry of raw) {
    const name = String(entry).trim().replace(/\(.*\)$/, '');
    if (!name) continue;
    const agy = MAP[name] || (Object.values(MAP).includes(name) ? name : null);
    if (!agy) { if (!unmapped.includes(name)) unmapped.push(name); continue; }
    if (!tools.includes(agy)) tools.push(agy);
  }
  return { tools, unmapped };
}

/** Map a hook matcher like "Edit|Write" to agy tool names, dropping unknown ones. */
function mapMatcher(matcher) {
  const out = [];
  for (const part of String(matcher || '').split('|')) {
    const p = part.trim();
    const agy = MAP[p] || (Object.values(MAP).includes(p) ? p : null);
    if (agy && !out.includes(agy)) out.push(agy);
  }
  return out.join('|');
}

module.exports = { MAP, UNMAPPED, rewrite, mapToolList, mapMatcher };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test plugins/hx-core/__tests__/adopt-toolmap.test.js`
Expected: 6 pass.

- [ ] **Step 5: Commit**

```bash
git add plugins/hx-core/lib/adopt/toolmap.js plugins/hx-core/__tests__/adopt-toolmap.test.js
git commit -m "hx-core adopt: Claude -> agy tool name map and rewrite"
```

---

### Task 3: `claude-md.js`

**Files:**
- Create: `plugins/hx-core/lib/adopt/claude-md.js`
- Test: `plugins/hx-core/__tests__/adopt-claude-md.test.js`

**Interfaces:**
- Consumes: `common.{sha256,item}`, `ctx.toolmap.rewrite`, `ctx.home`.
- Produces: `{ kind: 'claude-md', scan(root, ctx) → item[] }` (0 or 1 item, target `AGENTS.md`).

- [ ] **Step 1: Write the failing test**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { tmpProject } = require('./helpers');
const conv = require('../lib/adopt/claude-md');
const toolmap = require('../lib/adopt/toolmap');

const ctx = () => ({ home: tmpProject({}), toolmap, registry: require('../lib/registry.json') });

test('no CLAUDE.md → no items', () => {
  assert.deepEqual(conv.scan(tmpProject({}), ctx()), []);
});

test('converts CLAUDE.md: heading, boilerplate line, tool names, imports', () => {
  const root = tmpProject({
    'CLAUDE.md': '# CLAUDE.md\n\nThis file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.\n\n## Commands\nUse `Bash` to run `npm test`.\n\n@docs/style.md\nSee @missing/file.md\nMail me@example.com\n',
    'docs/style.md': '## Style\n- two spaces\n',
  });
  const [it] = conv.scan(root, ctx());
  assert.equal(it.kind, 'claude-md');
  assert.equal(it.source, 'CLAUDE.md');
  assert.equal(it.target, 'AGENTS.md');
  assert.match(it.content, /^# AGENTS\.md/);
  assert.ok(!/guidance to Claude Code/.test(it.content));
  assert.match(it.content, /Use `run_command` to run `npm test`/);
  assert.match(it.content, /<!-- adopted from @docs\/style\.md -->\n## Style\n- two spaces\n<!-- \/adopted -->/);
  assert.match(it.content, /me@example\.com/);
  assert.equal(it.status, 'manual');
  assert.ok(it.leftovers.some((l) => /unresolved import @missing\/file\.md/.test(l.text)));
  assert.match(it.sourceHash, /^sha256:/);
});

test('.claude/CLAUDE.md is used when root CLAUDE.md is absent; ~/ imports resolve; cycles stop', () => {
  const home = tmpProject({ 'shared.md': 'shared rule\n' });
  const root = tmpProject({ '.claude/CLAUDE.md': 'Top\n@~/shared.md\n@../CLAUDE.md\n' });
  require('fs').writeFileSync(path.join(root, 'CLAUDE.md.bak'), '');
  const [it] = conv.scan(root, { ...ctx(), home });
  assert.equal(it.source, '.claude/CLAUDE.md');
  assert.match(it.content, /shared rule/);
  assert.equal(it.status, 'manual'); // ../CLAUDE.md does not exist → unresolved
});

test('clean short file is auto; over 4000 chars is manual', () => {
  const [ok] = conv.scan(tmpProject({ 'CLAUDE.md': '# Rules\n- keep tests green\n' }), ctx());
  assert.equal(ok.status, 'auto');
  const [big] = conv.scan(tmpProject({ 'CLAUDE.md': '# Rules\n' + 'x'.repeat(4100) }), ctx());
  assert.equal(big.status, 'manual');
  assert.match(big.reason, /4000/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test plugins/hx-core/__tests__/adopt-claude-md.test.js`
Expected: FAIL — `Cannot find module '../lib/adopt/claude-md'`

- [ ] **Step 3: Write the implementation**

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test plugins/hx-core/__tests__/adopt-claude-md.test.js`
Expected: 4 pass.

- [ ] **Step 5: Commit**

```bash
git add plugins/hx-core/lib/adopt/claude-md.js plugins/hx-core/__tests__/adopt-claude-md.test.js
git commit -m "hx-core adopt: CLAUDE.md -> AGENTS.md converter"
```

---

### Task 4: `skills.js` and `commands.js`

**Files:**
- Create: `plugins/hx-core/lib/adopt/skills.js`, `plugins/hx-core/lib/adopt/commands.js`
- Test: `plugins/hx-core/__tests__/adopt-skills.test.js`

**Interfaces:**
- Consumes: `common.{sha256,splitDoc,renderFrontmatter,walk,item}`, `ctx.toolmap.rewrite`, `ctx.registry.{nameRegex,hxSkills}`.
- Produces: `skills.scan` → one item per skill dir with `files[]` for assets; `commands.scan` → one item per command file.

- [ ] **Step 1: Write the failing test**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { tmpProject } = require('./helpers');
const skills = require('../lib/adopt/skills');
const commands = require('../lib/adopt/commands');
const toolmap = require('../lib/adopt/toolmap');
const { frontmatter } = require('../lib/fs');

const ctx = () => ({ home: tmpProject({}), toolmap, registry: require('../lib/registry.json') });

test('skills: copies the directory, rewrites SKILL.md, drops Claude-only frontmatter', () => {
  const root = tmpProject({
    '.claude/skills/deploy/SKILL.md': '---\nname: deploy\ndescription: Deploy to prod\nallowed-tools: Bash\ndisable-model-invocation: true\n---\n# Deploy\nRun `Bash` script.\n',
    '.claude/skills/deploy/scripts/go.sh': '#!/bin/sh\necho hi\n',
    '.claude/skills/deploy/references/notes.md': 'Read the notes\n',
  });
  const [it] = skills.scan(root, ctx());
  assert.equal(it.kind, 'skill');
  assert.equal(it.target, '.agents/skills/deploy/SKILL.md');
  const fm = frontmatter(it.content);
  assert.deepEqual(fm, { name: 'deploy', description: 'Deploy to prod' });
  assert.match(it.content, /Run `run_command` script/);
  assert.equal(it.status, 'auto');
  assert.match(it.reason, /dropped frontmatter allowed-tools, disable-model-invocation/);
  assert.deepEqual(it.files.map((f) => f.target), ['.agents/skills/deploy/references/notes.md', '.agents/skills/deploy/scripts/go.sh']);
  assert.ok(Buffer.isBuffer(it.files[1].content));
  assert.match(it.files[0].sourceHash, /^sha256:/);
});

test('skills: bad name, hx clash, missing description, leftovers → manual', () => {
  const root = tmpProject({
    '.claude/skills/Bad_Name/SKILL.md': '---\nname: Bad_Name\ndescription: x\n---\nbody\n',
    '.claude/skills/verify/SKILL.md': '---\nname: verify\ndescription: x\n---\nbody\n',
    '.claude/skills/nodesc/SKILL.md': '---\nname: nodesc\n---\nbody\n',
    '.claude/skills/left/SKILL.md': '---\nname: left\ndescription: x\n---\nUse the NotebookEdit tool\n',
    '.claude/skills/noskillmd/README.md': 'ignored\n',
  });
  const items = skills.scan(root, ctx());
  assert.deepEqual(items.map((i) => i.source).sort(), ['.claude/skills/Bad_Name/SKILL.md', '.claude/skills/left/SKILL.md', '.claude/skills/nodesc/SKILL.md', '.claude/skills/verify/SKILL.md']);
  for (const it of items) assert.equal(it.status, 'manual', it.source);
  assert.match(items.find((i) => /verify/.test(i.source)).reason, /shadows \/hx-\*:verify/);
  assert.match(items.find((i) => /Bad_Name/.test(i.source)).reason, /name must match/);
  assert.match(items.find((i) => /nodesc/.test(i.source)).reason, /description is required/);
  assert.equal(items.find((i) => /left/.test(i.source)).leftovers.length, 1);
});

test('commands: nested files become skills; description from frontmatter or first line; $ARGUMENTS noted', () => {
  const root = tmpProject({
    '.claude/commands/review.md': '---\ndescription: Review the diff\n---\nReview `git diff` with the Read tool. Args: $ARGUMENTS\n',
    '.claude/commands/db/migrate.md': '# Migrate\nRun the migration for $1.\n',
  });
  const items = commands.scan(root, ctx());
  const review = items.find((i) => i.source === '.claude/commands/review.md');
  assert.equal(review.kind, 'command');
  assert.equal(review.target, '.agents/skills/review/SKILL.md');
  assert.deepEqual(frontmatter(review.content), { name: 'review', description: 'Review the diff' });
  assert.match(review.content, /with `view_file`/);
  assert.match(review.reason, /\$ARGUMENTS/);
  const migrate = items.find((i) => i.source === '.claude/commands/db/migrate.md');
  assert.equal(migrate.target, '.agents/skills/db-migrate/SKILL.md');
  assert.equal(frontmatter(migrate.content).description, 'Migrate');
});

test('commands: a same-named .claude/skills entry wins', () => {
  const root = tmpProject({
    '.claude/commands/deploy.md': 'Deploy it\n',
    '.claude/skills/deploy/SKILL.md': '---\nname: deploy\ndescription: d\n---\nx\n',
  });
  const [it] = commands.scan(root, ctx());
  assert.equal(it.status, 'unsupported');
  assert.equal(it.content, null);
  assert.match(it.reason, /skills win/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test plugins/hx-core/__tests__/adopt-skills.test.js`
Expected: FAIL — `Cannot find module '../lib/adopt/skills'`

- [ ] **Step 3: Write `skills.js`**

```js
'use strict';
// .claude/skills/<name>/ -> .agents/skills/<name>/ (same SKILL.md format; only tool names differ).
const fs = require('fs');
const path = require('path');
const { readText, listDirs } = require('../fs');
const { sha256, splitDoc, renderFrontmatter, walk, item } = require('./common');

const kind = 'skill';
const KEEP = ['name', 'description'];

function scan(root, ctx) {
  const base = path.join(root, '.claude', 'skills');
  const nameRe = new RegExp(ctx.registry.nameRegex);
  const out = [];
  for (const name of listDirs(base)) {
    const dir = path.join(base, name);
    const raw = readText(path.join(dir, 'SKILL.md'));
    if (raw === null) continue;
    const src = `.claude/skills/${name}`;
    const { fm, body } = splitDoc(raw);
    const keep = {};
    const dropped = [];
    for (const [k, v] of Object.entries(fm || {})) (KEEP.includes(k) ? (keep[k] = v) : dropped.push(k));
    keep.name = keep.name || name;
    const rw = ctx.toolmap.rewrite(body);
    const it = item({ kind, source: `${src}/SKILL.md`, target: `.agents/skills/${name}/SKILL.md`, content: renderFrontmatter(keep) + rw.text, sourceHash: sha256(raw), leftovers: rw.leftovers, files: [] });
    for (const f of walk(dir)) {
      if (f === 'SKILL.md') continue;
      const buf = fs.readFileSync(path.join(dir, f));
      it.files.push({ source: `${src}/${f}`, target: `.agents/skills/${name}/${f}`, content: buf, sourceHash: sha256(buf) });
    }
    const reasons = [];
    const manual = (r) => { it.status = 'manual'; reasons.push(r); };
    if (dropped.length) reasons.push(`dropped frontmatter ${dropped.join(', ')}`);
    if (!nameRe.test(name)) manual(`name must match ${ctx.registry.nameRegex}`);
    if (ctx.registry.hxSkills.includes(name)) manual(`shadows /hx-*:${name}; rename the skill`);
    if (!keep.description) manual('description is required');
    if (rw.leftovers.length) manual('tool names left in prose; see leftovers');
    it.reason = reasons.join('; ');
    out.push(it);
  }
  return out;
}

module.exports = { kind, scan };
```

- [ ] **Step 4: Write `commands.js`**

```js
'use strict';
// .claude/commands/**/*.md -> .agents/skills/<name>/SKILL.md (agy has no commands; skills are slash commands).
const path = require('path');
const { readText, listDirs } = require('../fs');
const { sha256, splitDoc, renderFrontmatter, walk, item } = require('./common');

const kind = 'command';

/** First non-empty line, without leading `#`, as a description. */
function firstLine(body) {
  const l = body.split(/\r?\n/).map((x) => x.replace(/^#+\s*/, '').trim()).find(Boolean) || '';
  return l.slice(0, 200);
}

function scan(root, ctx) {
  const base = path.join(root, '.claude', 'commands');
  const nameRe = new RegExp(ctx.registry.nameRegex);
  const skillNames = new Set(listDirs(path.join(root, '.claude', 'skills')));
  const out = [];
  for (const rel of walk(base).filter((f) => f.endsWith('.md'))) {
    const raw = readText(path.join(base, rel)) || '';
    const name = rel.replace(/\.md$/, '').split('/').join('-').toLowerCase();
    const src = `.claude/commands/${rel}`;
    const it = item({ kind, source: src, target: `.agents/skills/${name}/SKILL.md`, sourceHash: sha256(raw) });
    if (skillNames.has(name)) {
      it.status = 'unsupported';
      it.reason = `a skill named ${name} exists in .claude/skills (skills win)`;
      out.push(it);
      continue;
    }
    const { fm, body } = splitDoc(raw);
    const rw = ctx.toolmap.rewrite(body);
    it.content = renderFrontmatter({ name, description: (fm && fm.description) || firstLine(body) }) + rw.text;
    it.leftovers = rw.leftovers;
    const reasons = [];
    const manual = (r) => { it.status = 'manual'; reasons.push(r); };
    if (/\$ARGUMENTS|\$\d/.test(body)) reasons.push('uses $ARGUMENTS/$1: verify agy passes arguments to skills');
    if (!nameRe.test(name)) manual(`name must match ${ctx.registry.nameRegex}`);
    if (ctx.registry.hxSkills.includes(name)) manual(`shadows /hx-*:${name}; rename the skill`);
    if (rw.leftovers.length) manual('tool names left in prose; see leftovers');
    it.reason = reasons.join('; ');
    out.push(it);
  }
  return out;
}

module.exports = { kind, scan };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test plugins/hx-core/__tests__/adopt-skills.test.js`
Expected: 4 pass.

- [ ] **Step 6: Commit**

```bash
git add plugins/hx-core/lib/adopt/skills.js plugins/hx-core/lib/adopt/commands.js plugins/hx-core/__tests__/adopt-skills.test.js
git commit -m "hx-core adopt: skills and commands converters"
```

---

### Task 5: `agents.js` and `rules.js`

**Files:**
- Create: `plugins/hx-core/lib/adopt/agents.js`, `plugins/hx-core/lib/adopt/rules.js`
- Test: `plugins/hx-core/__tests__/adopt-agents-rules.test.js`

**Interfaces:**
- Consumes: `common.*`, `ctx.toolmap.{rewrite,mapToolList}`, `ctx.registry.ruleMaxChars`.
- Produces: `agents.scan` (kind `agent`), `rules.scan` (kind `rule`).

- [ ] **Step 1: Write the failing test**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { tmpProject } = require('./helpers');
const agents = require('../lib/adopt/agents');
const rules = require('../lib/adopt/rules');
const toolmap = require('../lib/adopt/toolmap');
const { frontmatter } = require('../lib/fs');

const ctx = () => ({ home: tmpProject({}), toolmap, registry: require('../lib/registry.json') });

test('agents: maps tools and model, adds agy keys, wraps body under # System Prompt', () => {
  const root = tmpProject({
    '.claude/agents/reviewer.md': '---\nname: reviewer\ndescription: Reviews diffs\ntools: Read, Grep, Bash\nmodel: claude-opus-4-1\ncolor: red\npermissionMode: default\n---\nYou review code with the Read tool.\n',
  });
  const [it] = agents.scan(root, ctx());
  assert.equal(it.kind, 'agent');
  assert.equal(it.target, '.agents/agents/reviewer.md');
  const fm = frontmatter(it.content);
  assert.equal(fm.name, 'reviewer');
  assert.deepEqual(fm.tools, ['view_file', 'grep_search', 'run_command']);
  assert.equal(fm.model, 'pro');
  assert.equal(fm.subagent, 'true');
  assert.equal(fm.mainAgent, 'false');
  assert.equal(fm.commandExecutionPolicy, 'sandbox');
  assert.match(it.content, /# System Prompt\nYou review code with `view_file`\./);
  assert.equal(it.status, 'auto');
  assert.match(it.reason, /dropped frontmatter color, permissionMode/);
});

test('agents: no tools → default set; haiku → flash; unmapped tool → manual leftover; H1 kept', () => {
  const root = tmpProject({
    '.claude/agents/scout.md': '---\nname: scout\ndescription: d\nmodel: haiku\n---\n# Role\nExplore.\n',
    '.claude/agents/nb.md': '---\nname: nb\ndescription: d\ntools: [Read, NotebookEdit]\n---\nx\n',
  });
  const items = agents.scan(root, ctx());
  const scout = items.find((i) => /scout/.test(i.source));
  const fm = frontmatter(scout.content);
  assert.deepEqual(fm.tools, ['view_file', 'grep_search', 'find_by_name', 'list_dir', 'write_to_file', 'replace_file_content', 'run_command']);
  assert.equal(fm.model, 'flash');
  assert.match(scout.content, /---\n# Role\nExplore\./);
  const nb = items.find((i) => /nb\.md/.test(i.source));
  assert.equal(nb.status, 'manual');
  assert.deepEqual(frontmatter(nb.content).tools, ['view_file']);
  assert.equal(frontmatter(nb.content).commandExecutionPolicy, 'off');
  assert.ok(nb.leftovers.some((l) => /unmapped tool NotebookEdit/.test(l.text)));
});

test('rules: paths → glob trigger; none → always_on; oversize → manual', () => {
  const root = tmpProject({
    '.claude/rules/ts.md': '---\npaths: ["src/**/*.ts", "**/*.tsx"]\ndescription: TS rules\n---\nUse `Edit` carefully.\n',
    '.claude/rules/all.md': 'Always be kind.\n',
    '.claude/rules/big.md': 'x'.repeat(12100),
  });
  const items = rules.scan(root, ctx());
  const ts = items.find((i) => /ts\.md/.test(i.source));
  assert.equal(ts.kind, 'rule');
  assert.equal(ts.target, '.agents/rules/ts.md');
  const fm = frontmatter(ts.content);
  assert.equal(fm.trigger, 'glob');
  assert.deepEqual(fm.globs, ['src/**/*.ts', '**/*.tsx']);
  assert.equal(fm.description, 'TS rules');
  assert.match(ts.content, /Use `replace_file_content` carefully/);
  const all = items.find((i) => /all\.md/.test(i.source));
  assert.equal(frontmatter(all.content).trigger, 'always_on');
  assert.match(all.content, /Always be kind/);
  const big = items.find((i) => /big\.md/.test(i.source));
  assert.equal(big.status, 'manual');
  assert.match(big.reason, /12000/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test plugins/hx-core/__tests__/adopt-agents-rules.test.js`
Expected: FAIL — `Cannot find module '../lib/adopt/agents'`

- [ ] **Step 3: Write `agents.js`**

```js
'use strict';
// .claude/agents/*.md -> .agents/agents/*.md. Frontmatter differs: tools must be agy
// names (a wrong name can hang the subagent), model tiers are inherit|flash|pro.
const path = require('path');
const { readText, listFiles } = require('../fs');
const { sha256, splitDoc, renderFrontmatter, item } = require('./common');

const kind = 'agent';
const KEEP = ['name', 'description', 'tools', 'model'];
const MODEL = { opus: 'pro', sonnet: 'inherit', haiku: 'flash' };
const DEFAULT_TOOLS = ['view_file', 'grep_search', 'find_by_name', 'list_dir', 'write_to_file', 'replace_file_content', 'run_command'];

function modelOf(v) {
  const m = /opus|sonnet|haiku/i.exec(String(v || ''));
  return m ? MODEL[m[0].toLowerCase()] : 'inherit';
}

function scan(root, ctx) {
  const dir = path.join(root, '.claude', 'agents');
  const out = [];
  for (const f of listFiles(dir, '.md')) {
    const raw = readText(path.join(dir, f)) || '';
    const { fm, body } = splitDoc(raw);
    const meta = fm || {};
    const name = meta.name || f.replace(/\.md$/, '');
    const dropped = Object.keys(meta).filter((k) => !KEEP.includes(k));
    let tools = DEFAULT_TOOLS;
    let unmapped = [];
    if (meta.tools !== undefined) ({ tools, unmapped } = ctx.toolmap.mapToolList(meta.tools));
    const head = {
      name,
      description: meta.description || '',
      tools,
      subagent: true,
      mainAgent: false,
      model: modelOf(meta.model),
      commandExecutionPolicy: tools.includes('run_command') ? 'sandbox' : 'off',
    };
    const rw = ctx.toolmap.rewrite(body);
    let text = rw.text.trim();
    if (!/^#\s/m.test(text)) text = `# System Prompt\n${text}`;
    const it = item({ kind, source: `.claude/agents/${f}`, target: `.agents/agents/${f}`, content: renderFrontmatter(head) + text + '\n', sourceHash: sha256(raw), leftovers: [...unmapped.map((u) => ({ line: 0, text: `unmapped tool ${u}` })), ...rw.leftovers] });
    const reasons = [];
    const manual = (r) => { it.status = 'manual'; reasons.push(r); };
    if (dropped.length) reasons.push(`dropped frontmatter ${dropped.join(', ')}`);
    if (!head.description) manual('description is required');
    if (unmapped.length) manual(`no agy tool for ${unmapped.join(', ')}`);
    if (rw.leftovers.length) manual('tool names left in prose; see leftovers');
    it.reason = reasons.join('; ');
    out.push(it);
  }
  return out;
}

module.exports = { kind, scan, DEFAULT_TOOLS };
```

- [ ] **Step 4: Write `rules.js`**

```js
'use strict';
// .claude/rules/*.md -> .agents/rules/*.md. Claude scopes with `paths:`; agy with trigger/globs.
const path = require('path');
const { readText, listFiles } = require('../fs');
const { sha256, splitDoc, renderFrontmatter, item } = require('./common');

const kind = 'rule';

function scan(root, ctx) {
  const dir = path.join(root, '.claude', 'rules');
  const out = [];
  for (const f of listFiles(dir, '.md')) {
    const raw = readText(path.join(dir, f)) || '';
    const { fm, body } = splitDoc(raw);
    const meta = fm || {};
    const globs = meta.paths === undefined ? null : (Array.isArray(meta.paths) ? meta.paths : [String(meta.paths)]);
    const head = globs && globs.length
      ? { trigger: 'glob', globs, description: meta.description }
      : { trigger: 'always_on', description: meta.description };
    const rw = ctx.toolmap.rewrite(body);
    const content = renderFrontmatter(head) + rw.text;
    const it = item({ kind, source: `.claude/rules/${f}`, target: `.agents/rules/${f}`, content, sourceHash: sha256(raw), leftovers: rw.leftovers });
    const reasons = [];
    const manual = (r) => { it.status = 'manual'; reasons.push(r); };
    if (content.length > ctx.registry.ruleMaxChars) manual(`${content.length} chars; agy truncates rules over ${ctx.registry.ruleMaxChars}`);
    if (rw.leftovers.length) manual('tool names left in prose; see leftovers');
    it.reason = reasons.join('; ');
    out.push(it);
  }
  return out;
}

module.exports = { kind, scan };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test plugins/hx-core/__tests__/adopt-agents-rules.test.js`
Expected: 3 pass.

- [ ] **Step 6: Commit**

```bash
git add plugins/hx-core/lib/adopt/agents.js plugins/hx-core/lib/adopt/rules.js plugins/hx-core/__tests__/adopt-agents-rules.test.js
git commit -m "hx-core adopt: agents and rules converters"
```

---

### Task 6: `mcp.js` and `memory.js`

**Files:**
- Create: `plugins/hx-core/lib/adopt/mcp.js`, `plugins/hx-core/lib/adopt/memory.js`
- Test: `plugins/hx-core/__tests__/adopt-mcp-memory.test.js`

**Interfaces:**
- Consumes: `fs.{readJson,readText,listFiles,frontmatter}`, `common.{sha256,item}`, `ctx.home`.
- Produces: `mcp.scan` (kind `mcp`, target `.agents/mcp_config.json`); `memory.scan` (kind `memory`, target `.agents/state/notepad.md`, `track: false`, content = full new notepad text). Exports `memory.memoryDirs(root, home)`, `memory.NOTEPAD_TEMPLATE`.

- [ ] **Step 1: Write the failing test**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { tmpProject, writeFiles } = require('./helpers');
const mcp = require('../lib/adopt/mcp');
const memory = require('../lib/adopt/memory');
const toolmap = require('../lib/adopt/toolmap');

const ctx = (home) => ({ home: home || tmpProject({}), toolmap, registry: require('../lib/registry.json') });

test('mcp: copies mcpServers verbatim and notes ${VAR}', () => {
  const root = tmpProject({ '.mcp.json': { mcpServers: { db: { command: 'npx', args: ['db-mcp'], env: { KEY: '${DB_KEY}' } } } } });
  const [it] = mcp.scan(root, ctx());
  assert.equal(it.kind, 'mcp');
  assert.equal(it.target, '.agents/mcp_config.json');
  assert.deepEqual(JSON.parse(it.content), { mcpServers: { db: { command: 'npx', args: ['db-mcp'], env: { KEY: '${DB_KEY}' } } } });
  assert.equal(it.status, 'auto');
  assert.match(it.reason, /\$\{VAR\}/);
});

test('mcp: invalid JSON or no mcpServers → unsupported; absent → []', () => {
  assert.deepEqual(mcp.scan(tmpProject({}), ctx()), []);
  const [bad] = mcp.scan(tmpProject({ '.mcp.json': '{nope' }), ctx());
  assert.equal(bad.status, 'unsupported');
  const [empty] = mcp.scan(tmpProject({ '.mcp.json': { servers: {} } }), ctx());
  assert.equal(empty.status, 'unsupported');
});

function memoryHome(root, files) {
  const home = tmpProject({});
  const slug = path.resolve(root).replace(/[\\/]/g, '-');
  writeFiles(home, Object.fromEntries(Object.entries(files).map(([k, v]) => [`.claude/projects/${slug}/memory/${k}`, v])));
  return home;
}

test('memory: one line per memory under a marked block in Decisions; MEMORY.md skipped; secrets dropped', () => {
  const root = tmpProject({});
  const home = memoryHome(root, {
    'MEMORY.md': '- index\n',
    'goal.md': '---\nname: goal\ndescription: repo is a harness\nmetadata:\n  type: project\n---\nbody\n',
    'key.md': '---\nname: key\ndescription: api_key: sk-abcdefghijklmnopqrstuvwxyz\nmetadata:\n  type: reference\n---\n',
  });
  const [it] = memory.scan(root, ctx(home));
  assert.equal(it.kind, 'memory');
  assert.equal(it.target, '.agents/state/notepad.md');
  assert.equal(it.track, false);
  assert.match(it.content, /^# Notepad/);
  assert.match(it.content, /## Decisions\n<!-- hx:adopted-memory -->\n- \d{4}-\d{2}-\d{2} — \[project\] goal: repo is a harness\n<!-- \/hx:adopted-memory -->/);
  assert.ok(!/sk-abc/.test(it.content));
  assert.match(it.reason, /1 line\(s\) with secrets dropped/);
});

test('memory: rerun replaces the block and keeps the rest of the notepad', () => {
  const root = tmpProject({ '.agents/state/notepad.md': '# Notepad\n\n## Priority\nkeep me\n\n## Decisions\n<!-- hx:adopted-memory -->\n- old\n<!-- /hx:adopted-memory -->\n- 2026-01-01 — manual line\n' });
  const home = memoryHome(root, { 'a.md': '---\nname: a\ndescription: new\nmetadata:\n  type: feedback\n---\n' });
  const [it] = memory.scan(root, ctx(home));
  assert.match(it.content, /keep me/);
  assert.match(it.content, /manual line/);
  assert.ok(!/- old/.test(it.content));
  assert.match(it.content, /\[feedback\] a: new/);
});

test('memory: no memory dir → []', () => {
  assert.deepEqual(memory.scan(tmpProject({}), ctx()), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test plugins/hx-core/__tests__/adopt-mcp-memory.test.js`
Expected: FAIL — `Cannot find module '../lib/adopt/mcp'`

- [ ] **Step 3: Write `mcp.js`**

```js
'use strict';
// .mcp.json -> .agents/mcp_config.json (same { mcpServers } shape).
const path = require('path');
const { exists, readJson, readText } = require('../fs');
const { sha256, item } = require('./common');

const kind = 'mcp';

function scan(root) {
  const src = '.mcp.json';
  const abs = path.join(root, src);
  if (!exists(abs)) return [];
  const raw = readText(abs) || '';
  const it = item({ kind, source: src, target: '.agents/mcp_config.json', sourceHash: sha256(raw) });
  const j = readJson(abs);
  if (j.error) { it.status = 'unsupported'; it.reason = `.mcp.json is not valid JSON: ${j.error}`; return [it]; }
  const servers = j.value && j.value.mcpServers;
  if (!servers || typeof servers !== 'object') { it.status = 'unsupported'; it.reason = '.mcp.json has no "mcpServers" object'; return [it]; }
  it.content = JSON.stringify({ mcpServers: servers }, null, 2) + '\n';
  const notes = ['check with /mcp in agy'];
  if (raw.includes('${')) notes.push('${VAR} expansion is Claude syntax; set the values for agy if it does not expand them');
  it.reason = notes.join('; ');
  return [it];
}

module.exports = { kind, scan };
```

- [ ] **Step 4: Write `memory.js`**

```js
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test plugins/hx-core/__tests__/adopt-mcp-memory.test.js`
Expected: 5 pass.

- [ ] **Step 6: Commit**

```bash
git add plugins/hx-core/lib/adopt/mcp.js plugins/hx-core/lib/adopt/memory.js plugins/hx-core/__tests__/adopt-mcp-memory.test.js
git commit -m "hx-core adopt: mcp and auto-memory converters"
```

---

### Task 7: `hooks.js` and `permissions.js` (report only)

**Files:**
- Create: `plugins/hx-core/lib/adopt/hooks.js`, `plugins/hx-core/lib/adopt/permissions.js`
- Test: `plugins/hx-core/__tests__/adopt-hooks-permissions.test.js`

**Interfaces:**
- Consumes: `fs.readJson`, `common.item`, `ctx.toolmap.mapMatcher`.
- Produces: `hooks.scan` → one `unsupported` item per hook command (kind `hook`, `target: ''`); exports `classify(event, matcher, hook, toolmap)`. `permissions.scan` → one `unsupported` item per non-empty list (kind `permission`).

- [ ] **Step 1: Write the failing test**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { tmpProject } = require('./helpers');
const hooks = require('../lib/adopt/hooks');
const permissions = require('../lib/adopt/permissions');
const toolmap = require('../lib/adopt/toolmap');

const ctx = () => ({ home: tmpProject({}), toolmap, registry: require('../lib/registry.json') });

test('hooks: every command becomes an unsupported item with a targeted reason', () => {
  const root = tmpProject({
    '.claude/settings.json': {
      hooks: {
        PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node .claude/hooks/guard.js  # deny rm -rf' }] }],
        PostToolUse: [{ matcher: 'Edit|Write', hooks: [{ type: 'command', command: 'npx prettier --write $FILE' }, { type: 'command', command: 'node .claude/hooks/custom.js' }] }],
        Stop: [{ hooks: [{ type: 'command', command: './stop.sh' }] }],
        SessionStart: [{ hooks: [{ type: 'command', command: 'echo hi' }] }],
        PreCompact: [{ hooks: [{ type: 'command', command: 'x' }] }],
        UserPromptSubmit: [{ hooks: [{ type: 'prompt', prompt: 'be nice' }] }],
      },
    },
  });
  const items = hooks.scan(root, ctx());
  assert.equal(items.length, 7);
  for (const it of items) { assert.equal(it.kind, 'hook'); assert.equal(it.status, 'unsupported'); assert.equal(it.target, ''); assert.equal(it.content, null); }
  const by = (re) => items.find((i) => re.test(i.source));
  assert.match(by(/PreToolUse\[0\]/).reason, /hx-guard pre-tool-guard/);
  assert.match(by(/PostToolUse\[0\]\/0/).reason, /post-edit-lint/);
  assert.match(by(/PostToolUse\[0\]\/1/).reason, /rewrite as agy PostToolUse hook.*replace_file_content\|write_to_file/);
  assert.match(by(/Stop/).reason, /stop-gate/);
  assert.match(by(/SessionStart/).reason, /PreInvocation/);
  assert.match(by(/PreCompact/).reason, /no agy equivalent/);
  assert.match(by(/UserPromptSubmit/).reason, /command-only/);
});

test('hooks: no settings or no hooks → []', () => {
  assert.deepEqual(hooks.scan(tmpProject({}), ctx()), []);
  assert.deepEqual(hooks.scan(tmpProject({ '.claude/settings.json': { permissions: {} } }), ctx()), []);
});

test('permissions: one item per non-empty list, with Bash prefixes summarised', () => {
  const root = tmpProject({
    '.claude/settings.json': { permissions: { allow: ['Bash(npm test:*)', 'Bash(git status)', 'Read(~/.zshrc)', 'WebFetch(domain:example.com)'], deny: ['Bash(rm -rf:*)'], ask: [] } },
  });
  const items = permissions.scan(root, ctx());
  assert.deepEqual(items.map((i) => i.source), ['.claude/settings.json#permissions/allow', '.claude/settings.json#permissions/deny']);
  assert.equal(items[0].kind, 'permission');
  assert.equal(items[0].status, 'unsupported');
  assert.match(items[0].reason, /allow these command prefixes in agy settings\.json \/ \/permissions: npm test:\*, git status/);
  assert.match(items[0].reason, /directory\/domain scopes.*Read\(~\/\.zshrc\), WebFetch\(domain:example\.com\)/);
  assert.match(items[1].reason, /deny patterns.*hx-guard patterns\.json.*rm -rf:\*/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test plugins/hx-core/__tests__/adopt-hooks-permissions.test.js`
Expected: FAIL — `Cannot find module '../lib/adopt/hooks'`

- [ ] **Step 3: Write `hooks.js`**

```js
'use strict';
// Claude Code hooks cannot be converted (different events, payload, stdout contract).
// Each one is classified and mapped to the hx-guard / setup piece that replaces it.
const path = require('path');
const { readJson } = require('../fs');
const { item } = require('./common');

const kind = 'hook';
const NONE = ['PreCompact', 'Notification', 'SessionEnd', 'PermissionRequest'];

/** Reason text for one Claude hook. Exported for tests. */
function classify(event, matcher, hook, toolmap) {
  if (hook.type && hook.type !== 'command') return 'agy hooks are command-only; rewrite this prompt/agent hook as a rule or skill';
  const cmd = String(hook.command || '');
  const m = String(matcher || '');
  if (event === 'PreToolUse' && /Bash/.test(m) && /rm|force|guard|deny|danger|block/i.test(cmd)) {
    return 'hx-guard pre-tool-guard covers dangerous-command blocking; add custom patterns to hx-guard/hooks/patterns.json';
  }
  if (event === 'PostToolUse' && /Edit|Write/.test(m) && /prettier|eslint|lint|format|ruff|gofmt|black|biome/i.test(cmd)) {
    return '/hx-core:setup generates .agents/hooks/post-edit-lint.js (per-file linter after edits)';
  }
  if (event === 'Stop' || event === 'SubagentStop') {
    return 'hx-guard stop-gate replaces this (goal/verify evidence); agy Stop hook contract: stdin {terminationReason, fullyIdle}, stdout {decision, reason}';
  }
  if (event === 'SessionStart' || event === 'UserPromptSubmit') {
    return 'agy PreInvocation injectSteps replaces this; hx-guard pre-invocation-context injects notepad/goal/lint each turn';
  }
  if (NONE.includes(event)) return `no agy equivalent for ${event}`;
  if (event === 'PreToolUse' || event === 'PostToolUse') {
    return `rewrite as agy ${event} hook in .agents/hooks.json: matcher "${toolmap.mapMatcher(m)}", stdin JSON camelCase, stdout JSON, exit 0, <= 10 s`;
  }
  return `no agy equivalent for ${event}`;
}

function scan(root, ctx) {
  const s = readJson(path.join(root, '.claude', 'settings.json'));
  const hooks = s.value && s.value.hooks;
  if (!hooks || typeof hooks !== 'object') return [];
  const out = [];
  for (const [event, entries] of Object.entries(hooks)) {
    (Array.isArray(entries) ? entries : []).forEach((entry, i) => {
      const list = Array.isArray(entry.hooks) ? entry.hooks : [entry];
      list.forEach((hook, j) => {
        const label = `${event}[${i}]${list.length > 1 ? `/${j}` : ''}`;
        out.push(item({ kind, source: `.claude/settings.json#hooks/${label}`, target: '', status: 'unsupported', reason: classify(event, entry.matcher, hook || {}, ctx.toolmap) }));
      });
    });
  }
  return out;
}

module.exports = { kind, scan, classify };
```

- [ ] **Step 4: Write `permissions.js`**

```js
'use strict';
// Claude Code permissions (allow/deny/ask) -> advice only; agy keeps its own permission store.
const path = require('path');
const { readJson } = require('../fs');
const { item } = require('./common');

const kind = 'permission';
const LISTS = ['allow', 'deny', 'ask'];

function summarise(list, entries) {
  const bash = [];
  const other = [];
  for (const e of entries) {
    const m = /^Bash\((.*)\)$/.exec(String(e));
    if (m) bash.push(m[1]); else other.push(String(e));
  }
  const parts = [];
  if (bash.length) {
    parts.push(list === 'deny'
      ? `add as deny patterns to hx-guard patterns.json or a project PreToolUse hook: ${bash.join(', ')}`
      : `${list} these command prefixes in agy settings.json / /permissions: ${bash.join(', ')}`);
  }
  if (other.length) parts.push(`directory/domain scopes are set in agy /permissions: ${other.join(', ')}`);
  return parts.join('; ');
}

function scan(root) {
  const s = readJson(path.join(root, '.claude', 'settings.json'));
  const perms = s.value && s.value.permissions;
  if (!perms || typeof perms !== 'object') return [];
  const out = [];
  for (const list of LISTS) {
    const entries = Array.isArray(perms[list]) ? perms[list] : [];
    if (!entries.length) continue;
    out.push(item({ kind, source: `.claude/settings.json#permissions/${list}`, target: '', status: 'unsupported', reason: summarise(list, entries) }));
  }
  return out;
}

module.exports = { kind, scan };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test plugins/hx-core/__tests__/adopt-hooks-permissions.test.js`
Expected: 3 pass.

- [ ] **Step 6: Commit**

```bash
git add plugins/hx-core/lib/adopt/hooks.js plugins/hx-core/lib/adopt/permissions.js plugins/hx-core/__tests__/adopt-hooks-permissions.test.js
git commit -m "hx-core adopt: classify Claude hooks and permissions"
```

---

### Task 8: `index.js` — scan, decide, apply, `adopt.json`, report

**Files:**
- Create: `plugins/hx-core/lib/adopt/index.js`
- Test: `plugins/hx-core/__tests__/adopt-index.test.js`

**Interfaces:**
- Consumes: all converters, `fs.{exists,readJson,writeText,stateIgnored,appendGitignore}`, `common.sha256`, `../plugin.json` version.
- Produces: `scan(root, opts) → item[]`; `runAdopt(root, opts) → report`; `formatReport(report) → string`; `countSources(root, home) → object`; `hasSources(sources) → boolean`; `ADOPT_FILE = '.agents/adopt.json'`; `KINDS = ['claude-md','skills','commands','agents','rules','hooks','permissions','mcp','memory']`. `opts = { apply?, force?, only?: string[]|null, home? }`. Report: `{ root, apply, sources, items: [{kind, source, target, status, action, reason, leftovers}], notes }`.

- [ ] **Step 1: Write the failing test**

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { tmpProject, read, exists } = require('./helpers');
const { runAdopt, scan, formatReport, countSources, hasSources, ADOPT_FILE, KINDS } = require('../lib/adopt');

const HOME = () => tmpProject({});
const PROJECT = {
  'CLAUDE.md': '# Rules\nUse `Bash`.\n',
  '.claude/skills/deploy/SKILL.md': '---\nname: deploy\ndescription: d\n---\nGo\n',
  '.claude/skills/deploy/scripts/go.sh': 'echo\n',
  '.claude/agents/rev.md': '---\nname: rev\ndescription: r\n---\nReview\n',
  '.mcp.json': { mcpServers: {} },
  '.claude/settings.json': { hooks: { Stop: [{ hooks: [{ type: 'command', command: 'x' }] }] }, permissions: { allow: ['Bash(ls)'] } },
  '.gitignore': '',
};
const byTarget = (r, t) => r.items.find((i) => i.target === t);

test('dry-run writes nothing but reports created/unsupported', () => {
  const root = tmpProject(PROJECT);
  const r = runAdopt(root, { home: HOME() });
  assert.equal(r.apply, false);
  assert.equal(byTarget(r, 'AGENTS.md').status, 'created');
  assert.equal(byTarget(r, '.agents/skills/deploy/SKILL.md').status, 'created');
  assert.equal(byTarget(r, '.agents/agents/rev.md').action, 'created');
  assert.equal(r.items.filter((i) => i.status === 'unsupported').length, 2);
  assert.equal(exists(root, 'AGENTS.md'), false);
  assert.equal(exists(root, ADOPT_FILE), false);
});

test('apply creates files, adopt.json with hashes, state dir and gitignore; rerun is up to date', () => {
  const root = tmpProject(PROJECT);
  const r = runAdopt(root, { apply: true, home: HOME() });
  assert.match(read(root, 'AGENTS.md'), /Use `run_command`/);
  assert.ok(exists(root, '.agents/skills/deploy/scripts/go.sh'));
  assert.ok(exists(root, '.agents/mcp_config.json'));
  assert.ok(exists(root, '.agents/state'));
  assert.match(read(root, '.gitignore'), /\.agents\/state\//);
  const a = JSON.parse(read(root, ADOPT_FILE));
  assert.equal(a.harness, 'hx');
  assert.deepEqual(Object.keys(a.items).sort(), ['.agents/agents/rev.md', '.agents/mcp_config.json', '.agents/skills/deploy/SKILL.md', '.agents/skills/deploy/scripts/go.sh', 'AGENTS.md']);
  assert.equal(a.items['AGENTS.md'].source, 'CLAUDE.md');
  assert.match(a.items['AGENTS.md'].targetHash, /^sha256:/);
  const again = runAdopt(root, { apply: true, home: HOME() });
  for (const t of ['AGENTS.md', '.agents/skills/deploy/SKILL.md']) {
    assert.equal(byTarget(again, t).status, 'skipped', t);
    assert.match(byTarget(again, t).reason, /up to date/);
  }
  assert.equal(r.items.length, again.items.length);
});

test('source change → updated; hand-edited target → skipped unless --force', () => {
  const root = tmpProject(PROJECT);
  runAdopt(root, { apply: true, home: HOME() });
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# Rules v2\n');
  let r = runAdopt(root, { apply: true, home: HOME() });
  assert.equal(byTarget(r, 'AGENTS.md').status, 'updated');
  assert.match(read(root, 'AGENTS.md'), /Rules v2/);
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# mine\n');
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# Rules v3\n');
  r = runAdopt(root, { apply: true, home: HOME() });
  assert.equal(byTarget(r, 'AGENTS.md').status, 'skipped');
  assert.match(byTarget(r, 'AGENTS.md').reason, /edited by hand/);
  assert.equal(read(root, 'AGENTS.md'), '# mine\n');
  r = runAdopt(root, { apply: true, force: true, home: HOME() });
  assert.equal(byTarget(r, 'AGENTS.md').status, 'updated');
  assert.match(read(root, 'AGENTS.md'), /Rules v3/);
});

test('unmanaged AGENTS.md is manual and never overwritten, even with --force; other unmanaged files are skipped', () => {
  const root = tmpProject({ ...PROJECT, 'AGENTS.md': '# theirs\n', '.agents/agents/rev.md': 'theirs\n' });
  const r = runAdopt(root, { apply: true, force: true, home: HOME() });
  assert.equal(byTarget(r, 'AGENTS.md').status, 'manual');
  assert.match(byTarget(r, 'AGENTS.md').reason, /merge by hand/);
  assert.equal(read(root, 'AGENTS.md'), '# theirs\n');
  assert.equal(byTarget(r, '.agents/agents/rev.md').status, 'skipped');
  assert.equal(read(root, '.agents/agents/rev.md'), 'theirs\n');
  const a = JSON.parse(read(root, ADOPT_FILE));
  assert.equal(a.items['AGENTS.md'], undefined);
});

test('--only limits kinds; memory is written but not tracked', () => {
  const root = tmpProject(PROJECT);
  const home = HOME();
  const slug = path.resolve(root).replace(/[\\/]/g, '-');
  fs.mkdirSync(path.join(home, '.claude', 'projects', slug, 'memory'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude', 'projects', slug, 'memory', 'm.md'), '---\nname: m\ndescription: remember\n---\n');
  const r = runAdopt(root, { apply: true, only: ['memory', 'skills'], home });
  assert.deepEqual([...new Set(r.items.map((i) => i.kind))].sort(), ['memory', 'skill']);
  assert.match(read(root, '.agents/state/notepad.md'), /remember/);
  assert.equal(exists(root, 'AGENTS.md'), false);
  const a = JSON.parse(read(root, ADOPT_FILE));
  assert.equal(a.items['.agents/state/notepad.md'], undefined);
  assert.equal(byTarget(r, '.agents/state/notepad.md').status, 'created');
  assert.equal(runAdopt(root, { apply: true, only: ['memory'], home }).items[0].status, 'skipped');
});

test('countSources / hasSources; formatReport lists items, totals and leftovers', () => {
  assert.equal(hasSources(countSources(tmpProject({}), HOME())), false);
  const root = tmpProject({ 'CLAUDE.md': 'Use the NotebookEdit tool\n' });
  const s = countSources(root, HOME());
  assert.equal(s.claudeMd, true);
  assert.equal(hasSources(s), true);
  const text = formatReport(runAdopt(root, { home: HOME() }));
  assert.match(text, /\[manual\] CLAUDE\.md → AGENTS\.md/);
  assert.match(text, /created 0, updated 0, skipped 0, manual 1, unsupported 0/);
  assert.match(text, /AGENTS\.md:1 — Use the NotebookEdit tool/);
  assert.match(text, /Dry run/);
  assert.deepEqual(KINDS, ['claude-md', 'skills', 'commands', 'agents', 'rules', 'hooks', 'permissions', 'mcp', 'memory']);
  assert.ok(Array.isArray(scan(root, { home: HOME() })));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test plugins/hx-core/__tests__/adopt-index.test.js`
Expected: FAIL — `Cannot find module '../lib/adopt'`

- [ ] **Step 3: Write `index.js`**

```js
'use strict';
// Adopt a Claude Code project harness into agy-native files. Converters are pure;
// this module decides what to write (against the filesystem and .agents/adopt.json)
// and writes only when opts.apply is set.
const fs = require('fs');
const os = require('os');
const path = require('path');
const registry = require('../registry.json');
const toolmap = require('./toolmap');
const { sha256 } = require('./common');
const { exists, readJson, writeText, stateIgnored, appendGitignore, listDirs } = require('../fs');
const { walk } = require('./common');
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

function makeCtx(opts) {
  return { home: opts.home || os.homedir(), registry, toolmap };
}

/** Run the selected converters. Pure. */
function scan(root, opts = {}) {
  const ctx = makeCtx(opts);
  const kinds = opts.only && opts.only.length ? opts.only : KINDS;
  const out = [];
  for (const k of kinds) if (CONVERTERS[k]) out.push(...CONVERTERS[k].scan(path.resolve(root), ctx));
  return out;
}

/** What Claude Code material exists (for the report and the exit-3 decision). */
function countSources(root, home) {
  const r = path.resolve(root);
  const s = readJson(path.join(r, '.claude', 'settings.json')).value || {};
  const hooks = Object.values(s.hooks || {}).reduce((n, e) => n + (Array.isArray(e) ? e.length : 0), 0);
  const perms = ['allow', 'deny', 'ask'].reduce((n, l) => n + ((s.permissions && Array.isArray(s.permissions[l])) ? s.permissions[l].length : 0), 0);
  const memDir = memoryDirs(r, home || os.homedir()).find(exists);
  return {
    claudeMd: exists(path.join(r, 'CLAUDE.md')) || exists(path.join(r, '.claude', 'CLAUDE.md')),
    skills: listDirs(path.join(r, '.claude', 'skills')).length,
    commands: walk(path.join(r, '.claude', 'commands')).filter((f) => f.endsWith('.md')).length,
    agents: walk(path.join(r, '.claude', 'agents')).filter((f) => f.endsWith('.md')).length,
    rules: walk(path.join(r, '.claude', 'rules')).filter((f) => f.endsWith('.md')).length,
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
    const row = { kind: it.kind, source: it.source, target: it.target, status: it.status, action: null, reason: it.reason, leftovers: it.leftovers || [] };
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
    }
    row.action = action;
    if (action === 'skipped') { row.status = manual ? 'manual' : 'skipped'; row.reason = [reason, it.reason].filter(Boolean).join('; '); }
    else row.status = it.status === 'manual' ? 'manual' : action;
    report.items.push(row);
  }

  if (opts.apply) {
    for (const e of writes) {
      const abs = path.join(root, e.target);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, e.content);
    }
    fs.mkdirSync(path.join(root, '.agents', 'state'), { recursive: true });
    if (!stateIgnored(root)) appendGitignore(root, '.agents/state/');
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
  }
  const count = (s) => r.items.filter((i) => i.status === s).length;
  lines.push(`created ${count('created')}, updated ${count('updated')}, skipped ${count('skipped')}, manual ${count('manual')}, unsupported ${count('unsupported')}`);
  const left = r.items.flatMap((i) => (i.leftovers || []).map((l) => `  ${i.target || i.source}:${l.line} — ${l.text}`));
  if (left.length) lines.push('Leftovers to fix by hand:', ...left);
  for (const n of r.notes) lines.push(n);
  return lines.join('\n');
}

module.exports = { scan, runAdopt, formatReport, countSources, hasSources, ADOPT_FILE, KINDS, VERSION };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test plugins/hx-core/__tests__/adopt-index.test.js`
Expected: 6 pass. If the `--only` memory rerun assertion fails with `updated`, check that `decide` compares the new notepad content with the file (the memory converter must produce identical text on rerun — `mergeBlock` replaces the same block).

- [ ] **Step 5: Run the whole hx-core suite**

Run: `node scripts/test.js hx-core`
Expected: all pass (existing + new).

- [ ] **Step 6: Commit**

```bash
git add plugins/hx-core/lib/adopt/index.js plugins/hx-core/__tests__/adopt-index.test.js
git commit -m "hx-core adopt: orchestrator with adopt.json drift tracking and report"
```

---

### Task 9: CLI (`--only` value flag) and `scripts/adopt.js`

**Files:**
- Modify: `plugins/hx-core/lib/cli.js`
- Create: `plugins/hx-core/skills/adopt/scripts/adopt.js`
- Test: `plugins/hx-core/__tests__/cli.test.js` (append)

**Interfaces:**
- `parseArgs(argv, { flags, valueFlags?, usage })` — `valueFlags` names take the next argv as a string.
- Script exits: 0 done, 1 error, 2 usage (also unknown `--only` kind), 3 no sources.

- [ ] **Step 1: Append failing tests to `cli.test.js`**

```js
const ADOPT = path.join(__dirname, '..', 'skills', 'adopt', 'scripts', 'adopt.js');
const CLAUDE_PROJECT = { 'CLAUDE.md': '# Rules\nUse `Bash`.\n', '.gitignore': '' };

test('adopt.js is dry-run by default, --apply writes, exit 3 with no Claude files', () => {
  const root = tmpProject(CLAUDE_PROJECT);
  const dry = run(ADOPT, [], root, HOME);
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /\[created\] CLAUDE\.md → AGENTS\.md/);
  assert.match(dry.stdout, /Dry run/);
  assert.equal(exists(root, 'AGENTS.md'), false);
  const ap = run(ADOPT, ['--apply', '--json', '--root', root], tmpProject({}), HOME);
  assert.equal(ap.status, 0, ap.stderr);
  assert.ok(ap.json && ap.json.apply === true);
  assert.ok(exists(root, 'AGENTS.md'));
  assert.ok(exists(root, '.agents/adopt.json'));
  const none = run(ADOPT, [], tmpProject(PROJECT), HOME);
  assert.equal(none.status, 3);
  assert.match(none.stderr, /no Claude Code files/i);
});

test('adopt.js --only accepts known kinds; unknown kind or flag exits 2', () => {
  const root = tmpProject(CLAUDE_PROJECT);
  assert.equal(run(ADOPT, ['--only', 'claude-md,mcp'], root, HOME).status, 0);
  const bad = run(ADOPT, ['--only', 'nope'], root, HOME);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /usage/i);
  assert.equal(run(ADOPT, ['--bogus'], root, HOME).status, 2);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test plugins/hx-core/__tests__/cli.test.js`
Expected: the two new tests FAIL (script missing → status null/1).

- [ ] **Step 3: Extend `lib/cli.js`**

Replace the body of `parseArgs` with:

```js
function parseArgs(argv, spec) {
  const out = { root: process.cwd() };
  const valueFlags = spec.valueFlags || [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root') {
      out.root = path.resolve(argv[++i] || '');
      continue;
    }
    if (a === '-h' || a === '--help') usage(spec, 0);
    const flag = a.startsWith('--') ? a.slice(2) : null;
    if (flag && valueFlags.includes(flag)) {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) usage(spec, 2, `--${flag} needs a value`);
      out[camel(flag)] = v;
      continue;
    }
    if (!flag || !spec.flags.includes(flag)) usage(spec, 2, `unknown argument: ${a}`);
    out[camel(flag)] = true;
  }
  if (!fs.existsSync(out.root) || !fs.statSync(out.root).isDirectory()) usage(spec, 2, `not a directory: ${out.root}`);
  return out;
}
```
and update the JSDoc: `@param {{flags: string[], valueFlags?: string[], usage: string}} spec`.

- [ ] **Step 4: Create `skills/adopt/scripts/adopt.js`**

```js
#!/usr/bin/env node
'use strict';
// Adopt a Claude Code project harness into agy files. See ../SKILL.md and lib/adopt/index.js.
// Exit: 0 done, 1 unexpected error, 2 usage, 3 no Claude Code files found.
const { parseArgs } = require('../../../lib/cli');
const { runAdopt, formatReport, hasSources, KINDS } = require('../../../lib/adopt');

const USAGE = `node adopt.js [--root <dir>] [--apply] [--force] [--only <kinds>] [--json]\n  kinds: ${KINDS.join(',')}`;
const args = parseArgs(process.argv.slice(2), { flags: ['json', 'apply', 'force'], valueFlags: ['only'], usage: USAGE });
const only = args.only ? String(args.only).split(',').map((s) => s.trim()).filter(Boolean) : null;
if (only && only.some((k) => !KINDS.includes(k))) {
  process.stderr.write(`unknown --only kind: ${only.filter((k) => !KINDS.includes(k)).join(', ')}\nusage: ${USAGE}\n`);
  process.exit(2);
}

try {
  const r = runAdopt(args.root, { apply: args.apply, force: args.force, only });
  if (!hasSources(r.sources)) {
    process.stderr.write('adopt: no Claude Code files found (CLAUDE.md, .claude/, .mcp.json, auto-memory). Nothing to adopt.\n');
    process.exit(3);
  }
  process.stdout.write((args.json ? JSON.stringify(r, null, 2) : formatReport(r)) + '\n');
  process.exit(0);
} catch (err) {
  process.stderr.write(`adopt failed: ${err.stack || err}\n`);
  process.exit(1);
}
```

- [ ] **Step 5: Run the CLI tests and the whole suite**

Run: `node scripts/test.js hx-core`
Expected: all pass, including the existing `setup.js --bogus exits 2` test (behaviour unchanged for boolean flags).

- [ ] **Step 6: Commit**

```bash
git add plugins/hx-core/lib/cli.js plugins/hx-core/skills/adopt/scripts/adopt.js plugins/hx-core/__tests__/cli.test.js
git commit -m "hx-core adopt: CLI script with --only value flag"
```

---

### Task 10: doctor `adopt-drift` check + registry + e2e

**Files:**
- Modify: `plugins/hx-core/lib/doctor.js` (add check after `hooks` in `CHECKS`), `plugins/hx-core/lib/registry.json` (`hxSkills` += `"adopt"`), `scripts/e2e.js` (expect `hx-core:adopt`)
- Test: `plugins/hx-core/__tests__/doctor.test.js` (append)

**Interfaces:**
- Consumes: `require('./adopt').{scan, ADOPT_FILE}`, `require('./adopt/common').sha256`.
- Produces: result id `adopt-drift`.

- [ ] **Step 1: Append failing tests to `doctor.test.js`**

```js
const { runAdopt } = require('../lib/adopt');

test('adopt-drift: ok without Claude files, warn when Claude files are not adopted', () => {
  assert.equal(byId(runDoctor(healthy(), OPTS), 'adopt-drift').level, 'ok');
  const r = runDoctor(healthy({ 'CLAUDE.md': '# x\n' }), OPTS);
  assert.equal(byId(r, 'adopt-drift').level, 'warn');
  assert.match(byId(r, 'adopt-drift').message, /not adopted/);
});

test('adopt-drift: in sync after adopt; warn when a source changes or disappears; hand edits are noted', () => {
  const root = healthy({ 'CLAUDE.md': '# x\n', '.claude/rules/r.md': 'rule\n' });
  fs.rmSync(path.join(root, 'AGENTS.md')); // let adopt own AGENTS.md
  runAdopt(root, { apply: true, home: OPTS.home });
  let d = byId(runDoctor(root, OPTS), 'adopt-drift');
  assert.equal(d.level, 'ok', d.message);
  assert.match(d.message, /2 adopted file\(s\) in sync/);
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# edited\n');
  d = byId(runDoctor(root, OPTS), 'adopt-drift');
  assert.equal(d.level, 'ok');
  assert.match(d.message, /1 edited by hand/);
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# y\n');
  fs.rmSync(path.join(root, '.claude', 'rules', 'r.md'));
  d = byId(runDoctor(root, OPTS), 'adopt-drift');
  assert.equal(d.level, 'warn');
  assert.match(d.message, /1 source\(s\) changed.*1 removed/);
  assert.match(d.fix, /hx-core:adopt --apply/);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test plugins/hx-core/__tests__/doctor.test.js`
Expected: new tests FAIL (`byId(...)` returns undefined → TypeError).

- [ ] **Step 3: Add the check to `doctor.js`**

Add after the `hooks` function:

```js
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
  let edited = 0;
  const items = Object.entries(a.value.items || {});
  for (const [target, entry] of items) {
    if (!current.has(target)) removed.push(target);
    else if (current.get(target) !== entry.sourceHash) changed.push(target);
    try { if (sha256(fs.readFileSync(path.join(root, target))) !== entry.targetHash) edited++; } catch (_) { /* target missing: counted as changed on next adopt */ }
  }
  if (changed.length || removed.length) {
    return warn('adopt-drift', `${changed.length} source(s) changed, ${removed.length} removed since adopt: ${[...changed, ...removed].join(', ')}`, 'run /hx-core:adopt --apply (delete targets whose source was removed)');
  }
  return ok('adopt-drift', `${items.length} adopted file(s) in sync${edited ? `; ${edited} edited by hand (adopt will skip them)` : ''}`);
}
```
Then change `CHECKS` to:
```js
const CHECKS = [agentsDir, manifest, rootRules, rulesFrontmatter, placeholders, skills, agents, hooks, adoptDrift,
  stateIgnoredCheck, stateDir, goal, checksRunnable, hxPlugins];
```
Update the header comment count wherever it says 13 checks (`skills/doctor/SKILL.md` mentions "13 check" — change to 14; README says `13 check` — Task 12).

- [ ] **Step 4: Registry and e2e**

In `plugins/hx-core/lib/registry.json` change `"hxSkills": ["using-harness", "notepad", "handoff", "setup", "doctor", ...` to include `"adopt"` after `"doctor"`.
In `scripts/e2e.js` add `'hx-core:adopt'` after `'hx-core:doctor'` in the skills list.

- [ ] **Step 5: Run the suite**

Run: `node scripts/test.js hx-core`
Expected: all pass. The existing test `a freshly set up project passes with only placeholder and hx-plugins warnings` must still list exactly `['hx-plugins', 'placeholders']` (no Claude files in that fixture → `adopt-drift` is `ok`).

- [ ] **Step 6: Commit**

```bash
git add plugins/hx-core/lib/doctor.js plugins/hx-core/lib/registry.json scripts/e2e.js plugins/hx-core/__tests__/doctor.test.js
git commit -m "hx-core doctor: adopt-drift check; register adopt skill"
```

---

### Task 11: `skills/adopt/SKILL.md` and rules hint

**Files:**
- Create: `plugins/hx-core/skills/adopt/SKILL.md`
- Modify: `plugins/hx-core/rules/AGENTS.md` (§8), `plugins/hx-core/skills/using-harness/SKILL.md` (workflow table), `plugins/hx-core/skills/doctor/SKILL.md` ("13" → "14")

- [ ] **Step 1: Write `SKILL.md`**

```markdown
---
name: adopt
description: >-
  Reuse an existing Claude Code project harness on Antigravity: converts
  CLAUDE.md (+@imports), .claude/skills, .claude/commands, .claude/agents,
  .claude/rules, .mcp.json and this repo's auto-memory into AGENTS.md and
  .agents/ files, classifies .claude/settings.json hooks and permissions, and
  records what it wrote in .agents/adopt.json so it can be re-run when the
  Claude files change. Use when a project has CLAUDE.md or .claude/ but no
  .agents/adopt.json, or when the user says "adopt", "migrate from Claude
  Code", "chuyển harness Claude sang agy". Run it before /hx-core:setup.
metadata:
  icon: "🔁"
---

# Adopt a Claude Code harness

Goal: agy gets native copies of the project's Claude Code customisations; the
Claude files stay untouched; `/hx-core:doctor` reports no errors afterwards.

## Steps

1. **Confirm the root** (folder with `CLAUDE.md` / `.claude/` / `.git`).

2. **Dry run** with [scripts/adopt.js](./scripts/adopt.js), next to this file:
   ```
   node <this-skill-dir>/scripts/adopt.js --root <project-root>
   ```
   (`<this-skill-dir>`: `~/.gemini/config/plugins.json` → `<entry.path>/hx-core/skills/adopt/scripts/adopt.js`,
   or `~/.gemini/config/plugins/hx-core/skills/adopt/scripts/adopt.js`.)
   Exit 3 means there is nothing to adopt: say so and stop.
   Show the user the table: `[created|updated|skipped|manual|unsupported] source → target — reason`.
   Options: `--only <kinds>` (`claude-md,skills,commands,agents,rules,hooks,permissions,mcp,memory`),
   `--force` (rewrite files adopt wrote before even if edited by hand; never an
   `AGENTS.md` adopt did not write), `--json`.

3. **Ask before writing**, then run again with `--apply`. Re-runs are safe:
   unchanged targets are skipped, hand-edited targets are skipped unless `--force`.

4. **Fix what the script cannot** (items marked `manual`, plus the
   `Leftovers` list, each `file:line`):
   - Rewrite remaining Claude tool names in prose with the map from
     `/hx-core:using-harness` (`Read`→`view_file`, `Edit`→`replace_file_content`,
     `Bash`→`run_command`, `Grep`→`grep_search`, `Glob`→`find_by_name`,
     `Agent`→`invoke_subagent`, `TodoWrite`→task artifact). Remove references to
     Claude-only slash commands and plugins.
   - `AGENTS.md` marked `manual` because it already existed: show the user the
     converted text and merge only the sections they want. Keep it under 4000 chars.
   - Skills or agents flagged `shadows /hx-*:<name>`: rename the project skill.
   - Agents with `no agy tool for X`: leave the tool out; say what the agent loses.

5. **Walk the `unsupported` list** (hooks, permissions). For each hook tell the
   user which piece replaces it (the `reason` text): `hx-guard` pre-tool-guard /
   stop-gate / pre-invocation-context, or the lint hook that `/hx-core:setup`
   generates. If the project needs a custom dangerous-command pattern, add it to
   `hx-guard/hooks/patterns.json`. If `hx-guard` is disabled on this machine,
   say so (`agy plugin enable hx-guard`).

6. **Run `/hx-core:setup`** — it adds `.agents/harness.json`, the
   `project-checks` skill and the lint hook, and leaves the adopted `AGENTS.md`
   alone.

7. **Verify** with `/hx-core:doctor`. `adopt-drift` must be `[ok]`; fix every `[FAIL]`.

8. **Report** the files written and ask whether to commit `AGENTS.md`,
   `.agents/` (including `adopt.json`). Do not commit without a yes. Never
   delete or edit `.claude/` or `CLAUDE.md`.

## What maps to what

| Claude Code | agy | Notes |
|---|---|---|
| `CLAUDE.md` (+ `@imports`) | `AGENTS.md` | imports inlined; boilerplate line dropped |
| `.claude/skills/<n>/` | `.agents/skills/<n>/` | same format; `allowed-tools` etc. dropped |
| `.claude/commands/**.md` | `.agents/skills/<n>/SKILL.md` | nested `a/b.md` → `a-b` |
| `.claude/agents/*.md` | `.agents/agents/*.md` | tools mapped, `opus→pro`, `sonnet→inherit`, `haiku→flash` |
| `.claude/rules/*.md` | `.agents/rules/*.md` | `paths:` → `trigger: glob` |
| `.mcp.json` | `.agents/mcp_config.json` | verbatim |
| auto-memory | `.agents/state/notepad.md` Decisions block | per machine, secrets dropped |
| settings hooks / permissions | report only | see step 5 |

## Later: keeping in sync
`/hx-core:doctor` warns `adopt-drift` when a Claude source changed since the
last run. Re-run step 3 (`--apply`); hand-edited targets are kept unless `--force`.
```

- [ ] **Step 2: Update `rules/AGENTS.md` §8**

Replace the §8 block with:
```markdown
## 8. Set up the project harness once
- If the workspace has `CLAUDE.md` or `.claude/` but no `.agents/adopt.json`,
  suggest `/hx-core:adopt` once in the session (it reuses the Claude Code
  harness on agy). Then, if there is no `.agents/harness.json`, suggest
  `/hx-core:setup`. Do not insist; do not run them unasked.
- If skills, hooks or subagents behave oddly in a project, run `/hx-core:doctor`.
```
Check the file stays well under 12000 chars (`wc -c plugins/hx-core/rules/AGENTS.md`).

- [ ] **Step 3: Update `using-harness/SKILL.md` and `doctor/SKILL.md`**

In the "Pick a workflow" table of `using-harness/SKILL.md`, add as the first row:
`| Project has \`CLAUDE.md\` / \`.claude/\` but no \`.agents/adopt.json\` | \`/hx-core:adopt\` (before setup) |`
In `doctor/SKILL.md` replace every `13` check count with `14` and add `adopt-drift` to the check list if one is enumerated there (search: `grep -n "13\|hooks" plugins/hx-core/skills/doctor/SKILL.md`).

- [ ] **Step 4: Validate with agy and run tests**

Run: `agy plugin validate plugins/hx-core && node scripts/test.js hx-core`
Expected: `[ok]` and all tests pass.

- [ ] **Step 5: Commit**

```bash
git add plugins/hx-core/skills/adopt/SKILL.md plugins/hx-core/rules/AGENTS.md plugins/hx-core/skills/using-harness/SKILL.md plugins/hx-core/skills/doctor/SKILL.md
git commit -m "hx-core: adopt skill, rules hint, doctor count"
```

---

### Task 12: Versions, docs, CHANGELOG, README, repo CLAUDE.md

**Files:**
- Modify: `plugins/hx-core/plugin.json` (0.3.0 → 0.4.0, description mentions adopt), `marketplace.json` (metadata.version 0.3.0 → 0.4.0; hx-core description), `CHANGELOG.md`, `README.md`, `docs/03-skills.md`, `docs/09-setup-project.md`, `CLAUDE.md`

- [ ] **Step 1: Bump versions**

`plugins/hx-core/plugin.json`: `"version": "0.4.0"`, description: `"Harness foundation: adopts an existing Claude Code harness (adopt), sets up and checks the standard hx harness in a project (setup, doctor) for Node, Maven, Gradle, Go and Python stacks; always-on working rules, tool map for agy, notepad and handoff skills."`, keywords add `"adopt"`, `"claude-code"`.
`marketplace.json`: `metadata.version` → `"0.4.0"`; hx-core description → `"adopt (reuse a Claude Code harness), setup/doctor for a per-project harness (Node, Maven, Gradle, Go, Python), always-on rules, tool map, notepad, handoff"`.

- [ ] **Step 2: CHANGELOG entry (top of file, Vietnamese)**

```markdown
## 0.4.0 — 2026-09-22
- **hx-core 0.4.0 — skill `adopt`**: tái sử dụng harness Claude Code có sẵn trong project trên agy.
  Script `skills/adopt/scripts/adopt.js` (dry-run mặc định, `--apply` mới ghi, `--only`, `--force`)
  chuyển `CLAUDE.md` (+`@import`) → `AGENTS.md`, `.claude/skills|commands|agents|rules` →
  `.agents/…` (đổi tên tool `Read/Edit/Bash/…` → `view_file/replace_file_content/run_command/…`
  chỉ trong code span và frontmatter; phần còn sót liệt kê `file:line`), `.mcp.json` →
  `.agents/mcp_config.json`, auto-memory của repo → khối đánh dấu trong `notepad.md` (lọc secret).
  Hooks và permissions trong `.claude/settings.json` không chuyển được: chỉ phân loại và chỉ ra phần
  hx-guard/setup thay thế. Ghi `.agents/adopt.json` (hash nguồn/đích) để chạy lại an toàn; file đích
  sửa tay được giữ nguyên trừ khi `--force`; không bao giờ ghi đè `AGENTS.md` không do adopt sinh.
  `doctor` thêm check `adopt-drift` (14 check): cảnh báo khi có Claude config chưa adopt hoặc nguồn
  đổi sau lần adopt gần nhất. 9 file test mới.
```

- [ ] **Step 3: README and docs**

README: in the plugin table, hx-core row add `adopt` before `setup`; in "Dùng hằng ngày" add before `/hx-core:setup`:
```
/hx-core:adopt            → nếu project đã có CLAUDE.md/.claude/: chuyển sang AGENTS.md + .agents/ (dry-run, rồi --apply)
```
and change `13 check` to `14 check`.
`docs/03-skills.md`: add an `adopt` row/section next to `setup` describing purpose, flags, statuses (copy the "What maps to what" table from SKILL.md, in Vietnamese headings).
`docs/09-setup-project.md`: add a section "Dự án đã có harness Claude Code" — run `adopt` first, then `setup`, then `doctor`; explain `adopt.json` and `adopt-drift`.

- [ ] **Step 4: Repo `CLAUDE.md`**

In the "hx-core: setup / doctor for target projects" section add:
```markdown
- `lib/adopt/` — `/hx-core:adopt`: one pure converter per Claude Code source (`claude-md`, `skills`,
  `commands`, `agents`, `rules`, `mcp`, `memory`; `hooks`/`permissions` report only) with
  `scan(root, ctx) → items`; `index.js` decides create/update/skip against `.agents/adopt.json`
  (source/target hashes) and writes only with `--apply`. `toolmap.js` rewrites Claude tool names
  only inside code spans and `<Name> tool`. Never overwrites an `AGENTS.md` it did not write.
```
and update "13 read-only checks" → "14 read-only checks".

- [ ] **Step 5: Full verification**

Run:
```bash
node scripts/validate-all.js && node scripts/test.js && node scripts/e2e.js
```
Expected: all plugins valid; all tests pass; e2e lists `hx-core:adopt` as `ok` (requires the harness registered via `install.js`; if `agy` is not registered the e2e reports missing skills — say so rather than skipping).

- [ ] **Step 6: Commit**

```bash
git add plugins/hx-core/plugin.json marketplace.json CHANGELOG.md README.md docs/03-skills.md docs/09-setup-project.md CLAUDE.md
git commit -m "hx-core 0.4.0: adopt skill docs, changelog, versions"
```

---

## Self-review

- **Spec coverage:** Part 1 (layout/CLI/report) → Tasks 8–9; Part 2 (contract, toolmap, each converter) → Tasks 1–7; Part 3 (apply rules, adopt.json) → Task 8; Part 4 (hooks/permissions) → Task 7; Part 5 (skill, doctor, docs, registry, e2e, rules) → Tasks 10–12; Part 6 (tests) → each task's Step 1 plus Task 9/10 appends.
- **Placeholders:** none; every step has the code or exact edit.
- **Type consistency:** item shape `{kind, source, target, status, reason, leftovers, content, sourceHash, files, track}` used identically in Tasks 3–8 and 10; `ctx = {home, registry, toolmap}` everywhere; `runAdopt(root, {apply, force, only, home})`; `KINDS` order matches the `--only` list in SKILL.md and the spec.
