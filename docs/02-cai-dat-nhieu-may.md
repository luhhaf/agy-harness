# 02 · Cài trên nhiều máy, cập nhật, bật/tắt

## Hai cách cài

### Cách A — clone + đăng ký đường dẫn (khuyên dùng cho máy của bạn)

```bash
git clone https://github.com/<you>/agy-harness ~/agy-harness
sh ~/agy-harness/install.sh
```
- agy đọc plugin **trực tiếp từ bản clone** (không copy) qua `~/.gemini/config/plugins.json`.
- Cập nhật: `git -C ~/agy-harness pull` → có hiệu lực ngay ở phiên mới; phiên đang mở gõ `/skills reload`.
- Sửa skill tại chỗ rồi commit/push từ chính thư mục đó.
- Pin phiên bản: `git -C ~/agy-harness checkout v0.1.0`.

Đặt thư mục khác: `AGY_HARNESS_DIR=/opt/agy-harness sh install.sh` (khi script phải tự clone).

### Cách B — `agy plugin install` (máy ít chỉnh sửa, đồng nghiệp)

```bash
agy plugin install ~/agy-harness            # bulk: cài tất cả plugin trong plugins/
agy plugin install ~/agy-harness/plugins/hx-core   # chỉ 1 plugin
agy plugin install https://github.com/<you>/agy-harness   # từ git (theo changelog agy; chưa test trong repo này)
```
hoặc `sh install.sh --copy`.
- Copy vào `~/.gemini/config/plugins/<name>/`. Cập nhật = chạy lại `install` (thay thế nguyên thư mục).
- Lưu ý quan sát trên 1.2.6: sau bulk install, `agy plugin list` chỉ ghi nhận plugin cuối cùng
  trong "imports", nhưng cả 4 đều có trên đĩa và `/plugins` trong TUI hiện đủ.

Cả hai cách dùng chung `~/.gemini/config/config.json` để bật/tắt, có thể trộn: laptop dùng A, máy CI dùng B.

## Bật/tắt theo máy

```bash
agy plugin disable hx-guard     # ghi {"plugins":{"hx-guard":{"enabled":false}}} vào config.json
agy plugin enable  hx-guard
```
Không có entry = bật (trừ plugin ship `"disabled": true`). Trạng thái không nằm trong repo nên
`git pull` không làm mất lựa chọn.

Chỉ nạp một phần plugin từ repo (ví dụ máy chỉ cần rules + guard):
```json
{ "entries": [ { "path": "~/agy-harness/plugins", "include_only": ["hx-core", "hx-guard"] } ] }
```
hoặc loại trừ: `"exclude": ["hx-agents"]`.

## Đồng bộ trạng thái dự án giữa các máy

`.agents/state/` nằm trong repo dự án, mặc định bị `.gitignore` bởi harness (file `.gitignore` của
repo này chỉ áp dụng cho chính nó). Trong dự án của bạn:
- Muốn đồng bộ notepad/handoff qua git: **không** ignore `.agents/state/notepad.md`, `handoff.md`.
- Nên ignore `goal.json` (trạng thái tạm, có bộ đếm `continues`).

Quy trình đổi máy: `/hx-core:handoff` → commit/push → máy kia pull → mở agy, đọc
`.agents/state/handoff.md` → chạy lệnh "How to verify" trước khi sửa.

## Windows

`install.sh` là POSIX sh; trên Windows dùng Git Bash/WSL hoặc tự ghi
`%USERPROFILE%\.gemini\config\plugins.json`. Hooks là Node nên chạy được; đường dẫn `~/` trong
`plugins.json` được agy resolve trên mọi hệ điều hành.

## Gỡ

```bash
sh ~/agy-harness/uninstall.sh   # bỏ entry trong plugins.json + agy plugin uninstall hx-* nếu đã copy
rm -rf ~/agy-harness            # nếu muốn
```

## Checklist máy mới

1. Cài `agy`, đăng nhập (`agy`).
2. Cài Node ≥ 18.
3. `git clone … ~/agy-harness && sh ~/agy-harness/install.sh`.
4. `sh ~/agy-harness/scripts/e2e.sh` → `E2E OK`.
5. (Tuỳ chọn) `agy plugin disable <plugin không cần>`.
