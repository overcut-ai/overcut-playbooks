import copy
import importlib.util
import io
import json
import os
import re
import unittest
import urllib.error
import urllib.request
from contextlib import redirect_stderr, redirect_stdout
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SCRIPT = os.path.join(HERE, "install-library-templates.py")
TEMPLATE = os.path.join(ROOT, "orchestrations", "nightly-test-failures-to-fix", "orchestration.json")
LOCAL_GRAPHQL = "http://localhost:3000/graphql"
TOKEN = "SECRET-TOKEN-do-not-print"

_spec = importlib.util.spec_from_file_location("install_library_templates", SCRIPT)
inst = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(inst)

NAMES = {"Test Failure Triage": "wf-triage", "Test Failure Fix": "wf-fix"}
ALL_LIMITS = ["maxParallelSteps", "maxRepeatsPerWorkflow", "maxSteps",
              "idleTimeoutHours", "maxIdleHours", "maxActiveInstances"]
REQUIRED_LIMITS = ["idleTimeoutHours", "maxActiveInstances", "maxRepeatsPerWorkflow", "maxSteps"]


def load_template():
    with open(TEMPLATE) as f:
        return json.load(f)


def build(template=None, names=NAMES, supported=ALL_LIMITS, required=REQUIRED_LIMITS):
    warnings = []
    result = inst.build_orchestration_definition(
        template if template is not None else load_template(), names, supported,
        required_limit_fields=required, warn=warnings.append)
    return result, warnings


class BuildOrchestrationDefinitionTest(unittest.TestCase):
    def test_resolves_workflow_names_to_ids(self):
        d, warnings = build()
        self.assertEqual(d["name"], "Nightly Test Failures to Fix")
        self.assertEqual(d["allowedWorkflows"], [
            {"id": "wf-triage", "name": "Test Failure Triage"},
            {"id": "wf-fix", "name": "Test Failure Fix"}])
        self.assertEqual([t["firstWorkflowId"] for t in d["entryTriggers"]], ["wf-triage", "wf-triage"])
        self.assertTrue(all("firstWorkflow" not in t for t in d["entryTriggers"]))
        self.assertEqual(d["gates"], [{"name": "approve-auto-fix",
                                       "description": "Approve before an AI fix attempt is started",
                                       "workflowIds": ["wf-fix"]}])
        self.assertEqual(warnings, [])

    def test_entry_triggers_match_spec(self):
        d, _ = build()
        labeled, manual = d["entryTriggers"]
        self.assertEqual(labeled["event"], "issue_labeled")
        self.assertEqual(labeled["conditions"], {"combinator": "and", "rules": [
            {"field": "context.trigger.label", "operator": "equals", "value": "nightly-test-failure"}]})
        self.assertEqual(manual["event"], "manual")
        self.assertEqual(manual["slashCommand"], {"command": "fix-nightly", "requireMention": False})

    def test_limits_and_auto_approve_match_spec(self):
        d, _ = build()
        self.assertEqual(d["limits"], {"maxParallelSteps": 1, "maxRepeatsPerWorkflow": 2, "maxSteps": 10,
                                       "idleTimeoutHours": 24, "maxIdleHours": 168,
                                       "maxActiveInstances": 25})
        self.assertEqual(d["autoApprove"], {"minConfidence": 0.8})
        self.assertTrue(d["goal"])
        self.assertIn("## Nightly triage: fixable", d["instructions"])

    def test_unknown_workflow_name_raises(self):
        for mutate in (
            lambda t: t["allowedWorkflows"].append({"name": "Nope"}),
            lambda t: t["entryTriggers"][0].__setitem__("firstWorkflow", "Nope"),
            lambda t: t["gates"][0]["workflowIds"].append("Nope"),
        ):
            t = load_template()
            mutate(t)
            with self.assertRaisesRegex(ValueError, "Nope"):
                build(t)

    def test_unsupported_limit_fields_are_dropped_with_warning(self):
        supported = ["idleTimeoutHours", "maxActiveInstances", "maxRepeatsPerWorkflow", "maxSteps"]
        d, warnings = build(supported=supported)
        self.assertEqual(sorted(d["limits"]), sorted(supported))
        self.assertEqual(sorted(warnings), [
            "warning: target does not support limits.maxIdleHours; dropped",
            "warning: target does not support limits.maxParallelSteps; dropped"])

    def test_missing_required_limit_raises(self):
        t = load_template()
        del t["limits"]["maxSteps"]
        with self.assertRaisesRegex(ValueError, "limits.maxSteps"):
            build(t)

    def test_does_not_mutate_template(self):
        t = load_template()
        before = copy.deepcopy(t)
        build(t, supported=REQUIRED_LIMITS)
        self.assertEqual(t, before)


