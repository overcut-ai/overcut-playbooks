# Migration Package

> **Complete Multi-Workflow System** for code migration between architectures, frameworks, or repositories

## 📋 Overview

The Migration Package is a coordinated system of 6 workflows that guide you through the entire code migration lifecycle - from initial analysis to final implementation. Each workflow triggers the next automatically, creating a seamless end-to-end migration process with full tracking, review cycles, and quality gates.

**Time Investment**: Days to weeks depending on project size  
**Output**: Fully documented, tested, tracked migration with PRs and tickets

## 🎯 What Problem Does This Solve?

Migrating code between systems is complex and error-prone. Common challenges:

- **Lost context**: Understanding what needs to migrate and why
- **Incomplete analysis**: Missing dependencies or edge cases
- **Poor tracking**: No visibility into migration progress
- **Quality issues**: Rushed implementations without proper review
- **Knowledge silos**: Migration knowledge trapped in one person's head

The Migration Package solves this with:

- **Systematic analysis**: AI-driven codebase decomposition
- **Hierarchical tracking**: Tickets for every module and work package
- **Built-in review**: Developer-Architect cycles ensure quality
- **Clear dependencies**: Work packages track what must be done first
- **Full documentation**: Every decision and constraint documented

## 🏗️ The 6 Workflows

### 1. Module Identification

**Trigger**: `/migrate-1` command on an issue  
**Duration**: ~10-20 min  
**Output**: Analysis file mapping all major modules/bounded contexts

Analyzes your codebase and creates a hierarchical map of all modules. Uses a Developer-Architect review loop to ensure completeness.

[Details →](./1-module-identification/)

---

### 2. Create Module Tickets

**Trigger**: Automatic after Workflow 1 completes  
**Duration**: ~2-5 min  
**Output**: One ticket per module identified

Breaks down the module map into individual tickets. Each ticket becomes a separate analysis task, enabling parallel work.

[Details →](./2-create-module-tickets/)

---

### 3. Module Analysis

**Trigger**: `/migrate-3` label on module ticket  
**Duration**: ~10-30 min per module  
**Output**: Either module list (for further decomposition) OR deep analysis (for leaf modules)

Performs deep analysis on each module. Can recursively create sub-module tickets or provide implementation-ready analysis.

[Details →](./3-module-analysis/)

---

### 4. Code Migration Plan

**Trigger**: Automatic after Workflow 3 (deep analysis)  
**Duration**: ~15-45 min  
**Output**: Migration plan PR with work packages and acceptance criteria

Creates detailed implementation plans focused on business logic migration. Defines work packages, dependencies, and testing requirements.

[Details →](./4-code-migration-plan/)

---

### 5. Implementation Tracking

**Trigger**: Manual after migration plan PR is merged  
**Duration**: ~5-10 min  
**Output**: Parent tracking ticket + child tickets for each work package

Sets up the complete ticket and branch structure for implementation. Creates coordination infrastructure.

[Details →](./5-implementation-tracking/)

---

### 6. Work Package Implementation

**Trigger**: Manual on each work package ticket when ready  
**Duration**: ~30-120 min per work package  
**Output**: Implemented code + tests in a PR ready for review

Executes the migration with AI assistance. Developer-Architect cycles ensure code quality and constraint compliance.

[Details →](./6-work-package-implementation/)

## 🎨 Migration Flow Diagram

```
                    ┌─────────────────────────────────┐
                    │   Issue: "Migrate System X"    │
                    │   Command: /migrate-1           │
                    └──────────────┬──────────────────┘
                                   │
                    ┌──────────────▼──────────────────┐
                    │  1. Module Identification       │
                    │  Output: module-map.md          │
                    └──────────────┬──────────────────┘
                                   │ auto-triggers
                    ┌──────────────▼──────────────────┐
                    │  2. Create Module Tickets       │
                    │  Output: Ticket per module      │
                    └──────────────┬──────────────────┘
                                   │ parallel execution
                ┌──────────────────┼──────────────────┐
                │                  │                  │
     ┌──────────▼───────┐ ┌───────▼────────┐ ┌──────▼─────────┐
     │ Module A Ticket  │ │ Module B Ticket│ │ Module C Ticket│
     │ /migrate-3       │ │ /migrate-3     │ │ /migrate-3     │
     └──────────┬───────┘ └───────┬────────┘ └──────┬─────────┘
                │                  │                  │
     ┌──────────▼───────┐ ┌───────▼────────┐ ┌──────▼─────────┐
     │3. Module Analysis│ │3. Module       │ │3. Module       │
     │Output: Analysis  │ │   Analysis     │ │   Analysis     │
     └──────────┬───────┘ └───────┬────────┘ └──────┬─────────┘
                │                  │                  │
                │ if deep analysis │                  │
     ┌──────────▼───────┐          │                  │
     │4. Migration Plan │          │                  │
     │Output: Plan PR   │          │                  │
     └──────────┬───────┘          │                  │
                │                  │                  │
                │ after PR merged  │                  │
     ┌──────────▼──────────────────┴──────────────────┘
     │5. Implementation Tracking                      │
     │Output: Parent + Child Tickets                  │
     └──────────┬─────────────────────────────────────┘
                │ parallel execution
     ┌──────────┼─────────────────────────────────────┐
     │          │                                      │
┌────▼────┐ ┌──▼─────┐ ┌──────────┐           ┌──────────┐
│WP-1     │ │WP-2    │ │WP-3      │    ...    │WP-N      │
│Ticket   │ │Ticket  │ │Ticket    │           │Ticket    │
└────┬────┘ └──┬─────┘ └──┬───────┘           └──┬───────┘
     │         │            │                      │
┌────▼──────┐┌─▼────────┐┌─▼────────────┐  ┌─────▼────────┐
│6. WP Impl ││6. WP Impl││6. WP Impl    │  │6. WP Impl    │
│Output: PR ││Output: PR││Output: PR    │  │Output: PR    │
└───────────┘└──────────┘└──────────────┘  └──────────────┘
         │          │            │                 │
         └──────────┴────────────┴─────────────────┘
                              │
                    ┌─────────▼──────────┐
                    │  All Work Complete │
                    │  Merge to Main     │
                    └────────────────────┘
```

