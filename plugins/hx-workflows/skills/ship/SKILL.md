---
name: ship
description: >-
  Finish a piece of work safely: final verify, review of the full diff, clean
  commits, changelog or PR description, and handoff notes. Use when the user
  says "ship", "finish", "wrap up", "create the PR", or when all plan tasks are
  done.
metadata:
  icon: "🚀"
---

# Ship

## Steps

1. **Check the plan.** Every task in the task artifact is `- [x]`? If not,
   list what is open and ask whether to continue or ship partially.
2. **Verify.** Run `/hx-workflows:verify`. Stop here if it fails.
3. **Review.** Run `/hx-workflows:review` on `git diff <base>...HEAD` where
   `<base>` is the branch the user merges into (ask if unknown). Fix P0s.
4. **Tidy the branch.**
   - `git status` — no stray files (build output, secrets, `.agents/state/` is
     ignored by default).
   - Commit in logical pieces with clear messages (`type: short summary`,
     body says why). Ask before committing if the user did not say to commit.
   - Never force-push. Never rebase a shared branch without asking.
5. **Write the PR description** (or changelog entry) with:
   - what changed and why (2–5 lines)
   - how it was tested (the verify table)
   - risks / rollout notes
   - link to the design and plan files
   Create the PR with `gh pr create` only if the user asks.
6. **Close the goal.** Confirm `.agents/state/goal.json` has `done: true`,
   `active: false`. Run `/hx-core:handoff` so the next session starts clean.
7. Tell the user what was shipped and what is left (if anything).