class SubstituteAgentTest(unittest.TestCase):
    def test_replaces_every_placeholder_deeply_without_mutating(self):
        d = {"steps": [{"params": {"agentId": "senior-developer-agent-id",
                                   "agentIds": ["senior-developer-agent-id", "other"]}},
                       {"instruction": "use senior-developer-agent-id here", "n": 3, "x": None}]}
        before = copy.deepcopy(d)
        out = inst.substitute_agent(d, "agent-123")
        self.assertEqual(d, before)
        self.assertEqual(out["steps"][0]["params"], {"agentId": "agent-123", "agentIds": ["agent-123", "other"]})
        self.assertEqual(out["steps"][1], {"instruction": "use agent-123 here", "n": 3, "x": None})

    def test_playbook_definitions_have_no_placeholder_left(self):
        for playbook in inst.PLAYBOOKS:
            name, definition = inst.load_workflow(os.path.join(ROOT, playbook))
            self.assertIn("senior-developer-agent-id", json.dumps(definition), playbook)
            out = inst.substitute_agent(definition, "agent-123")
            self.assertNotIn("senior-developer-agent-id", json.dumps(out), playbook)
            self.assertEqual(out["name"], name)


class FilterDefinitionTest(unittest.TestCase):
    def test_drops_unsupported_top_level_fields_with_warning(self):
        warnings = []
        out = inst.filter_definition({"name": "a", "version": "1.0.0", "steps": []},
                                     ["name", "steps"], warnings.append)
        self.assertEqual(out, {"name": "a", "steps": []})
        self.assertEqual(warnings, ["warning: target does not support definition.version; dropped"])


class FakeServer:
    """Answers installer requests by operationName; records every request."""

    def __init__(self, existing_workflows=(), existing_orchestration=False, params=(),
                 commit_error=None, input_types=None):
        self.requests = []
        self.existing_workflows = set(existing_workflows)
        self.existing_orchestration = existing_orchestration
        self.params = set(params)
        self.commit_error = commit_error
        self.input_types = input_types or {
            "OrchestrationLimitsInput": [("idleTimeoutHours", True), ("maxActiveInstances", True),
                                         ("maxRepeatsPerWorkflow", True), ("maxSteps", True)],
            "WorkflowDefinitionInput": [(n, False) for n in (
                "allowTaskOutcome", "defaultModelKey", "flow", "machineTierKey", "name", "priority",
                "statusUpdateMethod", "steps", "timeoutMs", "triggers")],
        }

    def urlopen(self, req, timeout=None):
        body = json.loads(req.data.decode())
        self.requests.append({"headers": dict(req.header_items()), "body": body})
        data = self.answer(body["operationName"], body.get("variables") or {})
        resp = mock.MagicMock()
        resp.read.return_value = json.dumps(data).encode()
        resp.__enter__.return_value = resp
        return resp

    def answer(self, op, v):
        if op == "IntrospectInputType":
            fields = self.input_types[v["name"]]
            return {"data": {"__type": {"inputFields": [
                {"name": n, "type": {"kind": "NON_NULL" if req else "SCALAR"}} for n, req in fields]}}}
        if op == "LibraryProject":
            return {"data": {"libraryProject": {"id": "lib-1"}}}
        if op == "ContextParameters":
            return {"data": {"contextParameters": [{"key": k} for k in sorted(self.params)]}}
        if op == "CreateContextParameter":
            return {"data": {"createContextParameter": {"id": "cp-" + v["input"]["key"]}}}
        if op == "FindWorkflow":
            name = v["where"]["name"]["equals"]
            found = [{"id": "old-" + name, "name": name}] if name in self.existing_workflows else []
            return {"data": {"workflows": found}}
        if op == "CreateWorkflow":
            return {"data": {"createWorkflow": {"id": "new-" + v["data"]["name"]}}}
        if op == "UpdateWorkflow":
            return {"data": {"updateWorkflow": {"validationErrors": [], "workflow": {"id": v["where"]["id"]}}}}
        if op in ("CommitWorkflow", "CommitOrchestration"):
            if self.commit_error:
                return {"data": None, "errors": [{"message": self.commit_error}]}
            key = "commitWorkflow" if op == "CommitWorkflow" else "commitOrchestration"
            return {"data": {key: {"id": "x"}}}
        if op == "FindOrchestration":
            name = v["where"]["name"]["equals"]
            return {"data": {"orchestrations": [{"id": "orch-old", "name": name}]
                             if self.existing_orchestration else []}}
        if op == "CreateOrchestration":
            return {"data": {"createOrchestration": {"id": "orch-new"}}}
        if op == "UpdateOrchestration":
            return {"data": {"updateOrchestration": {"validationErrors": [], "validationWarnings": [],
                                                     "orchestration": {"id": v["where"]["id"]}}}}
        raise AssertionError("unexpected operation " + op)

    def ops(self):
        return [r["body"]["operationName"] for r in self.requests]

    def vars_of(self, op):
        return [r["body"]["variables"] for r in self.requests if r["body"]["operationName"] == op]


