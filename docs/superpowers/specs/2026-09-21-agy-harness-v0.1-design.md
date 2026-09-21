# agy-harness v0.1 — Design Spec

Date: 2026-09-21 · Target: Antigravity CLI (`agy`) ≥ 1.2.6 · Status: approved

## Goal
A monorepo of small, independently enable-able plugins that turn `agy` into a
structured software-development harness (plan → build → verify → ship), usable
on many machines via `git clone` + `~/.gemini/config/plugins.json` or
`agy plugin install <repo>`.

## Decisions (from brainstorming)
- Scope v0.1: 4 plugins — `hx-core`, `hx-workflows`, `hx-agents`, `hx-guard`.
- Hook scripts: Node.js ≥ 18, stdlib only, tested with `node --test`.
- Must run on macOS, Linux and Windows: all repo scripts are Node (`install.js`, `scripts/*.js`); `install.sh`/`install.ps1` are thin clone-then-run wrappers. No Python/bash requirement.
- Skill/rule text: simple English (B1). User docs: Vietnamese.
- Example stack in docs: Java / Spring. Stack plugins are out of scope (template only).
- Plugin name = directory name, prefix `hx-`, regex `^[a-z0-9]+(-[a-z0-9]+)*$`.

## Repo layout
```
plugins/hx-core        rules/AGENTS.md, skills/{using-harness,notepad,handoff}
plugins/hx-workflows   skills/{brainstorm,plan,tdd,debug,review,verify,ship}
plugins/hx-agents      agents/{explorer,planner,executor,reviewer,verifier}.md
plugins/hx-guard       hooks.json, hooks/*.js, hooks/__tests__/*.test.js
templates/hx-stack-template
.agents/plugins.json   {"entries":[{"path":"plugins"}]}
install.sh uninstall.sh scripts/{validate-all,test-hooks,e2e}.sh
marketplace.json README.md docs/*.md (vi)
```

## Component contracts

### hx-core
- `rules/AGENTS.md` (always-on, < 4k chars): check skills first; track multi-step
  work in a task artifact; never claim done without running verification; keep
  `.agents/state/notepad.md` updated; prefer small diffs.
- `skills/using-harness`: action→tool map for agy; how skills, agents, hooks fit.
- `skills/notepad`: read/append `.agents/state/notepad.md` (sections: priority,
  working, decisions). Creates file if missing.
- `skills/handoff`: write `.agents/state/handoff.md` summary so another
  session/machine can continue.

### hx-workflows (each skill: purpose, steps, done-criteria, ends with verify)
- `brainstorm`: ask one question at a time, propose 2–3 approaches, write
  `docs/plans/<date>-<topic>-design.md`.
- `plan`: turn design into ordered tasks with files + verification per task →
  `docs/plans/<date>-<topic>-plan.md` and task artifact; writes
  `.agents/state/goal.json` (`{"active":true,"goal":..., "done":false,
  "checks":[...]}`).
- `tdd`: red → green → refactor; refuse to write code before a failing test.
- `debug`: reproduce → isolate → root cause → fix → regression test.
- `review`: invoke `reviewer` subagent on the diff; triage findings by severity.
- `verify`: run project checks (detects build tool: mvn/gradle/npm/pytest/go);
  read output; update `goal.json.done` only when all checks pass.
- `ship`: final verify, changelog/PR description, mark goal done.

### hx-agents (all `subagent: true`, `mainAgent: false`)
| agent | model | tools | role |
|---|---|---|---|
| explorer | flash | view_file, grep_search, list_dir, find_by_name | read-only codebase mapping |
| planner | pro | view_file, grep_search, list_dir, find_by_name | task breakdown, risks |
| executor | inherit | view_file, grep_search, list_dir, find_by_name, write_to_file, replace_file_content, run_command | implement one task, run its tests |
| reviewer | pro | view_file, grep_search, list_dir, find_by_name, run_command | severity-rated review, no edits |
| verifier | inherit | view_file, grep_search, list_dir, run_command | run checks, report evidence |

`commandExecutionPolicy: sandbox` for read-only agents; `auto` for executor.
Tool names are the documented ones; any name that turns out invalid is removed
after e2e testing (unknown tool names can hang a subagent).

### hx-guard (`hooks.json`)
| hook | event | matcher | behaviour |
|---|---|---|---|
| pre-tool-guard | PreToolUse | run_command | deny: `rm -rf /`, `rm -rf ~`, `git push --force` to main/master, `git reset --hard` on main, `DROP DATABASE`; ask: `git push --force*`, `rm -rf` outside cwd, `curl … \| sh`. Patterns in `hooks/patterns.json`. |
| post-tool-lint | PostToolUse | write_to_file\|replace_file_content\|multi_replace_file_content | if a formatter config exists (`.prettierrc`, `pom.xml` with spotless, `.editorconfig`), print a reminder to stderr; output `{}`. Never modifies files. |
| pre-invocation-context | PreInvocation | – | inject `ephemeralMessage` with notepad priority section + active goal summary (≤ 1500 chars). |
| stop-gate | Stop | – | if `.agents/state/goal.json` active && !done && continues < maxContinues (5): `{"decision":"continue","reason":...}`; increments `continues` in file. Otherwise `{}`. |

Hook runtime rules: read all stdin, parse JSON, try/catch everything, on error
write `{}` (or `{"decision":"allow"}` for PreToolUse) and log to stderr; exit 0;
`timeout` 10s in hooks.json. State path = first of `workspacePaths` +
`/.agents/state/`.

## Testing
- `scripts/validate-all.sh` → `agy plugin validate plugins/*` all `[ok]`.
- `scripts/test-hooks.sh` → `node --test plugins/hx-guard/hooks/__tests__` (unit tests
  feed sample payloads through each script as a child process).
- `scripts/e2e.sh` → `agy -p "/skills" --output-format json` must list all
  `hx-*` skills; `agy -p "/agents"`-style check via `agy agents`; optional
  real run `agy -p "/hx-workflows:verify"` (quota).

## Distribution
- Method A (default): `install.sh` clones/pulls to `~/agy-harness`, writes
  `~/.gemini/config/plugins.json` entry, validates.
- Method B: `agy plugin install <repo-url-or-path>` (bulk `plugins/` dir).
- Per-machine toggles: `agy plugin enable|disable hx-<name>`.

## Out of scope v0.1
Stack plugins, MCP servers, marketplace registration, status-line script.
