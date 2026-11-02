# Test Failure Fix

## 📋 Overview

Fixes one root cause of failing nightly tests. Agents investigate the cause and commit a fix on `nightly-fix/<issue>`. A deterministic verify script, the safety gate, then re-runs the suite against the nightly baseline and checks the diff for test weakening, in any language. Only a fix that passes is pushed and opened as a **draft** PR labelled `nightly-fix`, plus `needs-human-review` when a person must look closer.

## ⚡ Triggers

| Trigger | Event | Condition |
|---------|-------|-----------|
| Manual | `/fix-nightly-cause` | Comment on a `nightly-test-failure` issue, no mention required |

There is no automatic trigger. An orchestration starts the workflow on an issue after [Test Failure Triage](../test-failure-triage/) classified it `fixable`, and may retry it once if verify rejects the fix. The issue is passed as `trigger.issue`; its body is read when the run starts.

## 🎯 Use Cases

- **Fix nightly regressions automatically** when the cause is clear, without letting an AI fix weaken the tests that caught it.
- **One cause, one PR**: each issue gets at most one fix branch, and at most three fix branches are open at a time.
- **Review-ready PRs**: the PR body lists exactly what the verify script checked, and why it needs a person if it does.

## 🔧 Prerequisites

- **Senior Developer** agent configured in Overcut (used by `investigate`, `implement` and `open-pr`).
- Repository access that can push branches, create pull requests, and create and apply labels.
- Issues filed by the [Nightly Test Run](../nightly-test-run/) and triaged by [Test Failure Triage](../test-failure-triage/): the issue body must end with the hidden marker line (`<!-- nightly-test-failure {...} -->`), and the fix brief is the latest comment starting with `## Nightly triage: fixable`.
- The same container image as the nightly run, so verify sees the same environment.
- Optional: the `nightly_setup_command` and `nightly_test_command` context parameters used by the Nightly Test Run. When set, verify uses them; otherwise it uses the commands stored in the marker.

## 🏗️ Workflow Steps

| # | Step ID | Action | Agent | Max Duration |
|---|---------|--------|-------|--------------|
| 1 | `clone` | `git.clone` | — | 10 min |
| 2 | `precheck` | `script.run` | — | 12 min (script 600 s) |
| 3 | `investigate` | `agent.run` | Senior Developer | 45 min |
| 4 | `implement` | `agent.run` | Senior Developer | 90 min |
| 5 | `verify` | `script.run` | — | 245 min (script 14400 s) |
| 6 | `open-pr` | `agent.run` | Senior Developer | 15 min |
| 7 | `assert-head` | `script.run` | — | 5 min (script 120 s) |

### Flow

```
clone → precheck → investigate → implement → verify → open-pr → assert-head
```

A script that exits non-zero fails the run, so a skipped precheck or a rejected fix stops before anything is pushed.

**Step 1: Clone Repo** — Clones `{{trigger.repository.fullName}}`.

**Step 2: Precheck** (script) — Reads the marker; fails with `no baseline marker` if it is missing. Skips (output `{skip: true, reason}`, exit 1) when `nightly-fix/<issue>` already exists on origin or 3 `nightly-fix/*` branches are open. Otherwise fetches the marker's commit and creates `nightly-fix/<issue>` there. Output: `{branch, base}`.

**Step 3: Investigate** — Reads the issue and Triage's fix brief, confirms the defect in the code, and writes `$AGENT_WORKSPACE_PATH/.nightly/investigation.md`. No code changes. Quits the workflow if there is no `## Nightly triage: fixable` comment.

**Step 4: Implement** — Makes the smallest correct fix and commits it on the current branch. It never pushes, never edits an existing test file (new tests go in new files), and never touches CI config, test runner config, dependency manifests or lockfiles.

**Step 5: Verify** (script, deterministic) — The safety gate. Git hooks are off for every git call. In order:

