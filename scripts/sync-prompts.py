#!/usr/bin/env python3
"""
Sync prompt .md files into workflow.json instruction fields.

Reads all *.md files in a playbook directory (excluding README.md),
matches them to steps in workflow.json by filename == step ID,
and updates each step's instruction field with the file content.

Usage:
    python3 scripts/sync-prompts.py <playbook-directory>

Examples:
    python3 scripts/sync-prompts.py break-down-ticket
    python3 scripts/sync-prompts.py code-review
    python3 scripts/sync-prompts.py requirements-document-generation
"""

import json
import glob
import os
import sys


def sync_prompts(playbook_dir):
    workflow_path = os.path.join(playbook_dir, "workflow.json")

    if not os.path.isfile(workflow_path):
        print(f"Error: {workflow_path} not found")
        sys.exit(1)

    # Load workflow.json
    with open(workflow_path, "r") as f:
        workflow = json.load(f)

    # Collect all prompt .md files (exclude README.md)
    prompts = {}
    for md_file in sorted(glob.glob(os.path.join(playbook_dir, "*.md"))):
        basename = os.path.basename(md_file)
        if basename == "README.md":
            continue
        step_id = basename.removesuffix(".md")
        with open(md_file, "r") as f:
            prompts[step_id] = f.read().rstrip("\n")

    if not prompts:
        print(f"No prompt .md files found in {playbook_dir}")
        sys.exit(1)

    # Match prompts to steps and update
    steps = workflow["workflow"]["definition"]["steps"]
    step_ids = {step["id"] for step in steps}

    updated = []
    unmatched_prompts = []
    unmatched_steps = []

    for step_id, content in prompts.items():
        if step_id not in step_ids:
            unmatched_prompts.append(step_id)
            continue
        for step in steps:
            if step["id"] == step_id:
                step["instruction"] = content
                updated.append(step_id)
                break

    # Check for agent steps that have no matching .md file
    for step in steps:
        if step.get("instruction") is not None and step["id"] not in prompts:
            unmatched_steps.append(step["id"])

    # Write back
    with open(workflow_path, "w") as f:
        json.dump(workflow, f, indent=2)
        f.write("\n")

    # Report results
    print(f"Synced {len(updated)} prompt(s) into {workflow_path}:")
    for step_id in updated:
        print(f"  {step_id}.md -> step '{step_id}'")

    if unmatched_prompts:
        print(f"\nWarning: .md files with no matching step in workflow.json:")
        for step_id in unmatched_prompts:
            print(f"  {step_id}.md")

    if unmatched_steps:
        print(f"\nWarning: steps with instructions but no matching .md file:")
        for step_id in unmatched_steps:
            print(f"  {step_id}")

    if not unmatched_prompts and not unmatched_steps:
        print("\nAll prompts and steps are in sync.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python3 scripts/sync-prompts.py <playbook-directory>")
        print("Example: python3 scripts/sync-prompts.py break-down-ticket")
        sys.exit(1)

    sync_prompts(sys.argv[1])
