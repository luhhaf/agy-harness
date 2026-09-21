# 07 · Ví dụ phiên làm việc: thêm API xuất PDF cho dự án Spring Boot

Giả sử repo `order-service` (Maven, Spring Boot 3, JUnit 5). Bạn đã cài harness.

```bash
cd ~/work/order-service && agy
```

## 1. Brainstorm

```
/hx-workflows:brainstorm Thêm endpoint GET /orders/{id}/pdf trả về hoá đơn PDF
```
Agent (theo skill): gọi `explorer` để xem `OrderController`, `OrderService`, cách test hiện có;
hỏi lần lượt: ai dùng endpoint này? có cần i18n? giới hạn kích thước? thư viện PDF được phép
(OpenPDF vs iText)? Sau khi bạn trả lời, nó đề xuất 2–3 hướng (sinh PDF đồng bộ / job nền /
template HTML→PDF), khuyên 1 hướng, trình design theo mục, rồi ghi
`docs/plans/2026-09-21-order-pdf-design.md` và một dòng vào notepad Decisions.

## 2. Plan

```
/hx-workflows:plan
```
Kết quả `docs/plans/2026-09-21-order-pdf-plan.md`:
```
## T1 — PdfRenderer service
- Files: src/main/java/.../pdf/PdfRenderer.java, src/test/java/.../pdf/PdfRendererTest.java
- Verify: `./mvnw -q test -Dtest=PdfRendererTest`
## T2 — GET /orders/{id}/pdf controller + @WebMvcTest
## T3 — Error mapping (404, 500) + integration test with Testcontainers
```
và `.agents/state/goal.json`:
```json
{ "active": true, "done": false, "goal": "GET /orders/{id}/pdf returns invoice PDF",
  "plan": "docs/plans/2026-09-21-order-pdf-plan.md",
  "checks": ["./mvnw -q test", "./mvnw -q spotless:check"], "continues": 0, "maxContinues": 5 }
```
Từ lúc này mỗi lượt model đều thấy "Active goal … Run /hx-workflows:verify before saying it is done".

## 3. TDD từng task

```
/hx-workflows:tdd T1
```
Agent viết `PdfRendererTest` (đỏ) → chạy `./mvnw -q test -Dtest=PdfRendererTest` → viết
`PdfRenderer` tối thiểu (xanh) → refactor → chạy lại → tick `- [x] T1` trong task artifact.
Sau khi ghi file, hook `post-tool-lint` thấy `pom.xml` có spotless → nhắc chạy
`./mvnw spotless:apply` trước verify.

Song song: `Use invoke_subagent with TypeName 'executor'` cho T2 và T3 nếu chúng độc lập.

## 4. Review

```
/hx-workflows:review
```
`reviewer` (model pro) đọc `git diff`, trả:
```
## Verdict: REQUEST CHANGES
### [P1] Unbounded PDF size
- Where: PdfRenderer.java:42 — Problem: renders all line items in memory …
- Failure scenario: order with 50k lines → OOM
- Suggested fix: stream via PdfWriter / cap and paginate
```
Agent tự mở file kiểm chứng finding rồi hỏi bạn muốn sửa gì; sửa bằng `tdd`.

## 5. Verify & ship

```
/hx-workflows:verify
```
```
Verification: PASS
| check | command | exit | summary |
| tests | ./mvnw -q test | 0 | 143 tests, 0 failures |
| format | ./mvnw -q spotless:check | 0 | clean |
```
→ `goal.json.done = true`, `active = false`.

```
/hx-workflows:ship
```
Commit theo từng phần hợp lý (chỉ khi bạn đồng ý), viết PR description (what/why, bảng verify,
rủi ro, link design/plan). Hook `pre-tool-guard` chặn nếu agent lỡ `git push --force origin main`.

## 6. Đổi sang máy khác

```
/hx-core:handoff
```
Commit `.agents/state/handoff.md` (+ `notepad.md` nếu bạn không ignore), push. Máy kia:
`git pull`, mở agy, nói "Read .agents/state/handoff.md and continue from Next steps".

## Nếu agent nói "xong" mà chưa chạy test
Rule của `hx-core` cấm điều đó; nếu vẫn xảy ra, gõ `/hx-workflows:verify` — skill bắt buộc chạy
lệnh thật và chỉ đóng goal khi pass. Khi goal còn mở, hook `stop-gate` cũng không cho agent dừng.