1. **Pin**: `SHA = HEAD`. It must differ from the base, descend from it, and have no uncommitted tracked changes. Untracked and ignored files are deleted, so the run tests exactly what will be pushed. Before any repository code runs, verify also reads the diff (`git diff --name-status` / `--numstat -M -z --no-ext-diff`, base to `SHA`), origin's push URL and the git URL rewrite rules (`url.*.insteadOf`).
2. **Fix run**: setup and the full test command at `SHA`.
3. **Diff rules** on the diff read at pin time. Test files are paths matching common conventions in any language (`test/`, `tests/`, `spec/`, `__tests__/`, `*_test.*`, `test_*.*`, `*Test.*`, `*Tests.*`, `*.spec.*`, `*.test.*`) or files the fix run's JUnit names as test sources. Existing test files are immutable: changing, deleting or renaming one, or changing a binary test file, is a violation. So is any change to a protected file (CI config, test runner config, dependency manifests, lockfiles).
4. **Language mode**: decided by test **source** files only.
   - **Cause files** are the cause's test files: the JUnit `file` attribute of the cause's tests or, without JUnit, code-file arguments of the cause command such as `tests/test_a.py`. When cause files are known, they alone decide. Any compiled or unknown extension among them means **compiled**.
   - **Otherwise** (for example pytest's default XML has no `file` attribute), the test source files the fix adds or changes decide. The run is **interpreted** if any of them has an interpreted extension, and **compiled** only if all are compiled or there are none.
   - **Ignored**: non-code files such as fixtures (`tests/fixtures/data.json`) unless the JUnit XML names them, and deleted or renamed files.
   - **Mixed**: if the cause files and touched test files include both compiled and interpreted ones, the PR needs human review, with the reason `mixed-language test files: <paths>`. Verification still runs in full.
5. **Old-code red check** (interpreted only): two temporary worktrees at the base commit, one unmodified and one with the fix's added and modified test files copied in. The cause's tests and every new test must fail there; a new test that passes on old code does not catch the bug. Compiled languages skip this, because new tests may not compile against old code; the nightly baseline and Triage's re-run are the "fails before" evidence.
6. **Results** against the baseline:
   - With JUnit: the fix run must produce JUnit (none means the build failed), the cause's tests must pass, no test may fail that was not failing in the baseline (a new failure is re-run once, so a flake does not reject a good fix), there may be no fewer tests and no more skipped tests than in the baseline.
   - Without JUnit: the marker's cause command must exit 0 at `SHA` (and, when interpreted, non-zero on old code). The PR always needs human review.
7. **Tree and config check**: HEAD and tracked files must be unchanged after all runs (otherwise `tracked files changed during verification`). Git config that can redirect, intercept or re-authenticate network operations must be unchanged in every scope git reports: `url.*`, `remote.*`, `http.*`, `https.*`, `credential.*`, `include.*`, `includeIf.*`, `protocol.*`, `core.sshCommand`, `core.gitProxy` and `core.askPass` (otherwise `git config changed during verification`). Any other repo-local config change made by setup or test, such as husky setting `core.hooksPath` or `git submodule init` writing `submodule.*`, is not a rejection: verify writes the repo-local config file back to its pin-time content before the push and records `restored repo-local git config changed by setup/test (non-network keys)` in its checks. Hooks written during the runs never execute, because every git call the gate makes (including the push and the later `ls-remote`) sets `core.hooksPath=/dev/null`.
8. A failure in steps 5-7 (or any error) rejects the fix: output `{verified: false, reasons}` (the failures, then any diff-rule violations and the mixed-language reason), exit 1, nothing pushed. Otherwise `SHA` is pushed to the push URL recorded at pin time, to `nightly-fix/<issue>` (only if the branch still does not exist), and the output is `{verified, needsHuman, reasons, checks, branch, sha, pushUrl}`, where `pushUrl` is that URL with any `user:token@` part removed from an http(s) URL (step outputs are stored and shown in the UI). Diff-rule violations and mixed-language test files do not block the push; they set `needsHuman` and are listed in `reasons`. `verified` is true only with no violations and a JUnit baseline.

**Step 6: Open Draft PR** — Opens a draft PR from the fix branch into the default branch, titled `fix: <issue title>`, with `Fixes #<issue>`, a summary, and the verify `checks` and `reasons` verbatim. Labels: `nightly-fix`, plus `needs-human-review` when `needsHuman` is true.

**Time budget**: verify stops after 235 minutes in total (the step limit is 245). Each setup or test command may take up to 55 minutes, as in the nightly run, or what is left of the budget if that is less. When the budget runs out the fix is rejected with `verification time budget exhausted`.

**Step 7: Assert PR Head** (script) — The fix branch at the push URL verify used must still point at exactly the verified `SHA`, so nothing pushed after verify can ride along in the PR. It reads the stripped `pushUrl`, so authentication comes from the git credential helper; if that fails, the step fails. Neither URL is ever logged.

### Data Flow

| Data | Written by | Read by |
|---|---|---|
| Issue body marker `{sha, junit, tests, allFailing, total, skipped, setup, test, causeCommand, greenNights}` | Nightly Test Run | `precheck`, `verify` (env `ISSUE_BODY`), agents |
| `## Nightly triage: fixable` comment (fix brief) | Test Failure Triage | `investigate`, `implement` |
| Step output `{branch, base}` | `precheck` | `verify` (env `BRANCH`, `BASE`), `assert-head` |
| `$AGENT_WORKSPACE_PATH/.nightly/investigation.md` | `investigate` | `implement` |
| Fix commit on `nightly-fix/<issue>` (local) | `implement` | `verify` |
| `$AGENT_WORKSPACE_PATH/.nightly/junit*/` (JUnit XML of each run) | test command | `verify` |
| Step output `{verified, needsHuman, reasons, checks, branch, sha, pushUrl}` | `verify` | `open-pr`, `assert-head` (env `SHA`, `PUSH_URL`), the orchestration |
| Draft PR, labels | `open-pr` | reviewers |

### Threat model

The gate stops **accidental and prompt-injected test weakening**: edited, deleted, renamed or skipped tests, fewer or more-skipped tests, new tests that do not catch the bug, changed CI or runner config, and a fix that leaves the cause failing or breaks other tests. The agent never chooses the command that judges it: commands come from the settings or the bot-written marker. It does **not** stop a fix whose production code deliberately fakes results, for example by detecting the test run or writing JUnit XML itself: the test command runs the repository's code, which the fix controls. The draft-PR review by a person is the final gate; never merge a `nightly-fix` PR unreviewed.

Known limits:

- **Existing test files are immutable.** A fix whose root cause is a wrong test is still pushed, but labelled `needs-human-review`. New tests must go in new test files.
- **Test files outside the naming conventions** are detected only through the fix run's JUnit `file` attribute. That includes inline tests (for example Rust `#[cfg(test)]` modules in `src/`). Many reporters (pytest's default among them) write no `file` attribute; changes to such files are then judged only by the results check.
- **Compiled vs interpreted**: compiled languages get no old-code run, so a new test that would pass on the old code is not caught there. A cause test file with an extension in neither table also makes the run compiled. When the cause is compiled, an interpreted test file the fix adds is not run on old code, but the PR is marked for human review as mixed-language.
- **New tests absent from the old-code run are not proven**: the red check judges only test ids that appear in the overlay run's JUnit. A new test that never shows up there (for example a collection error because it imports a module the fix adds) is not shown to fail on old code.
- **Without JUnit** only the cause command is checked, and the PR always needs human review. If the cause command names no code file and the fix adds no test file (for example a Python or JavaScript fix with a cause command like `make test`), the mode is compiled and the old-code check is skipped.
- **Network config in a setup step**: a setup command that legitimately writes one of the network keys above (for example `git config http.proxy` or a `credential.helper`) is rejected. Configure such settings outside the repository's setup command.

