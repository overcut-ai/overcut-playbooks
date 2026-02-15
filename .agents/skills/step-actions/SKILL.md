---
name: Step Actions Reference
description: >
  Reference for workflow step action types, parameters, and configuration.
  Use when building workflow.json steps, choosing between agent.run and agent.session,
  configuring git.clone options, repo.identify, ci.executeWorkflow, or setting
  workflow-level and step-level configuration like priority, timeoutMs, and stepMaxDurationMinutes.
---

# Step Actions Reference

This skill covers how to configure steps in `workflow.json`, including all available action types, their parameters, and workflow/step-level configuration.

## Action Types Overview

| Action | Purpose | Has Instruction? | Key Params |
|--------|---------|-------------------|------------|
| `agent.run` | Single agent executes a prompt | Yes (required) | `agentId`, `agentEngine` |
| `agent.session` | Coordinator orchestrates agents | Yes (required) | `agentIds`, `goal`, `exitCriteria` |
| `git.clone` | Clone repositories | No | `repoFullName`, `branch`, `cloneOptions` |
| `repo.identify` | Identify relevant repos for a ticket | No | `maxResults`, `minConfidence` |
| `ci.executeWorkflow` | Trigger external CI pipeline | No | `repoFullName`, `workflowId`, `ref`, `inputs` |

Two internal actions (`agent.internal.cache-repo`, `agent.internal.index-repo`) exist but are not for playbook use.

## Step Structure

Every step follows this shape:

```json
{
  "id": "step-id",
  "name": "Human-Readable Name",
  "action": "agent.run",
  "params": { ... },
  "instruction": "Prompt content from .md file",
  "stepMaxDurationMinutes": 30
}
```

**Rules:**
- `id` must match `^[a-zA-Z0-9-]+$` (letters, numbers, hyphens only)
- `id` must match the corresponding `.md` prompt filename
- `instruction` is required for `agent.run` and `agent.session`, omitted for infrastructure steps
- `stepMaxDurationMinutes` (min: 1) limits individual step execution time

## When to Use Each Action

### `agent.run` — Single-pass tasks

Use for straightforward tasks where one agent can complete the work:
- Analyzing code and producing a plan
- Reading data and formatting output
- Simple file generation or modification

### `agent.session` — Coordinated execution

Use when a step needs oversight, multi-agent coordination, or iteration:
- **Multi-agent delegation**: Coordinator assigns chunks of work to sub-agents
- **Iterative loops**: Draft → review → revise cycles with max iteration limits
- **Error recovery**: Coordinator detects failures and retries or adjusts
- **Verification-heavy tasks**: Each sub-task's output must be confirmed before proceeding
- **Interactive sessions**: User provides feedback during execution (via `listenToComments`)

See the `agent-session-design` skill for detailed coordinator patterns.

### `git.clone` — Repository cloning

Clones one or more repositories into the agent workspace:

```json
{
  "id": "git-clone",
  "name": "Clone Repo",
  "action": "git.clone",
  "params": {
    "repoFullName": "{{trigger.repository.fullName}}",
    "branch": "{{trigger.pullRequest.headBranch}}",
    "cloneOptions": {
      "depth": 1,
      "filter": { "type": "blob:none" },
      "singleBranch": true
    }
  },
  "instruction": null
}
```

**`repoFullName`** accepts:
- A literal string: `"owner/repo"`
- A template expression: `"{{trigger.repository.fullName}}"` or `"{{outputs.identify-repos}}"`
- At runtime, can resolve to a string, string array, or object array (from `repo.identify`)

**`cloneOptions`**:
- `depth` (int): Shallow clone depth (1 = latest commit only)
- `filter.type` (string): Partial clone filter (`"blob:none"`, `"blob:limit=100M"`)
- `singleBranch` (bool): Clone only the specified branch
- `sparseCheckout` (object): `{ enabled: true, paths: ["src/", "docs/"] }`
- `ignoreCache` (bool): Force fresh clone
- `submodules` (object): `{ enabled: true, shallow: true }`

### `repo.identify` — Repository identification

Identifies the most relevant repositories for a ticket context (no code access):

```json
{
  "id": "identify-repos",
  "name": "Identify Repositories",
  "action": "repo.identify",
  "params": {
    "maxResults": 3,
    "minConfidence": 0.2
  },
  "instruction": null
}
```

- `maxResults` (1-20, default: 1): Maximum repos to return
- `minConfidence` (0-1, default: 0.2): Minimum confidence threshold
- `identificationHints` (string, optional): Free text to bias identification

**Output**: Referenced by downstream steps as `{{outputs.identify-repos}}`. Typically fed into `git.clone`'s `repoFullName`.

### `ci.executeWorkflow` — External CI pipeline

Triggers a CI/CD pipeline on an external repository:

```json
{
  "id": "run-tests",
  "name": "Run Test Suite",
  "action": "ci.executeWorkflow",
  "params": {
    "repoFullName": "{{trigger.repository.fullName}}",
    "workflowId": "test-suite.yml",
    "ref": "{{trigger.pullRequest.headBranch}}",
    "inputs": { "test_type": "integration" },
    "waitForCompletion": true
  }
}
```

- `repoFullName` (string): Repository identifier with provider inference
- `workflowId` (string): Workflow filename or pipeline ID
- `ref` (string, optional): Branch or tag reference
- `inputs` (Record<string, string>, optional): Key-value workflow inputs
- `waitForCompletion` (bool, optional): Whether to block until the pipeline finishes

## Common Pattern: repo.identify → git.clone

Many issue-triggered workflows need to identify which repos to work with:

```json
{
  "flow": [
    { "from": "", "to": "identify-repos" },
    { "from": "identify-repos", "to": "clone-repo" },
    { "from": "clone-repo", "to": "next-step" }
  ],
  "steps": [
    {
      "id": "identify-repos",
      "action": "repo.identify",
      "params": { "maxResults": 3, "minConfidence": 0.2 }
    },
    {
      "id": "clone-repo",
      "action": "git.clone",
      "params": {
        "repoFullName": "{{outputs.identify-repos}}",
        "cloneOptions": { "depth": 1 }
      }
    }
  ]
}
```

## Workflow-Level Configuration

These fields go in `workflow.definition`:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `priority` | 1-100 | 5 | Lower = higher priority. Built-in playbooks use 1-10. |
| `timeoutMs` | number | — | Abort workflow after this time (min: 30000ms). |
| `statusUpdateMethod` | string | `"comment"` | How status updates appear: `"comment"` (new comment per execution), `"reuse_comment"` (reuse existing), `"static_comment"` (initial + completion only) |
| `defaultModelKey` | string | null | Default LLM model for all agent steps |

## Agent Engine

Both `agent.run` and `agent.session` support `agentEngine`:
- `"overcut"` (default): Full Overcut agent runtime
- `"claude"`: Direct Claude API execution

For the complete parameter schemas, see `references/action-params.md`.
