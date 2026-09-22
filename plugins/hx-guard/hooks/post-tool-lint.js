#!/usr/bin/env node
'use strict';
// PostToolUse hook for file writes: remind about the project's formatter.
// It never changes files. stdout is always {} (the contract for PostToolUse).
// agy shows neither stderr nor anything but {} from this event to the model,
// so the reminder is queued in .agents/state/lint.json and injected on the
// next turn by pre-invocation-context.js. Each hint repeats at most once per
// REMIND_EVERY_MS so it does not spam every edit.
const fs = require('fs');
const path = require('path');
const { run, workspaceRoot, stateDir, readLint, writeLint, log } = require('./lib');

const REMIND_EVERY_MS = 30 * 60 * 1000;

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
    if (!hints.includes(f.hint)) hints.push(f.hint);
  }
  return hints;
}

/**
 * Queue the hints that were not reminded recently. Returns the hints queued.
 * Exported for tests.
 */
function queueHints(dir, hints, now = Date.now()) {
  if (!dir || !hints.length) return [];
  const data = readLint(dir);
  const queued = [];
  for (const h of hints) {
    const last = Date.parse(data.reminded[h] || '') || 0;
    if (now - last < REMIND_EVERY_MS) continue;
    data.reminded[h] = new Date(now).toISOString();
    data.notices.push({ at: new Date(now).toISOString(), source: 'hx-formatter', text: h });
    queued.push(h);
  }
  if (queued.length) writeLint(dir, data);
  return queued;
}

if (require.main === module) {
  run((input) => {
    if (input.error) log(`tool reported error at step ${input.stepIdx}: ${input.error}`);
    const ws = workspaceRoot(input);
    if (ws) for (const h of queueHints(stateDir(input), hintsFor(ws))) log(h);
    return {};
  }, {});
}

module.exports = { hintsFor, queueHints, REMIND_EVERY_MS };