ARGS = ["--api-url", "https://overcut.example/graphql", "--workspace-id", "ws-1", "--agent-id", "agent-123"]


def run_main(argv, server=None, token=TOKEN):
    out, err = io.StringIO(), io.StringIO()
    env = {"OVERCUT_API_TOKEN": token} if token is not None else {}
    opener = server.urlopen if server else mock.Mock(side_effect=AssertionError("HTTP call in dry-run"))
    with mock.patch.dict(os.environ, env, clear=False), \
            mock.patch.object(inst.urllib.request, "urlopen", opener) as patched, \
            redirect_stdout(out), redirect_stderr(err):
        if token is None:
            os.environ.pop("OVERCUT_API_TOKEN", None)
        code = inst.main(argv)
    return code, out.getvalue(), err.getvalue(), patched


class DryRunTest(unittest.TestCase):
    def test_dry_run_prints_operations_and_makes_no_http_calls(self):
        code, out, err, opener = run_main(ARGS + ["--dry-run"])
        self.assertEqual(code, 0, err)
        opener.assert_not_called()
        printed = re.findall(r"^\[dry-run\] (\w+)", out, re.M)
        self.assertEqual(printed, [
            "LibraryProject", "ContextParameters", "ContextParameters",
            "CreateContextParameter", "CreateContextParameter",
            "FindWorkflow", "CreateWorkflow", "CommitWorkflow",
            "FindWorkflow", "CreateWorkflow", "CommitWorkflow",
            "FindWorkflow", "CreateWorkflow", "CommitWorkflow",
            "FindOrchestration", "CreateOrchestration", "CommitOrchestration"])
        self.assertIn("assuming", out + err)
        self.assertNotIn(TOKEN, out + err)
        self.assertNotIn("senior-developer-agent-id", out)
        self.assertIn("agent-123", out)

    def test_dry_run_needs_no_token(self):
        code, out, err, opener = run_main(ARGS + ["--dry-run"], token=None)
        self.assertEqual(code, 0, err)
        opener.assert_not_called()


