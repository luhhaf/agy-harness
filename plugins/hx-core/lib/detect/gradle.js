'use strict';
// Gradle stack detector: wrapper vs plain gradle.
const path = require('path');
const { exists } = require('../fs');

const BUILD_FILES = ['build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts'];

function detectGradle(root) {
  if (!BUILD_FILES.some((f) => exists(path.join(root, f)))) return null;
  const hasWrapper = exists(path.join(root, 'gradlew'));
  const gw = hasWrapper ? (process.platform === 'win32' ? 'gradlew.bat' : './gradlew') : 'gradle';
  return {
    kind: 'gradle',
    packageManager: gw,
    typescript: false,
    eslint: false,
    workspaces: false,
    scripts: [],
    checks: [`${gw} check`],
    testGlobs: ['**/src/test/**'],
    lint: null,
    notes: [],
  };
}

module.exports = { detectGradle };
