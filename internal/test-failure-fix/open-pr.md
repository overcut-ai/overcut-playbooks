# Open the Draft PR

The verify script has tested the fix for issue **#{{trigger.issue.number}}** ("{{trigger.issue.title}}") in **{{trigger.repository.fullName}}** and pushed it to branch `{{outputs.verify.output.branch}}` (commit `{{outputs.verify.output.sha}}`). You open the pull request. Do not push, commit or change any code or branch: the next step checks that the branch still points at exactly the verified commit.

## Verify result

- **verified**: {{outputs.verify.output.verified}}
- **needsHuman**: {{outputs.verify.output.needsHuman}}
- **checks** (what verify ran and saw, a JSON array of strings): {{{outputs.verify.output.checks}}}
- **reasons** (rule violations that need a person, a JSON array of strings): {{{outputs.verify.output.reasons}}}

## Create the PR

Create a **draft** pull request from `{{outputs.verify.output.branch}}` into the repository's default branch:

- **Title**: `fix: {{trigger.issue.title}}`
- **Labels**: `nightly-fix`; also `needs-human-review` when needsHuman is `true`. Create a label first if the repository does not have it.
- **Body**:
  1. `Fixes #{{trigger.issue.number}}`
  2. A summary of the change (2-5 sentences), from the commit diff and this summary of the implement step: {{outputs.implement.message}}
  3. A `### Verification` section listing every entry of **checks** verbatim, one bullet each.
  4. A `### Needs review` section listing every entry of **reasons** verbatim, one bullet each, or `None` when it is empty.
  5. This note: `Opened automatically by the Test Failure Fix workflow. A person must review this change before merging.`

## Finish

Call `task_completed` with `success: true` and the PR URL. If the PR cannot be created, set `success: false` with the error.
