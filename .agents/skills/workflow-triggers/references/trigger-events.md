# Trigger Events Complete Reference

## All Event Types

### Issue Events (8)

| Event | Fires When |
|-------|-----------|
| `issue_opened` | A new issue is created |
| `issue_closed` | An issue is closed |
| `issue_edited` | An issue title or body is edited |
| `issue_assigned` | A user is assigned to an issue |
| `issue_unassigned` | A user is unassigned from an issue |
| `issue_labeled` | A label is added to an issue |
| `issue_unlabeled` | A label is removed from an issue |
| `issue_commented` | A comment is posted on an issue |

### Pull Request Events (11)

| Event | Fires When |
|-------|-----------|
| `pull_request_opened` | A new PR is created |
| `pull_request_closed` | A PR is closed (without merge) |
| `pull_request_merged` | A PR is merged |
| `pull_request_edited` | A PR title/body is edited OR commits are pushed |
| `pull_request_reviewed` | A review is submitted on a PR |
| `pull_request_assigned` | A user is assigned to a PR |
| `pull_request_unassigned` | A user is unassigned from a PR |
| `pull_request_labeled` | A label is added to a PR |
| `pull_request_unlabeled` | A label is removed from a PR |
| `pull_request_commented` | A comment is posted on a PR |
| `pull_request_review_commented` | A review comment is posted inline on a PR |

### Other Events (3)

| Event | Fires When |
|-------|-----------|
| `manual` | A user posts a slash command (requires `slashCommand` config) |
| `mention` | The bot is @mentioned in an issue or PR |
| `scheduled` | A cron schedule fires (requires `schedule` config) |

Note: `slash_command` exists as an internal event type but is NOT valid in workflow trigger definitions. Use `manual` with `slashCommand` instead.

## Condition Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `equals` | Exact match (string comparison) | `"value": "false"` |
| `notEquals` | Not equal | `"value": "main"` |
| `contains` | String contains substring | `"value": "fix"` |
| `notContains` | String does not contain | `"value": "wip"` |
| `matches` | Regex match | `"value": "^feature/.*"` |
| `startsWith` | String starts with | `"value": "release/"` |
| `endsWith` | String ends with | `"value": "-hotfix"` |
| `in` | Value is in array | `"value": ["bug", "feature"]` |
| `notIn` | Value is not in array | `"value": ["draft", "wip"]` |

**Note:** All condition values are compared as strings. Boolean fields like `draft` should be `"true"` or `"false"` (strings, not booleans).

## Condition Combinators

| Combinator | Behavior |
|------------|----------|
| `and` | ALL rules must match |
| `or` | ANY rule must match |

Rules can nest other rule groups for complex logic:

```json
{
  "combinator": "and",
  "rules": [
    { "field": "context.pullRequest.draft", "operator": "equals", "value": "false" },
    {
      "combinator": "or",
      "rules": [
        { "field": "context.pullRequest.baseBranch", "operator": "equals", "value": "main" },
        { "field": "context.pullRequest.baseBranch", "operator": "equals", "value": "develop" }
      ]
    }
  ]
}
```

## Condition Field Paths

All fields reference the event context using dot notation:

### Pull Request Context Fields

```
context.pullRequest.number
context.pullRequest.title
context.pullRequest.state          → "open" | "closed" | "merged"
context.pullRequest.baseBranch
context.pullRequest.headBranch
context.pullRequest.labels         → array of label names
context.pullRequest.assignees      → array of usernames
context.pullRequest.author
context.pullRequest.body
context.pullRequest.draft          → "true" | "false" (string!)
context.pullRequest.additions
context.pullRequest.deletions
context.pullRequest.changedFiles
context.pullRequest.requestedReviewers
```

### Issue Context Fields

```
context.issue.number
context.issue.title
context.issue.state                → "open" | "closed"
context.issue.labels               → array of label names
context.issue.assignees            → array of usernames
context.issue.author
context.issue.body
context.issue.workItemType         → "Bug" | "Task" | "Story" etc.
```

### Trigger Context Fields

