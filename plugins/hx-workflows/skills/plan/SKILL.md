---
name: plan
description: >-
  Turn an approved design (or a clear request) into an ordered list of small,
  verifiable tasks, save it as a plan file, create the task artifact, and set
  the active goal in .agents/state/goal.json. Use after brainstorm, or when the
  user says "plan this", "break it down", "what are the steps".
metadata:
  icon: "🗺️"
---

# Plan

Output: `docs/plans/YYYY-MM-DD-<topic>-plan.md`, a task artifact, and
`.agents/state/goal.json`.

## Steps

1. Read the design file (or restate the request in 2 lines if there is none).
2. Delegate the breakdown to the `planner` subagent with `invoke_subagent`.
   Give it: the design text, the repo root, and the project's test command.
   If subagents are not available, do the breakdown yourself using the same
   format (see below).
3. Check the plan yourself:
   - every task has real file paths (verify with `find_by_name`)
   - every task has a **Verify** command
   - tasks are ordered so tests stay green after each one
   - no task is bigger than ~1 hour; split it if so
4. Save the plan to `docs/plans/YYYY-MM-DD-<topic>-plan.md`.
5. Create the **task artifact** (`write_to_file`, `IsArtifact: true`,
   `ArtifactType: "task"`) with one `- [ ]` line per task.
6. Write `.agents/state/goal.json` (create the folder if needed):

```json
{
  "active": true,
  "done": false,
  "goal": "<one sentence>",
  "plan": "docs/plans/YYYY-MM-DD-<topic>-plan.md",
  "checks": ["<project test command>", "<lint or build command>"],
  "continues": 0,
  "maxContinues": 5,
  "updated": "YYYY-MM-DDTHH:MM"
}
```
   The `hx-guard` stop hook uses this file: while `active` is true, the agent
   is asked to keep working (max `maxContinues` times) until the verify script
   has recorded a passing run in `.agents/state/verify.json`. Only
   `/hx-workflows:verify` (its script) sets `done: true`; writing it by hand
   is denied by the guard hook.
7. Tell the user the plan path and ask: "Run the whole plan with
   `/hx-workflows:execute`, or start with T1 using `/hx-workflows:tdd`?"

## Plan format

```markdown
# Plan — <topic> (YYYY-MM-DD)
Design: docs/plans/...-design.md

## T1 — <title>
- Files: ...
- Steps: 1) ... 2) ...
- Verify: `<command>` → expected
## T2 — ...
## Risks
## Open questions
```
