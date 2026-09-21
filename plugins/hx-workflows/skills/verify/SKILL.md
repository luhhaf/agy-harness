---
name: verify
description: >-
  Run the project's real checks (build, tests, lint) and report the evidence
  before claiming anything is done, fixed or passing. Updates
  .agents/state/goal.json when all checks pass. Use before saying "done",
  before commit or PR, at the end of every plan task, and when the user asks
  "does it work?".
metadata:
  icon: "✅"
---

# Verify (evidence before claims)

## Rules
- A claim needs a command, an exit code and the output, all from **this**
  session. Old results do not count.
- If a check fails, report it. Never say "should pass" or "probably fine".
- Do not edit `goal.json` to `done: true` unless every check passed.

## Steps

1. **Find the checks.** In order: `checks` in `.agents/state/goal.json`;
   `Makefile` targets; `package.json` scripts (`test`, `lint`, `build`,
   `typecheck`); Maven `./mvnw -q verify` (or `mvn -q test`); Gradle
   `./gradlew check`; Python `pytest -q` + `ruff check .`; Go
   `go build ./... && go test ./...`. Prefer the project's own wrapper scripts
   (`./mvnw` / `./gradlew` on macOS and Linux, `mvnw.cmd` / `gradlew.bat` on Windows).
2. **Run them.** Use `run_command` and wait for each one to finish.
   You may delegate to the `verifier` subagent when the checks are slow or
   there are many.
3. **Read the output.** Count tests, failures, warnings that fail CI. Quote
   the first failing test/error with file and line.
4. **Update state.**
   - all pass → set `"done": true`, `"active": false`, `"updated": <now>` in
     `.agents/state/goal.json` (if the file exists); mark the task artifact.
   - any fail → leave `goal.json` as is; list what fails.
5. **Report** in this exact shape:

```
Verification: PASS | FAIL
| check | command | exit | summary |
Failures: ... (or none)
```

## If the project has no checks
Say so plainly, run at least a build/compile or a smoke command, and suggest
the smallest test setup that would make future verification possible.
