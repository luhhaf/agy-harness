#!/usr/bin/env sh
# macOS / Linux wrapper. Clones (or pulls) the repo if needed, then runs the cross-platform
# installer: node install.js. Windows users: run install.ps1 instead.
#
#   sh install.sh [--copy]                    from inside a clone
#   curl -fsSL https://raw.githubusercontent.com/luhhaf/agy-harness/main/install.sh | sh
set -eu
REPO_URL="${AGY_HARNESS_REPO:-https://github.com/luhhaf/agy-harness.git}"
SELF_DIR="$(cd "$(dirname "$0")" 2>/dev/null && pwd || echo "")"
if [ -n "$SELF_DIR" ] && [ -f "$SELF_DIR/install.js" ]; then
  DIR="$SELF_DIR"
else
  DIR="${AGY_HARNESS_DIR:-$HOME/agy-harness}"
  if [ -d "$DIR/.git" ]; then git -C "$DIR" pull --ff-only; else git clone "$REPO_URL" "$DIR"; fi
fi
command -v node >/dev/null 2>&1 || { echo "node not found. Install Node.js >= 18 first."; exit 1; }
exec node "$DIR/install.js" "$@"
