# Automated Ticket Triage

## 📋 Overview

Automatically categorizes and prioritizes new issues using AI analysis. Determines component/category, assigns priority levels based on content, detects duplicate issues, and requests missing information when needed. Reduces manual triage burden and ensures consistent issue classification with confidence scoring.
Can be used to trigger following workflows, by adding labels like `bug`, `feature`, `question`, `enhancement`, etc.

This workflow can be triggered on the ticket system (e.g. Jira), even when the code is managed in a different system (e.g. GitHub, GitLab, etc.).

It will start with identifying the repositories that are relevant to the issue, and then cloning the repositories for context.

## ⚡ Triggers

**Automatic:**

- Event: `issue_opened`
- Delay: 120 seconds (allows time for issue description to be completed)

**Manual:**

- Slash command: `/triage`
- Can be used on any issue

## 🎯 Use Cases

- Automatic first-pass triage for all new issues
- Consistent classification across large teams
- Duplicate detection to reduce issue noise
- Priority assignment based on content analysis
- Missing information detection and requests
- Backlog management and organization

## 🔧 Prerequisites

- Agent configured: Product Manager

## 🏗️ Workflow Steps

1. **Identify Repositories** (`repo.identify`) - Finds relevant repos based on component

   - Agents: None (automated repository identification)
   - Duration: ~30 seconds
   - Prioritizes component field hints

2. **Clone Repo** (`git.clone`) - Clones identified repos

   - Agents: None (automated git operation)
   - Duration: ~1 min per repo

3. **Triage Ticket** (`agent.session`) - Performs triage analysis
   - Agents: Product Manager
   - Duration: ~2-5 min (up to 120 min for interactive session)
   - Analyzes, categorizes, detects duplicates, posts summary

```
[Identify] → [Clone] → [Triage & Classify]
```

## 🎨 Customization

### Step Prompts

- `triage-ticket.md` - Controls classification criteria, confidence thresholds, duplicate detection

### Common Adjustments

**Change confidence threshold:**
Edit `triage-ticket.md` to:

- Higher confidence: "Apply only if confidence ≥0.85"
- Lower confidence: "Apply only if confidence ≥0.65"
- Remove threshold: "Always apply best-guess classification"

**Customize priority logic:**
Edit task #3:

- Add severity levels: "Classify as critical/high/medium/low based on impact"
- Use keywords: "Escalate priority if title contains 'production', 'urgent', 'critical'"
- Respect user hints: "If user includes priority indicator, prefer that"

**Adjust duplicate detection:**
Edit task #4:

- Stricter: "Link as duplicate only if similarity ≥0.85"
- Include closed issues: "Also search closed issues for duplicates"
- Semantic search: "Use semantic similarity instead of text matching"

**Customize labels:**
Edit `triage-ticket.md` to use your label schema:

- Components: `frontend`, `backend`, `api`, `docs`
- Categories: `bug`, `feature`, `question`, `enhancement`
- Priorities: `p0-critical`, `p1-high`, `p2-medium`, `p3-low`

**Change needs-info logic:**
Edit task #6:

- Define required fields: "Request reproduction steps for bugs"
- Add templates: "Provide issue template link"
- Auto-close incomplete: "Close issue after 7 days without info"

**Add task breakdown:**
Edit task #7:

- Auto-create subtasks for complex issues
- Suggest milestones or epics
- Estimate effort/complexity

## 🔗 Related Workflows

- **Auto Root Cause Analysis** - Analyzes triaged bugs
- **Technical Design Proposal** - Creates designs for triaged feature requests

---

_Part of the [Overcut Playbooks](../README.md) collection_
