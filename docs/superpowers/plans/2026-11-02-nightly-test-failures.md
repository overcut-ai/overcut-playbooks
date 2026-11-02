# Nightly Test Failures Implementation Plan

> Since written, the three playbooks moved under `internal/` (internal-first release, see the design doc): paths below such as `nightly-test-run/` now mean `internal/nightly-test-run/`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three catalog playbooks (Nightly Test Run, Test Failure Triage, Test Failure Fix), one orchestration template, and an installer that writes them into a workspace library, proven live on local Overcut.

**Architecture:** Every deterministic step is a `script.run` whose inline bash runs one Node program from a heredoc. Its source lives as tested `.mjs` files: shared helpers in `scripts/lib/nightly/`, one entry file per step in `<playbook>/scripts/<step-id>.mjs`. A new `scripts/sync-scripts.py` bundles them into `workflow.json`, the same way `sync-prompts.py` handles prompts. Agent steps (discovery, grouping, issue I/O, investigation, PRs) follow `<step-id>.md` prompts as usual. GitHub issue reads and writes go through agents (script steps have no GitHub API token), but every decision about them is computed by a script.

**Tech Stack:** Node ≥18 ESM, `node:` builtins only, tests with `node --test`; Python 3 stdlib for sync and installer, tests with `unittest`; Overcut workflow JSON 1.0.0; GraphQL against local Overcut.

**Spec:** `docs/superpowers/specs/2026-11-02-nightly-test-failures-design.md` (approved, `a0ee192`).

## Global Constraints

- Worktree `~/overcut-playbooks-wt-nightly`, branch `feat/nightly-test-failures`. Commit with `git -c user.name="Eyal Golan" -c user.email=eyal@overcut.ai commit`. Every message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never set git config; never bare `git stash`.
- Folder conventions from `AGENTS.md`: kebab-case; one `<step-id>.md` per agent step; README in the template sections; `instruction: null` for non-agent steps; agent placeholder `{"id":"senior-developer-agent-id","name":"Senior Developer","type":"SeniorDeveloper"}` (as `fix-ci/workflow.json`).
- No npm dependencies anywhere. Node code must run on Node 18 (no `fs.globSync`, no `--experimental` flags).
- Labels (exact): `nightly-test-failure`, `nightly-setup-failure`, `nightly-fix`, `needs-human-review`. Branch prefix `nightly-fix/<issue-number>`. Max 3 open `nightly-fix/*` branches.
- Settings: `nightly_setup_command`, `nightly_test_command`. Workspace-level, default `""`. Empty means discover. Scripts read them from `OC_PARAM_NIGHTLY_SETUP_COMMAND` / `OC_PARAM_NIGHTLY_TEST_COMMAND`, which are only injected when the workflow references the key, so every workflow running tests references both in a step `env`.
- The test command writes JUnit XML under `$NIGHTLY_JUNIT_DIR`. Scripts empty that dir before each run and read it only after the process exits.
- Git in scripts always runs `git -c core.hooksPath=/dev/null`. Diffs use `--no-ext-diff --text`. A quoted path in git output fails closed.
- Marker line (exact prefix): `<!-- nightly-test-failure ` + JSON + ` -->`. Exactly one per body.
- Schedule `0 3 * * *`, `PerRepository`. Slash commands `/nightly-tests` and `/fix-nightly`.
- Compiled extensions (exact list from the spec): `.go .rs .java .kt .kts .scala .groovy .cs .fs .vb .c .h .cc .cpp .cxx .hpp .m .mm .swift .dart .zig .hs .ml .erl .ex .exs .cr .nim .d`. Any other known or unknown extension: unknown counts as compiled.
- Orchestration limits: `maxParallelSteps 1`, `maxRepeatsPerWorkflow 2`, `maxSteps 10`, `idleTimeoutHours 24`, `maxIdleHours 168`. Gate `approve-auto-fix` on Fix.

## Review Focus

