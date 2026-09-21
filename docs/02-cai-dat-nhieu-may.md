# 02 · Cài trên nhiều máy, cập nhật, bật/tắt

## Hai cách cài

### Cách A — clone + đăng ký đường dẫn (khuyên dùng cho máy của bạn)

```bash
git clone https://github.com/luhhaf/agy-harness ~/agy-harness
node ~/agy-harness/install.js          # mọi OS
# hoặc wrapper tự clone: sh install.sh (macOS/Linux) · install.ps1 (Windows)
```
- agy đọc plugin **trực tiếp từ bản clone** (không copy) qua `~/.gemini/config/plugins.json`.
- Cập nhật: `git -C ~/agy-harness pull` → có hiệu lực ngay ở phiên mới; phiên đang mở gõ `/skills reload`.
- Sửa skill tại chỗ rồi commit/push từ chính thư mục đó.
- Pin phiên bản: `git -C ~/agy-harness checkout v0.1.0`.

Đặt thư mục khác: `node install.js --dir /opt/agy-harness`, hoặc `AGY_HARNESS_DIR=... sh install.sh` khi wrapper phải tự clone.

### Cách B — `agy plugin install` (máy ít chỉnh sửa, đồng nghiệp)

```bash
agy plugin install ~/agy-harness            # bulk: cài tất cả plugin trong plugins/
agy plugin install ~/agy-harness/plugins/hx-core   # chỉ 1 plugin
agy plugin install https://github.com/luhhaf/agy-harness   # từ git (theo changelog agy; chưa test trong repo này)
```
hoặc `node install.js --copy`.
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

Cài Antigravity CLI cho Windows, Node.js ≥ 18, Git. Rồi trong PowerShell:
```powershell
git clone https://github.com/luhhaf/agy-harness $HOME\agy-harness
node $HOME\agy-harness\install.js
# hoặc: powershell -ExecutionPolicy Bypass -File $HOME\agy-harness\install.ps1
```
- Config nằm ở `%USERPROFILE%\.gemini\config\plugins.json`; `install.js` ghi đường dẫn tuyệt đối
  (`C:\\Users\\you\\agy-harness\\plugins`).
- Hooks: agy chạy `cmd /c node ./hooks/<x>.js` trong thư mục plugin — Node xử lý `./` bình thường.
  Cần `node` có trong PATH của tiến trình agy (mở terminal mới sau khi cài Node).
- Guard có sẵn pattern cho `cmd`/PowerShell: `rmdir /s` gốc ổ đĩa, `format C:`, `diskpart`,
  `Remove-Item -Recurse` gốc/home (deny); `del /s`, `Remove-Item -Recurse`, `irm … | iex`,
  `reg delete`… (ask).
- Skills nhắc dùng `mvnw.cmd` / `gradlew.bat`. Rule `hx-core` yêu cầu agent kiểm tra OS trước khi
  viết lệnh shell.
- Trạng thái `.agents/state/` và `last_conversations.json` dùng đường dẫn Windows; hooks so sánh
  bằng `path` của Node nên không cần chỉnh.
- Chưa có máy Windows để chạy e2e trong repo này; cùng code Node đã chạy trên macOS và Linux.
  Nếu gặp lỗi, chạy `node scripts\test-hooks.js` và `node scripts\e2e.js` rồi gửi output.

## Linux

Giống macOS: `node install.js`. Đã kiểm tra hook tests + installer trong container `node:18`/`node:22`
(Debian). Nếu agy cài qua script chính thức, `agy` nằm ở `~/.local/bin` — đảm bảo có trong PATH.

## Gỡ

```bash
node ~/agy-harness/install.js --uninstall   # bỏ entry trong plugins.json + agy plugin uninstall hx-* nếu đã copy
rm -rf ~/agy-harness                        # nếu muốn
```

## Checklist máy mới

1. Cài `agy`, đăng nhập (`agy`).
2. Cài Node ≥ 18.
3. `git clone … ~/agy-harness && node ~/agy-harness/install.js`.
4. `node ~/agy-harness/scripts/e2e.js` → `E2E OK`.
5. (Tuỳ chọn) `agy plugin disable <plugin không cần>`.
