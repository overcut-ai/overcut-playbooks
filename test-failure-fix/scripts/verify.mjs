import { rmSync, realpathSync } from 'node:fs';
import { join, posix } from 'node:path';
import { runSuite, git, repoDir, outputJson } from '../../scripts/lib/nightly/exec.mjs';
import { statusById, summarize } from '../../scripts/lib/nightly/junit.mjs';
import { parseMarker } from '../../scripts/lib/nightly/marker.mjs';
import { isTestFile, isProtectedFile, languageMode, parseNameStatus, parseNumstat } from '../../scripts/lib/nightly/classify.mjs';
import { diffRules } from '../../scripts/lib/nightly/diff-rules.mjs';
import { compareResults, redCheck } from '../../scripts/lib/nightly/compare.mjs';

// Per command. The worst case (interpreted, JUnit) runs 7 commands: fix setup+test,
// unmodified setup+test, overlay setup+test, rerun test. 7 x 30 min stays under 14400 s.
const VERIFY_TIMEOUT_MS = 30 * 60 * 1000;
// Repo config must not reshape what git reports: no replace refs, no pathspec magic, no fsmonitor command.
const VERIFY_GIT_OPTS = ['--no-replace-objects', '--literal-pathspecs', '-c', 'core.fsmonitor=false'];
const VERIFY_DIFF_FLAGS = ['-M', '-z', '--no-ext-diff', '--no-textconv', '--no-color', '--no-relative'];
const VERIFY_STATUS = ['status', '--porcelain', '--untracked-files=no', '--ignore-submodules=none'];
const VERIFY_CHUNK = 200;

export function verifyGit(deps, args, cwd) {
  return String(deps.git([...VERIFY_GIT_OPTS, ...args], cwd));
}

function verifySetting(v) {
  return typeof v === 'string' && v.trim() ? v : null;
}

// Settings when set, else the marker. The cause command always comes from the marker.
export function verifyCommands(env, marker) {
  const setup = verifySetting(env.OC_PARAM_NIGHTLY_SETUP_COMMAND) ?? marker.setup;
  const test = verifySetting(env.OC_PARAM_NIGHTLY_TEST_COMMAND) ?? marker.test;
  if (!test.trim()) throw new Error('no test command in the settings or the marker');
  if (!marker.junit && !marker.causeCommand.trim()) throw new Error('no cause command in the marker');
  return { setup, test };
}

// A JUnit `file` attribute as a repo-relative '/' path.
export function verifyRelPath(file, dirs) {
  let p = String(file).replace(/\\/g, '/');
  for (const d of dirs) {
    const prefix = d.replace(/\\/g, '/').replace(/\/+$/, '') + '/';
    if (p.startsWith(prefix)) { p = p.slice(prefix.length); break; }
  }
  return posix.normalize(p).replace(/^(\.\/)+/, '');
}

function verifyRepoDirs(dir) {
  const dirs = new Set([dir]);
  try { dirs.add(realpathSync(dir)); } catch { /* the plain path still applies */ }
  return [...dirs].sort((a, b) => b.length - a.length);
}

// Pin the commit to verify, then reset the work tree to exactly that commit.
export function verifyPin(deps, dir, base) {
  const sha = verifyGit(deps, ['rev-parse', '--verify', 'HEAD^{commit}'], dir).trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`bad sha from git rev-parse HEAD: ${sha}`);
  if (sha === base) throw new Error('no fix commit: HEAD is the base commit');
  if (verifyGit(deps, VERIFY_STATUS, dir).trim() !== '') throw new Error('uncommitted changes to tracked files (they would be tested but not pushed)');
  try {
    verifyGit(deps, ['merge-base', '--is-ancestor', base, sha], dir);
  } catch {
    throw new Error(`HEAD ${sha} does not descend from base ${base}`);
  }
  // Untracked and ignored files would be tested but not pushed.
  verifyGit(deps, ['clean', '-ffdxq'], dir);
  return sha;
}

export function verifyDiff(deps, dir, base, sha, junitFiles) {
  const nameStatus = parseNameStatus(verifyGit(deps, ['diff', '--name-status', ...VERIFY_DIFF_FLAGS, base, sha, '--'], dir));
  const numstat = parseNumstat(verifyGit(deps, ['diff', '--numstat', ...VERIFY_DIFF_FLAGS, base, sha, '--'], dir));
  const isTest = (p) => isTestFile(p, junitFiles);
  const violations = diffRules({ nameStatus, numstat, isTest, isProtected: isProtectedFile });
  return { nameStatus, isTest, violations };
}

// A run gave per-test results: setup passed, XML read, and a non-zero exit has a failing case.
function verifyHasResults(r) {
  return r.setupCode === 0 && Array.isArray(r.cases) && !(r.testCode !== 0 && summarize(r.cases).failing.length === 0);
}

