# AGENTS.md

This file provides instructions for AI agents working with the Overcut Playbooks repository. It contains essential information for creating, updating, and maintaining playbooks (workflow use cases).

## 📋 Project Overview

This repository contains **Overcut Playbooks** - pre-built, customizable AI agent workflows for software development automation. Each playbook is a complete workflow that can be imported into [Overcut](https://overcut.ai) and customized for specific needs.

**Key Technologies:**

- Overcut Workflow JSON 1.0.0
- Markdown for prompts and documentation
- Git for version control
- Cron & slash-command triggers
- Overcut agent actions (agent.run, agent.session, git.clone)

## 🏗️ Repository Structure

Each playbook must follow this structure, and every workflow folder lives directly under the repository root in a flat layout (no nested folders). Playbook directories must use kebab-case naming (lowercase-with-hyphens) to stay consistent with step IDs and prompts. The repository root also includes shared documentation like `README.md`, `AGENTS.md`, `CONTRIBUTING.md`, `LICENSE`, `.gitignore`, and SVG assets, so each playbook directory should sit alongside (not inside) these top-level files.

```
playbook-name/
├── workflow.json          # Complete workflow definition (REQUIRED)
├── README.md              # Documentation following standard template (REQUIRED)
├── step-id-name.md        # Prompt file for each step (REQUIRED - one per step)
├── another-step-id.md     # Additional step prompts as needed
├── special-agents/        # (OPTIONAL) Specialized agent instructions
│   └── agent-name.md      # Instructions for configuring custom agents
└── ...                    # More steps as needed
```

## 🎯 Creating New Playbooks

Follow this **design-first approach** to ensure the workflow is well-planned before implementation:

### Step 1: Create Playbook Folder

- **Naming**: Use `lowercase-with-hyphens` (e.g., `auto-code-review`, `migration-assistant`)
- **Location**: Root of repository
- **Command**: `mkdir playbook-name && cd playbook-name`

### Step 2: Create README.md with High-Level Flow

**Start with the design and documentation first.** This helps clarify the workflow structure before implementation.

Use this template structure:

```markdown
# [Workflow Name]

## 📋 Overview

[2-3 sentences about what it does and outputs]

## ⚡ Triggers

[Automatic and manual triggers]

## 🎯 Use Cases

[When to use this workflow]

## 🔧 Prerequisites

[Required setup, agents needed]

## 🏗️ Workflow Steps

[Step-by-step breakdown with agent assignments and durations]

- List each step with its purpose, agent type, and estimated duration
- Describe the flow between steps
- Identify what data passes between steps

## 🎨 Customization

[How to adapt the workflow, which prompts to edit]

## 🔗 Related Workflows

[Links to related playbooks]
```

**README Requirements:**

- Complete all sections, especially the "Workflow Steps" section
- Define the high-level flow and step sequence
- Document what each step does and which agents are needed
- Include customization guide
- Document prerequisites clearly
- Add related workflow links
- Grammar and spelling checked

**Purpose**: The README serves as the design document. It should clearly describe:

- What the workflow does
- How it flows from step to step
- What each step accomplishes
- What data/context flows between steps

### Step 3: Create Step Prompt Files

**After the README is approved, create the prompt files.** This ensures the prompts align with the design and makes sense before creating the JSON structure.

**CRITICAL NAMING RULE**: Prompt filenames **MUST** match the step IDs you'll use in workflow.json (use kebab-case).

**Process:**

1. **Identify steps from README**: Based on the "Workflow Steps" section, list all steps
2. **Name each step**: Use descriptive kebab-case names (e.g., `prepare-review-plan`, `code-review`, `submit-review`)
3. **Create prompt files**: For each step, create `{step-id}.md` with detailed instructions

**Example:**

- Planned step: "Prepare Review Plan"
- Step ID: `prepare-review-plan`
- Prompt filename: `prepare-review-plan.md` ✅
- **NOT**: `step-1-prepare-review-plan.md` ❌
- **NOT**: `prepareReviewPlan.md` ❌

**For each step:**

1. Create a `.md` file with the step ID as the filename
2. Write clear, detailed instructions for that step
3. Include:
   - What the step should accomplish
   - What inputs it receives (from previous steps or triggers)
   - What outputs it should produce
   - How to handle errors
   - Format requirements for outputs

**Prompt File Guidelines:**

- Use clear, specific instructions
- Include examples when helpful
- Handle error cases explicitly
- Specify output format requirements
- Preserve user-provided content outside the sections you are instructed to change unless explicitly told otherwise
- Enforce structured, sectioned outputs (e.g., Summary/Changes/Testing, remediation plans with trade-off analysis) to match workflow expectations
- Pass complete context between steps using `{{outputs.step-id.field}}` syntax
- Reference the step's role in the overall workflow
- Ensure prompts align with the README design

**Purpose**: Creating prompts first helps validate:

- The workflow design makes sense
- Steps have clear responsibilities
- Data flow between steps is well-defined
- The prompts are complete and actionable

### Step 4: Create workflow.json

**Finally, create the workflow.json based on the approved README design and prompt files.** The JSON structure should implement exactly what was designed.

The `workflow.json` file must follow this structure:

```json
{
  "_formatVersion": "1.0.0",
  "workflow": {
    "name": "Workflow Display Name",
    "description": "Brief description of what the workflow does",
    "instructions": [...],
    "definition": {
      "flow": [...],
      "name": "Workflow Name",
      "steps": [...],
      "triggers": [...],
      "version": "1.0.0",
      "priority": 3,
      "timeoutMs": 3600000
    }
  },
  "refs": {
    "agents": [...]
  }
}
```

**Key Requirements:**

- **Step IDs must match prompt filenames exactly** (e.g., if you have `prepare-review-plan.md`, the step ID must be `"prepare-review-plan"`)
- Valid JSON syntax (validate before committing)
- Each step must have a unique `id` field
- Step IDs must be `kebab-case` (e.g., `prepare-review-plan`, `code-review`)
- Include appropriate `stepMaxDurationMinutes` for each step
- Define triggers (automatic events or manual slash commands)
- Include agent references in `refs.agents` array
- **Copy instruction content from corresponding `.md` files** into each step's `instruction` field
- Flow connections must match the sequence described in README

**Implementation Process:**

1. **Create steps array**: For each prompt file, create a step object with:

   - `id`: Must match the prompt filename (without `.md`)
   - `name`: Human-readable step name
   - `action`: `agent.run`, `agent.session`, `git.clone`, etc.
   - `params`: Step-specific parameters
   - `instruction`: Copy content from the corresponding `{step-id}.md` file
   - `stepMaxDurationMinutes`: Based on README estimates

2. **Create flow array**: Define connections between steps based on README workflow sequence

3. **Create triggers**: Based on README trigger section

4. **Add agent references**: List all agents used in `refs.agents`

**Validation:**

- Verify every prompt file has a corresponding step
- Verify every step has a corresponding prompt file
- Verify step IDs match prompt filenames exactly
- Verify flow matches README sequence
- Verify triggers match README description

### Step 5: Special Agents (If Needed)

**When to use `special-agents/` folder:**

- ✅ Specialized roles requiring domain-specific knowledge (e.g., Security Engineer, Database Architect)
- ✅ Agents needing detailed behavioral guidelines or decision frameworks
- ✅ Custom agent personas unique to this workflow

**When NOT to use:**

- ❌ Generic roles (Backend Developer, Frontend Developer, Code Reviewer)
- ❌ Agents that work with default Overcut configurations
- ❌ Simple delegation without specialized expertise

**Special Agent File Structure:**

```markdown
# [Agent Name] Agent Instructions

## Role Identity

[Who the agent is and their expertise]

## Core Responsibilities

[What the agent does]

## Expertise

[Technical knowledge areas]

## Key Principles

[Behavioral guidelines]

## Analysis Framework

[Decision-making process]

## Red Flags

[Warning signs or escalation triggers the agent must call out]

## Mission

[Definition of success, deliverables, and how the agent reports outcomes]
```

Existing personas such as `remediate-cves/special-agents/security-engineer-agent.md` follow this richer template—use them as references when authoring new special agents.

## 🔄 Updating Existing Playbooks

### Updating Prompts

1. **Edit the prompt file** (e.g., `code-review.md`)
2. **Update workflow.json** to match:
   - Find the step with matching `id` (e.g., `"id": "code-review"`)
   - Update the `instruction` field with content from the `.md` file
   - Maintain exact filename-to-ID matching

**Example:**

```bash
# User edits: code-review/code-review.md
# Agent must update: code-review/workflow.json
# Find step: {"id": "code-review", ...}
# Update: "instruction": "[content from code-review.md]"
```

### Adding New Steps

1. Add step to `workflow.json` with unique `id`
2. Create corresponding `{step-id}.md` file
3. Add flow connection in `workflow.definition.flow`
4. Update README.md workflow steps section

### Modifying Workflow Structure

- Update `workflow.definition.flow` for step connections
- Maintain valid JSON structure
- Update README.md to reflect changes
- Test workflow import in Overcut

## ✅ Quality Standards

### Workflow Files (workflow.json)

- ✅ Valid JSON syntax (no trailing commas, proper escaping)
- ✅ Complete step definitions (id, name, action, params, instruction)
- ✅ Clear step names and descriptions
- ✅ Appropriate timeout values (`stepMaxDurationMinutes`)
- ✅ Proper flow connections (all steps reachable)
- ✅ Valid trigger configurations
- ✅ Tested and working in Overcut

### Prompt Files (\*.md)

- ✅ Filename matches step ID exactly (case-sensitive)
- ✅ Clear, specific instructions
- ✅ Include examples when helpful
- ✅ Handle error cases explicitly
- ✅ Specify output format requirements
- ✅ Preserve user-provided content outside the requested changes unless explicitly told otherwise
- ✅ Enforce structured, sectioned outputs that match the workflow's expectations
- ✅ Pass complete context between steps using `{{outputs.step-id.field}}`
- ✅ No sensitive data or credentials

### Documentation (README.md)

- ✅ Grammar and spelling checked
- ✅ All template sections completed
- ✅ Code examples are accurate
- ✅ Customization guide included
- ✅ Prerequisites clearly stated
- ✅ Related workflows linked

### Special Agents (special-agents/\*.md)

- ✅ Only for specialized domain expertise
- ✅ Clear role identity and expertise areas
- ✅ Key principles and decision frameworks included
- ✅ Examples provided where helpful

## 🔧 Common Workflow Patterns

### Git Operations

```json
{
  "id": "git-clone",
  "name": "Clone Repo",
  "action": "git.clone",
  "params": {
    "branch": "{{trigger.pullRequest.headBranch}}",
    "repoFullName": "{{trigger.repository.fullName}}"
  }
}
```

### Agent Run (Single Agent)

```json
{
  "id": "step-id",
  "name": "Step Name",
  "action": "agent.run",
  "params": {
    "agentId": "agent-id-here"
  },
  "instruction": "[Content from step-id.md]"
}
```

### Agent Session (Multi-Agent Coordination)

```json
{
  "id": "step-id",
  "name": "Step Name",
  "action": "agent.session",
  "params": {
    "goal": "Goal description",
    "agentIds": ["agent-id-1", "agent-id-2"],
    "agentEngine": "overcut",
    "exitCriteria": {
      "timeLimit": {
        "maxDurationMinutes": 30
      }
    }
  },
  "instruction": "[Content from step-id.md]"
}
```

### Pull Request Operations

Workflows like `auto-pr-description` read the current PR context before updating it:

```json
[
  {
    "id": "read-pr-context",
    "name": "Read Pull Request",
    "action": "read_pull_request",
    "params": {
      "pullRequestNumber": "{{trigger.pullRequest.number}}",
      "repoFullName": "{{trigger.repository.fullName}}"
    }
  },
  {
    "id": "update-pr-description",
    "name": "Update Pull Request Description",
    "action": "update_pull_request",
    "params": {
      "pullRequestNumber": "{{trigger.pullRequest.number}}",
      "repoFullName": "{{trigger.repository.fullName}}",
      "description": "{{outputs.generate-description.prBody}}"
    }
  }
]
```

### Completing Workflow Runs

Many workflows finish by reporting results via `task_completed`:

```json
{
  "id": "report-results",
  "name": "Send Summary",
  "action": "task_completed",
  "params": {
    "summary": "{{outputs.generate-description.summary}}",
    "details": "{{outputs.generate-description.details}}"
  }
}
```

### Flow Connections

```json
{
  "flow": [
    {
      "to": "step-2",
      "from": "step-1",
      "condition": null
    }
  ]
}
```

### Triggers

**Automatic (Event-based):**

```json
{
  "event": "pull_request_opened",
  "conditions": {
    "rules": [
      {
        "field": "context.pullRequest.draft",
        "value": "false",
        "operator": "equals"
      }
    ]
  }
}
```

**Manual (Slash Command):**

```json
{
  "event": "manual",
  "slashCommand": {
    "command": "review",
    "requireMention": false
  }
}
```

## 🚨 Critical Rules

1. **Filename-ID Matching**: Prompt filenames MUST match step IDs exactly (case-sensitive, kebab-case)
2. **No Sensitive Data**: Never include API keys, tokens, credentials, or organization-specific agent IDs
3. **Valid JSON**: Always validate JSON syntax before committing
4. **Complete Documentation**: Every playbook must have a complete README.md
5. **Tested Workflows**: Only submit workflows that have been tested in Overcut
6. **Purposeful Changes Only**: Avoid stylistic-only or churn-inducing edits—updates must deliver clear, functional improvements per repository review policy.

## 📝 Output Reference Syntax

When passing data between steps, use this syntax:

- `{{outputs.step-id.field}}` - Reference output from previous step
- `{{trigger.event}}` - Reference trigger event data
- `{{trigger.pullRequest.headBranch}}` - Reference PR branch
- `{{trigger.repository.fullName}}` - Reference repository name

## 🔍 Validation Checklist

Before submitting a playbook, verify:

- [ ] All prompt filenames match step IDs exactly
- [ ] workflow.json has valid JSON syntax
- [ ] All steps have corresponding .md files
- [ ] README.md follows template and is complete
- [ ] No sensitive data included
- [ ] Flow connections are valid (all steps reachable)
- [ ] Triggers are properly configured
- [ ] Special agents (if any) are documented appropriately
- [ ] Workflow has been tested in Overcut

## 📚 Reference Examples

Study these playbooks for patterns:

### Simple
- **Auto PR Description** (`auto-pr-description/`) - Single-step workflow that drafts pull request summaries
- **Auto Changelog Reminder** (`auto-changelog-reminder/`) - Lightweight reminder workflow nudging contributors to update changelog entries

### Complex
- **Create PR from Design** (`create-pr-from-design/`) - Multi-phase implementation workflow from design handoff to PR submission
- **Auto Update AGENTS.md** (`auto-update-agents-md/`) - Scheduled documentation refresh pipeline that syncs guidance from repository analysis
- **Code Review** (`code-review/`) - Multi-agent session workflow coordinating planning, review, and follow-up steps

### Specialized
- **Remediate CVEs** (`remediate-cves/`) - Security-focused workflow that leverages special-agents instructions for remediation planning

### Documentation-First
- **Migration Package** (`migration-package/`) - README-driven scaffold that demonstrates the design-first process before prompts or workflow.json exist

## 🎯 Common Tasks

### Task: Create New Playbook

**Follow the design-first approach:**

1. Create folder with kebab-case name
2. Create README.md with high-level flow design (triggers, steps, data flow)
3. Create {step-id}.md prompt files for each planned step (validate design makes sense)
4. Generate workflow.json based on approved README design and prompt files
5. Add special-agents/ if needed
6. Validate JSON syntax and step ID ↔ filename matching
7. Test workflow in Overcut

_Note: Keep prompts idempotent and uphold the preservation/structured-output guarantees described above so repeated runs do not create conflicting edits._

### Task: Update Existing Prompt

1. Edit the {step-id}.md file
2. Update workflow.json: find step with matching id, update instruction field
3. Verify filename still matches step ID
4. Update README.md if step behavior changed significantly

_Note: Ensure edits remain idempotent and continue to preserve user-provided content plus structured outputs so workflows can rerun safely._

### Task: Add Step to Existing Workflow

**Follow the design-first approach:**

1. Update README.md workflow steps section (document the new step's purpose and position in flow)
2. Create {step-id}.md prompt file (ensure it makes sense in the workflow context)
3. Add step to workflow.json with unique id matching the prompt filename
4. Add flow connection in workflow.definition.flow
5. Copy prompt content to step's instruction field in workflow.json

_Note: New prompts must stay idempotent, preserve untouched user content, and deliver structured outputs that align with downstream expectations._

### Task: Fix Workflow Issues

1. Validate JSON syntax
2. Check all step IDs are unique
3. Verify all prompt files exist and match step IDs
4. Check flow connections (no orphaned steps)
5. Verify trigger configuration

## 🔗 Additional Resources

- [Overcut Documentation](https://docs.overcut.ai)
- [CONTRIBUTING.md](./CONTRIBUTING.md) - Detailed contribution guidelines
- [README.md](./README.md) - Repository overview and playbook catalog

---

**Remember**: The goal is to create reusable, well-documented workflows that help developers automate common software development tasks. Quality and clarity are more important than speed.
