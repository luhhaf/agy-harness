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
    let tools = DEFAULT_TOOLS.slice();
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
    if (ctx.registry.hxAgents.includes(name)) manual(`shadows the hx-agents subagent ${name}; rename it or the project copy wins`);
    if (rw.leftovers.length) manual('tool names left in prose; see leftovers');
    it.reason = reasons.join('; ');
    out.push(it);
  }
  return out;
}

module.exports = { kind, scan, DEFAULT_TOOLS };
