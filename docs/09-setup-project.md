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

1. Dò stack (0.3: Node, Maven, Gradle, Go, Python; thứ tự ưu tiên đúng như vậy khi một repo có nhiều dấu hiệu).

   | Stack | Dấu hiệu | `checks` sinh ra (rẻ trước, đắt sau) | Linter theo file (hook) |
   |---|---|---|---|
   | Node | `package.json` | `<pm> run typecheck\|type-check`, `<pm> run lint`, `<pm> test`, `<pm> run build` — chỉ script có thật; pm theo lockfile (`pnpm-lock.yaml`, `yarn.lock`, `bun.lock[b]`, mặc định npm); bỏ `test` mặc định của npm | `npx eslint` nếu có config eslint |
   | Maven | `pom.xml` | `./mvnw -q spotless:check` (nếu pom có spotless), `./mvnw -q test`; không có wrapper → `mvn`; Windows → `mvnw.cmd` | không |
   | Gradle | `build.gradle[.kts]`, `settings.gradle[.kts]` | `./gradlew check` (`gradle` / `gradlew.bat`) | không |
   | Go | `go.mod` | `go build ./...`, `go vet ./...`, `golangci-lint run` (nếu có `.golangci.*`), `go test ./...` | `gofmt -l` (stdout khác rỗng = lỗi) |
   | Python | `pyproject.toml`, `setup.py`, `setup.cfg`, `requirements.txt`, `pytest.ini`, `tox.ini` | tiền tố `uv run ` (có `uv.lock`) / `poetry run ` (có `poetry.lock` hoặc `[tool.poetry]`) / không; `ruff check .` (có `ruff.toml` hoặc pyproject nhắc ruff), `mypy .` (có `mypy.ini` hoặc `[tool.mypy]`), `pytest -q` (có `pytest.ini`, `tests/`, `conftest.py` hoặc deps nhắc pytest) | `ruff check` nếu dò thấy ruff |

   Stack khác → vẫn scaffold, lệnh để trống dạng placeholder. Mỗi detector trả cùng một shape
   (`kind, packageManager, checks, testGlobs, lint, notes…`) nên template dùng chung cho mọi stack.
2. Tạo **chỉ file còn thiếu** (không bao giờ ghi đè):

| File | Nội dung | Ai đọc |
|---|---|---|
| `AGENTS.md` (root) | Build & test (lệnh đã dò), Project layout, Conventions, Do not — < 4000 ký tự | agy always-on trong repo; Codex/Cursor cũng đọc |
| `.agents/harness.json` | `{harness:"hx", version, stack, checks:[...], generated:[...]}` | `/hx-workflows:verify` (`checks`), `doctor` |
| `.agents/rules/tests.md` | `trigger: glob` với glob theo stack: Node `**/*.test.*`, `**/*.spec.*`, `**/__tests__/**`; Maven/Gradle `**/src/test/**`; Go `**/*_test.go`; Python `**/test_*.py`, `**/*_test.py`, `**/tests/**`, `**/conftest.py` | agy khi sửa file test |
| `.agents/rules/typescript.md` | chỉ khi có `tsconfig.json`; glob `**/*.ts(x)` | agy khi sửa TS |
| `.agents/skills/project-checks/SKILL.md` | các lệnh check theo thứ tự, cách đọc kết quả | `verify`, `/project-checks` |
| `.agents/hooks.json` + `.agents/hooks/post-edit-lint.js` | PostToolUse: chạy linter theo file trên file vừa sửa (eslint / `ruff check` / `gofmt -l`; Maven/Gradle không có → hook tắt). **Không sửa file**, stdout luôn `{}`. Kết quả **không** in ra stderr (agy không cho ai thấy stderr của hook) mà ghi vào `.agents/state/lint.json`; hook PreInvocation của `hx-guard` bơm các notice đó vào lượt kế tiếp rồi xoá. Cần bật `hx-guard` mới thấy | agy + hx-guard |
| `.agents/state/` | thư mục state; thêm `.agents/state/` vào `.gitignore` | hooks hx-guard, notepad/goal/handoff/lint |

