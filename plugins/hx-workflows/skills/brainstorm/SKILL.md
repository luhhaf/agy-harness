---
name: brainstorm
description: >-
  Turn an idea or a vague request into a clear design before any code is
  written. Use when the user wants a new feature, a new project, a change in
  behaviour, or says "I want", "build me", "add", "let's make". Also use when
  the request is unclear. Do not use for a small, well-defined fix.
metadata:
  icon: "💡"
---

# Brainstorm

Goal: agree on **what** to build and **why** before deciding **how**.
Output: a short design document the user has approved.

## Rules
- Ask **one question at a time**. Prefer multiple-choice questions.
- Do not write code, do not scaffold files, do not run build commands.
- Say what you understood before you propose anything.
- YAGNI: remove features the user did not ask for.

## Steps

1. **Look at the project first.** Use the `explorer` subagent (`invoke_subagent`)
   or `list_dir` / `grep_search` to learn: language, build tool, test setup,
   existing modules that relate to the request. Keep it short.
2. **Clarify.** Ask questions until you know:
   - purpose: what problem, for whom
   - success: how the user will know it works
   - constraints: stack, deadline, must-not-touch areas, compatibility
   Ask one question per message. Stop when you can describe the feature in
   3 sentences without guessing.
3. **Propose 2–3 approaches.** For each: one paragraph, main trade-off.
   Say which one you recommend and why.
4. **Present the design** in sections; ask "does this look right?" after each:
   - scope (in / out)
   - components and how they connect
   - data and interfaces (API, schema, files)
   - error handling
   - testing approach
5. **Write the design** to `docs/plans/YYYY-MM-DD-<topic>-design.md`
   (create the folder if needed). Keep it under 2 pages. No "TBD".
6. **Record the decision** in the notepad (`/hx-core:notepad`): one line
   "date — chose approach X — why".
7. Tell the user: "Design saved at <path>. Next: `/hx-workflows:plan`."

## Done when
- The user said yes to the design.
- The design file exists and has no placeholders.
