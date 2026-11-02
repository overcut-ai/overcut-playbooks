#!/usr/bin/env python3
"""
Install the nightly test-failure playbooks and their orchestration into an
Overcut workspace Library, so they appear under Library -> Workflow templates
and Library -> Orchestration templates.

What it writes (upsert by exact name in the workspace's library project, then commit):
  - the workflows of internal/nightly-test-run/, internal/test-failure-triage/ and
    internal/test-failure-fix/
    (workflow.definition from each workflow.json, with the agent placeholder
    "senior-developer-agent-id" replaced by --agent-id)
  - the orchestration in orchestrations/nightly-test-failures-to-fix/orchestration.json
    (workflow names resolved to the library workflow ids)
  - the workspace-level context parameters nightly_setup_command and
    nightly_test_command (empty default), only when no definition with that key exists

Usage:
    OVERCUT_API_TOKEN=... python3 scripts/install-library-templates.py \\
        --api-url URL --workspace-id ID --agent-id ID [--dry-run]

--dry-run prints each operation and its variables (strings over 120 characters
are shortened) and makes no HTTP calls at all; it assumes the input types of
Overcut `next` instead of introspecting the target. The token is never printed.

The target's OrchestrationLimitsInput and WorkflowDefinitionInput are
introspected so that fields an older server does not define are dropped, each
with a warning on stderr. A required limit missing from the template is an error.
Standard library only.
"""

import argparse
import copy
import json
import os
import sys
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Under internal/: hidden from the customer catalog until released (moved to the repo root).
PLAYBOOKS = ["internal/nightly-test-run", "internal/test-failure-triage", "internal/test-failure-fix"]
ORCHESTRATION_TEMPLATE = os.path.join(ROOT, "orchestrations", "nightly-test-failures-to-fix", "orchestration.json")
AGENT_PLACEHOLDER = "senior-developer-agent-id"
TOKEN_ENV = "OVERCUT_API_TOKEN"
COMMIT_MESSAGE = "Installed from overcut-playbooks"
NO_CHANGES = "No changes to commit"
CONTEXT_PARAMETERS = [
    ("nightly_setup_command",
     "Nightly test workflows: shell command(s) that install and start what the tests need."),
    ("nightly_test_command",
     "Nightly test workflows: shell command that runs the whole suite and writes JUnit XML into $NIGHTLY_JUNIT_DIR."),
]

# Input fields of Overcut `next` (packages/cli/src/graphql/generated.ts at 955fad946),
# used by --dry-run instead of introspection. Values: True = required.
ASSUMED_INPUT_TYPES = {
    "OrchestrationLimitsInput": {
        "idleTimeoutHours": True, "maxActiveInstances": True, "maxIdleHours": False,
        "maxParallelSteps": False, "maxRepeatsPerWorkflow": True, "maxSteps": True,
    },
    "WorkflowDefinitionInput": {
        name: False for name in ("allowTaskOutcome", "defaultModelKey", "flow", "machineTierKey", "name",
                                 "priority", "statusUpdateMethod", "steps", "timeoutMs", "triggers")
    },
}

DOCUMENTS = {
    "IntrospectInputType": """
query IntrospectInputType($name: String!) { __type(name: $name) { inputFields { name type { kind } } } }""",
    "LibraryProject": """
query LibraryProject($workspaceId: String) { libraryProject(workspaceId: $workspaceId) { id } }""",
    "ContextParameters": """
query ContextParameters($where: ContextParameterWhereInput) { contextParameters(where: $where) { key } }""",
    "CreateContextParameter": """
mutation CreateContextParameter($input: CreateContextParameterInput!) {
  createContextParameter(input: $input) { id } }""",
    "FindWorkflow": """
query FindWorkflow($where: WorkflowWhereInput, $take: Int) { workflows(where: $where, take: $take) { id name } }""",
    "CreateWorkflow": """
mutation CreateWorkflow($data: WorkflowCreateInput!) { createWorkflow(data: $data) { id } }""",
    "UpdateWorkflow": """
mutation UpdateWorkflow($where: WhereUniqueInput!, $data: WorkflowUpdateInput!) {
  updateWorkflow(where: $where, data: $data) { validationErrors workflow { id } } }""",
    "CommitWorkflow": """
mutation CommitWorkflow($data: CommitWorkflowInput!) { commitWorkflow(data: $data) { id } }""",
    "FindOrchestration": """
query FindOrchestration($where: OrchestrationWhereInput, $take: Int) {
  orchestrations(where: $where, take: $take) { id name } }""",
    "CreateOrchestration": """
mutation CreateOrchestration($data: OrchestrationCreateInput!) { createOrchestration(data: $data) { id } }""",
    "UpdateOrchestration": """
mutation UpdateOrchestration($where: WhereUniqueInput!, $data: OrchestrationUpdateInput!) {
  updateOrchestration(where: $where, data: $data) { validationErrors validationWarnings orchestration { id } } }""",
    "CommitOrchestration": """
mutation CommitOrchestration($data: CommitOrchestrationInput!) { commitOrchestration(data: $data) { id } }""",
}


