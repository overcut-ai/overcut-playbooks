# Auto Changelog Reminder

## 📋 Overview

Automatically checks if PRs with user-facing changes include changelog updates. Detects user-visible modifications (UI, APIs, CLI), suggests properly formatted changelog entries if missing, and can commit the entry on approval. Ensures changelog stays synchronized with code changes.

## ⚡ Triggers

**Automatic:**

- Event: `pull_request_opened`
- Delay: 60 seconds (allows PR description to be completed)

**Manual:**

- Slash command: `/changelog`
- Can be used on any PR

## 🎯 Use Cases

- Enforce changelog discipline across the team
- Reduce forgotten changelog entries before releases
- Standardize changelog format and style
- Teaching tool - shows what constitutes a user-facing change
- Release preparation - ensures all changes are documented

## 🔧 Prerequisites

- Agents configured: Technical Writer, Senior Developer, Product Manager

## 🏗️ Workflow Steps

1. **Clone Repo** (`git.clone`) - Clones the PR branch

   - Agents: None (automated git operation)
   - Duration: ~1 min

2. **Validate Changelog** (`agent.session`) - Checks and suggests changelog entries
   - Agents: Technical Writer, Senior Developer, Product Manager
   - Duration: ~2-5 min (up to 120 min for interactive session)
   - Analyzes PR, detects user-facing changes, suggests entries

```
[Clone] → [Validate & Suggest]
```

## 🎨 Customization

### Step Prompts

- `validate-changelog.md` - Controls what counts as user-facing, changelog format, suggestion style

### Common Adjustments

**Change what's considered user-facing:**
Edit `validate-changelog.md` definition section:

- Stricter: "Any file under `src/` or `lib/`"
- Looser: "Only files that modify external APIs or UI components"
- Add patterns: "Include changes to configuration files that affect users"

**Customize changelog format:**
Edit the "Formatting Rules" section:

- Use different heading structure
- Change bullet style or indentation
- Add emoji or categorization prefixes
- Include PR/issue references automatically

**Auto-commit behavior:**
Edit the approval logic:

- Auto-commit without asking: Remove the "approve changelog" requirement
- Never auto-commit: Remove commit logic, only suggest
- Require specific approval phrase

**Changelog location:**
Edit the "Locate the Relevant Changelog File" section:

- Check different paths (e.g., `docs/CHANGELOG.md`)
- Support multiple changelog files
- Handle monorepo package-specific changelogs

## 🔗 Related Workflows

- **Auto Docs Update on Merge** - Updates documentation when PRs merge
- **Code Review** - Ensures code quality along with changelog

---

_Part of the [Overcut Playbooks](../README.md) collection_
