# Nightly Test Run

## 📋 Overview

Runs your repository's test suite every night, in any language, and files one GitHub issue per root cause of failing tests. Issues are deduplicated deterministically: a failure that already has an open issue gets a "still failing" comment instead of a new issue, and an issue whose tests pass three nights in a row is closed. If the suite cannot even be set up, you get a single `nightly-setup-failure` issue instead.

## ⚡ Triggers

| Trigger | Event | Condition |
|---------|-------|-----------|
| Automatic | `scheduled` | Every day at 03:00 (`0 3 * * *`, workspace time zone), once per code repository (`PerRepository`, `useForCode`) |
| Manual | `/nightly-tests` | Any repository context, no mention required |

## 🎯 Use Cases

- **Catch regressions overnight** in suites too slow or too flaky-sensitive for every PR.
- **One issue per cause, not per test**: ten tests broken by one bug produce one issue.
- **No issue spam**: repeated red nights comment on the existing issue.
- **Self-cleaning backlog**: issues close themselves once their tests stay green.
- **Feed automated fixing**: the `nightly-test-failure` label and the hidden marker in each issue (commit, failing test ids, commands) are what downstream triage and fix workflows read.

## 🔧 Prerequisites

- **Senior Developer** agent configured in Overcut (all agent steps use it).
- Repository access that can create, comment on, label and close issues.
- **Two context parameters**, created at workspace level with default `""` before committing the workflow (empty means "discover it for me"):

  | Key | Meaning |
  |---|---|
  | `nightly_setup_command` | Shell command(s) that install and start what the tests need (dependencies, reporters, services). |
  | `nightly_test_command` | Shell command that runs the whole suite and writes JUnit XML into `"$NIGHTLY_JUNIT_DIR"`. |

  When both are empty, the agent discovers the commands each night (from `AGENTS.md`, `CLAUDE.md`, CI config, manifests, `Makefile`, `README`) and reports them, so you can pin them as settings. Pinning makes nights faster and reproducible.

- **JUnit XML output.** Per-test issues need the test command to write JUnit XML into `"$NIGHTLY_JUNIT_DIR"`. Without it the workflow still works, but files a single "Test suite failing (no per-test results)" issue based on the exit code. Typical flags:

  | Ecosystem | Test command |
  |---|---|
  | pytest | `pytest --junitxml="$NIGHTLY_JUNIT_DIR/pytest.xml"` |
  | Jest | setup `npm ci && npm i --no-save jest-junit`; test `JEST_JUNIT_OUTPUT_DIR="$NIGHTLY_JUNIT_DIR" npx jest --ci --reporters=default --reporters=jest-junit` |
  | Vitest | `npx vitest run --reporter=default --reporter=junit --outputFile.junit="$NIGHTLY_JUNIT_DIR/vitest.xml"` |
  | Go | setup `go install gotest.tools/gotestsum@latest`; test `gotestsum --junitfile "$NIGHTLY_JUNIT_DIR/go.xml" -- ./...` |
  | Maven | `mvn -B test; rc=$?; cp target/surefire-reports/*.xml "$NIGHTLY_JUNIT_DIR"/; exit $rc` |
  | Gradle | `./gradlew test; rc=$?; find . -path '*/build/test-results/*' -name '*.xml' -exec cp {} "$NIGHTLY_JUNIT_DIR"/ \;; exit $rc` |

  The test command's exit code must be the suite's (non-zero when tests fail).

- **Missing tooling** (an SDK version, browsers, system libraries) that is slow or impossible to install in setup: set a per-repository `agentImage` in the repository's Overcut configuration to an image that has it. The default image is `devcontainers/universal:2-linux`.

## 🏗️ Workflow Steps

| # | Step ID | Action | Agent | Max Duration |
|---|---------|--------|-------|--------------|
| 1 | `clone` | `git.clone` | — | 10 min |
| 2 | `discover-commands` | `agent.run` | Senior Developer | 45 min |
| 3 | `run-tests` | `script.run` | — | 125 min (script 7200 s) |
| 4 | `group-failures` | `agent.run` | Senior Developer | 20 min |
| 5 | `list-open-issues` | `agent.run` | Senior Developer | 10 min |
| 6 | `plan-issues` | `script.run` | — | 5 min |
| 7 | `apply-plan` | `agent.run` | Senior Developer | 20 min |

### Flow

```
clone → discover-commands → run-tests → group-failures → list-open-issues → plan-issues → apply-plan
```

The flow is linear and every step runs every night; steps with nothing to do write an empty result and pass through.

