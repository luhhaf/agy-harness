# 03 · Skills

Skill = thư mục `skills/<name>/SKILL.md` có frontmatter `name`, `description`. agy chỉ nạp
**tên + description** vào context; nội dung đầy đủ chỉ nạp khi bạn gõ `/<plugin>:<name>` hoặc model
tự chọn skill vì description khớp. Vì vậy description là phần quan trọng nhất.

Gọi: `/hx-workflows:plan <ghi chú>` — phần sau tên skill là tham số tự do. Chain được:
`/plan /hx-workflows:brainstorm Thêm OAuth` (`/plan` là mode có sẵn của agy).

## hx-core

| Skill | Khi nào dùng | Tạo ra |
|---|---|---|
| `setup` | Project code chưa có `.agents/harness.json`; "setup harness", "chuẩn hoá project cho agy" | Root `AGENTS.md`, `.agents/{harness.json, rules/*.md, skills/project-checks, hooks.json, hooks/post-edit-lint.js, state/}`, dòng `.agents/state/` trong `.gitignore` — xem [09-setup-project](09-setup-project.md) |
| `doctor` | Sau `setup`; skill/hook/subagent chạy lạ trong project; "kiểm tra harness" | Báo cáo 13 check `[ok|warn|FAIL]`, exit 1 nếu có lỗi, `--fix` cho state |
| `using-harness` | Đầu phiên; khi skill nhắc tool bạn không có; không biết chọn skill nào | Bảng map hành động→tool, sơ đồ chọn workflow |
| `notepad` | "nhớ cái này", "ta đã quyết gì" | `.agents/state/notepad.md` (Priority / Decisions / Working notes / Open questions) |
| `handoff` | Cuối phiên, đổi máy, context dài | `.agents/state/handoff.md` |

Mục **Priority** của notepad (≤ 1500 ký tự) được hook bơm vào **mọi lượt** — chỉ để những điều
thật sự cần nhớ: mục tiêu hiện tại, ràng buộc cứng.

## hx-workflows

| Skill | Mục đích | Đầu vào | Đầu ra / trạng thái |
|---|---|---|---|
| `brainstorm` | Chốt *cái gì* và *tại sao* trước khi code. Hỏi 1 câu/lượt, 2–3 hướng, YAGNI | ý tưởng | `docs/plans/<date>-<topic>-design.md`, 1 dòng Decisions trong notepad |
| `plan` | Chia thành task nhỏ có lệnh verify; gọi subagent `planner` | design | `docs/plans/<date>-<topic>-plan.md`, task artifact, `.agents/state/goal.json` (active) |
| `tdd` | Red → green → refactor cho 1 task | task | test + code, tick task artifact |
| `debug` | Reproduce → isolate → hypothesis → fix → regression test | lỗi | root cause + fix + test |
| `review` | Review diff bằng subagent `reviewer`, tự kiểm chứng finding | diff/branch/PR | danh sách P0/P1/P2 + verdict |
| `verify` | Chạy check thật, đọc output, báo bảng bằng chứng | – | `goal.json.done = true` nếu tất cả pass |
| `ship` | verify → review → commit sạch → PR description → handoff | – | PR text, goal đóng |

### Quy ước chung của mọi skill
- Kết thúc bằng bước **verify** hoặc chỉ sang `verify`.
- Ghi việc vào **task artifact** (agy không có todo tool).
- Có nhánh "nếu không có subagent" để chạy được khi `hx-agents` bị tắt.
- Không tự commit/push/tạo PR nếu bạn chưa nói.

### Cách `verify` tìm lệnh kiểm tra
Theo thứ tự: `checks` trong `.agents/harness.json` (skill `project-checks`) → `checks` trong `goal.json` → `Makefile` → `package.json` scripts → `./mvnw`/`mvn`
→ `./gradlew` → `pytest`/`ruff` → `go test`. Với Java/Spring: `./mvnw -q verify` (hoặc
`./gradlew check`). Muốn cố định, ghi `checks` khi `plan`, hoặc sửa `goal.json` bằng tay.

## Dùng trong headless / CI

```bash
agy -p "/hx-workflows:verify" --output-format json --print-timeout 600s
agy -p "/hx-workflows:review Review git diff main...HEAD" --output-format json
```
Print mode tuân `settings.json` permissions; hook `ask` sẽ thành từ chối và được liệt kê trong
`denied_actions`. Muốn chạy không hỏi: thêm `permissions.allow` hoặc `--dangerously-skip-permissions`
(hook `deny` vẫn chặn).

## Tuỳ biến
- Sửa trực tiếp `plugins/hx-workflows/skills/<name>/SKILL.md` trong bản clone; commit lại.
- Muốn ẩn skill khỏi menu `/` nhưng vẫn cho model tự chọn: thêm `disable-slash-command: true`
  vào frontmatter.
- Icon: `metadata.icon: "🧪"`.