1. **JUnit dialects**: nested `<testsuites>`, self-closing `<testcase/>`, `<error>` as well as `<failure>`, entities, CDATA, the same test name under two classnames, several XML files. All must parse to correct statuses (junit.test.mjs, Task 2).
2. **Humans editing issues**: a marker missing, duplicated, quoted in a reply, or with a bad SHA. `parseMarker` returns null, and precheck/rerun exit non-zero with `no baseline marker` instead of guessing (marker.test.mjs, Task 3; precheck test, Task 9).
3. **Stale or missing JUnit**: XML left over from an earlier run is never read (the dir is emptied first). A command that writes no XML takes the `junit:false` path, so its result comes from the exit code alone and is never mixed with stale cases (run-tests.test.mjs, Task 7; exec.test.mjs, Task 6).
4. **Agent groupings that don't partition**: `causes.json` misses a failing id, repeats one, or invents one. `planIssues` throws and the run fails, so nothing is filed wrongly (dedupe.test.mjs, Task 3).
5. **Odd paths**: file names with spaces, unicode or quotes in a fix diff, and renames of test files. Violation or fail-closed, never silently allowed (diff-rules.test.mjs, Task 4).

---

### Task 1: Script bundler

**Files:**
- Create: `scripts/sync-scripts.py`, `scripts/test_sync_scripts.py`, `scripts/lib/nightly/.gitkeep`

**Interfaces:**
- Produces: `python3 scripts/sync-scripts.py <playbook-dir> [--check]`. For each `script.run` step whose id has `<dir>/scripts/<id>.mjs`, it sets `params.script` to the bundle. `--check` exits 1 if any step differs or an entry file has no step. Bundle format (exact):
  ```
  set -euo pipefail
  node --input-type=module - <<'NIGHTLY_JS_EOF'
  <lib files in import order, then the entry file, with import lines and leading `export ` removed>
  await main(process.env);
  NIGHTLY_JS_EOF
  ```
- Bundling rules: an entry or lib file may import only `node:*` builtins, which are kept and hoisted, deduped, and relative `scripts/lib/nightly/*.mjs` files, which are inlined once, recursively, depth-first. It fails if two inlined files declare the same top-level name, if any source contains `NIGHTLY_JS_EOF`, or if any other import appears.

- [ ] **Step 1:** Write the failing tests in `scripts/test_sync_scripts.py`, using a temp playbook dir with a lib `a.mjs` (`export function a(){}`) and entry `scripts/run.mjs` (`import { a } from '../../scripts/lib/nightly/a.mjs'; export async function main(env){ a(); }`):
  - `test_bundles_entry_and_lib`: the script starts with `set -euo pipefail\nnode --input-type=module - <<'NIGHTLY_JS_EOF'`, contains `function a(){}` once, and ends with `await main(process.env);\nNIGHTLY_JS_EOF`.
  - `test_check_detects_drift`: `--check` exits 1 after a manual edit of `params.script`, and 0 after a sync.
  - `test_rejects_duplicate_top_level_name`, `test_rejects_heredoc_delimiter`, `test_rejects_non_builtin_import`: each exits 1 with the name in the message.
  - `test_bundle_runs`: run the bundle with `bash -c` and check exit code 0.
