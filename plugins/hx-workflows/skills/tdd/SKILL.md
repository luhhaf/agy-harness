---
name: tdd
description: >-
  Implement a task test-first: write a failing test, make it pass with the
  smallest change, then refactor. Use for any feature or bug fix that has
  testable behaviour, and whenever a plan task says "implement". Do not skip
  the failing test step.
metadata:
  icon: "🔴🟢"
---

# TDD (red → green → refactor)

## Rules
- **No production code before a failing test.** If you cannot write a test,
  say why and ask the user before continuing.
- One behaviour per cycle. Keep cycles small (minutes, not hours).
- Run the real test command each time. Read the output. Do not assume.
- Do not touch code the task does not mention.

## Steps

1. **Understand the task.** Read the plan task (or the user's request) and the
   code it touches (`view_file`). Find the existing test file or the test
   convention of the project (`find_by_name` for `*Test.java`, `*.test.ts`,
   `test_*.py`, `*_test.go`).
2. **RED.** Write one test that describes the behaviour. Run only that test:
   - Maven: `./mvnw -q test -Dtest=ClassName#method` (Windows: `mvnw.cmd`; or `mvn`)
   - Gradle: `./gradlew test --tests 'pkg.ClassName.method'` (Windows: `gradlew.bat`)
   - Node: `npx vitest run <file>` / `npx jest <file>`
   - Python: `pytest path::test_name -q`
   - Go: `go test ./pkg -run TestName`
   Confirm it **fails for the right reason** (missing behaviour, not a typo).
3. **GREEN.** Write the smallest production change that makes the test pass.
   Run the test again. Confirm it passes.
4. **REFACTOR.** Clean names, remove duplication, keep the style of the file.
   Run the full test suite of the module. Confirm it is still green.
5. **Record.** Mark the task `- [x]` in the task artifact. Update the plan file
   if the task changed.
6. Repeat from step 2 for the next behaviour. When the task is complete,
   run `/hx-workflows:verify` (its script records the evidence). If you are
   working through a plan, `/hx-workflows:execute` takes the next task.

## Output for the user (short)
- test added: path and name
- production change: files
- test command and result (copy the last lines)
