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
