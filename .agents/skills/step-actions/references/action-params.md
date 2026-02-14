# Action Parameters Complete Reference

## agent.run

Single agent executes a prompt.

```json
{
  "action": "agent.run",
  "params": {
    "agentId": "agent-id-here",
    "agentEngine": "overcut"
  }
}
```

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `agentId` | string | Yes | — | ID of the agent to execute |
| `agentEngine` | `"overcut"` \| `"claude"` | No | `"overcut"` | Runtime engine |

**Requires**: `instruction` field on the step (prompt content).

---

## agent.session

Coordinator orchestrates multiple agents.

```json
{
  "action": "agent.session",
  "params": {
    "agentIds": ["agent-id-1", "agent-id-2"],
    "goal": "Brief description of the session goal",
    "exitCriteria": {
      "timeLimit": {
        "maxDurationMinutes": 30
      },
      "userSignals": {
        "explicit": ["/done", "thanks"]
      }
    },
    "keepSessionOpenForComments": false,
    "listenToComments": false,
    "agentEngine": "overcut",
    "coordinatorModelKey": null
  }
}
```

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `agentIds` | string[] | Yes | — | Agent IDs available for delegation |
| `goal` | string | Yes | — | Brief session goal description |
| `exitCriteria` | object | No | — | When the session should end |
| `exitCriteria.timeLimit.maxDurationMinutes` | number | No | 10 | Max session duration in minutes |
| `exitCriteria.userSignals.explicit` | string[] | No | — | User messages that end the session |
| `keepSessionOpenForComments` | boolean | No | false | Keep session alive after task_completed |
| `listenToComments` | boolean | No | false | Receive PR/issue comments during execution |
| `agentEngine` | `"overcut"` \| `"claude"` | No | `"overcut"` | Runtime engine |
| `coordinatorModelKey` | string \| null | No | null | Override LLM model for coordinator |

**Requires**: `instruction` field on the step (coordinator prompt content).

### Exit Criteria Details

**timeLimit**: Hard limit on session duration. When reached, the session terminates.

**userSignals**: The session ends when a user posts one of the listed strings as a comment. Requires `listenToComments: true` to function.

### Interactive Session Configuration

For sessions that accept user feedback:

```json
{
  "listenToComments": true,
  "keepSessionOpenForComments": true,
  "exitCriteria": {
    "userSignals": {
      "explicit": ["/done", "looks good", "thanks"]
    }
  }
}
```

- `listenToComments: true` — Session receives comments as input during execution
- `keepSessionOpenForComments: true` — Session remains alive after `task_completed` to handle follow-up comments
- `userSignals` — When a user posts one of these exact strings, the session ends

---

## git.clone

Clone one or more repositories.

```json
{
  "action": "git.clone",
  "params": {
    "repoFullName": "{{trigger.repository.fullName}}",
    "branch": "{{trigger.pullRequest.headBranch}}",
    "cloneOptions": {
      "depth": 1,
      "filter": {
        "type": "blob:none",
        "size": "100M"
      },
      "singleBranch": true,
      "sparseCheckout": {
        "enabled": true,
        "paths": ["src/", "docs/"]
      },
      "ignoreCache": false,
      "submodules": {
        "enabled": false,
        "shallow": true
      }
    }
  }
}
```

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `repoFullName` | string | Yes | Repo identifier or template expression |
| `branch` | string | No | Branch to checkout (empty string = default branch) |
| `cloneOptions` | object | No | Advanced clone configuration |

### Clone Options

| Param | Type | Description |
|-------|------|-------------|
| `depth` | positive integer | Shallow clone depth (1 = latest commit only) |
| `filter.type` | string | Git partial clone filter: `"blob:none"`, `"blob:limit=100M"` |
| `filter.size` | string | Blob size threshold (e.g., `"100M"`) |
| `singleBranch` | boolean | Clone only the specified branch |
| `sparseCheckout.enabled` | boolean | Enable sparse checkout |
| `sparseCheckout.paths` | string[] | Paths to include (e.g., `["src/frontend", "docs"]`) |
| `ignoreCache` | boolean | Force fresh clone, bypassing cache |
| `submodules.enabled` | boolean | Clone submodules recursively |
| `submodules.shallow` | boolean | Shallow clone submodules |

