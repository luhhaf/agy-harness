# Đánh giá: 1 repo chứa nhiều plugin nhỏ, dùng trên nhiều máy

> Ngày 2026-09-21, `agy` 1.2.6. Mọi kết luận dưới đây đã **kiểm chứng thực nghiệm** trên máy
> (tạo monorepo mẫu 2 plugin `hx-core`, `hx-guard`, cài/gỡ, khai báo `plugins.json`, gọi `agy -p "/skills"`).

## Kết luận: Hợp lý, và agy hỗ trợ native

**Nên làm.** Monorepo nhiều plugin nhỏ là mô hình được `agy` hỗ trợ trực tiếp, không cần tool ngoài:

1. `agy plugin install <repo-root>` → agy in `Found bulk plugins directory: <root>/plugins` và **cài toàn bộ plugin con** trong `plugins/` (mỗi thư mục con có `plugin.json`). Không cần `plugin.json` ở root repo.
2. `agy plugin install <repo-root>/plugins/<one>` → cài đúng 1 plugin.
3. `~/.gemini/config/plugins.json` với `{"entries":[{"path":"~/agy-harness/plugins"}]}` → agy nạp trực tiếp từ bản clone, **không copy**; `/skills` liệt kê `hx-core:hello`, `hx-guard:guard`, `/plugins` hiện đủ 2 plugin với version và đường dẫn nguồn.
4. Bật/tắt từng plugin theo máy: `agy plugin enable|disable <name>` ghi vào `~/.gemini/config/config.json` (không ghi vào repo) → mỗi máy giữ lựa chọn riêng, survive khi update.

## Hai cách triển khai lên nhiều máy

| | **A. Clone + `plugins.json`** (khuyên dùng cho máy của bạn) | **B. `agy plugin install <git-url>`** (cho người khác / máy ít chỉnh sửa) |
|---|---|---|
| Cài lần đầu | `git clone … ~/agy-harness` + 1 file `~/.gemini/config/plugins.json` | 1 lệnh; agy tải về `~/.gemini/config/plugins/<name>/` cho từng plugin (đã có resolve submodule) |
| Update | `git pull` — có hiệu lực ngay (skills reload bằng `/skills reload`) | Chạy lại `install`; agy **thay thế chính xác** thư mục (file xoá ở source cũng bị xoá) |
| Sửa tại chỗ & commit ngược | Có – bản clone chính là working copy | Không – thư mục managed, sửa sẽ mất khi reinstall |
| Chọn plugin nào nạp | `include_only` / `exclude` trong `plugins.json` + enable/disable | enable/disable |
| Pin version | `git checkout <tag>` | chưa thấy cơ chế pin (không có `installed_version.json` cho local/git install; chỉ marketplace mới có) |
| Rủi ro | Quên `git pull` → lệch version giữa máy; đường dẫn `~/` phải giống nhau (agy hỗ trợ `~/` nên OK cả macOS/Linux) | `agy plugin list` chỉ ghi nhận plugin **cuối cùng** khi bulk-install (quan sát: chỉ `hx-core` xuất hiện trong "imports" dù cả 2 đã lên đĩa) — có vẻ là bug 1.2.6, nhưng `/plugins` trong TUI vẫn thấy đủ |

Cả hai đều dùng chung `config.json` để bật/tắt nên có thể trộn: máy dev dùng A, máy CI/đồng nghiệp dùng B.

## Ràng buộc thiết kế rút ra từ thực nghiệm

