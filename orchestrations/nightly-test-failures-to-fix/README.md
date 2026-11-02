# Nightly Test Failures to Fix

## 📋 Overview

An Overcut **orchestration template** that takes one `nightly-test-failure` issue (one root cause of failing tests, filed by the [Nightly Test Run](../../internal/nightly-test-run/)) from triage to a verified draft PR. It runs [Test Failure Triage](../../internal/test-failure-triage/) first, runs [Test Failure Fix](../../internal/test-failure-fix/) only when Triage classified the cause fixable, and retries Fix once when its verify step rejects the fix. Each issue ends with a verified draft PR, or labelled `nightly-flaky`, `nightly-environment` or `nightly-needs-human` with the reason in the issue.

This folder is not a playbook: it has no `workflow.json`, so the playbook catalog skips it. It ships through the workspace **Library** (Library → Orchestration templates).

## ⚡ Entry Triggers

| Trigger | Event | Condition | First workflow |
|---------|-------|-----------|----------------|
| Automatic | `issue_labeled` | `context.trigger.label` equals `nightly-test-failure` | Test Failure Triage |
| Manual | `/fix-nightly` | Comment on a `nightly-test-failure` issue, no mention required | Test Failure Triage |

The Nightly Test Run adds the `nightly-test-failure` label when it files an issue, so every new root cause starts one instance.

## 🏗️ Flow

```
issue labelled nightly-test-failure
  → Test Failure Triage
      ├─ flaky / environment / needs-human → finish (Triage labelled the issue nightly-<classification>)
      └─ fixable → [gate: approve-auto-fix] → Test Failure Fix
                       ├─ verified → finish (draft PR opened)
                       ├─ pushed, needs human → finish (draft PR opened, labelled needs-human-review)
                       └─ verify rejected, nothing pushed → [gate] → Test Failure Fix again, with the failure as input → finish
```

Known limit: the retry gets the verify failure only through the orchestration context (the prior step output); Test Failure Fix has no input of its own for it. Its agents use those reasons when present and otherwise retry like a first attempt. Verify this on a live retry.

Allowed workflows: **Test Failure Triage** and **Test Failure Fix**. "Fixable" means Triage's step finished with `success: true` and posted a comment headed `## Nightly triage: fixable`.

## 🚦 Gate

`approve-auto-fix` (on Test Failure Fix): a person approves every Fix start, the retry included. It is on by default because a fix attempt runs agents that write code.

**Auto-fix mode**: remove the `approve-auto-fix` gate from your project's copy of the orchestration (or from `gates` in `orchestration.json` before installing). Fix then starts as soon as Triage reports a fixable cause. The draft PR stays the final human checkpoint; never merge a `nightly-fix` PR unreviewed.

## 📏 Limits

| Limit | Value | Why |
|-------|-------|-----|
| `maxParallelSteps` | 1 | One cause per instance; steps run one at a time |
| `maxRepeatsPerWorkflow` | 2 | Fix runs at most twice (first attempt + one retry) |
| `maxSteps` | 10 | Hard stop for a runaway instance |
| `idleTimeoutHours` | 24 | Idle escalation after a day (for example a gate nobody approved) |
| `maxIdleHours` | 168 | A waiting instance closes after a week |
| `maxActiveInstances` | 25 | Server default; excess instances queue |
| `autoApprove.minConfidence` | 0.8 | Required by the schema; tune it to your tolerance |

Older Overcut servers do not define `maxParallelSteps` or `maxIdleHours`. The installer drops them there with a warning.

## 🔧 Prerequisites

- The three workflows installed and mapped: **Nightly Test Run** (files the issues), **Test Failure Triage** and **Test Failure Fix**. See each playbook's README for its agents, permissions and context parameters.
- A **Senior Developer** agent (the workflows use it).
- The workspace-level context parameters `nightly_setup_command` and `nightly_test_command` (the installer creates them with an empty default when missing).

## 📦 Installing

### Library admins: write the templates into a workspace Library

`scripts/install-library-templates.py` (Python 3 standard library only) upserts the three workflows and this orchestration into the workspace's library project by exact name, then commits each one. It replaces the placeholder agent id `senior-developer-agent-id` with your agent's id, resolves workflow names to the library workflow ids, and creates the two context parameters if no definition with that key exists.

```bash
# Preview: prints every operation and its variables, makes no HTTP calls
python3 scripts/install-library-templates.py \
  --api-url https://<your-overcut>/graphql --workspace-id <workspace-id> --agent-id <agent-id> --dry-run

# Install
OVERCUT_API_TOKEN=<token> python3 scripts/install-library-templates.py \
  --api-url https://<your-overcut>/graphql --workspace-id <workspace-id> --agent-id <agent-id>
```

Re-running it updates the existing templates; an unchanged template reports "No changes to commit". It introspects the target's input types and drops, with a warning, any template field the target does not define (for example `definition.version` or the newer limits). The token is read from `OVERCUT_API_TOKEN` and never printed.

### Projects: install from the Library

In your project, open Library → Orchestration templates → **Nightly Test Failures to Fix** → **Install from Library**, and map each workflow to your project's copy (install the three workflows from Library → Workflow templates first).

## 🎨 Customization

- **Auto-fix**: remove the gate (see above).
- **Retries**: `maxRepeatsPerWorkflow` caps how often Fix runs; keep the instructions' "at most twice" in step with it.
- **Routing rules**: edit `instructions` in `orchestration.json` (or in your project's copy).
- **Entry**: change the label condition or the `/fix-nightly` command in `entryTriggers`.

## 🔗 Related Workflows

- [Nightly Test Run](../../internal/nightly-test-run/) — files the `nightly-test-failure` issues.
- [Test Failure Triage](../../internal/test-failure-triage/) — confirms and classifies one cause.
- [Test Failure Fix](../../internal/test-failure-fix/) — fixes, verifies and opens the draft PR.