Contract `lint.json` (hook project và hx-guard dùng chung):
```json
{ "notices": [ { "at": "2026-09-22T10:00:00Z", "source": "project-lint", "file": "src/a.ts", "text": "<output linter, ≤ 600 ký tự>" } ],
  "reminded": {} }
```
Tối đa 20 notice (bỏ cũ nhất); file thiếu hoặc hỏng → tạo lại; hook không bao giờ throw.

3. In report: `created`, `skipped`, `checks`, `fills` (danh sách placeholder `<!-- hx:fill: gợi ý -->`).

Phần **cần hiểu code** (model làm trong skill): đọc file build (`package.json`, `pom.xml`, `build.gradle`,
`go.mod`, `pyproject.toml`), cấu trúc thư mục, 1–2 test có sẵn, config lint → thay từng placeholder bằng
3–8 dòng sự thật của project (không lời khuyên chung). Với **repo có sẵn / lớn** (> ~30 file nguồn hoặc
cần hiểu kiến trúc), skill giao việc khảo sát cho subagent `explorer` (`invoke_subagent`: map thư mục
chính, entry point, cách tổ chức và chạy test, config lint, vùng không được sửa; ≤ 300 từ, mỗi ý kèm
đường dẫn) rồi điền từ câu trả lời đó — đây là đường onboarding cho project cũ.
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
| `checks-runnable` | warn | `checks` trong manifest trỏ tới script không còn trong `package.json`; dùng `./mvnw`/`./gradlew` mà không có wrapper ở root; `uv run`/`poetry run` mà thiếu `uv.lock` / `poetry.lock`+`pyproject.toml` | cập nhật manifest hoặc khôi phục wrapper/lockfile |
| `hx-plugins` | warn | máy này chưa đăng ký hx-* hoặc đã disable | `node ~/agy-harness/install.js`, `agy plugin enable …` |

Registry (tên tool hợp lệ, trigger, giới hạn ký tự) nằm ở `plugins/hx-core/lib/registry.json` — cập nhật
ở đó khi agy đổi.

## Thêm stack mới (Rust, .NET, Ruby…)

Tạo `plugins/hx-core/lib/detect/<stack>.js` trả về `null` nếu không khớp, ngược lại đúng shape chung:
```js
{ kind, packageManager,            // 'cargo' | './mvnw' | 'uv' …  (null nếu không có)
  typescript: false, eslint: false, workspaces: false, scripts: [],   // chỉ Node dùng
  checks: ['cargo fmt --check', 'cargo clippy', 'cargo test'],       // rẻ trước
  testGlobs: ['**/tests/**', '**/*_test.rs'],                        // cho .agents/rules/tests.md
  lint: { cmd: 'cargo clippy --', exts: ['.rs'], nonEmptyIsIssue: false } | null,  // hook theo file
  notes: [] }
```
Thêm vào `DETECTORS` trong `lib/detect/index.js` (thứ tự = ưu tiên); viết test trong
`plugins/hx-core/__tests__/detect-stacks.test.js`. Template trong `lib/templates.js` chỉ đọc các trường trên.

## Đã kiểm chứng (agy 1.2.7, macOS)

- `node scripts/test.js`: toàn bộ test hx-core (detector 5 stack, setup, doctor, hook sinh ra ghi `lint.json`) xanh.
- `agy plugin validate` với thư mục `.agents/` sinh ra (thêm tạm `plugin.json`): skills 1 processed, hooks 1 processed, `[ok]`.
- Mở agy interactive trong project đã setup: log `loaded 5 named hooks from 2 hooks.json file(s)` — hook của
  project được nạp cùng 4 hook hx-guard. Print mode (`agy -p`) không nạp customization workspace (giới hạn đã biết).
- Chưa kiểm chứng bằng lượt model thật: model có tự tìm được đường dẫn `scripts/setup.js` từ link tương đối trong
  SKILL.md hay không. SKILL.md có hướng dẫn fallback qua `~/.gemini/config/plugins.json`. Test: `node scripts/e2e.js --full`
  rồi `/hx-core:setup` trong một project mẫu.
