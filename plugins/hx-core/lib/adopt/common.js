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