class LiveFlowTest(unittest.TestCase):
    def test_creates_everything_on_empty_library(self):
        server = FakeServer()
        code, out, err, _ = run_main(ARGS, server)
        self.assertEqual(code, 0, err)
        self.assertNotIn(TOKEN, out + err)
        for r in server.requests:
            self.assertEqual(r["headers"].get("Authorization"), "Bearer " + TOKEN)
        self.assertEqual(server.ops()[:2], ["IntrospectInputType", "IntrospectInputType"])
        created = [v["input"] for v in server.vars_of("CreateContextParameter")]
        self.assertEqual([c["key"] for c in created], ["nightly_setup_command", "nightly_test_command"])
        for c in created:
            self.assertIsNone(c["projectId"])
            self.assertEqual(c["defaultValue"], "")
            self.assertTrue(c["description"])
        self.assertEqual([v["where"]["projectId"] for v in server.vars_of("ContextParameters")], [None, "lib-1"])
        wf = server.vars_of("CreateWorkflow")
        self.assertEqual([w["data"]["name"] for w in wf],
                         ["Nightly Test Run", "Test Failure Triage", "Test Failure Fix"])
        for w in wf:
            self.assertEqual(w["data"]["project"], {"connect": {"id": "lib-1"}})
            self.assertNotIn("version", w["data"]["definition"])
            self.assertNotIn("senior-developer-agent-id", json.dumps(w))
        self.assertIn("warning: target does not support definition.version; dropped", err)
        self.assertEqual([v["data"]["workflowId"] for v in server.vars_of("CommitWorkflow")],
                         ["new-Nightly Test Run", "new-Test Failure Triage", "new-Test Failure Fix"])
        orch = server.vars_of("CreateOrchestration")[0]["data"]
        self.assertEqual(orch["project"], {"connect": {"id": "lib-1"}})
        self.assertEqual(orch["definition"]["allowedWorkflows"], [
            {"id": "new-Test Failure Triage", "name": "Test Failure Triage"},
            {"id": "new-Test Failure Fix", "name": "Test Failure Fix"}])
        self.assertNotIn("maxParallelSteps", orch["definition"]["limits"])
        self.assertIn("warning: target does not support limits.maxParallelSteps; dropped", err)
        self.assertEqual(server.vars_of("CommitOrchestration")[0]["data"]["orchestrationId"], "orch-new")

    def test_updates_existing_and_skips_known_params_and_tolerates_no_changes(self):
        server = FakeServer(existing_workflows=["Test Failure Triage", "Test Failure Fix", "Nightly Test Run"],
                            existing_orchestration=True,
                            params=["nightly_setup_command", "nightly_test_command"],
                            commit_error="No changes to commit")
        code, out, err, _ = run_main(ARGS, server)
        self.assertEqual(code, 0, err)
        ops = server.ops()
        self.assertNotIn("CreateWorkflow", ops)
        self.assertNotIn("CreateOrchestration", ops)
        self.assertNotIn("CreateContextParameter", ops)
        self.assertEqual([v["where"]["id"] for v in server.vars_of("UpdateWorkflow")],
                         ["old-Nightly Test Run", "old-Test Failure Triage", "old-Test Failure Fix"])
        self.assertEqual(server.vars_of("UpdateOrchestration")[0]["where"], {"id": "orch-old"})
        self.assertEqual(ops.count("CommitWorkflow"), 3)
        self.assertIn("No changes to commit", out)

    def test_graphql_error_names_operation(self):
        server = FakeServer(commit_error="boom happened")
        code, out, err, _ = run_main(ARGS, server)
        self.assertNotEqual(code, 0)
        self.assertIn("CommitWorkflow", err)
        self.assertIn("boom happened", err)
        self.assertNotIn(TOKEN, out + err)

    def test_missing_token_fails_without_http(self):
        code, out, err, opener = run_main(ARGS, token=None)
        self.assertNotEqual(code, 0)
        self.assertIn("OVERCUT_API_TOKEN", err)
        opener.assert_not_called()


# ---------- schema validation against local Overcut (skipped when unreachable) ----------

INTROSPECTION = """{ __schema { queryType { name } mutationType { name }
  types { kind name
    fields { name args { name type { ...T } } type { ...T } }
    inputFields { name type { ...T } }
    enumValues { name } } } }
fragment T on __Type { kind name ofType { kind name ofType { kind name ofType { kind name ofType { kind name } } } } }"""


def fetch_local_schema():
    req = urllib.request.Request(LOCAL_GRAPHQL, data=json.dumps({"query": INTROSPECTION}).encode(),
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read())["data"]["__schema"]
    except (urllib.error.URLError, OSError, KeyError, ValueError, TypeError):
        return None


def type_str(t):
    if t["kind"] == "NON_NULL":
        return type_str(t["ofType"]) + "!"
    if t["kind"] == "LIST":
        return "[" + type_str(t["ofType"]) + "]"
    return t["name"]


