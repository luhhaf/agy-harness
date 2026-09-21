---
name: handoff
description: >-
  Write a handoff summary to .agents/state/handoff.md so a new session, a
  teammate, or another machine can continue the work. Use at the end of a
  session, before switching machines, when context is getting long, or when
  the user says "handoff", "wrap up", or "summarise where we are".
metadata:
  icon: "🤝"
---

# Handoff

Goal: a person or agent with **zero context** can continue in 5 minutes.

## Steps

1. Collect facts (do not guess):
   - `run_command`: `git status --short` and `git log --oneline -10`
   - `view_file`: `.agents/state/goal.json` and `.agents/state/notepad.md` if present
   - the task artifact of this conversation, if any
2. Write `<workspace>/.agents/state/handoff.md` with this structure:

```markdown
# Handoff — YYYY-MM-DD HH:MM

## Goal
One sentence. Link to the plan file if there is one.

## Done
- [x] ...

## In progress
- [ ] step — current state — file(s) touched

## Next steps
1. exact next action, including the command to run

## How to verify
`<command>` — expected result

## Open questions / risks
- ...

## Uncommitted changes
Output of `git status --short` (or "clean").
```

3. Tell the user the file path and the 3 most important next steps.
4. If there are uncommitted changes, ask whether to commit them now
   (do not commit without a yes).

## To resume on another machine
Read `.agents/state/handoff.md`, then `.agents/state/notepad.md`, then run
the "How to verify" command before changing anything.
