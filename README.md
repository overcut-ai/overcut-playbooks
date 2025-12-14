# Overcut Playbooks

> Open-source collection of ready-to-use AI agent workflows for software development automation using [Overcut](https://overcut.ai).

## 🎯 What Are Playbooks?

Playbooks are pre-built, customizable workflows that use AI agents to automate complex software development tasks. Each playbook includes:

- **Workflow Definition** (`workflow.json`) - Import directly into Overcut
- **Step Prompts** (`step-*.md`) - Editable instructions for each workflow step
- **Documentation** (`README.md`) - Complete guide to understanding and customizing

## 🚀 Quick Start

### 1. Browse Playbooks

Explore the playbooks below to find workflows that match your needs.

### 2. Import to Overcut

1. Download the `workflow.json` file from any playbook folder
2. Go to Overcut Workflow Builder
3. Click "Import Workflow"
4. Upload the JSON file
5. Customize as needed

### 3. Customize with AI

Use AI to help you:

- Adjust prompts for your specific codebase
- Modify triggers and conditions
- Learn patterns to create new workflows

## 📚 Available Playbooks

### Code Quality & Review

#### [Code Review](./code-review/)

Automated comprehensive code review with inline comments and suggestions.

- **Trigger**: PR opened or `/review` command
- **Duration**: ~10-15 minutes
- **Output**: Detailed PR review with inline comments

#### [Auto Root Cause Analysis](./auto-root-cause-analysis/)

Automatically analyze bugs and suggest fixes when issues are labeled.

- **Trigger**: Issue labeled with `bug` or `/bug-rca` command
- **Duration**: ~5-10 minutes
- **Output**: RCA comment with suggested fix

### Planning & Documentation

#### [Technical Design Proposal](./technical-design-proposal/)

Generate comprehensive technical design documents from requirements.

- **Trigger**: Issue labeled with `needs-design` or `/design` command
- **Duration**: ~10-15 minutes
- **Output**: Design document with architecture diagrams

#### [Auto Changelog Reminder](./auto-changelog-reminder/)

Reminds developers to update changelog on PRs.

- **Trigger**: PR opened
- **Duration**: ~1 minute
- **Output**: Comment reminder

#### [Auto Docs Update on Merge](./auto-docs-update-on-merge/)

Automatically updates documentation when PRs are merged.

- **Trigger**: PR merged
- **Duration**: ~5 minutes
- **Output**: Updated documentation

### Collaboration

#### [Automated Ticket Triage](./automated-ticket-triage/)

Automatically categorize and prioritize new issues.

- **Trigger**: Issue created
- **Duration**: ~2-3 minutes
- **Output**: Labels and priority assigned

### Migration & Refactoring

#### [Migration Package](./migration-package/)

**Complete multi-workflow system** for migrating code between architectures or frameworks.

6 coordinated workflows that handle the full migration lifecycle:

1. **Module Identification** - Analyze and map your codebase structure
2. **Create Module Tickets** - Break down analysis into trackable tickets
3. **Module Analysis** - Deep dive into each module
4. **Code Migration Plan** - Create detailed implementation plans
5. **Implementation Tracking** - Set up tickets and branches for execution
6. **Work Package Implementation** - Execute migration based on the migration plan

**Time**: Varies by project size (hours to days)
**Output**: Fully tracked, tested migration with PRs and documentation

## 🎨 Customization Guide

### Understanding Prompt Files

**IMPORTANT**: Prompt filenames match step IDs in `workflow.json`

This naming convention enables AI-assisted workflow updates:

- When you edit a prompt file, AI can automatically update the workflow
- Bidirectional editing: change prompt → update workflow, or vice versa

**Example**:

```json
// In workflow.json
"steps": [{
  "id": "code-review",  // ← Step ID
  "instruction": "..."  // ← Content from code-review.md
}]
```

**Prompt file must be**: `code-review.md` (not `step-1-code-review.md`)

### Editing Prompts

Each workflow step has a corresponding `.md` file with the prompt:

```
code-review/
├── workflow.json
├── README.md
├── prepare-review-plan.md  ← Edit this to customize this step
├── code-review.md          ← Edit this to customize this step
└── ...
```

**To customize:**

1. Edit the markdown file for the step you want to change
2. **Option A**: Copy the prompt and manually update in Overcut Workflow Builder
3. **Option B**: Ask AI to update the workflow.json file, and import the `workflow.json` file into Overcut.

### Working with AI

AI can help you:

- **Adapt prompts** to your codebase conventions
- **Learn patterns** from existing playbooks
- **Create new workflows** based on these examples
- **Troubleshoot** when workflows don't behave as expected

### Example AI Prompts to Try

**Editing existing workflows:**

```
"I edited code-review.md to focus on security. Update workflow.json to match."
"Change the prepare-review-plan.md prompt to emphasize API changes, then update the workflow."
```

**Creating new workflows:**

```
"Adapt the code review workflow to focus on security issues"
"Create a new workflow similar to root cause analysis but for performance issues"
"Modify the design proposal workflow to include cost estimates"
```

## 🏗️ Workflow Structure

Each playbook folder contains:

```
playbook-name/
├── workflow.json          # Import this into Overcut
├── README.md              # Documentation and usage guide
├── step-id-name.md        # Prompt for step (filename = step ID)
├── another-step-id.md     # Each prompt file matches its step ID
└── ...                    # More steps as needed
```

**Important**: Prompt filenames must match the step IDs in `workflow.json`. This enables AI agents to automatically update workflows when you edit prompts.

The prompt files are a human readable duplication of the workflow.json file. You can edit the prompt files to customize the workflow, but eventually you will need to update the `workflow.json` file before importing it into Overcut.

### Understanding workflow.json

The workflow file includes:

- **Trigger configuration** - What starts the workflow
- **Step definitions** - Each step's action and parameters
- **Flow logic** - How steps connect and conditions
- **Agent references** - Which AI agents are used

**Note**: Agent IDs in these files are examples. When importing, you'll need to map them to your Overcut agents.

## 🤝 Contributing

We welcome contributions!

### Adding New Playbooks

1. Create a new folder with your playbook name
2. Include `workflow.json`, `README.md`, and step `.md` files
3. Follow the existing structure and README template
4. Submit a PR with your playbook

### Improving Existing Playbooks

- Found a better prompt? Submit improvements!
- Discovered edge cases? Add documentation!
- Built variations? Share them!

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed guidelines.

## 📖 Learning Resources

Below are some key concepts to understand about Overcut Workflows.
Read our [documentation](https://docs.overcut.ai) for more information.

### Understanding Overcut Workflows

- **Step Isolation**: Each step starts fresh - pass data explicitly
- **Agent Selection**: Choose the right agent personas for each task
- **Output References**: Use `{{outputs.step-id.field}}` syntax
- **Coordinator Patterns**: Learn when to use multi-agent coordination

### Key Concepts

- **Triggers**: Events or commands that start workflows
- **Steps**: Individual tasks (git operations, agent runs, agent sessions)
- **Agents**: AI personas with different specializations
- **Flow**: Connections between steps with optional conditions

## 🔗 Links

- [Overcut Platform](https://overcut.ai)
- [Documentation](https://docs.overcut.ai)

## 📄 License

MIT License - See [LICENSE](./LICENSE) for details.

---

**Built with ❤️ by the Overcut team**

_Have questions? Open an issue!_
