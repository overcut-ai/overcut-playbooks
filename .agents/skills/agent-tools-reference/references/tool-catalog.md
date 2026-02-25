# Agent Tool Catalog

Complete listing of all agent tools with their identifiers and categories.

## File System Tools (7)

| Tool ID | Display Name | Description |
|---------|-------------|-------------|
| `create_directory` | Create Directory | Create a new directory |
| `list_dir` | List Directory | List contents of a directory |
| `read_file` | Read File | Read file contents |
| `write_file` | Write File | Write content to a file (create or overwrite) |
| `delete_file` | Delete File | Delete a file |
| `edit_file` | Edit File | Edit specific parts of a file |
| `append_file` | Append File | Append content to an existing file |

## Code Utility Tools (5)

| Tool ID | Display Name | Description |
|---------|-------------|-------------|
| `list_code_definition_names` | List Code Definition Names | List function/class definitions in a file |
| `code_search` | Search Code | Text-based code search across the workspace |
| `semantic_code_search` | Semantic Code Search | AI-powered semantic search for code patterns |
| `run_terminal_cmd` | Execute Terminal Commands | Run shell commands in the workspace |
| `get_diagnostics` | Get Diagnostics | Get code diagnostics (errors, warnings) |

## Ticket/Issue Tools (6)

| Tool ID | Display Name | Description |
|---------|-------------|-------------|
| `create_ticket` | Create Ticket | Create a new issue/ticket |
| `update_ticket` | Update Ticket | Update an existing issue/ticket |
| `list_tickets` | List Tickets | List issues/tickets with filters |
| `read_ticket` | Read Ticket | Read full ticket details and comments |
| `add_comment_to_ticket` | Add Comment to Ticket | Post a comment on an issue/ticket |
| `update_comment_on_ticket` | Update Comment on Ticket | Edit an existing comment on an issue/ticket |

## Pull Request Tools (8)

| Tool ID | Display Name | Description |
|---------|-------------|-------------|
| `create_pull_request` | Create Pull Request | Create a new PR |
| `read_pull_request` | Read Pull Request | Read full PR details |
| `update_pull_request` | Update Pull Request | Update PR title, body, or metadata |
| `list_pull_requests` | List Pull Requests | List PRs with filters |
| `merge_pull_request` | Merge Pull Request | Merge a PR |
| `add_comment_to_pull_request` | Add Comment to Pull Request | Post a standalone comment on a PR |
| `update_comment_on_pull_request` | Update Comment on Pull Request | Edit an existing PR comment |
| `close_pull_request` | Close Pull Request | Close a PR without merging |

## Code Review Tools (5)

| Tool ID | Display Name | Description |
|---------|-------------|-------------|
| `add_pull_request_review_thread` | Add Review Comment | Post an inline review comment on a specific line |
| `submit_review` | Submit Review | Submit a formal review (APPROVE/COMMENT/REQUEST_CHANGES) |
| `add_pull_request_review_thread_reply` | Reply To Review Comment | Reply to an existing review thread |
| `get_pull_request_diff` | Get Pull Request Diff | Fetch the full PR diff |
| `get_pull_request_diff_line_numbers` | Get Pull Request Diff Line Numbers | Get diff line numbers for a specific file |

## Attachment Tools (2)

| Tool ID | Display Name | Description |
|---------|-------------|-------------|
| `get_ticket_attachments` | Get Ticket Attachments | Retrieve attachments from a ticket |
| `get_pull_request_attachments` | Get Pull Request Attachments | Retrieve attachments from a PR |

## CI/CD Tools (5)

| Tool ID | Display Name | Description |
|---------|-------------|-------------|
| `get_ci_run_details` | Get CI Run Details | Retrieves status, timing, and job details for a CI workflow run |
| `get_ci_run_logs` | Get CI Run Logs | Fetches concatenated log output from all jobs in a CI workflow run |
| `list_pr_ci_runs` | List PR CI Runs | Lists CI workflow runs associated with a pull request |
| `get_ci_job_logs` | Get CI Job Logs | Fetches log output for a specific job within a CI workflow run |
| `retry_ci_workflow` | Retry CI Workflow | Triggers a new run of a CI workflow or pipeline |

### get_ci_run_details Parameters

```json
{
  "projectOrRepoFullName": "owner/repo (required)",
  "runId": "CI workflow run ID (required)",
  "pipelineId": "Azure DevOps pipeline ID (optional)"
}
```

### get_ci_run_logs Parameters

```json
{
  "projectOrRepoFullName": "owner/repo (required)",
  "runId": "CI workflow run ID (required)",
  "pipelineId": "Azure DevOps pipeline ID (optional)"
}
```

### list_pr_ci_runs Parameters

```json
{
  "projectOrRepoFullName": "owner/repo (required)",
  "prId": "Pull request number or MR IID (required)"
}
```

### get_ci_job_logs Parameters

```json
{
  "projectOrRepoFullName": "owner/repo (required)",
  "runId": "CI workflow run ID (required)",
  "jobId": "Specific job or step ID within the run (required)",
  "pipelineId": "Azure DevOps pipeline ID (optional)"
}
```

### retry_ci_workflow Parameters

```json
{
  "projectOrRepoFullName": "owner/repo (required)",
  "workflowId": "Workflow or pipeline identifier (required)",
  "ref": "Branch or tag reference (optional)",
  "inputs": { "key": "value" }
}
```

