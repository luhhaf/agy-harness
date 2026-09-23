---
name: doctor
description: >-
  Check that the current project's Antigravity harness is correct: .agents/
  layout, harness.json, rule sizes and triggers, skill and agent frontmatter,
  tool names, hooks.json scripts, gitignored state, goal.json, and that hx-*
  plugins are enabled on this machine. Use when the user says "doctor",
  "kiểm tra harness", "check the harness", after /hx-core:setup, or when
  skills/hooks/subagents do not behave as expected in this project.
metadata:
  icon: "🩺"
---

# Harness doctor

## Steps

1. Run [scripts/doctor.js](./scripts/doctor.js), next to this file:
   ```
   node <this-skill-dir>/scripts/doctor.js --root <project-root>
   ```
   (Resolve `<this-skill-dir>` from `~/.gemini/config/plugins.json` →
   `<entry.path>/hx-core/skills/doctor/scripts/doctor.js` if needed.)
   Exit code: 0 = no errors, 1 = errors. Add `--json` for a machine-readable report.

2. For every `[FAIL]` and `[warn]` line, explain in one sentence what it means
   for this project and what the fix is (the line already ends with `fix: …`).

3. Offer `--fix` for the two state checks (`state-ignored`, `state-dir`). Run it
   only after the user agrees. All other fixes are edits you make by hand:
   read the file, fix the frontmatter/tool name/JSON, run doctor again.

4. Stop when doctor prints `Harness OK` with 0 errors. Warnings that remain:
   - `placeholders` → run `/hx-core:setup` step 4 to fill them.
   - `hx-plugins` → this machine has hx-* disabled or not installed
     (`node ~/agy-harness/install.js`, `agy plugin enable hx-core`). Not a
     project problem.

## Checks (14 total; id — what fails)
`agents-dir`, `manifest` (harness.json), `root-rules` (AGENTS.md ≤ 12k chars,
warn > 4k), `rules-frontmatter` (trigger ∈ always_on|model_decision|glob|manual,
glob needs globs), `placeholders`, `skills` (name = dir, `^[a-z0-9]+(-[a-z0-9]+)*$`,
description), `agents` (tool names in the agy registry), `hooks` (scripts exist,
timeout ≤ 10), `adopt-drift` (Claude Code adoption status: sources changed, removed, or targets missing/deleted), `state-ignored`, `state-dir`, `goal` (goal.json schema),
`checks-runnable` (manifest checks match package.json scripts; Maven/Gradle wrapper and uv/poetry lockfile exist for the checks that use them), `hx-plugins`.
