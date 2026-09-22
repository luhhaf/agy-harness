# 01 · Kiến trúc

## Cách agy nạp customization (tóm tắt những gì đã kiểm chứng)

```
~/.gemini/config/                      ← GLOBAL (mọi workspace)
├── plugins.json      {"entries":[{"path":"~/agy-harness/plugins"}]}   ← install.sh ghi ở đây
├── plugins/<name>/   ← nơi `agy plugin install` copy vào (cách B)
├── config.json       {"plugins":{"hx-guard":{"enabled":false}}}        ← trạng thái bật/tắt theo máy
└── mcp_config.json, hooks.json, skills/, agents/

<repo dự án>/.agents/                  ← WORKSPACE (commit chung với team)
├── skills/, agents/, rules/, hooks.json, plugins/, plugins.json
└── state/            ← agy-harness dùng: notepad.md, goal.json, handoff.md (gitignore)

~/.gemini/antigravity-cli/             ← riêng CLI: settings.json, logs, builtin skills
```

Ưu tiên khi trùng tên: workspace > `skills.json`/`plugins.json` workspace > global > built-in.

Một plugin = thư mục có `plugin.json`; agy tự nạp `skills/`, `agents/`, `rules/`, `commands/`,
`hooks.json`, `mcp_config.json` bên trong. Repo này đặt tất cả plugin trong `plugins/`; agy nhận
diện đây là **bulk plugins directory** khi `agy plugin install <repo>`.

## Các plugin và cách chúng ghép với nhau

```
                ┌──────────── hx-core ────────────┐
                │ rules/AGENTS.md (always-on)     │  "dùng skill trước, task artifact,
                │ skills: setup, doctor,          │   verify trước khi nói xong"
                │   using-harness, notepad,       │  setup/doctor = script Node trong
                │   handoff                       │  lib/ → sinh & kiểm tra .agents/ của project
                └───────────────┬─────────────────┘
                                │ đọc/ghi .agents/state/*
   ┌──────── hx-workflows ──────┴──────────┐      ┌──────── hx-agents ────────┐
   │ brainstorm → plan → tdd → review →    │ ───▶ │ explorer  (flash, read)   │
   │ verify → ship                         │ gọi  │ planner   (pro,   read)   │
   │ plan ghi goal.json; verify đóng nó    │      │ executor  (inherit, write)│
   └──────────────────┬────────────────────┘      │ reviewer  (pro,   read)   │
                      │                            │ verifier  (inherit, run)  │
                      ▼                            └───────────────────────────┘
   ┌──────────────── hx-guard (hooks) ─────────────────────────────────────────┐
   │ PreToolUse  run_command   → pre-tool-guard.js   deny / ask                │
   │             write/replace → pre-tool-guard.js   bảo vệ goal.json/verify.json│
   │ PostToolUse write/replace → post-tool-lint.js   xếp gợi ý vào lint.json   │
   │ PreInvocation             → pre-invocation-context.js  notepad+goal+verify+lint│
   │ Stop                      → stop-gate.js        chưa có verify.json pass → continue│
   └────────────────────────────────────────────────────────────────────────────┘
```

Mỗi plugin **độc lập**: tắt `hx-agents` thì skill `review` tự làm review thay vì gọi subagent
(skill có nhánh "nếu không có subagent"). Tắt `hx-guard` thì mất chặn lệnh và vòng lặp goal,
nhưng workflow vẫn chạy.

## Harness của từng project (`<repo>/.agents/`, commit chung)

`/hx-core:setup` sinh, `/hx-core:doctor` kiểm tra:

| File | Ai ghi | Ai đọc |
|---|---|---|
| `AGENTS.md` (root repo) | `setup` (chỉ khi chưa có), bạn | agy (always-on trong scope repo), Codex/Cursor cũng đọc |
| `.agents/harness.json` | `setup` | skill `verify` (`checks`), `doctor` |
| `.agents/rules/*.md` | `setup` (khung glob), model điền | agy khi sửa file khớp glob |
| `.agents/skills/project-checks/SKILL.md` | `setup` | skill `verify`, bạn (`/project-checks`) |
| `.agents/hooks.json` + `hooks/post-edit-lint.js` | `setup` | agy: PostToolUse → linter theo file (eslint/ruff/gofmt) trên file vừa sửa → `.agents/state/lint.json`, hx-guard bơm lượt sau |

Chi tiết: [09-setup-project.md](09-setup-project.md).

## Luồng dữ liệu qua `.agents/state/`

| File | Ai ghi | Ai đọc |
|---|---|---|
| `notepad.md` | skill `notepad`, `brainstorm` (decisions), bạn | hook `pre-invocation-context` (mục **Priority**), skill `handoff` |
| `goal.json` | skill `plan` (tạo), **script** `verify.js` (đóng), hook `stop-gate` (đếm `continues`) | hook `pre-invocation-context`, `stop-gate`, skill `verify`, `execute`, `ship` |
| `verify.json` | chỉ script `verify.js` (hx-guard deny mọi cách ghi khác) | hook `stop-gate` (bằng chứng), `pre-invocation-context` |
| `lint.json` | hook `post-tool-lint` (hx-guard), hook `post-edit-lint.js` của project | hook `pre-invocation-context` (rút và xoá mỗi lượt) |
| `handoff.md` | skill `handoff` | bạn / phiên sau |

`goal.json`:
```json
{
  "active": true, "done": false,
  "goal": "Add PDF export for orders",
  "plan": "docs/plans/2026-09-21-pdf-export-plan.md",
  "checks": ["./mvnw -q test", "./mvnw -q spotless:check"],
  "continues": 0, "maxContinues": 5,
  "updated": "2026-09-21T10:00"
}
```
`.agents/state/` nằm trong **workspace** (không phải global) nên trạng thái đi theo dự án; mặc định
gitignore, bạn có thể bỏ ignore nếu muốn đồng bộ notepad qua git giữa các máy.

## Vì sao tách 4 plugin nhỏ thay vì 1

- Bật/tắt theo máy hoặc theo dự án (`config.json` không nằm trong repo).
- Thay hooks (Node) bằng cách khác mà không đụng skills.
- Thêm plugin theo stack (`hx-stack-java-spring`…) mà không làm phình `hx-core`.
- Ràng buộc: agent chỉ tham chiếu skill/agent bằng đường dẫn **trong cùng plugin**; giữa các plugin
  gọi nhau bằng **tên** (`invoke_subagent` TypeName `reviewer`, slash `/hx-workflows:verify`).

## Giới hạn đã biết của agy 1.2.6 (ảnh hưởng thiết kế)

- Print mode (`agy -p`) gửi `workspacePaths: []` cho hook → hook tra ngược workspace qua
  `<appData>/cache/last_conversations.json` bằng `conversationId`. Interactive gửi đủ.
- Print mode không nạp `.agents/plugins.json` / `.agents/plugins/` của workspace (skill thường
  `.agents/skills/` thì có). Vì vậy dogfood/CI dùng đăng ký global (`install.sh`).
- `-p "/skills"` chỉ liệt kê skill global/built-in, không liệt kê skill workspace.
- Hook chỉ `type: command`, chạy đồng bộ, CWD = thư mục chứa `hooks.json`.
- Tên tool trong `agents/*.md` phải đúng registry; tên sai → subagent lỗi ngay khi khởi tạo
  (ví dụ `command_status` không tồn tại). Danh sách đã kiểm chứng ở [04-agents.md](04-agents.md).
- Không có todo tool; dùng task artifact (`write_to_file` + `IsArtifact: true`, `ArtifactType: "task"`).
