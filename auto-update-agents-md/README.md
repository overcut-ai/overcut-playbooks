# Auto Update AGENTS.md

## 📋 Overview

Automatically generates or updates the `AGENTS.md` file in any repository based on the current repository state. This workflow runs on a schedule to ensure the documentation stays synchronized with the repository structure, patterns, and best practices. The workflow analyzes the repository structure, extracts patterns from workflows and code, and generates comprehensive documentation for AI agents working with the repository.

## ⚡ Triggers

**Automatic:**

- **Schedule**: Runs daily at 2:00 AM (configurable via cron expression)
  - Default: `0 2 * * *` (daily at 2 AM)
  - Can be customized to run at different intervals (hourly, weekly, etc.)

**Manual:**

- Slash command: `/update-agents-md`
- Can be triggered manually to regenerate the documentation immediately

## 🎯 Use Cases

- **Documentation Maintenance**: Keeps AGENTS.md synchronized with repository changes
- **Onboarding**: Ensures new contributors have up-to-date instructions
- **Consistency**: Maintains documentation standards across the repository
- **Automation**: Reduces manual documentation maintenance overhead
- **Pattern Recognition**: Automatically captures new patterns and best practices from the codebase
- **Multi-Repository**: Can be used in any repository to maintain AGENTS.md files

## 🔧 Prerequisites

- Agents configured: Senior Developer, Technical Writer

## 🏗️ Workflow Steps

1. **Clone Repo** (`git.clone`) - Clones the main branch to get latest repository state

   - Agents: None (automated git operation)
   - Duration: ~1 min
   - Uses shallow clone with blob filtering for efficiency
   - Clones the default branch (usually `main` or `master`)

2. **Prepare Branch** (`agent.run`) - Setups the working branch for documentation updates

   - Agent: Senior Developer
   - Duration: ~2 min
   - Searches for an existing open Pull Request related to `AGENTS.md` updates
   - If an open PR is found, switches to that branch to use it as a baseline
   - If no PR exists, creates a new feature branch from the default branch
   - Ensures the workflow makes incremental updates to existing drafts instead of creating duplicate PRs

3. **Analyze Repository** (`agent.run`) - Analyzes repository structure and patterns

   - Agent: Senior Developer
   - Duration: ~5-10 min
   - Scans repository structure (directories, files, organization)
   - Reads workflow.json files (if present) to understand workflow patterns
   - Analyzes README.md files for documentation patterns
   - Extracts code patterns and structures
   - Identifies common practices and conventions
   - Reads existing AGENTS.md (if present) to understand current structure
   - Outputs structured analysis data for documentation generation

4. **Generate AGENTS.md** (`agent.session`) - Generates or updates the AGENTS.md file

   - Agents: Senior Developer, Technical Writer
   - Duration: ~5-10 min (up to 15 min for complex updates)
   - Receives analysis data from previous step
   - Reads existing AGENTS.md (if exists) and compares with analysis
   - Determines if changes are needed (only updates when necessary)
   - Generates or updates AGENTS.md content based on repository structure
   - Preserves existing structure and style when updating
   - Ensures all discovered patterns are documented
   - Writes file to repository (without committing)
   - Outputs whether changes were made

5. **Review Changes** (`agent.run`) - Reviews the generated changes for significance

   - Agent: Senior Developer
   - Duration: ~2-3 min
   - Analyzes the `git diff` of the `AGENTS.md` file
   - Discards changes if they are purely stylistic, formatting-related, or minor
   - Categorizes changes as Significant vs Insignificant
   - Reverts the file (`git checkout`) if changes are discarded
   - Outputs whether changes are significant

6. **Commit Changes** (`agent.run`) - Commits the updated AGENTS.md and manages the PR

   - Agent: Senior Developer
   - Duration: ~2-5 min
   - Checks if changes were deemed significant in the previous step
   - If no significant changes: exits immediately
   - If changes detected:
     - Commits the `AGENTS.md` file to the current branch
     - Pushes the branch to remote
     - If an existing PR was found: Updates the PR and notifies the user
     - If no PR existed: Creates a new pull request with detailed summary

```
[Clone] → [Prepare Branch] → [Analyze Repository] → [Generate AGENTS.md] → [Review Changes] → [Commit Changes]
```

## 📝 AGENTS.md Structure

The workflow generates/updates AGENTS.md with sections appropriate to the repository structure. Common sections include:

- **Project Overview**: Repository purpose and key technologies
- **Repository Structure**: Directory organization and file conventions
- **Development Guidelines**: Best practices and conventions
- **Workflow Patterns**: Common patterns and examples (if workflows are present)
- **Quality Standards**: Requirements and validation rules
- **Critical Rules**: Important constraints and requirements
- **Common Tasks**: Step-by-step guides for frequent operations

The exact structure adapts based on what the repository contains (workflows, code, documentation, etc.).

## 🎨 Customization

### Schedule Configuration

Edit the trigger schedule in `workflow.json`:

```json
{
  "event": "schedule",
  "schedule": {
    "cron": "0 2 * * *" // Daily at 2 AM UTC
  }
}
```

Common schedule patterns:

- Hourly: `"0 * * * *"`
- Daily: `"0 2 * * *"`
- Weekly (Monday 2 AM): `"0 2 * * 1"`
- Twice daily: `"0 2,14 * * *"`

