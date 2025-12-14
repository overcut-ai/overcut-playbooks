# Requirements Document Generation

## 📋 Overview

Automatically generates comprehensive requirements documents from feature requests. Conducts deep codebase analysis to understand context, creates detailed requirements through an iterative review process with multiple agents, and posts the final document to the ticket with appropriate labels. Ensures requirements are grounded in actual code patterns and technical constraints.

## ⚡ Triggers

**Automatic:**

- Event: `issue_labeled` when label is `feature`
- Delay: None

**Manual:**

- Slash command: `/requirements`
- Can be used on any issue at any time

## 🎯 Use Cases

- Systematic requirements gathering for new features
- Bridging product requests with technical reality
- Creating testable, specific requirements before design
- Knowledge capture about existing patterns and constraints
- Team alignment on scope and approach
- Identifying open questions early in the process
- Foundation for subsequent design and implementation phases

## 🔧 Prerequisites

- Agents configured: Senior Developer, Product Manager
- System Architect agent (for requirements review)

## 🏗️ Workflow Steps

1. **Identify Repositories** (`repo.identify`) - Finds relevant repos

   - Agents: None (automated repository identification)
   - Duration: ~30 seconds
   - Identifies up to 3 repositories with low confidence threshold (0.2)

2. **Clone Repository** (`git.clone`) - Clones identified repos

   - Agents: None (automated git operation)
   - Duration: ~1 min per repo

3. **Analyze Ticket** (`agent.run`) - Deep codebase analysis

   - Agents: Senior Developer (as Product Analyst)
   - Duration: ~30 min max
   - Explores codebase, identifies patterns, extracts use cases
   - Creates analysis document at `.overcut/requirements/analysis.md`

4. **Requirements Session** (`agent.session`) - Creates requirements document

   - Agents: Senior Developer, System Architect (coordinated by Coordinator)
   - Duration: ~20 min
   - Drafts comprehensive requirements with iterative review
   - Creates requirements document at `.overcut/requirements/requirements.md`
   - Max 2 revision iterations for quality

5. **Post Requirements** (`agent.session`) - Posts to ticket and labels
   - Agents: Product Manager
   - Duration: ~30 min max
   - Posts complete requirements document back to the ticket
   - Applies labels based on open questions status

```
[Identify] → [Clone] → [Analyze] → [Requirements] → [Post]
```

## 📄 Output Files

Temp scratchpad files are created at the sandbox workspace:

- `.overcut/requirements/analysis.md` - Codebase analysis findings
- `.overcut/requirements/requirements.md` - Final requirements document

Final results are posted back to the ticket.

## 🎨 Customization

### Step Prompts

- `analyze-ticket.md` - Controls codebase exploration depth and analysis structure
- `requirements-session.md` - Controls requirements document structure and review process
- `post-requirements.md` - Controls posting behavior and labeling logic

### Common Adjustments

**Change analysis depth:**
Edit `analyze-ticket.md` to:

- Light analysis: "Focus on high-level components and patterns only"
- Deep analysis: "Include detailed code flows, test patterns, and edge cases"
- Domain-specific: "Emphasize security patterns" or "Focus on data models"

**Customize requirements structure:**
Edit `requirements-session.md` document structure to:

- Add sections: "Compliance Requirements", "Migration Strategy", "Rollout Plan"
- Remove sections: "Testing Strategy" if handled elsewhere
- Reorder: Prioritize "Risks and Mitigations" earlier in document

**Adjust review strictness:**
Edit `requirements-session.md` review criteria:

- Stricter: "Architect must verify all use cases have acceptance criteria"
- Lenient: "Approve if core features are clear, details can evolve"
- Focus areas: "Emphasize security requirements" or "Focus on scalability"

**Change iteration limits:**
Edit `requirements-session.md` and `workflow.json`:

- More iterations: Change "max 2 iterations" to allow more refinement
- Faster completion: Reduce to 1 iteration for simpler features
- Time limits: Adjust `stepMaxDurationMinutes` in workflow.json

**Customize labeling logic:**
Edit `post-requirements.md` to:

- Add custom labels based on complexity (e.g., `high-complexity`)
- Skip labeling entirely
- Add assignees based on affected areas
- Tag specific reviewers based on impact

**Modify file locations:**
Edit all prompt files to change `.overcut/requirements/` to different paths:

- Use repo-specific paths if needed
- Change to `.docs/requirements/` or similar
- Store in ticket-specific directories

## 🔗 Related Workflows

- **Technical Design Proposal** - Creates design docs from requirements (use `/design` after requirements complete)
- **Code Review** - Reviews implementation that follows requirements
- **Auto Root Cause Analysis** - Analyzes bugs in features built from requirements

## 📊 Quality Assurance

The workflow includes multiple quality checks:

1. **Analysis Verification** - Confirms analysis file created before proceeding
2. **Iterative Review** - System Architect reviews requirements for completeness
3. **File Verification** - Confirms requirements file exists before posting
4. **Content Validation** - Verifies document has required sections before posting
5. **Posting Verification** - Confirms successful posting before labeling

## 💡 Best Practices

**For better results:**

- Ensure tickets have clear problem statements and context
- Include examples or user stories in the ticket
- Reference existing features that are similar
- Specify any constraints or non-goals upfront

**After workflow completes:**

- Review open questions and provide feedback in comments
- Use `/design` command to move to design phase
- Tag domain experts for specific areas flagged in requirements

**Customizing for your team:**

- Adjust tone/style guidelines in prompt files to match team culture
- Modify requirements structure based on your team's standards
- Add custom validation rules for your domain requirements
- Integrate with your team's labeling and workflow conventions

---

_Part of the [Overcut Playbooks](../README.md) collection_
