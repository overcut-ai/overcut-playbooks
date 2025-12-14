<a href="https://overcut.ai/#gh-light-mode-only">
  <img src="./logo-overcut-black.svg" width="380">
</a>
<a href="https://overcut.ai/#gh-dark-mode-only">
  <img src="./logo-overcut-white.svg" width="380">
</a>

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

### Planning & Requirements

- [Requirements Document Generation](./requirements-document-generation/) - Automatically generates comprehensive requirements documents from feature requests with codebase analysis and iterative review.
- [Technical Design Proposal](./technical-design-proposal/) - Generate comprehensive technical design documents from requirements.

### Code Quality & Review

- [Code Review](./code-review/) - Automated comprehensive code review with inline comments and suggestions.
- [Auto Root Cause Analysis](./auto-root-cause-analysis/) - Automatically analyze bugs and suggest fixes when issues are labeled.
- [Auto Changelog Reminder](./auto-changelog-reminder/) - Reminds developers to update changelog on PRs.
- [Auto Docs Update on Merge](./auto-docs-update-on-merge/) - Automatically updates documentation when PRs are merged.

### Collaboration

- [Automated Ticket Triage](./automated-ticket-triage/) - Automatically categorize and prioritize new issues.

### Migration & Refactoring

- [Migration Package](./migration-package/) - Complete multi-workflow system for migrating code between architectures or frameworks.

## 🎨 Customization Guide

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
- "I edited code-review.md to focus on security. Update workflow.json to match."
- "Change the prepare-review-plan.md prompt to emphasize API changes, then update the workflow."
```

**Creating new workflows:**

```
- "Adapt the code review workflow to focus on security issues"
- "Create a new workflow similar to root cause analysis but for performance issues"
- "Modify the design proposal workflow to include cost estimates"
- "Modify the design proposal workflow to include cost estimates"
```

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
