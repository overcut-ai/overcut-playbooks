# Contributing to Overcut Playbooks

Thank you for your interest in contributing! This repository is a community resource for sharing and improving AI workflow automation.

## 🎯 Ways to Contribute

### 1. Add New Playbooks

Share your successful workflows with the community!

**Requirements:**

- Working `workflow.json` file
- Complete `README.md` following our template
- Individual `.md` files for each step's prompt
- Clear documentation of use cases and customization options

### 2. Improve Existing Playbooks

- Better prompts that produce higher quality results
- Additional customization options
- Documentation improvements
- Bug fixes or edge case handling

### 3. Share Variations

- Specialized versions for specific tech stacks
- Industry-specific adaptations
- Workflow combinations and chains

### 4. Documentation

- Usage examples and case studies
- Troubleshooting guides
- Video tutorials or walkthroughs

## 📝 Playbook Structure Guidelines

Each playbook must follow this structure:

```
playbook-name/
├── workflow.json          # Complete workflow definition
├── README.md              # Following the standard template
├── step-1-description.md  # Prompt for each step
├── step-2-description.md
└── ...
```

### README Template

Use this structure for consistency:

```markdown
# [Workflow Name]

## 📋 Overview

[2-3 sentences about what it does and outputs]

## ⚡ Triggers

[Automatic and manual triggers]

## 🎯 Use Cases

[When to use this workflow]

## 🔧 Prerequisites

[Required setup]

## 🏗️ Workflow Steps

[Step-by-step breakdown]

## 🎨 Customization

[How to adapt the workflow]

## 🔗 Related Workflows

[Links to related playbooks]
```

## 🚀 Submission Process

### For New Playbooks

1. **Fork the repository**

   ```bash
   git clone https://github.com/overcut/overcut-playbooks.git
   cd overcut-playbooks
   git checkout -b add-playbook-[your-playbook-name]
   ```

2. **Create your playbook folder**

   ```bash
   mkdir [playbook-name]
   cd [playbook-name]
   ```

3. **Add required files**

   - `workflow.json` - Export from Overcut or create manually
   - `README.md` - Using the template above
   - `step-*.md` - One file per workflow step

4. **Test your workflow**

   - Import into Overcut
   - Run on test data
   - Verify outputs are correct
   - Document any edge cases

5. **Submit Pull Request**
   - Clear title: "Add [Playbook Name] workflow"
   - Description of what the workflow does
   - Screenshots or examples (if helpful)
   - Link to any related issues

### For Improvements

1. **Open an issue first** (optional but recommended)

   - Describe the improvement
   - Get feedback before investing time

2. **Make your changes**

   - Update relevant files
   - Keep changes focused and atomic
   - Test thoroughly

3. **Submit Pull Request**
   - Reference any related issues
   - Explain the improvement
   - Include before/after examples if applicable

## ✅ Quality Standards

### Workflow Files

- ✅ Valid JSON syntax
- ✅ Complete step definitions
- ✅ Clear step names and descriptions
- ✅ Appropriate timeout values
- ✅ Tested and working

### Prompts

- ✅ Clear, specific instructions
- ✅ Include examples when helpful
- ✅ Handle error cases
- ✅ Specify output format requirements
- ✅ Pass complete context between steps

### Documentation

- ✅ Grammar and spelling checked
- ✅ Code examples are accurate
- ✅ All sections completed
- ✅ Customization guide included
- ✅ Prerequisites clearly stated

### Naming Conventions

**CRITICAL**: Prompt filenames must match step IDs in `workflow.json`

- Folder names: `lowercase-with-hyphens`
- Prompt files: `{step-id}.md` (e.g., `prepare-review-plan.md` for step with `id: "prepare-review-plan"`)
- **NOT**: `step-1-name.md` or numbered files
- Clear, descriptive names (not too long)

#### Why This Matters

When prompt filenames match workflow step IDs, AI agents can:

- Automatically identify which step a prompt belongs to
- Update the workflow.json when a prompt is edited
- Maintain consistency between prompts and workflows
- Enable bidirectional editing (prompt ↔ workflow)

## 📝 Working with AI Agents

### Example AI Workflow

```
User: "I edited code-review.md to focus more on security. Update the workflow."

AI:
1. Reads code-review.md
2. Finds step with id "code-review" in workflow.json
3. Replaces instruction field with new content
4. Saves workflow.json

```

## 🔒 Agent IDs and Sensitive Data

**Important**: When sharing workflows, remember:

- Agent IDs in `workflow.json` are organization-specific. They will be replaced with the actual agent IDs when the workflow is imported into Overcut.
- Never include API keys, tokens, or credentials
- Sanitize any organization-specific information
- Remove any internal repository references

## 🤔 Not Sure Where to Start?

### Good First Contributions

- Add missing use case examples to existing playbooks
- Improve prompt clarity in existing workflows
- Add troubleshooting sections to READMEs
- Create variation of existing workflow for different tech stack

### Ideas for New Playbooks

Check the [Issues](https://github.com/overcut/overcut-playbooks/issues) page for:

- Requested workflows
- Common automation needs
- Specific industry use cases

## 📋 Pull Request Checklist

Before submitting, ensure:

- [ ] All files follow the standard structure
- [ ] README.md is complete and follows the template
- [ ] Workflow has been tested in Overcut
- [ ] No sensitive data or credentials included
- [ ] Commit messages are clear and descriptive
- [ ] PR description explains the contribution

## 🎉 Recognition

Contributors will be:

- Credited in the playbook README (as author/contributor)
- Thanked in release notes
- Invited to join the maintainers team (for regular contributors)

## 📄 License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

**Thank you for making Overcut better for everyone!** 🙌
