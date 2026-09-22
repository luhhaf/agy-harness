---
name: adopt
description: >-
  Reuse an existing Claude Code project harness on Antigravity: converts
  CLAUDE.md (+@imports), .claude/skills, .claude/commands, .claude/agents,
  .claude/rules, .mcp.json and this repo's auto-memory into AGENTS.md and
  .agents/ files, classifies .claude/settings.json hooks and permissions, and
  records what it wrote in .agents/adopt.json so it can be re-run when the
  Claude files change. Use when a project has CLAUDE.md or .claude/ but no
  .agents/adopt.json, or when the user says "adopt", "migrate from Claude
  Code", "chuyển harness Claude sang agy". Run it before /hx-core:setup.
metadata:
  icon: "🔁"
---

# Adopt a Claude Code harness

Goal: agy gets native copies of the project's Claude Code customisations; the
Claude files stay untouched; `/hx-core:doctor` reports no errors afterwards.

## Steps

1. **Confirm the root** (folder with `CLAUDE.md` / `.claude/` / `.git`).

2. **Dry run** with [scripts/adopt.js](./scripts/adopt.js), next to this file:
   ```
   node <this-skill-dir>/scripts/adopt.js --root <project-root>
   ```
   (`<this-skill-dir>`: `~/.gemini/config/plugins.json` → `<entry.path>/hx-core/skills/adopt/scripts/adopt.js`,
   or `~/.gemini/config/plugins/hx-core/skills/adopt/scripts/adopt.js`.)
   Exit 3 means there is nothing to adopt: say so and stop.
   Show the user the table: `[created|updated|skipped|manual|unsupported] source → target — reason`.
   Options: `--only <kinds>` (`claude-md,skills,commands,agents,rules,hooks,permissions,mcp,memory`),
   `--force` (rewrite files adopt wrote before even if edited by hand; never an
   `AGENTS.md` adopt did not write), `--json`.

3. **Ask before writing**, then run again with `--apply`. Re-runs are safe:
   unchanged targets are skipped, hand-edited targets are skipped unless `--force`.

4. **Fix what the script cannot** (items marked `manual`, plus the
   `Leftovers` list, each `file:line`):
   - Rewrite remaining Claude tool names in prose with the map from
     `/hx-core:using-harness` (`Read`→`view_file`, `Edit`→`replace_file_content`,
     `Bash`→`run_command`, `Grep`→`grep_search`, `Glob`→`find_by_name`,
     `Agent`→`invoke_subagent`, `TodoWrite`→task artifact). Remove references to
     Claude-only slash commands and plugins.
   - `AGENTS.md` marked `manual` because it already existed: show the user the
     converted text and merge only the sections they want. Keep it under 4000 chars.
   - Skills or agents flagged `shadows /hx-*:<name>`: rename the project skill.
   - Agents with `no agy tool for X`: leave the tool out; say what the agent loses.

5. **Walk the `unsupported` list** (hooks, permissions). For each hook tell the
   user which piece replaces it (the `reason` text): `hx-guard` pre-tool-guard /
   stop-gate / pre-invocation-context, or the lint hook that `/hx-core:setup`
   generates. If the project needs a custom dangerous-command pattern, add it to
   `hx-guard/hooks/patterns.json`. If `hx-guard` is disabled on this machine,
   say so (`agy plugin enable hx-guard`).

6. **Run `/hx-core:setup`** — it adds `.agents/harness.json`, the
   `project-checks` skill and the lint hook, and leaves the adopted `AGENTS.md`
   alone.

7. **Verify** with `/hx-core:doctor`. `adopt-drift` must be `[ok]`; fix every `[FAIL]`.

8. **Report** the files written and ask whether to commit `AGENTS.md`,
   `.agents/` (including `adopt.json`). Do not commit without a yes. Never
   delete or edit `.claude/` or `CLAUDE.md`.

## What maps to what

| Claude Code | agy | Notes |
|---|---|---|
| `CLAUDE.md` (+ `@imports`) | `AGENTS.md` | imports inlined; boilerplate line dropped |
| `.claude/skills/<n>/` | `.agents/skills/<n>/` | same format; `allowed-tools` etc. dropped |
| `.claude/commands/**.md` | `.agents/skills/<n>/SKILL.md` | nested `a/b.md` → `a-b` |
| `.claude/agents/*.md` | `.agents/agents/*.md` | tools mapped, `opus→pro`, `sonnet→inherit`, `haiku→flash` |
| `.claude/rules/*.md` | `.agents/rules/*.md` | `paths:` → `trigger: glob` |
| `.mcp.json` | `.agents/mcp_config.json` | `mcpServers` copied; other top-level keys dropped; `${VAR}` noted |
| auto-memory | `.agents/state/notepad.md` Decisions block | per machine, secrets dropped |
| settings hooks / permissions | report only | see step 5 |

## Later: keeping in sync
`/hx-core:doctor` warns `adopt-drift` when:
- A Claude source changed or was removed since the last run (`changed` or `removed` sources)
- An adopted target file was deleted from disk (`missing` adopted file)

Fix by re-running step 3 (`--apply`) to re-create the files, or by removing the stale entry
from `.agents/adopt.json` for sources that no longer exist. Hand-edited targets are skipped
unless `--force`.
