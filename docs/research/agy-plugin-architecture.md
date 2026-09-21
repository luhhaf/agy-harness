# Nghiên cứu: Xây dựng bộ plugin / harness cho Antigravity CLI (`agy`)

> Khảo sát ngày 2026-09-21 trên `agy` **1.2.6** (macOS). Nguồn: `agy --help`, `agy changelog`,
> skill built-in `agy-customizations` + `antigravity_guide` (trong `~/.gemini/antigravity-cli/builtin/skills/`),
> docs công khai `antigravity.google/docs/{plugins,subagents,rules-workflows,cli/features}`,
> plugin thật đã cài (`google-antigravity-sdk`) và thử nghiệm `agy plugin validate`.

---

## 1. Kết luận nhanh

- `agy` có **hệ thống plugin first-class** rất giống Claude Code: một plugin = thư mục có `plugin.json` + các thư mục con `skills/`, `agents/`, `rules/`, `commands/`, `hooks.json`, `mcp_config.json`.
- Có 6 "nguyên liệu" để xây harness: **Rules → Skills → Agents (subagents) → Hooks → MCP servers → Plugins (đóng gói)**, cộng thêm **Sidecars** (tiến trình nền/cron) và **Python SDK** (điều khiển agent từ code).
- Có CLI đầy đủ để dev: `agy plugin validate | install | enable | disable | uninstall | import | link`, headless mode `agy -p "/skill ..."` để test tự động, `--agent <name>` để chạy custom agent làm primary.
- Marketplace (`marketplace.json`, `plugin@marketplace`) **tồn tại trong binary** nhưng chưa có tài liệu công khai; cách phân phối an toàn hiện nay là **local path / git repo + `plugins.json`**.
- Khả năng port từ Claude Code: cấu trúc `skills/<name>/SKILL.md` giống hệt; `commands/*.md` được tự chuyển thành skill; `agy plugin import claude` có sẵn. Hook contract **khác** (tên event, payload camelCase, stdin/stdout JSON) nên phải viết lại.

---

## 2. Bản đồ thư mục & vị trí cấu hình

| Phạm vi | Đường dẫn | Ghi chú |
|---|---|---|
| Workspace (commit vào repo) | `<repo>/.agents/` (hoặc `.agent/`, `_agents/`, `_agent/`) | Chứa `skills/`, `agents/`, `rules/`, `plugins/`, `hooks.json`, `skills.json`, `plugins.json` |
| Rules theo thư mục | `AGENTS.md`, `GEMINI.md` ở bất kỳ thư mục nào; `.agents/rules/*.md` | Walk từ CWD lên root repo |
| Global (máy) | `~/.gemini/config/` | `plugins/`, `skills/`, `agents/`, `mcp_config.json`, `hooks.json`, `config.json` (trạng thái enable plugin/sidecar), `sidecars/` |
| CLI-private | `~/.gemini/antigravity-cli/` | `settings.json`, `mcp_config.json`, `keybindings.json`, `builtin/skills/`, `plugin_data/`, logs, DB hội thoại |
| Plugin cài từ CLI | `~/.gemini/config/plugins/<name>/` | Có thêm `installed_version.json` |

**Thứ tự ưu tiên** (cao → thấp) khi trùng tên: Workspace project → `skills.json`/`plugins.json` workspace → Global `~/.gemini/config/` → Built-in → Global declared JSON.

**Ngân sách token**: rules user + workspace có budget riêng 20k token (rule quá dài bị cắt theo dòng); mỗi rule file ≤ 12.000 ký tự. Skills chỉ nạp name+description (progressive disclosure), nội dung nạp khi kích hoạt.

---

## 3. Sáu loại customization – format chi tiết

### 3.1 Rules
- `AGENTS.md` / `GEMINI.md`: **không** hỗ trợ frontmatter, luôn active trong scope thư mục.
- `.agents/rules/<name>.md`: có frontmatter, 4 chế độ kích hoạt: `manual` (@mention), `always_on`, `model_decision` (theo `description`), `glob` (áp dụng khi sửa file khớp pattern). Hỗ trợ `@filename` để tham chiếu file khác.
- Trong plugin: `rules/AGENTS.md` (khuyến nghị gộp 1 file) hoặc khai báo qua `rules.json` ở root plugin.
- Agent Markdown có thể khai báo `rules:` để chỉ định rule file cụ thể (luôn áp dụng).

