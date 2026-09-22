# Changelog

## 0.2.0 — 2026-09-21
- hx-core 0.2.0: skill `setup` (scaffold harness chuẩn agy vào project: root `AGENTS.md`, `.agents/{harness.json,
  rules,skills/project-checks,hooks.json,hooks/post-edit-lint.js,state}`, `.gitignore`) và `doctor` (13 check, exit code,
  `--fix`, `--json`). Script Node stdlib trong `plugins/hx-core/lib/` + `skills/*/scripts/`, 38 test.
  Detector stack v1: Node (npm/pnpm/yarn/bun, TypeScript, eslint, workspaces); stack lạ vẫn scaffold với placeholder.
- hx-core rules: ưu tiên `project-checks`/`harness.json` khi verify; gợi ý `/hx-core:setup` một lần cho project chưa có harness.
- hx-workflows `verify`: đọc `checks` từ `.agents/harness.json` trước `goal.json`.
- `scripts/test.js` chạy mọi `__tests__` dưới `plugins/`; `test-hooks.js` giữ làm alias cho hx-guard.

## 0.1.0 — 2026-09-21
- hx-core 0.1.0: always-on rules, skills `using-harness`, `notepad`, `handoff`.
- hx-workflows 0.1.0: `brainstorm`, `plan`, `tdd`, `debug`, `review`, `verify`, `ship`.
- hx-agents 0.1.0: `explorer`, `planner`, `executor`, `reviewer`, `verifier`.
- hx-guard 0.1.0: `pre-tool-guard`, `post-tool-lint`, `pre-invocation-context`, `stop-gate` (Node, 26 tests).
- Cross-platform (macOS/Linux/Windows): `install.js` + wrappers `install.sh`/`install.ps1`, Node scripts `scripts/{validate-all,test-hooks,e2e}.js`, no Python/bash dependency.
- hx-guard: Windows/PowerShell guard patterns (rmdir /s, format, diskpart, Remove-Item -Recurse, irm|iex…), 27 tests; verified on macOS and Linux (node 18/22 in Docker).
- Docs (vi).
