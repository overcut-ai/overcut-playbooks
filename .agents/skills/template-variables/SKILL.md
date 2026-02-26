---
name: Template Variables Reference
description: >
  Reference for Handlebars template syntax used in workflow.json, including
  output references between steps, trigger context variables, and helper
  functions. Use when writing {{}} template expressions, passing data between
  steps, referencing trigger context, or using Handlebars conditionals and helpers.
---

# Template Variables Reference

Overcut uses **Handlebars** as its template engine. Templates appear in step `params` fields (especially `repoFullName` and `branch` in `git.clone`) and are resolved at runtime before each step executes.

## Output Reference Syntax

### Infrastructure Steps (git.clone, repo.identify)

Infrastructure steps produce structured output. Reference the entire output object:

```
{{outputs.step-id}}
```

Example — `repo.identify` output fed to `git.clone`:

```json
{
  "repoFullName": "{{outputs.identify-repos}}"
}
```

The template engine auto-stringifies objects/arrays into readable JSON when printed directly, while preserving property access for nested fields.

### Agent Steps (agent.run, agent.session)

Agent steps produce a `message` field containing the agent's text output:

```
{{outputs.step-id.message}}
```

Example — referencing previous agent output in a prompt:

```markdown
**Previous step output:**

{{outputs.prep-context.message}}
```

This is how steps pass data to each other. The receiving step's `instruction` can include the template, and it gets resolved before the agent sees it.

## Trigger Context Variables

All trigger context is available under `{{trigger.*}}`. The exact fields depend on the event type.

### Common Fields (All Events)

```
{{trigger.repository.fullName}}     → "owner/repo"
{{trigger.repository.name}}         → "repo"
{{trigger.repository.owner}}        → "owner"
{{trigger.repository.defaultBranch}} → "main"
{{trigger.repository.provider}}     → "Github"
{{trigger.repository.description}}  → "Repo description"
{{trigger.repository.workspacePath}} → "/workspace/owner/repo"
{{trigger.repository.customInstructions}} → "Agent instructions for this repo"

{{trigger.actor.login}}             → "username"
{{trigger.actor.name}}              → "Display Name"
{{trigger.actor.email}}             → "user@example.com"
{{trigger.actor.type}}              → "User" | "Bot" | "Organization"

{{trigger.trigger.eventType}}       → "pull_request_opened"
```

### Pull Request Events

```
{{trigger.pullRequest.number}}      → 42
{{trigger.pullRequest.title}}       → "Add feature X"
{{trigger.pullRequest.state}}       → "open" | "closed" | "merged"
{{trigger.pullRequest.baseBranch}}  → "main"
{{trigger.pullRequest.headBranch}}  → "feature/x"
{{trigger.pullRequest.author}}      → "username"
{{trigger.pullRequest.body}}        → "PR description"
{{trigger.pullRequest.draft}}       → true | false
{{trigger.pullRequest.labels}}      → ["bug", "priority:high"]
{{trigger.pullRequest.assignees}}   → ["user1", "user2"]
{{trigger.pullRequest.headSha}}     → "abc123..."
{{trigger.pullRequest.baseSha}}     → "def456..."
{{trigger.pullRequest.additions}}   → 150
{{trigger.pullRequest.deletions}}   → 30
{{trigger.pullRequest.changedFiles}} → 12
{{trigger.pullRequest.requestedReviewers}} → ["reviewer1"]
{{trigger.pullRequest.createdAt}}   → "2024-01-15T10:30:00Z"
{{trigger.pullRequest.updatedAt}}   → "2024-01-16T14:00:00Z"
{{trigger.pullRequest.mergeable}}   → true | false | null
```

### Issue Events

```
{{trigger.issue.number}}            → 123
{{trigger.issue.title}}             → "Bug: X doesn't work"
{{trigger.issue.state}}             → "open" | "closed"
{{trigger.issue.labels}}            → ["bug", "high-priority"]
{{trigger.issue.assignees}}         → ["user1"]
{{trigger.issue.author}}            → "reporter"
{{trigger.issue.body}}              → "Issue description"
{{trigger.issue.workItemType}}      → "Bug" | "Task" | "Story"
{{trigger.issue.createdAt}}         → "2024-01-15T10:30:00Z"
```

### Trigger-Specific Fields

```
{{trigger.trigger.label}}           → "security-vulnerability" (for label events)
{{trigger.trigger.labelAction}}     → "added" | "removed"
{{trigger.trigger.assignee}}        → "username" (for assign events)
{{trigger.trigger.slashCommand}}    → "review" (for manual triggers)
{{trigger.trigger.commentId}}       → "123456"
{{trigger.trigger.commentAuthor}}   → "username"
{{trigger.trigger.commentBody}}     → "Comment text"
{{trigger.trigger.commitAdded}}     → true (for PR edit with push)
{{trigger.trigger.reviewer}}        → "username" (for review events)
{{trigger.trigger.reviewState}}     → "approved" | "changes_requested"
```

### CI Workflow Events

```
{{trigger.ciWorkflow.runId}}        → "12345678"
{{trigger.ciWorkflow.workflowName}} → "CI / Build & Test"
{{trigger.ciWorkflow.status}}       → "Failed"
{{trigger.ciWorkflow.conclusion}}   → "failure"
{{trigger.ciWorkflow.branch}}       → "main"
{{trigger.ciWorkflow.isPullRequest}} → true | false
{{trigger.ciWorkflow.pullRequestId}} → 42
{{trigger.ciWorkflow.commitSha}}    → "abc123..."
{{trigger.ciWorkflow.queuedAt}}     → "2024-01-15T10:30:00Z"
{{trigger.ciWorkflow.startedAt}}    → "2024-01-15T10:30:05Z"
{{trigger.ciWorkflow.completedAt}}  → "2024-01-15T10:35:00Z"
{{trigger.ciWorkflow.duration}}     → 295000
{{trigger.ciWorkflow.workflowUrl}}  → "https://github.com/org/repo/actions/runs/12345678"
{{trigger.ciWorkflow.jobCount}}     → 3
```

**Note:** CI workflow events may also include `{{trigger.pullRequest.*}}` fields when the CI run was triggered by a pull request (`isPullRequest` is `true`).

## Handlebars Helpers

The template engine registers these helpers:

### Comparison Helpers

```handlebars
{{#if (eq variable "value")}}...{{/if}}
{{#if (neq variable "value")}}...{{/if}}
{{#if (gt count 5)}}...{{/if}}
{{#if (gte count 5)}}...{{/if}}
{{#if (lt count 5)}}...{{/if}}
{{#if (lte count 5)}}...{{/if}}
```

### Logical Helpers

```handlebars
{{#if (and condition1 condition2)}}...{{/if}}
{{#if (or condition1 condition2)}}...{{/if}}
{{#if (not condition)}}...{{/if}}
```

### Serialization Helper

```handlebars
{{json someObject}}
```

Outputs the object as pretty-printed JSON. Useful for debugging or passing structured data.

### Iteration

```handlebars
{{#each items}}
  {{this.name}} - {{this.value}}
{{/each}}
```

## Usage Locations

Templates are primarily used in:

1. **Step params** — `repoFullName`, `branch` in `git.clone`
2. **Step instructions** — Reference previous step outputs in agent prompts

Templates are **not** used in trigger conditions (those use the condition engine with operators).

For the complete field listing of all context types, see `references/trigger-context-fields.md`.
