import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sync-scripts.py")
IMPORT_A = "import { a } from '../../scripts/lib/nightly/a.mjs';\n"
ENTRY = IMPORT_A + "export async function main(env){ a(); }\n"


class SyncScriptsTest(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.root)
        self.pb = os.path.join(self.root, "pb")
        self.lib = os.path.join(self.root, "scripts", "lib", "nightly")
        os.makedirs(os.path.join(self.pb, "scripts"))
        os.makedirs(self.lib)
        self.write(os.path.join(self.lib, "a.mjs"), "export function a(){}\n")
        self.write_entry(ENTRY)
        wf = {"_formatVersion": "1.0.0", "workflow": {"name": "t", "definition": {
            "steps": [{"id": "run", "action": "script.run", "params": {"script": "old"}}]}}}
        self.write(os.path.join(self.pb, "workflow.json"), json.dumps(wf))

    def write(self, path, text):
        with open(path, "w") as f:
            f.write(text)

    def write_entry(self, text):
        self.write(os.path.join(self.pb, "scripts", "run.mjs"), text)

    def sync(self, *extra):
        return subprocess.run([sys.executable, SCRIPT, self.pb, *extra],
                              capture_output=True, text=True)

    def script(self):
        with open(os.path.join(self.pb, "workflow.json")) as f:
            return json.load(f)["workflow"]["definition"]["steps"][0]["params"]["script"]

    def test_bundles_entry_and_lib(self):
        self.assertEqual(self.sync().returncode, 0)
        s = self.script()
        self.assertTrue(s.startswith("set -euo pipefail\nnode --input-type=module - <<'NIGHTLY_JS_EOF'"))
        self.assertEqual(s.count("function a(){}"), 1)
        self.assertNotIn("import ", s)
        self.assertNotIn("export ", s)
        self.assertTrue(s.endswith("await main(process.env);\nNIGHTLY_JS_EOF"))

    def test_check_detects_drift(self):
        self.assertEqual(self.sync("--check").returncode, 1)
        self.assertEqual(self.sync().returncode, 0)
        self.assertEqual(self.sync("--check").returncode, 0)
        path = os.path.join(self.pb, "workflow.json")
        with open(path) as f:
            wf = json.load(f)
        wf["workflow"]["definition"]["steps"][0]["params"]["script"] += "\n# edit"
        self.write(path, json.dumps(wf))
        self.assertEqual(self.sync("--check").returncode, 1)

    def test_check_does_not_write(self):
        path = os.path.join(self.pb, "workflow.json")
        with open(path) as f:
            before = f.read()
        self.sync("--check")
        with open(path) as f:
            self.assertEqual(f.read(), before)

    def test_check_fails_for_entry_without_step(self):
        self.write(os.path.join(self.pb, "scripts", "orphan.mjs"), "export async function main(){}\n")
        r = self.sync("--check")
        self.assertEqual(r.returncode, 1)
        self.assertIn("orphan", r.stdout + r.stderr)

    def test_rejects_duplicate_top_level_name(self):
        self.write_entry(IMPORT_A + "function a(){}\nexport async function main(env){ a(); }\n")
        r = self.sync()
        self.assertEqual(r.returncode, 1)
        self.assertIn("a", r.stdout + r.stderr)
        self.assertIn("duplicate", (r.stdout + r.stderr).lower())

    def test_rejects_heredoc_delimiter(self):
        self.write(os.path.join(self.lib, "a.mjs"), "export function a(){ return 'NIGHTLY_JS_EOF'; }\n")
        r = self.sync()
        self.assertEqual(r.returncode, 1)
        self.assertIn("NIGHTLY_JS_EOF", r.stdout + r.stderr)

    def test_rejects_non_builtin_import(self):
        self.write_entry("import x from 'left-pad';\n" + ENTRY)
        r = self.sync()
        self.assertEqual(r.returncode, 1)
        self.assertIn("left-pad", r.stdout + r.stderr)

    def test_rejects_relative_import_outside_lib(self):
        self.write_entry("import { z } from './other.mjs';\n" + ENTRY)
        r = self.sync()
        self.assertEqual(r.returncode, 1)
        self.assertIn("other.mjs", r.stdout + r.stderr)

    def test_lib_imports_inlined_depth_first_and_node_imports_merged(self):
        self.write(os.path.join(self.lib, "b.mjs"),
                   "import { join } from 'node:path';\nimport fs from 'node:fs';\n"
                   "export function b(){ return join('x'); }\n")
        self.write(os.path.join(self.lib, "a.mjs"),
                   "import { b } from './b.mjs';\nimport { join, sep } from 'node:path';\n"
                   "import * as os from 'node:os';\nimport { b as bb } from './b.mjs';\n"
                   "export function a(){ b(); return [sep, os, fs]; }\n")
        self.assertEqual(self.sync().returncode, 0)
        s = self.script()
        self.assertEqual(s.count("function b()"), 1)
        self.assertLess(s.index("function b()"), s.index("function a()"))
        self.assertEqual(s.count("from 'node:path'"), 1)
        self.assertIn("import { join, sep } from 'node:path';", s)
        self.assertIn("import fs from 'node:fs';", s)
        self.assertIn("import * as os from 'node:os';", s)
        self.assertLess(s.index("node:path"), s.index("function b()"))

    def test_bundle_runs(self):
        self.write(os.path.join(self.lib, "a.mjs"),
                   "import { join } from 'node:path';\nexport function a(){ join('x'); }\n")
        self.assertEqual(self.sync().returncode, 0)
        r = subprocess.run(["bash", "-c", self.script()], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)


if __name__ == "__main__":
    unittest.main()