### 3.2 Skills (`skills/<name>/SKILL.md`)
```markdown
---
name: my-skill            # lowercase-hyphen, unique
description: >-           # QUAN TRỌNG NHẤT: what + when, ngôi thứ 3
  Use this skill when the user asks to run integration tests for XYZ.
disable-slash-command: true   # tuỳ chọn: ẩn khỏi menu "/" nhưng model vẫn gọi được
metadata:
  icon: "🧪"              # tuỳ chọn: icon hiển thị
---
# Steps
1. Run [prepare.sh](./scripts/prepare.sh)
2. ...
```
- Thư mục con chuẩn: `scripts/`, `examples/`, `resources/`, `references/`.
- Mỗi skill = slash command `/<name>`; trong plugin là `/<plugin>:<name>`.
- Hoạt động cả trong headless: `agy -p "/my-skill review this diff"`.
- Có thể chain nhiều lệnh: `/plan /grill-me <prompt>`.
- `/skills reload` để nạp lại không cần restart.
- **Workflows (`.agents/workflows/*.md`) đã deprecated** → dùng skill (built-in skill `migrate-workflows` có sẵn).

### 3.3 Custom Agents (`agents/<name>.md` hoặc `agents/<name>/agent.md`)
```yaml
---
name: code-auditor
description: Security audits, static analysis, code quality reviews.   # dùng để planner quyết định delegate
tools:                     # whitelist tool; tên SAI → subagent có thể TREO
  - view_file
  - grep_search
  - run_command
  - invoke_subagent        # nếu có, agent tự nhận roster subagent trong system prompt
subagent: true             # gọi được qua invoke_subagent (default true)
mainAgent: false           # có xuất hiện trong /agents làm primary không (default true)
hidden: false
model: pro                 # inherit | flash | pro
commandExecutionPolicy: sandbox   # off | auto | eager | sandbox
skills:                    # đường dẫn workspace-relative / absolute / agent-relative
  - skills/security-checklist
agents:                    # subagent phụ thuộc (cùng quy tắc path như skills)
  - agents/explorer.md
rules:
  - rules/security.md
plugins: []
mcpServers: []             # MCP riêng của agent
enable_mcp_tools: true
inheritCustomizations: true   # 1 switch: adopt skills/rules/plugins/subagents/MCP của user
excludeDefaultComponents: false   # true = bỏ prompt mặc định + built-in tools (giữ post-invocation hooks)
exclude: []                # lọc skill khi runtime
---
# System Prompt
You are ...

# Review Guidelines
1. ...
```
- Nội dung sau frontmatter = system prompt, chia bằng H1.
- Subagent built-in: `self` (clone full-capability), `research` (read-only), `browser` (test web sandboxed).
- Chạy làm primary: `agy --agent code-auditor`; liệt kê: `agy agents`.
- Tool mặc định: `find_by_name`, `grep_search`, `list_dir` đã bị loại khỏi baseline, nhưng custom agent liệt kê trong `tools` vẫn dùng được.
- `manage_task` = quản lý background process (list/kill/status/send_input), **không phải todo**. Antigravity không có todo tool; theo dõi việc bằng **task artifact** (`write_to_file` với `IsArtifact: true`, `ArtifactType: "task"`).

### 3.4 Hooks (`hooks.json`)
```json
{
  "lint-checker": {
    "enabled": true,
    "PostToolUse": [
      { "matcher": "run_command|write_to_file", "hooks": [ { "type": "command", "command": "./scripts/lint.sh", "timeout": 10 } ] }
    ]
  },
  "safety-gate": {
    "PreToolUse": [
      { "matcher": "run_command", "hooks": [ { "command": "./scripts/safety-check.sh" } ] }
    ]
  },
  "context-inject": { "PreInvocation": [ { "command": "./scripts/inject.sh" } ] },
  "keep-going":     { "Stop":          [ { "command": "./scripts/stop-gate.sh" } ] }
}
```
- 5 event: `PreToolUse`, `PostToolUse` (có `matcher` regex theo tool name), `PreInvocation`, `PostInvocation`, `Stop` (flat list).
- **Contract stdin/stdout JSON, key camelCase**. Field chung: `conversationId`, `workspacePaths`, `transcriptPath`, `artifactDirectoryPath`, `modelName`.
  - `PreToolUse` out: `{"decision": "allow|deny|ask|force_ask", "reason", "permissionOverrides": [...], "overwrite": {...}}` — `overwrite` cho phép **sửa args tool trước khi chạy** (shallow merge).
  - `PreInvocation`/`PostInvocation` out: `{"injectSteps": [{"ephemeralMessage": "..."} | {"userMessage": "..."} | {"toolCall": {...}}], "terminationBehavior": "force_continue|terminate"}`.
  - `Stop` in: `terminationReason`, `fullyIdle`; out: `{"decision": "continue", "reason": "..."}` → chống agent dừng sớm (giống ralph loop). Có giới hạn số lần continue liên tiếp để tránh treo.
