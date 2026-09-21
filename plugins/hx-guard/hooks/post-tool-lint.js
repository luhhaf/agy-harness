#!/usr/bin/env node
'use strict';
// PostToolUse hook for file writes: remind about the project's formatter.
// It never changes files. stdout is always {} (the contract for PostToolUse).
const fs = require('fs');
const path = require('path');
const { run, workspaceRoot, log } = require('./lib');

const FORMATTERS = [
  { file: '.prettierrc', hint: 'Prettier config found: run `npx prettier --write <file>` on files you changed.' },
  { file: '.prettierrc.json', hint: 'Prettier config found: run `npx prettier --write <file>` on files you changed.' },
  { file: 'biome.json', hint: 'Biome config found: run `npx biome format --write <file>`.' },
  { file: '.editorconfig', hint: '.editorconfig found: keep indentation and line endings consistent.' },
  { file: 'pyproject.toml', hint: 'pyproject.toml found: run `ruff format` / `black` if the project uses them.' },
  { file: '.golangci.yml', hint: 'golangci config found: run `gofmt -w` and `golangci-lint run`.' },
  { file: 'pom.xml', hint: 'Maven project: if spotless/checkstyle is configured, run `mvn spotless:apply` before verify.', grep: 'spotless' },
  { file: 'build.gradle', hint: 'Gradle project: if spotless is configured, run `./gradlew spotlessApply`.', grep: 'spotless' },
  { file: 'build.gradle.kts', hint: 'Gradle project: if spotless is configured, run `./gradlew spotlessApply`.', grep: 'spotless' },
];

/** Returns the list of hints that apply to a workspace. Exported for tests. */
function hintsFor(root) {
  const hints = [];
  for (const f of FORMATTERS) {
    const p = path.join(root, f.file);
    if (!fs.existsSync(p)) continue;
    if (f.grep) {
      try {
        if (!fs.readFileSync(p, 'utf8').includes(f.grep)) continue;
      } catch (_) {
        continue;
      }
    }
    hints.push(f.hint);
  }
  return hints;
}

if (require.main === module) {
  run((input) => {
    if (input.error) log(`tool reported error at step ${input.stepIdx}: ${input.error}`);
    const ws = workspaceRoot(input);
    if (ws) for (const h of hintsFor(ws)) log(h);
    return {};
  }, {});
}

module.exports = { hintsFor };
