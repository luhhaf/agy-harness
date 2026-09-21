#!/usr/bin/env sh
# Install agy-harness on this machine.
#
#   Method A (default): keep a git clone at $AGY_HARNESS_DIR (default ~/agy-harness)
#                       and register it in ~/.gemini/config/plugins.json.
#                       Update later with: git -C ~/agy-harness pull
#   Method B (--copy):  agy plugin install <dir>  → copies each plugin into
#                       ~/.gemini/config/plugins/. Update by re-running install.
#
# Usage:
#   sh install.sh                # A, from the directory this script is in
#   sh install.sh --copy         # B
#   AGY_HARNESS_DIR=/opt/agy-harness sh install.sh
#   curl -fsSL https://raw.githubusercontent.com/<you>/agy-harness/main/install.sh | sh   # clones first
set -eu

REPO_URL="${AGY_HARNESS_REPO:-https://github.com/<you>/agy-harness.git}"
MODE="link"; [ "${1:-}" = "--copy" ] && MODE="copy"
CONFIG_DIR="$HOME/.gemini/config"
PLUGINS_JSON="$CONFIG_DIR/plugins.json"

# Locate the repo: the directory of this script if it contains plugins/, else clone.
SELF_DIR="$(cd "$(dirname "$0")" 2>/dev/null && pwd || echo "")"
if [ -n "$SELF_DIR" ] && [ -d "$SELF_DIR/plugins" ]; then
  DIR="$SELF_DIR"
else
  DIR="${AGY_HARNESS_DIR:-$HOME/agy-harness}"
  if [ -d "$DIR/.git" ]; then git -C "$DIR" pull --ff-only; else git clone "$REPO_URL" "$DIR"; fi
fi
echo "Harness directory: $DIR"

command -v agy >/dev/null 2>&1 || { echo "agy not found. Install Antigravity CLI first: https://antigravity.google/docs/cli"; exit 1; }
command -v node >/dev/null 2>&1 || echo "WARNING: node not found. hx-guard hooks need Node.js >= 18."

if [ "$MODE" = "copy" ]; then
  agy plugin install "$DIR"
else
  mkdir -p "$CONFIG_DIR"
  ENTRY="$DIR/plugins"
  if [ -f "$PLUGINS_JSON" ]; then
    if grep -q "$ENTRY" "$PLUGINS_JSON"; then
      echo "Already registered in $PLUGINS_JSON"
    else
      python3 - "$PLUGINS_JSON" "$ENTRY" <<'PY' || { echo "Could not edit $PLUGINS_JSON automatically. Add {\"path\": \"$ENTRY\"} to its entries."; exit 1; }
import json, sys
p, entry = sys.argv[1], sys.argv[2]
d = json.load(open(p))
d.setdefault("entries", []).append({"path": entry})
json.dump(d, open(p, "w"), indent=2); open(p, "a").write("\n")
print("Added entry to", p)
PY
    fi
  else
    printf '{\n  "entries": [\n    { "path": "%s" }\n  ]\n}\n' "$ENTRY" > "$PLUGINS_JSON"
    echo "Created $PLUGINS_JSON"
  fi
fi

echo "Validating plugins..."
for p in "$DIR"/plugins/*/; do agy plugin validate "$p" || true; done
echo
echo "Done. Start agy and run /plugins to check. Disable what you do not need: agy plugin disable <name>"