- CWD của hook = thư mục chứa `hooks.json`; chạy qua `sh -c`; timeout mặc định 30s; **đồng bộ, block loop**; chỉ `type: command`.
- Hook trong plugin bị tắt khi plugin disable. `/hooks` liệt kê cả hook của plugin.

### 3.5 MCP servers (`mcp_config.json`)
```json
{
  "mcpServers": {
    "local-tool": { "command": "node", "args": ["${extensionPath}/mcp/server.js"], "env": { "X": "1" } },
    "remote":     { "serverUrl": "https://mcp.example.com/sse" },
    "http":       { "url": "https://...", "type": "http", "headers": {}, "enabledTools": [], "timeoutSeconds": 30 }
  }
}
```
- Trong plugin: cwd/relative path resolve theo **thư mục plugin**; server bị namespace `<plugin>_<server>` nếu trùng tên. `${extensionPath}` (biến kiểu Gemini CLI) được resolve về thư mục cài.
- Hỗ trợ comment `//`, `/* */`, trailing comma, BOM. Quản lý bằng `agy mcp add|remove|list|enable|disable`.

### 3.6 Plugin (đóng gói)
```text
plugins/<plugin-name>/
├── plugin.json        # bắt buộc
├── mcp_config.json    # tuỳ chọn
├── hooks.json         # tuỳ chọn
├── rules.json         # tuỳ chọn: khai báo rule files
├── skills/<name>/SKILL.md
├── agents/<name>.md
├── commands/<name>.md # kiểu Claude Code; validate báo "processed (converted to skills)"
└── rules/AGENTS.md
```
```json
{
  "$schema": "https://antigravity.google/schemas/v1/plugin.json",
  "name": "agy-harness-core",        // regex ^[a-z0-9]+(-[a-z0-9]+)*$
  "version": "0.1.0",
  "description": "...",
  "author": { "name": "..." },
  "license": "MIT",
  "keywords": ["..."],
  "disabled": false                  // ship tắt mặc định nếu true
}
```
- Trạng thái bật/tắt lưu **duy nhất** ở `~/.gemini/config/config.json → plugins.<dir-name>.enabled`; không ghi vào plugin nên survive update.
- Reinstall thay thế **chính xác** thư mục quản lý (file xoá ở source cũng bị xoá).
- Skill trong plugin có prefix `/<plugin>:<skill>`; nếu frontmatter `name` đã có prefix thì không bị double.

---

## 4. CLI workflow cho người phát triển plugin

```bash
agy plugin validate ./plugins/agy-harness-core   # kiểm tra skills/agents/commands/mcpServers/hooks
agy plugin install  ./plugins/agy-harness-core   # copy vào ~/.gemini/config/plugins/<name>/
agy plugin install  <git-url>                     # clone (có resolve submodule)
agy plugin install  <name>@<marketplace>          # cần marketplace đã đăng ký (xem §5)
agy plugin list | enable <name> | disable <name> | uninstall <name>
agy plugin import claude|gemini                   # nhập plugin từ Claude Code / Gemini CLI extension
agy plugin link <marketplace> <plugin>            # sinh link cài đặt cho marketplace đã biết

# Test tự động (headless):
agy -p "/agy-harness-core:plan Add login" --output-format json --print-timeout 120s
agy -p "/skills" --output-format json             # liệt kê skill mà không tốn quota
agy -p "/hooks"  --output-format json
agy --agent reviewer -p "Review the diff"          # chạy custom agent làm primary
agy --mode plan / --effort high / --model <name> / --sandbox / --dangerously-skip-permissions
```

Kết quả `validate` thực tế trên plugin mẫu:
```
[ok]  .../probe-plugin
  ✔ skills      : 1 processed
  ✔ agents      : 1 processed
  - commands    : skipped (not found)
  - mcpServers  : skipped (not found)
  - hooks       : skipped (not found)
```

