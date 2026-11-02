# E2E Tests

## 📋 Overview

Runs Overcut's live E2E suite ([overcut-e2e-tests](https://github.com/overcut-ai/overcut-e2e-tests)) against one environment and posts the result to Slack. Install it twice: the `next` copy tests staging, the `main` copy tests production. Each run posts the verdict, one line each for passed, failed and skipped (the first 5 failed and the first 5 skipped with their reasons), and a link to the run, whose "Test results" step lists every test with its log.

Internal: visible only to workspaces in the server's `INTERNAL_PLAYBOOKS_WORKSPACE_IDS`.

## ⚡ Triggers

| Trigger | Event | When |
|---------|-------|------|
| Nightly | `scheduled`, cron `0 0 * * *` | 00:00 in the workspace's time zone |
| Manual | slash command, no mention required | `/sanity` as installed; set per copy (see setup) |

## 🎯 Use Cases

- Nightly health of staging (`next`) and production (`main`).
- An on-demand check after a deploy, from a PR comment.

## 🔧 Prerequisites

- **Workspace time zone** `Asia/Jerusalem`, so the nightly runs at 00:00 Israel time (Overcut evaluates cron in the workspace's time zone).
- The project can clone `overcut-ai/overcut-e2e-tests`.
- Slack connected, with #overcut-engineering-general and #overcut-engineering registered to the project.
- A "Senior Developer" agent in the project (created on install if missing).
- Production: `envs/production.yaml` in overcut-e2e-tests. It does not exist yet, so the `main` copy reports red until it is added.

## 🏗️ Workflow Steps

1. **Clone sanity suite** (`clone`, git.clone): clones `sanity_suite_repo` at `sanity_suite_ref`.
2. **Run sanity** (`run`, script, up to 60 min): runs `src/sandbox/sanity-run.ts`, which maps `sanity_target_branch` to the environment (`next` → staging, `main` → production), runs the live tests and probes with one retry of failures, and outputs the Slack text and the Test results page. It never fails the step: a setup failure still produces a red message saying why.
3. **Post to Slack** (`notify`, agent): posts the text verbatim to `sanity_slack_channel_id`.
4. **Test results** (`report`, agent): shows the page verbatim as the step's output.

## Setup (once per copy)

1. Install **E2E Tests** twice. Overcut names the second copy "E2E Tests-1".
2. Rename them **E2E Tests - next** and **E2E Tests - main**.
3. Define the context parameters below once, then set the values on each workflow:

| Parameter | E2E Tests - next | E2E Tests - main |
|-----------|------------------|------------------|
| `sanity_target_branch` | `next` | `main` |
| `sanity_slack_channel_id` | ID of #overcut-engineering-general | ID of #overcut-engineering |
| `sanity_suite_repo` | `overcut-ai/overcut-e2e-tests` | `overcut-ai/overcut-e2e-tests` |
| `sanity_suite_ref` | `main` (`feat/e2e-triage-fix-loop` until overcut-e2e-tests#55 merges) | same |
| `sanity_ui_url` | staging UI URL (optional: links to each test's run) | production UI URL (optional) |
| `sanity_env_override` | empty | empty |

4. Secrets: `OVERCUT_API_TOKEN_STAGING` on the next copy, `OVERCUT_API_TOKEN_PRODUCTION` on the main copy.
5. Slash command: change it to `/sanity-staging` on the next copy and `/sanity-prod` on the main copy. With both on `/sanity`, one comment runs both.

## 🎨 Customization

- **Message and page wording**: built by `src/report/slack-summary.ts` and `src/report/tests-table.ts` in overcut-e2e-tests; `notify.md` and `report.md` only deliver them.
- **What runs**: the tiers and probes in overcut-e2e-tests (`scenarios/live/`, `src/live/probes/`).

## Known limits

- A failed clone (for example a wrong `sanity_suite_repo` or `sanity_suite_ref`) stops the run before `notify`, so that night posts nothing. No message on a night means the run did not complete.
- The schedule follows the workspace time zone; in a UTC workspace `0 0 * * *` is 02:00 or 03:00 in Israel.

## 🔗 Related Workflows

None yet.