### Step Prompts

The workflow uses following prompt files:

- `prepare-branch.md` - Controls branch selection and existing PR detection
- `analyze-repo.md` - Controls repository analysis and pattern extraction
- `generate-agents-md.md` - Controls documentation generation logic
- `review-changes.md` - Controls the significance filter logic
- `commit-changes.md` - Controls commit and PR management operations

You can customize:

**Analysis depth:**

- Adjust which files and directories to analyze
- Change pattern recognition logic
- Modify what information to extract
- Customize what repository structures to focus on

**Documentation sections:**

- Add new sections to AGENTS.md
- Modify section structure
- Change documentation style
- Adapt to repository-specific needs

**PR creation behavior:**

- Customize commit messages
- Customize PR titles and descriptions
- Modify branch naming pattern
- Add PR validation rules

### Common Adjustments

**Change update frequency:**
Edit the schedule cron expression in the trigger configuration.

**Skip PR if no changes:**
The PR creation step already handles this - it checks the `changes_made` output from the previous step and only creates a PR if changes were detected.

**Customize branch naming:**
Edit commit-changes.md to change the branch naming pattern (currently `docs/update-agents-md-<timestamp>`).

**Add custom analysis:**
Edit analyze-repo.md to extract additional patterns or information from the repository structure.

## 🔍 How It Works

1. **Clones repository:**
   - Gets the latest state of the main branch

2. **Prepares working branch:**
   - Searches for open PRs with the `docs/update-agents-md-` prefix.
   - If found, checks out and pulls the latest from that branch.
   - If not found, creates a new timestamped feature branch.
   - This ensures the workflow builds on current drafts rather than creating duplicate PRs.

3. **Analyzes repository structure:**
   - Scans repository directories and files
   - Reads workflow.json files (if present) to extract:
     - Step patterns and actions
     - Trigger configurations
     - Agent usage patterns
     - Flow structures
   - Reads README.md files to understand:
     - Documentation patterns
     - Project structure
     - Conventions and practices
   - Analyzes code structure to identify:
     - Common patterns
     - Best practices
     - Conventions
   - Reads existing AGENTS.md to understand:
     - Current documentation structure
     - What sections to preserve
     - What sections to update

4. **Generates AGENTS.md:**
   - Uses analysis data to build comprehensive documentation
   - Compares with existing AGENTS.md (if exists) to determine if updates are needed
   - Only makes changes when necessary (avoids unnecessary PRs)
   - Preserves existing structure and style when updating
   - Updates dynamic content (like reference examples) when repository changes
   - Ensures all discovered patterns are documented
   - Maintains consistent formatting and style
   - Writes file to repository (without committing)
   - Outputs whether changes were made

5. **Reviews changes:**
   - Performs a Significance check on the `git diff`
   - Discards noise (formatting, style, minor rewording)
   - Reverts file if no significant updates are found

6. **Finalizes changes:**
   - Checks significance from the review step
   - If no significant changes: exits without committing
   - If changes detected:
     - Commits the updated `AGENTS.md` to the current branch.
     - Pushes the branch to remote origin.
     - Automatically updates any existing open Pull Request or creates a new one if necessary.
   - Handles errors gracefully

## 🚨 Edge Cases Handled

- **No changes detected**: Skips PR creation, reports success
- **Git errors**: Reports error but doesn't fail workflow
- **PR creation fails**: Reports error, branch and commit still exist locally
- **Unusual repository structure**: Adapts analysis to available structure
- **Large repository**: Optimizes analysis for performance

## 🔗 Related Workflows

- **Auto PR Description** - Generates PR descriptions
- **Code Review** - Reviews code quality
- **Auto Docs Update on Merge** - Updates documentation on PR merge

## 🌍 Generic Usage

This workflow is designed to work with **any repository**, not just playbook repositories. It will:

- Analyze whatever structure exists in the repository
- Generate appropriate AGENTS.md content based on what it finds
- Adapt to different repository types (workflows, codebases, documentation, etc.)
- Preserve existing AGENTS.md structure and style when updating

## ⚙️ Execution Order

This workflow runs independently on a schedule and doesn't depend on other workflows. It has a lower priority (default: 5) to avoid interfering with user-triggered workflows.

## 📊 Output

The workflow outputs:

- `analysis_complete`: Whether repository analysis completed successfully (yes/no)
- `changes_made`: Whether AGENTS.md was updated (yes/no)
- `changes_committed`: Whether changes were committed (yes/no)
- `pr_created`: Whether a pull request was created (yes/no)
- `branch_name`: The branch name if PR was created (null otherwise)
- `pr_number`: The PR number if PR was created (null otherwise)
- `pr_url`: The PR URL if PR was created (null otherwise)

**Example outputs:**

**If PR was created successfully:**

```
analysis_complete: yes
changes_made: yes
changes_committed: yes
pr_created: yes
branch_name: docs/update-agents-md-20250120
pr_number: 123
pr_url: https://github.com/org/repo/pull/123
```

**If no changes needed:**

```
analysis_complete: yes
changes_made: no
changes_committed: no
pr_created: no
branch_name: null
pr_number: null
pr_url: null
reason: no_changes_detected
```

