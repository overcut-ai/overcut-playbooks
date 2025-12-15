# Fix Review Comments

## 📋 Overview

Automatically addresses code review feedback on pull requests. Analyzes all open review threads, creates a structured implementation plan, applies fixes with real-time progress tracking via checkbox comments, and replies to review threads as each item is completed. Provides transparent, incremental updates so reviewers can track progress in real-time.

## ⚡ Triggers

**Manual:**

- Slash command: `/fix-review`
- Can be used on any PR with open review comments

## 🎯 Use Cases

- Systematically addressing reviewer feedback on PRs
- Tracking progress on review fixes with transparent checkboxes
- Automating routine review comment fixes (renames, formatting, null checks)
- Reducing back-and-forth cycles in code review
- Keeping reviewers informed with real-time thread replies
- Learning from review patterns to improve code quality
- Freeing developers to focus on complex architectural feedback

## 🔧 Prerequisites

- Active pull request with open review threads

## 🏗️ Workflow Steps

1. **Clone Repo** (`git.clone`) - Clones the PR branch

   - Agents: None (automated git operation)
   - Duration: ~1 min
   - Shallow clone (depth 1) for speed

2. **Plan Fixes** (`agent.run`) - Analyzes review threads and creates implementation plan

   - Agents: PR Review Fixer
   - Duration: ~5-10 min
   - Fetches open review threads and categorizes them
   - Creates structured plan with thread IDs, file paths, changes, risks, validation
   - Groups related threads into single actionable items
   - Identifies items needing confirmation vs. ready to implement

3. **Apply Fixes** (`agent.session`) - Implements fixes with progress tracking
   - Agents: PR Review Fixer
   - Duration: ~5-60 min (depends on the number of fixes)
   - Posts implementation plan as PR comment with checkboxes
   - Implements each fix one by one
   - Commits and pushes each fix immediately after completion
   - Updates checkbox comment with commit SHAs after each fix
   - Replies to all associated review threads with fix details
   - Provides real-time transparency for reviewers

```
[Clone] → [Plan] → [Apply & Track]
```

## 📄 Output

The workflow produces:

- **Implementation Plan Comment** - Posted to PR with checkboxes tracking each fix
- **Commits** - One commit per fix, pushed immediately to the PR branch
- **Thread Replies** - Replies to each review thread explaining what was fixed
- **Progress Updates** - Real-time checkbox updates with commit SHAs

Example PR comment:

```markdown
## 🔧 Implementation Plan

Addressing code review feedback with the following tasks:

- [x] [PLAN-1] Refactor FooBar util (fbfa8fd)
- [x] [PLAN-2] Add null-check in UserService (a3c7e21)
- [ ] [PLAN-3] Extract validation logic

---

_This comment will be updated as tasks are completed._
```

## 🎨 Customization

### Step Prompts

- `plan-fixes.md` - Controls how review threads are analyzed and grouped into plan items
- `apply-fixes.md` - Controls fix implementation, progress tracking, and thread reply behavior

### Common Adjustments

**Change planning criteria:**
Edit `plan-fixes.md` to:

- Be more conservative: "Mark as NEEDS_CONFIRMATION if any breaking change risk"
- Be more aggressive: "Only flag NEEDS_CONFIRMATION for major architectural changes"
- Focus areas: "Prioritize security and performance fixes over style issues"
- Grouping: "Group by file rather than by logical change" or "Create separate items for each thread"

**Adjust risk assessment:**
Edit `plan-fixes.md` risk evaluation:

- Stricter: "Flag as Medium risk if any test modification needed"
- Lenient: "Only flag High risk for database schema or API contract changes"
- Add custom risk categories: "Security Risk", "Performance Impact", "Breaking Change"

**Customize commit strategy:**
Edit `apply-fixes.md` to:

- Batch commits: "Group related fixes into single commits"
- More granular: "One commit per file changed"
- Custom commit messages: "Use conventional commits format with scope"

**Change thread reply format:**
Edit `apply-fixes.md` to:

- More detailed: "Include code snippet showing the change"
- Concise: "Just commit SHA and checkmark"
- Request re-review: "Add 'Please re-review' to each reply"
- Custom tone: "More formal" or "More conversational"

**Adjust progress tracking:**
Edit `apply-fixes.md` and workflow.json:

- Skip checkbox comment: Remove PR comment posting logic
- Add summary stats: Include "X/Y completed" in each update
- Custom emojis: Use different icons for completed/pending items

**Modify validation requirements:**
Edit `apply-fixes.md` to:

- Always run tests: "Execute test suite after each fix"
- Linter enforcement: "Run linter and fix issues before each commit"
- Build verification: "Ensure build passes before pushing"
- Skip validation: "Push immediately without running checks"

## 🔗 Related Workflows

- **Code Review** - Initial code review that generates the feedback this workflow addresses
- **Auto Root Cause Analysis** - Analyzes bugs that might be discovered during review fixes

## 💡 Best Practices

**For better results:**

- Use this workflow after initial review round when actionable feedback is clear
- Before using this workflow, read and reply to review comments, just as if you were replying to a human reviewer.
- Resolve any comment that is not actionable or not relevant to the codebase. The agent will only handle open review threads.

**Customizing for your team:**

- Adjust risk thresholds based on your team's risk tolerance
- Modify commit message format to match your team's conventions
- Customize thread reply tone to match team culture
- Add team-specific validation requirements (linting, testing)

## ⚠️ Important Notes

- The workflow only addresses **open** review threads (excludes resolved/outdated)
- Each fix is committed and pushed immediately for transparency
- Commit SHAs in comments are plain text (not formatted with backticks)
- Original detailed plan is kept accessible during implementation for reference
- The checkbox comment provides a single source of truth for progress tracking

---

_Part of the [Overcut Playbooks](../README.md) collection_