**Step 1: Clone Repo** — Full clone of the default branch of `{{trigger.repository.fullName}}`.

**Step 2: Discover Test Commands** — If both settings are set, writes them verbatim. Otherwise discovers the missing command(s), verifies they run in the container (installing tooling and services as needed) and that the test command writes JUnit XML. Never modifies tracked files.

**Step 3: Run Tests** (script, deterministic) — Runs setup, then the test command, from the repo root. Settings win over discovered commands. Reads JUnit XML from a directory it empties first, so stale results are never used; a timed-out run, or a non-zero exit whose XML shows no failing test (for example a module that never compiled), counts as having no per-test results and is judged by exit code. Records status `green`, `red` or `setup-failed`. Always exits 0 for test outcomes.

**Step 4: Group Failures** — On red nights with JUnit results, groups the failing test ids into root causes, each with a title, summary, test ids and a narrowed `causeCommand`. Writes `[]` otherwise.

**Step 5: List Open Nightly Issues** — Collects the open `nightly-test-failure` and `nightly-setup-failure` issues with their exact bodies.

**Step 6: Plan Issues** (script, deterministic) — Computes the exact actions: open, comment, update marker, or close. A cause sharing any failing test with an open issue's marker gets a comment there instead of a new issue. If the causes do not cover every failing test exactly once, it corrects them deterministically instead of failing: unknown ids are dropped, a duplicate id stays in its first cause, empty causes are dropped, and uncovered ids go to an extra `Ungrouped failures` issue that runs the full test command; the step output's `notes` list each correction. The first night that gets past setup closes an open `nightly-setup-failure` issue. Issue bodies list at most 50 test ids (`… and K more`) and stay under GitHub's 65536-character limit.

**Step 7: Apply Issue Plan** — Executes the plan exactly, in order, adding nothing.

### Data Flow

All step files live in `$AGENT_WORKSPACE_PATH/.nightly/`, outside the repository clone:

| File | Written by | Read by |
|---|---|---|
| `commands.json` `{setup, test}` | `discover-commands` | `run-tests` |
| `junit/` (JUnit XML) | test command | `run-tests`, `group-failures` |
| `results.json` `{status, sha, junit, testCode, total, skipped, failing, cases, setup, test, log}` | `run-tests` | `group-failures`, `plan-issues` |
| `causes.json` `[{title, summary, tests, causeCommand}]` | `group-failures` | `plan-issues` |
| `open-issues.json` `[{number, labels, body}]` | `list-open-issues` | `plan-issues` |
| `plan.json` (actions) | `plan-issues` | `apply-plan` |

Each issue body ends with a hidden marker line, `<!-- nightly-test-failure {...} -->`, holding the commit SHA, the cause's test ids, all failing ids, totals, the commands and a green-night counter. The workflow uses it for dedupe and closing. The marker is capped at 60000 characters: on a very red night it drops the all-failing list (`allFailingTruncated: true`, and the fix gate then counts every non-cause failure as new), and if still too long keeps a sorted prefix of the cause's ids (`testsTruncated: true`, and a fix always needs human review).

## 🎨 Customization

- **Schedule** — Change `cronExpression` in the `scheduled` trigger, or add `namePattern` / `excludePattern` to `repositorySelector` to limit which repositories run.
- **Commands** — Pin `nightly_setup_command` / `nightly_test_command` (per workspace or per repository) instead of editing prompts.
- **Discovery hints** — Edit `discover-commands.md` to add your stack's conventions or reporter flags.
- **Grouping style** — Edit `group-failures.md` to change how finely failures are split into causes or how titles and summaries read.
- **Time limits** — Each of setup and test may take up to 55 minutes (`RUN_TESTS_TIMEOUT_MS` in `scripts/run-tests.mjs`; run `python3 scripts/sync-scripts.py nightly-test-run` after editing) within the step's 7200-second limit.
- **Execution engine** — Agent steps run on the Overcut engine. If your workspace model only supports the Claude engine (e.g. a Claude subscription token), switch "Execution engine" to Claude on each agent step.
- **Do not edit** the `script` fields in `workflow.json` by hand; they are generated from `scripts/*.mjs` and the shared `scripts/lib/nightly/` library.

## 🔗 Related Workflows

- [Fix CI](../fix-ci/) — Fix CI failures on pull request branches
- [Auto Root Cause Analysis](../auto-root-cause-analysis/) — Deep-dive RCA for bug issues
- [Test Coverage Gap Analysis](../test-coverage-gap-analysis/) — Find untested code
