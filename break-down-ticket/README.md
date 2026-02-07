# Break Down Ticket

## 📋 Overview

Automatically decomposes large, well-defined tickets into smaller, independently implementable sub-tickets. Validates that sufficient requirements or design content exists before attempting breakdown, and creates structured sub-tickets with clear scope, acceptance criteria, dependencies, and implementation context from the codebase.

## ⚡ Triggers

**Automatic:**

- Event: `issue_labeled` when label is `needs-breakdown`
- Delay: None

**Manual:**

- Slash command: `/breakdown`
- Can be used on any issue at any time

## 🎯 Use Cases

- Decomposing large feature tickets into sprint-sized work items
- Creating implementation-ready sub-tickets with codebase context
- Identifying dependencies and suggesting implementation order
- Works with any ticket that has sufficient content — written by humans, agents, or a combination

## 🔧 Prerequisites

- Agents configured: Senior Developer
- Ticket should have detailed requirements, design doc, or technical spec (in body or comments)
- Repository access for codebase context

## 🏗️ Workflow Steps

1. **Identify Repositories** (`repo.identify`) - Finds relevant repos

   - Agents: None (automated repository identification)
   - Duration: ~30 seconds
   - Identifies up to 3 repositories with low confidence threshold (0.2)

2. **Clone Repository** (`git.clone`) - Shallow clone for codebase context

   - Agents: None (automated git operation)
   - Duration: ~1 min per repo

3. **Evaluate Ticket** (`agent.run`) - Gates the workflow

   - Agent: Senior Developer
   - Duration: ~15 min max
   - Reads ticket body and ALL comments to find requirements/design content
   - Respects timeline priority: later comments override earlier ones when scope evolves
   - Applies evaluation rubric: sufficient content → proceed; insufficient → early exit with guidance
   - Handles edge cases: closed tickets, already-small tickets, empty tickets
   - Outputs a SKIP or PROCEED signal only — does not pass content forward

4. **Create Sub-Tickets** (`agent.session`) - Decomposes and creates sub-tickets

   - Agent: Senior Developer (coordinated by Coordinator)
   - Duration: ~30 min max
   - Reads the ticket fresh (does not rely on previous step's output for content)
   - Explores codebase for technical boundaries and component structure
   - Splits along natural boundaries: by component, feature, dependency layer, or risk
   - Creates each sub-ticket with structured body (context, scope, requirements, acceptance criteria, dependencies, technical notes)
   - Copies relevant labels from parent ticket
   - Posts summary comment on original ticket with table of sub-tickets, dependency map, and suggested implementation order
   - Adds `breakdown-complete` label to original ticket

```
[Identify] → [Clone] → [Evaluate] → [Create Sub-Tickets]
```

## 🎨 Customization

### Step Prompts

- `evaluate-ticket.md` - Controls the evaluation rubric and early-exit behavior
- `create-sub-tickets.md` - Controls decomposition strategy, sub-ticket structure, and summary format

### Common Adjustments

**Change evaluation strictness:**
Edit `evaluate-ticket.md` to:

- Stricter: Require structured requirements document with numbered items
- Lenient: Accept rough design notes or detailed discussion threads
- Skip evaluation: Remove the gating step entirely for pre-validated tickets

**Customize sub-ticket structure:**
Edit `create-sub-tickets.md` to:

- Add sections: "Estimated Effort", "Team Assignment", "Sprint Target"
- Remove sections: "Technical Notes" if not needed
- Change format: Use different markdown templates for sub-ticket body

**Adjust decomposition strategy:**
Edit `create-sub-tickets.md` splitting guidelines to:

- Prefer splitting by feature for product-driven teams
- Prefer splitting by component for platform teams
- Add custom splitting criteria for your domain

**Customize labeling:**
Edit `create-sub-tickets.md` to:

- Add priority labels based on dependency order
- Add team-specific labels
- Skip label copying from parent

**Change summary format:**
Edit `create-sub-tickets.md` to:

- Use different table columns
- Add Gantt-style timeline suggestions
- Include effort estimates in summary

## 🔗 Related Workflows

- **Requirements Document Generation** - Generates requirements that can then be broken down
- **Technical Design Proposal** - Creates design docs that can then be broken down
- **Auto PR Description** - Generates PR descriptions when implementing sub-tickets

## 📊 Edge Cases

| Case | Handling | Step |
|------|----------|------|
| No body, no comments | Early exit + comment with guidance | evaluate-ticket |
| Vague body but detailed requirements in comments | Uses comment content, proceeds with breakdown | evaluate-ticket |
| Evolving discussion with scope changes | Later comments take precedence over earlier ones | evaluate-ticket |
| Already a single small task | Early exit + comment saying no breakdown needed | evaluate-ticket |
| Ticket is closed | Early exit, no comment posted | evaluate-ticket |
| Previous step signaled skip | Completes immediately without action | create-sub-tickets |
| Requirements are ambiguous | Proceeds but notes open questions in sub-tickets | create-sub-tickets |

## 💡 Best Practices

**For better results:**

- Ensure the ticket has detailed requirements, design, or specs — in the body or comments
- Include clear acceptance criteria or user stories
- Reference specific areas of the codebase that will be affected
- Mention any constraints, deadlines, or phasing requirements

**After workflow completes:**

- Review created sub-tickets for accuracy and completeness
- Adjust dependencies or scope if needed
- Use `/pr` on individual sub-tickets to start implementation
- Close or update the parent ticket as sub-tickets are completed

---

_Part of the [Overcut Playbooks](../README.md) collection_
