'use strict';
// Maven stack detector: wrapper vs plain mvn, spotless check.
const path = require('path');
const { exists, readText } = require('../fs');

function detectMaven(root) {
  if (!exists(path.join(root, 'pom.xml'))) return null;
  const hasWrapper = exists(path.join(root, 'mvnw'));
  const mvn = hasWrapper ? (process.platform === 'win32' ? 'mvnw.cmd' : './mvnw') : 'mvn';
  const pom = readText(path.join(root, 'pom.xml')) || '';
  const checks = [];
  if (/spotless/i.test(pom)) checks.push(`${mvn} -q spotless:check`);
  checks.push(`${mvn} -q test`);
  return {
    kind: 'maven',
    packageManager: mvn,
    typescript: false,
    eslint: false,
    workspaces: false,
    scripts: [],
    checks,
    testGlobs: ['**/src/test/**'],
    lint: null,
    notes: [`use \`${mvn} -q verify\` when integration tests matter`],
  };
}

module.exports = { detectMaven };