All CI tools work across GitHub Actions, GitLab CI, Bitbucket Pipelines, and Azure DevOps Pipelines. The `projectOrRepoFullName` format is provider-specific (e.g., `owner/repo` for GitHub, `group/project` for GitLab).

## Exploration Tools (1)

| Tool ID | Display Name | Description |
|---------|-------------|-------------|
| `explore_codebase` | Explore Codebase | AI-powered codebase exploration |

## Memory Tools (2) — Auto-Injected

These tools are automatically added to all agents (coordinator and sub-agent). They cannot be configured by users.

| Tool ID | Display Name | Description |
|---------|-------------|-------------|
| `memory_write` | Memory Write | Persist a learning (title + content) |
| `memory_read` | Memory Read | Retrieve a stored memory by title (case-insensitive) |

### memory_write Parameters

```json
{
  "title": "Short summary of the learning (1 line)",
  "content": "Full details of the learning"
}
```

### memory_read Parameters

```json
{
  "title": "Memory title to retrieve (case-insensitive match)"
}
```

## Coordinator-Only Tools (3) — Auto-Injected

These tools are only available to the coordinator agent in `agent.session` steps.

| Tool ID | Display Name | Description |
|---------|-------------|-------------|
| `delegate_to_sub_agent` | Delegate to Sub Agent | Assign a task to a sub-agent from the agentIds list |
| `update_status` | Update Status | Post a progress update visible to the user |
| `task_completed` | Task Completed | Signal session completion and return final output |

## Built-In Agent Type Tool Matrix

### SeniorDeveloper (31 tools)

Full-stack development agent with comprehensive access:

**File System**: `create_directory`, `list_dir`, `read_file`, `write_file`, `delete_file`, `edit_file`, `append_file`

**Code**: `list_code_definition_names`, `code_search`, `semantic_code_search`, `run_terminal_cmd`, `get_diagnostics`

**Tickets**: `create_ticket`, `update_ticket`, `list_tickets`, `read_ticket`, `add_comment_to_ticket`, `update_comment_on_ticket`

**PRs**: `create_pull_request`, `read_pull_request`, `update_pull_request`, `list_pull_requests`, `merge_pull_request`, `add_comment_to_pull_request`, `update_comment_on_pull_request`, `close_pull_request`

**Code Review**: `get_pull_request_diff`

**CI/CD**: `get_ci_run_details`, `get_ci_run_logs`, `list_pr_ci_runs`, `get_ci_job_logs`, `retry_ci_workflow`

**Exploration**: `explore_codebase`

### CodeReview (26 tools)

Code review agent with read-heavy access (no file creation/deletion, no PR creation):

**File System**: `list_dir`, `read_file`, `append_file`

**Code**: `list_code_definition_names`, `code_search`, `semantic_code_search`, `run_terminal_cmd`, `get_diagnostics`

**Tickets**: `list_tickets`, `read_ticket`, `add_comment_to_ticket`, `update_comment_on_ticket`

**PRs**: `read_pull_request`, `update_pull_request`, `list_pull_requests`, `add_comment_to_pull_request`, `update_comment_on_pull_request`

**Code Review**: `add_pull_request_review_thread`, `submit_review`, `add_pull_request_review_thread_reply`, `get_pull_request_diff`

**CI/CD**: `get_ci_run_details`, `get_ci_run_logs`, `list_pr_ci_runs`, `get_ci_job_logs`

**Exploration**: `explore_codebase`

### TechWriter (25 tools)

Technical writer with full file and documentation access:

**File System**: `create_directory`, `list_dir`, `read_file`, `write_file`, `delete_file`, `edit_file`, `append_file`

**Code**: `list_code_definition_names`, `code_search`, `semantic_code_search`, `run_terminal_cmd`, `get_diagnostics`

**Tickets**: `create_ticket`, `update_ticket`, `list_tickets`, `read_ticket`, `add_comment_to_ticket`, `update_comment_on_ticket`

**PRs**: `create_pull_request`, `read_pull_request`, `update_pull_request`, `list_pull_requests`, `merge_pull_request`, `add_comment_to_pull_request`, `update_comment_on_pull_request`, `close_pull_request`

**Code Review**: `get_pull_request_diff`

**Exploration**: `explore_codebase`

### ProductManager (20 tools)

Product management with read-only code access and ticket management:

**File System**: `list_dir`, `read_file`

**Code**: `list_code_definition_names`, `code_search`, `semantic_code_search`, `run_terminal_cmd`, `get_diagnostics`

**Tickets**: `create_ticket`, `update_ticket`, `list_tickets`, `read_ticket`, `add_comment_to_ticket`, `update_comment_on_ticket`

**PRs**: `read_pull_request`, `update_pull_request`, `list_pull_requests`, `add_comment_to_pull_request`, `update_comment_on_pull_request`

**Code Review**: `get_pull_request_diff`

**Exploration**: `explore_codebase`

### ExploreAgent (5 tools)

Minimal read-only agent for codebase exploration:

**File System**: `list_dir`, `read_file`

**Code**: `code_search`, `semantic_code_search`, `run_terminal_cmd`

### InternalRepoIdentify (2 tools) — Internal Only

Used internally by the `repo.identify` action. Not for playbook use.

**Tickets**: `list_tickets`, `read_ticket`
