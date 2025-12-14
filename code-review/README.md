# Code Review

## 📋 Overview

Automatically performs comprehensive code reviews on pull requests. Analyzes all code changes, identifies issues (bugs, security, performance, best practices), provides inline comments with specific feedback, and submits a final review summary. Creates high-signal, actionable feedback while filtering out trivial findings.

## ⚡ Triggers

**Automatic:**

- Event: `pull_request_opened` when PR is not in draft mode
- Delay: None

**Manual:**

- Slash command: `/review`
- Can be used on any PR at any time

## 🎯 Use Cases

- Automated first-pass code review for all PRs
- Consistent code quality checks across the team
- Catching bugs, security issues, and performance problems early
- Reducing manual review burden on senior developers
- Ensuring best practices and standards compliance
- Onboarding - teaching junior developers through feedback

## 🔧 Prerequisites

- Agents configured: Code Reviewer, Senior Developer, Technical Writer

## 🏗️ Workflow Steps

1. **Clone Repo** (`git.clone`) - Clones the PR branch

   - Agents: None (automated git operation)
   - Duration: ~1 min

2. **Prepare Review Plan** (`agent.run`) - Creates intent-based review plan

   - Agents: Senior Developer
   - Duration: ~2-3 min
   - Identifies main logical changes and creates focused review checklist

3. **Code Review** (`agent.session`) - Analyzes code and logs findings

   - Agents: Code Reviewer (coordinated by Coordinator)
   - Duration: ~5-10 min
   - Reviews each item from plan, writes findings to scratchpad JSONL

4. **Optimize Review Items** (`agent.run`) - Dedupes and filters findings

   - Agents: Code Reviewer
   - Duration: ~1-2 min
   - Removes low-value findings, merges duplicates, chunks for processing

5. **Submit Review Results** (`agent.session`) - Posts comments and submits review
   - Agents: Code Reviewer, Senior Developer, Technical Writer
   - Duration: ~3-5 min
   - Posts inline comments, submits final review with summary

```
[Clone] → [Plan] → [Review] → [Optimize] → [Submit]
```

## 🎨 Customization

### Step Prompts

- `prepare-review-plan.md` - Controls how review plan is created (focus areas, grouping strategy)
- `code-review.md` - Controls review process and finding criteria (what to flag, severity levels)
- `optimize-review-item.md` - Controls filtering and deduplication logic (what to keep/drop)
- `submit-review.md` - Controls how comments are posted and review is submitted (approval criteria)

### Common Adjustments

**Focus on specific areas:**
Edit `prepare-review-plan.md` to prioritize:

- Security: "Prioritize security vulnerabilities and auth issues"
- Performance: "Focus on performance bottlenecks and inefficient queries"
- Tests: "Emphasize test coverage and test quality"

**Adjust strictness:**
Edit `code-review.md` severity guidance:

- Stricter: Lower threshold for `blocker` severity
- Lenient: Raise threshold, focus only on critical issues

**Customize filters:**
Edit `optimize-review-item.md` to:

- Keep more nitpicks for learning purposes
- Be more aggressive about dropping low-confidence findings
- Adjust chunk size for larger/smaller review comments

**Change approval criteria:**
Edit `submit-review.md` to:

- `APPROVE` only if zero findings
- `REQUEST_CHANGES` for any major severity
- Always use `COMMENT` for non-blocking feedback

## 🔗 Related Workflows

- **Auto Root Cause Analysis** - Analyzes bugs found during review
- **Technical Design Proposal** - Creates design docs before large implementations

---

_Part of the [Overcut Playbooks](../README.md) collection_