def named(t):
    while t["kind"] in ("NON_NULL", "LIST"):
        t = t["ofType"]
    return t


TOKEN_RE = re.compile(r"\s*(\.\.\.|[A-Za-z_][A-Za-z0-9_]*|\$[A-Za-z_][A-Za-z0-9_]*|[{}():!\[\],=])")


def tokenize(doc):
    tokens, pos = [], 0
    doc = doc.strip()
    while pos < len(doc):
        m = TOKEN_RE.match(doc, pos)
        if not m:
            raise ValueError("cannot tokenize at: " + doc[pos:pos + 20])
        tokens.append(m.group(1))
        pos = m.end()
        while pos < len(doc) and doc[pos] in " \t\r\n,":
            pos += 1
    return [t for t in tokens if t != ","]


class Parser:
    """Minimal parser for the installer's documents: one operation, variables, fields, args bound to vars."""

    def __init__(self, doc):
        self.t = tokenize(doc)
        self.i = 0

    def peek(self):
        return self.t[self.i] if self.i < len(self.t) else None

    def take(self, expected=None):
        tok = self.t[self.i]
        if expected and tok != expected:
            raise ValueError("expected %s got %s" % (expected, tok))
        self.i += 1
        return tok

    def parse_type(self):
        if self.peek() == "[":
            self.take("[")
            inner = self.parse_type()
            self.take("]")
            s = "[" + inner + "]"
        else:
            s = self.take()
        if self.peek() == "!":
            self.take("!")
            s += "!"
        return s

    def operation(self):
        kind = self.take()
        name = self.take()
        variables = {}
        if self.peek() == "(":
            self.take("(")
            while self.peek() != ")":
                var = self.take()[1:]
                self.take(":")
                variables[var] = self.parse_type()
            self.take(")")
        selection = self.selection()
        if self.peek() is not None:
            raise ValueError("trailing tokens")
        return kind, name, variables, selection

    def selection(self):
        self.take("{")
        fields = []
        while self.peek() != "}":
            fname = self.take()
            args = {}
            if self.peek() == "(":
                self.take("(")
                while self.peek() != ")":
                    aname = self.take()
                    self.take(":")
                    val = self.take()
                    if not val.startswith("$"):
                        raise ValueError("only variable arguments are supported: %s" % aname)
                    args[aname] = val[1:]
                self.take(")")
            sub = self.selection() if self.peek() == "{" else None
            fields.append((fname, args, sub))
        self.take("}")
        return fields


def compatible(var_type, arg_type):
    if var_type == arg_type:
        return True
    return var_type.endswith("!") and var_type[:-1] == arg_type


