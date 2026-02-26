# Fix CI

## Overview

Automatically detects CI workflow failures on pull request branches, analyzes the error logs to identify root causes, applies code fixes, and commits the changes back to the branch. Eliminates the manual cycle of reading CI logs, debugging locally, fixing, and pushing.

## Triggers

| Trigger | Event | Condition |
|---------|-------|-----------|
| Automatic | `ci_workflow_failed` | PR branches only (`isPullRequest` = true) |
| Manual | `/fix-ci` | Any PR context |

## Use Cases

- **Failing tests** — Fix broken unit/integration tests after code changes
- **Lint/format errors** — Auto-fix linting or formatting violations caught by CI
- **Build failures** — Resolve compilation errors, missing imports, or type errors
- **Configuration issues** — Fix CI-related config problems (e.g., missing env vars in test setup)

## Prerequisites

- **Senior Developer** agent configured in Overcut
- CI/CD integration enabled (GitHub Actions, GitLab CI, etc.)
- Repository access with push permissions on PR branches

## Workflow Steps

| # | Step ID | Action | Agent | Est. Duration |
|---|---------|--------|-------|---------------|
| 1 | `git-clone` | `git.clone` | — | 5 min |
| 2 | `analyze-ci-failure` | `agent.run` | Senior Developer | 15 min |
| 3 | `fix-and-commit` | `agent.run` | Senior Developer | 30 min |

### Flow

```
git-clone → analyze-ci-failure → fix-and-commit
```

**Step 1: Clone Repo** — Clones the repository on the branch where CI failed, with shallow depth for speed.

**Step 2: Analyze CI Failure** — Reads CI run details and job logs using CI/CD tools to identify which jobs failed and why. Produces a structured analysis with root cause, error messages, and a numbered fix plan listing specific files and changes needed. This step is read-only — no code modifications.

**Step 3: Fix and Commit** — Receives the analysis from the previous step, implements the code fixes, verifies the changes, commits with a conventional commit message (`fix(ci): ...`), and pushes to the branch. Posts a PR comment summarizing what was fixed.

### Data Flow

- `git-clone` provides the cloned repo workspace
- `analyze-ci-failure` outputs a structured analysis with `files_to_modify`, `fix_count`, and `failed_commands` fields (plus the numbered Fix Plan section)
- `fix-and-commit` reads `{{outputs.analyze-ci-failure.message}}` and applies the plan

## Customization

- **Trigger conditions** — Add branch filters (e.g., exclude `main`) or workflow name filters to target specific CI pipelines
- **Fix scope** — Modify `analyze-ci-failure.md` to focus on specific error types (e.g., only lint errors, only test failures)
- **Commit message style** — Edit `fix-and-commit.md` to match your team's commit conventions
- **PR comment format** — Customize the comment template in `fix-and-commit.md`
- **Auto-retry CI** — Add a `retry_ci_workflow` call in `fix-and-commit.md` after pushing to automatically re-trigger CI

## Related Workflows

- [Code Review](../code-review/) — Review code changes on PRs
- [Auto Root Cause Analysis](../auto-root-cause-analysis/) — Deep-dive RCA for bug issues