def warn_stderr(message):
    print(message, file=sys.stderr)


# ---------- pure functions ----------

def substitute_agent(definition, agent_id):
    """Deep copy of definition with every occurrence of the agent placeholder in strings replaced."""
    def walk(value):
        if isinstance(value, dict):
            return {k: walk(v) for k, v in value.items()}
        if isinstance(value, list):
            return [walk(v) for v in value]
        if isinstance(value, str):
            return value.replace(AGENT_PLACEHOLDER, agent_id)
        return value
    return walk(definition)


def filter_definition(definition, supported_fields, warn=warn_stderr):
    """Drop top-level definition fields the target's WorkflowDefinitionInput does not define."""
    supported = set(supported_fields)
    out = {}
    for key, value in definition.items():
        if key in supported:
            out[key] = value
        else:
            warn("warning: target does not support definition.%s; dropped" % key)
    return out


def build_orchestration_definition(template, name_to_id, supported_limit_fields,
                                   required_limit_fields=(), warn=warn_stderr):
    """OrchestrationDefinitionInput from the template: workflow names -> ids, limits fitted to the target."""
    def resolve(name, where):
        if name not in name_to_id:
            raise ValueError("unknown workflow %r in %s" % (name, where))
        return name_to_id[name]

    t = copy.deepcopy(template)
    allowed = [{"id": resolve(w["name"], "allowedWorkflows"), "name": w["name"]} for w in t["allowedWorkflows"]]
    triggers = []
    for trigger in t["entryTriggers"]:
        first = trigger.pop("firstWorkflow")
        trigger["firstWorkflowId"] = resolve(first, "entryTriggers.firstWorkflow")
        triggers.append(trigger)
    gates = []
    for gate in t["gates"]:
        if "workflowIds" in gate:
            gate["workflowIds"] = [resolve(n, "gates.%s.workflowIds" % gate["name"]) for n in gate["workflowIds"]]
        gates.append(gate)

    supported = set(supported_limit_fields)
    for field in required_limit_fields:
        if field not in t["limits"]:
            raise ValueError("template is missing required limits.%s" % field)
    limits = {}
    for field, value in t["limits"].items():
        if field in supported:
            limits[field] = value
        else:
            warn("warning: target does not support limits.%s; dropped" % field)

    out = {"name": t["name"], "goal": t["goal"], "allowedWorkflows": allowed, "entryTriggers": triggers,
           "gates": gates, "limits": limits, "autoApprove": t["autoApprove"]}
    for optional in ("instructions", "defaultModelKey"):
        if optional in t:
            out[optional] = t[optional]
    return out


def load_workflow(playbook_dir):
    """(name, definition) from <playbook>/workflow.json; definition.name is set to workflow.name."""
    with open(os.path.join(playbook_dir, "workflow.json")) as f:
        workflow = json.load(f)["workflow"]
    definition = copy.deepcopy(workflow["definition"])
    definition["name"] = workflow["name"]
    return workflow["name"], definition


def shorten(value, limit=120):
    if isinstance(value, dict):
        return {k: shorten(v, limit) for k, v in value.items()}
    if isinstance(value, list):
        return [shorten(v, limit) for v in value]
    if isinstance(value, str) and len(value) > limit:
        return value[:60] + "...(+%d chars)" % (len(value) - 60)
    return value


