'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

/** Create a temp project dir with the given files ({ 'rel/path': 'content' | object }). */
function tmpProject(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hx-core-'));
  writeFiles(dir, files);
  return dir;
}

function writeFiles(dir, files) {
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, typeof content === 'string' ? content : JSON.stringify(content, null, 2) + '\n');
  }
}

function read(dir, rel) {
  return fs.readFileSync(path.join(dir, rel), 'utf8');
}

function exists(dir, rel) {
  return fs.existsSync(path.join(dir, rel));
}

module.exports = { tmpProject, writeFiles, read, exists };
