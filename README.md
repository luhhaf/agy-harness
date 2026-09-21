# agy-harness

Bộ plugin biến **Antigravity CLI (`agy`)** thành một harness phát triển phần mềm có kỷ luật:
brainstorm → plan → TDD → review → verify → ship, với subagent chuyên biệt và hook an toàn.
Dùng được trên nhiều máy: clone repo, chạy `install.sh`, xong.

| Plugin | Vai trò | Bật/tắt riêng |
|---|---|---|
| `hx-core` | Rules always-on, bảng map hành động→tool của agy, skill `notepad`, `handoff` | ✔ |
| `hx-workflows` | 7 skill quy trình: `brainstorm`, `plan`, `tdd`, `debug`, `review`, `verify`, `ship` | ✔ |
| `hx-agents` | 5 subagent: `explorer`, `planner`, `executor`, `reviewer`, `verifier` | ✔ |
| `hx-guard` | Hooks: chặn lệnh nguy hiểm, nhắc formatter, bơm notepad/goal mỗi lượt, giữ agent làm tới khi goal được verify | ✔ |

## Cài nhanh (macOS · Linux · Windows)

```bash
git clone https://github.com/<you>/agy-harness ~/agy-harness
node ~/agy-harness/install.js        # đăng ký vào ~/.gemini/config/plugins.json (mọi OS)
agy                                  # gõ /plugins để kiểm tra, /skills để xem skill
```
Wrapper tuỳ OS (tự clone nếu chưa có): `sh install.sh` (macOS/Linux) · `powershell -ExecutionPolicy Bypass -File install.ps1` (Windows).

Cập nhật: `git -C ~/agy-harness pull`. Gỡ: `node ~/agy-harness/install.js --uninstall`.
Tắt plugin không cần: `agy plugin disable hx-guard`.

Yêu cầu: `agy` ≥ 1.2.6, Node.js ≥ 18, git. Không cần Python hay bash trên Windows.

## Dùng hằng ngày

```
/hx-workflows:brainstorm  Tôi muốn thêm đăng nhập bằng Google
/hx-workflows:plan
/hx-workflows:tdd         T1
/hx-workflows:review
/hx-workflows:verify
/hx-workflows:ship
/hx-core:handoff          (cuối phiên / đổi máy)
```

## Tài liệu

- [Quick start](docs/00-quick-start.md)
- [Kiến trúc & cách agy nạp customization](docs/01-kien-truc.md)
- [Cài trên nhiều máy, cập nhật, bật/tắt](docs/02-cai-dat-nhieu-may.md)
- [Skills](docs/03-skills.md) · [Subagents](docs/04-agents.md) · [Hooks](docs/05-hooks.md)
- [Viết plugin/skill/agent mới](docs/06-viet-plugin-moi.md)
- [Ví dụ phiên làm việc Java/Spring](docs/07-vi-du-java-spring.md)
- [Troubleshooting](docs/08-troubleshooting.md)
- Nghiên cứu nền: [docs/research/](docs/research/)

## Kiểm thử

```bash
node scripts/validate-all.js   # agy plugin validate cho từng plugin
node scripts/test-hooks.js     # node --test cho hooks (không cần agy)
node scripts/e2e.js            # kiểm tra agy phát hiện skill/hook (không tốn quota)
node scripts/e2e.js --full     # + 3 lượt model thật (tốn quota)
```
Đã chạy trên macOS (đầy đủ) và Linux (Docker: hook tests + installer). Windows: cùng code Node, xem [docs/02](docs/02-cai-dat-nhieu-may.md#windows).

License: MIT
