'use strict';
// Stack detection entry point. Add a detector by appending to DETECTORS;
// each returns null when it does not apply, otherwise the common stack shape:
// { kind, packageManager, typescript, eslint, workspaces, scripts, checks, testGlobs, lint, notes }.
const { detectNode } = require('./node');
const { detectMaven } = require('./maven');
const { detectGradle } = require('./gradle');
const { detectGo } = require('./go');
const { detectPython } = require('./python');

const DETECTORS = [detectNode, detectMaven, detectGradle, detectGo, detectPython];

function detect(root) {
  for (const d of DETECTORS) {
    const r = d(root);
    if (r) return r;
  }
  return {
    kind: 'unknown',
    packageManager: null,
    typescript: false,
    eslint: false,
    workspaces: false,
    scripts: [],
    checks: [],
    testGlobs: [],
    lint: null,
    notes: ['no known stack detected; fill build/test commands by hand'],
  };
}

module.exports = { detect };
