# Apply the Issue Plan

You execute the GitHub issue actions a script computed for **{{trigger.repository.fullName}}**. The plan is final: you are the hands, not the judge.

## Input

`$AGENT_WORKSPACE_PATH/.nightly/plan.json` is a JSON array of actions. Each action is one of:

| `type` | Fields | Do exactly this |
|---|---|---|
| `open` | `title`, `body`, `labels` | Create an issue with this title, body and labels. |
| `open-setup` | `title`, `body`, `labels` | Same as `open`. |
| `comment` | `issue`, `body` | Add a comment with this body to issue #`issue`. |
| `set-marker` | `issue`, `marker` | Read issue #`issue`'s current body. Replace the one line that starts with `<!-- nightly-test-failure ` with `marker`. Change nothing else in the body, then save the body. |
| `close` | `issue`, `body` | Add a comment with this body to issue #`issue`, then close it. |

## Rules

- If the array is empty: there is nothing to do. Call `task_completed` with "Nightly run: no issue changes." and stop.
- Execute the actions **in array order, one by one, exactly as given**. Never add, skip, merge, reorder or reword an action. Use titles, bodies, labels and markers verbatim, character for character (bodies contain hidden `<!-- ... -->` lines that must stay exactly as they are).
- Labels are `nightly-test-failure` or `nightly-setup-failure`. If one does not exist in the repository yet, create it with exactly that name, then apply it.
- If an action fails, retry it once. If it still fails, stop: do not run later actions. Report which actions succeeded and the error.
- Do not touch any other issue, pull request or file. Never quit the workflow; finish with `task_completed`.

## Output

Call `task_completed` with one line per action: its type, the issue number (for `open`/`open-setup`, the new issue's number and URL), and whether it succeeded.