# ---------- GraphQL client ----------

class GraphQLError(RuntimeError):
    pass


class Client:
    def __init__(self, api_url, token, dry_run, out=None):
        self.api_url = api_url
        self.token = token
        self.dry_run = dry_run
        self.out = out or sys.stdout

    def execute(self, op, variables, dry_result=None):
        """Run DOCUMENTS[op]; in dry-run print it and return dry_result without any HTTP call."""
        if self.dry_run:
            print("[dry-run] %s %s" % (op, json.dumps(shorten(variables), ensure_ascii=False)), file=self.out)
            return dry_result
        payload = json.dumps({"operationName": op, "query": DOCUMENTS[op], "variables": variables}).encode()
        req = urllib.request.Request(self.api_url, data=payload, method="POST", headers={
            "Content-Type": "application/json", "Authorization": "Bearer " + self.token})
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                body = resp.read()
        except urllib.error.HTTPError as e:
            body = e.read()
            if not body:
                raise GraphQLError("%s: HTTP %s" % (op, e.code))
        except urllib.error.URLError as e:
            raise GraphQLError("%s: cannot reach %s (%s)" % (op, self.api_url, e.reason))
        try:
            result = json.loads(body)
        except ValueError:
            raise GraphQLError("%s: response is not JSON" % op)
        if result.get("errors"):
            raise GraphQLError("%s: %s" % (op, "; ".join(str(e.get("message")) for e in result["errors"])))
        if not result.get("data"):
            raise GraphQLError("%s: response has no data" % op)
        return result["data"]


# ---------- install flow ----------

