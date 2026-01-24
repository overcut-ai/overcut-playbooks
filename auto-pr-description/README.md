# Auto PR Description

## 📋 Overview

Automatically generates and updates pull request descriptions based on code changes, commits, and related issues. Maintains structured sections (Summary, Changes, Related Issues, Commits, Testing) while preserving user-written content outside the auto-generated area. Updates automatically when new commits are pushed to the PR.

## ⚡ Triggers

**Automatic:**

- Event: `pull_request_opened` (when a new PR is created)

  - Only for non-draft PRs
  - Excludes PRs targeting `main` branch (use [Release PR Description](../release-pr-description/README.md) for those)

- Event: `pull_request_edited` with `commitAdded == true` (when new commits are pushed to an existing PR)
  - Only for non-draft PRs
  - Excludes PRs targeting `main` branch

**Manual:**

- Slash command: `/pr-description`
- Can be used on any PR to regenerate or update the description

## 🎯 Use Cases

- **Consistency**: Ensures all PRs have structured, informative descriptions
- **Time-saving**: Automatically extracts issue links, summarizes changes, and lists commits
- **Context-aware**: Reads referenced tickets to understand requirements and generate accurate summaries
- **Up-to-date**: Updates description when new commits are pushed
- **Preservation**: Keeps your custom notes and context outside the auto-generated section
- **Onboarding**: Helps new contributors understand what changed and how to test
- **Better testing**: Uses ticket acceptance criteria to generate relevant testing checklists

## 🔧 Prerequisites

- Agents configured: Senior Developer, Technical Writer

## 🏗️ Workflow Steps

1. **Clone Repo** (`git.clone`) - Clones the PR branch

   - Agents: None (automated git operation)
   - Duration: ~1 min
   - Uses shallow clone with blob filtering for efficiency

2. **Prepare PR Description** (`agent.run`) - Analyzes PR and prepares formatted description

   - Agent: Senior Developer
   - Duration: ~2-5 min
   - Analyzes code changes, extracts issues, summarizes commits
   - **Reads referenced tickets** using `read_ticket` to gather context about requirements and acceptance criteria
   - Generates formatted markdown description: summary, changes, related issues, commits, testing checklist
   - Outputs complete formatted markdown description (ready to publish, without separator markers)

3. **Update PR Description** (`agent.session`) - Updates description with formatted content
   - Agents: Senior Developer, Technical Writer
   - Duration: ~1-3 min (up to 10 min for complex cases)
   - Receives formatted description from previous step
   - Adds separator markers around the formatted content
   - Preserves user content outside markers
   - Updates PR description while maintaining proper formatting

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
   - Identifies issue references from commits, PR title, and description

2. **Reads referenced tickets for context:**

   - Uses `read_ticket` to fetch details for each referenced issue
   - Extracts ticket descriptions, acceptance criteria, and requirements
   - Uses this context to understand the "why" behind the PR
   - Handles missing/inaccessible tickets gracefully

3. **Analyzes changes:**

   - Groups changes by type (features, fixes, refactors, etc.)
   - Identifies significant vs. trivial changes
   - Uses ticket context to better understand the purpose

4. **Generates formatted description:**

   - Creates summary based on code analysis and ticket context
   - Lists key changes with context
   - Links related issues
   - Summarizes commits
   - Generates relevant testing checklist based on ticket acceptance criteria

5. **Updates description:**

   - Receives formatted markdown description from prepare step
   - Adds separator markers around the formatted content
   - Preserves user content outside markers
   - Replaces content between markers
   - Maintains proper formatting

6. **Idempotency:**
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

- **[Release PR Description](../release-pr-description/README.md)** - Generates release-focused descriptions for PRs targeting `main`. This workflow handles feature branches and other PRs; Release PR Description handles release PRs to `main`.
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
  - `yes`: Description was successfully updated
  - `no`: Description was already up-to-date or no changes detected
  - `no` with `reason: no_changes_detected`: PR had no changes to analyze

**Note**: The prepare step outputs a complete formatted markdown description that is passed directly to the update step. The update step adds separator markers and preserves user content before publishing.

---

_Part of the [Overcut Playbooks](../README.md) collection_
