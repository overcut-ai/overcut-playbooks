# Trigger Context Fields Complete Reference

This document lists every field available in the trigger context, organized by context type.

## PullRequestContext

Available under `{{trigger.pullRequest.*}}` for pull request events.

| Field | Type | Description |
|-------|------|-------------|
| `number` | number | PR number (unique within repository) |
| `title` | string | PR title |
| `state` | `"open"` \| `"closed"` \| `"merged"` | Current PR state |
| `baseBranch` | string? | Base branch name (e.g., `"main"`) |
| `headBranch` | string? | Head/feature branch name |
| `labels` | string[] | Array of label names |
| `assignees` | string[] | Array of assigned usernames |
| `author` | string? | PR author username |
| `body` | string? | PR description/body |
| `milestone` | string? | Milestone title |
| `draft` | boolean? | Whether PR is a draft |
| `mergeCommitSha` | string? | Merge commit SHA (after merge) |
| `headSha` | string? | Head commit SHA |
| `baseSha` | string? | Base commit SHA |
| `additions` | number? | Number of lines added |
| `deletions` | number? | Number of lines deleted |
| `changedFiles` | number? | Number of files changed |
| `requestedReviewers` | string[]? | Array of requested reviewer usernames |
| `createdAt` | string? | ISO timestamp of PR creation |
| `updatedAt` | string? | ISO timestamp of last update |
| `closedAt` | string? | ISO timestamp when closed |
| `mergedAt` | string? | ISO timestamp when merged |
| `autoMerge` | boolean? | Whether auto-merge is enabled |
| `mergeable` | boolean? \| null | Whether PR is mergeable |
| `rebaseable` | boolean? \| null | Whether PR is rebaseable |

## IssueContext

Available under `{{trigger.issue.*}}` for issue events.

| Field | Type | Description |
|-------|------|-------------|
| `number` | number | Issue number (unique within repository) |
| `title` | string | Issue title |
| `state` | `"open"` \| `"closed"` | Current issue state |
| `labels` | string[] | Array of label names |
| `assignees` | string[]? | Array of assigned usernames |
| `author` | string? | Issue author username |
| `body` | string? | Issue description/body |
| `milestone` | string? | Milestone title |
| `createdAt` | string? | ISO timestamp of issue creation |
| `updatedAt` | string? | ISO timestamp of last update |
| `closedAt` | string? | ISO timestamp when closed |
| `confidential` | boolean? | Whether issue is confidential (GitLab) |
| `workItemType` | string? | Work item type: `"Bug"`, `"Task"`, `"Story"`, etc. |

## TriggerContext

Available under `{{trigger.trigger.*}}` for all events. Contains event-specific metadata about what triggered the workflow.

### Core Fields

| Field | Type | Description |
|-------|------|-------------|
| `eventType` | string | The standardized event type that triggered the workflow |
| `triggerObjectName` | string | Name of the trigger object |
| `triggerObjectNumber` | string | Number/ID of the trigger object |
| `triggerObjectUrl` | string | URL of the trigger object |

### Label Operations

| Field | Type | Description |
|-------|------|-------------|
| `label` | string? | Label name (for `issue_labeled`, `issue_unlabeled`, `pull_request_labeled`, `pull_request_unlabeled`) |
| `labelAction` | `"added"` \| `"removed"`? | What happened to the label |

### Assignee Operations

| Field | Type | Description |
|-------|------|-------------|
| `assignee` | string? | Username (for assign/unassign events) |
| `assigneeAction` | `"assigned"` \| `"unassigned"`? | What happened |

### Milestone Operations

| Field | Type | Description |
|-------|------|-------------|
| `milestone` | string? | Milestone name |
| `milestoneAction` | `"added"` \| `"removed"`? | What happened |

### Review Operations (PR only)

| Field | Type | Description |
|-------|------|-------------|
| `reviewer` | string? | Reviewer username |
| `reviewState` | `"approved"` \| `"changes_requested"` \| `"commented"` \| `"dismissed"`? | Review decision |
| `reviewAction` | `"submitted"` \| `"edited"` \| `"dismissed"`? | Review action |

### PR State Operations

| Field | Type | Description |
|-------|------|-------------|
| `prState` | `"opened"` \| `"closed"` \| `"merged"`? | PR state |
| `prAction` | `"opened"` \| `"closed"` \| `"reopened"` \| `"merged"` \| `"ready_for_review"` \| `"converted_to_draft"`? | Specific PR action |

### Issue State Operations

