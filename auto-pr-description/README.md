# Auto PR Description

## 📋 Overview

Automatically generates and updates pull request descriptions based on code changes, commits, and related issues. Maintains structured sections (Summary, Changes, Related Issues, Commits, Testing) while preserving user-written content outside the auto-generated area. Updates automatically when new commits are pushed to the PR.

## ⚡ Triggers

**Automatic:**

- Event: `pull_request_opened` (when a new PR is created)

  - Only for non-draft PRs

- Event: `pull_request_edited` with `commitAdded == true` (when new commits are pushed to an existing PR)
  - Only for non-draft PRs

**Manual:**

- Slash command: `/pr-description`
- Can be used on any PR to regenerate or update the description

## 🎯 Use Cases

- **Consistency**: Ensures all PRs have structured, informative descriptions
- **Time-saving**: Automatically extracts issue links, summarizes changes, and lists commits
- **Up-to-date**: Updates description when new commits are pushed
- **Preservation**: Keeps your custom notes and context outside the auto-generated section
- **Onboarding**: Helps new contributors understand what changed and how to test

## 🔧 Prerequisites

- Agents configured: Senior Developer, Technical Writer

## 🏗️ Workflow Steps

1. **Clone Repo** (`git.clone`) - Clones the PR branch

   - Agents: None (automated git operation)
   - Duration: ~1 min
   - Uses shallow clone with blob filtering for efficiency

2. **Prepare PR Description** (`agent.run`) - Analyzes PR and prepares structured content

   - Agent: Senior Developer
   - Duration: ~2-5 min
   - Analyzes code changes, extracts issues, summarizes commits
   - Generates structured content: summary, changes, related issues, commits, testing checklist
   - Outputs structured data for the next step

3. **Update PR Description** (`agent.session`) - Updates description with prepared content
   - Agents: Senior Developer, Technical Writer
   - Duration: ~1-3 min (up to 10 min for complex cases)
   - Identifies separator markers and preserves user content
   - Assembles final description with auto-generated sections
   - Updates PR description while preserving user-written content

```
[Clone] → [Prepare Description] → [Update Description]
```

## 📝 Description Structure

The workflow generates a structured description with the following sections (all between hidden markers):

```markdown
<!-- overcut:pr-description:start -->

## Summary

[2-3 sentence overview of what the PR does]

## Changes

[Key changes grouped by category - Features, Bug Fixes, Refactoring, etc.]

## Related Issues

[Issue links extracted from commits and PR - e.g., "Closes #123"]

## Commits

[List of recent commits with short hashes and messages]

## Testing

[Practical testing checklist based on the changes]

<!-- overcut:pr-description:end -->
```

**Content Preservation:**

- Everything **before** `<!-- overcut:pr-description:start -->` is preserved
- Everything **between** the markers is auto-generated and replaced on each update
- Everything **after** `<!-- overcut:pr-description:end -->` is preserved

## 🎨 Customization

### Step Prompts

The workflow uses two separate prompt files:

- `prepare-pr-description.md` - Controls analysis and content generation
- `update-pr-description.md` - Controls content preservation and PR update logic

You can customize:

**Change description sections:**

- Add new sections (e.g., "Breaking Changes", "Migration Guide")
- Remove sections you don't need
- Reorder sections

**Modify analysis depth:**

- Adjust how many commits to list
- Change the level of detail in change summaries
- Customize testing checklist generation

**Update frequency:**

- Adjust conditions (e.g., include draft PRs)

### Common Adjustments

**Include draft PRs:**
Edit the trigger conditions to remove the draft check:

```json
"conditions": {
  "field": null,
  "rules": [],
  "value": null,
  "operator": null,
  "combinator": "and"
}
```

**Customize testing checklist:**
Edit the "Testing" section generation in the instruction:

- Add specific test categories
- Include performance benchmarks
- Add accessibility checks
- Include security considerations

**Modify commit list length:**
Edit the instruction to change how many commits are shown:

- Show all commits: Remove limit
- Show fewer: Change "last 10-15" to "last 5"

**Change issue extraction patterns:**
Edit the instruction to recognize different issue reference formats:

- GitHub: `#123`, `Fixes #123`, `Closes #123`
- Jira: `PROJ-123`, `Resolves PROJ-123`
- Custom formats

## 🔍 How It Works

1. **Reads current PR state:**

   - Gets current description (to preserve user content)
   - Analyzes code diff (files, additions, deletions)
   - Extracts commits and commit messages

2. **Analyzes changes:**

   - Groups changes by type (features, fixes, refactors, etc.)
   - Identifies significant vs. trivial changes
   - Extracts issue references from commits

3. **Generates structured content:**

   - Creates summary based on code analysis
   - Lists key changes with context
   - Links related issues
   - Summarizes commits
   - Generates relevant testing checklist

4. **Updates description:**

   - Preserves content outside markers
   - Replaces content between markers
   - Maintains proper formatting

5. **Idempotency:**
   - Skips update if description is already current
   - Only updates when new commits or changes detected

## 🚨 Edge Cases Handled

- **Empty PR**: Creates minimal description
- **No commits**: Skips Commits section
- **No issues**: Omits Related Issues section
- **Very large PR**: Focuses on most significant changes
- **Draft PR**: Treated same as regular PRs (if enabled)
- **First run**: Creates markers if they don't exist
- **User edits**: Preserves content outside markers

## 🔗 Related Workflows

- **Code Review** - Reviews code quality alongside description. **Note**: This workflow runs after Auto PR Description (priority 1 vs 3), ensuring the PR description is generated first to provide context for reviewers.
- **Auto Changelog Reminder** - Ensures changelog entries for user-facing changes
- **Auto Docs Update on Merge** - Updates documentation when PRs merge

## ⚙️ Execution Order

This workflow has **priority 1** (highest priority) and runs **before** Code Review (priority 3). This ensures:

- PR descriptions are generated first, providing context for code reviewers
- Reviewers can see structured information about changes, issues, and testing requirements
- The description is available when other workflows analyze the PR

## 📊 Output

The workflow outputs:

- `description_updated`: Whether the description was updated (yes/no)
- `commits_analyzed`: Number of commits analyzed
- `issues_found`: Number of issue references found
- `files_changed`: Number of files changed in the PR

---

_Part of the [Overcut Playbooks](../README.md) collection_