Đăng ký không cần install (dev loop nhanh): trong repo tạo `.agents/plugins.json`
```json
{ "entries": [ { "path": "plugins" } ], "inherits": [ { "path": "~/shared/plugins.json", "exclude": ["experimental-.*"] } ] }
```
(path không bắt đầu `/` hay `~/` = relative tới root repo; mỗi entry scan 1 cấp.)

---

## 5. Marketplace – trạng thái hiện tại

- Binary có module `marketplace` (Catalog / Shelf / PluginVersion / `marketplace.json`, hỗ trợ `fileCatalog` và `httpCatalog`, kiểm tra `sha256`, giới hạn số file archive, cache tự prune khi nâng cấp). Có RPC `SearchMarketplace`, `GetSkillMarketplaceLink`.
- `agy plugin install x@mp` / `agy plugin link mp x` trả `unknown marketplace` nếu chưa đăng ký; **không thấy lệnh/tài liệu công khai để đăng ký marketplace của bên thứ 3** trong 1.2.6 (có `marketplaces_flag` nội bộ). Cộng đồng đã làm tool bọc ngoài (`fledgeling-co/agy-plugins`, `ZaunEkko/agy-plugins-cli`) để quản lý marketplace GitHub.
- **Khuyến nghị**: phân phối qua git repo (monorepo `plugins/*`) + script cài đặt; chuẩn bị sẵn `marketplace.json` theo schema Claude Code để sẵn sàng khi agy mở API.

---

## 6. Tính năng runtime nên khai thác khi thiết kế harness

| Tính năng | Ý nghĩa cho harness |
|---|---|
| `/plan` mode, `--mode plan\|accept-edits` | Tách pha lập kế hoạch/thực thi; headless tự approve plan |
| `/goal` (không giới hạn), `/boost`, `/teamwork-preview` | Loop tới khi đạt mục tiêu; multi-agent (preview) |
| `invoke_subagent` + `define_subagent` | Song song hoá; subagent chạy trong worktree riêng (`.system_generated/worktrees`) |
| `Stop` hook + `PostInvocation force_continue` | Cơ chế "boulder never stops" / verifier gate |
| `PreToolUse overwrite` | Rewrite lệnh nguy hiểm, thêm flag an toàn |
| `PreInvocation injectSteps` | Bơm context (notepad, state file) mỗi lượt |
| Status line script (`statusLine`, có `cost`, `conversation_title`) | HUD hiển thị mode/state |
| `--output-format stream-json`, `--json-schema` | Tích hợp CI, structured output |
| Sidecars (`~/.gemini/config/sidecars/<name>/sidecar.json`, builtin `schedule` cron) | Job nền định kỳ (đã có ví dụ `scout-news` trên máy) |
| Python SDK `google-antigravity` | Orchestrator ngoài CLI, test e2e plugin |
| Sandbox (`--sandbox`), permissions `command(...)` trong `settings.json` | Chính sách an toàn |

Hạn chế cần nhớ: hook chỉ `command` và đồng bộ; không có todo tool; `tools` sai tên làm subagent treo; rules bị cắt nếu vượt budget; `-p` vẫn tuân `settings.json` permissions (dùng `--dangerously-skip-permissions` hoặc allowlist khi chạy CI).

---

## 7. So sánh với Claude Code plugin (để port superpowers / oh-my-claudecode)

| Khía cạnh | Claude Code | Antigravity CLI | Port |
|---|---|---|---|
| Manifest | `.claude-plugin/plugin.json` | `plugin.json` ở root | Đổi vị trí; `agy plugin import claude` làm tự động |
| Skills | `skills/<n>/SKILL.md` | giống hệt | Copy; sửa tên tool trong nội dung (xem hàng dưới) |
| Commands | `commands/*.md` | được convert thành skill | OK |
| Agents | `agents/*.md` (frontmatter `tools`, `model`) | `agents/*.md` (frontmatter khác: `subagent`, `mainAgent`, `model: flash\|pro`) | Viết lại frontmatter |
| Hooks | `hooks/hooks.json` (SessionStart, UserPromptSubmit, PreToolUse…) | `hooks.json` 5 event, payload camelCase | **Viết lại** script |
| Tool names | `Read/Edit/Bash/Grep/Agent/TodoWrite` | `view_file/replace_file_content/run_command/grep_search/invoke_subagent/task artifact` | Skill nên nói bằng "hành động", kèm bảng map (superpowers có `references/antigravity-tools.md`) |
| Marketplace | `marketplace.json` public | nội bộ, chưa mở | Git URL |
| State/memory | `.omc/`, memory dir | tự do (`.agents/state/`), `knowledge/`, `brain/` | Giữ file JSON trong workspace |

