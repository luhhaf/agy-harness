# hx-core 0.2 — project harness setup & doctor

Date: 2026-09-21 · Status: approved (parts 2–4 approved implicitly: "triển khai đi")

## Goal
`hx-core` becomes the plugin that **sets up a standard Antigravity harness inside a
project** and **checks that it is correct**, so every project runs the hx workflows
the same way. Existing rules, `using-harness`, `notepad`, `handoff` stay.

Decisions from brainstorming:
- Output of setup: root `AGENTS.md`, `.agents/` (rules, project-checks skill, hooks,
  state, `harness.json` manifest), `.gitignore` entry. Plus `doctor` to check.
- Mechanism: deterministic Node scripts (stdlib, Node ≥ 18, tested with `node --test`)
  wrapped by two skills; the model only fills what needs code understanding.
- Stack detection v1: Node (npm / pnpm / yarn / bun). Detector interface is
  extensible (`lib/detect/<stack>.js`). Unknown stack → still scaffold with placeholders.
- No automatic nag in hooks (approach 1, not 3).

## Layout
```
plugins/hx-core/
├── plugin.json                       0.2.0
├── rules/AGENTS.md                   + prefer project-checks skill; suggest /hx-core:setup once
├── lib/
│   ├── fs.js                         readJson/readText/writeIfMissing/gitignore helpers
│   ├── detect/index.js               detect(root) → first matching detector or unknown
│   ├── detect/node.js                Node detector
│   ├── registry.json                 valid agy tool names, name regex, limits
│   ├── templates.js                  file templates (functions of the detect result)
│   ├── setup.js                      runSetup(root, opts) → report
│   └── doctor.js                     runDoctor(root, opts) → report
├── skills/setup/SKILL.md + scripts/setup.js      (CLI wrapper around lib/setup)
├── skills/doctor/SKILL.md + scripts/doctor.js    (CLI wrapper around lib/doctor)
└── __tests__/*.test.js               fixtures built in os.tmpdir()
```

## Part 1 — setup (see brainstorm summary)
`setup.js [--root <dir>] [--dry-run] [--force] [--json]`
- Creates only missing files; `--force` overwrites only paths listed in
  `harness.json.generated`. Root `AGENTS.md` that already exists is never touched
  (report suggests adding a "Build and test" section).
- Files: `AGENTS.md`, `.agents/harness.json`, `.agents/rules/tests.md`,
  `.agents/rules/typescript.md` (TS only), `.agents/skills/project-checks/SKILL.md`,
  `.agents/hooks.json`, `.agents/hooks/post-edit-lint.js`, `.agents/state/.gitkeep`
  is NOT created (dir only), `.gitignore` gets `.agents/state/`.
- Placeholders: `<!-- hx:fill: <hint> -->`. Report lists them so the skill can fill.
- Report: `{ root, stack, checks, created, skipped, fills:[{file, hint}], notes }`.
- Exit 0 on success, 2 on usage error, 1 on unexpected error (message on stderr).

`harness.json`:
```json
{ "harness": "hx", "version": "0.2.0", "createdAt": "2026-09-21",
  "stack": { "kind": "node", "packageManager": "pnpm", "typescript": true, "workspaces": false },
  "checks": ["pnpm run typecheck", "pnpm run lint", "pnpm test"],
  "generated": ["AGENTS.md", ".agents/rules/tests.md", "..."] }
```

Node detector: `package.json` present → kind `node`. PM by lockfile
(`pnpm-lock.yaml`→pnpm, `yarn.lock`→yarn, `bun.lockb`/`bun.lock`→bun,
`package-lock.json`→npm, else npm). Scripts → checks in order
`typecheck|type-check`, `lint`, `test`, `build` (only those present; `test` only if
not the npm default `echo ... && exit 1`). Command form: `<pm> run <script>`
(`npm test` / `pnpm test` for test). `typescript` = `tsconfig.json` exists.
`eslint` = eslint config file present or `eslintConfig` in package.json.

## Part 2 — doctor
`doctor.js [--root <dir>] [--json] [--fix]` → exit 0 (all ok / warnings only), 1
(any error), 2 (usage). Checks (id · level · fix):

