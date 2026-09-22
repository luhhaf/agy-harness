---
name: commit
description: >-
  Turn the working tree into clean, logical git commits with messages in the
  repository's own style: inspect the diff, group changes, exclude junk and
  secrets, write the message, commit only what the user agreed to. Use when
  the user says "commit", "save this", "make a commit", or at the end of ship.
metadata:
  icon: "📦"
---

# Commit

## Rules
- Only commit when the user asked (this skill being invoked counts). Never
  push, never amend a pushed commit, never force.
- Never commit `.agents/state/`, build output, `node_modules`, `.env`, keys,
  tokens, or files the user did not mention when they named files.
- Do not `git add -A` blindly. Add by path.

## Steps

1. **Inspect.** `git status --short`, `git diff --stat`, and `git log --oneline -10`
   to learn the message style (Conventional Commits `type(scope): summary`,
   plain imperative, ticket prefix, language).
2. **Screen.** For each changed file: does it belong to the work? Is anything
   secret or generated? Anything untracked that should be gitignored? List
   what you will leave out and why.
3. **Group.** One commit per logical change (feature + its tests together;
   unrelated refactor separate; docs with the code they describe). Prefer 1–3
   commits; do not split hairs.
4. **Verify first** when the commit closes a task or a goal: run
   `/hx-workflows:verify` if it has not passed in this session for the
   current tree.
5. **Commit.** For each group: `git add <paths>` then `git commit -m "<subject>"
   -m "<body>"`. Subject ≤ 72 chars, imperative, in the repo's style. Body:
   why, not what; link the plan/design file if any. Use a heredoc or
   multiple `-m` so newlines survive on every OS.
6. **Show** `git log --oneline -<n>` and `git status --short` (should be clean
   or only intentionally unstaged files).
7. If the user wants a PR, continue with `/hx-workflows:ship`.
