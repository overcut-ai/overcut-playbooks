# Create PR from Design

## 📋 Overview

Automatically creates implementation pull requests from approved design documents. Analyzes the design, generates a structured implementation plan broken into phases, implements code changes with real-time progress tracking (commit per phase), writes comprehensive tests, performs validation (lint/format), and opens a ready-for-review pull request with complete documentation.

## ⚡ Triggers

**Manual:**

- Slash command: `/pr`
- Can be used on any issue at any time (typically after design approval)

## 🎯 Use Cases

- Automated PR creation from approved design documents
- Structured implementation following phased approach with progress tracking
- Coordinated development across frontend and backend changes
- Consistent implementation patterns and architecture adherence
- Real-time visibility through PR comment progress checkboxes
- Separate commits per phase for better code review
- Comprehensive test coverage for new functionality
- Validation and quality checks (lint/format) before PR submission
- Complete PR documentation with task checklists and summaries

## 🔧 Prerequisites

- Agents configured: Backend Developer, Frontend Developer (You can create more specialized agents for your project's needs)
- An approved design document in the issue or comments

## 🏗️ Workflow Steps

1. **Identify Repositories** (`repo.identify`) - Finds relevant repos

   - Agents: None (automated repository identification)
   - Duration: ~30 seconds
   - Identifies up to 3 repositories with low confidence threshold (0.2)

2. **Clone Repository** (`git.clone`) - Clones identified repos

   - Agents: None (automated git operation)
   - Duration: ~1 min
   - Shallow clone with depth 1 for efficiency

3. **Planning** (`agent.session`) - Creates phased implementation plan

   - Agents: Backend Developer, Frontend Developer
   - Duration: ~30 min max
   - Analyzes design document and codebase patterns
   - Creates structured plan with sequential phases
   - Focuses only on functional changes (no tests/docs in plan)

4. **Setup PR** (`agent.run`) - Sets up branch and draft PR

   - Agents: Backend Developer
   - Duration: ~30 min max
   - Pulls latest changes and creates `prbuilder/<slug>` branch
   - Creates draft pull request with initial description
   - Posts comment to issue with PR link

5. **Implement Changes** (`agent.session`) - Implements plan with tracking

   - Agents: Backend Developer, Frontend Developer (coordinated by Coordinator)
   - Duration: ~3 hours max
   - Posts PR comment with phase checkboxes for tracking
   - Implements each phase sequentially
   - **Commits and pushes after each phase** (separate commits)
   - Updates checkbox comment with commit SHA after each phase
   - Collects implementation summaries

6. **Validate Implementation** (`agent.session`) - Tests and validation

   - Agents: Backend Developer, Frontend Developer
   - Duration: ~1 hour max
   - Writes comprehensive tests for all new functionality
   - Runs tests to ensure they pass
   - Runs lint and format checks
   - Fixes any detected issues
   - **Separate commits for tests and validation fixes**

7. **Finalize PR** (`agent.run`) - PR ready for review
   - Agents: Backend Developer
   - Duration: ~30 min max
   - Updates PR description with complete implementation details
   - Converts draft PR to "Ready for Review"
   - Updates PR title (removes [DRAFT] prefix)
   - Posts completion comment to issue

```
[Identify] → [Clone] → [Planning] → [Setup PR] → [Implement] → [Validate] → [Finalize]
                                                      ↓             ↓
                                                  Commit per    Tests +
                                                    Phase       Lint/Format
```

## 📄 Progress Tracking

The workflow provides real-time visibility:

- **Draft PR created** at the start with plan summary
- **PR comment with checkboxes** tracks implementation progress
- **Checkbox updated** after each phase with commit SHA
- **Separate commits** for implementation phases, tests, and validation
- **Final PR description** includes complete summary with all commits

## 🎨 Customization

### Step Prompts

- `planning.md` - Controls plan structure (phases, task breakdown, detail level)
- `setup-pr.md` - Controls branch setup and draft PR creation
- `create-pr.md` - Controls implementation workflow with phase-by-phase tracking
- `validate-implementation.md` - Controls test writing and lint/format validation
- `finalize-pr.md` - Controls PR description update and finalization

### Common Adjustments

**Add specialized agents:**
Create specialized agents and add them to step **Implement Changes**:

- Create agents with specific expertise: "Database Expert", "API Developer", "UI/UX Specialist"
- Configure agents with relevant knowledge: Documentation, code examples, architecture patterns
- Add specialized agents to the `agentIds` list in the **Implement Changes** step in `workflow.json`
- Each task can be delegated to the most appropriate agent based on their expertise
- Benefits: Better code quality, domain-specific best practices, specialized problem-solving

**Change plan structure:**
Edit step **Planning** to:

- Fewer phases: "Combine related changes into 2-3 major phases"
- More detailed: "Break tasks into smaller, atomic steps"
- Different focus: "Emphasize security considerations in each phase"

**Adjust task grouping:**
Edit step **Implement Changes** task grouping strategy to:

- Smaller batches: "Max 2 tasks per iteration"
- Larger batches: "Group 4-6 related tasks per phase"
- Sequential: "Execute one task at a time for complex changes"

**Change branch naming:**
Edit step **Setup PR** branch setup to:

- Different prefix: "Use `feature/` instead of `prbuilder/`"
- Custom naming: "Use issue number in branch name"
- Different strategy: "Branch from specific branch instead of cloned branch"

**Adjust test requirements:**
Edit step **Validate Implementation** test writing to:

- Skip tests: "Do not write tests" (not recommended)
- Specific coverage: "Ensure 80%+ coverage for new code"
- Integration focus: "Emphasize integration tests over unit tests"
- Custom frameworks: "Use specific testing framework patterns"

**Customize validation:**
Edit step **Validate Implementation** validation to:

- Add type checking: "Run TypeScript type checker before lint"
- Add tests during validation: "Run full test suite as part of validation"
- Skip formatting: "Only run linter, skip formatter"
- Custom tools: "Use project-specific validation tools"

**Modify PR format:**
Edit step **Finalize PR** PR description template to:

- Add sections: "Screenshots", "Performance Impact", "Security Considerations"
- Remove sections: "Review Notes" if not needed
- Add automation: "Auto-assign reviewers based on affected areas"
- Custom labels: "Add custom labels based on implementation type"

## 🔗 Related Workflows

- **Technical Design Proposal** - Creates design docs that feed into this workflow (use `/design` first)
- **Code Review** - Reviews the PR created by this workflow (automatic or `/review`)
- **Fix Review Comments** - Handles feedback after PR review (use `/fix`)

## 💡 Best Practices

**For better results:**

- Ensure design document is complete and approved before running
- Include clear acceptance criteria in the design
- Reference similar implementations in the codebase
- Specify any constraints or dependencies upfront
- Review the implementation plan during planning step before proceeding

**During workflow execution:**

- Monitor progress through PR comment checkboxes
- Each phase creates a separate commit for easier review
- Can view real-time changes on the PR as they're pushed
- Workflow runs autonomously after plan approval

**After workflow completes:**

- Review the generated PR for completeness
- Verify all phases from the plan are implemented
- Check that tests are comprehensive and passing
- Verify lint/format checks passed
- Request review from appropriate team members
- Trigger automated code review by using the [Code Review](../code-review/) Use Case

**Customizing for your team:**

- Adjust task grouping size based on your complexity preferences
- Modify validation steps to match your CI/CD requirements
- Update PR description template to match team conventions
- Configure branch naming to align with Git workflow
- Add custom labels or reviewer assignment logic
- Adjust phase granularity in planning based on team needs

---

_Part of the [Overcut Playbooks](../README.md) collection_
