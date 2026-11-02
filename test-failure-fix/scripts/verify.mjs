import { rmSync, realpathSync, readdirSync, readFileSync, readlinkSync, lstatSync } from 'node:fs';
import { join, posix, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { runSuite, git, sh, repoDir, outputJson } from '../../scripts/lib/nightly/exec.mjs';
import { statusById, summarize } from '../../scripts/lib/nightly/junit.mjs';
import { parseMarker } from '../../scripts/lib/nightly/marker.mjs';
import {
  COMPILED_EXTENSIONS, INTERPRETED_EXTENSIONS, isTestFile, isProtectedFile, languageMode, parseNameStatus, parseNumstat,
} from '../../scripts/lib/nightly/classify.mjs';
import { diffRules } from '../../scripts/lib/nightly/diff-rules.mjs';
import { compareResults, redCheck } from '../../scripts/lib/nightly/compare.mjs';

// Total wall-clock budget, inside the step's 245 min limit. Each command (setup or test)
// gets the baseline's 55 min limit, or what is left of the budget if that is less.
const VERIFY_BUDGET_MS = 235 * 60 * 1000;
const VERIFY_COMMAND_MS = 55 * 60 * 1000;
const VERIFY_BUDGET_REASON = 'verification time budget exhausted';
const VERIFY_CONFIG_REASON = 'git config changed during verification';
// Repo config must not reshape what git reports: no replace refs, no pathspec magic, no fsmonitor command.
const VERIFY_GIT_OPTS = ['--no-replace-objects', '--literal-pathspecs', '-c', 'core.fsmonitor=false'];
const VERIFY_DIFF_FLAGS = ['-M', '-z', '--no-ext-diff', '--no-textconv', '--no-color', '--no-relative'];
const VERIFY_STATUS = ['status', '--porcelain', '--untracked-files=no', '--ignore-submodules=none'];
const VERIFY_CHUNK = 200;
// Only test source files decide the language mode; fixtures and data files do not.
const VERIFY_CODE_EXTENSIONS = new Set([...COMPILED_EXTENSIONS, ...INTERPRETED_EXTENSIONS]);

export function verifyGit(deps, args, cwd) {
  return String(deps.git([...VERIFY_GIT_OPTS, ...args], cwd));
}

// The push URL may embed a token: never let it reach a log line, a reason or a check.
export function verifyRedact(msg, ...urls) {
  let s = String(msg);
  for (const url of urls) if (url) s = s.split(url).join('<push-url>');
  return s.replace(/([a-z][a-z0-9+.-]*:\/\/)[^@/\s]+@/gi, '$1***@');
}

// The push URL as it may be stored and shown: http(s) userinfo removed (auth then comes from the
// credential helper), passwords removed from other scheme URLs, scp-style and paths kept.
export function verifyPublicUrl(raw) {
  const u = String(raw);
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) return u;
  let p;
  try { p = new URL(u); } catch { throw new Error('push URL is not a valid URL'); }
  if (/^https?:$/i.test(p.protocol)) p.username = '';
  p.password = '';
  return p.toString();
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

function verifyExt(path) {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const i = base.lastIndexOf('.');
  return i <= 0 ? '' : base.slice(i).toLowerCase();
}

// Code-file arguments of a cause command (e.g. `pytest tests/test_a.py::test_x` -> tests/test_a.py).
export function verifyCommandPaths(cmd) {
  const out = new Set();
  for (let tok of String(cmd).split(/\s+/)) {
    tok = tok.replace(/^['"]+|['"]+$/g, '');
    const i = tok.indexOf('::');
    if (i >= 0) tok = tok.slice(0, i);
    tok = tok.replace(/^(\.\/)+/, '');
    if (tok && VERIFY_CODE_EXTENSIONS.has(verifyExt(tok))) out.add(tok);
  }
  return [...out].sort();
}

// Language mode. The cause's test files decide when known; otherwise the test source files
// the fix adds or changes, interpreted if any of them is. Deleted and renamed entries never
// count; non-code files count only when JUnit names them. Compiled and interpreted test files
// together need a person.
export function verifyMode({ marker, fixCases, nameStatus, isTest, junitFiles, dirs }) {
  const causeIds = new Set(marker.tests);
  const causeFiles = [...new Set(marker.junit
    ? (fixCases || []).filter((c) => causeIds.has(c.id) && c.file).map((c) => verifyRelPath(c.file, dirs))
    : verifyCommandPaths(marker.causeCommand))].sort();
  const touched = [...new Set(nameStatus
    .filter((e) => ['A', 'M', 'T', 'C'].includes(e.status) && isTest(e.path)
      && (VERIFY_CODE_EXTENSIONS.has(verifyExt(e.path)) || junitFiles.has(e.path)))
    .map((e) => e.path))].sort();
  const interpreted = (p) => INTERPRETED_EXTENSIONS.has(verifyExt(p));
  const compiled = (p) => COMPILED_EXTENSIONS.has(verifyExt(p));
  let mode;
  if (causeFiles.length > 0) mode = languageMode(causeFiles);
  else mode = touched.some(interpreted) ? 'interpreted' : 'compiled';
  const all = [...new Set([...causeFiles, ...touched])].sort();
  const mixed = all.some(compiled) && all.some(interpreted) ? `mixed-language test files: ${all.join(', ')}` : null;
  return { mode, paths: causeFiles.length > 0 ? causeFiles : touched, mixed };
}

function verifyListDir(p, acc, depth) {
  let st;
  try { st = lstatSync(p); } catch { acc.push(`${p}: missing`); return acc; }
  if (st.isSymbolicLink()) acc.push(`${p} -> ${readlinkSync(p)}`);
  else if (st.isFile()) acc.push(`${p} ${st.mode} ${createHash('sha256').update(readFileSync(p)).digest('hex')}`);
  else if (st.isDirectory() && depth < 4) {
    acc.push(`${p}/`);
    for (const n of readdirSync(p).sort()) verifyListDir(join(p, n), acc, depth + 1);
  } else acc.push(`${p}: ${st.mode}`);
  return acc;
}

// What later git commands (ours and later steps') depend on: repo-local config, URL rewrite
// rules from every scope, and the files of the hooks dir git would use without our override.
export function verifyConfigState(deps, dir) {
  const local = verifyGit(deps, ['config', '--local', '--list', '-z'], dir);
  const parts = verifyGit(deps, ['config', '--list', '-z', '--show-scope'], dir).split('\0');
  const urls = [];
  let hooksPath = null;
  for (let i = 0; i + 1 < parts.length; i += 2) {
    if (parts[i] === 'command') continue;
    const nl = parts[i + 1].indexOf('\n');
    const key = (nl < 0 ? parts[i + 1] : parts[i + 1].slice(0, nl)).toLowerCase();
    if (key.startsWith('url.')) urls.push(`${parts[i]} ${parts[i + 1]}`);
    if (key === 'core.hookspath') hooksPath = nl < 0 ? '' : parts[i + 1].slice(nl + 1);
  }
  const common = verifyGit(deps, ['rev-parse', '--path-format=absolute', '--git-common-dir'], dir).trim();
  const expanded = hooksPath && hooksPath.startsWith('~/') ? join(homedir(), hooksPath.slice(2)) : hooksPath;
  const hooksDir = expanded ? resolve(dir, expanded) : join(common, 'hooks');
  return JSON.stringify({ local, urls, hooksDir, hooks: verifyListDir(hooksDir, [], 0) });
}

// Pin the commit to verify, reset the work tree to exactly that commit, and capture everything
// later steps compare against before any fix-controlled code runs.
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
  const nameStatus = parseNameStatus(verifyGit(deps, ['diff', '--name-status', ...VERIFY_DIFF_FLAGS, base, sha, '--'], dir));
  const numstat = parseNumstat(verifyGit(deps, ['diff', '--numstat', ...VERIFY_DIFF_FLAGS, base, sha, '--'], dir));
  const pushUrl = verifyGit(deps, ['remote', 'get-url', '--push', 'origin'], dir).trim();
  if (!pushUrl || /[\r\n]/.test(pushUrl)) throw new Error('origin has no single push URL');
  return { sha, nameStatus, numstat, pushUrl, publicUrl: verifyPublicUrl(pushUrl), config: verifyConfigState(deps, dir) };
}

function verifyRemaining(ctx) {
  const left = ctx.deadline - ctx.deps.now();
  if (left <= 0) throw new Error(VERIFY_BUDGET_REASON);
  return Math.min(VERIFY_COMMAND_MS, left);
}

function verifyAfterCommand(ctx) {
  if (ctx.deps.now() >= ctx.deadline) throw new Error(VERIFY_BUDGET_REASON);
}

// Setup (when set) then the test command, each under the remaining budget.
export function verifySuite(ctx, dir, setup, test, name) {
  const { deps, stateDir } = ctx;
  if (setup && setup.trim()) {
    const s = deps.sh(setup, { cwd: dir, timeoutMs: verifyRemaining(ctx) });
    verifyAfterCommand(ctx);
    if (s.code !== 0) return { setupCode: s.code, testCode: null, cases: null };
  }
  const r = deps.runSuite({ dir, setup: '', test, junitDir: join(stateDir, name), timeoutMs: verifyRemaining(ctx) });
  verifyAfterCommand(ctx);
  return { setupCode: 0, testCode: r.testCode, cases: Array.isArray(r.cases) ? r.cases : null };
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
    if (marker.junit) {
      const u = verifySuite(ctx, wtU, setup, test, 'junit-unmodified');
      const o = verifySuite(ctx, wtO, setup, test, 'junit-overlay');
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
    const o = verifySuite(ctx, wtO, setup, marker.causeCommand, 'junit-overlay');
    if (o.setupCode !== 0) return { reasons: [`old-code setup failed (exit ${o.setupCode})`], check: 'old-code cause command: setup failed' };
    if (o.testCode === 0) return { reasons: ['cause command passes on old code'], check: 'old-code cause command exits 0' };
    return { reasons: [], check: `old-code red check passed (cause command exits ${o.testCode} on the base commit)` };
  } finally {
    verifyRemoveWorktrees(deps, dir, [wtU, wtO]);
  }
}

export function verifyResults(ctx, fix) {
  const { dir, marker, setup, test } = ctx;
  if (!marker.junit) {
    const c = verifySuite(ctx, dir, setup, marker.causeCommand, 'junit-cause');
    if (c.setupCode !== 0 || c.testCode !== 0) {
      return { reasons: ['cause command still fails'], checks: [`cause command at fix commit: setup exit ${c.setupCode}, exit ${c.testCode}`] };
    }
    return {
      reasons: [],
      checks: ['cause command exits 0 at the fix commit', 'no JUnit baseline: new failures, test counts and skips were not compared (needs human review)'],
    };
  }
  if (fix.cases === null) return { reasons: ['no JUnit from fix run (build failed?)'], checks: [] };
  if (fix.testCode !== 0 && summarize(fix.cases).failing.length === 0) {
    return { reasons: [`test command failed without failing tests (exit ${fix.testCode})`], checks: [] };
  }
  let reran = 0;
  const rerunFailed = (ids) => {
    reran = ids.length;
    const r = verifySuite(ctx, dir, '', test, 'junit-rerun');
    if (r.cases === null) return [...ids];
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

export async function main(env, deps = { runSuite, git, sh, outputJson, now: Date.now }) {
  try {
    return verifyRun(env, deps);
  } catch (e) {
    if (e.verifyRejected) throw e;
    // Anything else (git error, bad input, time budget) fails closed too.
    const msg = verifyRedact(e.message);
    deps.outputJson({ verified: false, reasons: [msg] });
    throw msg === e.message ? e : new Error(msg);
  }
}

function verifyRun(env, deps) {
  const deadline = deps.now() + VERIFY_BUDGET_MS;
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

  // 1. Pin; capture the diff, push URL and git config before anything runs.
  const pin = verifyPin(deps, dir, base);
  const { sha, pushUrl } = pin;
  checks.push(`commit ${sha} descends from base ${base}; tree clean`);
  const ctx = { deps, deadline, dir, stateDir, base, sha, marker, setup, test };

  // 2. Fix run on the pinned commit.
  const fix = verifySuite(ctx, dir, setup, test, 'junit');
  checks.push(`fix run: setup exit ${fix.setupCode}, test exit ${fix.testCode}, ${fix.cases ? `${fix.cases.length} JUnit case(s)` : 'no JUnit'}`);

  // 3-4. Diff rules on the pre-run diff; JUnit-named files count as test files.
  const dirs = verifyRepoDirs(dir);
  const junitFiles = new Set((fix.cases || []).filter((c) => c.file).map((c) => verifyRelPath(c.file, dirs)));
  const isTest = (p) => isTestFile(p, junitFiles);
  const violations = diffRules({ nameStatus: pin.nameStatus, numstat: pin.numstat, isTest, isProtected: isProtectedFile });
  checks.push(`diff: ${pin.nameStatus.length} file(s) changed, ${violations.length} rule violation(s)`);

  // 5. Language mode from test source files only.
  const { mode, paths: modePaths, mixed } = verifyMode({ marker, fixCases: fix.cases, nameStatus: pin.nameStatus, isTest, junitFiles, dirs });
  const humanReasons = mixed ? [...violations, mixed] : violations;
  const reasons = [];

  // 6. Old-code red check (interpreted only).
  if (mode === 'interpreted') {
    const overlayPaths = pin.nameStatus.filter((e) => (e.status === 'A' || e.status === 'M') && isTest(e.path)).map((e) => e.path).sort();
    const old = verifyOldCode({ ...ctx, overlayPaths });
    reasons.push(...old.reasons);
    checks.push(`language mode: interpreted — ${old.check}`);
  } else {
    checks.push(`language mode: compiled — old-code run skipped (${modePaths.length ? modePaths.join(', ') : 'no test source files'})`);
  }

  // 7. Results on the fix commit.
  const res = verifyResults(ctx, fix);
  reasons.push(...res.reasons);
  checks.push(...res.checks);
  const needsHuman = !marker.junit;

  // 8. The runs must not have moved HEAD, changed tracked files or changed git config or hooks.
  const head = verifyGit(deps, ['rev-parse', '--verify', 'HEAD^{commit}'], dir).trim().toLowerCase();
  if (head !== sha || verifyGit(deps, VERIFY_STATUS, dir).trim() !== '') reasons.push('tracked files changed during verification');
  else checks.push('HEAD and tracked files unchanged after the runs');
  if (verifyConfigState(deps, dir) !== pin.config) reasons.push(VERIFY_CONFIG_REASON);

  // 9. Reject: nothing is pushed. Diff violations follow so a retry sees the full picture.
  if (reasons.length > 0) {
    const all = [...reasons, ...humanReasons];
    console.log(verifyRedact(`verify: REJECT\n${[...checks, ...all].join('\n')}`, pushUrl, pin.publicUrl));
    deps.outputJson({ verified: false, reasons: all });
    const e = new Error(verifyRedact(`verify rejected: ${all.join('; ')}`, pushUrl, pin.publicUrl));
    e.verifyRejected = true;
    throw e;
  }

  // 10. Push exactly the pinned commit to the pinned URL; the branch must not exist yet.
  try {
    verifyGit(deps, ['push', `--force-with-lease=refs/heads/${branch}:`, pushUrl, `${sha}:refs/heads/${branch}`], dir);
  } catch (e) {
    throw new Error(verifyRedact(`push of ${sha} to ${branch} failed: ${e.message}`, pushUrl, pin.publicUrl));
  }
  const out = {
    verified: humanReasons.length === 0 && !needsHuman,
    needsHuman: needsHuman || humanReasons.length > 0,
    reasons: humanReasons, checks, branch, sha, pushUrl: pin.publicUrl,
  };
  console.log(verifyRedact(`verify: pushed ${branch} @ ${sha} (verified ${out.verified})\n${[...checks, ...humanReasons].join('\n')}`, pushUrl, pin.publicUrl));
  deps.outputJson(out);
  return out;
}
