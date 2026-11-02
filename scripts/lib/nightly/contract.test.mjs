// Cross-workflow contract: the issue body the Nightly Test Run files is what Triage's rerun,
// Fix's precheck and Fix's verify read. They must agree on the commit and the commands.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planIssues } from './dedupe.mjs';
import { parseMarker, formatMarker } from './marker.mjs';
import { planOpenIssues } from '../../../nightly-test-run/scripts/plan-issues.mjs';
import { main as rerun } from '../../../test-failure-triage/scripts/rerun.mjs';
import { main as precheck } from '../../../test-failure-fix/scripts/precheck.mjs';
import { verifyCommands } from '../../../test-failure-fix/scripts/verify.mjs';

const SHA = 'd'.repeat(40);
const LABELS = JSON.stringify([{ name: 'nightly-test-failure' }]);
// Commands with characters that a careless marker or body would mangle.
const SETUP = 'npm ci && echo "<ok> --> `done`"';
const TEST = "npx jest --ci --reporters=default --reporters=jest-junit -t 'a\\b'";
const ids = (n) => Array.from({ length: n }, (_, i) => `src/mod_${String(i).padStart(5, '0')}.test.ts::suite > case ${i} with a fairly long name`);

function nightResults(over) {
  return { setup: SETUP, test: TEST, sha: SHA, junit: true, testCode: 1, total: 9000, skipped: 2, failing: [], cases: [], ...over };
}

function workspace() {
  const ws = mkdtempSync(join(tmpdir(), 'contract-'));
  mkdirSync(join(ws, 'repo', '.git'), { recursive: true });
  return ws;
}

// Run rerun and precheck on `body` with fake git/suite; return what each would execute.
async function downstream(body) {
  const ws = workspace();
  try {
    const env = { AGENT_WORKSPACE_PATH: ws, REPO_FULL_NAME: 'o/repo', ISSUE_BODY: body, ISSUE_LABELS: LABELS, ISSUE_NUMBER: '12' };
    const suite = [];
    const rgit = [];
    await rerun(env, {
      runSuite: (a) => { suite.push(a); return { setupCode: 0, testCode: 1, cases: null, log: '' }; },
      git: (args) => { rgit.push(args); return ''; },
      outputJson: () => {},
    });
    const pgit = [];
    const pout = [];
    await precheck(env, {
      git: (args) => { pgit.push(args); return ''; },
      outputJson: (o) => pout.push(o),
    });
    return { suite, rgit, pgit, pout };
  } finally { rmSync(ws, { recursive: true, force: true }); }
}

const SCENARIOS = [
  ['JUnit night, small cause', nightResults({ failing: ['a::x', 'b::y'] }), [{ title: 'A', summary: 's', tests: ['a::x', 'b::y'], causeCommand: 'npx jest a b' }]],
  ['JUnit night, 5000 failing ids (truncated marker)', nightResults({ failing: ids(5000) }), [{ title: 'Big', summary: 's', tests: ids(5000), causeCommand: 'npx jest src' }]],
  ['JUnit night, ungrouped fallback', nightResults({ failing: ['a::x', 'b::y'] }), [{ title: 'A', summary: 's', tests: ['a::x'], causeCommand: 'npx jest a' }]],
  ['no-JUnit night', nightResults({ junit: false, failing: [], total: 0, cases: null }), []],
];

for (const [label, results, causes] of SCENARIOS) {
  test(`contract (${label}): open body -> parseMarker -> rerun/precheck/verify agree`, async () => {
    const { actions } = planIssues({ results, causes, openIssues: [], setupFailed: null });
    const opens = actions.filter((a) => a.type === 'open');
    assert.ok(opens.length > 0);
    for (const open of opens) {
      assert.ok(open.body.length <= 65000);
      assert.deepEqual(open.labels, ['nightly-test-failure']);
      // The body as list-open-issues hands it back the next night (JSON round trip).
      const [listed] = planOpenIssues(JSON.parse(JSON.stringify([{ number: 12, labels: open.labels, body: open.body }])));
      const marker = parseMarker(listed.body);
      assert.ok(marker, 'marker parses');
      assert.equal(marker.sha, SHA);
      assert.equal(marker.junit, results.junit);
      assert.equal(marker.setup, SETUP);
      assert.equal(marker.test, TEST);
      const causeCommand = marker.causeCommand;
      if (results.junit) {
        const c = causes.find((x) => x.title === open.title);
        assert.equal(causeCommand, c ? c.causeCommand : TEST);
      } else {
        assert.equal(causeCommand, TEST);
      }

      const { suite, rgit, pgit, pout } = await downstream(listed.body);
      // Triage reruns exactly what the nightly run ran, at the same commit.
      assert.equal(suite.length, 1);
      assert.equal(suite[0].setup, SETUP);
      assert.equal(suite[0].test, results.junit ? TEST : causeCommand);
      assert.deepEqual(rgit.at(-1), ['checkout', '--detach', SHA]);
      // Fix starts its branch at that commit.
      assert.deepEqual(pgit.at(-1), ['checkout', '-b', 'nightly-fix/12', SHA]);
      assert.deepEqual(pout, [{ branch: 'nightly-fix/12', base: SHA }]);
      // Verify (no settings) judges with the same setup and test command, and the same cause command.
      assert.deepEqual(verifyCommands({}, marker), { setup: SETUP, test: TEST });
      if (!results.junit) assert.equal(marker.causeCommand, suite[0].test);
    }
  });
}

test('contract: a set-marker update keeps the commands and commit downstream sees', async () => {
  const results = nightResults({ failing: ['a::x'] });
  const { actions } = planIssues({ results, causes: [{ title: 'A', summary: 's', tests: ['a::x'], causeCommand: 'npx jest a' }], openIssues: [], setupFailed: null });
  const body = actions[0].body;
  const green = planIssues({
    results: nightResults({ testCode: 0, failing: [], cases: [{ id: 'a::x', status: 'passed' }] }),
    causes: [], openIssues: [{ number: 12, labels: ['nightly-test-failure'], body }], setupFailed: null,
  }).actions;
  assert.equal(green[0].type, 'set-marker');
  // apply-plan replaces the one marker line, nothing else.
  const lines = body.split('\n');
  const i = lines.findIndex((l) => l.startsWith('<!-- nightly-test-failure '));
  lines[i] = green[0].marker;
  const updated = lines.join('\n');
  const m = parseMarker(updated);
  assert.equal(m.greenNights, 1);
  assert.equal(formatMarker({ ...m, greenNights: 0 }), formatMarker(parseMarker(body)));
  const { suite, pout } = await downstream(updated);
  assert.equal(suite[0].setup, SETUP);
  assert.equal(suite[0].test, TEST);
  assert.deepEqual(pout, [{ branch: 'nightly-fix/12', base: SHA }]);
});
