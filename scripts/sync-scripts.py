#!/usr/bin/env python3
"""
Bundle tested Node step scripts into workflow.json script.run steps.

For each <playbook>/scripts/<step-id>.mjs (*.test.mjs files are skipped), the entry file and every file it
imports from scripts/lib/nightly/ (recursively, depth-first, each once) are
concatenated into one bash script that runs them with node via a heredoc, and
the result is written to that step's params.script. node:* imports are hoisted
to the top and de-duplicated. Any other import is an error.

Usage:
    python3 scripts/sync-scripts.py <playbook-directory> [--check]

--check writes nothing and exits 1 if any step differs from its bundle or an
entry file has no matching script.run step.
"""

import glob
import json
import os
import re
import sys

DELIMITER = "NIGHTLY_JS_EOF"
IMPORT_RE = re.compile(
    r"""^import\b(?P<clause>[^'";]*?)(?:\bfrom\b)?\s*(?P<q>['"])(?P<spec>[^'"]+)(?P=q)[ \t]*;?[ \t]*$""",
    re.M,
)
DECL_RE = re.compile(
    r"^(?:export\s+)?(?:async\s+)?(?:function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)", re.M
)


class BundleError(Exception):
    pass


def parse_clause(clause):
    """Split an import clause into (default, namespace, named list)."""
    default = namespace = None
    named = []
    clause = clause.strip()
    m = re.search(r"\{(.*?)\}", clause, re.S)
    if m:
        named = [n.strip() for n in m.group(1).split(",") if n.strip()]
        clause = clause[: m.start()] + clause[m.end():]
    m = re.search(r"\*\s*as\s+([\w$]+)", clause)
    if m:
        namespace = m.group(1)
        clause = clause[: m.start()] + clause[m.end():]
    clause = clause.strip(" ,\n\t")
    if clause:
        default = clause
    return default, namespace, named


class Bundler:
    def __init__(self, lib_root):
        self.lib_root = os.path.realpath(lib_root)
        self.done = set()
        self.active = []
        self.bodies = []
        self.node_imports = {}  # module -> {"default": set, "ns": set, "named": list}
        self.names = {}  # top-level name -> file

    def add_file(self, path):
        path = os.path.realpath(path)
        if path in self.done:
            return
        if path in self.active:
            raise BundleError(f"import cycle involving {path}")
        self.active.append(path)
        with open(path) as f:
            src = f.read()
        if DELIMITER in src:
            raise BundleError(f"{path} contains the heredoc delimiter {DELIMITER}")

        def handle(m):
            spec = m.group("spec")
            if spec.startswith("node:"):
                default, ns, named = parse_clause(m.group("clause"))
                entry = self.node_imports.setdefault(
                    spec, {"default": [], "ns": [], "named": [], "bare": True}
                )
                for key, val in (("default", default), ("ns", ns)):
                    if val and val not in entry[key]:
                        entry[key].append(val)
                for n in named:
                    if n not in entry["named"]:
                        entry["named"].append(n)
                if default or ns or named:
                    entry["bare"] = False
            elif spec.startswith("."):
                default, ns, named = parse_clause(m.group("clause"))
                if default or ns or any(" as " in n for n in named):
                    raise BundleError(
                        f"{path}: '{spec}' must use only plain named imports (inlining drops aliases)"
                    )
                target = os.path.realpath(os.path.join(os.path.dirname(path), spec))
                if os.path.commonpath([target, self.lib_root]) != self.lib_root:
                    raise BundleError(
                        f"{path}: relative import '{spec}' is outside scripts/lib/nightly/"
                    )
                self.add_file(target)
            else:
                raise BundleError(f"{path}: unsupported import '{spec}' (only node:* and lib files)")
            return ""

        body = IMPORT_RE.sub(handle, src)
        if re.search(r"^import\b(?!\s*\()", body, re.M):
            raise BundleError(f"{path}: could not parse an import statement")
        for name in DECL_RE.findall(body):
            if name in self.names:
                raise BundleError(
                    f"duplicate top-level name '{name}' in {path} and {self.names[name]}"
                )
            self.names[name] = path
        body = re.sub(r"^export\s+(?=\S)", "", body, flags=re.M)
        self.bodies.append(body.strip("\n"))
        self.active.pop()
        self.done.add(path)

    def render_imports(self):
        lines = []
        for mod in sorted(self.node_imports):
            e = self.node_imports[mod]
            for d in e["default"]:
                lines.append(f"import {d} from '{mod}';")
            for n in e["ns"]:
                lines.append(f"import * as {n} from '{mod}';")
            if e["named"]:
                lines.append("import { " + ", ".join(e["named"]) + f" }} from '{mod}';")
            if e["bare"]:
                lines.append(f"import '{mod}';")
        return lines

    def render(self):
        parts = [
            "set -euo pipefail",
            f"node --input-type=module - <<'{DELIMITER}'",
        ]
        parts += self.render_imports()
        parts += self.bodies
        parts += ["await main(process.env);", DELIMITER]
        return "\n".join(parts)


def build_script(entry_path, lib_root):
    b = Bundler(lib_root)
    b.add_file(entry_path)
    return b.render()


def find_lib_root(playbook_dir):
    """scripts/lib/nightly in the nearest ancestor of the playbook (a top-level playbook's
    parent, or the repo root for one under internal/)."""
    d = os.path.dirname(os.path.abspath(playbook_dir))
    while True:
        lib = os.path.join(d, "scripts", "lib", "nightly")
        if os.path.isdir(lib):
            return lib
        parent = os.path.dirname(d)
        if parent == d:
            raise BundleError(f"no scripts/lib/nightly above {playbook_dir}")
        d = parent


def sync_scripts(playbook_dir, check):
    workflow_path = os.path.join(playbook_dir, "workflow.json")
    if not os.path.isfile(workflow_path):
        raise BundleError(f"{workflow_path} not found")
    with open(workflow_path) as f:
        workflow = json.load(f)
    steps = {s["id"]: s for s in workflow["workflow"]["definition"]["steps"]}
    lib_root = find_lib_root(playbook_dir)

    entries = sorted(
        e for e in glob.glob(os.path.join(playbook_dir, "scripts", "*.mjs"))
        if not e.endswith(".test.mjs")
    )
    if not entries:
        raise BundleError(f"no scripts/*.mjs entry files in {playbook_dir}")

    drifted = []
    for entry in entries:
        step_id = os.path.basename(entry).removesuffix(".mjs")
        step = steps.get(step_id)
        if step is None or step.get("action") != "script.run":
            raise BundleError(f"{entry} has no script.run step '{step_id}' in workflow.json")
        script = build_script(entry, lib_root)
        params = step.setdefault("params", {})
        if params.get("script") != script:
            drifted.append(step_id)
            params["script"] = script

    if check:
        if drifted:
            print("Out of date (run without --check): " + ", ".join(drifted))
            return 1
        print("All scripts are in sync.")
        return 0

    if drifted:
        with open(workflow_path, "w") as f:
            json.dump(workflow, f, indent=2)
            f.write("\n")
    print(f"Synced {len(entries)} script(s) into {workflow_path} ({len(drifted)} updated).")
    return 0


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if a != "--check"]
    if len(args) != 1 or len(sys.argv) - 1 - len(args) > 1:
        print("Usage: python3 scripts/sync-scripts.py <playbook-directory> [--check]")
        sys.exit(1)
    try:
        sys.exit(sync_scripts(args[0], "--check" in sys.argv[1:]))
    except BundleError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
