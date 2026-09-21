# 06 · Viết plugin / skill / agent / hook mới

## Thêm một plugin theo stack (ví dụ Java/Spring)

```bash
cp -R templates/hx-stack-template plugins/hx-stack-java-spring
```
Sửa `plugins/hx-stack-java-spring/plugin.json`:
```json
{ "$schema": "https://antigravity.google/schemas/v1/plugin.json",
  "name": "hx-stack-java-spring", "version": "0.1.0",
  "description": "Rules and skills for Java 21 + Spring Boot 3 projects." }
```
Quy tắc tên: **tên thư mục = `name`**, khớp `^[a-z0-9]+(-[a-z0-9]+)*$`, và không đổi sau khi
phát hành (đó là key bật/tắt trong `config.json` của mọi máy).

`rules/AGENTS.md` (always-on khi plugin bật, giữ < 4000 ký tự, chỉ ghi điều model chưa biết):
```markdown
# Java / Spring rules
## Build & test
- Test all: `./mvnw -q test` · one class: `./mvnw -q test -Dtest=OrderServiceTest`
- Format: `./mvnw spotless:apply` before verify
## Conventions
- Constructor injection only; no field @Autowired.
- Controllers thin; business logic in @Service; no logic in entities.
- Use `@DataJpaTest` for repositories, `@WebMvcTest` for controllers, Testcontainers for integration.
## Do not
- Do not change `application-prod.yml`.
- Do not add Lombok to modules that do not already use it.
```

Rule theo glob (chỉ áp dụng khi sửa file khớp) đặt trong `rules/<name>.md` với frontmatter:
```markdown
---
trigger: glob
globs: ["**/*Controller.java"]
description: Rules for REST controllers
---
- Validate input with `@Valid`; return `ResponseEntity`; map errors via `@ControllerAdvice`.
```
(`trigger` nhận `always_on | model_decision | glob | manual`.)

Sau đó: `agy plugin validate plugins/hx-stack-java-spring` → `[ok]`. Vì `plugins.json` trỏ vào
thư mục `plugins/`, plugin mới tự xuất hiện ở máy đã cài (sau `git pull`).

## Viết skill

```
plugins/<plugin>/skills/<skill-name>/
├── SKILL.md          bắt buộc
├── scripts/          script hỗ trợ (link tương đối từ SKILL.md)
└── references/       tài liệu dài; SKILL.md chỉ trỏ tới, model đọc khi cần
```
```markdown
---
name: add-endpoint
description: >-
  Add a REST endpoint to a Spring Boot service with controller, service, DTO and
  tests. Use when the user asks to "add an API", "expose endpoint", "new route".
metadata:
  icon: "🔌"
---
# Add endpoint
## Steps
1. ...
## Done when
- `./mvnw -q test` passes and the new controller test exists.
```
Checklist:
- `description` nói **what + when**, ngôi thứ ba, có từ khoá người dùng hay gõ.
- Bước cuối luôn là kiểm chứng (hoặc chỉ sang `/hx-workflows:verify`).
- Tên tool đúng agy (xem bảng trong `/hx-core:using-harness`).
- Tên skill unique trong toàn repo (short-name trùng giữa plugin có thể shadow nhau ở 1.2.6).
- Test: `agy -p "/<plugin>:<skill> <câu hỏi mà chỉ nội dung skill mới trả lời được>"`.

## Viết subagent

Copy `plugins/hx-agents/agents/explorer.md`, đổi `name`, `description`, `tools`, `model`.
Chỉ dùng tool đã kiểm chứng (danh sách ở [04-agents.md](04-agents.md)). Test bằng một lượt thật:
```bash
agy -p "Use invoke_subagent with TypeName '<name>' and task: '<việc nhỏ>'. Report verbatim." --output-format json
```
Nếu thấy `unknown component: tool "<x>" not found in registry` → bỏ tool đó.

## Viết hook

1. Thêm script vào `plugins/hx-guard/hooks/<name>.js`, dùng `lib.js`:
   ```js
   const { run, workspaceRoot, log } = require('./lib');
   run((input) => { /* ... */ return {}; }, {});   // tham số 2 = output khi lỗi
   ```
2. Khai báo trong `hooks.json` (PreToolUse/PostToolUse cần `matcher` + `hooks`; các event khác
   là danh sách phẳng).
3. Viết test trong `hooks/__tests__/<name>.test.js` (dùng `helpers.runHook` để chạy qua stdin/stdout
   đúng như agy). `node scripts/test-hooks.js`.
4. Kiểm tra agy nạp: `agy -p "/hooks" --output-format json`.

Nguyên tắc: không bao giờ crash (luôn exit 0, stdout là JSON hợp lệ), không phụ thuộc CWD,
timeout ≤ 10 s, không sửa file trong PostToolUse trừ khi người dùng đã đồng ý rõ ràng.

## MCP server trong plugin (chưa dùng ở v0.1)

`plugins/<plugin>/mcp_config.json`:
```json
{ "mcpServers": { "my-tool": { "command": "node", "args": ["${extensionPath}/mcp/server.js"] } } }
```
Đường dẫn tương đối resolve theo thư mục plugin; tool được namespace `<plugin>_<server>` nếu trùng.

## Quy trình phát hành

1. `node scripts/validate-all.js && node scripts/test-hooks.js && node scripts/e2e.js`.
2. Tăng `version` trong `plugin.json` của plugin thay đổi; ghi `CHANGELOG.md`.
3. `git tag v0.x.y && git push --tags`.
4. Máy khác: `git -C ~/agy-harness pull` (hoặc `checkout v0.x.y`).
