# Technical Design Proposal

## Overview

Automatically generates comprehensive technical design documents from issue requirements. Analyzes the codebase context, creates detailed design proposals with architecture diagrams (Mermaid), identifies risks and mitigations, and posts the design as a comment. Opens an interactive session for questions and can kick off the **Create PR from Design** workflow on request.

## Triggers

**Automatic:**

- Event: `issue_labeled` when label is `needs-design`

**Manual:**

- Slash command: `/design`
- Can be used on any issue at any time

## Use Cases

- Systematic design documentation before implementation
- Architecture review and planning for complex features
- Team alignment on technical approach
- Knowledge capture for future reference
- Risk identification before coding begins
- Onboarding - showing architectural patterns and decisions
- **Large tickets:** Run `/design` first, review the proposal, then run `/pr` to implement

## Prerequisites

- Agents configured: Senior Developer, Technical Writer, Product Manager
- Mermaid diagram support (GitHub/GitLab/etc. should render Mermaid natively)

## Workflow Steps

1. **Identify Repositories** (`repo.identify`) - Finds relevant repos

   - Agents: None (automated repository identification)
   - Duration: ~30 seconds
   - Identifies up to 3 repositories with low confidence threshold (0.2)

2. **Clone Repository** (`git.clone`) - Clones identified repos

   - Agents: None (automated git operation)
   - Duration: ~1 min per repo

3. **Create Design** (`agent.session`) - Reads the ticket, explores the codebase, and produces a complete design document

   - Agents: Senior Developer, Technical Writer
   - Duration: ~10-15 min
   - Reads the triggering issue and all comments for requirements
   - Reviews the codebase for architecture context, similar implementations, and existing patterns
   - Produces a structured design document beginning with `### Proposed Design` in implementation plan format: Goal, sequential Phases with detailed tasks, Open Questions, Risks & Mitigations

4. **Post Design & Open Session** (`agent.session`) - Posts design and handles Q&A
   - Agents: Product Manager
   - Duration: Up to 120 min (interactive session)
   - Posts design as issue comment with `/pr` prompt
   - Assigns issue to creator
   - Adds `design-needs-feedback` or `design-complete` label based on open questions
   - Listens for follow-up comments

```
[Identify] → [Clone] → [Create Design] → [Post & Interact]
```

## Customization

### Step Prompts

- `create-design.md` - Controls design document structure (sections, depth, diagram types, constraints)
- `post-design.md` - Controls posting behavior (labels, assignment, follow-up)

### Common Adjustments

**Change design depth:**
Edit `create-design.md` to:

- High-level: "Focus on architecture overview and component interactions only"
- Detailed: "Include API contracts, data models, and sequence diagrams"
- Implementation-ready: "Add pseudo-code and specific technology choices"

**Customize sections:**
Edit `create-design.md` to add/remove sections:

- Add: "Security Considerations", "Performance Requirements", "Observability"
- Remove: "Edge Cases" if not needed
- Reorder: Place most important sections first

**Adjust diagram types:**
Edit `create-design.md` diagram requirements:

- Architecture: "Include C4 context and container diagrams"
- Flow: "Use sequence diagrams for complex interactions"
- Data: "Add ER diagrams for database changes"

**Change labeling logic:**
Edit `post-design.md` to:

- Add custom labels based on design type (e.g., `architecture-change`)
- Skip labeling entirely
- Add reviewers based on impacted areas

**Modify interactive session:**
Edit `post-design.md` and workflow.json:

- Disable session: Remove `listenToComments` and reduce duration
- Add auto-PR: Include logic to create implementation branch immediately
- Change exit criteria: Add different commands or time limits

## Related Workflows

- **Create PR from Design** - Implements the approved design as a Pull Request (triggered via `/pr`)
- **Code Review** - Reviews implementation after design is approved

---

_Part of the [Overcut Playbooks](../README.md) collection_
