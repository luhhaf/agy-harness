#!/usr/bin/env sh
# Unit + contract tests for hx-guard hooks (Node >= 18, no dependencies).
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
command -v node >/dev/null 2>&1 || { echo "node not found in PATH"; exit 1; }
cd "$ROOT"
node --test 'plugins/hx-guard/hooks/__tests__/*.test.js'
