---
name: execute
description: >-
  Work through an approved plan task by task until every task is done and
  verified: pick the next open task, implement it test-first (inline or via
  the executor subagent, in parallel when tasks are independent), run the
  task's verify command, tick it, repeat, then run the full verify. Use after
  /hx-workflows:plan, when the user says "execute the plan", "do all tasks",
  "keep going", or when a plan file has open tasks.
metadata:
  icon: "🏃"
---

# Execute the plan

Input: the plan file (`docs/plans/<date>-<topic>-plan.md`, from
`.agents/state/goal.json` → `plan`) and the task artifact.
Output: every task `- [x]`, `verify` passed, goal closed.

## Rules
- One task at a time per worker. Never start a task whose `Depends on` is open.
- Every task ends with its own `Verify` command run for real, in this session.
- Re-read the task artifact before choosing the next task (context may be old).
- Stop and ask the user after: 2 consecutive BLOCKED/PARTIAL results on the
  same task, a verify that fails twice for the same reason, or any task that
  would need a change outside its `Files`.

## Steps

1. **Load.** `view_file` the plan and the task artifact. If there is no plan,
   say so and point to `/hx-workflows:plan`. If `goal.json` is missing or
   inactive, recreate it as `plan` does (active, done=false, checks).
2. **Branch (optional but recommended).** If the work is more than one task
   and the user has not said otherwise, work on a feature branch:
   `git switch -c <type>/<topic>` (ask if the repo is not on a clean base).
3. **Pick tasks.** Open tasks whose dependencies are done. If two or more are
   independent (disjoint `Files`), you may run them in parallel with the
   `executor` subagent; otherwise take the first one.
4. **Run a task.**
   - **Inline** (default for 1 task, or when subagents are off): follow
     `/hx-workflows:tdd` for the task.
   - **Delegated**: `invoke_subagent` TypeName `executor` with: the task text
     verbatim (Files, Steps, Verify), the repo root, the project's test
     command, and "do not commit". Wait for the report. Max 3 executors at once.
5. **Check the result.** The task is done only when its `Verify` command
   exited 0 in the output you can see. If the executor says PARTIAL/BLOCKED,
   read its notes, then either fix inline or re-dispatch once with the
   missing information.
6. **Tick.** Mark `- [x]` in the task artifact; update the plan file if the
   task changed (files, approach). One line in the notepad if a decision was
   made.
7. **Repeat** from step 3 until no open task remains.
8. **Full verify.** Run `/hx-workflows:verify` (the script). If it fails, fix
   and rerun; do not claim done.
9. **Report** in this shape and suggest `/hx-workflows:review` then
   `/hx-workflows:ship`:
   ```
   Tasks: 5/5 done (T1 T2 inline, T3 T4 executor, T5 inline)
   Verify: PASS (table)
   Changed files: ...
   Open questions / follow-ups: ...
   ```
