# hx-core 0.4 — `adopt`: reuse a Claude Code project harness on agy

Date: 2026-09-22 · Status: approved (part 1 explicitly; parts 2–6 implicitly: "ok hãy triển khai")

## Goal
Many repos already carry a Claude Code harness (`CLAUDE.md`, `.claude/…`, `.mcp.json`, auto-memory).
`/hx-core:adopt` turns it into **agy-native files** (copy + convert, never symlinks or
`skills.json` manifests, so the two formats cannot drift into each other silently), keeps
the Claude files untouched, records what it generated, and lets `doctor` report drift when a
source changes later.

Decisions from brainstorming:
- Separate skill, run **before** `/hx-core:setup`; setup then only adds what is missing and
  never touches an existing `AGENTS.md`.
- Re-runnable: `.agents/adopt.json` stores source/target hashes; doctor warns on drift.
- Tool names are rewritten by the script only in code spans and frontmatter; prose leftovers
  are reported as `file:line` for the model.
- Hooks and permissions are classified and mapped to hx-guard/agy equivalents in the report;
  no `hooks.json` is generated from them.
- Sources: repo-level Claude files + this repo's auto-memory under `~/.claude/projects/`.
  Nothing else from `~/.claude` (agy-harness plays that role).

## Part 1 — Layout, CLI, report (approved)
```
plugins/hx-core/
├── lib/adopt/
│   ├── index.js        runAdopt(root, opts) → report; writes only with opts.apply
│   ├── toolmap.js      Claude → agy tool names; rewrite(text) for code spans / frontmatter
│   ├── claude-md.js    CLAUDE.md (+ @imports) → AGENTS.md
│   ├── skills.js       .claude/skills/<n>/ → .agents/skills/<n>/
│   ├── commands.js     .claude/commands/**.md → .agents/skills/<n>/SKILL.md
│   ├── agents.js       .claude/agents/*.md → .agents/agents/*.md
│   ├── rules.js        .claude/rules/*.md → .agents/rules/*.md
│   ├── hooks.js        settings.json hooks → classified report only
│   ├── permissions.js  settings.json permissions → report only
│   ├── mcp.js          .mcp.json → .agents/mcp_config.json
│   └── memory.js       ~/.claude/projects/<slug>/memory/*.md → notepad Decisions block
├── skills/adopt/SKILL.md + scripts/adopt.js      wrapper like setup
├── lib/doctor.js                                 + check `adopt-drift`
├── lib/registry.json                             hxSkills + "adopt"
└── __tests__/adopt-*.test.js
```
CLI: `node adopt.js [--root <dir>] [--apply] [--force] [--only <src>[,<src>]] [--json]`
- Default is **dry-run**; `--apply` writes. `--only` limits to source kinds
  (`claude-md,skills,commands,agents,rules,hooks,permissions,mcp,memory`).
- Exit 0 done, 1 unexpected error, 2 usage, 3 no Claude sources found.

Report:
```json
{ "root": "...", "apply": false,
  "sources": { "claudeMd": true, "skills": 3, "commands": 2, "agents": 1, "rules": 0, "hooks": 4, "permissions": 6, "mcp": true, "memory": 5 },
  "items": [ { "kind": "skill", "source": ".claude/skills/deploy/SKILL.md", "target": ".agents/skills/deploy/SKILL.md",
               "status": "created", "reason": "", "leftovers": [ { "line": 12, "text": "use the Bash tool" } ] } ],
  "notes": [] }
```
`status` ∈ `created | updated | skipped | manual | unsupported`.
`manual` = file written (or would be) but needs model attention (`leftovers` or `reason`).
`unsupported` = nothing written; `reason` says what to do instead.
Text output: one line per item `[status] source → target — reason`, then totals and the
leftover list `target:line — text`.

## Part 2 — Converter contract and tool map
Each converter exports `{ kind, scan(root, ctx) }`. `scan` is pure (no writes) and returns
`items[]` shaped as above plus `content` (string, or `null` for report-only kinds) and, for
copied directories, `files: [{ target, content|buffer }]`. `ctx` = `{ home, registry, toolmap }`.
Converters set `status ∈ auto | manual | unsupported` (they do not know the target state).
`index.js` computes the write action `created | updated | skipped` from the filesystem and
`adopt.json` (Part 3) and reports the final status as: `unsupported` stays; `skipped` stays
`skipped` (reason from Part 3); otherwise `manual` stays `manual` and `auto` becomes the action.

`toolmap.js`:
| Claude | agy |
|---|---|
| `Read` | `view_file` |
| `Edit`, `MultiEdit` | `replace_file_content` |
| `Write` | `write_to_file` |
| `Bash` | `run_command` |
| `Grep` | `grep_search` |
| `Glob` | `find_by_name` |
| `LS` | `list_dir` |
| `Agent`, `Task` | `invoke_subagent` |
| `TodoWrite` | task artifact (`write_to_file` with `IsArtifact: true`, `ArtifactType: "task"`) |
| `WebFetch` | `read_url_content` |
| `WebSearch` | `search_web` |
| `AskUserQuestion` | `ask_question` |
| `NotebookEdit`, `SlashCommand`, `KillShell`, `BashOutput` | none → leftover |

