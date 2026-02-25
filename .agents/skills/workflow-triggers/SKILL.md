---
name: Workflow Triggers Reference
description: >
  Reference for configuring workflow triggers, event types, conditions,
  slash commands, scheduled triggers, and trigger settings in Overcut workflows.
  Use when adding events, writing trigger conditions, setting up slash commands,
  or configuring scheduled workflows.
---

# Workflow Triggers Reference

This skill covers how to configure the `triggers` array in `workflow.json`. Each trigger defines when a workflow should execute.

## Trigger Structure

Every trigger has this shape:

```json
{
  "event": "<event_type>",
  "conditions": { ... },       // optional
  "slashCommand": { ... },     // required for "manual" event
  "schedule": { ... },         // required for "scheduled" event
  "settings": { "delaySeconds": 0 }  // optional
}
```

The `triggers` array uses **OR logic** — matching any one trigger starts the workflow.

## Event Types

There are 28 event types across 7 categories:

| Category | Events |
|----------|--------|
| **Issue** | `issue_opened`, `issue_closed`, `issue_edited`, `issue_assigned`, `issue_unassigned`, `issue_labeled`, `issue_unlabeled`, `issue_commented` |
| **Pull Request** | `pull_request_opened`, `pull_request_closed`, `pull_request_merged`, `pull_request_edited`, `pull_request_reviewed`, `pull_request_assigned`, `pull_request_unassigned`, `pull_request_labeled`, `pull_request_unlabeled`, `pull_request_commented`, `pull_request_review_commented` |
| **CI Workflow** | `ci_workflow_queued`, `ci_workflow_started`, `ci_workflow_completed`, `ci_workflow_failed`, `ci_workflow_cancelled`, `ci_workflow_timed_out` |
| **Manual** | `manual` |
| **Mention** | `mention` |
| **Scheduled** | `scheduled` |

Note: `slash_command` is an internal event type and is NOT valid in workflow trigger definitions.

## Conditions

Conditions use a recursive rule tree with combinators. The root is typically a group:

```json
{
  "conditions": {
    "combinator": "and",
    "rules": [
      { "field": "context.pullRequest.draft", "operator": "equals", "value": "false" },
      { "field": "context.pullRequest.baseBranch", "operator": "notEquals", "value": "main" }
    ]
  }
}
```

**Operators**: `equals`, `notEquals`, `contains`, `notContains`, `matches`, `startsWith`, `endsWith`, `in`, `notIn`

**Combinators**: `and`, `or` — rules can nest other rule groups for complex logic.

**Condition fields** reference the event context using dot notation: `context.pullRequest.*`, `context.issue.*`, `context.trigger.*`, `context.repository.*`, `context.actor.*`, `context.ciWorkflow.*`.

## Manual Triggers (Slash Commands)

Manual triggers **must** include a `slashCommand` and **only** the `manual` event type supports slash commands:

```json
{
  "event": "manual",
  "slashCommand": {
    "command": "review",
    "requireMention": false
  }
}
```

- `command`: The slash command without the leading `/` (e.g., `"review"` for `/review`)
- `requireMention`: If `true`, requires `@overcut` before the command

## Scheduled Triggers

At most **one** schedule trigger per workflow:

```json
{
  "event": "scheduled",
  "schedule": {
    "cronExpression": "0 9 * * 1-5",
    "scheduleContextSettings": {
      "type": "PerRepository",
      "repositorySelector": {
        "useForCode": true,
        "namePattern": "^backend-.*"
      }
    }
  }
}
```

**scheduleContextSettings.type**:
- `"Single"` — runs once (no repositorySelector allowed)
- `"PerRepository"` — runs once per matching repo (repositorySelector required)

**repositorySelector fields**: `useForCode`, `useForTickets`, `namePattern` (regex), `excludePattern` (regex), `provider`

## Trigger Settings

```json
{
  "settings": {
    "delaySeconds": 30
  }
}
```

`delaySeconds` (integer >= 0): Delay before dispatching the workflow. Default: 0 (immediate).

## Common Patterns

### PR trigger (non-draft)

```json
{
  "event": "pull_request_opened",
  "conditions": {
    "combinator": "and",
    "rules": [
      { "field": "context.pullRequest.draft", "operator": "equals", "value": "false" }
    ]
  }
}
```

### Label-based trigger (OR matching)

```json
{
  "event": "issue_labeled",
  "conditions": {
    "combinator": "or",
    "rules": [
      { "field": "context.trigger.label", "operator": "equals", "value": "security-vulnerability" },
      { "field": "context.trigger.label", "operator": "equals", "value": "cve" }
    ]
  }
}
```

### PR edit with commit push detection

```json
{
  "event": "pull_request_edited",
  "conditions": {
    "combinator": "and",
    "rules": [
      { "field": "context.pullRequest.draft", "operator": "equals", "value": "false" },
      { "field": "context.trigger.commitAdded", "operator": "equals", "value": "true" }
    ]
  }
}
```

### CI failure trigger

```json
{
  "event": "ci_workflow_failed",
  "conditions": {
    "combinator": "and",
    "rules": [
      { "field": "context.ciWorkflow.branch", "operator": "equals", "value": "main" }
    ]
  }
}
```

### Combined: automatic + manual

Most playbooks provide both an automatic trigger and a manual slash command so users can re-trigger on demand.

For the complete list of condition fields, see `references/trigger-events.md`.
