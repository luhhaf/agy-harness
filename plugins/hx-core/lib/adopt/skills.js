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