- [ ] **Step 2:** Run `python3 -m unittest scripts/test_sync_scripts.py -v`. Expected: FAIL (module missing).
- [ ] **Step 3:** Implement `scripts/sync-scripts.py`. Write JSON as `sync-prompts.py` does (`indent=2` plus a trailing newline).
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat(scripts): bundle tested step scripts into workflow.json`.

### Task 2: JUnit reader

**Files:** Create `scripts/lib/nightly/junit.mjs`, `scripts/lib/nightly/junit.test.mjs`, `scripts/lib/nightly/fixtures/junit/*.xml`

**Interfaces:**
- Produces:
  - `parseJUnit(xml: string) => TestCase[]`, where `TestCase = {id, name, classname, file: string|null, status: 'passed'|'failed'|'skipped'}`.
  - `id` is `` `${classname}::${name}` ``. When classname is empty, use `` `${file ?? ''}::${name}` ``.
  - A `<failure>` or `<error>` child means failed, and `<skipped>` means skipped.
  - XML entities are decoded in attributes. Text inside CDATA is ignored.
  - `readJUnitDir(dir: string) => TestCase[]` reads every `*.xml` under `dir`, recursively, and throws `Error('no JUnit XML in <dir>')` when there are none.
  - `summarize(cases) => {total, skipped, failing: string[]}`: counts unique ids, and a duplicate id is failed if any copy failed. `failing` is sorted.

- [ ] **Step 1:** Write tests: one fixture each for jest-junit, pytest, gotestsum, Surefire, nested `testsuites`, and self-closing testcase. Assert exact `id`/`status`, e.g. pytest `tests.test_math::test_add` → `failed`. Add `summarize` on duplicate ids → counted once, failed wins. `readJUnitDir` on an empty dir throws `no JUnit XML`.
- [ ] **Step 2:** `node --test scripts/lib/nightly/` → FAIL.
- [ ] **Step 3:** Implement with a small tag scanner over `<testcase …>` / `</testcase>` (no XML library).
- [ ] **Step 4:** `node --test scripts/lib/nightly/` → PASS.
- [ ] **Step 5:** Commit `feat(nightly): JUnit XML reader`.

### Task 3: Marker and issue plan

**Files:** Create `scripts/lib/nightly/marker.mjs`, `marker.test.mjs`, `dedupe.mjs`, `dedupe.test.mjs` (in `scripts/lib/nightly/`)

**Interfaces:**
- `Baseline = {sha, junit: boolean, tests: string[], allFailing: string[], total, skipped, setup, test, causeCommand, greenNights}`.
  - `junit: false` means the nightly had no per-test results. Then `tests`/`allFailing` are `[]`, `total`/`skipped` are `0`, and `causeCommand` is the full test command. This is the spec's "Without JUnit" path, so repos in any language still get issues and fixes.
  - `causeCommand` is the per-cause test command. Nightly's grouping agent writes it, and the Fix verify uses it as the no-JUnit fallback.
  - Plan decision: the spec says "Triage's per-cause command". Triage has no deterministic way to hand data to Fix's scripts, but the marker is in the issue body. The orchestration passes that body to every run as `trigger.issue.body`, captured at label time (`entryTriggerContext`, `orchestration-promotion.service.ts`). The command is still never chosen by the Fix agent.
- `formatMarker(b: Baseline) => string` produces one line.
- `parseMarker(body: string|null|undefined) => Baseline|null`. It returns null unless there is exactly one marker, `sha` is 40 hex characters, `total`/`skipped`/`greenNights` are integers ≥ 0, and the arrays are arrays of strings.
- `planIssues({results, causes, openIssues, setupFailed}) => Action[]`:
  - `results` is `{sha, junit, testCode, total, skipped, failing, cases}` (`cases` from Task 2; `junit: false` when `cases` is null).
  - When `junit` is false and `testCode ≠ 0`, the script itself creates a single cause: `{title:'Test suite failing (no per-test results)', tests:[], causeCommand: test}`, and the agent's causes are ignored. Dedupe for it: an open labelled issue whose marker has `junit:false` → `comment`. Its `greenNights` advance when `testCode === 0`.
  - `causes` is `[{title, summary, tests, causeCommand}]`.
  - `openIssues` is `[{number, labels, body}]`.
  - `setupFailed` is `null` or `{log}`.
  - Actions:
    - `{type:'open', title, body, labels:['nightly-test-failure']}`;
    - `{type:'comment', issue, body}`;
    - `{type:'set-marker', issue, marker}`;
    - `{type:'close', issue, body}`;
    - `{type:'open-setup', title, body, labels:['nightly-setup-failure']}`.
  - Rules:
    - It throws `causes do not partition failing tests: missing [...] duplicate [...] unknown [...]` unless every failing id is in exactly one cause.
    - A cause sharing any test with an open labelled issue's marker → `comment`, plus `set-marker` with `greenNights: 0`.
    - Otherwise → `open`, with a body that has the marker.
    - Each open labelled issue whose tests all passed tonight gets `greenNights + 1`. At 3 it gets `close`, otherwise `set-marker`.
    - `setupFailed` → `comment` on an open `nightly-setup-failure` issue if there is one, else `open-setup`. No other actions.

- [ ] **Step 1:** Write tests:
  - round-trip `formatMarker`/`parseMarker`;
  - `parseMarker` returns null for: no marker, two markers, sha `abc`, negative total, a marker quoted inside a `>` reply line (counts as a second marker if the body also has the real one);
  - `planIssues`:
    - two new causes → two `open`;
    - overlap with issue #7 → `comment` #7 and `set-marker` greenNights 0;
    - issue #8 green tonight with greenNights 2 → `close` #8;
    - a missing / duplicate / unknown id each throws the exact message;
    - setup failure with open setup issue #9 → single `comment` #9.
- [ ] **Step 2:** `node --test scripts/lib/nightly/` → FAIL.
- [ ] **Step 3:** Implement both modules.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(nightly): issue marker and deterministic issue plan`.

### Task 4: File classification and diff rules

**Files:** Create `scripts/lib/nightly/classify.mjs`, `classify.test.mjs`, `diff-rules.mjs`, `diff-rules.test.mjs`

**Interfaces:**
- `COMPILED_EXTENSIONS: ReadonlySet<string>` holds the Global Constraints list.
- `isTestFile(path, junitFiles = new Set()) => boolean` uses the spec patterns: a dir segment `test`, `tests`, `spec` or `__tests__`; a basename matching `*_test.*`, `test_*.*`, `*Test.*`, `*Tests.*`, `*.spec.*` or `*.test.*`; or the path being in `junitFiles`.
- `isProtectedFile(path) => boolean`:
  - a `.github/` prefix, `.gitlab-ci.yml`, `Jenkinsfile`, `.circleci/`, `azure-pipelines.yml`, `bitbucket-pipelines.yml`;
  - test runner configs (`jest.config.*`, `vitest.config.*`, `pytest.ini`, `tox.ini`, `conftest.py`, `phpunit.xml*`, `karma.conf.*`, `.mocharc*`, `playwright.config.*`, `cypress.config.*`);
  - manifests and lockfiles (`package.json`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `requirements*.txt`, `pyproject.toml`, `poetry.lock`, `Pipfile*`, `go.mod`, `go.sum`, `Cargo.toml`, `Cargo.lock`, `pom.xml`, `build.gradle*`, `settings.gradle*`, `gradle.lockfile`, `*.csproj`, `packages.lock.json`, `Gemfile*`, `composer.json`, `composer.lock`, `mix.exs`, `mix.lock`, `Package.swift`, `Package.resolved`, `pubspec.*`).
  - Matching is by basename or prefix, case-sensitive.
- `languageMode(paths: string[]) => 'compiled'|'interpreted'` returns compiled if any extension is in `COMPILED_EXTENSIONS` or is not in the interpreted list (`.py .rb .js .mjs .cjs .ts .tsx .jsx .php .pl .lua .r .sh .bash`).
- `parseNameStatus(out: string) => {status, path, oldPath?}[]` reads `git diff --name-status -M -z`. Use `-z`, so paths are never quoted. It throws on a malformed record.
- `parseNumstat(out: string) => {path, added, deleted, binary}[]` reads `git diff --numstat -M -z`.
- `diffRules({nameStatus, numstat, isTest, isProtected}) => string[]`, one violation string per file:
  - `test file deleted: <p>`;
  - `test file renamed: <old> -> <new>`;
  - `existing test lines changed: <p> (-N)`;
  - `protected file changed: <p>`;
  - `binary test file changed: <p>`.

- [ ] **Step 1:** Write tests:
  - `isTestFile` on `src/app_test.go`, `tests/unit/foo.py`, `Foo.Tests/BarTests.cs`, `web/a.spec.ts` → true; `src/testing_utils.py` → false; a junitFiles hit → true;
  - `languageMode(['a.py','b.ts'])` → interpreted; `(['a.py','x_test.go'])` → compiled; `(['a.weird'])` → compiled;
  - `diffRules`:
    - a test file with numstat `-0` and additions → no violation;
    - `-1` → violation;
    - deletion, rename, protected `package.json`, and binary test file each → their exact string;
  - `parseNameStatus` on a path with spaces, unicode, `"` → exact path.
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(nightly): language-agnostic test-file and diff rules`.

### Task 5: Result comparison

**Files:** Create `scripts/lib/nightly/compare.mjs`, `compare.test.mjs`

**Interfaces:**
- `compareResults({baseline, fixCases, causeIds, rerunFailed}) => {ok, reasons}`.
  - `rerunFailed: (ids) => string[]` returns the ids still failing after one re-run.
  - Reasons (exact):
    - `cause test still failing: <id>`;
    - `new failure: <id>`, for failing ids not in `baseline.allFailing`, kept only if they also fail in `rerunFailed`;
    - `fewer tests than baseline: <n> < <total>`;
    - `more skipped than baseline: <n> > <skipped>`.
- `redCheck({unmodifiedCases, overlayCases, causeIds}) => {ok, reasons, newIds}`.
  - `newIds` are the overlay ids not among the unmodified ids.
  - Reasons: `new test passes on old code: <id>` and `cause test passes on old code: <id>`.
  - An id absent from the overlay counts as failing, because the file errored.

- [ ] **Step 1:** Write tests:
  - a clean fix → ok;
  - a cause still failing;
  - another cause's test still failing but in allFailing → ok;
  - a new failure that passes on re-run → ok, and one that fails on re-run → reason;
  - total drop and skipped rise → reasons;
  - `redCheck`: a new test passing on old → reason; all failing → ok and `newIds` exact.
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(nightly): fix result comparison and old-code red check`.

### Task 6: Process and git helpers

**Files:** Create `scripts/lib/nightly/exec.mjs`, `exec.test.mjs`

**Interfaces:**
- `sh(cmd, {cwd, env, timeoutMs}) => {code, out}` runs `spawnSync('bash', ['-c', cmd])`, with stdout and stderr merged and a 1 MB tail.
- `git(args: string[], cwd) => string` runs git with `-c core.hooksPath=/dev/null` and throws on a non-zero exit with stderr.
- `repoDir(env) => string` returns `join(env.AGENT_WORKSPACE_PATH, env.REPO_FULL_NAME.split('/')[1])`, after asserting that `.git` exists. This is the convention in `overcut-e2e-tests/src/sandbox/precheck.ts` `findRepoDir`.
- `runSuite({dir, setup, test, junitDir, timeoutMs}) => {setupCode, testCode, cases|null, log}`:
  - It empties and recreates `junitDir`.
  - It runs `setup` if it isn't empty; a non-zero exit returns early with `cases: null`.
  - It runs `test` with `NIGHTLY_JUNIT_DIR=junitDir`, then `readJUnitDir`. If that throws, the result is `cases: null`.
- `outputJson(obj)` writes to `process.env.OC_OUTPUT_FILE` when it is set.

- [ ] **Step 1:** Write tests, using a temp git repo with a `.git/hooks/pre-commit` that `exit 1`s, and a fake test command that writes a fixture XML into `$NIGHTLY_JUNIT_DIR`:
  - `git(['commit',...])` succeeds despite the hook;
  - `runSuite` with a stale XML pre-placed in junitDir and a command writing none → `cases: null`;
  - setup exit 3 → `setupCode 3`, test not run.
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5:** Commit `feat(nightly): process and git helpers`.

### Task 7: Nightly Test Run playbook

**Files:**
- Create in `nightly-test-run/`: `README.md`, `workflow.json`, `discover-commands.md`, `group-failures.md`, `list-open-issues.md`, `apply-plan.md`, `scripts/run-tests.mjs`, `scripts/run-tests.test.mjs`, `scripts/plan-issues.mjs`, `scripts/plan-issues.test.mjs`

**Interfaces:**
- Steps, in order (agents use the placeholder agent):
  1. `clone`: `git.clone` with `{{trigger.repository.fullName}}`, no depth.
  2. `discover-commands` (agent): if both settings are set, write them verbatim. Otherwise discover the commands and confirm they run. It writes `.nightly/commands.json` `{setup, test}`; `test` must write JUnit to `$NIGHTLY_JUNIT_DIR`.
  3. `run-tests` (script).
  4. `group-failures` (agent): when status is red, write `.nightly/causes.json`; otherwise write `[]`.
  5. `list-open-issues` (agent): write `.nightly/open-issues.json` with the repo's open issues labelled `nightly-test-failure` or `nightly-setup-failure`, using the exact body.
  6. `plan-issues` (script).
  7. `apply-plan` (agent): execute `.nightly/plan.json` exactly, adding nothing. Quit the workflow if the plan is empty.
- `run-tests.mjs` `main(env, deps = {runSuite, git, outputJson})`:
  - Settings come from `OC_PARAM_*` when set, else from `commands.json`.
  - It writes `.nightly/results.json` `{status, sha, total, skipped, failing, cases, setup, test, log}`.
  - Status:
    - `setup-failed` when setupCode ≠ 0;
    - `red` when failing is non-empty, or when cases is null and testCode ≠ 0;
    - otherwise `green`.
  - Also record `junit: cases !== null` and `testCode`.
  - It always exits 0, and outputs `{status, total, failing: n}`.
- `plan-issues.mjs` `main(env)` reads the three files and calls `planIssues`, with `setupFailed` derived from status `setup-failed`. It writes `.nightly/plan.json` and outputs `{actions: n}`.
- `workflow.json`:
  - Triggers: `scheduled` with `schedule:{cronExpression:'0 3 * * *'}` and `scheduleContextSettings` PerRepository (use the exact shape from `WorkflowDefinition.ts` on `next`); and `manual` `/nightly-tests` with `requireMention: false`.
  - Script steps have env `REPO_FULL_NAME: "{{trigger.repository.fullName}}"`, `SETUP: "{{params.nightly_setup_command}}"` and `TEST: "{{params.nightly_test_command}}"`, which also makes `OC_PARAM_*` appear.
  - `timeoutSeconds` 7200 on run-tests.

- [ ] **Step 1:** Write tests with an injected `runSuite`:
  - each of the three statuses;
  - a stale XML pre-placed and a command that writes none and exits 1 → `red` with `junit:false`, and the stale cases are not used (Review Focus 3);
  - `plan-issues` on a `junit:false` red result → single `open` whose marker has `junit:false`, and the agent's causes are ignored;
  - a `setup-failed` result → single `open-setup` action.
- [ ] **Step 2:** `node --test nightly-test-run/scripts/` → FAIL.
- [ ] **Step 3:** Implement the entry files, the four prompts (each states its exact output file and format and says when to quit the workflow) and the README (template sections; Prerequisites lists the two settings, JUnit flags per ecosystem, and `agentImage` for missing tooling).
- [ ] **Step 4:** Tests PASS. Then run:
  - `python3 scripts/sync-prompts.py nightly-test-run`;
  - `python3 scripts/sync-scripts.py nightly-test-run`;
  - `python3 scripts/sync-scripts.py nightly-test-run --check` → exit 0;
  - `python3 -c "import json;json.load(open('nightly-test-run/workflow.json'))"`.
- [ ] **Step 5:** Commit `feat(nightly-test-run): scheduled test run that files one issue per root cause`.

### Task 8: Test Failure Triage playbook

**Files:** Create in `test-failure-triage/`: `README.md`, `workflow.json`, `classify-failure.md`, `scripts/rerun.mjs`, `scripts/rerun.test.mjs`

**Interfaces:**
- Steps:
  1. `clone`.
  2. `rerun` (script).
  3. `classify-failure` (agent): read `.nightly/rerun.json` and the code. Decide fixable / flaky / environment / needs-human, post one brief comment, and add the label `flaky`, `environment` or `needs-human` when not fixable. Call `task_completed` with `success:false` when not fixable, so the supervisor stops; `quitWorkflow` is not needed because it is the last step.
- `rerun.mjs` `main(env, deps)`:
  - `parseMarker(env.ISSUE_BODY)`; null → exit 1 `no baseline marker`.
  - Check out `marker.sha` (`git fetch origin <sha>` then `git checkout --detach <sha>`).
  - Run `runSuite` with the marker's setup and test commands.
  - Write `.nightly/rerun.json` `{stillFailing, nowPassing, cases: null|…}`, where `stillFailing`/`nowPassing` are the marker's `tests` split by the rerun.
  - When `junit` is false, it runs `causeCommand` instead and writes `{stillFailing: testCode !== 0, nowPassing: testCode === 0}` as booleans.
- `workflow.json` triggers: `manual` `/triage-nightly` only (the orchestration starts it). Env `ISSUE_BODY: "{{{trigger.issue.body}}}"` (triple braces: raw).

- [ ] **Step 1:** Write tests: no marker → exit 1 with the message; all still failing; one now passing.
- [ ] **Step 2:** → FAIL.
- [ ] **Step 3:** Implement the script, prompt and README.
- [ ] **Step 4:** Tests PASS; sync both; `--check` 0; JSON valid.
- [ ] **Step 5:** Commit `feat(test-failure-triage): confirm and classify one root cause`.

### Task 9: Test Failure Fix playbook

**Files:** Create in `test-failure-fix/`: `README.md`, `workflow.json`, `investigate.md`, `implement.md`, `open-pr.md`, `scripts/precheck.mjs`, `scripts/verify.mjs`, `scripts/assert-head.mjs`, and a `.test.mjs` for each

**Interfaces:**
- Steps:
  1. `clone`.
  2. `precheck` (script).
  3. `investigate` (agent).
  4. `implement` (agent): commit on the current branch, never push.
  5. `verify` (script).
  6. `open-pr` (agent): draft PR from `outputs.verify.output.branch`. Add label `nightly-fix`, plus `needs-human-review` when `verified` is false. Link the issue. The body lists `checks` and `reasons` verbatim.
  7. `assert-head` (script).
- `precheck.mjs`:
  - `parseMarker(ISSUE_BODY)`; null → exit 1.
  - `branch = nightly-fix/<ISSUE_NUMBER>`.
  - `git ls-remote --heads origin 'nightly-fix/*'`: skip if `branch` exists, or if 3 or more such branches exist (output `{skip:true, reason}`, then exit 1 so the supervisor sees it).
  - Fetch and `git checkout -b <branch> <sha>`.
  - Output `{branch, base: sha}`.
- `verify.mjs` `main(env, deps)`, in order (exact):
  1. Pin `SHA = git rev-parse HEAD`. It must differ from base, the tree must be clean, and `git merge-base --is-ancestor base SHA` must hold.
  2. Diff: name-status and numstat between base and SHA → `diffRules`. `junitFiles` comes from the fix-run cases' `file`.
  3. Fix run: `runSuite` at SHA.
  4. Language mode: `languageMode` over the marker test files and the test files the fix touches. Marker test files are taken from fix-run cases whose id is in `marker.tests` and have a `file`; ids without a file contribute nothing.
  5. If interpreted: two worktrees at base. One is unmodified. The other overlays only the test-file changes, via `git checkout SHA -- <test paths>`. Run `runSuite` on each and call `redCheck`.
  6. Choose by `marker.junit`:
     - `junit: true`:
       - the fix run must have cases, otherwise reason `no JUnit from fix run (build failed?)` → reject;
       - then `compareResults`, with `rerunFailed` running the test command again at SHA.
     - `junit: false`:
       - run `marker.causeCommand` at SHA; it must exit 0;
       - if interpreted, it must also exit non-zero in the overlay worktree;
       - set `needsHuman`.
  7. HEAD and the tracked tree must be unchanged after the runs.
  8. Any Layer A reason or red-check reason → output `{verified:false, reasons}` and exit 1, with no push.
  9. Otherwise push `SHA:refs/heads/<branch>` and output `{verified: diffViolations.length===0 && !needsHuman, needsHuman, reasons: diffViolations, checks, branch, sha}`. Exit 0.
- `assert-head.mjs`: `git ls-remote origin refs/heads/<branch>` must equal `SHA` (40 hex), otherwise exit 1.
- `workflow.json` triggers: `manual` `/fix-nightly-cause` only. Env on script steps: `ISSUE_BODY` (triple braces), `ISSUE_NUMBER: "{{trigger.issue.number}}"`, `REPO_FULL_NAME`, `SETUP`/`TEST` params. verify `timeoutSeconds` 14400.

- [ ] **Step 1:** Write tests against temp git repos, with a bare origin and a fake test command that writes JUnit from the source under test:
  - Interpreted (`.py` names): a correct fix with a new test → verified; a new test that passes on old code → exit 1 `new test passes on old code`.
  - Compiled (`.go` names): no worktrees created (assert via `deps`), correct fix → verified.
  - Weakening by editing an existing test line → pushed, `verified:false`, reason `existing test lines changed`.
  - A deleted test → `fewer tests than baseline` exit 1.
  - `junit:true` marker but the fix run writes no XML (simulated compile error) → exit 1 `no JUnit from fix run (build failed?)`.
  - `junit:false` marker, causeCommand passes at SHA → pushed, `needsHuman:true`.
  - `package.json` changed → needs human.
  - Hook installed in the repo is not run.
  - precheck: 3 open branches → skip; existing branch → skip; no marker → exit 1.
  - assert-head mismatch → exit 1.
- [ ] **Step 2:** `node --test test-failure-fix/scripts/` → FAIL.
- [ ] **Step 3:** Implement the scripts, prompts and README. The README states the threat model: the check stops accidental and prompt-injected weakening; production code could still fake JUnit, so the draft PR review is the final gate.
- [ ] **Step 4:** Tests PASS; sync both; `--check` 0; JSON valid.
- [ ] **Step 5:** Commit `feat(test-failure-fix): gated fix with deterministic verify`.

### Task 10: Orchestration template, installer, catalog listing

**Files:**
- Create: `orchestrations/nightly-test-failures-to-fix/orchestration.json`, `orchestrations/nightly-test-failures-to-fix/README.md`, `scripts/install-library-templates.py`, `scripts/test_install_library_templates.py`
- Modify: root `README.md` (catalog entries for the 3 playbooks + the orchestration)

**Interfaces:**
- `orchestration.json`:
  - `{name, goal, instructions, allowedWorkflows:[{name}], entryTriggers, gates, limits, autoApprove}`, using workflow **names**, which the installer resolves to ids.
  - Goal, instructions, gates and limits are copied from the spec.
  - Entry triggers: `issue_labeled` with `conditions: {combinator:'and', rules:[{field:'context.trigger.label', operator:'equals', value:'nightly-test-failure'}]}`, `firstWorkflow: "Test Failure Triage"`; and `manual` `/fix-nightly`.
- Installer CLI: `python3 scripts/install-library-templates.py --api-url URL --workspace-id ID --agent-id ID [--dry-run]`, with the token in env `OVERCUT_API_TOKEN`. Operations, all verified by introspection of local Overcut (2026-11-02):
  - `libraryProject(workspaceId)`;
  - `contextParameters(where:{projectId})`, then `createContextParameter(input:{key, defaultValue:"", description, projectId: null})` for each missing key;
  - `workflows(where:{projectId:{equals}, name:{equals}})`, then `createWorkflow(data:{name, definition, project:{connect:{id}}})` or `updateWorkflow(where:{id}, data:{definition})`, with `senior-developer-agent-id` replaced by `--agent-id`; then `commitWorkflow(data:{workflowId, message})`, where "No changes to commit" counts as success;
  - the same flow for orchestrations with `createOrchestration`, `updateOrchestration` and `commitOrchestration`.
  - Pure functions under test: `build_orchestration_definition(template, name_to_id) -> dict` (it raises if a name is unknown) and `substitute_agent(definition, agent_id) -> dict`.
- What introspection verified: the operation names and their top-level arguments, plus the fields of `OrchestrationCreateInput`, `WorkflowCreateInput`, `CreateContextParameterInput`, `Commit*Input` and `ContextParameterWhereInput`. The nested shapes written above are not verified, namely `project:{connect:{id}}`, the `{equals}` filters, and `OrchestrationDefinitionInput`. Before Step 3, introspect them on local Overcut and use the exact field names. Do not guess.

- [ ] **Step 1:** Write tests: name resolution; an unknown name raises; every agent placeholder is replaced; `--dry-run` prints the operations without HTTP (mock `urlopen`).
- [ ] **Step 2:** `python3 -m unittest scripts/test_install_library_templates.py -v` → FAIL.
- [ ] **Step 3:** Implement. Validate every GraphQL document against the local schema (introspection plus `graphql` `validate`, as done earlier with `validate-gql.mts`).
- [ ] **Step 4:** Tests PASS; validation shows 0 errors.
- [ ] **Step 5:** Commit `feat: orchestration template and library installer`.

### Task 11: Live verification on local Overcut

**Files:** none in the repo, except fixes found here, each a separate commit with its own test.

- [ ] **Step 1:** Eyal creates two private throwaway repos: one Python (pytest, `--junitxml`) and one Go (gotestsum). Each has a passing suite. The Overcut GitHub app is installed on both. Claude cannot create repos.
- [ ] **Step 2:** Run the installer against the local dev workspace. Library → Workflow templates shows 3 entries and Orchestration templates shows 1. Install all four into the dev project. Activate the orchestration.
- [ ] **Step 3:** Prove the spec's checklist, citing a run id for each:
  1. Manual `/nightly-tests` on a green repo files nothing.
  2. Seed 2 independent bugs → 2 labelled issues → 2 instances. This also proves that a label added by the bot fires `issue_labeled`; if it doesn't, switch the entry to `issue_opened` with a `context.issue.labels` condition and re-test.
  3. Rerun → comments, no new issues.
  4. The gate pauses; approval → Fix → verified draft PR on each repo.
  5. Remove the gate → Fix runs unattended.
  6. Seed a fix that edits a test line → `needs-human-review`.
  7. Break setup → `nightly-setup-failure` issue and no instance.
  8. In the Python run, verify logs show the old-code run; in the Go run, they show none.
  9. `node --version` in the pod is ≥ 18, and `sudo` works.
- [ ] **Step 4:** Restore the cron to `0 3 * * *` if it was changed for testing. Record the run ids in the PR description draft.