## 🎨 Customization

- **Investigation and fix behavior** — Edit `investigate.md` and `implement.md`. Keep the hard rules in `implement.md`; verify enforces them anyway, but breaking them sends every PR to a person.
- **PR format and labels** — Edit `open-pr.md` (and any orchestration that filters on the labels).
- **Open-branch limit** — `PRECHECK_MAX_OPEN` in `scripts/precheck.mjs`.
- **Time limits** — `VERIFY_BUDGET_MS` (235 min total) and `VERIFY_COMMAND_MS` (55 min per command) in `scripts/verify.mjs`, within the step's 14400-second script limit and 245-minute step limit.
- **Test-file and protected-file lists, compiled extensions** — `scripts/lib/nightly/classify.mjs` (shared with the other nightly playbooks).
- **Do not edit** the `script` fields in `workflow.json` by hand; they are generated from `scripts/*.mjs` and `scripts/lib/nightly/`. Run `python3 scripts/sync-scripts.py test-failure-fix` after editing, and `node --test test-failure-fix/scripts/` to test.

## 🔗 Related Workflows

- [Nightly Test Run](../nightly-test-run/) — Files the issues and writes the baseline marker
- [Test Failure Triage](../test-failure-triage/) — Classifies each cause and writes the fix brief
- [Fix CI](../fix-ci/) — Fix CI failures on pull request branches