| id | level | what | `--fix` |
|---|---|---|---|
| agents-dir | error | `.agents/` exists | – |
| manifest | error | `.agents/harness.json` parses; `harness === "hx"`; has `checks[]` | – |
| root-rules | error/warn | `AGENTS.md` exists at root; error if > 12 000 chars; warn if > 4 000 | – |
| rules-frontmatter | error | each `.agents/rules/*.md`: `trigger` ∈ `always_on|model_decision|glob|manual`; glob needs non-empty `globs`; ≤ 12 000 chars | – |
| placeholders | warn | no `hx:fill` left in generated files | – |
| skills | error | each `.agents/skills/*/SKILL.md`: has `name` == dir name, matches `^[a-z0-9]+(-[a-z0-9]+)*$`, non-empty `description`; warn if name shadows an hx-* skill | – |
| agents | error | each `.agents/agents/*.md`: `tools` ⊆ registry.tools (unknown tool = subagent fails to start) | – |
| hooks | error | `.agents/hooks.json` parses; every `command` that references `./…` or a `.js` file resolves to an existing file (relative to `.agents/`); `timeout` ≤ 10 | – |
| state-ignored | warn | `.agents/state/` is gitignored (parse `.gitignore` lines) | add line |
| state-dir | warn | `.agents/state/` exists | mkdir |
| goal | error | if `state/goal.json` exists: `active`/`done` booleans, `checks` array | – |
| checks-runnable | warn | Node: each `<pm> run X` / `<pm> test` has script `X` in package.json | – |
| hx-plugins | warn | `~/.gemini/config/plugins.json` has an entry whose path contains `hx-core`, or `~/.gemini/config/plugins/hx-core` exists; `config.json` does not disable hx-core/hx-workflows | – |

Output text: one line per check `[ok|warn|FAIL] id — message (fix: …)`, then a summary.
Report JSON: `{ root, ok, errors, warnings, results:[{id, level:"ok|warn|error", message, fix}] }`.

## Part 3 — skills and integration
- `/hx-core:setup`: (1) confirm workspace root; (2) run setup script `--json`;
  (3) for each `fills` item read the real code (package.json, `src/`, existing
  tests, lint config) and replace the placeholder with 3–8 concrete lines; keep
  root `AGENTS.md` under 4 000 chars; (4) run doctor; (5) show the user the list of
  files and ask before committing. If root `AGENTS.md` was skipped, propose the
  "Build and test" section as a diff, do not apply without a yes.
- `/hx-core:doctor`: run doctor script, explain each FAIL/warn in one line, offer
  `--fix` for the fixable ones, then manual fixes. Use when "kiểm tra harness",
  "doctor", "agent không chạy đúng trong project này".
- Script path: SKILL.md links `[setup.js](./scripts/setup.js)` (official relative
  link). Fallback paragraph: resolve via `~/.gemini/config/plugins.json` entry path
  + `/hx-core/skills/setup/scripts/setup.js`, or `~/.gemini/config/plugins/hx-core/…`.
- `hx-workflows:verify` step 1 order becomes: `.agents/harness.json.checks` →
  `goal.json.checks` → the existing heuristics.
- `using-harness`: add `harness.json` to state table, add the two skills to the
  workflow table.
- `rules/AGENTS.md`: in §3 prefer `/project-checks` skill when it exists; new §8:
  if the workspace has `package.json`/`pom.xml`/… but no `.agents/harness.json`,
  suggest `/hx-core:setup` once per session, do not insist.

## Part 4 — testing
- `plugins/hx-core/__tests__/`: `detect-node.test.js`, `setup.test.js`,
  `doctor.test.js`, `cli.test.js` (spawns the two scripts, checks exit codes and
  `--json`). Fixtures created in `os.tmpdir()` per test.
- `scripts/test-hooks.js` → generalised `scripts/test.js` that runs every
  `__tests__/*.test.js` under `plugins/`; `test-hooks.js` kept as alias.
- `scripts/e2e.js`: expect `hx-core:setup` and `hx-core:doctor` in `/skills`.
- Dogfood: run `setup.js --root <tmp copy of a small npm project>` then
  `doctor.js` → exit 0 with only `placeholders` warnings.

## Out of scope
Java/Python/Go detectors (interface ready), auto-nag hook, editing an existing
root `AGENTS.md`, running project checks from doctor.
