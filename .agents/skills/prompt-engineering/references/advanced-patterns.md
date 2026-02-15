# Advanced Prompt Patterns Reference

Patterns extracted from real Overcut playbooks. Each pattern includes when to use it, how it works, and a concrete example.

## 1. Blocking/Gating Pattern

**When to use**: A step must analyze prerequisites and potentially stop the workflow before costly steps run.

**How it works**: The step outputs `status: blocked` with a reason. The next step checks for this status and calls `task_completed` immediately if blocked.

**Example** (from create-pr-from-design/prep-context):

```markdown
## Output Requirements

### If Ready to Proceed

status: ready
base_branch: main

## Scope
### This Ticket
- #123: Implement user authentication

### If Blocked

status: blocked
blocker: #456 — dependency ticket has no PR yet, code not available
```

The downstream step then checks:

```markdown
**Previous step output:**
{{outputs.prep-context.message}}

1. Parse the `status` field from the previous step's output.
2. If `status` is "blocked": use `task_completed` and STOP.
3. If `status` is "ready": proceed to planning.
```

## 2. Conditional Skipping (SKIP/PROCEED)

**When to use**: A step may determine that subsequent processing is unnecessary.

**How it works**: The step outputs a prefixed message (`SKIP:` or `PROCEED:`) that the next step parses to decide whether to execute.

**Example** (from auto-pr-description):

The prepare-pr-description step analyzes the PR and may determine the description is already adequate:

```markdown
If no update is needed:
Output: SKIP: PR description is already complete and accurate.

If an update is needed:
Output: PROCEED: [generated description content]
```

The update-pr-description step checks:

```markdown
{{outputs.prepare-pr-description.message}}

1. If the output starts with "SKIP:", use `task_completed` with the skip reason. Do NOT update the PR.
2. If the output starts with "PROCEED:", extract the description and update the PR.
```

## 3. Iterative Review Loops

**When to use**: A step needs a draft → review → revise cycle with quality gates.

**How it works**: The coordinator delegates drafting, then review, and revises if needed — up to a maximum iteration count.

**Example** (pattern used in technical-design-proposal and requirements-document-generation):

```markdown
## Process

### Iteration Loop (Maximum 3 cycles)

1. **Draft**: Delegate to TechWriter to produce the document draft
2. **Review**: Delegate to ProductManager to review against requirements
3. **Decision**:
   - If review passes: proceed to finalization
   - If review finds issues AND iteration < 3: delegate revision back to TechWriter
   - If iteration >= 3: proceed with current version, note outstanding issues

### Finalization
Delegate to TechWriter for final formatting and post the result.
```

**Key constraints**:
- Always set an explicit max iteration count (typically 2-3)
- Track iteration count in coordinator logic
- Have a clear "good enough" exit path when max iterations reached

## 4. Scratchpad Pattern

**When to use**: A step produces large intermediate data (many findings, analysis results) that should be stored as files rather than passed as text output.

**How it works**: Steps write to `.overcut/` directory at the workspace root using JSONL format for structured data.

**Example** (from code-review):

```markdown
Append each finding as a JSON line to `.overcut/review/scratchpad.jsonl`
(this is a relative path from the workspace root — do NOT write inside the cloned repo folder).

Schema for each finding:
{"file": "path/to/file", "importance": "blocker|major|minor|nit", "title": "Short handle", "message": "1-2 sentence comment", "suggested_fix": "Optional guidance", "line": "", "side": "RIGHT|LEFT|UNKNOWN"}
```

**Downstream processing** splits the scratchpad into chunks:

```markdown
Write each chunk as a JSONL file named `.overcut/review/scratchpad.chunk{N}.jsonl`
```

**Key conventions**:
- Always use `.overcut/` prefix at workspace root
- Use JSONL format (one JSON object per line) for easy parsing and splitting
- Keep scratchpad files OUTSIDE cloned repo folders
- Use relative paths (not absolute `/workspace/` paths)

## 5. Progress Tracking via PR Comments

**When to use**: Long-running steps (implementation, multi-phase work) where users need visibility into progress.

**How it works**: The step posts a PR comment with a checklist and updates it as phases complete.

**Example** (from create-pr-from-design/implement-changes):

```markdown
Post a progress comment on the PR:

## Implementation Progress
- [ ] Phase 1: Database schema changes
- [ ] Phase 2: API endpoint updates
- [ ] Phase 3: Frontend integration
- [ ] Phase 4: Test coverage

After completing each phase, update the comment to check off the completed item.
Use `update_comment_on_pull_request` to modify the existing comment.
```

## 6. Cross-Workflow Triggering

**When to use**: One workflow's output should automatically kick off another workflow.

**How it works**: A step posts a slash command comment on a PR or issue, which triggers the target workflow's manual trigger.

**Example** (from remediate-cves/post-remediation-plan):

```markdown
After posting the remediation plan, if the plan recommends immediate implementation:
Post a comment on the issue with `/pr` to trigger the Create PR from Design workflow.
```

This works because the Create PR from Design workflow has a manual trigger for the `/pr` slash command.

## 7. Idempotency Markers

