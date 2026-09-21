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

## Cài nhanh

```bash
git clone https://github.com/<you>/agy-harness ~/agy-harness
sh ~/agy-harness/install.sh          # đăng ký vào ~/.gemini/config/plugins.json
agy                                  # gõ /plugins để kiểm tra, /skills để xem skill
```

Cập nhật: `git -C ~/agy-harness pull`. Gỡ: `sh ~/agy-harness/uninstall.sh`.
Tắt plugin không cần: `agy plugin disable hx-guard`.

Yêu cầu: `agy` ≥ 1.2.6, Node.js ≥ 18 (cho hooks), `python3` (cho script cài đặt).

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
sh scripts/validate-all.sh     # agy plugin validate cho từng plugin
sh scripts/test-hooks.sh       # node --test cho hooks (không cần agy)
sh scripts/e2e.sh              # kiểm tra agy phát hiện skill/hook (không tốn quota)
sh scripts/e2e.sh --full       # + 3 lượt model thật (tốn quota)
```

License: MIT
