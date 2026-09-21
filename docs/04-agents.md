# 04 · Subagents (hx-agents)

Custom agent = file `agents/<name>.md`: YAML frontmatter + system prompt chia bằng H1.
Agent chính gọi bằng tool `invoke_subagent` với `TypeName` = `name` trong frontmatter
(đã kiểm chứng: `explorer`, `executor`, `verifier` khởi tạo và chạy được).

| Agent | Model | Tools | Ghi file | Chạy lệnh | Dùng cho |
|---|---|---|---|---|---|
| `explorer` | flash | view_file, grep_search, find_by_name, list_dir | ✗ | ✗ | map code, tìm call site, "X hoạt động ra sao" |
| `planner` | pro | như explorer | ✗ | ✗ | chia task, rủi ro |
| `executor` | inherit | + write_to_file, replace_file_content, run_command | ✔ | ✔ (auto) | làm đúng 1 task, chạy test của task |
| `reviewer` | pro | explorer + run_command | ✗ | ✔ (sandbox) | review theo P0/P1/P2 |
| `verifier` | inherit | explorer + run_command | ✗ | ✔ (auto) | chạy check, báo bằng chứng |

Tất cả `subagent: true`, `mainAgent: false` (không hiện trong picker `/agents` làm agent chính;
muốn dùng làm primary thì đổi `mainAgent: true` và chạy `agy --agent reviewer`).

## Tên tool hợp lệ (đã kiểm chứng trên agy 1.2.6)

Tool baseline của agent chính (model tự liệt kê): `view_file, run_command, manage_task,
send_message, schedule, invoke_subagent, define_subagent, manage_subagents, write_to_file,
replace_file_content, generate_image, read_url_content, search_web, ask_question`.

Tool bổ sung custom agent được phép khai báo: `grep_search, find_by_name, list_dir`
(đã bị bỏ khỏi baseline nhưng vẫn dùng được khi liệt kê trong `tools`).

**Không tồn tại** (gây lỗi "unknown component: tool X not found in registry" khi khởi tạo
subagent): `command_status`, `multi_replace_file_content`, `codebase_search`, `edit_file`.
Nếu bạn thêm tool mới, test bằng một lượt thật (`node scripts/e2e.js --full` hoặc thủ công) — tên sai
không làm treo mà báo lỗi ngay, nhưng subagent sẽ không chạy.

Tên tool trong **hook matcher** (PreToolUse/PostToolUse) là tên tool call thực tế, đã đo được:
`write_to_file`, `replace_file_content`, `view_file`, `run_command`.

## Frontmatter tham khảo

```yaml
---
name: reviewer
description: >-            # quyết định khi nào agent chính delegate
  Reviews a diff for bugs, security, tests...
tools: [view_file, grep_search, find_by_name, list_dir, run_command]
subagent: true
mainAgent: false
model: pro                 # inherit | flash | pro
commandExecutionPolicy: sandbox   # off | auto | eager | sandbox
skills: [skills/security-checklist]   # đường dẫn tương đối theo file agent (cùng plugin)
agents: []                 # subagent phụ thuộc
rules: []                  # rule file áp dụng riêng
inheritCustomizations: true      # nhận skills/rules/plugins/MCP của user
excludeDefaultComponents: false  # true = bỏ prompt mặc định + built-in tools
---
# System Prompt
...
# Output format
...
```

## Gọi subagent từ skill / prompt

```
Use invoke_subagent with TypeName 'reviewer' and this task:
"Review `git diff main...HEAD`. Project tests: ./mvnw -q test. Goal: add PDF export."
```
Cho subagent: mục tiêu, file/lệnh cần thiết, và **định dạng trả về** (đã có sẵn trong system prompt
của từng agent). Chạy nhiều subagent song song cho các task độc lập (executor cho T2 và T3).

Subagent chạy trong worktree riêng dưới `.system_generated/worktrees` khi agy quyết định fork;
theo dõi ở panel `/agents`, phê duyệt nhanh bằng `ctrl+k`.

## Built-in subagents của agy (dùng được song song)
`self` (bản sao đầy đủ), `research` (read-only), `browser` (test web sandboxed).
