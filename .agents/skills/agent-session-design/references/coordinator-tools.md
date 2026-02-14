# Coordinator Tools & Patterns Reference

## Coordinator-Only Tools

These tools are automatically injected into the coordinator agent in `agent.session` steps. They are not available to regular agents or sub-agents.

### delegate_to_sub_agent

Assigns work to a sub-agent from the `agentIds` list.

**Usage in prompts**: The coordinator calls this tool to delegate a complete, self-contained task to one of the available sub-agents. The delegation message must include all context the sub-agent needs — sub-agents have no memory of previous delegations.

**Key behaviors**:
- Sub-agent receives the delegation message as its sole instruction
- Sub-agent has access to its configured tools (based on agent type)
- Sub-agent returns a text response when done
- Coordinator receives the sub-agent's response and can use it in subsequent logic

### update_status

Posts a status update visible to the user (typically as a comment on the triggering PR/issue).

**Use for**: Progress notifications, phase transitions, acknowledgments.

```
Coordinator: "Starting code review analysis..."
Coordinator: "Processing chunk 3 of 5..."
Coordinator: "Review complete. Submitting final results."
```

### task_completed

Signals that the session is complete and returns the final output message.

**Key behaviors**:
- The message passed to `task_completed` becomes `{{outputs.step-id.message}}` for downstream steps
- After calling this, the session ends (unless `keepSessionOpenForComments: true`)
- Must be the coordinator's final action

## Memory Tools (All Agents)

These tools are injected into all agents (coordinators and sub-agents alike).

### memory_write

```json
{
  "title": "Short summary of the learning (1 line)",
  "content": "Full details of the learning"
}
```

Persists a learning that will be available in future executions of the same agent.

### memory_read

```json
{
  "title": "Memory title to retrieve"
}
```

Retrieves a stored memory by title (case-insensitive match).

## Writing Effective Coordinator Prompts

### Structure Template

```markdown
You are the **Coordinator Agent** for [purpose].

## ⚠️ COORDINATOR RULES

### Coordinator Allowed Tools
| Tool | Purpose |
|------|---------|
| `update_status` | Notify progress |
| `read_file` | ONLY for specific coordination files |
| `delegate_to_sub_agent` | Delegate work to sub-agents |
| `task_completed` | Finish the session |

### Prohibited at Coordinator Level
❌ `add_comment_to_pull_request` — only sub-agents post comments
❌ `run_terminal_cmd` — no terminal commands
❌ `code_search` — no code searching

### Max Delegations
Total delegations = [formula based on workload]

## Process

### Step 0 — Acknowledge
Use `update_status` to notify the user.

### Step 1 — [Preparation]
[Read coordination files, parse previous step output]

### Step 2 — [Delegation Loop]
For each [unit of work]:
- Delegate to [Agent Name] using the template below

### Step 3 — [Finalization]
Delegate final submission to [Agent Name]

### Step 4 — Complete
Use `task_completed` with structured output.

## Delegation Templates

### Template for Step 2
[Complete, self-contained delegation block]

### Template for Step 3
[Complete, self-contained delegation block]

## Output Requirements
[Structured key:value format]
```

### Delegation Message Best Practices

1. **Self-contained**: Include everything the sub-agent needs — file paths, schemas, constraints
2. **Explicit tool constraints**: Allowed/prohibited tool tables
3. **Explicit max tool calls**: Budget tool usage (e.g., "1 call per file")
4. **Expected output format**: Tell the sub-agent exactly what to return
5. **Error handling**: What to do if a tool call fails

### Common Mistakes to Avoid

- Coordinator performing work that should be delegated (posting comments, writing files)
- Not including complete context in delegation messages
- Delegating trivial tasks (counting, string parsing) that the coordinator should do directly
- Missing max delegation limits, leading to runaway sessions
- Not checking previous step output before proceeding

## Real-World Coordinator Examples

### Code Review: Submit Review (Chunk Processing)

The submit-review step in the code-review playbook demonstrates the chunk processing pattern:

1. **Step 0**: Acknowledge via `update_status`
2. **Step 1**: Parse previous step's output for chunk list (`chunks_created`, `total_chunks`, `chunk_files`)
3. **Step 2**: For each chunk file, delegate to Code Reviewer with a complete delegation template that includes:
   - Specific chunk file path
   - Allowed tools table (read_file for chunk only, get_pull_request_diff_line_numbers, add_pull_request_review_thread)
   - Prohibited tools table (run_terminal_cmd, code_search, submit_review, etc.)
   - Error handling for line number resolution failures
   - Expected output format: `"posted {count} comments from {chunkFile}"`
4. **Checkpoint**: Aggregate results from all sub-agents (coordinator does this directly, no delegation)
5. **Step 3**: Delegate review finalization to Code Reviewer with template for submitting the review summary
6. **Step 4**: Use `task_completed` with final status

**Key patterns from this example:**
- Coordinator reads chunk files with `read_file` but never posts PR comments directly
- Each delegation template includes complete context (file paths, tool constraints, schema)
- Error handling is specified at the delegation level (what sub-agent should do if tool calls fail)
- Explicit delegation count: `(number of chunks) + 1`

### Create PR from Design: Implement Changes (Phased Implementation)

The implement-changes step demonstrates the phased execution pattern:

1. Coordinator breaks the plan into sequential phases
2. For each phase: delegate to Developer agent with phase-specific instructions
3. After each delegation: coordinator verifies the work was committed and pushed
4. Progress tracked via PR comment checkboxes
5. Final delegation for cleanup and summary

**Key patterns from this example:**
- Sequential delegation with verification between phases
- Progress tracking via PR comment updates
- Each phase commit is pushed immediately to the remote branch
- Coordinator verifies git state between delegations

## Coordinator Decision Flowchart

```
Is this a simple, single-pass task?
├── Yes → Use agent.run
└── No → Does it need coordination?
    ├── Multi-agent delegation → agent.session
    ├── Iterative loops → agent.session
    ├── Error recovery needed → agent.session
    ├── Verification between steps → agent.session
    └── Interactive user feedback → agent.session + listenToComments
```
