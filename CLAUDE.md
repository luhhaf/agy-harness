# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A suite of four plugins for **Antigravity CLI (`agy`)** — not for Claude Code — that turn it into a
disciplined dev harness (brainstorm → plan → execute/tdd → review → verify-with-evidence → commit/ship).
Plugins live in `plugins/<name>/` and are loaded by `agy` from that directory; `marketplace.json` lists
them and `.agents/plugins.json` registers `plugins/` for dogfooding inside this repo.

Pure Node ≥ 18 stdlib: no `package.json`, no dependencies, tests use `node --test`. Everything must run
on macOS/Linux/Windows (`shell: true` on win32, LF line endings except `.ps1`, no bash assumptions in
JS). Docs and CHANGELOG are written in Vietnamese; code, comments, SKILL.md and agent prompts are English.

## Commands

```bash
node scripts/test.js                    # all __tests__/*.test.js under plugins/ (no agy needed)
node scripts/test.js hx-core            # one plugin (hx-core | hx-guard | hx-workflows)
node --test plugins/hx-guard/hooks/__tests__/stop-gate.test.js   # one file
node scripts/validate-all.js            # `agy plugin validate` per plugin (needs agy on PATH)
node scripts/e2e.js                     # agy discovers all 14 skills + 4 hooks (free, no model turns)
node scripts/e2e.js --full              # + 3 real model turns (uses quota)
node install.js                         # register this clone in ~/.gemini/config/plugins.json
```

`scripts/test-hooks.js` is a compatibility alias for `scripts/test.js hx-guard`. E2E requires the harness
to be registered globally (`install.js`) because `agy -p` print mode does not load workspace plugins.

Release: run validate + test + e2e, bump `version` in the changed plugin's `plugin.json` (and
`marketplace.json` for the suite), add a CHANGELOG entry, `git tag v0.x.y`. Plugin directory name must
equal `plugin.json` `name` (`^[a-z0-9]+(-[a-z0-9]+)*$`) and never changes after release — it is the
enable/disable key in every user's `config.json`.

## Architecture

### How the plugins couple

Plugins are independent (each can be disabled) and only reference each other **by name** — slash
commands (`/hx-workflows:verify`), `invoke_subagent` TypeName (`reviewer`) — never by cross-plugin path.
Skills have an "if the subagent is unavailable, do it yourself" branch.

The real coupling is through files in the **target project's** `<workspace>/.agents/state/` (gitignored):

| File | Only writer | Readers |
|---|---|---|
| `goal.json` | `plan` skill creates; `verify.js` closes; `stop-gate` bumps `continues` | pre-invocation-context, stop-gate, execute/ship skills |
| `verify.json` | **only** `hx-workflows/skills/verify/scripts/verify.js` | stop-gate (evidence), pre-invocation-context |
| `lint.json` | `post-tool-lint` hook + project's generated `post-edit-lint.js` | pre-invocation-context (drains + clears each turn) |
| `notepad.md` | `notepad`/`brainstorm` skills | pre-invocation-context (`## Priority` section only) |

### The evidence loop (the core invariant)

`goal.json` gets `done: true` **only** from `verify.js` after every check passes. This is enforced in
three places that must stay consistent when edited:
- `hx-guard/hooks/pre-tool-guard.js` `decideWrite()` denies write-tool edits to `verify.json` and any
  `goal.json` write containing `"done": true`; `patterns.json` denies shell writes (`>`, `tee`, `sed -i`, `cp`, `mv`) to `verify.json`.
- `hx-guard/hooks/stop-gate.js` `decide()` returns `continue` while a goal is active unless
  `verify.json` has `passed: true` for the same `goal` string; bounded by `maxContinues` (default 5).
  `active: false` is the deliberate escape hatch when blocked.
- `verify.js` `findChecks()` resolves checks in order: `--check` args → `.agents/harness.json` →
  `goal.json` → heuristics (package.json scripts / mvnw / gradlew / go / pytest / Makefile); stops at
  first failure; exit 0/1/2(usage)/3(no checks).

### Hook contract (hx-guard)

