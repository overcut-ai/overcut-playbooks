---
name: Agent Tools Reference
description: >
  Reference for available agent tools, built-in agent type tool presets,
  and the memory system. Use when configuring agent capabilities, choosing
  which tools agents need, understanding the memory system, selecting an
  agent base type, or checking what tools are available for agents.
---

# Agent Tools Reference

This skill covers the tools available to Overcut agents, built-in agent type presets, and the persistent memory system.

## Tool Categories Overview

Overcut provides 40 user-configurable tools plus 10 system tools, organized by category:

| Category | Tools | Count |
|----------|-------|-------|
| **File System** | CreateDirectory, ListDirectory, ReadFile, WriteFile, DeleteFile, EditFile, AppendFile | 7 |
| **Code Utilities** | ListCodeDefinitionNames, CodeSearch, SemanticCodeSearch, RunTerminalCmd, GetDiagnostics | 5 |
| **Tickets/Issues** | CreateTicket, UpdateTicket, ListTickets, ReadTicket, AddCommentToTicket, UpdateCommentOnTicket | 6 |
| **Pull Requests** | CreatePullRequest, ReadPullRequest, UpdatePullRequest, ListPullRequests, MergePullRequest, AddCommentToPullRequest, UpdateCommentOnPullRequest, ClosePullRequest | 8 |
| **Code Review** | AddPullRequestReviewThread, SubmitReview, AddPullRequestReviewThreadReply, GetPullRequestDiff, GetPullRequestDiffLineNumbers | 5 |
| **CI/CD** | GetCiRunDetails, GetCiRunLogs, ListPrCiRuns, GetCiJobLogs, RetryCiWorkflow | 5 |
| **Attachments** | GetTicketAttachments, GetPullRequestAttachments | 2 |
| **Exploration** | ExploreCodebase | 1 |
| **Memory** (auto-injected) | MemoryWrite, MemoryRead | 2 |
| **Scratchpad** (auto-injected) | WriteScratchpad, ReadScratchpad, ListScratchpads, AppendScratchpad | 4 |
| **Coordinator-only** (auto-injected) | DelegateToSubAgent, UpdateStatus, TaskCompletedTool | 3 |

## Built-in Agent Types

When creating agents in Overcut, you select a base type that determines the default tool set:

| Agent Type | Tools | Focus |
|------------|-------|-------|
| **SeniorDeveloper** | 31 tools | Full-stack development: all file, code, ticket, PR, CI/CD, and exploration tools |
| **CodeReview** | 26 tools | Code review: read-only file access + append, code search, review tools, PR read/update, CI read tools |
| **TechWriter** | 25 tools | Documentation: full file access, code search, ticket and PR tools |
| **ProductManager** | 20 tools | Planning: read-only file access, code search, ticket CRUD, PR read/update |
| **ExploreAgent** | 5 tools | Exploration: ReadFile, ListDirectory, CodeSearch, SemanticCodeSearch, RunTerminalCmd |

**Key differences:**
- **SeniorDeveloper** can create PRs, merge PRs, delete files — full write access
- **CodeReview** cannot create PRs or delete files, but can submit reviews and append to files
- **TechWriter** has nearly the same tools as SeniorDeveloper (full write access for docs)
- **ProductManager** cannot create PRs, write files, or delete files — primarily read + ticket management
- **ExploreAgent** is minimal — read-only code exploration only

### Automatic Tool Injection

Regardless of base type, these tools are **automatically added** at runtime:
- **Memory tools** (`memory_write`, `memory_read`) — added to all agents (coordinator and sub-agents)
- **Scratchpad tools** (`write_scratchpad`, `read_scratchpad`, `list_scratchpads`, `append_scratchpad`) — added to all agents (coordinator and sub-agents)
- **Coordinator tools** (`delegate_to_sub_agent`, `update_status`, `task_completed`) — added only to coordinator agents in `agent.session` steps

## Memory System

The memory system allows agents to persist and retrieve learnings across workflow executions.

### memory_write

```json
{
  "title": "Short summary of the learning (1 line)",
  "content": "Full details of the learning"
}
```

- `title`: Short summary used as the identifier (1 line)
- `content`: Full details of the learning

### memory_read

```json
{
  "title": "Memory title to retrieve"
}
```

- `title`: Case-insensitive match against stored memory titles

### Memory Behavior

- Memories persist across workflow executions for the same agent
- Auto-injected into agent context at the start of each execution
- Use for: repository conventions, past review patterns, common issues, team preferences
- Keep titles descriptive and unique for reliable retrieval

## Scratchpad System

The scratchpad system provides ephemeral, per-run storage for sharing structured data between agents within a single workflow execution.

### write_scratchpad

```json
{
  "name": "Scratchpad name (e.g., 'review-findings', 'chunk-1')",
  "content": "Content to write (overwrites existing)"
}
```

- `name`: Identifier for the scratchpad (use kebab-case, descriptive names)
- `content`: Full content to write (replaces any existing content)

### read_scratchpad

```json
{
  "name": "Scratchpad name to read"
}
```

- `name`: Exact name of the scratchpad to read

### list_scratchpads

```json
{}
```

No parameters. Returns all scratchpad names in the current run.

### append_scratchpad

```json
{
  "name": "Scratchpad name to append to",
  "content": "Content to append"
}
```

- `name`: Scratchpad to append to (creates it if it doesn't exist)
- `content`: Content to append (added after existing content)

### Scratchpad Behavior

- Scratchpads are **ephemeral** — they exist only for the duration of the workflow run
- Auto-injected into all agents (coordinator and sub-agents)
- Use for: intermediate findings, chunk data, structured results shared between steps or agents
- `append_scratchpad` is safe for concurrent writes from parallel agents
- Use kebab-case names (e.g., `review-findings`, `chunk-1`, `security-analysis`)

### Scratchpad vs Memory

| | Scratchpad | Memory |
|---|---|---|
| **Lifetime** | Single workflow run | Persists across runs |
| **Purpose** | Share data between agents/steps | Store learnings for future runs |
| **Concurrency** | `append_scratchpad` is safe for parallel writes | Not designed for concurrent access |
| **Use when** | Passing intermediate data (findings, chunks) | Saving patterns, conventions, preferences |

## Tool Selection for Prompts

When writing step prompts, restrict tools to only what's needed. Use allowed/prohibited tool tables:

```markdown
### Allowed Tools
| Tool | Purpose |
|------|---------|
| `read_file` | Read source files for analysis |
| `code_search` | Find relevant code patterns |
| `append_scratchpad` | Store findings for downstream steps |
| `add_comment_to_pull_request` | Post review summary |

### Prohibited Tools
❌ `write_file` — this is a read-only analysis step
❌ `run_terminal_cmd` — no terminal commands needed
❌ `create_pull_request` — PR already exists
```

This pattern appears in many real playbooks and significantly improves agent focus and efficiency.

For the complete tool listing with tool identifiers, see `references/tool-catalog.md`.