| Field | Type | Description |
|-------|------|-------------|
| `issueState` | `"opened"` \| `"closed"`? | Issue state |
| `issueAction` | `"opened"` \| `"closed"` \| `"reopened"`? | Specific issue action |

### Branch Operations

| Field | Type | Description |
|-------|------|-------------|
| `branch` | string? | Branch name |
| `branchAction` | `"created"` \| `"deleted"`? | What happened to the branch |

### Slash Command Operations

| Field | Type | Description |
|-------|------|-------------|
| `slashCommand` | string? | The command that was invoked (e.g., `"review"`) |
| `slashCommandWithMention` | boolean? | Whether `@overcut` mention preceded the command |

### Mention Operations

| Field | Type | Description |
|-------|------|-------------|
| `mentionedBy` | string? | Username who mentioned the bot |
| `mentionLocation` | string? | Where the mention occurred |
| `mentionContent` | string? | Full message containing the mention |

### Comment Operations

| Field | Type | Description |
|-------|------|-------------|
| `commentId` | string? | Comment ID from the git provider |
| `commentAuthor` | string? | Username of the comment author |
| `commentBody` | string? | Comment body/content |
| `commentLocation` | `"issue"` \| `"pull_request"`? | Where the comment was posted |
| `commentCreatedAt` | string? | ISO timestamp of comment creation |

### Commit Operations

| Field | Type | Description |
|-------|------|-------------|
| `commitAdded` | boolean? | True if the PR event was triggered by new commits being pushed |

## RepositoryContext

Available under `{{trigger.repository.*}}` for all events that have a repository context.

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Repository name (e.g., `"blog-server"`) |
| `fullName` | string | Full name including owner (e.g., `"org/blog-server"`) |
| `owner` | string | Repository owner username |
| `groupName` | string? | Repository group name |
| `url` | string | Clone URL |
| `defaultBranch` | string? | Default branch (e.g., `"main"`) |
| `description` | string? | Repository description |
| `provider` | enum | `"Github"` \| `"GitLab"` \| `"Bitbucket"` \| `"AzureDevOps"` |
| `workspacePath` | string? | Local path in the agent workspace |
| `customInstructions` | string? | Repository-specific agent instructions |
| `tools` | object[]? | Configured tool commands: `[{name, command}]` |

## ActorContext

Available under `{{trigger.actor.*}}` for all events.

| Field | Type | Description |
|-------|------|-------------|
| `login` | string | Username/login |
| `name` | string? | Display name |
| `email` | string? | Email address |
| `type` | `"User"` \| `"Bot"` \| `"Organization"` | Type of actor |

## Handlebars Helper Functions

These helpers are registered in the template engine and can be used in any template expression.

### Comparison Helpers

| Helper | Usage | Description |
|--------|-------|-------------|
| `eq` | `{{#if (eq a b)}}` | Strict equality (`===`) |
| `neq` | `{{#if (neq a b)}}` | Strict inequality (`!==`) |
| `gt` | `{{#if (gt a b)}}` | Greater than |
| `gte` | `{{#if (gte a b)}}` | Greater than or equal |
| `lt` | `{{#if (lt a b)}}` | Less than |
| `lte` | `{{#if (lte a b)}}` | Less than or equal |

### Logical Helpers

| Helper | Usage | Description |
|--------|-------|-------------|
| `and` | `{{#if (and a b c)}}` | All arguments truthy |
| `or` | `{{#if (or a b c)}}` | Any argument truthy |
| `not` | `{{#if (not a)}}` | Negation |

### Serialization Helper

| Helper | Usage | Description |
|--------|-------|-------------|
| `json` | `{{json someObject}}` | Pretty-print object as JSON (SafeString) |

### Built-in Handlebars

| Feature | Usage | Description |
|---------|-------|-------------|
| `#if` | `{{#if value}}...{{else}}...{{/if}}` | Conditional rendering |
| `#each` | `{{#each items}}{{this}}{{/each}}` | Array iteration |
| `#unless` | `{{#unless value}}...{{/unless}}` | Inverse conditional |

## Template Resolution Details

- Templates are resolved **before** each step executes
- Objects and arrays auto-stringify to readable JSON when printed directly (via `toString()` override)
- Property access on objects is preserved even after stringification (e.g., `{{outputs.identify-repos}}` stringifies as JSON, but `{{outputs.some-step.message}}` extracts the message field)
- Invalid templates throw compilation errors — use `{{` and `}}` delimiters correctly