- JSON on stdin, one JSON line on stdout, **always exit 0** — wrap bodies in `lib.run(fn, fallback)`.
- agy runs hooks with CWD = plugin dir. Never use `process.cwd()`; use `lib.workspaceRoot(input)`, which
  falls back to `<appData>/cache/last_conversations.json` because print mode sends `workspacePaths: []`.
- PostToolUse output must be `{}` and stderr never reaches the model, so anything the model should see is
  queued in `lint.json` via `appendNotice()` and injected next turn by `pre-invocation-context.js` as
  `injectSteps[].ephemeralMessage` (capped at 3000 chars). Formatter hints repeat at most once / 30 min.
- Timeout ≤ 10 s. Each hook exports a pure `decide*()`/`build*()` for unit tests; integration tests use
  `__tests__/helpers.js` `runHook()` which spawns the script through stdin/stdout exactly like agy.
- New hook = script in `hooks/` + entry in `hooks.json` (PreToolUse/PostToolUse need `matcher`; other
  events are flat lists) + test.

### hx-core: setup / doctor for target projects

`skills/*/scripts/*.js` are thin argv wrappers; logic lives in `lib/`:
- `lib/detect/` — `DETECTORS` array, first match wins (node → maven → gradle → go → python). Add a stack by
  appending a detector that returns the common stack shape or `null`.
- `lib/templates.js` — the files `setup` writes into a project (`AGENTS.md`, `.agents/harness.json`,
  rules, `project-checks` skill, `hooks.json` + `post-edit-lint.js`). `<!-- hx:fill: hint -->` markers
  are reported back so the model fills them from real code.
- `lib/setup.js` `runSetup()` creates only missing files, **never** rewrites an existing root
  `AGENTS.md`; `--force` only touches files listed in `harness.json` `generated`.
- `lib/adopt/` — `/hx-core:adopt`: one pure converter per Claude Code source (`claude-md`, `skills`,
  `commands`, `agents`, `rules`, `mcp`, `memory`; `hooks`/`permissions` report only) with
  `scan(root, ctx) → items`; `index.js` decides create/update/skip against `.agents/adopt.json`
  (source/target hashes) and writes only with `--apply`. `toolmap.js` rewrites Claude tool names
  only inside code spans and `<Name> tool`. Never overwrites an `AGENTS.md` it did not write.
- `lib/doctor.js` — 14 read-only checks (exit 1 on error). Facts about agy it validates against (tool
  registry, rule `trigger` values, 12000/4000 char limits, hook timeout, expected hx skill/plugin names)
  live in `lib/registry.json` — update it when agy changes.

### Agents and skills

- `hx-agents/agents/*.md` frontmatter `tools` must use exact agy registry names (see `registry.json`);
  official docs say a wrong name can make the subagent hang (observed on 1.2.6: immediate error).
  `multi_replace_file_content` exists only on the main agent — never list it in a subagent.
  Subagents start with no parent context; `invoke_subagent` chooses the workspace (`inherit` |
  `branch` = isolated git worktree | `share`). Official spec: https://antigravity.google/docs/subagents/
- Skill `description` = what + when, third person, with the phrases users actually type. Skill names
  must be unique across all plugins (short names can shadow each other). Last step of a skill is always
  verification or a hand-off to `/hx-workflows:verify`.
- `templates/hx-stack-template/` is the starting point for a new per-stack plugin.

## Known agy limits that shape the code

- Print mode (`agy -p`) sends empty `workspacePaths`, does not load workspace `.agents/plugins.json`,
  and `/skills` lists only global/built-in skills — hence global registration for CI/e2e.
- Hooks are `type: command` only, synchronous, CWD = directory containing `hooks.json`.
- No todo tool: multi-step work is tracked via a task artifact (`write_to_file` with
  `IsArtifact: true`, `ArtifactType: "task"`).

Deeper reference: `docs/01-kien-truc.md` (architecture), `docs/05-hooks.md`, `docs/06-viet-plugin-moi.md`
(authoring plugins/skills/agents/hooks), `docs/09-setup-project.md`.
