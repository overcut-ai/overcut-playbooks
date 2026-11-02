import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runSuite, git, repoDir, outputJson } from '../../../scripts/lib/nightly/exec.mjs';
import { summarize } from '../../../scripts/lib/nightly/junit.mjs';

// Per command (setup, then test). Two of these stay under the step's 7200 s limit.
const RUN_TESTS_TIMEOUT_MS = 55 * 60 * 1000;

function runTestsSetting(v) {
  return typeof v === 'string' && v.trim() ? v : null;
}

export function runTestsCommands(env, stateDir) {
  let setup = runTestsSetting(env.OC_PARAM_NIGHTLY_SETUP_COMMAND);
  let test = runTestsSetting(env.OC_PARAM_NIGHTLY_TEST_COMMAND);
  if (setup === null || test === null) {
    const f = join(stateDir, 'commands.json');
    if (!existsSync(f)) throw new Error(`${f} not found and the settings are not both set`);
    const c = JSON.parse(readFileSync(f, 'utf8'));
    if (setup === null) setup = typeof c.setup === 'string' ? c.setup : '';
    if (test === null) test = typeof c.test === 'string' ? c.test : '';
  }
  if (!test.trim()) throw new Error('no test command: set nightly_test_command or fix commands.json');
  return { setup, test };
}

export function runTestsStatus({ setupCode, testCode, cases }, failing) {
  if (setupCode !== 0) return 'setup-failed';
  if (failing.length > 0 || (cases === null && testCode !== 0)) return 'red';
  return 'green';
}

export async function main(env, deps = { runSuite, git, outputJson }) {
  const stateDir = join(env.AGENT_WORKSPACE_PATH || '', '.nightly');
  const dir = repoDir(env);
  const { setup, test } = runTestsCommands(env, stateDir);
  const sha = String(deps.git(['rev-parse', 'HEAD'], dir)).trim();
  if (!/^[0-9a-f]{40}$/i.test(sha)) throw new Error(`bad sha from git rev-parse HEAD: ${sha}`);

  const r = deps.runSuite({ dir, setup, test, junitDir: join(stateDir, 'junit'), timeoutMs: RUN_TESTS_TIMEOUT_MS });
  let cases = r.cases === undefined ? null : r.cases;
  let sum = cases === null ? { total: 0, skipped: 0, failing: [] } : summarize(cases);
  // Non-zero exit with no failing test in the XML (e.g. a module that never compiled):
  // the XML is incomplete, so judge by exit code alone instead of reading it as green.
  if (cases !== null && r.setupCode === 0 && r.testCode !== 0 && sum.failing.length === 0) {
    cases = null;
    sum = { total: 0, skipped: 0, failing: [] };
  }
  const status = runTestsStatus({ setupCode: r.setupCode, testCode: r.testCode, cases }, sum.failing);

  const results = {
    status, sha, junit: cases !== null, testCode: r.testCode,
    total: sum.total, skipped: sum.skipped, failing: sum.failing, cases,
    setup, test, log: r.log,
  };
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(join(stateDir, 'results.json'), JSON.stringify(results, null, 2));
  console.log(`nightly: ${status} at ${sha} (total ${sum.total}, failing ${sum.failing.length}, setup exit ${r.setupCode}, test exit ${r.testCode})`);
  deps.outputJson({ status, total: sum.total, failing: sum.failing.length });
}