### repoFullName Resolution

In workflow definitions, `repoFullName` is always a string. At runtime, after template resolution:
- **String**: `"owner/repo"` — clones one repo
- **String array**: `["owner/repo1", "owner/repo2"]` — clones multiple repos
- **Object array**: `[{repoFullName: "owner/repo", confidence: 0.9, ...}]` — from `repo.identify` output

**Does not require** `instruction` field (infrastructure step).

---

## repo.identify

Identify the most relevant repositories for a ticket context.

```json
{
  "action": "repo.identify",
  "params": {
    "maxResults": 3,
    "minConfidence": 0.2,
    "identificationHints": "This is a backend service issue affecting the API layer"
  }
}
```

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `maxResults` | integer (1-20) | No | 1 | Maximum repos to return |
| `minConfidence` | number (0-1) | No | 0.2 | Minimum confidence threshold |
| `identificationHints` | string | No | — | Free text to bias identification |

**Output**: The step's output is typically referenced by `git.clone` as `{{outputs.identify-repos}}`.

**Does not require** `instruction` field (infrastructure step).

---

## ci.executeWorkflow

Trigger an external CI/CD pipeline.

```json
{
  "action": "ci.executeWorkflow",
  "params": {
    "repoFullName": "{{trigger.repository.fullName}}",
    "workflowId": "test-suite.yml",
    "ref": "{{trigger.pullRequest.headBranch}}",
    "inputs": {
      "test_type": "integration",
      "environment": "staging"
    },
    "waitForCompletion": true
  }
}
```

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `repoFullName` | string | Yes | — | Repository identifier with provider inference |
| `workflowId` | string | Yes | — | Workflow filename, pipeline ID, or YAML path |
| `ref` | string | No | — | Branch or tag reference |
| `inputs` | Record<string, string> | No | — | Key-value workflow input parameters |
| `waitForCompletion` | boolean | No | — | Block until pipeline finishes |

**Does not require** `instruction` field (infrastructure step).

---

## Workflow-Level Configuration

These fields go in `workflow.definition`:

```json
{
  "definition": {
    "version": "1.0.0",
    "name": "Workflow Name",
    "triggers": [...],
    "steps": [...],
    "flow": [...],
    "priority": 3,
    "timeoutMs": 7200000,
    "statusUpdateMethod": "comment",
    "defaultModelKey": null
  }
}
```

| Field | Type | Default | Validation | Description |
|-------|------|---------|------------|-------------|
| `version` | string | — | Required | Schema version (always `"1.0.0"`) |
| `name` | string | — | Required | Workflow display name |
| `priority` | integer | 5 | 1-100 | Execution priority (lower = higher priority). Built-in playbooks use 1-10. |
| `timeoutMs` | number | — | Min: 30000 | Abort workflow after this time in milliseconds |
| `statusUpdateMethod` | string | `"comment"` | `"comment"` \| `"reuse_comment"` \| `"static_comment"` | How status updates appear |
| `defaultModelKey` | string \| null | null | Must be valid model key | Default LLM model for all agent steps |

### Status Update Methods

| Method | Behavior |
|--------|----------|
| `"comment"` | Creates a new comment per workflow execution |
| `"reuse_comment"` | Reuses an existing status comment (updates in place) |
| `"static_comment"` | Creates initial comment, then only updates on completion |

## Step-Level Configuration

| Field | Type | Validation | Description |
|-------|------|------------|-------------|
| `stepMaxDurationMinutes` | number | Min: 1 | Maximum duration for individual step execution |

## Step ID Validation

Step IDs must match: `^[a-zA-Z0-9-]+$`

- Letters, numbers, and hyphens only
- Must be unique within the workflow
- Must match the corresponding `.md` prompt filename (without extension)
