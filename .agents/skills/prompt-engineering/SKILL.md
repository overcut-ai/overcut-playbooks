---
name: Prompt Engineering for Overcut Workflows
description: >
  Guide for writing effective step prompts, structuring agent output,
  designing delegation patterns, and handling errors in Overcut workflow
  prompts. Use when writing step prompt files, structuring agent output
  formats, designing coordinator delegation, handling errors in prompts,
  or writing instructions for agents.
---

# Prompt Engineering for Overcut Workflows

This skill covers best practices for writing step prompt files (`.md`) that produce reliable, parseable results and work well within the Overcut workflow system.

## Core Principles

### 1. Structured Output for Downstream Parsing

Agent step outputs are passed to downstream steps via `{{outputs.step-id.message}}`. Use structured key:value formats so the next step can reliably parse the result:

```markdown
## Output Requirements

When the step completes, you MUST output:

status: ready
base_branch: main
total_findings: 12
```

**Not** free-form prose that's hard to parse.

### 2. Tool Constraint Tables

Always specify exactly which tools the agent may use. This prevents unnecessary API calls and keeps agents focused:

```markdown
### Allowed Tools
| Tool | Purpose |
|------|---------|
| `read_file` | ONLY for `.overcut/review/scratchpad.jsonl` |
| `write_file` | ONLY for `.overcut/review/scratchpad.chunk*.jsonl` |
| `task_completed` | Finish the task |

### Prohibited Tools
❌ `code_search` — no code searching needed
❌ `run_terminal_cmd` — no terminal commands
```

### 3. Context Preservation for Zero-Memory Agents

Sub-agents in `agent.session` have **no memory between delegations**. Every delegation must be self-contained:

- Include the complete schema/format requirements
- Include all file paths and references
- Include the full task description — don't say "continue from where you left off"
- Paste previous step output inline: `{{outputs.previous-step.message}}`

### 4. Max Iteration Limits

For iterative processes, always set explicit limits to prevent infinite loops:

```markdown
**Maximum 3 revision cycles.** If the review still finds issues after 3 revisions,
proceed with the current version and note remaining issues in the output.
```

### 5. File Path Conventions

- **Workspace root files**: Use `.overcut/` prefix for intermediate data (e.g., `.overcut/review/scratchpad.jsonl`)
- **Paths are relative** to the workspace root — do NOT use absolute `/workspace/` paths
- **Cloned repos** appear under the workspace root at a path like `owner/repo/` — keep scratchpad files OUTSIDE cloned repo folders

## Output Format Conventions

### Simple Key:Value

For status and metadata that downstream steps need to parse:

```
status: ready
base_branch: main
chunks_created: yes
total_chunks: 3
chunk_files: .overcut/review/scratchpad.chunk1.jsonl, .overcut/review/scratchpad.chunk2.jsonl
```

### Structured Sections

For richer output with both parseable headers and detailed content:

```
status: ready
base_branch: feature/dependency-x

## Scope

### This Ticket
- #123: Implement user authentication

### Related Tickets (Out of Scope)
- #124: Add password reset — Status: in-progress
- #125: Add 2FA — Status: open
```

### JSONL for Large Data

When a step produces many structured items, write them to a JSONL file rather than including in the output message:

```markdown
Append each finding as a JSON line to `.overcut/review/scratchpad.jsonl`:

{"file": "src/auth.ts", "importance": "major", "title": "Missing validation", "message": "..."}
{"file": "src/api.ts", "importance": "minor", "title": "Unused import", "message": "..."}
```

## Advanced Patterns

### Blocking/Gating Pattern

A step can block the entire workflow by outputting `status: blocked`:

```markdown
### If Blocked

status: blocked
blocker: #456 — dependency ticket has no PR yet

The downstream step checks: if status is "blocked", use `task_completed` and stop.
```

### Conditional Skipping

A step can signal that subsequent work should be skipped:

```markdown
If no changes are needed, output: `SKIP: [reason]`
If changes are needed, output: `PROCEED: [details]`
```

The next step checks the prefix to decide whether to execute.

### Progress Tracking via PR Comments

For long-running steps, use PR comment checkboxes to show progress:

```markdown
Post a PR comment with this checklist and update it as phases complete:

## Implementation Progress
- [x] Phase 1: Database schema changes
- [ ] Phase 2: API endpoint updates
- [ ] Phase 3: Frontend integration
```

### Idempotency Markers

When a step updates content that might already exist (e.g., PR descriptions), use HTML comment markers:

```markdown
Look for existing markers:
<!-- overcut:pr-description:start -->
...existing content...
<!-- overcut:pr-description:end -->

If markers exist, replace only the content between them.
If markers don't exist, append the new content.
```

### Cross-Workflow Triggering

A step can trigger another workflow by posting a slash command:

```markdown
After completing the remediation plan, post a comment with `/pr` to trigger
the Create PR from Design workflow to implement the fix.
```

### Delegation Templates

In coordinator prompts, use complete self-contained delegation blocks. See the `agent-session-design` skill for the template pattern.

## Prompt Structure Template

A well-structured step prompt follows this pattern:

```markdown
You are [role description].

## Mission
[What the agent should accomplish — 1-2 sentences]

## Context
[Input data, previous step output references, file locations]

## Process
### Step 0 — Acknowledge
Update status with `update_status` tool.

### Step 1 — [First action]
[Detailed instructions]

### Step 2 — [Second action]
[Detailed instructions]

## Output Requirements
[Structured key:value format for downstream parsing]

## Behavior Rules
• [Specific constraints]
• [What NOT to do]
• [Error handling instructions]
```

For detailed pattern examples extracted from real playbooks, see `references/advanced-patterns.md`.
