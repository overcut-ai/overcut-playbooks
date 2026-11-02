# Test Failure Triage

## 📋 Overview

Triages one `nightly-test-failure` issue filed by the [Nightly Test Run](../nightly-test-run/). It re-runs the issue's failing tests at the exact commit the nightly run tested, then an agent classifies the failure as **fixable**, **flaky**, **environment** or **needs-human** and posts one `## Nightly triage: <classification>` comment. Fixable issues get a fix brief that an automated fix can work from. The other three classifications get the matching label, and the run ends unsuccessfully so an orchestration stops there.

## ⚡ Triggers

| Trigger | Event | Condition |
|---------|-------|-----------|
| Manual | `/triage-nightly` | Comment on a `nightly-test-failure` issue, no mention required |

There is no automatic trigger. An orchestration starts the workflow on each new `nightly-test-failure` issue (the issue is passed as `trigger.issue`). The issue body is read when the run starts, so its hidden marker must already be there.

## 🎯 Use Cases

- **Confirm before fixing**: re-run the failing tests once so that a failure that does not reproduce is not handed to a fix workflow.
- **Separate fixable bugs from noise**: flaky tests and broken environments get labeled for a person instead of producing a doomed fix attempt.
- **Write the fix brief**: evidence, suspected files, what to change and which tests prove it, in one comment.

## 🔧 Prerequisites

- **Senior Developer** agent configured in Overcut (used by `classify-failure`).
- Repository access that can read issues, comment on them, and create and apply labels.
- Issues filed by the **Nightly Test Run**. The workflow needs the hidden marker line (`<!-- nightly-test-failure {...} -->`) at the end of the issue body: it holds the tested commit, the cause's test ids and the exact setup, test and cause commands. Without it the run fails at the `rerun` step. The issue must also carry the `nightly-test-failure` label.
- The same container image the nightly run uses (set a per-repository `agentImage` if the suite needs tooling the default image lacks), so that the re-run sees the same environment.

## 🏗️ Workflow Steps

| # | Step ID | Action | Agent | Max Duration |
|---|---------|--------|-------|--------------|
| 1 | `clone` | `git.clone` | — | 10 min |
| 2 | `rerun` | `script.run` | — | 125 min (script 7200 s) |
| 3 | `classify-failure` | `agent.run` | Senior Developer | 30 min |

### Flow

```
clone → rerun → classify-failure
```

**Step 1: Clone Repo** — Clones `{{trigger.repository.fullName}}`.

**Step 2: Re-run Failing Tests** (script, deterministic) — Fails with `issue is not labelled nightly-test-failure` unless the trigger issue has that label (env `ISSUE_LABELS`; only triage+ users can add labels, so this shows the marker came through a trusted path), before anything runs. Reads the marker from the issue body; fails the run with `no baseline marker` if it is missing or malformed. Fetches the marker's commit if the clone lacks it and checks it out (detached, git hooks off); fails with `cannot check out baseline <sha>` if it cannot. Runs the marker's commands only, never re-discovering them:
- **With JUnit** (`junit: true`): setup, then the full test command. Each of the cause's tests is still failing (failed, skipped or absent from the XML) or now passing. If there are no per-test results (no XML, a timeout, or a non-zero exit with no failing test in the XML), `rerunError` is set and every test counts as still failing.
- **Without JUnit**: setup, then `causeCommand`; still failing means a non-zero exit.
- **Setup fails**: records `setupFailed`, the exit code and the log tail.
- **Truncated marker**: if the marker kept only a prefix of the cause's ids (`testsTruncated`), `rerun.json` says so with `testsTruncated: true`; only that prefix is judged.

Exits 0 for every test outcome, so the agent always classifies.

**Step 3: Classify Failure** — Reads the re-run result, the issue and the code at the tested commit, and picks one classification: everything now passing is `flaky`; a setup failure or `rerunError` is `environment` unless the code explains it; otherwise it judges from the errors and code. Posts one comment (evidence, suspected files, and for `fixable` a **Fix brief**: what is wrong, where, what the fix should change, which tests prove it and the command that runs them). Adds the `nightly-flaky`, `nightly-environment` or `nightly-needs-human` label when not fixable, creating it if needed. Finishes with `success: true` for fixable and `success: false` otherwise. It never edits code, pushes, or changes the issue body.

### Data Flow

| Data | Written by | Read by |
|---|---|---|
| Issue body marker `{sha, junit, tests, allFailing, total, skipped, setup, test, causeCommand, greenNights}` | Nightly Test Run | `rerun` (env `ISSUE_BODY`), `classify-failure` |
| `$AGENT_WORKSPACE_PATH/.nightly/junit/` (JUnit XML of the re-run) | test command | `rerun`, `classify-failure` |
| `$AGENT_WORKSPACE_PATH/.nightly/rerun.json` `{junit, sha, testCode, log, stillFailing, nowPassing, cases, rerunError?, setupFailed?, setupCode?, testsTruncated?}` | `rerun` | `classify-failure` |
| Step output `{junit, stillFailing, nowPassing, rerunError?, setupFailed?, testsTruncated?}` (counts with JUnit, booleans without) | `rerun` | run logs |
| `## Nightly triage: <classification>` comment, label | `classify-failure` | people, the fix workflow |
| `task_completed` `success` and message (`<classification>: <reason>`) | `classify-failure` | the orchestration |

## 🎨 Customization

- **Classification rules and comment format** — Edit `classify-failure.md`. Keep the `## Nightly triage: <classification>` heading and the `success` rule if an orchestration or fix workflow depends on them.
- **Label names** — Change them in `classify-failure.md` (and in any orchestration that filters on them).
- **Time limits** — Each of setup and test may take up to 55 minutes (`RERUN_TIMEOUT_MS` in `scripts/rerun.mjs`; run `python3 scripts/sync-scripts.py internal/test-failure-triage` after editing) within the step's 7200-second limit.
- **Execution engine** — Agent steps run on the Overcut engine. If your workspace model only supports the Claude engine (e.g. a Claude subscription token), switch "Execution engine" to Claude on each agent step.
- **Do not edit** the `script` field in `workflow.json` by hand; it is generated from `scripts/rerun.mjs` and the shared `scripts/lib/nightly/` library.

## 🔗 Related Workflows

- [Nightly Test Run](../nightly-test-run/) — Files the issues this workflow triages
- [Fix CI](../../fix-ci/) — Fix CI failures on pull request branches
- [Auto Root Cause Analysis](../../auto-root-cause-analysis/) — Deep-dive RCA for bug issues