function verifyRemoveWorktrees(deps, dir, paths) {
  for (const p of paths) {
    try { verifyGit(deps, ['worktree', 'remove', '--force', p], dir); } catch { /* not registered */ }
    rmSync(p, { recursive: true, force: true });
  }
  try { verifyGit(deps, ['worktree', 'prune'], dir); } catch { /* best effort */ }
}

// Interpreted only: run the old code without and with the fix's added/modified test files.
export function verifyOldCode(ctx) {
  const { deps, dir, stateDir, base, sha, marker, setup, test, overlayPaths } = ctx;
  const wtU = join(stateDir, 'wt-unmodified');
  const wtO = join(stateDir, 'wt-overlay');
  verifyRemoveWorktrees(deps, dir, [wtU, wtO]);
  try {
    verifyGit(deps, ['worktree', 'add', '--detach', wtU, base], dir);
    verifyGit(deps, ['worktree', 'add', '--detach', wtO, base], dir);
    for (let i = 0; i < overlayPaths.length; i += VERIFY_CHUNK) {
      verifyGit(deps, ['checkout', sha, '--', ...overlayPaths.slice(i, i + VERIFY_CHUNK)], wtO);
    }
    const run = (wt, cmd, name) => deps.runSuite({ dir: wt, setup, test: cmd, junitDir: join(stateDir, name), timeoutMs: VERIFY_TIMEOUT_MS });
    if (marker.junit) {
      const u = run(wtU, test, 'junit-unmodified');
      const o = run(wtO, test, 'junit-overlay');
      if (!verifyHasResults(u) || !verifyHasResults(o)) {
        return { reasons: ['no per-test results from old-code run'], check: 'old-code red check: no per-test results' };
      }
      const rc = redCheck({ unmodifiedCases: u.cases, overlayCases: o.cases, causeIds: marker.tests });
      return {
        reasons: rc.reasons,
        check: rc.ok
          ? `old-code red check passed (cause tests and ${rc.newIds.length} new test(s) fail on the base commit)`
          : 'old-code red check failed',
      };
    }
    const o = run(wtO, marker.causeCommand, 'junit-overlay');
    if (o.setupCode !== 0) return { reasons: [`old-code setup failed (exit ${o.setupCode})`], check: 'old-code cause command: setup failed' };
    if (o.testCode === 0) return { reasons: ['cause command passes on old code'], check: 'old-code cause command exits 0' };
    return { reasons: [], check: `old-code red check passed (cause command exits ${o.testCode} on the base commit)` };
  } finally {
    verifyRemoveWorktrees(deps, dir, [wtU, wtO]);
  }
}

export function verifyResults(ctx, fix) {
  const { deps, dir, stateDir, marker, setup, test } = ctx;
  if (!marker.junit) {
    const c = deps.runSuite({ dir, setup, test: marker.causeCommand, junitDir: join(stateDir, 'junit-cause'), timeoutMs: VERIFY_TIMEOUT_MS });
    if (c.setupCode !== 0 || c.testCode !== 0) {
      return { reasons: ['cause command still fails'], checks: [`cause command at fix commit: setup exit ${c.setupCode}, exit ${c.testCode}`] };
    }
    return {
      reasons: [],
      checks: ['cause command exits 0 at the fix commit', 'no JUnit baseline: new failures, test counts and skips were not compared (needs human review)'],
    };
  }
  if (fix.cases === null || fix.cases === undefined) return { reasons: ['no JUnit from fix run (build failed?)'], checks: [] };
  if (fix.testCode !== 0 && summarize(fix.cases).failing.length === 0) {
    return { reasons: [`test command failed without failing tests (exit ${fix.testCode})`], checks: [] };
  }
  let reran = 0;
  const rerunFailed = (ids) => {
    reran = ids.length;
    const r = deps.runSuite({ dir, setup: '', test, junitDir: join(stateDir, 'junit-rerun'), timeoutMs: VERIFY_TIMEOUT_MS });
    if (!Array.isArray(r.cases)) return [...ids];
    const status = statusById(r.cases);
    return ids.filter((id) => status.get(id) !== 'passed');
  };
  const cmp = compareResults({ baseline: marker, fixCases: fix.cases, causeIds: marker.tests, rerunFailed });
  const sum = summarize(fix.cases);
  return {
    reasons: cmp.reasons,
    checks: cmp.ok ? [
      `cause tests pass at the fix commit (${marker.tests.length})`,
      reran ? `no new failures (${reran} new failure(s) passed on rerun)` : 'no new failures',
      `tests ${sum.total} (baseline ${marker.total}), skipped ${sum.skipped} (baseline ${marker.skipped})`,
    ] : [],
  };
}

export async function main(env, deps = { runSuite, git, outputJson }) {
  try {
    return verifyRun(env, deps);
  } catch (e) {
    // A rejection already wrote its reasons; anything else (git error, bad input) fails closed too.
    if (!e.verifyRejected) deps.outputJson({ verified: false, reasons: [e.message] });
    throw e;
  }
}

