---
name: Agent Session Design
description: >
  Guide for designing agent.session steps with coordinator patterns,
  multi-agent delegation, exit criteria, interactive sessions, and
  coordinator tools. Use when creating agent.session steps, writing
  coordinator instructions, setting up multi-agent coordination,
  configuring exit criteria, or designing interactive feedback sessions.
---

# Agent Session Design

This skill covers the `agent.session` action — when to use it, how the coordinator works, and patterns for effective multi-agent coordination.

## When to Use agent.session

Use `agent.session` instead of `agent.run` when a step needs:

1. **Multi-agent delegation** — A coordinator assigns work to specialized sub-agents (e.g., a Code Review Publisher delegates chunk processing to Code Reviewer agents)
2. **Iterative loops** — Draft → review → revise cycles that need supervision to track progress and enforce max iteration limits
3. **Error recovery** — A coordinator can detect sub-agent failures and retry, adjust, or fall back
4. **Verification-heavy tasks** — Each sub-task's output must be confirmed before proceeding to the next
5. **Interactive sessions** — User provides feedback during execution via PR/issue comments

If the task is a simple single-pass operation, use `agent.run` instead.

## Session Parameters

```json
{
  "id": "step-id",
  "action": "agent.session",
  "params": {
    "agentIds": ["agent-id-1", "agent-id-2"],
    "goal": "Brief description of the session goal",
    "exitCriteria": {
      "timeLimit": { "maxDurationMinutes": 30 },
      "userSignals": { "explicit": ["/done", "thanks"] }
    },
    "keepSessionOpenForComments": false,
    "listenToComments": false,
    "agentEngine": "overcut",
    "coordinatorModelKey": null
  }
}
```

| Param | Required | Description |
|-------|----------|-------------|
| `agentIds` | Yes | Array of agent IDs available for delegation |
| `goal` | Yes | Brief session goal description |
| `exitCriteria` | No | Time limits and user signals that end the session |
| `keepSessionOpenForComments` | No | Keep session alive after task_completed for user comments |
| `listenToComments` | No | Receive user comments during execution |
| `agentEngine` | No | `"overcut"` (default) or `"claude"` |
| `coordinatorModelKey` | No | Override LLM model for the coordinator |

## How the Coordinator Works

The coordinator is an orchestration agent that delegates work to sub-agents listed in `agentIds`. Critical rules:

### Zero-Memory Between Delegations

The coordinator has **no persistent memory between delegations**. Each delegation is independent — the coordinator must:
- Pass ALL necessary context in the delegation message
- Not assume sub-agents remember previous delegations
- Include full instructions, schemas, and constraints in each delegation

### Coordinator-Only Tools

The coordinator has access to these exclusive tools:

| Tool | Purpose |
|------|---------|
| `delegate_to_sub_agent` | Assign work to a sub-agent from the `agentIds` list |
| `update_status` | Post status updates visible to the user |
| `task_completed` | Signal that the session is complete and return final output |
| `read_file` | Read files (typically limited to coordination artifacts) |
| `memory_write` / `memory_read` | Persist and retrieve learnings across executions |

The coordinator should **not** perform the actual work (posting comments, writing code, etc.) — that's delegated to sub-agents.

### Delegation Limits

Set explicit max delegation counts in coordinator prompts:
- `Total delegations = (number of chunks) + 1`
- Prevents runaway sessions from consuming resources

## Writing Coordinator Prompts

An effective coordinator prompt has this structure:

1. **Role declaration** — "You are the Coordinator Agent for [purpose]"
2. **Coordinator allowed/prohibited tools** — Explicit tables of what the coordinator can and cannot use
3. **Process steps** — Numbered steps (Step 0: Acknowledge, Step 1: Check prerequisites, etc.)
4. **Delegation templates** — Complete, self-contained instructions to paste into `delegate_to_sub_agent`
5. **Output requirements** — Structured key:value format for downstream steps to parse

### Delegation Template Pattern

When delegating to sub-agents, pass **complete, self-contained instructions**:

