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
    const description = (fm && fm.description) || firstLine(body);
    it.content = renderFrontmatter({ name, description }) + rw.text;
    it.leftovers = rw.leftovers;
    const reasons = [];
    const manual = (r) => { it.status = 'manual'; reasons.push(r); };
    if (!description) manual('description is required');
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
