# Test Coverage Gap Analysis

## Overview

Identifies test coverage gaps in your repository using targeted search strategies (git history, important areas exploration), checks that each gap isn't already tracked by an open issue or PR, and creates up to 3 actionable issues per run. Designed for large repos — never scans all files or runs test suites.

## Triggers

**Automatic:**
- Schedule: Weekly, Monday 4:00 AM UTC (`0 4 * * 1`), per-repository

**Manual:**
- Slash command: `/test-coverage`

## Use Cases

- Gradually improve test coverage across a codebase without manual auditing
- Ensure critical paths (auth, payments, data integrity) are tested first
- Surface active code areas (recently changed files) that lack test safety nets
- Keep test coverage work visible and tracked via issues without creating noise

## Prerequisites

- Agent configured: Senior Developer

## Workflow Steps

1. **Clone Repo** (`git.clone`) - Clones the default branch with shallow depth and blob:none filter
   - Agents: None (infrastructure step)
   - Duration: ~2 min

2. **Find Coverage Gaps** (`agent.run`) - Uses targeted strategies to find files with missing tests, poor coverage, or no coverage at all. Validates each candidate against open issues/PRs inline, and stops once 3 confirmed gaps are found
   - Agents: Senior Developer
   - Duration: ~15 min
   - Search order: git history (recently changed files without adequate tests) → high-level repo understanding to identify important areas/modules, then sample 1-2 candidates from each area and expand as needed
   - Each candidate is checked against open issues/PRs before being accepted
   - Outputs: Up to 3 confirmed gaps (or early-exit if none found)

3. **Create Coverage Issues** (`agent.run`) - Creates well-structured issues for each gap with overview, rationale, and suggested test cases
   - Agents: Senior Developer
   - Duration: ~10 min
   - Outputs: Summary of created issues

```
git-clone → find-coverage-gaps → create-coverage-issues
```

## Customization

### Step Prompts
- `find-coverage-gaps.md` - Controls search strategies, priority classification, and issue limit per run
- `create-coverage-issues.md` - Controls issue format, labels, and content

### Common Adjustments

**Change the number of issues created per run:**
Edit `find-coverage-gaps.md` and change the maximum gaps limit (default: 3).

**Change search strategies or priority order:**
Edit `find-coverage-gaps.md` to adjust which strategies are used and in what order (e.g., skip git history and go straight to repo exploration).

**Change priority categories:**
Edit `find-coverage-gaps.md` to adjust the priority classification rules (critical, high, medium, low).

**Change issue labels:**
Edit `create-coverage-issues.md` to modify which labels are applied to created issues.

**Change schedule frequency:**
Edit `workflow.json` triggers to adjust the cron expression (default: weekly Monday 4 AM UTC).

## Related Workflows

- **Automated Ticket Triage** (`automated-ticket-triage/`) - Triages incoming issues with labels and duplicate detection
- **Code Review** (`code-review/`) - Automated PR code review workflow