**When to use**: A step updates content that might already exist from a previous execution (e.g., PR descriptions, comments).

**How it works**: Use HTML comment markers to delimit auto-generated sections. On re-execution, replace only the marked section.

**Example** (from auto-pr-description):

```markdown
## Update Strategy

1. Read the current PR description.
2. Look for existing markers:
   <!-- overcut:pr-description:start -->
   ...existing auto-generated content...
   <!-- overcut:pr-description:end -->
3. If markers exist: replace ONLY the content between them, preserving everything else.
4. If markers don't exist: append the new section with markers at the end.
5. Always preserve any user-written content outside the markers.
```

**Key conventions**:
- Use `<!-- overcut:{feature}:start -->` and `<!-- overcut:{feature}:end -->` markers
- Preserve all user content outside markers
- Check for existing markers before inserting new ones

## 8. Delegation Templates with Tool Budgets

**When to use**: In coordinator prompts where sub-agents need strict tool constraints to prevent unnecessary API calls.

**How it works**: The delegation template includes an explicit tool budget alongside allowed/prohibited tables.

**Example** (from code-review/submit-review delegation):

```markdown
## ⚠️ CRITICAL TOOL CONSTRAINTS

### Allowed Tools
| Tool | Purpose | Max Calls |
|------|---------|-----------|
| `read_file` | ONLY for `{chunkFile}` | 1 |
| `get_pull_request_diff_line_numbers` | Resolve line numbers | 1 per file |
| `add_pull_request_review_thread` | Post each comment | 1 per finding |

**Tool budget: 1 call to get_pull_request_diff_line_numbers per file, and 1 call to post review comment + 1 initial read.**

### Prohibited Tools
❌ `run_terminal_cmd` — no terminal commands, no git commands
❌ `read_file` on any file other than `{chunkFile}` — no source code reads
❌ `submit_review` — the coordinator will submit later
```

**Key conventions**:
- Include "Max Calls" column in the allowed tools table
- State the total tool budget explicitly
- List prohibited tools with reasons
- Include error handling instructions (what to do when a tool call fails)

## 9. Parallel Delegation Pattern

**When to use**: A coordinator has multiple independent tasks that don't depend on each other's output — e.g., reviewing different aspects of the same PR, processing separate chunk files, or analyzing independent components.

**How it works**: The coordinator issues multiple `delegate_to_sub_agent` calls in a single turn. The runtime executes them concurrently, reducing total wall-clock time compared to sequential delegation.

**Example — parallel aspect reviews on a PR**:

```markdown
## Step 2 — Parallel Review Delegations

Delegate ALL of the following reviews in a single turn (do NOT wait for one to finish before starting the next):

1. Delegate to **Security Reviewer**:
   Review the PR for security concerns: injection risks, auth bypasses, secret exposure, insecure defaults.
   Chunk file: `.overcut/review/security-findings.jsonl`

2. Delegate to **Performance Reviewer**:
   Review the PR for performance implications: N+1 queries, missing indexes, unbounded loops, memory leaks.
   Chunk file: `.overcut/review/performance-findings.jsonl`

3. Delegate to **API Reviewer**:
   Review the PR for API contract changes: breaking changes, missing versioning, undocumented endpoints.
   Chunk file: `.overcut/review/api-findings.jsonl`

Issue all three delegations in the same response. After all three return, aggregate their findings and proceed to Step 3.
```

**Example — parallel chunk file processing**:

```markdown
## Step 2 — Process All Chunks in Parallel

Delegate ALL chunk files in a single turn — do NOT process them one at a time:

For each chunk file from the list: delegate to **Code Reviewer** with the chunk-processing template (see below).

Issue all delegations in the same response.
```

**Key conventions**:
- Each parallel delegation must be fully self-contained — no shared mutable state
- Explicitly instruct: "Issue all delegations in the same response" / "do NOT wait for one to finish"
- If parallel agents write to files, use separate output files to avoid conflicts
- Aggregate results only after ALL parallel delegations complete
- Failed parallel tasks can be retried independently without re-running successful ones
- When NOT to use: tasks with data dependencies where one delegation's output feeds into the next

## 10. Structured Error Handling

**When to use**: Steps that interact with external tools that might fail (API calls, file reads, git operations).

**How it works**: The prompt specifies exactly what to do in each failure mode.

**Example** (from code-review/submit-review):

```markdown
## Line Number Resolution Failure Handling

**Case 1 — Line not found but file IS in the diff**:
Post as a file-level comment (omit line number). Move on.

**Case 2 — File is NOT in the PR diff** (empty array):
Post on the first file listed in the PR at line 1, prepend "[Re: {originalFilePath}]". Move on.

In both cases:
- DO NOT retry or investigate further
- DO NOT run git commands, read source files, or use code_search
- DO NOT call get_pull_request_diff_line_numbers a second time for the same finding
- One attempt. If it fails, fall back. Move on.
```

**Key conventions**:
- Enumerate specific failure cases
- Provide concrete fallback actions for each case
- Explicitly state what NOT to do (prevents agents from going down rabbit holes)
- Use "Move on" to prevent retry loops
