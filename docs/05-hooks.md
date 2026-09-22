# 05 · Hooks (hx-guard)

Hook = lệnh shell agy chạy tại các điểm trong vòng lặp agent (`sh -c` trên macOS/Linux,
`cmd /c` trên Windows). Nhận JSON qua **stdin**, trả JSON qua **stdout** (key camelCase),
CWD = thư mục chứa `hooks.json` (tức `plugins/hx-guard/`), timeout 10 s, chạy đồng bộ.
Script viết bằng Node ≥ 18, không dependency, chạy y hệt trên 3 OS, mỗi script có test.

| Hook | Event | Matcher | Script | Hành vi |
|---|---|---|---|---|
| `hx-pre-tool-guard` | PreToolUse | `run_command\|write_to_file\|replace_file_content\|multi_replace_file_content` | `hooks/pre-tool-guard.js` | lệnh shell: `deny` / `ask` / `allow` theo `hooks/patterns.json`; tool ghi file: `deny` ghi tay `verify.json` hoặc `"done": true` vào `goal.json` |
| `hx-post-tool-lint` | PostToolUse | `write_to_file\|replace_file_content\|multi_replace_file_content` | `hooks/post-tool-lint.js` | xếp gợi ý formatter vào `.agents/state/lint.json` (mỗi gợi ý tối đa 1 lần / 30 phút); **không sửa file**; stdout `{}` |
| `hx-pre-invocation-context` | PreInvocation | – | `hooks/pre-invocation-context.js` | bơm `ephemeralMessage` = notepad Priority + goal đang mở + kết quả verify gần nhất + lint notices (rồi xoá notices) (≤ 3000 ký tự) |
| `hx-stop-gate` | Stop | – | `hooks/stop-gate.js` | goal `active` mà `verify.json` chưa pass cho goal đó → `{"decision":"continue"}` tối đa `maxContinues` lần |

## pre-tool-guard — chặn lệnh nguy hiểm

Mẫu trong `hooks/patterns.json` (regex, không phân biệt hoa thường):

**deny** (chặn cứng, agent nhận thông báo lỗi có mã `[hx-guard:<id>]`):
`rm -rf /`, `rm -rf ~`, `rm -rf /*`, `git push --force … main|master` (cả 2 thứ tự), `git reset --hard (origin/)main|master`,
`DROP DATABASE|SCHEMA`, `mkfs`, `dd … of=/dev/…`; Windows: `rmdir /s` gốc ổ đĩa, `format C:`,
`diskpart`, `Remove-Item -Recurse` gốc ổ/home.

**ask** (hỏi bạn; trong print mode = từ chối và ghi vào `denied_actions`):
`git push --force` (nhánh khác), `rm -rf <path>`, `curl|wget … | sh|bash`, `git clean -f`, `DROP|TRUNCATE TABLE`,
`sudo`, `chmod 777`; Windows: `del /s`, `rmdir /s`, `Remove-Item -Recurse`, `irm|iwr … | iex`,
`reg delete`, `takeown|icacls /t`.

Bảo vệ bằng chứng (0.2.0): **deny** `> | tee | sed -i | cp | mv | Set-Content …` vào
`.agents/state/verify.json`; **ask** khi ghi shell vào `goal.json`. Với tool ghi file
(`write_to_file`, `replace_file_content`, `multi_replace_file_content`): **deny** nếu `TargetFile` là
`verify.json`, hoặc là `goal.json` mà nội dung có `"done": true`. Ghi `goal.json` với `active: false`
(lối thoát khi kẹt) vẫn được phép. Đọc (`cat`) không bị ảnh hưởng.

Với lệnh chỉ-đọc (`grep`, `rg`, `echo`, `cat`, …) phần trong dấu nháy được bỏ qua, nên
`grep -r "rm -rf" docs/` không bị chặn; nhưng `sh -c "rm -rf /"` vẫn bị deny.

Thêm mẫu: sửa `patterns.json`, thêm test vào `hooks/__tests__/pre-tool-guard.test.js`, chạy
`node scripts/test-hooks.js`.

Output nâng cao (chưa dùng, agy hỗ trợ): `"overwrite": {"CommandLine": "..."}` để sửa lệnh trước
khi chạy; `"permissionOverrides": ["command(npm test)"]`.

## post-tool-lint — vì sao ghi `lint.json` thay vì stderr

Contract PostToolUse của agy chỉ nhận stdout `{}`; stderr của hook không tới model lẫn TUI.
Nên mọi hook "báo lint" đều ghi vào hàng đợi `<workspace>/.agents/state/lint.json`:

```json
{ "notices": [ { "at": "2026-09-22T10:00:00Z", "source": "project-lint|hx-formatter", "file": "src/a.ts", "text": "…≤600 ký tự" } ],
  "reminded": { "<gợi ý formatter>": "<lần nhắc gần nhất>" } }
```
`hx-post-tool-lint` xếp gợi ý formatter (Prettier/Biome/spotless/ruff…) vào đây, mỗi gợi ý tối đa
1 lần mỗi 30 phút. Hook `post-edit-lint.js` mà `/hx-core:setup` sinh ra trong project ghi output
eslint/ruff/gofmt của file vừa sửa vào cùng hàng đợi (nguồn `project-lint`). Hook PreInvocation bên
dưới lấy ra, bơm cho model, rồi xoá; giữ tối đa 20 notice.

## pre-invocation-context — context mỗi lượt

Đọc `<workspace>/.agents/state/notepad.md` (mục `## Priority`, bỏ comment HTML), `goal.json`,
`verify.json` và `lint.json`. Nếu có gì để nói → `{"injectSteps":[{"ephemeralMessage":"[hx-harness]\n..."}]}`;
nếu không → `{}`. Nội dung: Priority; goal đang mở (kèm cảnh báo nếu `done: true` mà không có bằng
chứng); dòng "Last verify FAILED at … : `<lệnh>` exit N" nếu lần verify gần nhất lỗi; danh sách lint
notices (sau đó xoá khỏi `lint.json`). Cắt ở 3000 ký tự để không "ăn" context.

## stop-gate — giữ agent làm tới khi goal được verify **bằng bằng chứng**

```
goal.json active=true, continues<maxContinues, và KHÔNG có verify.json {passed:true, goal == goal.json.goal}
   └─ agent định dừng → hook trả continue + lý do → agent tiếp tục, continues++
        · done=false            → "not verified; run the verify script"
        · done=true (sửa tay)   → "done but no passing verify evidence"
        · verify.json passed=false → nêu lệnh fail và exit code
goal.json active=false (verify script đặt khi pass, hoặc bạn/agent đặt khi kẹt) → hook trả {}
goal.json done=true + verify.json passed=true cùng goal → hook trả {}
continues >= maxContinues → hook trả {} và ghi active=false, stoppedReason="max_continues"
terminationReason chứa "error" hoặc fullyIdle=false → hook trả {} (không ép khi lỗi / còn task nền)
```
Hook không tự chạy test (giới hạn timeout 10 s của agy); việc chạy do script
`hx-workflows/skills/verify/scripts/verify.js` làm và ghi `verify.json`. Xem [03-skills](03-skills.md).
Đã kiểm chứng end-to-end: goal active + prompt "chỉ nói hi" → agent bị ép tiếp tục, tự tạo file,
chạy verify và đóng goal.

Thoát vòng lặp thủ công: sửa `.agents/state/goal.json` → `"active": false` (được phép), hoặc xoá
file, hoặc `agy plugin disable hx-guard`. Sửa tay `"done": true` **không** thoát được nữa.

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
