---
name: verify
description: >-
  Run the project's real checks (build, tests, lint) through the verify script,
  which records the evidence in .agents/state/verify.json and closes
  .agents/state/goal.json only when every check passes. Use before saying
  "done", before commit or PR, at the end of every plan task, and when the
  user asks "does it work?". This is the only way to mark a goal done.
metadata:
  icon: "✅"
---

# Verify (evidence before claims)

## Rules
- A claim needs a command, an exit code and the output, all from **this**
  session. Old results do not count.
- If a check fails, report it. Never say "should pass" or "probably fine".
- **Never edit `goal.json` to `done: true` or touch `verify.json` by hand.**
  The `hx-guard` hooks deny it, and the stop gate only accepts a goal as done
  when `verify.json` says the checks passed for that goal.

## Steps

1. **Run the script** [scripts/verify.js](./scripts/verify.js), next to this file:
   ```
   node <this-skill-dir>/scripts/verify.js --root <project-root>
   ```
   (Resolve `<this-skill-dir>` from `~/.gemini/config/plugins.json` →
   `<entry.path>/hx-workflows/skills/verify/scripts/verify.js` if needed.)
   Use `run_command` and wait for it to finish; test suites can take minutes
   (`--timeout <sec>` per check, default 1800).
   The script picks the checks in this order: `--check "<cmd>"` args →
   `checks` in `.agents/harness.json` → `checks` in `goal.json` → heuristics
   (`package.json` scripts, `./mvnw`, `./gradlew`, `go`, `pytest`, `Makefile`).
   It runs them in order, stops at the first failure, writes
   `.agents/state/verify.json`, and prints:
   ```
   Verification: PASS | FAIL
   | check | command | exit | summary |
   Failures: ... (or none)
   Evidence: .agents/state/verify.json
   Goal closed / still open
   ```
   Exit code: 0 pass, 1 a check failed, 3 no checks found.

2. **Read the output.** Quote the first failing test/error with file and line
   in your report. Do not summarise "some tests failed".

3. **On PASS**: the script has already set `done: true`, `active: false` in
   `goal.json`. Mark the task artifact. Report the table.

4. **On FAIL**: fix the cause (`/hx-workflows:debug` for a real bug, then
   `/hx-workflows:tdd`) and run the script again. Do not skip a check.

5. **On exit 3 (no checks)**: say so plainly. Run at least a build/compile or
   a smoke command with `--check "<cmd>"`, and suggest the smallest test setup
   that would make future verification possible (`/hx-core:setup` writes
   `checks` into `harness.json`). If nothing can be run, tell the user and set
   `"active": false` in `goal.json` with a one-line explanation.

## Report shape (copy from the script, add nothing you did not see)

```
Verification: PASS | FAIL
| check | command | exit | summary |
Failures: ...
```
