# Technical Design Proposal

## 📋 Overview

Automatically generates comprehensive technical design documents from issue requirements. Analyzes the codebase context, creates detailed design proposals with architecture diagrams (Mermaid), identifies risks and mitigations, and posts the design as a comment. Opens an interactive session for questions and can create implementation branches on request.

## ⚡ Triggers

**Automatic:**

- Event: `issue_labeled` when label is `needs-design`
- Delay: None

**Manual:**

- Slash command: `/design`
- Can be used on any issue at any time

## 🎯 Use Cases

- Systematic design documentation before implementation
- Architecture review and planning for complex features
- Team alignment on technical approach
- Knowledge capture for future reference
- Risk identification before coding begins
- Onboarding - showing architectural patterns and decisions

## 🔧 Prerequisites

- Agents configured: Senior Developer, Technical Writer, Product Manager
- Mermaid diagram support (GitHub/GitLab/etc. should render Mermaid natively)

## 🏗️ Workflow Steps

1. **Identify Repositories** (`repo.identify`) - Finds relevant repos

   - Agents: None (automated repository identification)
   - Duration: ~30 seconds
   - Identifies up to 3 repositories with low confidence threshold (0.2)

2. **Clone Repository** (`git.clone`) - Clones identified repos

   - Agents: None (automated git operation)
   - Duration: ~1 min per repo

3. **Analyze Ticket** (`agent.run`) - Extracts requirements and scope

   - Agents: Senior Developer
   - Duration: ~1-2 min
   - Identifies functional/non-functional requirements, impacted areas, open questions

4. **Design Session** (`agent.session`) - Creates detailed design document

   - Agents: Senior Developer, Technical Writer (coordinated by Coordinator)
   - Duration: ~10-15 min
   - Drafts comprehensive design with diagrams and risk analysis

5. **Post Design & Open Session** (`agent.session`) - Posts design and handles Q&A
   - Agents: Product Manager
   - Duration: Up to 120 min (interactive session)
   - Posts design, assigns issue, adds labels, responds to questions

```
[Identify] → [Clone] → [Analyze] → [Design] → [Post & Interact]
```

## 🎨 Customization

### Step Prompts

- `analyze-ticket.md` - Controls requirement extraction (what to look for, output format)
- `design-session.md` - Controls design document structure (sections, depth, diagram types)
- `post-design.md` - Controls posting behavior (labels, assignment, follow-up)

### Common Adjustments

**Change design depth:**
Edit `design-session.md` to:

- High-level: "Focus on architecture overview and component interactions only"
- Detailed: "Include API contracts, data models, and sequence diagrams"
- Implementation-ready: "Add pseudo-code and specific technology choices"

**Customize sections:**
Edit `design-session.md` to add/remove sections:

- Add: "Security Considerations", "Performance Requirements", "Observability"
- Remove: "Edge Cases" if not needed
- Reorder: Place most important sections first

**Adjust diagram types:**
Edit `design-session.md` diagram requirements:

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

## 🔗 Related Workflows

- **Code Review** - Reviews implementation after design is approved
- **Auto Root Cause Analysis** - Analyzes bugs in implemented designs

---

_Part of the [Overcut Playbooks](../README.md) collection_
