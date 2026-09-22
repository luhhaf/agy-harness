# 00 · Quick start

## 1. Yêu cầu

| Thành phần | Tối thiểu | Kiểm tra |
|---|---|---|
| Antigravity CLI | 1.2.6 | `agy --version` |
| Node.js (hooks của `hx-guard`) | 18 | `node --version` |
| git | bất kỳ | `git --version` |

Hỗ trợ macOS, Linux, Windows. Mọi script là Node.js — không cần Python, bash hay WSL.

## 2. Cài đặt (máy đầu tiên hoặc máy mới đều giống nhau)

```bash
git clone https://github.com/luhhaf/agy-harness ~/agy-harness
node ~/agy-harness/install.js
```
(Windows PowerShell: `git clone https://github.com/luhhaf/agy-harness $HOME\agy-harness; node $HOME\agy-harness\install.js`)

`install.js` làm 3 việc:
1. Tìm thư mục `plugins/` của repo.
2. Ghi (hoặc bổ sung) `~/.gemini/config/plugins.json`:
   ```json
   { "entries": [ { "path": "/Users/you/agy-harness/plugins" } ] }
   ```
3. Chạy `agy plugin validate` cho từng plugin.

Kiểm tra trong agy:

```
agy
/plugins        → thấy hx-core, hx-workflows, hx-agents, hx-guard (Enabled)
/skills         → thấy hx-core:*, hx-workflows:*
/hooks          → thấy 4 hook hx-*
```

Hoặc không cần mở TUI (không tốn quota):

```bash
node ~/agy-harness/scripts/e2e.js
```

## 3. Phiên làm việc đầu tiên

Mở agy trong repo dự án của bạn (`cd ~/work/my-app && agy`). Lần đầu với repo này:

```
/hx-core:setup
```
Script dò stack (Node: npm/pnpm/yarn/bun, TypeScript, eslint), tạo `AGENTS.md` + `.agents/` (manifest,
rule theo glob, skill `project-checks`, hook lint sau khi sửa file), thêm `.agents/state/` vào `.gitignore`;
model đọc code thật để điền conventions; cuối cùng chạy `/hx-core:doctor`. Commit `.agents/` + `AGENTS.md`
để cả team dùng chung. Chi tiết: [09-setup-project.md](09-setup-project.md).

Sau đó:

```
/hx-workflows:brainstorm Thêm API xuất báo cáo PDF cho đơn hàng
```
Agent hỏi từng câu một, đề xuất 2–3 hướng, ghi design vào `docs/plans/<ngày>-<chủ-đề>-design.md`.

```
/hx-workflows:plan
```
Agent gọi subagent `planner`, lưu `docs/plans/<ngày>-<chủ-đề>-plan.md`, tạo task artifact, và ghi
`.agents/state/goal.json` (mục tiêu đang mở + lệnh kiểm tra).

```
/hx-workflows:execute
```
Chạy cả plan: lấy task mở, làm test-first (task độc lập → subagent `executor` song song), chạy lệnh Verify của
task, tick, lặp; cuối cùng chạy verify toàn bộ. Muốn làm tay từng task: `/hx-workflows:tdd T1`.

```
/hx-workflows:review
/hx-workflows:verify      # chạy script verify.js: bằng chứng vào .agents/state/verify.json, đóng goal nếu pass
/hx-workflows:commit      # commit theo nhóm hợp lý, đúng style repo
/hx-workflows:ship
```

Cuối phiên hoặc trước khi đổi máy:

```
/hx-core:handoff
```
→ `.agents/state/handoff.md` mô tả đã làm gì, còn gì, lệnh nào để kiểm tra.

## 4. Những gì chạy ngầm

- **Rules** của `hx-core` luôn được nạp: dùng skill trước, theo dõi việc bằng task artifact, không nói
  "xong" khi chưa chạy kiểm tra.
- Trước mỗi lượt model, hook bơm phần **Priority** của `.agents/state/notepad.md`, goal đang mở, kết quả verify gần nhất
  và các notice lint/format mà hook PostToolUse xếp vào `.agents/state/lint.json` khi bạn sửa file.
- Trước mỗi `run_command`, hook chặn lệnh phá hoại (`rm -rf /`, force-push lên main, `DROP DATABASE`…)
  hoặc yêu cầu xác nhận (`rm -rf <dir>`, `sudo`, `curl | sh`…).
- Khi agent định dừng mà goal còn `active` và chưa có `verify.json` pass cho goal đó, hook bắt nó tiếp tục (tối đa 5 lần).
  Model không tự đánh dấu `done: true` được: chỉ script verify ghi, hook deny mọi ghi tay vào `goal.json`/`verify.json`.

## 5. Tắt những gì bạn không muốn

```bash
agy plugin disable hx-guard        # ví dụ: tắt hooks trên máy này
agy plugin enable hx-guard
```
Lựa chọn được lưu ở `~/.gemini/config/config.json`, không đụng vào repo, và giữ nguyên khi `git pull`.

## 6. Cập nhật / gỡ

```bash
git -C ~/agy-harness pull                    # cập nhật; trong agy gõ /skills reload nếu đang mở
node ~/agy-harness/install.js --uninstall    # gỡ đăng ký (không xoá thư mục clone)
```