---

## 8. Đề xuất kiến trúc cho `agy-harness`

### 8.1 Cấu trúc repo (monorepo nhiều plugin, mỗi plugin cài/tắt độc lập)
```text
agy-harness/
├── plugins/
│   ├── harness-core/          # rules chung + skills nền (using-harness, notepad, verify)
│   ├── harness-workflows/     # brainstorm → plan → tdd → execute → review → ship
│   ├── harness-agents/        # explorer, planner, executor, reviewer, verifier, debugger
│   ├── harness-guard/         # hooks: safety-gate (PreToolUse), lint/format (PostToolUse), stop-gate
│   ├── harness-mcp/           # mcp_config: lsp/ast-grep/db tools tự viết (nếu cần)
│   └── harness-stack-<x>/     # rules/skills theo stack (react, go, java-spring…)
├── shared/                    # script dùng chung cho hooks (jq/bash/python), templates
├── marketplace.json           # chuẩn bị sẵn cho tương lai
├── .agents/plugins.json       # {"entries":[{"path":"plugins"}]} → dogfood ngay trong repo
├── scripts/  install.sh  validate-all.sh  e2e.sh
└── docs/
```

### 8.2 Ánh xạ OMC/superpowers → agy
| Vai trò | Hiện thực trên agy |
|---|---|
| `using-superpowers` (ép dùng skill) | rule `always_on` trong `harness-core/rules/AGENTS.md` + `PreInvocation` inject nhắc skill |
| brainstorming / writing-plans / executing-plans | skills trong `harness-workflows` (tận dụng `/plan` mode + task artifact) |
| executor / explorer / reviewer / verifier | agents `.md` với `subagent: true`, `model: flash` cho explore, `pro` cho review |
| ralph / ultrawork | `/goal` + `Stop` hook đọc `.agents/state/<mode>.json` → `continue` |
| verification-before-completion | `Stop` hook chạy test/lint; `PostInvocation force_continue` nếu fail |
| notepad / state | file JSON trong `.agents/state/`, bơm bằng `PreInvocation injectSteps` |
| HUD | status line script đọc state file |
| guard (rm -rf, git push --force) | `PreToolUse` matcher `run_command` → `deny`/`ask`/`overwrite` |

### 8.3 Vòng phát triển
1. Viết skill/agent → `agy plugin validate plugins/<p>`.
2. Dogfood qua `.agents/plugins.json` (không cần install).
3. Test headless: `agy -p "/harness-workflows:plan <task>" --output-format json` trong CI (GitHub Actions dùng `GEMINI_API_KEY` + `modelProvider: gemini`).
4. Phát hành: tag git; người dùng `agy plugin install https://github.com/luhhaf/agy-harness` (hoặc script cài từng plugin).

---

## 9. Quyết định cần chốt trước khi bắt tay
1. **Phạm vi**: port toàn bộ OMC + superpowers, hay chọn ~8–10 skill cốt lõi trước (brainstorm, plan, tdd, debug, review, verify, ship, worktree)?
2. **Hình thức**: 1 plugin lớn (dễ cài) hay nhiều plugin nhỏ (bật/tắt theo nhu cầu)? Đề xuất: nhiều plugin trong monorepo.
3. **Ngôn ngữ hook scripts**: bash+jq (không dependency) hay python/node (dễ test)?
4. **Stack ưu tiên** cho rules: các dự án hiện tại của bạn dùng gì (Java/Spring? React? Go?).
5. **Có cần MCP tự viết** (LSP, AST-grep, DB) hay tận dụng MCP có sẵn?

## Nguồn
- Docs: https://antigravity.google/docs/plugins · https://antigravity.google/docs/subagents/ · https://antigravity.google/docs/rules-workflows · https://antigravity.google/docs/hooks · https://antigravity.google/docs/cli/features · https://antigravity.google/docs/cli/reference
- Repo/Changelog: https://github.com/google-antigravity/antigravity-cli
- SDK: https://github.com/google-antigravity/antigravity-sdk-python
- Cộng đồng: https://github.com/fledgeling-co/agy-plugins · https://github.com/ZaunEkko/agy-plugins-cli · https://github.com/jdiazromeral/agy-plugin-cc
- Offline (trên máy): `~/.gemini/antigravity-cli/builtin/skills/agy-customizations/docs/*.md`
