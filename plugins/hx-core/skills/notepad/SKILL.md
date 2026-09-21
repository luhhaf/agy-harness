---
name: notepad
description: >-
  Read or update the workspace notepad at .agents/state/notepad.md. Use it to
  save decisions, open questions and working notes that must survive context
  loss, a new session, or another machine. Use when the user says "remember",
  "note this", "what did we decide", or when a skill asks you to record a decision.
metadata:
  icon: "📝"
---

# Notepad

File: `<workspace>/.agents/state/notepad.md`. Create it if it does not exist
with the template below. Keep it short: the harness injects the **Priority**
section into every turn, so it must stay under ~1500 characters.

## Template

```markdown
# Notepad

## Priority
<!-- max ~1500 chars. Things every turn must know: current goal, hard constraints. -->

## Decisions
<!-- one line each: YYYY-MM-DD — decision — why -->

## Working notes
<!-- timestamped notes; delete when no longer useful -->

## Open questions
- [ ] question — who can answer
```

## Steps

1. `view_file` the notepad. If missing, `write_to_file` the template.
2. To **read**: summarise the relevant section for the user in 3–5 lines.
3. To **write**: use `replace_file_content` to append one line under the right
   section. Prefix working notes with the date (`2026-09-21`).
4. Keep **Priority** current. Remove items that are no longer true.
5. Do not store secrets (tokens, passwords) in the notepad.
