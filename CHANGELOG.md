# Changelog

## 0.4.0 — 2026-09-22
- **hx-core 0.4.0 — skill `adopt`**: tái sử dụng harness Claude Code có sẵn trong project trên agy.
  Script `skills/adopt/scripts/adopt.js` (dry-run mặc định, `--apply` mới ghi, `--only`, `--force`)
  chuyển `CLAUDE.md` (+`@import`) → `AGENTS.md`, `.claude/skills|commands|agents|rules` →
  `.agents/…` (đổi tên tool `Read/Edit/Bash/…` → `view_file/replace_file_content/run_command/…`
  chỉ trong code span và frontmatter; phần còn sót liệt kê `file:line`), `.mcp.json` →
  `.agents/mcp_config.json`, auto-memory của repo → khối đánh dấu trong `notepad.md` (lọc secret).
  Hooks và permissions trong `.claude/settings.json` không chuyển được: chỉ phân loại và chỉ ra phần
  hx-guard/setup thay thế. Ghi `.agents/adopt.json` (hash nguồn/đích) để chạy lại an toàn; file đích
  sửa tay được giữ nguyên trừ khi `--force`; không bao giờ ghi đè `AGENTS.md` không do adopt sinh.
  `doctor` thêm check `adopt-drift` (14 check): cảnh báo khi có Claude config chưa adopt hoặc nguồn
  đổi sau lần adopt gần nhất. 9 file test mới.

## 0.3.0 — 2026-09-22
Sửa 6 điểm yếu từ đợt review "áp dụng agy vào phát triển phần mềm thật".

- **Verify có enforcement** (hx-workflows 0.2.0, hx-guard 0.2.0): skill `verify` chạy script
  `skills/verify/scripts/verify.js` (Node stdlib): tìm check theo thứ tự `--check` → `harness.json` →
  `goal.json` → heuristics (npm/pnpm/yarn/bun, `./mvnw`, `./gradlew`, `go`, `pytest`, `Makefile`), chạy
  lần lượt, dừng ở lỗi đầu tiên, ghi bằng chứng `.agents/state/verify.json` (exit, ms, 30 dòng cuối),
  và **chỉ khi pass** mới đặt `goal.json` `done: true, active: false`. Exit 0/1/2/3. 10 test.
  - `stop-gate` chỉ cho goal đang mở dừng khi `verify.json` `passed: true` cho đúng goal; `done: true`
    sửa tay → vẫn ép tiếp tục ("no passing verify evidence"); lần verify gần nhất lỗi → nêu lệnh lỗi.
  - `pre-tool-guard` nay match cả `write_to_file|replace_file_content|multi_replace_file_content`:
    deny ghi tay `verify.json`, deny `"done": true` vào `goal.json` (`active: false` vẫn được, là lối
    thoát khi kẹt). Pattern shell mới: deny `> / tee / sed -i / cp / mv` vào `verify.json`, ask khi ghi
    shell vào `goal.json`.
- **Lint không còn "câm"**: contract PostToolUse của agy chỉ nhận `{}` và stderr không tới model, nên
  `post-tool-lint` (hx-guard) và hook `post-edit-lint.js` sinh bởi `setup` giờ xếp notice vào
  `.agents/state/lint.json`; `pre-invocation-context` bơm notice ở lượt sau rồi xoá (tối đa 20 notice,
  mỗi gợi ý formatter tối đa 1 lần / 30 phút). Context bơm mỗi lượt nay gồm cả kết quả verify gần
  nhất; giới hạn 3000 ký tự.
- **Skill mới `execute`**: chạy cả plan tới cùng (task kế tiếp → tdd → Verify của task → tick;
  `executor` song song cho task độc lập, tối đa 3) rồi verify toàn bộ. `plan` gợi ý `execute`; `tdd`
  chỉ sang `execute` khi hết task.
- **Skill mới `commit`**: commit theo nhóm logic, học style message từ `git log`, không commit
  state/secret/build output, không push. `ship` dùng `commit`.
- hx-core `using-harness` + rules: mô tả `verify.json`, `lint.json`, `execute`, `commit`; ghi rõ
  `multi_replace_file_content` chỉ có ở agent chính, không khai trong `tools` của subagent.
- Docs 03/05/07/08/09 + README cập nhật; `scripts/e2e.js` kiểm tra 14 skill.
- **hx-core 0.3.0 — đa stack**: detector Maven (`./mvnw`/`mvn`, spotless), Gradle (`./gradlew`/`gradle`), Go
  (build/vet/golangci-lint/test, `gofmt -l`), Python (uv/poetry/pip, ruff/mypy/pytest) bên cạnh Node; mọi detector
  trả cùng shape (`checks`, `testGlobs`, `lint`, …) nên template không phụ thuộc stack (glob rule test và dòng
  build tool trong `AGENTS.md` theo stack). Hook `post-edit-lint.js` sinh ra chạy linter theo file: eslint /
  `ruff check` / `gofmt -l`; Maven/Gradle không có. `doctor checks-runnable` cảnh báo thiếu wrapper `mvnw`/`gradlew`
  hoặc lockfile uv/poetry. Skill `setup` có đường onboarding cho repo cũ/lớn: giao khảo sát cho subagent `explorer`
  rồi điền placeholder. Registry ghi agy 1.2.7; `hxSkills` thêm `execute`, `commit`. +12 test (hx-core: 50).
- Tổng: `node scripts/test.js` = 98 test; `node scripts/e2e.js` = 14 skill + 4 hook được agy 1.2.7 nhận.

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
