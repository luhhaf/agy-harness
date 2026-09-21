---
name: review
description: >-
  Review the current changes (or a given diff, branch or PR) for bugs, security
  issues, missing tests and maintainability, using the reviewer subagent, then
  triage the findings with the user. Use before merging, after finishing a
  task, or when the user says "review", "check my code", "is this safe".
metadata:
  icon: "🔍"
---

# Review

## Steps

1. **Collect the diff.** By default `git diff` (unstaged + staged) plus
   untracked files; if the user names a branch or PR use `git diff main...HEAD`
   or `gh pr diff <n>`. If the diff is empty, say so and stop.
2. **Delegate** to the `reviewer` subagent with `invoke_subagent`. Give it:
   the diff (or the command to get it), the repo root, the project's test and
   lint commands, and the goal of the change (from `goal.json` or the plan).
   If subagents are not available, do the review yourself using the reviewer
   checklist: correctness → security → tests → maintainability → style.
3. **Verify the findings.** For each P0/P1 finding, open the file and confirm
   the line and the failure scenario. Drop findings that are wrong. Do not
   accept a finding just because a subagent said it.
4. **Present** to the user, most severe first:
   - `[P0] title — path:line — scenario — fix`
   - keep P2 short; skip pure style unless it breaks the project's rules
   - end with a verdict: APPROVE / REQUEST CHANGES
5. **Ask** which findings to fix now. Fix the chosen ones with
   `/hx-workflows:tdd` (test first when the finding is a bug), then run
   `/hx-workflows:verify`.

## Do not
- Do not rewrite code outside the diff.
- Do not report more than 10 findings; group the rest.
- Do not claim "looks good" without reading the diff.
