# Harness working rules (hx-core)

These rules are always on. Follow them in every task.

## 1. Use skills first
- Before you answer or act, check the skill list. If a skill matches the task
  (even a little), activate it and follow it.
- Common matches: new feature or new project -> `/hx-workflows:brainstorm`;
  a plan with open tasks -> `/hx-workflows:execute`; a bug ->
  `/hx-workflows:debug`; "is it done?" -> `/hx-workflows:verify`;
  "commit this" -> `/hx-workflows:commit`.

## 2. Track multi-step work
- For any task with 3 or more steps, create a **task artifact**
  (`write_to_file` with `IsArtifact: true`, `ArtifactType: "task"`) that lists
  every step as `- [ ]`. Mark steps `- [x]` as you finish them.
- Re-read the task artifact before each step when the conversation is long.

## 3. Verify before you say "done"
- Never say a task is complete, fixed, or passing without running the real
  check (test, build, lint) and reading its output in this session.
- Use `/hx-workflows:verify`: its script runs the project's checks
  (`.agents/harness.json` → `goal.json` → heuristics), writes the evidence to
  `.agents/state/verify.json` and closes `goal.json`. Do not set
  `"done": true` or write `verify.json` yourself; the guard hook denies it.
- If a check fails, say so and show the failing output. Do not hide it.
- When the harness injects lint/format notices at the start of a turn, fix
  them or say why not before moving on.

## 4. Keep the notepad
- Write important decisions and open questions to `.agents/state/notepad.md`
  (use `/hx-core:notepad`). This survives context loss and machine changes.

## 5. Small, safe changes
- Prefer small diffs that keep tests green over large rewrites.
- Do not run destructive commands (force push, `rm -rf`, dropping data)
  without asking the user first. The `hx-guard` plugin will block or ask anyway.
- Match the style of the code around you. Do not add comments or docs that the
  code does not need.

## 6. Match the operating system
- Check the OS before writing shell commands (Windows uses `cmd`/PowerShell:
  `mvnw.cmd`, `gradlew.bat`, `dir`, `Remove-Item`; macOS/Linux use `sh`).
- Prefer cross-platform commands (`node`, `npm`, `git`, `python`) when possible.
- Use forward slashes in paths inside config files and scripts unless a tool
  requires Windows paths.

## 7. Delegate when it helps
- Use `invoke_subagent` for parallel or read-heavy work:
  `explorer` to map code, `reviewer` to review a diff, `verifier` to run checks,
  `executor` for independent plan tasks (`/hx-workflows:execute` does this).
- Give the subagent a clear goal, the files it needs, and what to return.

## 9. Read hook notices
- Lines starting with `[hx-harness]` at the start of a turn come from hooks:
  notepad priority, the open goal, the last verify result, and lint/format
  notices for files you just edited. Act on lint notices before moving on.

## 8. Set up the project harness once
- If the workspace has `CLAUDE.md` or `.claude/` but no `.agents/adopt.json`,
  suggest `/hx-core:adopt` once in the session (it reuses the Claude Code
  harness on agy). Then, if there is no `.agents/harness.json`, suggest
  `/hx-core:setup`. Do not insist; do not run them unasked.
- If skills, hooks or subagents behave oddly in a project, run `/hx-core:doctor`.
