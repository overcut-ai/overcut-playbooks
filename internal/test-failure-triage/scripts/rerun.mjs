import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { runSuite, git, repoDir, outputJson } from '../../../scripts/lib/nightly/exec.mjs';
import { statusById, summarize } from '../../../scripts/lib/nightly/junit.mjs';
import { parseMarker, markerTrustedLabels } from '../../../scripts/lib/nightly/marker.mjs';

// Per command (setup, then test), as in the nightly run. Two stay under the step's 7200 s limit.
const RERUN_TIMEOUT_MS = 55 * 60 * 1000;
// Keep the log the agent reads (and may quote in a comment) small.
const RERUN_LOG_MAX = 20000;

export function rerunCheckout(deps, dir, sha) {
  try {
    // Fetch only when the clone does not already have the commit.
    let present = true;
    try { deps.git(['cat-file', '-e', `${sha}^{commit}`], dir); } catch { present = false; }
    if (!present) deps.git(['fetch', 'origin', sha], dir);
    deps.git(['checkout', '--detach', sha], dir);
  } catch (e) {
    throw new Error(`cannot check out baseline ${sha}: ${e.message}`);
  }
}

// Split the marker's tests by the rerun. Skipped or absent counts as still failing.
export function rerunSplit(tests, cases) {
  const byId = statusById(cases);
  const stillFailing = [];
  const nowPassing = [];
  for (const id of tests) (byId.get(id) === 'passed' ? nowPassing : stillFailing).push(id);
  return { stillFailing, nowPassing };
}

export function rerunResult(marker, r) {
  const log = String(r.log || '').slice(-RERUN_LOG_MAX);
  const base = { junit: marker.junit, sha: marker.sha, testCode: r.testCode, log };
  // The marker kept only a prefix of the cause's ids: the rerun judged that prefix only.
  if (marker.testsTruncated) base.testsTruncated = true;
  if (r.setupCode !== 0) {
    return {
      ...base, setupFailed: true, setupCode: r.setupCode,
      stillFailing: marker.junit ? marker.tests : true, nowPassing: marker.junit ? [] : false, cases: null,
    };
  }
  if (!marker.junit) {
    return { ...base, stillFailing: r.testCode !== 0, nowPassing: r.testCode === 0, cases: null };
  }
  const cases = r.cases === undefined ? null : r.cases;
  // Same rule as the nightly run: non-zero exit with no failing case means the XML is incomplete.
  if (cases === null || (r.testCode !== 0 && summarize(cases).failing.length === 0)) {
    return {
      ...base, rerunError: `no per-test results from rerun (exit ${r.testCode})`,
      stillFailing: marker.tests, nowPassing: [], cases: null,
    };
  }
  return { ...base, ...rerunSplit(marker.tests, cases), cases };
}

export function rerunSummary(res) {
  const n = (v) => (Array.isArray(v) ? v.length : v);
  const out = { junit: res.junit, stillFailing: n(res.stillFailing), nowPassing: n(res.nowPassing) };
  if (res.rerunError) out.rerunError = res.rerunError;
  if (res.setupFailed) out.setupFailed = true;
  if (res.testsTruncated) out.testsTruncated = true;
  return out;
}

export async function main(env, deps = { runSuite, git, outputJson }) {
  if (!markerTrustedLabels(env.ISSUE_LABELS)) throw new Error('issue is not labelled nightly-test-failure');
  const marker = parseMarker(env.ISSUE_BODY);
  if (!marker) throw new Error('no baseline marker in the issue body');
  const stateDir = join(env.AGENT_WORKSPACE_PATH || '', '.nightly');
  const dir = repoDir(env);
  rerunCheckout(deps, dir, marker.sha);

  // Commands come only from the marker. With JUnit, re-run `test`: only it writes JUnit XML
  // (causeCommand need not), and the cause's tests are picked out of that XML.
  const r = deps.runSuite({
    dir,
    setup: marker.setup,
    test: marker.junit ? marker.test : marker.causeCommand,
    junitDir: join(stateDir, 'junit'),
    timeoutMs: RERUN_TIMEOUT_MS,
  });
  const res = rerunResult(marker, r);
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(join(stateDir, 'rerun.json'), JSON.stringify(res, null, 2));
  const summary = rerunSummary(res);
  console.log(`triage rerun at ${marker.sha}: ${JSON.stringify(summary)}`);
  deps.outputJson(summary);
}