- **Tên plugin = tên thư mục** và phải khớp regex `^[a-z0-9]+(-[a-z0-9]+)*$`; enable/disable key theo tên thư mục → **đừng đổi tên thư mục** sau khi phát hành.
- Skill trong plugin thành `/<plugin>:<skill>`; nếu 2 plugin có skill trùng tên short-name, plugin sau shadow plugin trước (changelog 1.2.7 mới fix) → đặt tên skill unique toàn repo hoặc chấp nhận gọi bằng full name.
- Plugin **không phụ thuộc nhau** ở cấp manifest (không có `dependencies`). Nếu `harness-workflows` cần agent trong `harness-agents`, phải ghi rõ trong README hoặc gộp chúng lại. Agent `.md` có thể tham chiếu skill/agent bằng **đường dẫn tương đối theo thư mục agent** → chỉ tham chiếu chéo được khi cùng plugin (hoặc cả repo được clone nguyên vẹn theo cách A).
- Hook chạy với CWD = thư mục chứa `hooks.json` → script dùng chung nên đặt **trong từng plugin** (hoặc copy khi build), không trỏ ra `../shared/` nếu muốn cách B hoạt động (cách B chỉ copy từng thư mục plugin, không copy `shared/`). Changelog có nói bulk import "copy entire plugin directory, preventing stripping non-skill directories (like `shared/`)" — tức `shared/` **bên trong** plugin thì an toàn.
- MCP trong plugin resolve path theo thư mục plugin, `${extensionPath}` có sẵn → bundle server trong plugin được.
- Marketplace (`plugin@marketplace`) chưa mở cho bên thứ 3 → không phụ thuộc vào nó; giữ `marketplace.json` trong repo để sẵn sàng.

## Đề xuất cấu trúc repo

```text
agy-harness/
├── plugins/                      # bulk plugins dir – agy nhận diện tự động
│   ├── hx-core/                  # rules always-on + skill "using-harness" + notepad/state
│   ├── hx-workflows/             # brainstorm, plan, tdd, debug, review, verify, ship
│   ├── hx-agents/                # explorer, planner, executor, reviewer, verifier
│   ├── hx-guard/                 # hooks.json + scripts/ (safety gate, lint, stop-gate)
│   ├── hx-stack-java-spring/     # rules/skills theo stack – bật theo máy/dự án
│   └── hx-stack-react/
├── .agents/plugins.json          # {"entries":[{"path":"plugins"}]} → dogfood ngay trong repo này
├── install.sh                    # clone/pull + ghi ~/.gemini/config/plugins.json (cách A) hoặc agy plugin install (cách B)
├── scripts/validate-all.sh       # for p in plugins/*: agy plugin validate $p
├── scripts/e2e.sh                # agy -p "/hx-workflows:plan …" --output-format json
├── marketplace.json              # dự phòng
└── docs/
```

Quy ước: prefix ngắn thống nhất (`hx-`), mỗi plugin có `README.md` + `version` trong `plugin.json`, CHANGELOG chung; tag git theo release (`v0.1.0`) để máy khác `git checkout` được.

## `install.sh` tối thiểu (cách A)

```bash
#!/usr/bin/env sh
set -e
DIR="${AGY_HARNESS_DIR:-$HOME/agy-harness}"
[ -d "$DIR/.git" ] && git -C "$DIR" pull --ff-only || git clone https://github.com/<you>/agy-harness "$DIR"
mkdir -p ~/.gemini/config
CFG=~/.gemini/config/plugins.json
if [ -f "$CFG" ]; then
  echo "⚠ $CFG đã tồn tại – thêm thủ công: {\"path\":\"$DIR/plugins\"} vào entries"
else
  printf '{ "entries": [ { "path": "%s/plugins" } ] }\n' "$DIR" > "$CFG"
fi
for p in "$DIR"/plugins/*/; do agy plugin validate "$p"; done
echo "Done. Mở agy và gõ /plugins để kiểm tra; tắt plugin không cần: agy plugin disable <name>"
```

## Việc còn mở
- Chưa test `agy plugin install <git-url>` với repo thật (cần push repo public/private có auth). Changelog xác nhận tính năng và submodule; nên test ngay khi có remote.
- Xác nhận lại bug `agy plugin list` chỉ ghi 1 plugin khi bulk-install trên bản 1.2.7+.