`rewrite(text)` replaces names only inside backtick code spans (`` `Read` `` → `` `view_file` ``)
and in the pattern `<Name> tool` / `the <Name> tool`. It returns `{ text, leftovers }` where
leftovers are lines that still contain a Claude tool name in one of those two forms with no
mapping, or the word `Claude Code`. Plain prose (“Read the file”) is left alone and not reported.
`mapToolList(list)` maps a frontmatter list; unknown names are dropped and returned as
`unmapped[]`.

Converters:
- **claude-md**: root `CLAUDE.md` or `.claude/CLAUDE.md` (first found); `CLAUDE.local.md` ignored.
  `@path` imports (line starting with `@`, relative to the file, `~/` allowed) are inlined
  recursively (depth ≤ 3, cycle-safe) under `<!-- adopted from @path -->`; a missing import
  becomes a leftover. The Claude Code boilerplate line (“This file provides guidance to Claude
  Code…”) is dropped. Target `AGENTS.md`. Length > 4000 chars → `manual` (“split into
  .agents/rules/”). Source hash = hash of the fully resolved text.
- **skills**: every `.claude/skills/<name>/` with `SKILL.md`. Whole directory copied; only
  `SKILL.md` is rewritten. Frontmatter keeps `name`, `description`, `metadata`; drops
  `allowed-tools`, `disable-model-invocation`, `user-invocable`, `model`, `context`, `agent`,
  `hooks` (listed in `reason`). Name must match `registry.nameRegex`, else `manual`. Name in
  `registry.hxSkills` → `manual` (“shadows /hx-*:<name>”).
- **commands**: `.claude/commands/**/*.md`; nested `ns/name.md` → skill `ns-name`. Skipped when a
  skill of the same name exists in `.claude/skills` (skills win). Frontmatter `description`
  (or the first non-empty body line) becomes the skill description. `$ARGUMENTS` /
  `$1` are kept and noted in `reason` (“verify agy passes arguments”).
- **agents**: frontmatter `tools` (comma string or list) → `mapToolList`; unmapped → leftover.
  Missing `tools` (Claude = all) → `[view_file, grep_search, find_by_name, list_dir,
  write_to_file, replace_file_content, run_command]`. `model`: `opus→pro`, `sonnet→inherit`,
  `haiku→flash`, else `inherit`. Adds `subagent: true`, `mainAgent: false`,
  `commandExecutionPolicy: sandbox` if `run_command` is present else `off`. Drops
  `permissionMode`, `disallowedTools`, `skills`, `color`, `maxTurns` (listed in `reason`).
  Body rewritten; if it has no H1 it is wrapped under `# System Prompt`.
- **rules**: `.claude/rules/*.md`; frontmatter `paths: [...]` → `trigger: glob`, `globs`; no
  `paths` → `trigger: always_on`; `description` kept. Body rewritten. > 12000 chars → `manual`.
- **mcp**: `.mcp.json` → `.agents/mcp_config.json` verbatim (`mcpServers` shape is the same);
  `reason` = “check with /mcp; `${VAR}` expansion is Claude syntax”.
