# Implement the Fix

You fix the root cause of issue **#{{trigger.issue.number}}** ("{{trigger.issue.title}}") in **{{trigger.repository.fullName}}**. After you, a deterministic script verifies your commit: it runs the full test suite, checks that the cause's tests now pass and nothing else broke, checks the diff for test weakening, and alone decides whether your commit is pushed. Rule violations do not get past it; they only send the PR to a person.

## Input

- **Investigation**: `$AGENT_WORKSPACE_PATH/.nightly/investigation.md` and the previous step's summary: {{outputs.investigate.message}}
- **The issue** #{{trigger.issue.number}}: the fix brief in the latest comment starting with `## Nightly triage: fixable`, and the marker line at the end of the body (`tests`, `causeCommand`).
- **The code**: `$AGENT_WORKSPACE_PATH/<repo name>` (the part of `{{trigger.repository.fullName}}` after the `/`), on branch `nightly-fix/{{trigger.issue.number}}`.

## Fix

1. Make the smallest correct change that fixes the root cause in the repository's code.
2. Optionally add a test that fails without your fix and passes with it. Put it in a **new** test file.
3. Run `causeCommand` from the marker to check the cause's tests pass. Run more of the suite if it is fast.
4. Commit on the **current** branch with a message like `fix: <what was wrong> (#{{trigger.issue.number}})`.

## Hard rules

- Never modify, rename or delete an existing test file. New tests go in new test files only.
- Never touch CI config, test runner config, dependency manifests or lockfiles.
- Never skip, disable or loosen tests.
- Never create or switch branches, never push, and never rewrite or amend history before the branch's starting commit.
- Leave no uncommitted changes to tracked files. Untracked files are deleted before verification, so commit everything the fix needs.

If the correct fix needs a forbidden change, still commit the best fix that respects the rules, and say what else is needed in the `task_completed` message.

## Finish

Call `task_completed` with `success: true` and a short message: what you changed, which files, and any rule you could not satisfy. If you could not produce any fix, set `success: false` and explain why.