class Installer:
    def __init__(self, client, workspace_id, agent_id, out=None, warn=warn_stderr):
        self.c = client
        self.workspace_id = workspace_id
        self.agent_id = agent_id
        self.out = out or sys.stdout
        self.warn = warn

    def say(self, message):
        print(message, file=self.out)

    def input_fields(self, type_name):
        """{field: required} of an input type on the target (assumed `next` types in dry-run)."""
        if self.c.dry_run:
            return ASSUMED_INPUT_TYPES[type_name]
        data = self.c.execute("IntrospectInputType", {"name": type_name})
        if not data.get("__type"):
            raise GraphQLError("IntrospectInputType: target has no type %s" % type_name)
        return {f["name"]: f["type"]["kind"] == "NON_NULL" for f in data["__type"]["inputFields"]}

    def find_one(self, op, root, project_id, name):
        data = self.c.execute(op, {"where": {"projectId": {"equals": project_id}, "name": {"equals": name}},
                                   "take": 2}, dry_result={root: []})
        found = data[root]
        if len(found) > 1:
            raise GraphQLError("%s: more than one %r in the library project" % (op, name))
        return found[0]["id"] if found else None

    def commit(self, op, id_field, entity_id, label):
        root = op[0].lower() + op[1:]
        try:
            self.c.execute(op, {"data": {id_field: entity_id, "message": COMMIT_MESSAGE}},
                           dry_result={root: {"id": entity_id}})
            self.say("committed %s" % label)
        except GraphQLError as e:
            if NO_CHANGES not in str(e):
                raise
            self.say("%s: %s (%s is up to date)" % (op, NO_CHANGES, label))

    def ensure_context_parameters(self, project_id):
        visible = set()
        for scope in (None, project_id):
            data = self.c.execute("ContextParameters", {"where": {"projectId": scope}},
                                  dry_result={"contextParameters": []})
            visible.update(p["key"] for p in data["contextParameters"])
        for key, description in CONTEXT_PARAMETERS:
            if key in visible:
                self.say("context parameter %s exists; skipped" % key)
                continue
            self.c.execute("CreateContextParameter", {"input": {
                "key": key, "defaultValue": "", "description": description, "projectId": None}},
                dry_result={"createContextParameter": {"id": "<new %s id>" % key}})
            self.say("created context parameter %s" % key)

    def upsert_workflow(self, project_id, name, definition):
        existing = self.find_one("FindWorkflow", "workflows", project_id, name)
        if existing:
            data = self.c.execute("UpdateWorkflow", {"where": {"id": existing}, "data": {"definition": definition}})
            errors = data["updateWorkflow"]["validationErrors"]
            if errors:
                raise GraphQLError("UpdateWorkflow: %s: %s" % (name, "; ".join(errors)))
            workflow_id = existing
            self.say("updated workflow %s (%s)" % (name, workflow_id))
        else:
            data = self.c.execute("CreateWorkflow", {"data": {
                "name": name, "definition": definition, "project": {"connect": {"id": project_id}}}},
                dry_result={"createWorkflow": {"id": "<new %s id>" % name}})
            workflow_id = data["createWorkflow"]["id"]
            self.say("created workflow %s (%s)" % (name, workflow_id))
        self.commit("CommitWorkflow", "workflowId", workflow_id, "workflow " + name)
        return workflow_id

    def upsert_orchestration(self, project_id, definition):
        name = definition["name"]
        existing = self.find_one("FindOrchestration", "orchestrations", project_id, name)
        if existing:
            data = self.c.execute("UpdateOrchestration", {"where": {"id": existing},
                                                          "data": {"definition": definition}})
            result = data["updateOrchestration"]
            for w in result.get("validationWarnings") or []:
                self.warn("warning: UpdateOrchestration: %s" % w)
            if result["validationErrors"]:
                raise GraphQLError("UpdateOrchestration: %s: %s" % (name, "; ".join(result["validationErrors"])))
            orchestration_id = existing
            self.say("updated orchestration %s (%s)" % (name, orchestration_id))
        else:
            data = self.c.execute("CreateOrchestration", {"data": {
                "name": name, "definition": definition, "project": {"connect": {"id": project_id}}}},
                dry_result={"createOrchestration": {"id": "<new %s id>" % name}})
            orchestration_id = data["createOrchestration"]["id"]
            self.say("created orchestration %s (%s)" % (name, orchestration_id))
        self.commit("CommitOrchestration", "orchestrationId", orchestration_id, "orchestration " + name)
        return orchestration_id

    def run(self):
        if self.c.dry_run:
            self.say("dry-run: no HTTP calls; assuming the input types of Overcut `next` instead of introspecting")
        limit_fields = self.input_fields("OrchestrationLimitsInput")
        definition_fields = self.input_fields("WorkflowDefinitionInput")

        data = self.c.execute("LibraryProject", {"workspaceId": self.workspace_id},
                              dry_result={"libraryProject": {"id": "<library-project-id>"}})
        project_id = data["libraryProject"]["id"]
        self.say("library project %s" % project_id)

        self.ensure_context_parameters(project_id)

        name_to_id = {}
        for playbook in PLAYBOOKS:
            name, definition = load_workflow(os.path.join(ROOT, playbook))
            definition = filter_definition(substitute_agent(definition, self.agent_id), definition_fields, self.warn)
            name_to_id[name] = self.upsert_workflow(project_id, name, definition)

        with open(ORCHESTRATION_TEMPLATE) as f:
            template = json.load(f)
        definition = build_orchestration_definition(
            template, name_to_id, limit_fields,
            required_limit_fields=[k for k, required in limit_fields.items() if required], warn=self.warn)
        self.upsert_orchestration(project_id, definition)
        self.say("done")


def main(argv=None):
    parser = argparse.ArgumentParser(description="Install the nightly test-failure templates into an Overcut Library.")
    parser.add_argument("--api-url", required=True, help="Overcut GraphQL endpoint, e.g. http://localhost:3000/graphql")
    parser.add_argument("--workspace-id", required=True)
    parser.add_argument("--agent-id", required=True, help="agent id that replaces %s" % AGENT_PLACEHOLDER)
    parser.add_argument("--dry-run", action="store_true", help="print the operations; make no HTTP calls")
    args = parser.parse_args(argv)

    token = os.environ.get(TOKEN_ENV, "")
    if not token and not args.dry_run:
        print("error: set %s to an Overcut API token" % TOKEN_ENV, file=sys.stderr)
        return 2
    client = Client(args.api_url, token, args.dry_run)
    try:
        Installer(client, args.workspace_id, args.agent_id).run()
    except (GraphQLError, ValueError, KeyError, OSError) as e:
        print("error: %s" % e, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