- **memory**: slug = absolute root with `/` and `\` replaced by `-` (Claude's project dir
  name). Reads `~/.claude/projects/<slug>/memory/*.md` except `MEMORY.md`; frontmatter
  `name`, `description`, `metadata.type`. Produces one line per memory
  `- <mtime YYYY-MM-DD> — [<type>] <name>: <description>`. Lines matching a secret pattern
  (`(api[_-]?key|token|secret|password)\s*[:=]`, `sk-[A-Za-z0-9]{16,}`) are dropped and
  counted in `reason`. Target `.agents/state/notepad.md`: the block between
  `<!-- hx:adopted-memory -->` and `<!-- /hx:adopted-memory -->` under `## Decisions` is
  replaced (notepad template created if missing). Not tracked in `adopt.json` (state dir is
  gitignored and per machine).

## Part 3 — Apply rules and `adopt.json`
`.agents/adopt.json`:
```json
{ "harness": "hx", "version": "0.4.0", "at": "2026-09-22",
  "items": { ".agents/skills/deploy/SKILL.md": { "source": ".claude/skills/deploy/SKILL.md",
             "sourceHash": "sha256:…", "targetHash": "sha256:…" } } }
```
Separate from `harness.json` so adopt can run before setup and doctor's `manifest` check
stays unchanged. Every written file (including copied skill assets) has an entry.

Decision per item (in `index.js`):
| target | in adopt.json | source changed | target changed | result |
|---|---|---|---|---|
| missing | – | – | – | `created` |
| exists | no | – | – | `skipped` “exists, not managed by adopt” (`AGENTS.md`: `manual` “merge by hand”) |
| exists | yes | no | no | `skipped` “up to date” |
| exists | yes | yes | no | `updated` |
| exists | yes | – | yes | `skipped` “edited by hand” → `updated` with `--force` |
`--force` never touches an unmanaged file. Directory sources (`skills`) are decided per file.
On `--apply`: write files, create `.agents/state/`, add `.agents/state/` to `.gitignore` if
missing (reuse `fs.stateIgnored/appendGitignore`), write `adopt.json`. Dry-run reports the
same statuses without writing.

## Part 4 — Hooks and permissions (report only)
`hooks.js` reads `.claude/settings.json` → `hooks` (`settings.local.json` ignored: per machine).
Each `{event, matcher, command|type}` becomes an `unsupported` item whose `reason` is picked by
the first matching rule:
| Claude hook | reason |
|---|---|
| `type` ≠ `command` (`prompt`, `agent`) | “agy hooks are command-only; rewrite as a rule or skill” |
| `PreToolUse` on `Bash` and command mentions `rm|force|guard|deny|danger|block` | “hx-guard pre-tool-guard covers this; add custom patterns to hx-guard/hooks/patterns.json” |
| `PostToolUse` on `Edit|Write|MultiEdit` and command mentions `prettier|eslint|lint|format|ruff|gofmt|black|biome` | “/hx-core:setup generates .agents/hooks/post-edit-lint.js” |
| `Stop`, `SubagentStop` | “hx-guard stop-gate (goal/verify evidence); agy Stop hook contract: stdin {terminationReason, fullyIdle}, stdout {decision, reason}” |
| `SessionStart`, `UserPromptSubmit` | “agy PreInvocation `injectSteps`; hx-guard pre-invocation-context injects notepad/goal/lint” |
| `PreCompact`, `Notification`, `SessionEnd`, `PermissionRequest` | “no agy equivalent” |
| other `PreToolUse`/`PostToolUse` | “rewrite as agy <event> hook in .agents/hooks.json: matcher <mapped tool names>, stdin JSON camelCase, stdout JSON, exit 0, ≤10 s” |
Matcher tool names are mapped with `toolmap` for the reason text.

`permissions.js` reads `permissions.allow|deny|ask`. One `unsupported` item per list with
`reason` summarising: `Bash(prefix:*)` entries → “allow these command prefixes in agy
settings.json / `/permissions`”; `deny` Bash entries → “add as deny patterns to hx-guard
patterns.json or a project PreToolUse hook”; `Read/Edit/WebFetch(...)` entries → “agy
directory/domain scopes are set in /permissions”. Nothing is written.

## Part 5 — Skill, doctor, docs
`skills/adopt/SKILL.md` steps: confirm root → run script (dry-run, `--json`) → show the table,
ask before `--apply` → after apply, fix `leftovers` and `manual` items (rewrite prose tool
names, merge `AGENTS.md` by hand when it already existed, keep under 4000 chars) → walk the
`unsupported` hooks list and tell the user which hx-guard/setup pieces replace them (enable
`hx-guard`; extend `patterns.json`) → run `/hx-core:setup` (adds `harness.json`,
`project-checks`, lint hook) → `/hx-core:doctor` → ask before committing. Never deletes or
edits `.claude/` or `CLAUDE.md`.

`doctor.js` new check `adopt-drift` (14 checks):
- no `adopt.json` but `CLAUDE.md`/`.claude/{skills,commands,agents,rules}` present → `warn`
  “Claude Code config found but not adopted; run /hx-core:adopt”.
- for each entry: source missing → `warn` “source removed; delete target or re-run”;
  source hash changed → `warn` “source changed since adopt; run /hx-core:adopt --apply”;
  target hash changed → `ok` note “edited by hand (adopt will skip it)”.
- `ok` “N adopted file(s) in sync” otherwise.
`registry.json` `hxSkills` += `adopt`; `scripts/e2e.js` expects `hx-core:adopt`;
`rules/AGENTS.md` §8 suggests `/hx-core:adopt` when `CLAUDE.md` or `.claude/` exists and no
`adopt.json`. README table, `docs/03-skills.md`, `docs/09-setup-project.md`, CHANGELOG,
`hx-core` 0.4.0, `marketplace.json` 0.4.0, repo `CLAUDE.md` architecture section.

## Part 6 — Tests (`node --test`, fixtures in tmpdir)
- `adopt-toolmap.test.js`: code-span rewrite, `<Name> tool` rewrite, prose untouched,
  leftovers with line numbers, `mapToolList` unmapped.
- One test file per converter with 2–4 fixtures each (happy path, edge: nested command,
  agent without `tools`, rule without `paths`, CLAUDE.md with missing import, skill name
  clash with hx skill, memory secret line dropped, memory block replaced on rerun).
- `adopt-index.test.js`: dry-run writes nothing; apply creates + `adopt.json`; rerun skipped
  “up to date”; source change → updated; hand-edited target → skipped, `--force` → updated;
  unmanaged `AGENTS.md` → manual; `--only`; exit 3 with no sources.
- `doctor.test.js` additions: not-adopted warn, drift warn, in-sync ok.
- `cli.test.js` additions: usage exit 2 for adopt.
