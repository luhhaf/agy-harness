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
