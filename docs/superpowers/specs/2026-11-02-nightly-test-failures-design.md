# Nightly Test Failures: customer playbooks and orchestration template

Status: design, awaiting approval · Author: Eyal Golan · 2026-11-02
All code references verified against `overcut-ai/overcut` `next` at `955fad946`
(2026-11-01) unless marked "doc only".

## Intent

Overcut customers should be able to pick, from the product, a ready-made loop that runs
their test suite every night, explains what broke, and (if they want) proposes fixes as
draft PRs. Internally we already run this loop for Overcut's own E2E suite
(`overcut-ai/overcut-e2e-tests`, branch `feat/e2e-triage-fix-loop`), proven live on local
Overcut: green night, red night -> issue, fix -> verified draft PR, dedupe, scheduled run.
That version is tied to our harness (`src/sandbox/*`, quarantine, canary) and chains its
workflows with custom events, not an orchestration. The orchestration path below has never
run live; treat it as new.

Success: a customer installs it from the UI, sets one optional setting or none, and the
next morning has either nothing (green), or one issue per root cause and, where allowed,
draft fix PRs that provably did not weaken their tests.

## Where it ships (decided by Eyal)

1. **Playbook catalog** (UI "Playbook catalog", source: public repo
   `overcut-ai/overcut-playbooks`, loaded by `playbooks.service.ts` `fetchRemotePlaybooks`):
   the three workflows, one top-level folder each. The loader reads top-level folders with a
   `workflow.json` and skips the rest with a warning.
2. **Orchestration library** (UI: Library -> "Orchestration templates",
   `WorkspaceSidebar.tsx`): the orchestration, plus the three workflows as Library ->
   "Workflow templates". An orchestration's workflows must exist in its own project
   (`orchestration.service.ts` validation: "does not exist in this project"), so in the
   library they must be library workflow templates. Customers install with "Install from
   Library", mapping each workflow to a project copy (`installLibraryOrchestration`).

The library is per workspace and starts empty (`LibraryScopeService.getOrCreateLibrary`).
There is no file import for orchestrations (resolver has `exportOrchestration` and
`installLibraryOrchestration` only), so an installer writes templates into a library via
the API (library project id from the `libraryProject(workspaceId)` query, then create +
commit). Target for now: our local dev workspace. Azure later. Reaching other workspaces'
libraries is out of scope (Open questions).

## Goals

- Works on any repo without per-repo code: layered setup (below).
- Human-gated fixes by default; auto-fix is one switch the customer flips.
- No fix PR can delete, skip, or weaken tests: deterministic check, not a prompt.
- Bounded: at most 3 open fix PRs per repo, one retry per root cause, draft PRs only.

## Non-goals

- Jira/Linear/other trackers. GitHub Issues only for now (decided by Eyal).
- Docker / docker-compose in the agent pod: no container runtime there
  (`docs/self-hosted-e2e-in-agent-pod.md` section 1, doc only). Services run as native processes or
  tests target a URL the customer supplies.
- Changing Overcut platform code. If a platform gap blocks this, stop and raise it.
- Replacing our internal harness loop.

## Anti-goals (failure even if it "works")

- A fix PR that turns red tests green by skipping, deleting, loosening assertions, or
  editing test config.
- Issue spam: a new issue every night for the same failure.
- A setup problem reported as a code bug and "fixed".

## Platform facts this design rests on (verified)

- Orchestration entry events are issue/PR events or `manual` only: "No cron, no
  custom_event" (`libs/util/event-types/src/lib/orchestration-types/schemas.ts` lines 10-16).
  `docs/orchestrations/12-entry-triggers.md` still describes custom-event entry; the code
  does not allow it. So the scheduled Nightly cannot be inside the orchestration.
- Limits schema (same file, lines 151-176): `maxSteps` 1-100, `maxRepeatsPerWorkflow` 1-20,
  `maxActiveInstances` 1-500, `idleTimeoutHours` 1-336, `maxParallelSteps` 1-5,
  `maxIdleHours` 1-720. Gates: `workflowIds` XOR `gateCompletion` (line 140).
- Bot comments on an item with a live instance are not forwarded to it
  (`orchestration-routing.service.ts` line 139). Bot-added labels are not filtered on entry.
- The dispatcher never resolves context parameters, so trigger conditions are literals.
- Context parameters: `{{params.<key>}}` in prompts; `script.run` steps also get
  `OC_PARAM_<KEY>` env vars (`workflow-manager` `dispatcher.service.ts` ~line 2381). Scopes:
  project, repository, workflow, orchestration, agent (Prisma `ContextParameterScope`).
  `importWorkflow` does not check references; `commitWorkflow` does
  (`workflow.service.ts` line 2034). A definition with default `""` resolves; `null` does
  not (`libs/util/context-parameters/src/lib/resolve.ts` lines 203-216).
