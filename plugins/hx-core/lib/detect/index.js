'use strict';
// Stack detection entry point. Add a detector by appending to DETECTORS;
// each returns null when it does not apply, otherwise { kind, checks, notes, ... }.
const { detectNode } = require('./node');

const DETECTORS = [detectNode];

function detect(root) {
  for (const d of DETECTORS) {
    const r = d(root);
    if (r) return r;
  }
  return { kind: 'unknown', checks: [], notes: ['no known stack detected; fill build/test commands by hand'] };
}

module.exports = { detect };
