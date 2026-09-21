# Changelog

## 0.1.0 — 2026-09-21
- hx-core 0.1.0: always-on rules, skills `using-harness`, `notepad`, `handoff`.
- hx-workflows 0.1.0: `brainstorm`, `plan`, `tdd`, `debug`, `review`, `verify`, `ship`.
- hx-agents 0.1.0: `explorer`, `planner`, `executor`, `reviewer`, `verifier`.
- hx-guard 0.1.0: `pre-tool-guard`, `post-tool-lint`, `pre-invocation-context`, `stop-gate` (Node, 26 tests).
- Cross-platform (macOS/Linux/Windows): `install.js` + wrappers `install.sh`/`install.ps1`, Node scripts `scripts/{validate-all,test-hooks,e2e}.js`, no Python/bash dependency.
- hx-guard: Windows/PowerShell guard patterns (rmdir /s, format, diskpart, Remove-Item -Recurse, irm|iex…), 27 tests; verified on macOS and Linux (node 18/22 in Docker).
- Docs (vi).
