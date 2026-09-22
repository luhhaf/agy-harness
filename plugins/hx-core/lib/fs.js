'use strict';
// Small file helpers shared by setup and doctor. Node >= 18, no dependencies.
const fs = require('fs');
const path = require('path');

function exists(p) {
  return fs.existsSync(p);
}

function readText(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch (_) {
    return null;
  }
}

/** Parse JSON; returns { value } or { error: message }. */
function readJson(p) {
  const raw = readText(p);
  if (raw === null) return { error: 'missing' };
  try {
    return { value: JSON.parse(raw) };
  } catch (err) {
    return { error: err.message };
  }
}

function writeText(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
}

function listDirs(p) {
  try {
    return fs.readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  } catch (_) {
    return [];
  }
}

function listFiles(p, ext) {
  try {
    return fs.readdirSync(p, { withFileTypes: true })
      .filter((d) => d.isFile() && (!ext || d.name.endsWith(ext)))
      .map((d) => d.name).sort();
  } catch (_) {
    return [];
  }
}

/** Lines of .gitignore (trimmed, no comments); [] when missing. */
function gitignoreLines(root) {
  const raw = readText(path.join(root, '.gitignore')) || '';
  return raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
}

/** True when .gitignore already covers `.agents/state/` (any of the usual spellings). */
function stateIgnored(root) {
  const norm = (l) => l.replace(/^\//, '').replace(/\/$/, '');
  const targets = new Set(['.agents/state', '.agents', '.agents/*']);
  return gitignoreLines(root).some((l) => targets.has(norm(l)));
}

function appendGitignore(root, line) {
  const p = path.join(root, '.gitignore');
  const raw = readText(p);
  const sep = raw === null || raw === '' || raw.endsWith('\n') ? '' : '\n';
  fs.writeFileSync(p, (raw || '') + sep + line + '\n');
}

/**
 * Parse a YAML-ish frontmatter block: only `key: value` and `key: [a, b]` /
 * block lists (`- item`). Enough for agy rule/skill/agent files.
 * Returns null when the file has no frontmatter.
 */
function frontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!m) return null;
  const out = {};
  let key = null;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (kv) {
      key = kv[1];
      const v = kv[2].trim();
      if (v === '' || v === '>-' || v === '|' || v === '>') out[key] = v === '' ? '' : '';
      else if (v.startsWith('[')) out[key] = v.replace(/^\[|\]$/g, '').split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      else out[key] = v.replace(/^["']|["']$/g, '');
      continue;
    }
    const li = /^\s+-\s+(.*)$/.exec(line);
    if (li && key) {
      if (!Array.isArray(out[key])) out[key] = [];
      out[key].push(li[1].trim().replace(/^["']|["']$/g, ''));
      continue;
    }
    const cont = /^\s+(\S.*)$/.exec(line);
    if (cont && key && typeof out[key] === 'string') out[key] = (out[key] + ' ' + cont[1].trim()).trim();
  }
  return out;
}

module.exports = { exists, readText, readJson, writeText, listDirs, listFiles, gitignoreLines, stateIgnored, appendGitignore, frontmatter };