- Schedules support `PerRepository` context (`WorkflowDefinition.ts` line 124).
- Default agent image is `devcontainers/universal:2-linux` (`image-catalog.ts` line 40);
  passwordless sudo there is doc only, verify live. Per-repo `configuration.agentImage`
  overrides it.

## The pieces

### Settings (context parameters, all optional)

| key | meaning |
|---|---|
| `nightly_setup_command` | shell command(s) that install and start what tests need |
| `nightly_test_command` | shell command that runs the suite |

The installer (or README, for catalog users) creates both as workspace-level definitions
with default `""` before committing, so commit passes and empty means "discover". No
label setting: trigger conditions cannot read parameters, so a configurable label would
silently break entry. The label is fixed: `nightly-test-failure`.

### Layered setup (applies to every workflow that runs tests)

1. Settings set: run them exactly.
2. Unset: the agent discovers commands from AGENTS.md / CLAUDE.md, CI config, package
   manifests, Makefile, README; may install native services. It records the exact commands
   in the issue (hidden marker block, below), so later steps reuse them and the customer
   can pin them as settings.
3. Missing tooling (SDKs, browsers): per-repo `agentImage`, documented in README.
4. Setup failure: one issue labelled `nightly-setup-failure`; never enters the orchestration.

### Workflow 1: Nightly Test Run (`nightly-test-run/`)

Trigger: `scheduled`, `0 3 * * *` (workspace time zone), `PerRepository`; plus manual
`/nightly-tests`. Steps: clone -> setup + run (agent) -> group failures into root causes
(agent) -> file (agent, then a deterministic dedupe script).

Filing, per root cause:
- Each issue body carries a hidden marker with the baseline and the commands used:
  `<!-- nightly-test-failure {"sha":"...","tests":[...],"allFailing":[...],"total":N,"skipped":N,"setup":"...","test":"..."} -->`
  (`tests` = this cause's failing ids; `allFailing`, `total`, `skipped` from the whole
  run, so Fix can tell "already failing that night" from "new failure").
- Dedupe (deterministic): if any failing test of a cause already appears in the marker of
  an open `nightly-test-failure` issue, comment "still failing" there instead of opening a
  new issue. This keeps nightly regrouping drift from creating duplicates.
- Otherwise open `<cause summary>` with tests, error excerpts, commit SHA, and the label.
  The label starts one orchestration instance for that cause. New causes on later nights
  get new issues, hence new instances.
- An open issue whose tests all passed for 3 consecutive nights is closed with a comment
  (from the approved card design: "closes issues that stay green").

### Workflow 2: Test Failure Triage (`test-failure-triage/`)

Input: one issue (one root cause). Re-runs the failing tests once to confirm, classifies
as fixable / flaky / environment / needs-human, and posts one comment: the brief for Fix
(evidence, suspected files, the exact test command for the cause). Flaky / environment /
needs-human: label the issue accordingly and stop.

### Workflow 3: Test Failure Fix (`test-failure-fix/`)

Input: the issue and Triage's brief. Steps: clone -> precheck -> investigate -> implement ->
verify -> open draft PR -> assert head.
- precheck (script): skip if branch `nightly-fix/<issue-number>` exists or 3 `nightly-fix/*`
  branches are open.
- verify (script, deterministic): see "Verify rules" below. Commands come from settings if
  set, else from the issue marker written by Nightly (bot-written; editing it requires repo
  triage/write access, so trusted). The Fix agent never chooses the command that judges it.
  Runs with git hooks off, HEAD pinned, tree checked unchanged after tests, as ours does.
  One self-contained inline Node script, no npm deps (customer repos have no gate code).
- open PR: draft, label `nightly-fix`, links the issue, lists what verify checked.

### Verify rules (port of `src/sandbox/weakening.ts` + `scripts/sandbox/verify-fix.sh`)

Must cover every language (decided by Eyal), so no rule may depend on a language's
syntax. Two language-agnostic layers; both must pass for a PR to claim "verified".

The Fix branch starts from the SHA Nightly tested. Nightly runs with JUnit XML (nearly
every runner can: jest-junit, pytest `--junitxml`, gotestsum, Surefire/Gradle, dotnet
JUnit logger, rspec_junit_formatter, PHPUnit `--log-junit`, cargo-nextest, ...; setup
discovers the flag, installing a reporter in the sandbox only, never committed) and
writes the baseline into the issue marker: SHA, failing test ids, total and skipped
counts. Counts, not full id lists, so the marker fits in an issue body. Triage's re-run
confirms the failing ids.

**Old-code run depends on the language (decided by Eyal).**
- Interpreted: the "fails before" run. Check out the base SHA, overlay only the fix's
  test-file changes, run the cause's tests and the tests the fix added. All must fail.
  A new test that passes on the old code does not catch the bug: reject.
- Compiled: nothing runs on the old code; the fix's new tests may not compile there.
  "Fails before" evidence is Nightly's baseline plus Triage's re-run.
