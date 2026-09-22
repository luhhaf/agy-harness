# 09 · Dựng harness chuẩn cho một project (`/hx-core:setup`, `/hx-core:doctor`)

Mục tiêu: mọi project mà team dùng agy đều có **cùng một bộ `.agents/`** đúng chuẩn Antigravity,
commit chung, để skills/hooks/subagents của hx chạy chính xác và giống nhau trên mọi máy.

## Chạy

Trong agy (mở tại root project):
```
/hx-core:setup
/hx-core:doctor
```
Ngoài agy / trong CI (không tốn quota, không cần mở TUI):
```bash
HX=~/agy-harness/plugins/hx-core
node $HX/skills/setup/scripts/setup.js  [--root <dir>] [--dry-run] [--force] [--json]
node $HX/skills/doctor/scripts/doctor.js [--root <dir>] [--fix] [--json]      # exit 0 = OK, 1 = có lỗi
```

## `setup` làm gì

Phần **xác định** (script Node, lặp lại được, có test):

1. Dò stack. v0.2 nhận **Node**: package manager theo lockfile (`pnpm-lock.yaml` → pnpm, `yarn.lock` → yarn,
   `bun.lock[b]` → bun, mặc định npm), scripts `typecheck|type-check`, `lint`, `test`, `build`
   (bỏ `test` mặc định của npm), `tsconfig.json` → TypeScript, config eslint, `workspaces`.
   Stack khác → vẫn scaffold, lệnh để trống dạng placeholder.
2. Tạo **chỉ file còn thiếu** (không bao giờ ghi đè):

| File | Nội dung | Ai đọc |
|---|---|---|
| `AGENTS.md` (root) | Build & test (lệnh đã dò), Project layout, Conventions, Do not — < 4000 ký tự | agy always-on trong repo; Codex/Cursor cũng đọc |
| `.agents/harness.json` | `{harness:"hx", version, stack, checks:[...], generated:[...]}` | `/hx-workflows:verify` (`checks`), `doctor` |
| `.agents/rules/tests.md` | `trigger: glob` cho `**/*.test.*`, `**/*.spec.*`, `**/__tests__/**` | agy khi sửa file test |
| `.agents/rules/typescript.md` | chỉ khi có `tsconfig.json`; glob `**/*.ts(x)` | agy khi sửa TS |
| `.agents/skills/project-checks/SKILL.md` | các lệnh check theo thứ tự, cách đọc kết quả | `verify`, `/project-checks` |
| `.agents/hooks.json` + `.agents/hooks/post-edit-lint.js` | PostToolUse: `npx eslint <file vừa sửa>` nếu project có eslint; in ra stderr, **không sửa file**, stdout luôn `{}` | agy |
| `.agents/state/` | thư mục state; thêm `.agents/state/` vào `.gitignore` | hooks hx-guard, notepad/goal/handoff |

3. In report: `created`, `skipped`, `checks`, `fills` (danh sách placeholder `<!-- hx:fill: gợi ý -->`).

Phần **cần hiểu code** (model làm trong skill): đọc `package.json`, cấu trúc thư mục, 1–2 test có sẵn,
config lint → thay từng placeholder bằng 3–8 dòng sự thật của project (không lời khuyên chung).
Nếu repo đã có `AGENTS.md`, script bỏ qua; skill đề xuất thêm mục "Build and test" và hỏi trước khi sửa.

Cờ: `--dry-run` chỉ in kế hoạch. `--force` ghi lại các file **do setup sinh ra** (theo `harness.json.generated`),
không bao giờ đè `AGENTS.md` root do người dùng viết.

## `doctor` kiểm tra gì

| id | mức | điều kiện fail | fix |
|---|---|---|---|
| `agents-dir` | FAIL | thiếu `.agents/` | `/hx-core:setup` |
| `manifest` | FAIL | thiếu/không parse/không phải `harness:"hx"` + `checks[]` | setup lại |
| `root-rules` | FAIL / warn | thiếu `AGENTS.md`; > 12 000 ký tự (agy cắt) / > 4 000 (tốn context) | chuyển bớt sang rules/skill |
| `rules-frontmatter` | FAIL | `trigger` ∉ `always_on\|model_decision\|glob\|manual`; `glob` thiếu `globs`; > 12 000 ký tự | sửa frontmatter |
| `placeholders` | warn | còn `hx:fill` trong file đã sinh | điền (bước 4 của setup) |
| `skills` | FAIL / warn | `name` ≠ tên thư mục, sai regex `^[a-z0-9]+(-[a-z0-9]+)*$`, thiếu `description`, thiếu `SKILL.md` / trùng tên skill hx-* | sửa/đổi tên |
| `agents` | FAIL | `tools` có tên không có trong registry agy (subagent sẽ không khởi tạo được) | bỏ tool đó |
| `hooks` | FAIL | `hooks.json` sai JSON; script trong `command` không tồn tại (tương đối `.agents/`); `timeout` > 10 | sửa |
| `state-ignored` | warn | `.agents/state/` chưa gitignore | `--fix` |
| `state-dir` | warn | thiếu `.agents/state/` | `--fix` |
| `goal` | FAIL | `goal.json` sai schema (`active`/`done` boolean, `checks` array) | sửa/xoá |
| `checks-runnable` | warn | `checks` trong manifest trỏ tới script không còn trong `package.json` | cập nhật manifest |
| `hx-plugins` | warn | máy này chưa đăng ký hx-* hoặc đã disable | `node ~/agy-harness/install.js`, `agy plugin enable …` |

Registry (tên tool hợp lệ, trigger, giới hạn ký tự) nằm ở `plugins/hx-core/lib/registry.json` — cập nhật
ở đó khi agy đổi.

## Thêm stack mới (Java, Python, Go…)

Tạo `plugins/hx-core/lib/detect/<stack>.js` trả về `null` nếu không khớp, ngược lại
`{ kind, checks: [...], notes: [], ...}`; thêm vào `DETECTORS` trong `lib/detect/index.js`;
viết test trong `plugins/hx-core/__tests__/`. Template trong `lib/templates.js` chỉ dùng
`stack.checks`, `stack.typescript`, `stack.eslint`, `stack.workspaces`, `stack.packageManager`.

## Đã kiểm chứng (agy 1.2.6, macOS)

- `node scripts/test.js`: 65 test (27 hooks + 38 setup/doctor).
- `agy plugin validate` với thư mục `.agents/` sinh ra (thêm tạm `plugin.json`): skills 1 processed, hooks 1 processed, `[ok]`.
- Mở agy interactive trong project đã setup: log `loaded 5 named hooks from 2 hooks.json file(s)` — hook của
  project được nạp cùng 4 hook hx-guard. Print mode (`agy -p`) không nạp customization workspace (giới hạn đã biết).
- Chưa kiểm chứng bằng lượt model thật: model có tự tìm được đường dẫn `scripts/setup.js` từ link tương đối trong
  SKILL.md hay không. SKILL.md có hướng dẫn fallback qua `~/.gemini/config/plugins.json`. Test: `node scripts/e2e.js --full`
  rồi `/hx-core:setup` trong một project mẫu.
