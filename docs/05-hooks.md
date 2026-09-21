# 05 · Hooks (hx-guard)

Hook = lệnh shell agy chạy tại các điểm trong vòng lặp agent. Nhận JSON qua **stdin**, trả JSON
qua **stdout** (key camelCase), CWD = thư mục chứa `hooks.json` (tức `plugins/hx-guard/`),
timeout 10 s, chạy đồng bộ. Script viết bằng Node ≥ 18, không dependency, mỗi script có test.

| Hook | Event | Matcher | Script | Hành vi |
|---|---|---|---|---|
| `hx-pre-tool-guard` | PreToolUse | `run_command` | `hooks/pre-tool-guard.js` | `deny` / `ask` / `allow` theo `hooks/patterns.json` |
| `hx-post-tool-lint` | PostToolUse | `write_to_file\|replace_file_content\|multi_replace_file_content` | `hooks/post-tool-lint.js` | in gợi ý formatter ra stderr; **không sửa file**; stdout `{}` |
| `hx-pre-invocation-context` | PreInvocation | – | `hooks/pre-invocation-context.js` | bơm `ephemeralMessage` = notepad Priority + goal đang mở (≤ 1500 ký tự) |
| `hx-stop-gate` | Stop | – | `hooks/stop-gate.js` | goal `active && !done` → `{"decision":"continue"}` tối đa `maxContinues` lần |

## pre-tool-guard — chặn lệnh nguy hiểm

Mẫu trong `hooks/patterns.json` (regex, không phân biệt hoa thường):

**deny** (chặn cứng, agent nhận thông báo lỗi có mã `[hx-guard:<id>]`):
`rm -rf /`, `rm -rf ~`, `rm -rf /*`, `git push --force … main|master` (cả 2 thứ tự), `git reset --hard (origin/)main|master`,
`DROP DATABASE|SCHEMA`, `mkfs`, `dd … of=/dev/…`.

**ask** (hỏi bạn; trong print mode = từ chối và ghi vào `denied_actions`):
`git push --force` (nhánh khác), `rm -rf <path>`, `curl|wget … | sh|bash`, `git clean -f`, `DROP|TRUNCATE TABLE`,
`sudo`, `chmod 777`.

Với lệnh chỉ-đọc (`grep`, `rg`, `echo`, `cat`, …) phần trong dấu nháy được bỏ qua, nên
`grep -r "rm -rf" docs/` không bị chặn; nhưng `sh -c "rm -rf /"` vẫn bị deny.

Thêm mẫu: sửa `patterns.json`, thêm test vào `hooks/__tests__/pre-tool-guard.test.js`, chạy
`sh scripts/test-hooks.sh`.

Output nâng cao (chưa dùng, agy hỗ trợ): `"overwrite": {"CommandLine": "..."}` để sửa lệnh trước
khi chạy; `"permissionOverrides": ["command(npm test)"]`.

## pre-invocation-context — context mỗi lượt

Đọc `<workspace>/.agents/state/notepad.md` (mục `## Priority`, bỏ comment HTML) và `goal.json`.
Nếu có gì để nói → `{"injectSteps":[{"ephemeralMessage":"[hx-harness]\n..."}]}`; nếu không → `{}`.
Cắt ở 1500 ký tự để không "ăn" context.

## stop-gate — giữ agent làm tới khi goal được verify

```
goal.json: active=true, done=false, continues<maxContinues
   └─ agent định dừng → hook trả continue + lý do → agent tiếp tục, continues++
goal.json: done=true (do /hx-workflows:verify) hoặc active=false  → hook trả {}
continues >= maxContinues → hook trả {} và ghi active=false, stoppedReason="max_continues"
terminationReason chứa "error" hoặc fullyIdle=false → hook trả {} (không ép khi lỗi / còn task nền)
```
Đã kiểm chứng end-to-end: goal active + prompt "chỉ nói hi" → agent bị ép tiếp tục, tự tạo file,
chạy verify và đóng goal.

Thoát vòng lặp thủ công: sửa `.agents/state/goal.json` → `"active": false`, hoặc xoá file, hoặc
`agy plugin disable hx-guard`.

## Cách xác định workspace (quan trọng)

Interactive: payload có `workspacePaths[0]`. Print mode (`agy -p`) gửi `workspacePaths: []`, nên
`lib.js` tra ngược `conversationId` trong `<appDataDir>/cache/last_conversations.json`
(`appDataDir` suy từ `transcriptPath`, fallback `~/.gemini/antigravity-cli`). Không tìm được →
hook bỏ qua (không bao giờ dùng CWD, vì CWD là thư mục plugin).

## Contract stdin (tóm tắt, đo thực tế trên 1.2.6)

```jsonc
// chung
{ "conversationId": "...", "workspacePaths": ["/path"], "transcriptPath": ".../brain/<id>/.system_generated/logs/transcript_full.jsonl",
  "artifactDirectoryPath": ".../brain/<id>", "modelName": "gemini-3.8-flash-medium" }
// PreToolUse thêm
{ "toolCall": { "name": "run_command", "args": { "CommandLine": "...", "Cwd": "...", "WaitMsBeforeAsync": 0 } }, "stepIdx": 19 }
// write_to_file args: CodeContent, TargetFile, Overwrite, Description
// replace_file_content args: TargetFile, TargetContent, ReplacementContent, StartLine, EndLine, AllowMultiple
// PreInvocation / PostInvocation thêm
{ "invocationNum": 0, "initialNumSteps": 1 }
// Stop thêm
{ "terminationReason": "NO_TOOL_CALL", "fullyIdle": true, "executionNum": 0, "error": "" }
```

## Debug hook

- `agy -p "/hooks" --output-format json` → hook nào đang được nạp, từ file nào.
- Chạy tay như agy: `cd plugins/hx-guard && echo '{"toolCall":{"name":"run_command","args":{"CommandLine":"rm -rf /"}}}' | sh -c 'node ./hooks/pre-tool-guard.js'`.
- stderr của hook không hiện trong TUI; muốn xem, tạm ghi ra file (xem cách làm trong
  `docs/research/`, mục hook debug) hoặc chạy tay.
- Log agy: `~/.gemini/antigravity-cli/cli.log` có dòng `loaded N named hooks from M hooks.json file(s)`.
