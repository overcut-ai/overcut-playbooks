# Investigate the Root Cause

You investigate issue **#{{trigger.issue.number}}** ("{{trigger.issue.title}}") in **{{trigger.repository.fullName}}**. The nightly test run filed it for one root cause of failing tests, and triage classified it as fixable. The next step implements a fix from your findings; a deterministic script then verifies it. You only read and analyze: make no code changes, no commits and no pushes, and never edit the issue.

## Input

- **The issue**: read issue #{{trigger.issue.number}} (title, body, comments). The body ends with a hidden marker line `<!-- nightly-test-failure {...} -->`: `sha` (the tested commit), `tests` (this cause's failing test ids) and `causeCommand` (runs only this cause's tests).
- **The fix brief**: the latest issue comment that starts with `## Nightly triage: fixable`. It names what is wrong, where, what the fix should change and which tests prove it.
- **The code**: `$AGENT_WORKSPACE_PATH/<repo name>` (the part of `{{trigger.repository.fullName}}` after the `/`), checked out on branch `nightly-fix/{{trigger.issue.number}}` at the marker's `sha`.

If the issue has no comment starting with `## Nightly triage: fixable`, stop: call `task_completed` with `success: false`, `quitWorkflow: true` and a message saying there is no fixable triage comment.

## Investigate

1. Read the fix brief and the failing tests it names.
2. Read the code under test and confirm the defect. You may run `causeCommand` to see the failure; do not change files.
3. Find the smallest change in the repository's non-test code that makes those tests pass. Note any risk that the change breaks other tests.
4. If the tests themselves look wrong (the root cause is in a test), say so plainly: the implement step may not edit existing test files, so a person will have to review.

## Output

Write your findings to `$AGENT_WORKSPACE_PATH/.nightly/investigation.md` (create the folder if needed):

- **Root cause**: the defect, with file paths and line numbers.
- **Planned change**: files and functions to change, and how.
- **Tests that prove it**: the cause's test ids and `causeCommand`; any new test worth adding (it goes in a new test file).
- **Risks**: other code or tests the change may affect; anything that would need a forbidden change (existing test files, CI config, test runner config, dependency manifests or lockfiles).

Call `task_completed` with `success: true` and a one-line summary of the root cause.
