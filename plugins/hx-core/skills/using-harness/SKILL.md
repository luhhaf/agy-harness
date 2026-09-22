---
name: using-harness
description: >-
  Explains how the hx harness works on Antigravity CLI: which tool to use for
  each action, how skills, subagents, hooks and state files fit together.
  Use this skill at the start of a session, when a skill mentions a tool you
  do not have, or when you are not sure which harness skill to pick.
metadata:
  icon: "🧭"
---

# Using the harness

## Action -> tool map (Antigravity CLI)

| When a skill says | Use this in agy |
|---|---|
| read a file | `view_file` |
| search text | `grep_search` |
| find files | `find_by_name` / `list_dir` |
| write a new file | `write_to_file` |
| edit a file | `replace_file_content` / `multi_replace_file_content` |
| run a command / tests | `run_command` (wait for it to finish; `manage_task` lists/kills background processes) |
| create a todo / task list | task artifact: `write_to_file` with `IsArtifact: true`, `ArtifactType: "task"` |
| dispatch a subagent | `invoke_subagent` (built-in `self`, `research`, `browser`, or a custom one like `reviewer`) |
| remember something | append to `.agents/state/notepad.md` (skill `/hx-core:notepad`) |

`manage_task` is for background processes only. It is **not** a todo list.

## The pieces

- **Rules** (`hx-core/rules/AGENTS.md`): always on. Short working rules.
- **Skills** (`/hx-workflows:*`): step-by-step procedures. Read the whole skill
  before you start it.
- **Subagents** (`hx-agents`): `explorer`, `planner`, `executor`, `reviewer`,
  `verifier`. Read-only agents cannot edit files.
- **Hooks** (`hx-guard`): run automatically. They may block a dangerous
  command, add context before each turn, or ask you to continue when a goal
  is not done yet. If a hook blocks you, tell the user why and ask.
- **Project harness** (`<workspace>/.agents/`, committed, created by `/hx-core:setup`):
  - `harness.json` — stack and the project's check commands (`checks`)
  - `rules/*.md` — glob rules; `skills/project-checks` — how to run the checks
  - `hooks.json` + `hooks/` — project hooks (lint on edit)
  - root `AGENTS.md` — always-on project facts
- **State** (`.agents/state/` in the workspace, gitignored):
  - `notepad.md` — decisions, open questions, working notes
  - `goal.json` — the current goal and its checks (written by `/hx-workflows:plan`)
  - `handoff.md` — summary for the next session (written by `/hx-core:handoff`)

## Pick a workflow

| Situation | Skill |
|---|---|
| Code project without `.agents/harness.json` | `/hx-core:setup` (once), then `/hx-core:doctor` |
| Skills/hooks/subagents misbehave in this project | `/hx-core:doctor` |
| New feature, new project, unclear request | `/hx-workflows:brainstorm` then `/hx-workflows:plan` |
| Write code for a planned task | `/hx-workflows:tdd` |
| Something is broken | `/hx-workflows:debug` |
| Code is written, need a second pair of eyes | `/hx-workflows:review` |
| Before saying "done" | `/hx-workflows:verify` |
| Ready to merge / hand over | `/hx-workflows:ship` |
| End of session or switching machine | `/hx-core:handoff` |