## 🔧 Prerequisites

- **Two repositories**:
  - Source repository (being migrated from)
  - Target repository (being migrated to)
- Both repositories connected to Overcut
- Issue and PR webhooks configured
- Agents configured: Senior Developer, System Architect, Root-Cause Analysis Expert
- Bot has permissions to:
  - Comment on issues and PRs
  - Create branches and PRs
  - Update issue labels and fields
  - Clone repositories
- Critical constraints understood:
  - APIs must remain 1:1 identical
  - Data stays in same database (no data migration)
  - Focus on business logic only
  - Use target repo's existing infrastructure

## 🚀 Getting Started

### Step 1: Prepare

1. Create an issue in your source repository titled: "Migrate [System Name]"
2. In the issue body, describe:
   - What system/module you're migrating
   - Why you're migrating it
   - Any special considerations

### Step 2: Start Module Identification

Comment on the issue: `/migrate-1`

This triggers Workflow 1, which will:

- Analyze your codebase
- Create a module identification document
- Post results and automatically trigger Workflow 2

### Step 3: Wait for Ticket Creation

Workflow 2 automatically creates tickets for each identified module. Review them and trigger analysis:

- Label each ticket with `migrate-3` OR
- Comment `/migrate-3` on tickets

### Step 4: Parallel Analysis

Workflows 3 and 4 process modules in parallel:

- Each module gets analyzed independently
- Migration plans are created for leaf modules
- All plans go through review cycles

### Step 5: Coordinate Implementation

After migration plan PRs are merged:

- Manually trigger Workflow 5 on each merged PR
- Review the implementation tracking structure
- Start work packages when ready

### Step 6: Implement Work Packages

For each work package ticket:

- Trigger Workflow 6 when dependencies are met
- AI implements the work package with review cycles
- PRs are created and ready for human review
- Merge to parent branch when approved

## 🎨 Customization

Each workflow can be customized independently. Common adjustments:

### Analysis Depth

- Shallow: Focus on module identification only
- Deep: Include dependency analysis and risk assessment
- Historical: Add git history and evolution analysis

### Review Cycles

- Strict: Require approval from Architect on every iteration
- Balanced: Max 2 iterations per step (default)
- Aggressive: Single pass, no review cycles

### Work Package Size

- Fine-grained: 1-2 business flows per package
- Balanced: 3-5 flows per package (default)
- Coarse-grained: Full feature areas per package

### Constraints

Customize the migration constraints in Workflow 4-6 prompts:

- Allow API changes if needed
- Include data migration steps
- Add new infrastructure components

See individual workflow READMEs for detailed customization guides.

## 📝 Best Practices

### 1. Start Small

- Begin with one small module as a pilot
- Learn the process before scaling
- Adjust workflows based on learnings

### 2. Maintain Momentum

- Don't let tickets sit idle
- Process modules in parallel when possible
- Set up dedicated time for migration work

### 3. Review Everything

- Human review after each AI pass
- Test each work package thoroughly
- Maintain quality gates throughout

### 4. Track Dependencies

- Visualize work package dependencies
- Implement in dependency order
- Don't start work packages prematurely

### 5. Document Decisions

- Capture rationale in ticket comments
- Update plans when constraints change
- Maintain a migration journal

## 🔗 Related Resources

- [Main Playbooks README](../README.md)
- [Overcut Documentation](https://docs.overcut.ai)
- [Migration Best Practices Guide](https://docs.overcut.ai/migration)

## ❓ Common Questions

**Q: Can I run this on a single repository?**  
A: The workflows expect source and target repos. For single-repo refactoring, adjust the clone steps.

**Q: How do I handle blocked work packages?**  
A: Document infrastructure gaps in the migration plan. Address gaps before starting dependent work packages.

**Q: Can I skip the review cycles?**  
A: Yes, but not recommended. Edit prompts to reduce iteration limits or remove Architect review.

**Q: What if my migration needs schema changes?**  
A: Adjust Workflow 4 constraints to allow data migration steps. Add database migration work packages.

**Q: How long does this take?**  
A: Varies by project: Small modules (1-2 weeks), Medium systems (1-2 months), Large systems (2-6 months).

---

_Part of the [Overcut Playbooks](../README.md) collection_
