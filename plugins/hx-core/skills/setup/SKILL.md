---
name: setup
description: >-
  Set up the standard hx harness inside the current project: root AGENTS.md,
  .agents/ (harness.json, glob rules, project-checks skill, post-edit lint hook,
  state dir) and .gitignore. Detects the stack (Node with npm/pnpm/yarn/bun,
  Maven, Gradle, Go, Python with uv/poetry/pip) and fills the build/test
  commands; the model then fills the conventions from the real code. Use when the user says "setup harness",
  "init harness", "chuẩn hoá project cho agy", or when a code project has no
  .agents/harness.json yet.
metadata:
  icon: "🛠️"
---

# Setup the project harness

Goal: after this skill, the project has a correct, committed `.agents/` layout
and a root `AGENTS.md`, and `/hx-core:doctor` reports no errors.

## Steps

1. **Confirm the root.** The project root is the workspace folder (where
   `package.json` / `.git` live). Ask if there are several candidates.

2. **Run the script** (deterministic part). It is [scripts/setup.js](./scripts/setup.js),
   next to this file:
   ```
   node <this-skill-dir>/scripts/setup.js --root <project-root> --json
   ```
   If you do not know `<this-skill-dir>`, resolve it from
   `~/.gemini/config/plugins.json` → `<entry.path>/hx-core/skills/setup/scripts/setup.js`,
   or `~/.gemini/config/plugins/hx-core/skills/setup/scripts/setup.js`.
   Options: `--dry-run` (show the plan only), `--force` (rewrite files that
   setup generated before; never a root `AGENTS.md` written by the user).
   The script only creates missing files; it never edits existing ones.

3. **Read the JSON report**: `created`, `skipped`, `checks`, `fills`, `notes`.
   Tell the user in 3–5 lines what was created and what the detected checks are.

4. **Fill the placeholders** (the part that needs code understanding). For each
   item in `fills`:
   - Read the real code first: the build file (`package.json`, `pom.xml`,
     `build.gradle`, `go.mod`, `pyproject.toml`), the top-level folders, one or
     two existing tests, lint/format config. Do not guess.
   - **Existing or large project** (more than ~30 source files, or the fills
     need architectural knowledge): delegate the survey to the `explorer`
     subagent with `invoke_subagent`. Task: "Map this repo for AGENTS.md: main
     folders and what lives in each, entry points, how tests are organised and
     run, lint/format config, generated files or areas that must not be edited.
     Return at most 300 words, every item with a path." Fill from its answer;
     open a file yourself only when its answer is unsure.
   - Replace the `<!-- hx:fill: ... -->` marker with 3–8 concrete lines. Facts
     only (paths, commands, names); no general advice the model already knows.
   - Keep root `AGENTS.md` under 4000 characters.
   If `checks` is empty (unknown stack, or a Python project with no ruff/pytest
   markers), ask the user for the exact test, lint and build commands, then put
   them in `AGENTS.md`, the `project-checks` skill and `.agents/harness.json`
   (`checks`).

5. **If `AGENTS.md` was skipped** (the project already had one): show the user
   a proposed "## Build and test" section with the detected commands and ask
   before adding it. Do not rewrite their file.

6. **Verify** with `/hx-core:doctor` (or `node <this-skill-dir>/../doctor/scripts/doctor.js --root <project-root>`).
   Fix every `[FAIL]`; `[warn] hx-plugins` is about this machine, not the project.

7. **Report** the list of files, the check commands, and ask whether to commit
   `.agents/` + `AGENTS.md` (+ `.gitignore`). Do not commit without a yes.

## What gets created

| File | Purpose |
|---|---|
| `AGENTS.md` | always-on project facts: build/test commands, layout, conventions, do-not list |
| `.agents/harness.json` | manifest: stack, `checks` (used by `/hx-workflows:verify`), generated files |
| `.agents/rules/tests.md` | glob rule for test files (globs per stack: `*.test.*`, `src/test/**`, `*_test.go`, `test_*.py`…) |
| `.agents/rules/typescript.md` | glob rule for `.ts/.tsx` (TypeScript projects only) |
| `.agents/skills/project-checks/SKILL.md` | the project's check commands in order |
| `.agents/hooks.json` + `.agents/hooks/post-edit-lint.js` | PostToolUse: per-file linter on the edited file (eslint, `ruff check`, `gofmt -l`; none for Maven/Gradle). Report only, never edits. Results go to `.agents/state/lint.json`, not stderr (agy shows hook stderr to nobody); the `hx-guard` PreInvocation hook injects them on the next turn, so hx-guard must be enabled to see them |
| `.agents/state/` (gitignored) | notepad, goal, handoff, lint notices |

Detected stacks and the checks they produce (cheapest first):

| Stack | Marker | Checks |
|---|---|---|
| Node | `package.json` | `<pm> run typecheck`, `<pm> run lint`, `<pm> test`, `<pm> run build` (only existing scripts) |
| Maven | `pom.xml` | `./mvnw -q spotless:check` (if spotless), `./mvnw -q test` (`mvn` without wrapper) |
| Gradle | `build.gradle[.kts]` / `settings.gradle[.kts]` | `./gradlew check` (`gradle` without wrapper) |
| Go | `go.mod` | `go build ./...`, `go vet ./...`, `golangci-lint run` (if config), `go test ./...` |
| Python | `pyproject.toml`, `setup.py`, `requirements.txt`… | `[uv run \|poetry run ]ruff check .`, `mypy .`, `pytest -q` (each only when detected) |

## Done when
`doctor` prints `Harness OK` with 0 errors and no `placeholders` warning.
