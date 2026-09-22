'use strict';
// Go stack detector: go.mod, optional golangci-lint.
const path = require('path');
const { exists } = require('../fs');

const GOLANGCI = ['.golangci.yml', '.golangci.yaml', '.golangci.toml'];

function detectGo(root) {
  if (!exists(path.join(root, 'go.mod'))) return null;
  const checks = ['go build ./...', 'go vet ./...'];
  if (GOLANGCI.some((f) => exists(path.join(root, f)))) checks.push('golangci-lint run');
  checks.push('go test ./...');
  return {
    kind: 'go',
    packageManager: 'go',
    typescript: false,
    eslint: false,
    workspaces: false,
    scripts: [],
    checks,
    testGlobs: ['**/*_test.go'],
    lint: { cmd: 'gofmt -l', exts: ['.go'], nonEmptyIsIssue: true },
    notes: [],
  };
}

module.exports = { detectGo };
