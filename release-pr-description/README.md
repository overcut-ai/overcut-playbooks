# Release PR Description

Automatically generate release-focused PR descriptions that summarize features and functionality rather than individual commits.

## Overview

This workflow creates comprehensive release notes when PRs target the `main` branch. Unlike `auto-pr-description` which lists individual commits, this workflow synthesizes changes into user-facing features, bug fixes, and improvements.

## Output Format

```markdown
## Release Summary
[1-2 paragraphs describing what this release brings to users]

## Highlights
[3-5 most important user-facing changes]

## Features
- **Feature Name**: Description of the new capability

## Bug Fixes
- **Issue Fixed**: Description of the problem that was resolved

## Breaking Changes
- **Change**: What changed and migration steps (if any)

## Improvements
- Performance, infrastructure, documentation changes
```

## Triggers

| Trigger | Conditions |
|---------|------------|
| PR Opened | Non-draft PR targeting `main` branch |
| PR Edited | New commits pushed to non-draft PR targeting `main` |
| Manual | `/release-description` comment on any PR |

## Use Cases

- **Release branches**: PRs from `release/*` or `develop` to `main`
- **Feature releases**: Large feature PRs merging to `main`
- **Version releases**: PRs that represent a new version

## Comparison with auto-pr-description

| Aspect | auto-pr-description | release-pr-description |
|--------|---------------------|------------------------|
| Focus | Individual commits | Features and functionality |
| Output | Commit list with changes | Release notes format |
| Target | PRs to non-`main` branches | PRs to `main` branch |
| Markers | `overcut:pr-description` | `overcut:release-description` |

**Note**: The `auto-pr-description` workflow is configured to exclude PRs targeting the `main` branch, ensuring there's no overlap between the two workflows. This separation allows each workflow to be optimized for its specific use case: detailed commit-level descriptions for feature PRs, and user-facing release notes for release PRs.

## How It Works

1. **Clone**: Clones the PR branch
2. **Analyze**: Reads PR diff, commits, and referenced tickets
3. **Synthesize**: Groups related commits into features/fixes
4. **Generate**: Creates release notes focused on user value
5. **Update**: Updates PR description with release notes

## Related Workflows

- **[Auto PR Description](../auto-pr-description/README.md)** - Generates commit-level descriptions for PRs targeting non-`main` branches. Use this workflow for feature PRs and this one for release PRs to `main`.
