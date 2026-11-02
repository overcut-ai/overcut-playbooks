# E2E Tests

## 📋 Overview

Runs Overcut's live E2E suite ([overcut-e2e-tests](https://github.com/overcut-ai/overcut-e2e-tests)) against one environment and posts the result to Slack. Install it twice: the `next` copy tests staging, the `main` copy tests production. Each run posts the verdict, one line each for passed, failed and skipped (the first 5 failed and the first 5 skipped with their reasons), and a link to the run, whose "Test results" step lists every test with its log.

Internal: visible only to workspaces in the server's `INTERNAL_PLAYBOOKS_WORKSPACE_IDS`.

## ⚡ Triggers

| Trigger | Event | When |
|---------|-------|------|
| Nightly | `scheduled`, cron `0 0 * * *` | 00:00 in the workspace's time zone |
| Manual | slash command, no mention required | `/e2e-tests` as installed; set per copy (see setup) |

## 🎯 Use Cases

- Nightly health of staging (`next`) and production (`main`).
- An on-demand check after a deploy, from a PR comment.

## 🔧 Prerequisites

- **Workspace time zone** `Asia/Jerusalem`, so the nightly runs at 00:00 Israel time (Overcut evaluates cron in the workspace's time zone).
- The project can clone `overcut-ai/overcut-e2e-tests`.
- Slack connected, with #overcut-engineering-general and #overcut-engineering registered to the project.
- The **E2E Tests Reporter** agent, created by the first install. Turn on its **Post Channel Message** tool (Messaging) once: runs started by the schedule or a PR comment get no channel tools by default, so without it nothing is posted.
- Production: `envs/production.yaml` in overcut-e2e-tests (server `https://server.overcut.ai`). It does not exist yet, so the `main` copy reports red until it is added.

## 🏗️ Workflow Steps

1. **Clone E2E suite** (`clone`, git.clone): clones `e2e_suite_repo` at `e2e_suite_ref`.
2. **Run E2E tests** (`run`, script, up to 60 min): runs `src/sandbox/e2e-run.ts`, which maps `e2e_target_branch` to the environment (`next` → staging, `main` → production), runs the live tests and probes with one retry of failures, and outputs the Slack text and the Test results page. It never fails the step: a setup failure still produces a red message saying why.
3. **Post to Slack** (`notify`, agent): posts the text verbatim to `e2e_slack_channel_id`.
4. **Test results** (`report`, agent): shows the page verbatim as the step's output.

## Setup (once per copy)

1. Install **E2E Tests** twice. Overcut names the second copy "E2E Tests-1".
2. Rename them **E2E Tests - next** and **E2E Tests - main**.
3. Define the context parameters below once, then set the values on each workflow:

| Parameter | E2E Tests - next | E2E Tests - main |
|-----------|------------------|------------------|
| `e2e_target_branch` | `next` | `main` |
| `e2e_slack_channel_id` | ID of #overcut-engineering-general | ID of #overcut-engineering |
| `e2e_suite_repo` | `overcut-ai/overcut-e2e-tests` | `overcut-ai/overcut-e2e-tests` |
| `e2e_suite_ref` | `main` (`feat/e2e-tests-harness` until overcut-e2e-tests#56 merges) | same |
| `e2e_ui_url` | `https://app.stg.overcut.ai` (optional: links to each test's run) | `https://app.overcut.ai` (optional) |
| `e2e_env_override` | empty | empty |

4. Secrets: `OVERCUT_API_TOKEN_STAGING` on the next copy, `OVERCUT_API_TOKEN_PRODUCTION` on the main copy.
5. Slash command: change it to `/e2e-tests-next` on the next copy and `/e2e-tests-main` on the main copy. With both on `/e2e-tests`, one comment runs both.

## 🎨 Customization

- **Message and page wording**: built by `src/report/slack-summary.ts` and `src/report/tests-table.ts` in overcut-e2e-tests; `notify.md` and `report.md` only deliver them.
- **What runs**: the tiers and probes in overcut-e2e-tests (`scenarios/live/`, `src/live/probes/`).

## Known limits

- A failed clone (for example a wrong `e2e_suite_repo` or `e2e_suite_ref`) stops the run before `notify`, so that night posts nothing. No message on a night means the run did not complete.
- The schedule follows the workspace time zone; in a UTC workspace `0 0 * * *` is 02:00 or 03:00 in Israel.

## 🔗 Related Workflows

None yet.
