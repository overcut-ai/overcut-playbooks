# Interactive Mention Response

## 📋 Overview

Responds to `@overcut` mentions in issues, PRs, and comments with context-aware answers using multi-agent coordination. Automatically identifies relevant repositories, clones them for full code access, and runs a session where a coordinator delegates questions to specialized agents — providing concise, evidence-based answers grounded in your actual codebase. Reply with another `@overcut` mention to continue the conversation.

## ⚡ Triggers

**Automatic:**

- Event: `mention` — triggers whenever `@overcut` is mentioned in any issue, PR, or comment
- No conditions — responds to all mentions
- No delay

## 🎯 Use Cases

- **Q&A**: Ask questions about code, architecture, or implementation details
- **Debugging**: Investigate bugs, trace error paths, and identify root causes
- **Code explanation**: Understand what a file, function, or module does and why
- **Impact analysis**: Assess how a change affects the rest of the codebase
- **Investigation**: Trace data flows, find usages, and explore dependencies
- **Code suggestions**: Get concrete fix proposals or improvement recommendations
- **PR context**: Understand what a PR changes, why, and what it affects

## 🔧 Prerequisites

- **Agents configured**:
  - **Product Manager** — Understands requirements and business context
  - **DevOps Engineer** — Infrastructure, CI/CD, and deployment expertise
  - **Senior Developer** — Code analysis, architecture, and implementation
  - **Code Reviewer** — Code quality, patterns, and best practices
  - **Root-Cause Analysis (RCA) Expert** — Debugging, failure analysis, and incident investigation
  - **Technical Writer** — Clear documentation and structured communication

## 🏗️ Workflow Steps

1. **Identify Repositories** (`repo.identify`) — Finds relevant repos based on the mention context

   - Agents: None (automated repository identification)
   - Duration: ~30 seconds
   - Returns up to 3 repositories with minimum 0.4 confidence
   - Prioritizes the component field for identification

2. **Clone Repo** (`git.clone`) — Clones identified repositories

   - Agents: None (automated git operation)
   - Duration: ~1 min
   - Shallow clone (depth 1, single branch) for efficiency

3. **Multi-Agent Session** (`agent.session`) — Answers the user's question

   - Agents: Product Manager, DevOps Engineer, Senior Developer, Code Reviewer, RCA Expert, Technical Writer (coordinated by Coordinator)
   - Duration: Up to 30 min
   - Process:
     1. **Parse & Plan**: Extract intent, scope, and artifacts from the `@overcut` mention
     2. **Gather Evidence**: Read diffs, search code, open relevant files
     3. **Respond**: Deliver concise, cited answer with supporting details
   - Ends as soon as the answer is posted
   - A follow-up `@overcut` mention starts a new run with the full comment thread as context

```
[Identify Repos] → [Clone Repo] → [Multi-Agent Session]
        ↑                                   |
        └──── new @overcut mention ─────────┘
```

## 🔑 Key Features

- **Conversational follow-up**: Reply with another `@overcut` mention to continue; the new run reads the full comment thread, so prior context is preserved
- **No idle time**: The run ends once the answer is posted rather than holding resources open waiting for a reply
- **Multi-agent coordination**: The coordinator delegates to the best-suited agent for each question (e.g., RCA Expert for debugging, Senior Developer for code analysis)
- **Read-only by default**: Agents browse code and analyze but do not push changes or modify settings unless explicitly asked
- **Evidence-based answers**: Every response cites specific files, lines, commits, or diffs

## 📝 Response Format

Each response follows a structured format:

**Answer**
- Concise result: facts, decision, or fix
- Minimal code snippets when helpful

**Why this is correct**
- Source: `path/to/file.ext:LINE-START–LINE-END` (brief rationale)
- PR/Commit references when relevant

**Next steps** (if applicable)
- Actionable checklist items

## 🎨 Customization

### Step Prompt

- `agent-session.md` — Controls the coordinator's behavior, response format, operating rules, and failure handling

### Agents

Swap or add agents in `workflow.json` under the `agent-session` step's `agentIds` array and in `refs.agents`. For example:
- Add a **Database Architect** for data-layer questions
- Add a **Security Engineer** for vulnerability-related mentions
- Remove agents you don't need to reduce coordination overhead

### Exit Criteria

Edit the `exitCriteria` in `workflow.json` to adjust:
- `maxDurationMinutes` — Maximum time the agent may spend answering (default: 30 min)
- `userSignals.explicit` — Commands that end the session early (default: `/done`, `thanks`)

To keep a single run open for follow-up comments instead of starting a new run per mention,
set `listenToComments` and `keepSessionOpenForComments` to `true` on the `agent-session` step.
If you do, raise the workflow's `timeoutMs` above `maxDurationMinutes` as well — otherwise the
run is cut off while the session is still waiting for a reply.

### Common Adjustments

**Change response style:**
Edit `agent-session.md` Response Format section to:
- Add project-specific sections (e.g., "Performance Impact", "Security Considerations")
- Adjust verbosity level
- Change citation format

**Restrict scope:**
Edit `agent-session.md` Operating Rules to:
- Limit to specific repos or directories
- Add domain-specific guidelines
- Enforce organizational policies

**Add conditions to trigger:**
Edit the trigger in `workflow.json` to filter mentions:
- Only respond in specific repos
- Only respond to certain users or teams
- Require specific labels on the issue/PR

## 🔗 Related Workflows

- **[Code Review](../code-review/)** — Automated code review for PRs
- **[Auto Root Cause Analysis](../auto-root-cause-analysis/)** — Automated failure investigation triggered by CI failures
- **[Remediate CVEs](../remediate-cves/)** — Security vulnerability analysis and remediation planning
- **[Auto PR Description](../auto-pr-description/)** — Automatically generates PR descriptions with context

---

_Part of the [Overcut Playbooks](../README.md) collection_
