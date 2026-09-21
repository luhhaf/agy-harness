#!/usr/bin/env sh
# macOS / Linux. Windows: node uninstall.js  (or: node install.js --uninstall)
set -eu
exec node "$(cd "$(dirname "$0")" && pwd)/install.js" --uninstall "$@"