class SchemaValidator:
    def __init__(self, schema):
        self.schema = schema
        self.types = {t["name"]: t for t in schema["types"]}

    def validate_document(self, doc):
        errors = []
        kind, name, variables, selection = Parser(doc).operation()
        for var, vt in variables.items():
            base = vt.replace("[", "").replace("]", "").replace("!", "")
            if base not in self.types:
                errors.append("%s: unknown variable type %s" % (name, vt))
        root = self.schema["queryType" if kind == "query" else "mutationType"]["name"]
        for fname, args, sub in selection:
            if fname == "__type":
                continue  # meta field, validated separately
            self.check_field(name, self.types[root], fname, args, sub, variables, errors)
        return errors

    def check_field(self, op, parent, fname, args, sub, variables, errors):
        fields = {f["name"]: f for f in parent.get("fields") or []}
        if fname not in fields:
            errors.append("%s: %s has no field %s" % (op, parent["name"], fname))
            return
        f = fields[fname]
        fargs = {a["name"]: a for a in f["args"]}
        for aname, var in args.items():
            if aname not in fargs:
                errors.append("%s: %s.%s has no arg %s" % (op, parent["name"], fname, aname))
            elif var not in variables:
                errors.append("%s: undeclared variable $%s" % (op, var))
            elif not compatible(variables[var], type_str(fargs[aname]["type"])):
                errors.append("%s: $%s is %s but %s(%s:) wants %s" % (
                    op, var, variables[var], fname, aname, type_str(fargs[aname]["type"])))
        for a in f["args"]:
            if a["type"]["kind"] == "NON_NULL" and a["name"] not in args:
                errors.append("%s: missing required arg %s.%s" % (op, fname, a["name"]))
        target = self.types[named(f["type"])["name"]]
        if sub:
            for sname, sargs, ssub in sub:
                self.check_field(op, target, sname, sargs, ssub, variables, errors)
        elif target["kind"] in ("OBJECT", "INTERFACE", "UNION"):
            errors.append("%s: %s needs a selection" % (op, fname))

    def validate_value(self, path, value, type_ref, errors):
        if value is None:
            if type_ref["kind"] == "NON_NULL":
                errors.append("%s: null for non-null %s" % (path, type_str(type_ref)))
            return
        if type_ref["kind"] == "NON_NULL":
            return self.validate_value(path, value, type_ref["ofType"], errors)
        if type_ref["kind"] == "LIST":
            if not isinstance(value, list):
                value = [value]
            for i, v in enumerate(value):
                self.validate_value("%s[%d]" % (path, i), v, type_ref["ofType"], errors)
            return
        t = self.types[type_ref["name"]]
        if t["kind"] == "ENUM":
            if value not in [e["name"] for e in t["enumValues"]]:
                errors.append("%s: %r not in enum %s" % (path, value, t["name"]))
        elif t["kind"] == "INPUT_OBJECT":
            if not isinstance(value, dict):
                errors.append("%s: expected object %s" % (path, t["name"]))
                return
            fields = {f["name"]: f for f in t["inputFields"]}
            for k, v in value.items():
                if k not in fields:
                    errors.append("%s.%s: not a field of %s" % (path, k, t["name"]))
                else:
                    self.validate_value(path + "." + k, v, fields[k]["type"], errors)
            for k, f in fields.items():
                if f["type"]["kind"] == "NON_NULL" and k not in value:
                    errors.append("%s.%s: required field of %s missing" % (path, k, t["name"]))

    def validate_variables(self, doc, variables_value):
        errors = []
        _, name, variables, _ = Parser(doc).operation()
        for var, vt in variables.items():
            self.validate_value("%s.$%s" % (name, var), variables_value.get(var),
                                self.parse_type_ref(vt), errors)
        for var in variables_value:
            if var not in variables:
                errors.append("%s: variable $%s sent but not declared" % (name, var))
        return errors

    def parse_type_ref(self, s):
        if s.endswith("!"):
            return {"kind": "NON_NULL", "ofType": self.parse_type_ref(s[:-1])}
        if s.startswith("["):
            return {"kind": "LIST", "ofType": self.parse_type_ref(s[1:-1])}
        return {"kind": self.types[s]["kind"], "name": s}

    def input_fields(self, name):
        return [(f["name"], f["type"]["kind"] == "NON_NULL") for f in self.types[name]["inputFields"]]


LOCAL_SCHEMA = fetch_local_schema()


@unittest.skipIf(LOCAL_SCHEMA is None, "local Overcut GraphQL at %s is unreachable" % LOCAL_GRAPHQL)
class LocalSchemaValidationTest(unittest.TestCase):
    def setUp(self):
        self.v = SchemaValidator(LOCAL_SCHEMA)

    def test_every_document_validates(self):
        self.assertTrue(inst.DOCUMENTS)
        errors = []
        for op, doc in inst.DOCUMENTS.items():
            self.assertRegex(doc.strip(), r"^(query|mutation) %s\b" % op)
            errors += self.v.validate_document(doc)
        self.assertEqual(errors, [])

    def test_variables_sent_in_a_full_run_validate(self):
        # Mocked transport, but introspection answers come from the real local schema.
        server = FakeServer(input_types={
            "OrchestrationLimitsInput": self.v.input_fields("OrchestrationLimitsInput"),
            "WorkflowDefinitionInput": self.v.input_fields("WorkflowDefinitionInput")})
        code, out, err, _ = run_main(ARGS, server)
        self.assertEqual(code, 0, err)
        errors = []
        for r in server.requests:
            body = r["body"]
            if body["operationName"] == "IntrospectInputType":
                continue
            errors += self.v.validate_variables(inst.DOCUMENTS[body["operationName"]], body["variables"])
        self.assertEqual(errors, [])


if __name__ == "__main__":
    unittest.main()
