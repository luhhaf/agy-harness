# 00 · Quick start

## 1. Yêu cầu

| Thành phần | Tối thiểu | Kiểm tra |
|---|---|---|
| Antigravity CLI | 1.2.6 | `agy --version` |
| Node.js (hooks của `hx-guard`) | 18 | `node --version` |
| python3 (script `install.sh`, `e2e.sh`) | 3.8 | `python3 --version` |
| git | bất kỳ | `git --version` |

## 2. Cài đặt (máy đầu tiên hoặc máy mới đều giống nhau)

```bash
git clone https://github.com/<you>/agy-harness ~/agy-harness
sh ~/agy-harness/install.sh
```

`install.sh` làm 3 việc:
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
sh ~/agy-harness/scripts/e2e.sh
```

## 3. Phiên làm việc đầu tiên

Mở agy trong repo dự án của bạn (`cd ~/work/my-app && agy`), rồi:

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
/hx-workflows:tdd T1
```
Viết test đỏ → code xanh → refactor cho task T1. Lặp cho các task tiếp theo.

```
/hx-workflows:review
/hx-workflows:verify
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
- Trước mỗi lượt model, hook bơm phần **Priority** của `.agents/state/notepad.md` và goal đang mở.
- Trước mỗi `run_command`, hook chặn lệnh phá hoại (`rm -rf /`, force-push lên main, `DROP DATABASE`…)
  hoặc yêu cầu xác nhận (`rm -rf <dir>`, `sudo`, `curl | sh`…).
- Khi agent định dừng mà `goal.json` còn `active` và chưa `done`, hook bắt nó tiếp tục (tối đa 5 lần).

## 5. Tắt những gì bạn không muốn

```bash
agy plugin disable hx-guard        # ví dụ: tắt hooks trên máy này
agy plugin enable hx-guard
```
Lựa chọn được lưu ở `~/.gemini/config/config.json`, không đụng vào repo, và giữ nguyên khi `git pull`.

## 6. Cập nhật / gỡ

```bash
git -C ~/agy-harness pull            # cập nhật; trong agy gõ /skills reload nếu đang mở
sh ~/agy-harness/uninstall.sh        # gỡ đăng ký (không xoá thư mục clone)
```
