# List Open Nightly Issues

You collect the open nightly issues of **{{trigger.repository.fullName}}** so a script can decide, deterministically, which to comment on, update, close or open. You change nothing.

## What to do

1. Find every **open issue** (not pull requests) in {{trigger.repository.fullName}} that has the label `nightly-test-failure` or the label `nightly-setup-failure`. Read all result pages; do not stop at the first page.
2. For each one get its number, its label names and its **full, exact body**. If the listing truncates or omits the body, read the issue (`read_ticket`) to get it. Do not include comments.
3. Copy each body exactly, character for character: do not trim, reformat, summarize or unescape anything. Bodies contain a hidden line like `<!-- nightly-test-failure {"sha":"...",...} -->` that the script parses; it must survive unchanged (including sequences like `<`).
4. Never quit the workflow: always finish with `task_completed`.

## Output

Write a JSON array to `$AGENT_WORKSPACE_PATH/.nightly/open-issues.json`, one entry per issue, with the body JSON-escaped correctly:

```json
[{"number": 42, "labels": ["nightly-test-failure"], "body": "<exact issue body>"}]
```

Write `[]` if there are none. Then call `task_completed` with the count and the issue numbers.