function verifyRun(env, deps) {
  const marker = parseMarker(env.ISSUE_BODY);
  if (!marker) throw new Error('no baseline marker in the issue body');
  const base = marker.sha.toLowerCase();
  if (String(env.BASE ?? '').toLowerCase() !== base) throw new Error(`BASE ${JSON.stringify(env.BASE)} does not match the marker sha ${base}`);
  const n = String(env.ISSUE_NUMBER ?? '');
  const branch = `nightly-fix/${n}`;
  if (!/^[1-9][0-9]*$/.test(n) || env.BRANCH !== branch) throw new Error(`BRANCH ${JSON.stringify(env.BRANCH)} is not nightly-fix/<ISSUE_NUMBER>`);
  if (marker.junit && marker.tests.length === 0) throw new Error('the marker lists no cause tests');
  const { setup, test } = verifyCommands(env, marker);
  const stateDir = join(env.AGENT_WORKSPACE_PATH, '.nightly');
  const dir = repoDir(env);
  const checks = [];

  // 1. Pin.
  const sha = verifyPin(deps, dir, base);
  checks.push(`commit ${sha} descends from base ${base}; tree clean`);

  // 2. Fix run on the pinned commit.
  const fix = deps.runSuite({ dir, setup, test, junitDir: join(stateDir, 'junit'), timeoutMs: VERIFY_TIMEOUT_MS });
  const fixCases = Array.isArray(fix.cases) ? fix.cases : null;
  checks.push(`fix run: setup exit ${fix.setupCode}, test exit ${fix.testCode}, ${fixCases ? `${fixCases.length} JUnit case(s)` : 'no JUnit'}`);

  // 3-4. Diff rules; JUnit-named files count as test files.
  const dirs = verifyRepoDirs(dir);
  const junitFiles = new Set((fixCases || []).filter((c) => c.file).map((c) => verifyRelPath(c.file, dirs)));
  const diff = verifyDiff(deps, dir, base, sha, junitFiles);
  checks.push(`diff: ${diff.nameStatus.length} file(s) changed, ${diff.violations.length} rule violation(s)`);

  // 5. Language mode from the cause's test files and the test files the fix touches.
  const causeIds = new Set(marker.tests);
  const modePaths = [...new Set([
    ...(fixCases || []).filter((c) => causeIds.has(c.id) && c.file).map((c) => verifyRelPath(c.file, dirs)),
    ...diff.nameStatus.filter((e) => diff.isTest(e.path)).map((e) => e.path),
  ])].sort();
  const mode = languageMode(modePaths);
  const ctx = { deps, dir, stateDir, base, sha, marker, setup, test };
  const reasons = [];

  // 6. Old-code red check (interpreted only).
  if (mode === 'interpreted') {
    const overlayPaths = diff.nameStatus.filter((e) => (e.status === 'A' || e.status === 'M') && diff.isTest(e.path)).map((e) => e.path).sort();
    const old = verifyOldCode({ ...ctx, overlayPaths });
    reasons.push(...old.reasons);
    checks.push(`language mode: interpreted — ${old.check}`);
  } else {
    checks.push(`language mode: compiled — old-code run skipped (${modePaths.length ? modePaths.join(', ') : 'no test files with a known path'})`);
  }

  // 7. Results on the fix commit.
  const res = verifyResults(ctx, { ...fix, cases: fixCases });
  reasons.push(...res.reasons);
  checks.push(...res.checks);
  const needsHuman = !marker.junit;

  // 8. The runs must not have moved HEAD or changed tracked files.
  const head = verifyGit(deps, ['rev-parse', '--verify', 'HEAD^{commit}'], dir).trim().toLowerCase();
  if (head !== sha || verifyGit(deps, VERIFY_STATUS, dir).trim() !== '') reasons.push('tracked files changed during verification');
  else checks.push('HEAD and tracked files unchanged after the runs');

  // 9. Reject: nothing is pushed.
  if (reasons.length > 0) {
    console.log(`verify: REJECT\n${[...checks, ...reasons].join('\n')}`);
    deps.outputJson({ verified: false, reasons });
    const e = new Error(`verify rejected: ${reasons.join('; ')}`);
    e.verifyRejected = true;
    throw e;
  }

  // 10. Push exactly the pinned commit; the branch must not exist yet.
  verifyGit(deps, ['push', `--force-with-lease=refs/heads/${branch}:`, 'origin', `${sha}:refs/heads/${branch}`], dir);
  const out = {
    verified: diff.violations.length === 0 && !needsHuman,
    needsHuman: needsHuman || diff.violations.length > 0,
    reasons: diff.violations, checks, branch, sha,
  };
  console.log(`verify: pushed ${branch} @ ${sha} (verified ${out.verified})\n${[...checks, ...diff.violations].join('\n')}`);
  deps.outputJson(out);
  return out;
}
