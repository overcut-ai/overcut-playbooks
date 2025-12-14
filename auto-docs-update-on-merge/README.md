# Auto Docs Update on Merge

## 📋 Overview

Multi-repository workflow that automatically creates documentation tickets when PRs merge to main. Analyzes code changes, identifies customer-facing documentation needs, and creates separate issues in the docs repository for each required update. Organizes documentation work by feature/value rather than by file, ensuring systematic documentation coverage without manual triage.

**Note**: Overcut automatically creates tickets in the project linked to your docs repository (GitHub Issues, Jira, etc.), ensuring documentation work is tracked where your team manages it.

## ⚡ Triggers

**Automatic:**

- Event: `pull_request_merged` when base branch is `main`
- Delay: None

**Manual:**

- Slash command: `/update-docs`
- Can be used on any merged PR

## 🎯 Use Cases

- Automatic documentation ticket creation for customer-facing changes
- Keeping docs repository in sync with product development
- Reducing documentation debt by catching gaps early
- Ensuring user-facing changes trigger documentation work
- Multi-repo documentation workflows (product → docs)
- Organizing documentation work by feature/value, not files

## 🔧 Prerequisites

- **Separate docs repository** must be accessible to Overcut
- Agents configured: Product Manager, Senior Developer, Tech Writer
- **Configuration required**: Update product and docs repo paths in workflow.json
- Label `needs-docs-update` should exist in docs repository

## 🏗️ Workflow Steps

1. **Clone Source Repo** (`git.clone`) - Clones the product repository

   - Agents: None (automated git operation)
   - Duration: ~1 min

2. **Clone Docs Repo** (`git.clone`) - Clones the docs repository

   - Agents: None (automated git operation)
   - Duration: ~1 min

3. **Update Docs** (`agent.session`) - Analyzes changes and creates documentation tickets
   - Agents: Coordinator, Product Manager, Senior Developer, Tech Writer
   - Duration: ~10 min
   - Process:
     1. Developer Agent analyzes product PR for customer-facing changes
     2. Tech Writer Agent identifies documentation gaps
     3. Tech Writer Agent creates separate issues for each change
     4. Developer Agent comments on product PR with links to doc issues
   - Creates issues labeled `needs-docs-update` in docs repository

```
[Clone Product] → [Clone Docs] → [Analyze & Create Issues]
```

## 🎨 Customization

### Step Prompts

- `plan-docs.md` - Controls the entire process: what counts as customer-facing, how to identify gaps, and how to create issues

### Common Adjustments

**Configure repositories:**
Edit `workflow.json` steps "clone-code" and "clone-docs":

```json
"repoFullName": "your-org/your-product-repo"  // Step: clone-code
"repoFullName": "your-org/your-docs-repo"     // Step: clone-docs
```

**Change what counts as "customer-facing":**
Edit `plan-docs.md` Step 1 to:

- Include API changes: "Also flag changes to public API endpoints"
- Exclude certain features: "Skip documentation for beta/experimental features"
- Add specific patterns: "Always document changes to configuration options"

**Adjust issue grouping strategy:**
Edit `plan-docs.md` Step 2 to:

- More granular: "Create separate issues for each configuration option"
- More consolidated: "Group related features into single issues"
- By audience: "Separate issues for admin vs. end-user features"

**Customize issue format:**
Edit `plan-docs.md` Step 3 to:

- Add custom fields: Include priority, affected versions, or doc type
- Change labels: Use different label schemes
- Add templates: Include specific issue templates or sections
- Link to product: Add links to Jira tickets, design docs, etc.

**Modify notification behavior:**
Edit `plan-docs.md` Step 4 to:

- Add stakeholders: Notify product managers or doc team leads
- Change message format: Include more context or links
- Skip notification: Remove PR comment if not needed

## 🔗 Related Workflows

- **Auto Changelog Reminder** - Ensures changelog is updated before merge
- **Technical Design Proposal** - Creates design docs before implementation

---

_Part of the [Overcut Playbooks](../README.md) collection_
