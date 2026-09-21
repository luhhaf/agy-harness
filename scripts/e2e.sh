#!/usr/bin/env sh
# End-to-end checks against a real agy install.
#  - free checks: skill and hook discovery via print-mode slash commands
#  - paid check (uses model quota): --full runs one real turn per plugin
# Requires the harness to be registered globally (install.sh) or installed
# (agy plugin install), because print mode does not load workspace plugins.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FULL=0; [ "${1:-}" = "--full" ] && FULL=1
command -v agy >/dev/null 2>&1 || { echo "agy not found"; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "python3 needed for JSON parsing"; exit 1; }
cd "$ROOT"
fail=0

echo "== skills discovered =="
skills="$(agy -p '/skills' --output-format json 2>/dev/null | python3 -c 'import sys,json; d=json.load(sys.stdin); print(" ".join(s["name"] for s in d["command"]["data"]["skills"]))')"
for s in hx-core:using-harness hx-core:notepad hx-core:handoff hx-workflows:brainstorm hx-workflows:plan hx-workflows:tdd hx-workflows:debug hx-workflows:review hx-workflows:verify hx-workflows:ship; do
  case " $skills " in *" $s "*) echo "  ok   $s";; *) echo "  MISSING $s"; fail=1;; esac
done

echo "== hooks discovered =="
hooks="$(agy -p '/hooks' --output-format json 2>/dev/null | python3 -c 'import sys,json; d=json.load(sys.stdin); print(" ".join(h["name"] for h in d["command"]["data"]["hooks"]))')"
for h in hx-pre-tool-guard hx-post-tool-lint hx-pre-invocation-context hx-stop-gate; do
  case " $hooks " in *" $h "*) echo "  ok   $h";; *) echo "  MISSING $h"; fail=1;; esac
done

if [ $FULL -eq 1 ]; then
  echo "== full: skill content loads (1 model turn) =="
  r="$(agy -p '/hx-core:using-harness Do not use tools. Quote exactly the table row for "create a todo / task list".' --output-format json --print-timeout 150s 2>/dev/null | python3 -c 'import sys,json; print(json.load(sys.stdin).get("response",""))')"
  echo "$r" | grep -q 'ArtifactType' && echo "  ok   skill body injected" || { echo "  FAIL skill body not injected"; fail=1; }

  echo "== full: deny hook blocks a matching command (1 model turn) =="
  r="$(agy -p 'Run exactly this harmless command and report the result verbatim: dd if=/dev/zero of=/dev/null bs=1 count=1' --output-format json --print-timeout 150s 2>/dev/null | python3 -c 'import sys,json; print(json.load(sys.stdin).get("response",""))')"
  echo "$r" | grep -q 'hx-guard:dd-disk' && echo "  ok   pre-tool-guard denied" || { echo "  FAIL pre-tool-guard did not deny"; fail=1; }

  echo "== full: explorer subagent constructs and answers (1 model turn) =="
  r="$(agy -p "Use invoke_subagent with TypeName 'explorer' and task: 'List the path of every plugin.json in this repository.' Report its answer verbatim." --output-format json --print-timeout 240s 2>/dev/null | python3 -c 'import sys,json; print(json.load(sys.stdin).get("response",""))')"
  echo "$r" | grep -q 'hx-guard/plugin.json' && echo "  ok   explorer answered" || { echo "  FAIL explorer"; fail=1; }
fi

[ $fail -eq 0 ] && echo "E2E OK" || { echo "E2E FAILED"; exit 1; }
