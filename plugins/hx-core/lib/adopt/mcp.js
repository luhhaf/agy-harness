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
