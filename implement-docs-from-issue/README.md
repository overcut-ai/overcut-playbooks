# Implement Documentation from Issue

## 📋 Overview

Automatically implements documentation updates based on issues in the docs repository. Analyzes the issue description, reviews the linked product PR to understand changes, follows existing documentation standards and structure, and creates a pull request with customer-facing documentation updates in the appropriate files and locations.

## ⚡ Triggers

**Automatic:**

- Event: `issue_labeled` when label is `needs-docs-update`
- Delay: None

**Manual:**

- Slash command: `/implement-docs`
- Can be used on any docs issue

## 🎯 Use Cases

- Automated documentation implementation from structured issue descriptions
- Consistent documentation updates following existing standards
- Maintaining customer-facing documentation in sync with product changes
- Reducing manual documentation writing effort
- Ensuring documentation follows established tone and structure
- Systematic doc updates organized by feature/value

## 🔧 Prerequisites

- Agents configured: Senior Developer, Tech Writer, Product Manager
- Issue must include link to product PR
- Docs repository uses Mintlify and `.mdx` format

## 🏗️ Workflow Steps

1. **Clone Docs Repo** (`git.clone`) - Clones the docs repository

   - Agents: None (automated git operation)
   - Duration: ~1 min
   - Clones main branch to understand current state

2. **Clone Product Repo** (`git.clone`) - Clones the product repository

   - Agents: None (automated git operation)
   - Duration: ~1 min
   - Clones to access the linked PR code changes

3. **Analyze Changes** (`agent.run`) - Identifies what changed

   - Agents: Senior Developer
   - Duration: ~1-2 min
   - Responsibility:
     - Reads the issue to understand what needs documentation
     - Analyzes the linked product PR
     - Identifies customer-facing changes only
     - Creates a simple list of what's new for users
   - Output: High-level list of changes (e.g., "New timeout config", "Updated error messages")

4. **Plan Documentation** (`agent.session`) - Determines which files to touch

   - Agents: Tech Writer (coordinated by Coordinator)
   - Duration: ~5-7 min
   - Responsibility:
     - For each change from the analysis, delegates to Tech Writer:
       - Reviews current docs structure and navigation
       - Checks for duplicate plans from previous iterations
       - Determines which files to create or modify
       - Assesses actual importance and right-sizes documentation
       - Identifies where changes belong in the docs hierarchy
       - Appends plan to scratchpad (`.overcut/docs-plan/scratchpad.jsonl`)
   - Output: Scratchpad file with plan items for each change

5. **Implement Documentation** (`agent.session`) - Writes the content

   - Agents: Tech Writer, Senior Developer (coordinated by Coordinator)
   - Duration: ~10-15 min
   - Responsibility:
     - Reads all plan items from scratchpad
     - For each plan item, two-phase process:
       - **Phase 1**: Tech Writer creates/updates content
         - Writes detailed content for new/updated pages
         - Uses Mintlify components and proper formatting
         - Includes code examples and configuration snippets
         - Updates navigation files
         - Leaves changes uncommitted (pending)
       - **Phase 2**: Developer verifies and commits
         - Reviews the pending changes for technical accuracy
         - Corrects any technical issues
         - Commits the changes with clear message
         - Clears pending state before next item
   - Output: All documentation changes committed and ready for PR

6. **Create PR** (`agent.run`) - Handles git operations

   - Agents: Tech Writer
   - Duration: ~1-2 min
   - Responsibility:
     - Creates branch from current state (all commits already made)
     - Pushes branch to docs repository
     - Creates PR with links to issue and product PR
     - Adds appropriate labels
     - Comments on original issue with PR link
   - Output: Documentation PR ready for review

```
[Clone Docs] → [Clone Product] → [Analyze Changes] → [Plan Docs] → [Implement] → [Create PR]
```

## 🎨 Customization

### Configuration Required

**Update repository paths in `workflow.json`:**

Edit the "clone-product" step to specify your product repository:

```json
{
  "id": "clone-product",
  "params": {
    "repoFullName": "your-org/your-product-repo"
  }
}
```

## 🔗 Related Workflows

- **Auto Docs Update on Merge** - Creates the documentation issues that trigger this workflow
- **Code Review** - Reviews PRs including documentation PRs

---

_Part of the [Overcut Playbooks](../README.md) collection_
