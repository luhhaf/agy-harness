#!/usr/bin/env sh
# Validate every plugin under plugins/ with the agy CLI. Exit 1 if any fails.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
command -v agy >/dev/null 2>&1 || { echo "agy not found in PATH"; exit 1; }
fail=0
for p in "$ROOT"/plugins/*/; do
  [ -f "$p/plugin.json" ] || continue
  out="$(agy plugin validate "$p" 2>&1)"
  echo "$out"
  echo "$out" | grep -q '\[ok\]' || fail=1
done
[ $fail -eq 0 ] && echo "All plugins valid." || { echo "Some plugins failed validation."; exit 1; }
