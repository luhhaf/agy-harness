# 08 · Troubleshooting

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| `/plugins` không thấy `hx-*` | `~/.gemini/config/plugins.json` chưa có entry, hoặc đường dẫn sai | Xem `~/.gemini/config/plugins.json` (Windows: `%USERPROFILE%\.gemini\config\plugins.json`); chạy lại `node install.js`; đường dẫn phải trỏ tới thư mục **`plugins/`** của repo |
| Thấy plugin nhưng `Disabled` | Đã `agy plugin disable` trước đó | `agy plugin enable hx-<name>` |
| `/hx-workflows:plan` báo "unknown command" | Skill chưa được nạp (phiên mở trước khi cài) | `/skills reload` hoặc mở lại agy |
| `agy -p "/skills"` không liệt kê skill `.agents/skills` của dự án | Print mode chỉ liệt kê global/built-in | Bình thường; skill workspace vẫn dùng được trong lượt thật (`agy -p "/ten-skill …"`) |
| Đặt `.agents/plugins.json` trong repo dự án nhưng plugin không nạp (print mode) | Giới hạn 1.2.6 quan sát được | Đăng ký global bằng `node install.js` |
| Subagent lỗi `unknown component: tool "X" not found in registry` | Tên tool sai trong `agents/*.md` | Bỏ tool đó; danh sách hợp lệ ở [04-agents.md](04-agents.md) |
| Subagent treo | Tên tool sai kiểu khác (theo docs agy) | Kill trong `/agents`; sửa `tools` |
| Hook không chạy | `node` không có trong PATH của agy; hoặc plugin `hx-guard` disabled | `agy -p "/hooks" --output-format json` phải thấy 4 hook; `which node` / `where node`; nếu dùng nvm/fnm, đảm bảo PATH khi mở agy (Windows: mở terminal mới sau khi cài Node) |
| Hook `stop-gate` không ép tiếp tục trong `agy -p` | `workspacePaths` rỗng và không tra được workspace | Đảm bảo `~/.gemini/antigravity-cli/cache/last_conversations.json` có dòng cho workspace (agy tự ghi khi tạo hội thoại); xem [05-hooks.md](05-hooks.md) |
| Agent lặp mãi "Goal is still active" | `goal.json` không được đóng | `/hx-workflows:verify`; hoặc sửa `"active": false`; tối đa `maxContinues` (5) rồi tự dừng |
| Lệnh bị chặn oan (`[hx-guard:…]`) | Pattern quá rộng | Sửa `plugins/hx-guard/hooks/patterns.json`, thêm test, `node scripts/test-hooks.js` |
| Trong print mode lệnh `ask` bị từ chối | Headless không hỏi được | Thêm `permissions.allow` trong `~/.gemini/antigravity-cli/settings.json` hoặc `--dangerously-skip-permissions` (deny vẫn chặn) |
| Rules quá dài bị cắt | Budget rules 20k token, mỗi file ≤ 12k ký tự | Rút gọn `rules/AGENTS.md`; chuyển chi tiết vào skill `references/` |
| Sau `git pull` không thấy thay đổi | Phiên đang mở cache customization | `/skills reload` hoặc mở lại agy |
| `agy plugin list` chỉ thấy 1 plugin sau bulk install | Quan sát trên 1.2.6: "imports" chỉ ghi plugin cuối | Kiểm tra `ls ~/.gemini/config/plugins/` hoặc `/plugins` trong TUI |
| Windows: `install.sh` không chạy | Script POSIX, chỉ cho macOS/Linux | Dùng `node install.js` hoặc `install.ps1` |
| Windows: PowerShell chặn `install.ps1` | ExecutionPolicy | `powershell -ExecutionPolicy Bypass -File install.ps1`, hoặc chạy thẳng `node install.js` |

## Lệnh chẩn đoán nhanh

```bash
agy --version
cat ~/.gemini/config/plugins.json ~/.gemini/config/config.json     # Windows: type %USERPROFILE%\.gemini\config\plugins.json
node ~/agy-harness/scripts/validate-all.js
node ~/agy-harness/scripts/test-hooks.js
node ~/agy-harness/scripts/e2e.js            # discovery, không tốn quota
node ~/agy-harness/scripts/e2e.js --full     # 3 lượt model thật
grep -iE 'hook|plugin' ~/.gemini/antigravity-cli/cli.log | tail -20   # Windows: findstr /i "hook plugin" %USERPROFILE%\.gemini\antigravity-cli\cli.log
```

## Xem hook nhận gì (debug payload)

Tạm thêm vào `plugins/hx-guard/hooks.json` rồi bỏ đi sau:
```json
"hx-debug": { "PreToolUse": [ { "matcher": "*", "hooks": [ { "command": "node -e \"let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{require('fs').appendFileSync(require('os').tmpdir()+'/hx.log',s+'\\n');console.log('{\\\"decision\\\":\\\"allow\\\"}')})\"" } ] } ] }
```
