# Auto Root Cause Analysis

## 📋 Overview

Automatically performs deep root cause analysis when bugs are reported. Analyzes stacktraces, traces code history, identifies the likely cause with supporting evidence, and suggests a minimal fix with risk assessment. Can optionally trigger the PR creation workflow if confidence is high.

## ⚡ Triggers

**Automatic:**

- Event: `issue_labeled` when label is `bug`

**Manual:**

- Slash command: `/bug-rca`
- Can be used on any issue at any time

## 🎯 Use Cases

- Automatic bug investigation for reported issues
- Reduce time-to-diagnosis for production bugs
- Generate fix suggestions for common error patterns
- Learning tool - shows investigation process and reasoning
- 24/7 automated first response to bug reports
- Capture institutional knowledge about bug patterns

## 🔧 Prerequisites

- Agent configured: Root-Cause Analysis (RCA) Expert
- Optional: Configure `autoPR` threshold in workflow.json for automatic PR creation

## 🏗️ Workflow Steps

1. **Identify Repositories** (`repo.identify`) - Finds relevant repos for the issue

   - Agents: None (automated repository identification)
   - Duration: ~30 seconds
   - Uses issue content to identify up to 3 relevant repositories

2. **Clone Repositories** (`git.clone`) - Clones identified repos

   - Agents: None (automated git operation)
   - Duration: ~1 min per repo

3. **RCA Session** (`agent.session`) - Performs root cause analysis
   - Agents: Root-Cause Analysis (RCA) Expert (coordinated by Coordinator)
   - Duration: ~5-30 min
   - Analyzes code, traces history, identifies cause, suggests fix

```
[Identify Repos] → [Clone] → [RCA Session]
```

## 🎨 Customization

### Step Prompts

- `rca-session.md` - Controls the entire RCA process including:
  - Analysis depth and methodology
  - Evidence collection requirements
  - Fix suggestion format and constraints
  - Confidence scoring criteria
  - When to request more info vs. propose fix

### Common Adjustments

**Adjust analysis depth:**
Edit `rca-session.md` to:

- Deep analysis: "Trace back through at least 3 levels of call stack"
- Quick analysis: "Focus only on the immediate cause in the stacktrace"
- Historical: "Include analysis of when the bug was introduced (git blame)"

**Change fix suggestion style:**

- Conservative: "Only suggest fixes with 95%+ confidence"
- Aggressive: "Suggest fixes for any identified issue with reasoning"
- Educational: "Explain multiple possible fixes with trade-offs"

**Configure auto-PR behavior:**
Edit `rca-session.md` and workflow.json `autoPR` configuration:

- Disable: Remove auto-PR logic from prompt
- Lower threshold: Create PR at `conf-med` instead of `conf-high`
- Add tests: "Always include test cases in auto-PR"

**Customize labels:**
Edit `rca-session.md` to change:

- Label names (`rca-proposed`, confidence tiers)
- When labels are applied
- Additional labels based on issue type

**Needs-info criteria:**
Edit the "Needs-Info Handling" section to:

- Request specific information for your stack
- Include custom debugging steps
- Add environment-specific questions

## 🔗 Related Workflows

- **Code Review** - Catches bugs before they reach production
- **Technical Design Proposal** - Creates designs to prevent architectural bugs

---

_Part of the [Overcut Playbooks](../README.md) collection_
