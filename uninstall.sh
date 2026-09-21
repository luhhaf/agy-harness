#!/usr/bin/env sh
# Remove agy-harness from this machine (both methods). Does not delete the clone.
set -eu
CONFIG_DIR="$HOME/.gemini/config"
PLUGINS_JSON="$CONFIG_DIR/plugins.json"
SELF_DIR="$(cd "$(dirname "$0")" 2>/dev/null && pwd || echo "")"
DIR="${AGY_HARNESS_DIR:-${SELF_DIR:-$HOME/agy-harness}}"
if [ -f "$PLUGINS_JSON" ]; then
  python3 - "$PLUGINS_JSON" "$DIR/plugins" <<'PY'
import json, sys
p, entry = sys.argv[1], sys.argv[2]
d = json.load(open(p))
before = len(d.get("entries", []))
d["entries"] = [e for e in d.get("entries", []) if e.get("path") != entry]
json.dump(d, open(p, "w"), indent=2); open(p, "a").write("\n")
print("Removed", before - len(d["entries"]), "entry from", p)
PY
fi
for n in hx-core hx-workflows hx-agents hx-guard; do
  [ -d "$CONFIG_DIR/plugins/$n" ] && agy plugin uninstall "$n" || true
done
echo "Done."