```
You are a **[Role Name]**.

## Your Mission
[What the sub-agent should accomplish]

## Context
- [Specific data: file paths, chunk references, etc.]

## Allowed Tools
| Tool | Purpose | Max Calls |
|------|---------|-----------|
| `read_file` | ONLY for `{specific_file}` | 1 |
| `add_pull_request_review_thread` | Post each comment | 1 per finding |

## Prohibited Tools
❌ `run_terminal_cmd` — no terminal commands
❌ `code_search` — no code searching

## Instructions
1. [Step-by-step process]

## Expected Output
Return only: "[specific format]"
```

### Tool Constraint Tables

Always include explicit allowed/prohibited tool tables in both coordinator and delegation prompts. This prevents agents from making unnecessary API calls:

```markdown
### Allowed Tools
| Tool | Purpose |
|------|---------|
| `read_file` | ONLY for `.overcut/review/scratchpad.jsonl` |
| `write_file` | ONLY for `.overcut/review/scratchpad.chunk*.jsonl` |

### Prohibited Tools
❌ `code_search` — no code searching needed
❌ `run_terminal_cmd` — no terminal commands
```

## Interactive Sessions

For workflows that accept user feedback during execution:

```json
{
  "listenToComments": true,
  "keepSessionOpenForComments": true
}
```

- **`listenToComments: true`** — Session receives PR/issue comments as input during execution
- **`keepSessionOpenForComments: true`** — Session stays alive after `task_completed` to handle follow-up comments

Use this for review sessions, iterative design feedback, or approval workflows.

## Exit Criteria

### Time Limit

```json
{
  "exitCriteria": {
    "timeLimit": { "maxDurationMinutes": 30 }
  }
}
```

Default: 10 minutes. Sets the maximum session duration.

### User Signals

```json
{
  "exitCriteria": {
    "userSignals": { "explicit": ["/done", "thanks"] }
  }
}
```

The session ends when a user posts one of these exact strings as a comment (requires `listenToComments: true`).

## Common Patterns

### Chunk Processing Pattern

1. Previous step creates chunk files (`.overcut/review/scratchpad.chunk{N}.jsonl`)
2. Coordinator reads chunk list from previous step's output
3. Delegates one sub-agent per chunk file
4. Aggregates results
5. Delegates one final sub-agent for summary/submission

### Parallel Delegation Pattern

When multiple tasks are independent and don't depend on each other's output, the coordinator should delegate them **all in the same turn** rather than sequentially. The runtime executes parallel delegations concurrently, significantly reducing total session time.

**When to use**: Tasks that operate on separate files, separate review areas, or separate concerns with no data dependencies between them.

**How it works**: The coordinator calls `delegate_to_sub_agent` multiple times in a single response. All delegations execute concurrently and their results are returned together.

**Example — parallel review delegations**:

```markdown
## Step 2 — Parallel Review Delegations

Delegate ALL of the following reviews in a single turn (do NOT wait for one to finish before starting the next):

1. Delegate to **Security Reviewer**: review security concerns in the PR
2. Delegate to **Performance Reviewer**: review performance implications
3. Delegate to **API Reviewer**: review API contract changes

These three reviews are independent — each examines different aspects of the same PR.
Issue all three delegations in the same response.

After all three return, aggregate their findings and proceed to Step 3.
```

**Example — parallel chunk processing**:

```markdown
## Step 2 — Process Chunks in Parallel

Delegate ALL chunk files in a single turn:
- Delegate chunk1.jsonl to Code Reviewer
- Delegate chunk2.jsonl to Code Reviewer
- Delegate chunk3.jsonl to Code Reviewer

Issue all delegations in the same response. Do NOT process them one at a time.
```

**Key rules for parallel delegation**:
- Each delegation must be fully self-contained (no shared state between parallel tasks)
- The coordinator must explicitly instruct agents not to modify files that other parallel agents might read
- Aggregate results only after ALL parallel delegations return
- If one parallel task fails, the coordinator can retry it independently

**When NOT to use**: Tasks where output from one delegation feeds into the next (use sequential delegation instead).

### Iterative Review Pattern

1. Coordinator delegates "draft" to sub-agent
2. Coordinator delegates "review" to a different sub-agent
3. If review finds issues, coordinator delegates "revise" back to first agent
4. Repeat up to max iterations (set in prompt, e.g., "Maximum 3 revision cycles")
5. Coordinator submits final result

For coordinator tool details and real-world examples, see `references/coordinator-tools.md`.
