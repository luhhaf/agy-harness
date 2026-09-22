# agy-harness

Bộ plugin biến **Antigravity CLI (`agy`)** thành một harness phát triển phần mềm có kỷ luật:
brainstorm → plan → execute (TDD) → review → verify (có bằng chứng) → commit/ship, với subagent
chuyên biệt và hook an toàn.
Dùng được trên nhiều máy: clone repo, chạy `install.sh`, xong.

| Plugin | Vai trò | Bật/tắt riêng |
|---|---|---|
| `hx-core` | `setup` + `doctor` dựng và kiểm tra harness chuẩn agy trong từng project (Node, Maven, Gradle, Go, Python); rules always-on; skill `using-harness`, `notepad`, `handoff` | ✔ |
| `hx-workflows` | 9 skill quy trình: `brainstorm`, `plan`, `execute`, `tdd`, `debug`, `review`, `verify` (script ghi bằng chứng), `commit`, `ship` | ✔ |
| `hx-agents` | 5 subagent: `explorer`, `planner`, `executor`, `reviewer`, `verifier` | ✔ |
| `hx-guard` | Hooks: chặn lệnh nguy hiểm, bảo vệ bằng chứng verify, bơm notepad/goal/lint mỗi lượt, giữ agent làm tới khi goal được verify bằng check thật | ✔ |

## Cài nhanh (macOS · Linux · Windows)

```bash
git clone https://github.com/luhhaf/agy-harness ~/agy-harness
node ~/agy-harness/install.js        # đăng ký vào ~/.gemini/config/plugins.json (mọi OS)
agy                                  # gõ /plugins để kiểm tra, /skills để xem skill
```
Wrapper tuỳ OS (tự clone nếu chưa có): `sh install.sh` (macOS/Linux) · `powershell -ExecutionPolicy Bypass -File install.ps1` (Windows).

Cập nhật: `git -C ~/agy-harness pull`. Gỡ: `node ~/agy-harness/install.js --uninstall`.
Tắt plugin không cần: `agy plugin disable hx-guard`.

Yêu cầu: `agy` ≥ 1.2.6, Node.js ≥ 18, git. Không cần Python hay bash trên Windows.

## Dùng hằng ngày

Lần đầu mở agy trong một project (một lần cho mỗi repo):
```
/hx-core:setup            → AGENTS.md + .agents/{harness.json, rules, skills/project-checks, hooks} ; commit chung
/hx-core:doctor           → 14 check, exit 1 nếu sai; chạy được trong CI: node <hx-core>/skills/doctor/scripts/doctor.js
```

```
/hx-workflows:brainstorm  Tôi muốn thêm đăng nhập bằng Google
/hx-workflows:plan
/hx-workflows:execute     → chạy hết plan (hoặc /hx-workflows:tdd T1 từng task)
/hx-workflows:review
/hx-workflows:verify      → script chạy check thật, ghi .agents/state/verify.json, đóng goal
/hx-workflows:commit      (checkpoint) · /hx-workflows:ship (PR)
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
- [Dựng harness cho project: setup & doctor](docs/09-setup-project.md)
- Nghiên cứu nền: [docs/research/](docs/research/)

## Kiểm thử

```bash
node scripts/validate-all.js   # agy plugin validate cho từng plugin
node scripts/test.js           # node --test cho hooks, verify script, setup/doctor (không cần agy); test-hooks.js = chỉ hx-guard
node scripts/e2e.js            # kiểm tra agy phát hiện skill/hook (không tốn quota)
node scripts/e2e.js --full     # + 3 lượt model thật (tốn quota)
```
Đã chạy trên macOS (đầy đủ) và Linux (Docker: hook tests + installer). Windows: cùng code Node, xem [docs/02](docs/02-cai-dat-nhieu-may.md#windows).

License: MIT