```
context.trigger.eventType
context.trigger.label              → label name (for label events)
context.trigger.labelAction        → "added" | "removed"
context.trigger.assignee           → username (for assign events)
context.trigger.assigneeAction     → "assigned" | "unassigned"
context.trigger.reviewer           → username (for review events)
context.trigger.reviewState        → "approved" | "changes_requested" | "commented" | "dismissed"
context.trigger.slashCommand       → command string (for manual events)
context.trigger.commentId
context.trigger.commentAuthor
context.trigger.commentBody
context.trigger.commitAdded        → "true" (for PR edit with commit push)
```

### Repository Context Fields

```
context.repository.name
context.repository.fullName
context.repository.owner
context.repository.defaultBranch
context.repository.provider        → "Github" | "GitLab" | "Bitbucket" | "AzureDevOps"
```

### Actor Context Fields

```
context.actor.login
context.actor.name
context.actor.type                 → "User" | "Bot" | "Organization"
```

## Slash Command Configuration

```json
{
  "event": "manual",
  "slashCommand": {
    "command": "review",
    "requireMention": false
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `command` | string | Command without leading `/` (e.g., `"review"` for `/review`) |
| `requireMention` | boolean | If `true`, requires `@overcut /review` instead of just `/review` |

**Validation rules:**
- Slash commands can ONLY be set on `manual` event triggers
- `manual` triggers MUST have a `slashCommand`

## Schedule Configuration

```json
{
  "event": "scheduled",
  "schedule": {
    "cronExpression": "0 9 * * 1-5",
    "scheduleContextSettings": {
      "type": "PerRepository",
      "repositorySelector": {
        "useForCode": true,
        "namePattern": "^backend-.*",
        "excludePattern": "^archived-.*",
        "provider": "Github"
      }
    }
  }
}
```

### Schedule Context Settings

| Type | Behavior | repositorySelector |
|------|----------|-------------------|
| `"Single"` | Runs once | Not allowed |
| `"PerRepository"` | Runs once per matching repository | Required |

### Repository Selector Fields

| Field | Type | Description |
|-------|------|-------------|
| `useForCode` | boolean | Filter repos marked for code operations |
| `useForTickets` | boolean | Filter repos marked for ticketing |
| `namePattern` | string (regex) | Include repos matching this pattern |
| `excludePattern` | string (regex) | Exclude repos matching this pattern |
| `provider` | string | Filter by git provider |

**Constraint:** At most ONE schedule trigger per workflow.

## Trigger Settings

```json
{
  "settings": {
    "delaySeconds": 30
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `delaySeconds` | integer (>= 0) | 0 | Delay before dispatching the workflow |

## Real-World Trigger Examples

### Code Review Playbook

```json
"triggers": [
  {
    "event": "pull_request_opened",
    "settings": { "delaySeconds": 0 },
    "conditions": {
      "combinator": "and",
      "rules": [
        { "field": "context.pullRequest.draft", "operator": "equals", "value": "false" }
      ]
    }
  },
  {
    "event": "manual",
    "slashCommand": { "command": "review", "requireMention": false }
  }
]
```

### Remediate CVEs Playbook

```json
"triggers": [
  {
    "event": "issue_labeled",
    "settings": { "delaySeconds": 0 },
    "conditions": {
      "combinator": "or",
      "rules": [
        { "field": "context.trigger.label", "operator": "equals", "value": "security-vulnerability" },
        { "field": "context.trigger.label", "operator": "equals", "value": "cve" }
      ]
    }
  },
  {
    "event": "manual",
    "slashCommand": { "command": "remediate-cve", "requireMention": false }
  }
]
```

### Auto PR Description Playbook

```json
"triggers": [
  {
    "event": "pull_request_opened",
    "conditions": {
      "combinator": "and",
      "rules": [
        { "field": "context.pullRequest.draft", "operator": "equals", "value": "false" },
        { "field": "context.pullRequest.baseBranch", "operator": "notEquals", "value": "main" }
      ]
    }
  },
  {
    "event": "pull_request_edited",
    "conditions": {
      "combinator": "and",
      "rules": [
        { "field": "context.pullRequest.draft", "operator": "equals", "value": "false" },
        { "field": "context.trigger.commitAdded", "operator": "equals", "value": "true" }
      ]
    }
  },
  {
    "event": "manual",
    "slashCommand": { "command": "pr-description", "requireMention": false }
  }
]
```