- Classification (deterministic): by file extension of the cause's test files and the
  test source files the fix adds or changes. Non-code files (fixtures, data such as
  `tests/fixtures/data.json`) are ignored for the mode decision unless JUnit names them as
  a test source, and deleted or renamed files never decide it. Compiled table: `.go .rs .java .kt .kts .scala .groovy .cs .fs
  .vb .c .h .cc .cpp .cxx .hpp .m .mm .swift .dart .zig .hs .ml .erl .ex .exs .cr .nim .d`.
  Anything else (`.py .rb .js .mjs .cjs .ts .tsx .jsx .php .pl .lua .r .sh`, ...) is
  interpreted. Any compiled file involved makes the run compiled. An unknown extension
  counts as compiled (the old-code run is skipped rather than risking a false reject).

**Layer A: results on the fix commit (needs JUnit XML).** Full suite, compared with the
baseline:
- the build succeeds (a compile error yields no XML, which fails the check);
- the cause's failing tests now pass; tests the fix added pass;
- no test fails that was not in the baseline's failing set (a newly failing test is
  re-run once, as our runner does, so a flake does not reject a good fix);
- total count is not below the baseline and skipped count not above it (catches tests
  removed or skipped by any means Layer B misses).

**Layer B: diff (always, needs nothing).**
- Test files: a path matching common conventions in any language (`test/`, `tests/`,
  `spec/`, `__tests__/`, `*_test.*`, `test_*.*`, `*Test.*`, `*Tests.*`, `*.spec.*`,
  `*.test.*`), or a file JUnit names as a test source.
- Existing lines in test files may not be changed or removed, and test files may not be
  deleted or renamed. Additions only. A fix that needs to change an existing test (a
  wrong test is the root cause) goes to a human: PR labelled `needs-human-review`.
- Protected files may not change: CI config (`.github/`, `.gitlab-ci.yml`, `Jenkinsfile`,
  `.circleci/`, `azure-pipelines.yml`, ...), test runner config, and dependency
  manifests/lockfiles. A list of filenames, not language rules; a hit means needs-human.
- Diff read hardened as ours (`--no-ext-diff --text`, quoted paths fail closed).

**Without JUnit:** Layer B still applies; Layer A falls back to Triage's per-cause test
command exiting 0 (interpreted runs also require it to exit non-zero on the old code),
and the PR is labelled `needs-human-review` instead of claiming "no new failures".

### Orchestration: Nightly Test Failures to Fix

- goal: the root cause in the issue ends with a verified draft PR, or is labelled flaky /
  environment / needs-human with a reason in the issue.
- entryTriggers: `issue_labeled`, condition `context.trigger.label equals
  "nightly-test-failure"` (set in `github-issue-event.normalizer.ts` line 308),
  firstWorkflowId = Triage; plus `manual` `/fix-nightly`.
- allowedWorkflows: Triage, Fix.
- instructions: after Triage, run Fix only if Triage classified the cause fixable; if Fix's
  verify fails, run Fix once more with the failure as input; otherwise finish.
- gates: `approve-auto-fix` with `workflowIds: [Fix]`, on by default (one approval per Fix
  start, including the retry). Removing it = auto-fix mode.
- limits: `maxParallelSteps: 1` (one cause per instance), `maxRepeatsPerWorkflow: 2`,
  `maxSteps: 10`, `idleTimeoutHours: 24`, `maxIdleHours: 168`.

## Verification before calling it done

On local Overcut, against a throwaway repo with seeded bugs: green night files nothing;
red night with 2 causes opens 2 labelled issues and 2 instances; second red night comments
instead of duplicating; gate pauses and approval resumes; gate removed runs Fix unattended;
a weakening fix is rejected by verify; setup failure files the separate label and starts
nothing. Also prove live: bot-added label fires `issue_labeled` (fallback: `issue_opened`
with a `context.issue.labels` condition); sudo works in the default image.

## Builder's calls

Prompt wording; step split inside each workflow; agent role (reuse catalog roles);
installer packaging; folder names if they collide.

## Calls made by Claude (check these)

- One issue per root cause and one instance per issue (the approved card said "one issue
  per cause"; this also fixes new causes on later nights being missed).
- Dedupe by failing-test overlap with open issue markers.
- Verify reads commands from settings or the bot-written issue marker, never the Fix agent.
- Dropped the label setting (cannot work, see platform facts).
- Fix branches start from the nightly's tested SHA; the baseline is Nightly's recorded
  counts and failing ids, so compiled repos never run old code.
- Compiled vs interpreted by an extension table; unknown counts as compiled.
- Existing test lines are immutable (additions only) instead of per-language assertion
  counting: works for every language and also catches loosened assertions; the cost is
  that a wrong test goes to a human rather than being auto-fixed.

## Open questions

- Getting the templates into customer workspaces' libraries. Not needed for local dev.
