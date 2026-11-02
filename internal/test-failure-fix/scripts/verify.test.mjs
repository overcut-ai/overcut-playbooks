import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { git, runSuite, sh } from '../../../scripts/lib/nightly/exec.mjs';
import { makeRepo, issueBody, installHooks, tgit } from './fixtures/repo.mjs';
import { main, verifyRelPath, verifyCommandPaths, verifyPublicUrl } from './verify.mjs';
import { main as assertHead } from './assert-head.mjs';

const CAUSE = 'tests.test_calc::test_add';
const PY = {
  'src/calc.py': 'def add(a, b):\n    return a-b\n\ndef sub(a, b):\n    return a-b\n',
  'tests/test_calc.py': '# CASE test_add src/calc.py return a+b\n# CASE test_sub src/calc.py def sub\n',
  'tests/test_other.py': '# CASE test_other src/calc.py def add\n',
};
const PY_FIX = { 'src/calc.py': 'def add(a, b):\n    return a+b\n\ndef sub(a, b):\n    return a-b\n' };
const PY_NEW_TEST = { 'tests/test_more.py': '# CASE test_add_more src/calc.py return a+b\n' };

const GO_CAUSE = 'calc_test::TestAdd';
const GO = {
  'calc.go': 'func Add(a, b int) int { return a - b }\n',
  'calc_test.go': '// CASE TestAdd calc.go return a + b\n// CASE TestName calc.go func Add\n',
};
const GO_FIX = { 'calc.go': 'func Add(a, b int) int { return a + b }\n' };

function setup(files, markerOver = {}, { cause = CAUSE, total = 3 } = {}) {
  const r = makeRepo(files);
  const marker = {
    sha: r.base, junit: true, tests: [cause], allFailing: [cause], total, skipped: 0,
    setup: '', test: r.test, causeCommand: r.test, greenNights: 0, ...markerOver,
  };
  const calls = { git: [], suite: [], sh: [], out: [], events: [] };
  const deps = {
    git: (args, cwd) => { calls.git.push({ args, cwd }); calls.events.push(`git ${args.join(' ')}`); return git(args, cwd); },
    runSuite: (a) => { calls.suite.push(a); calls.events.push('suite'); return runSuite(a); },
    sh: (cmd, o) => { calls.sh.push({ cmd, ...o }); calls.events.push('sh'); return sh(cmd, o); },
    now: Date.now,
    outputJson: (o) => calls.out.push(o),
  };
  const env = (extra = {}) => ({
    AGENT_WORKSPACE_PATH: r.ws, REPO_FULL_NAME: 'o/repo', ISSUE_BODY: issueBody(marker),
    ISSUE_NUMBER: '7', BASE: r.base, BRANCH: 'nightly-fix/7', ...extra,
  });
  const worktreeCalls = () => calls.git.filter((g) => g.args.includes('worktree'));
  const overlayCheckouts = () => calls.git.filter((g) => g.args.includes('checkout') && g.cwd.endsWith('wt-overlay'));
  return { ...r, marker, calls, deps, env, worktreeCalls, overlayCheckouts };
}

function assertNoWorktrees(t) {
  assert.equal(existsSync(join(t.ws, '.nightly', 'wt-unmodified')), false);
  assert.equal(existsSync(join(t.ws, '.nightly', 'wt-overlay')), false);
  const list = tgit(['worktree', 'list', '--porcelain'], t.dir);
  assert.equal(list.split('\n').filter((l) => l.startsWith('worktree ')).length, 1, list);
}

async function rejected(t, re, envExtra) {
  await assert.rejects(main(t.env(envExtra), t.deps), re);
  assert.equal(t.remoteHead('nightly-fix/7'), null, 'nothing may be pushed');
  const out = t.calls.out.at(-1);
  assert.equal(out.verified, false);
  return out;
}

// --- interpreted (end to end: real git + real runSuite) ---

test('interpreted: correct fix with a new failing-before test -> verified and pushed', async () => {
  const t = setup(PY);
  try {
    const sha = t.commit({ ...PY_FIX, ...PY_NEW_TEST });
    await main(t.env(), t.deps);
    const out = t.calls.out.at(-1);
    assert.equal(out.verified, true);
    assert.equal(out.needsHuman, false);
    assert.deepEqual(out.reasons, []);
    assert.equal(out.sha, sha);
    assert.equal(out.branch, 'nightly-fix/7');
    assert.equal(t.remoteHead('nightly-fix/7'), sha);
    assert.ok(out.checks.some((c) => /language mode: interpreted/.test(c)), out.checks.join('\n'));
    assert.ok(out.checks.some((c) => /red check passed/.test(c)), out.checks.join('\n'));
    assert.equal(t.calls.suite.length, 3, 'fix run, unmodified, overlay');
    assertNoWorktrees(t);
  } finally { t.cleanup(); }
});

test('interpreted: a new test that passes on old code -> exit 1, not pushed', async () => {
  const t = setup(PY);
  try {
    t.commit({ ...PY_FIX, 'tests/test_extra.py': '# CASE test_trivial src/calc.py def add\n' });
    const out = await rejected(t, /new test passes on old code/);
    assert.deepEqual(out.reasons, ['new test passes on old code: tests.test_extra::test_trivial']);
    assertNoWorktrees(t);
  } finally { t.cleanup(); }
});

test('interpreted: overlay checks out only added/modified test paths at SHA', async () => {
  const t = setup({ ...PY, 'tests/test_ren.py': '# CASE test_ren src/calc.py def sub\n' }, {}, { total: 4 });
  try {
    t.commit({
      ...PY_FIX, ...PY_NEW_TEST,
      'tests/test_calc.py': PY['tests/test_calc.py'] + '# extra comment\n',
      'tests/test_other.py': null,
      'tests/test_ren.py': null, 'tests/test_ren2.py': '# CASE test_ren src/calc.py def sub\n',
      'src/util.py': 'X = 1\n',
    });
    await main(t.env(), t.deps);
    const out = t.calls.out.at(-1);
    assert.equal(out.verified, false);
    assert.deepEqual(out.reasons, [
      'existing test file changed: tests/test_calc.py (+1 -0)',
      'test file deleted: tests/test_other.py',
      'test file renamed: tests/test_ren.py -> tests/test_ren2.py',
    ]);
    const co = t.overlayCheckouts();
    assert.equal(co.length, 1);
    const paths = co[0].args.slice(co[0].args.indexOf('--') + 1);
    assert.deepEqual(paths, ['tests/test_calc.py', 'tests/test_more.py']);
    assertNoWorktrees(t);
  } finally { t.cleanup(); }
});

test('interpreted: overlay paths are literal (a glob-like test filename pulls in nothing else)', async () => {
  const t = setup({ ...PY, 'tests/test_q.py': '# CASE test_q src/calc.py def sub\n' }, {}, { total: 4 });
  try {
    t.commit({ ...PY_FIX, 'tests/test_q.py': null, 'tests/test_m.py': '# CASE test_q src/calc.py def sub\n', 'tests/test_[m].py': '# CASE test_g src/calc.py return a+b\n' });
    await main(t.env(), t.deps);
    const out = t.calls.out.at(-1);
    assert.deepEqual(out.reasons, ['test file renamed: tests/test_q.py -> tests/test_m.py']);
    assert.ok(out.checks.some((c) => /red check passed \(cause tests and 1 new test/.test(c)), out.checks.join('\n'));
  } finally { t.cleanup(); }
});

test('worktrees are removed even when an old-code run throws', async () => {
  const t = setup(PY);
  try {
    t.commit({ ...PY_FIX, ...PY_NEW_TEST });
    const deps = { ...t.deps, runSuite: (a) => { if (a.dir.includes('wt-overlay')) throw new Error('boom'); return runSuite(a); } };
    await assert.rejects(main(t.env(), deps), /boom/);
    assert.equal(t.remoteHead('nightly-fix/7'), null);
    assert.deepEqual(t.calls.out.at(-1).verified, false);
    assertNoWorktrees(t);
  } finally { t.cleanup(); }
});

test('interpreted: old-code run without per-test results -> exit 1', async () => {
  const t = setup(PY);
  try {
    t.commit({ ...PY_FIX, ...PY_NEW_TEST });
    const deps = { ...t.deps, runSuite: (a) => (a.dir.includes('wt-overlay') ? { setupCode: 0, testCode: 2, cases: null, log: '' } : runSuite(a)) };
    await assert.rejects(main(t.env(), deps), /no per-test results from old-code run/);
    assert.equal(t.remoteHead('nightly-fix/7'), null);
    assertNoWorktrees(t);
  } finally { t.cleanup(); }
});

test('interpreted: old-code run exits non-zero with no failing case (partial XML) -> exit 1', async () => {
  const t = setup(PY);
  try {
    t.commit({ ...PY_FIX, ...PY_NEW_TEST });
    const partial = { setupCode: 0, testCode: 2, cases: [{ id: 'tests.test_calc::test_sub', name: 'test_sub', classname: 'tests.test_calc', file: null, status: 'passed' }], log: '' };
    const deps = { ...t.deps, runSuite: (a) => (a.dir.includes('wt-unmodified') ? partial : runSuite(a)) };
    await assert.rejects(main(t.env(), deps), /no per-test results from old-code run/);
    assert.equal(t.remoteHead('nightly-fix/7'), null);
  } finally { t.cleanup(); }
});

test('a git replace ref cannot hide an edited test file from the diff', async () => {
  const t = setup(GO, {}, { cause: GO_CAUSE, total: 2 });
  try {
    const edited = GO['calc_test.go'].replace('func Add', 'func ');
    t.commit({ ...GO_FIX, 'calc_test.go': edited });
    const oldBlob = tgit(['rev-parse', `${t.base}:calc_test.go`], t.dir).trim();
    const newBlob = tgit(['rev-parse', 'HEAD:calc_test.go'], t.dir).trim();
    tgit(['replace', newBlob, oldBlob], t.dir);
    await main(t.env(), t.deps);
    const out = t.calls.out.at(-1);
    assert.equal(out.verified, false);
    assert.deepEqual(out.reasons, ['existing test file changed: calc_test.go (+1 -1)']);
  } finally { t.cleanup(); }
});

// --- compiled ---

test('compiled (.go): correct fix -> verified; no worktree and no old-code run', async () => {
  const t = setup(GO, {}, { cause: GO_CAUSE, total: 2 });
  try {
    const sha = t.commit({ ...GO_FIX, 'add_test.go': '// CASE TestAddMore calc.go return a + b\n' });
    await main(t.env(), t.deps);
    const out = t.calls.out.at(-1);
    assert.equal(out.verified, true, JSON.stringify(out));
    assert.equal(t.remoteHead('nightly-fix/7'), sha);
    assert.deepEqual(t.worktreeCalls(), []);
    assert.equal(t.calls.suite.length, 1);
    assert.ok(out.checks.some((c) => /language mode: compiled/.test(c)));
    assert.ok(out.checks.some((c) => c.startsWith('language mode: compiled — old-code run skipped (') && c.includes('calc_test.go')), out.checks.join('\n'));
  } finally { t.cleanup(); }
});

test('no test source files involved: language-mode line says "not determined", not "compiled"', async () => {
  const t = setup(PY);
  try {
    t.commit({ ...PY_FIX });
    await main(t.env({ OC_PARAM_NIGHTLY_TEST_COMMAND: `FAKE_FILE_STYLE=none ${t.test}` }), t.deps);
    const out = t.calls.out.at(-1);
    assert.ok(out.checks.includes('language mode: not determined (no test source files involved) — old-code run not needed; failure on the old code is the nightly baseline'), out.checks.join('\n'));
    assert.ok(!out.checks.some((c) => /language mode: compiled/.test(c)));
  } finally { t.cleanup(); }
});

test('compiled: junit marker but the fix run writes no XML -> exit 1 "no JUnit from fix run (build failed?)"', async () => {
  const t = setup(GO, {}, { cause: GO_CAUSE, total: 2 });
  try {
    t.commit(GO_FIX);
    const env = { OC_PARAM_NIGHTLY_TEST_COMMAND: `FAKE_NO_XML=1 ${t.test}` };
    const out = await rejected(t, /no JUnit from fix run \(build failed\?\)/, env);
    assert.deepEqual(out.reasons, ['no JUnit from fix run (build failed?)']);
  } finally { t.cleanup(); }
});

test('a new failure that passes on rerun is tolerated; one that fails again rejects', async () => {
  for (const [stateFile, ok] of [[true, true], [false, false]]) {
    const t = setup({ ...GO, 'flaky_test.go': '// CASE-FLAKY TestFlaky\n' }, {}, { cause: GO_CAUSE, total: 3 });
    try {
      t.commit(GO_FIX);
      const env = { OC_PARAM_NIGHTLY_TEST_COMMAND: stateFile ? `FAKE_FLAKE_STATE=${join(t.ws, 'flake')} ${t.test}` : t.test };
      if (ok) {
        await main(t.env(env), t.deps);
        assert.equal(t.calls.out.at(-1).verified, true);
        assert.equal(t.calls.suite.length, 2, 'fix run + rerun');
        assert.equal(t.calls.suite[1].junitDir, join(t.ws, '.nightly', 'junit-rerun'));
      } else {
        const out = await rejected(t, /new failure: flaky_test::TestFlaky/, env);
        assert.deepEqual(out.reasons, ['new failure: flaky_test::TestFlaky']);
      }
    } finally { t.cleanup(); }
  }
});

test('compiled: test command fails with no failing test in the XML -> exit 1', async () => {
  const t = setup(GO, {}, { cause: GO_CAUSE, total: 2 });
  try {
    t.commit(GO_FIX);
    await rejected(t, /test command failed without failing tests \(exit 3\)/, { OC_PARAM_NIGHTLY_TEST_COMMAND: `${t.test}; exit 3` });
  } finally { t.cleanup(); }
});

// --- diff rules (non-blocking: pushed, needs human) ---

test('weakening: editing an existing test line -> pushed, verified false, needs human', async () => {
  const t = setup(PY);
  try {
    const sha = t.commit({ ...PY_FIX, 'tests/test_calc.py': '# CASE test_add src/calc.py return a+\n# CASE test_sub src/calc.py def sub\n' });
    await main(t.env(), t.deps);
    const out = t.calls.out.at(-1);
    assert.equal(out.verified, false);
    assert.equal(out.needsHuman, true);
    assert.deepEqual(out.reasons, ['existing test file changed: tests/test_calc.py (+1 -1)']);
    assert.equal(t.remoteHead('nightly-fix/7'), sha);
  } finally { t.cleanup(); }
});

test('package.json changed -> pushed, needs human', async () => {
  const t = setup(GO, {}, { cause: GO_CAUSE, total: 2 });
  try {
    const sha = t.commit({ ...GO_FIX, 'package.json': '{"scripts":{}}\n' });
    await main(t.env(), t.deps);
    const out = t.calls.out.at(-1);
    assert.equal(out.verified, false);
    assert.equal(out.needsHuman, true);
    assert.deepEqual(out.reasons, ['protected file changed: package.json']);
    assert.equal(t.remoteHead('nightly-fix/7'), sha);
  } finally { t.cleanup(); }
});

test('a deleted test file -> exit 1 "fewer tests than baseline"', async () => {
  const t = setup(PY);
  try {
    t.commit({ ...PY_FIX, 'tests/test_other.py': null });
    const out = await rejected(t, /fewer tests than baseline/);
    assert.deepEqual(out.reasons, ['fewer tests than baseline: 2 < 3', 'test file deleted: tests/test_other.py']);
  } finally { t.cleanup(); }
});

for (const style of ['abs', 'dot', 'back']) {
  test(`JUnit file attribute (${style}) names a test file outside naming conventions`, async () => {
    const files = { 'src/calc.py': PY['src/calc.py'], 'checks/calc_check.py': '# CASE test_add src/calc.py return a+b\n' };
    const t = setup(files, {}, { cause: 'checks.calc_check::test_add', total: 1 });
    try {
      const sha = t.commit({ ...PY_FIX, 'checks/calc_check.py': files['checks/calc_check.py'] + '# note\n' });
      await main(t.env({ OC_PARAM_NIGHTLY_TEST_COMMAND: `FAKE_FILE_STYLE=${style} ${t.test}` }), t.deps);
      const out = t.calls.out.at(-1);
      assert.deepEqual(out.reasons, ['existing test file changed: checks/calc_check.py (+1 -0)']);
      assert.equal(out.verified, false);
      assert.ok(out.checks.some((c) => /language mode: interpreted/.test(c)), out.checks.join('\n'));
      assert.equal(t.remoteHead('nightly-fix/7'), sha);
    } finally { t.cleanup(); }
  });
}

test('verifyRelPath normalizes absolute, ./ and backslash paths', () => {
  const dirs = ['/w/repo', '/private/w/repo'];
  assert.equal(verifyRelPath('/w/repo/tests/a.py', dirs), 'tests/a.py');
  assert.equal(verifyRelPath('/private/w/repo/tests/a.py', dirs), 'tests/a.py');
  assert.equal(verifyRelPath('./tests/a.py', dirs), 'tests/a.py');
  assert.equal(verifyRelPath('tests\\sub\\a.py', dirs), 'tests/sub/a.py');
  assert.equal(verifyRelPath('.\\tests\\a.py', dirs), 'tests/a.py');
  assert.equal(verifyRelPath('tests/a.py', dirs), 'tests/a.py');
  assert.equal(verifyRelPath('/w/repository/x.py', dirs), '/w/repository/x.py');
});

// --- no JUnit ---

test('junit:false: cause command passes at SHA and fails on old code -> pushed, needs human', async () => {
  const t = setup(PY, { junit: false, tests: [], allFailing: [], total: 0, causeCommand: 'grep -q "a+b" src/calc.py' });
  try {
    const sha = t.commit({ ...PY_FIX, ...PY_NEW_TEST });
    await main(t.env(), t.deps);
    const out = t.calls.out.at(-1);
    assert.equal(out.verified, false);
    assert.equal(out.needsHuman, true);
    assert.deepEqual(out.reasons, []);
    assert.equal(t.remoteHead('nightly-fix/7'), sha);
    assert.ok(t.calls.suite.some((s) => s.dir.endsWith('wt-overlay') && s.test === t.marker.causeCommand));
    assertNoWorktrees(t);
  } finally { t.cleanup(); }
});

test('junit:false: cause command still fails at SHA -> exit 1', async () => {
  const t = setup(GO, { junit: false, tests: [], allFailing: [], total: 0, causeCommand: 'grep -q "a + b" calc.go' });
  try {
    t.commit({ 'calc.go': 'func Add(a, b int) int { return b - a }\n' });
    const out = await rejected(t, /cause command still fails/);
    assert.deepEqual(out.reasons, ['cause command still fails']);
  } finally { t.cleanup(); }
});

test('junit:false interpreted: cause command passes on old code -> exit 1', async () => {
  const t = setup(PY, { junit: false, tests: [], allFailing: [], total: 0, causeCommand: 'true' });
  try {
    t.commit({ ...PY_FIX, ...PY_NEW_TEST });
    await rejected(t, /cause command passes on old code/);
    assertNoWorktrees(t);
  } finally { t.cleanup(); }
});

// --- pinning, tree, hooks, push ---

test('a tracked-file change during a run -> exit 1', async () => {
  const t = setup(GO, {}, { cause: GO_CAUSE, total: 2 });
  try {
    t.commit(GO_FIX);
    await rejected(t, /tracked files changed during verification/, { OC_PARAM_NIGHTLY_TEST_COMMAND: `${t.test}; echo x >> calc.go` });
  } finally { t.cleanup(); }
});

test('HEAD moved during a run -> exit 1', async () => {
  const t = setup(GO, {}, { cause: GO_CAUSE, total: 2 });
  try {
    t.commit(GO_FIX);
    const cmd = `${t.test}; git -c user.name=t -c user.email=t@t commit -q --allow-empty -m sneaky`;
    await rejected(t, /tracked files changed during verification/, { OC_PARAM_NIGHTLY_TEST_COMMAND: cmd });
  } finally { t.cleanup(); }
});

test('git hooks in the repo are not run', async () => {
  const t = setup(PY);
  try {
    t.commit({ ...PY_FIX, ...PY_NEW_TEST });
    const ran = installHooks(t.dir, join(t.ws, 'hook-ran'));
    assert.equal(ran(), false);
    await main(t.env(), t.deps);
    assert.equal(t.calls.out.at(-1).verified, true);
    assert.ok(t.calls.git.some((g) => g.args.includes('push')));
    assert.ok(t.worktreeCalls().length > 0);
    assert.equal(ran(), false, 'a hook ran');
  } finally { t.cleanup(); }
});

test('untracked and ignored files are removed before the fix run', async () => {
  const t = setup({ ...GO, '.gitignore': 'build/\n' }, {}, { cause: GO_CAUSE, total: 2 });
  try {
    t.commit(GO_FIX);
    writeFileSync(join(t.dir, 'stray.go'), '// CASE TestStray calc.go nope\n');
    mkdirSync(join(t.dir, 'build'));
    writeFileSync(join(t.dir, 'build', 'x'), 'x');
    await main(t.env(), t.deps);
    assert.equal(t.calls.out.at(-1).verified, true);
    assert.equal(existsSync(join(t.dir, 'stray.go')), false);
    assert.equal(existsSync(join(t.dir, 'build')), false);
  } finally { t.cleanup(); }
});

test('no fix commit (HEAD is base) -> exit 1, nothing run', async () => {
  const t = setup(GO, {}, { cause: GO_CAUSE });
  try {
    await rejected(t, /no fix commit/);
    assert.equal(t.calls.suite.length, 0);
  } finally { t.cleanup(); }
});

test('uncommitted tracked change -> exit 1, nothing run', async () => {
  const t = setup(GO, {}, { cause: GO_CAUSE });
  try {
    t.commit(GO_FIX);
    writeFileSync(join(t.dir, 'calc.go'), 'changed\n');
    await rejected(t, /uncommitted changes/);
    assert.equal(t.calls.suite.length, 0);
  } finally { t.cleanup(); }
});

test('HEAD not descending from base -> exit 1, nothing run', async () => {
  const t = setup(GO, {}, { cause: GO_CAUSE });
  try {
    tgit(['checkout', '-q', '--orphan', 'other'], t.dir);
    t.commit(GO_FIX, 'orphan');
    await rejected(t, /does not descend from base/);
    assert.equal(t.calls.suite.length, 0);
  } finally { t.cleanup(); }
});

for (const [label, extra, re] of [
  ['BASE differs from the marker sha', { BASE: 'f'.repeat(40) }, /BASE .* does not match the marker/],
  ['BRANCH does not match the issue', { BRANCH: 'nightly-fix/8' }, /BRANCH/],
  ['no marker', { ISSUE_BODY: 'text' }, /no baseline marker/],
]) {
  test(`${label} -> exit 1, nothing run`, async () => {
    const t = setup(GO, {}, { cause: GO_CAUSE });
    try {
      t.commit(GO_FIX);
      await rejected(t, re, extra);
      assert.equal(t.calls.suite.length, 0);
    } finally { t.cleanup(); }
  });
}

test('junit marker with no cause tests -> exit 1', async () => {
  const t = setup(GO, { tests: [] }, { cause: GO_CAUSE });
  try {
    t.commit(GO_FIX);
    await rejected(t, /no cause tests/);
  } finally { t.cleanup(); }
});

test('fix branch created on origin meanwhile -> push refused, exit 1, branch untouched', async () => {
  const t = setup(GO, {}, { cause: GO_CAUSE, total: 2 });
  try {
    t.commit(GO_FIX);
    tgit(['push', '-q', 'origin', `${t.base}:refs/heads/nightly-fix/7`], t.dir);
    await assert.rejects(main(t.env(), t.deps), /push/);
    assert.equal(t.remoteHead('nightly-fix/7'), t.base);
    assert.equal(t.calls.out.at(-1).verified, false);
  } finally { t.cleanup(); }
});

test('commands: settings override the marker; cause command always from the marker; dirs under .nightly', async () => {
  const t = setup(GO, { junit: false, tests: [], allFailing: [], total: 0, setup: 'm-setup', test: 'm-test', causeCommand: 'm-cause' });
  try {
    t.commit(GO_FIX);
    const suite = [];
    const shs = [];
    const deps = {
      ...t.deps,
      runSuite: (a) => { suite.push(a); return { setupCode: 0, testCode: 0, cases: null, log: '' }; },
      sh: (cmd, o) => { shs.push([o.cwd, cmd]); return { code: 0, out: '' }; },
    };
    await main(t.env({ OC_PARAM_NIGHTLY_SETUP_COMMAND: 's-setup', OC_PARAM_NIGHTLY_TEST_COMMAND: 's-test' }), deps);
    assert.deepEqual(suite.map((s) => [s.dir, s.setup, s.test, s.junitDir]), [
      [t.dir, '', 's-test', join(t.ws, '.nightly', 'junit')],
      [t.dir, '', 'm-cause', join(t.ws, '.nightly', 'junit-cause')],
    ]);
    assert.deepEqual(shs, [[t.dir, 's-setup'], [t.dir, 's-setup']]);
    for (const s of suite) assert.ok(s.timeoutMs > 0);
    suite.length = 0;
    shs.length = 0;
    t.calls.out.length = 0;
    tgit(['push', '-q', 'origin', ':refs/heads/nightly-fix/7'], t.dir);
    await main(t.env({ OC_PARAM_NIGHTLY_SETUP_COMMAND: '  ', OC_PARAM_NIGHTLY_TEST_COMMAND: '' }), deps);
    assert.deepEqual(suite.map((s) => s.test), ['m-test', 'm-cause']);
    assert.deepEqual(shs.map((x) => x[1]), ['m-setup', 'm-setup']);
  } finally { t.cleanup(); }
});

// --- fix round 1 ---

const MIN = 60 * 1000;
const FIXTURE = { 'tests/fixtures/data.json': '{"x": 1}\n' };
const VACUOUS = { 'tests/test_vacuous.py': '# CASE test_vacuous src/calc.py def add\n' };

test('mode: a non-code fixture file under tests/ does not make an interpreted run compiled', async () => {
  const t = setup(PY);
  try {
    t.commit({ ...PY_FIX, ...VACUOUS, ...FIXTURE });
    const out = await rejected(t, /new test passes on old code/);
    assert.deepEqual(out.reasons, ['new test passes on old code: tests.test_vacuous::test_vacuous']);
    assert.ok(t.worktreeCalls().length > 0);
  } finally { t.cleanup(); }
});

test('mode: a .go fix with a fixture file stays compiled', async () => {
  const t = setup(GO, {}, { cause: GO_CAUSE, total: 2 });
  try {
    t.commit({ ...GO_FIX, 'testdata/fixtures/x.json': '{}\n', ...FIXTURE });
    await main(t.env(), t.deps);
    assert.equal(t.calls.out.at(-1).verified, true);
    assert.deepEqual(t.worktreeCalls(), []);
  } finally { t.cleanup(); }
});

test('mode: added snapshot, golden and cypress data files keep a .go fix compiled', async () => {
  const t = setup(GO, {}, { cause: GO_CAUSE, total: 2 });
  try {
    t.commit({ ...GO_FIX, '__snapshots__/calc.snap': 'x\n', 'out/help.golden': 'y\n', 'cypress/fixtures/u.json': '{}\n' });
    await main(t.env(), t.deps);
    assert.equal(t.calls.out.at(-1).verified, true);
    assert.deepEqual(t.worktreeCalls(), []);
  } finally { t.cleanup(); }
});

test('an edited existing snapshot or golden file -> pushed, needs human (test data is a test file)', async () => {
  const t = setup({ ...GO, '__snapshots__/calc.snap': 'old\n', 'testdata/help.golden': 'old\n' }, {}, { cause: GO_CAUSE, total: 2 });
  try {
    t.commit({ ...GO_FIX, '__snapshots__/calc.snap': 'new\n', 'testdata/help.golden': 'new\n' });
    await main(t.env(), t.deps);
    const out = t.calls.out.at(-1);
    assert.equal(out.verified, false);
    assert.equal(out.needsHuman, true);
    assert.deepEqual(out.reasons, [
      'existing test file changed: __snapshots__/calc.snap (+1 -1)',
      'existing test file changed: testdata/help.golden (+1 -1)',
    ]);
  } finally { t.cleanup(); }
});

test('mode: deleted or renamed compiled test files do not choose the mode', async () => {
  const t = setup({ ...PY, 'tests/old_test.go': '// old\n', 'tests/keep_test.go': '// keep\n' });
  try {
    t.commit({ ...PY_FIX, ...VACUOUS, 'tests/old_test.go': null, 'tests/keep_test.go': null, 'tests/kept_test.go': '// keep\n' });
    const out = await rejected(t, /new test passes on old code/);
    assert.deepEqual(out.reasons, [
      'new test passes on old code: tests.test_vacuous::test_vacuous',
      'test file renamed: tests/keep_test.go -> tests/kept_test.go',
      'test file deleted: tests/old_test.go',
    ]);
  } finally { t.cleanup(); }
});

test('mode: a JUnit-named test file with an unknown extension still counts', async () => {
  const files = { 'src/calc.py': PY['src/calc.py'], 'checks/calc.check': '# CASE test_add src/calc.py return a+b\n' };
  const t = setup(files, {}, { cause: 'checks.calc::test_add', total: 1 });
  try {
    t.commit({ ...PY_FIX, 'checks/calc.check': files['checks/calc.check'] + '# note\n' });
    await main(t.env(), t.deps);
    assert.deepEqual(t.worktreeCalls(), [], 'unknown extension named by JUnit -> compiled');
    assert.deepEqual(t.calls.out.at(-1).reasons, ['existing test file changed: checks/calc.check (+1 -0)']);
  } finally { t.cleanup(); }
});

test('verifyCommandPaths keeps code-file tokens of a cause command', () => {
  assert.deepEqual(verifyCommandPaths('python -m pytest "tests/test_a.py::test_x" ./tests/b_test.py -k "x or y"'), ['tests/b_test.py', 'tests/test_a.py']);
  assert.deepEqual(verifyCommandPaths('go test ./pkg/... -run TestAdd'), []);
  assert.deepEqual(verifyCommandPaths("npx jest 'src/a.test.ts' --config jest.config.json"), ['src/a.test.ts']);
  assert.deepEqual(verifyCommandPaths(''), []);
});

test('junit:false: the cause command names a .py file -> interpreted even with no test file touched', async () => {
  const t = setup(PY, { junit: false, tests: [], allFailing: [], total: 0, causeCommand: 'grep -q "a+b" src/calc.py' });
  try {
    t.commit(PY_FIX);
    await main(t.env(), t.deps);
    assert.equal(t.calls.out.at(-1).needsHuman, true);
    assert.ok(t.calls.suite.some((s) => s.dir.endsWith('wt-overlay')));
  } finally { t.cleanup(); }
});

test('junit:false: a cause command naming no file and no touched test -> compiled', async () => {
  const t = setup(PY, { junit: false, tests: [], allFailing: [], total: 0, causeCommand: 'true' });
  try {
    t.commit(PY_FIX);
    await main(t.env(), t.deps);
    assert.deepEqual(t.worktreeCalls(), []);
  } finally { t.cleanup(); }
});

// --- time budget ---

function clocked(t, advance) {
  let now = 0;
  const timeouts = [];
  const deps = {
    ...t.deps,
    now: () => now,
    runSuite: (a) => { timeouts.push([a.dir, a.timeoutMs]); const r = runSuite(a); now += advance(a); return r; },
  };
  return { deps, timeouts };
}

test('budget: each command gets min(55 min, remaining of 235 min)', async () => {
  const t = setup(PY);
  try {
    t.commit({ ...PY_FIX, ...PY_NEW_TEST });
    const { deps, timeouts } = clocked(t, (a) => (a.dir === t.dir ? 200 * MIN : 10 * MIN));
    await main(t.env(), deps);
    assert.equal(t.calls.out.at(-1).verified, true);
    assert.deepEqual(timeouts.map((x) => x[1]), [55 * MIN, 35 * MIN, 25 * MIN]);
  } finally { t.cleanup(); }
});

test('budget: exhausted mid-run -> exit 1 "verification time budget exhausted", no push, worktrees removed', async () => {
  const t = setup(PY);
  try {
    t.commit({ ...PY_FIX, ...PY_NEW_TEST });
    const { deps, timeouts } = clocked(t, (a) => (a.dir === t.dir ? 200 * MIN : 40 * MIN));
    await assert.rejects(main(t.env(), deps), /verification time budget exhausted/);
    assert.equal(t.remoteHead('nightly-fix/7'), null);
    assert.deepEqual(t.calls.out.at(-1), { verified: false, reasons: ['verification time budget exhausted'] });
    assert.equal(timeouts.length, 2, 'no command starts after the budget is gone');
    assertNoWorktrees(t);
  } finally { t.cleanup(); }
});

test('budget: a last command that ends past the deadline still rejects', async () => {
  const t = setup(GO, {}, { cause: GO_CAUSE, total: 2 });
  try {
    t.commit(GO_FIX);
    const { deps } = clocked(t, () => 236 * MIN);
    await assert.rejects(main(t.env(), deps), /verification time budget exhausted/);
    assert.equal(t.remoteHead('nightly-fix/7'), null);
  } finally { t.cleanup(); }
});

test('budget: setup commands run through sh with the same per-command limit', async () => {
  const t = setup(GO, { setup: 'true' }, { cause: GO_CAUSE, total: 2 });
  try {
    t.commit(GO_FIX);
    await main(t.env(), t.deps);
    assert.equal(t.calls.out.at(-1).verified, true);
    assert.deepEqual(t.calls.sh.map((x) => [x.cmd, x.cwd, x.timeoutMs]), [['true', t.dir, 55 * MIN]]);
    assert.equal(t.calls.suite[0].setup, '');
  } finally { t.cleanup(); }
});

test('setup failure at the fix commit -> exit 1 "setup command failed on the fix commit (exit 5)"', async () => {
  const t = setup(GO, { setup: 'exit 5' }, { cause: GO_CAUSE, total: 2 });
  try {
    t.commit(GO_FIX);
    const out = await rejected(t, /setup command failed on the fix commit \(exit 5\)/);
    assert.equal(t.calls.suite.length, 0);
    assert.deepEqual(out.reasons, ['setup command failed on the fix commit (exit 5)']);
  } finally { t.cleanup(); }
});

test('junit:false: setup failure at the fix commit -> exit 1 with the setup reason', async () => {
  const t = setup(GO, { junit: false, tests: [], allFailing: [], total: 0, setup: 'exit 6', causeCommand: 'true' }, { cause: GO_CAUSE, total: 2 });
  try {
    t.commit(GO_FIX);
    const out = await rejected(t, /setup command failed on the fix commit \(exit 6\)/);
    assert.deepEqual(out.reasons, ['setup command failed on the fix commit (exit 6)']);
  } finally { t.cleanup(); }
});

// --- truncated markers (fail closed) ---

const OTHER = { 'other_test.go': '// CASE TestOther calc.go not-in-the-code\n' };

test('allFailingTruncated: a pre-existing failure the marker no longer lists counts as new', async () => {
  const allFailing = [GO_CAUSE, 'other_test::TestOther'];
  const t1 = setup({ ...GO, ...OTHER }, { allFailing }, { cause: GO_CAUSE, total: 3 });
  try {
    t1.commit(GO_FIX);
    await main(t1.env(), t1.deps);
    assert.equal(t1.calls.out.at(-1).verified, true, 'listed in allFailing: tolerated');
  } finally { t1.cleanup(); }
  const t2 = setup({ ...GO, ...OTHER }, { allFailing, allFailingTruncated: true }, { cause: GO_CAUSE, total: 3 });
  try {
    t2.commit(GO_FIX);
    const out = await rejected(t2, /new failure: other_test::TestOther/);
    assert.deepEqual(out.reasons, ['new failure: other_test::TestOther']);
  } finally { t2.cleanup(); }
});

test('testsTruncated: a correct fix is pushed but never verified', async () => {
  const t = setup(GO, { allFailing: [], allFailingTruncated: true, testsTruncated: true }, { cause: GO_CAUSE, total: 2 });
  try {
    const sha = t.commit(GO_FIX);
    await main(t.env(), t.deps);
    const out = t.calls.out.at(-1);
    assert.equal(out.verified, false);
    assert.equal(out.needsHuman, true);
    assert.deepEqual(out.reasons, ['cause test list truncated in marker']);
    assert.equal(t.remoteHead('nightly-fix/7'), sha);
  } finally { t.cleanup(); }
});

// --- diff captured before any fix-controlled code runs ---

test('the diff is read right after pinning, before the first command runs', async () => {
  const t = setup(PY);
  try {
    t.commit({ ...PY_FIX, ...PY_NEW_TEST });
    await main(t.env(), t.deps);
    const ev = t.calls.events;
    const firstRun = ev.findIndex((e) => e === 'suite' || e === 'sh');
    const diffs = ev.map((e, i) => [e, i]).filter(([e]) => / diff /.test(` ${e} `));
    assert.equal(diffs.length, 2);
    for (const [, i] of diffs) assert.ok(i < firstRun, ev.join('\n'));
  } finally { t.cleanup(); }
});

test('a run that marks a test file binary in .git/info/attributes does not change the diff used', async () => {
  const t = setup(GO, {}, { cause: GO_CAUSE, total: 2 });
  try {
    t.commit({ ...GO_FIX, 'calc_test.go': GO['calc_test.go'] + '// note\n' });
    const cmd = `${t.test}; ec=$?; mkdir -p .git/info; echo 'calc_test.go -diff' >> .git/info/attributes; exit $ec`;
    await main(t.env({ OC_PARAM_NIGHTLY_TEST_COMMAND: cmd }), t.deps);
    assert.deepEqual(t.calls.out.at(-1).reasons, ['existing test file changed: calc_test.go (+1 -0)']);
  } finally { t.cleanup(); }
});

// --- push URL pinned at pin time ---

function otherBare(t) {
  const other = join(t.ws, 'other.git');
  tgit(['init', '-q', '--bare', other], t.ws);
  const head = (b) => tgit(['ls-remote', other, `refs/heads/${b}`], t.ws).trim() || null;
  return { other, head };
}

test('push URL: a run that rewrites remote.origin.url -> exit 1, nothing pushed to either remote', async () => {
  const t = setup(GO, {}, { cause: GO_CAUSE, total: 2 });
  try {
    t.commit(GO_FIX);
    const o = otherBare(t);
    const cmd = `${t.test}; ec=$?; git remote set-url origin ${JSON.stringify(o.other)}; exit $ec`;
    const out = await rejected(t, /git config changed during verification/, { OC_PARAM_NIGHTLY_TEST_COMMAND: cmd });
    assert.deepEqual(out.reasons, ['git config changed during verification']);
    assert.equal(o.head('nightly-fix/7'), null);
  } finally { t.cleanup(); }
});

test('push URL: the push goes to the literal pin-time URL, not the remote name', async () => {
  const t = setup(GO, {}, { cause: GO_CAUSE, total: 2 });
  try {
    t.commit(GO_FIX);
    await main(t.env(), t.deps);
    assert.equal(t.calls.out.at(-1).pushUrl, t.origin);
    assert.ok(t.calls.git.some((g) => g.args.includes('push') && g.args.includes(t.origin) && !g.args.includes('origin')));
  } finally { t.cleanup(); }
});

test('push URL: a run that adds url.*.insteadOf -> exit 1, nothing pushed anywhere', async () => {
  const t = setup(GO, {}, { cause: GO_CAUSE, total: 2 });
  try {
    t.commit(GO_FIX);
    const o = otherBare(t);
    const cmd = `${t.test}; ec=$?; git config ${JSON.stringify(`url.${o.other}.insteadOf`)} ${JSON.stringify(t.origin)}; git config ${JSON.stringify(`url.${o.other}.pushInsteadOf`)} ${JSON.stringify(t.origin)}; exit $ec`;
    const out = await rejected(t, /git config changed during verification/, { OC_PARAM_NIGHTLY_TEST_COMMAND: cmd });
    assert.deepEqual(out.reasons, ['git config changed during verification']);
    assert.equal(o.head('nightly-fix/7'), null);
  } finally { t.cleanup(); }
});

test('push URL never appears in logs, reasons or checks, even when the push fails', async () => {
  const t = setup(GO, {}, { cause: GO_CAUSE, total: 2 });
  const logged = [];
  const orig = { log: console.log, error: console.error };
  try {
    t.commit(GO_FIX);
    tgit(['push', '-q', 'origin', `${t.base}:refs/heads/nightly-fix/7`], t.dir);
    console.log = (...a) => logged.push(a.join(' '));
    console.error = (...a) => logged.push(a.join(' '));
    let err;
    try { await main(t.env(), t.deps); } catch (e) { err = e; }
    console.log = orig.log;
    console.error = orig.error;
    assert.ok(err, 'push must fail');
    const out = t.calls.out.at(-1);
    assert.equal(out.verified, false);
    for (const text of [...logged, err.message, String(err.stack), JSON.stringify(out.reasons), JSON.stringify(out.checks || [])]) {
      assert.equal(text.includes(t.origin), false, text);
    }
  } finally { console.log = orig.log; console.error = orig.error; t.cleanup(); }
});

test('push URL is not logged on success either', async () => {
  const t = setup(GO, {}, { cause: GO_CAUSE, total: 2 });
  const logged = [];
  const orig = console.log;
  try {
    t.commit(GO_FIX);
    console.log = (...a) => logged.push(a.join(' '));
    await main(t.env(), t.deps);
    console.log = orig;
    const out = t.calls.out.at(-1);
    assert.equal(out.pushUrl, t.origin);
    for (const text of [...logged, JSON.stringify(out.checks), JSON.stringify(out.reasons)]) assert.equal(text.includes(t.origin), false, text);
  } finally { console.log = orig; t.cleanup(); }
});

// --- fix round 2: userinfo stripped from the output URL ---

test('verifyPublicUrl strips userinfo from http(s) URLs and keeps scp-style and paths', () => {
  assert.equal(verifyPublicUrl('https://x-access-token:SECRET@github.com/o/r.git'), 'https://github.com/o/r.git');
  assert.equal(verifyPublicUrl('http://user@host:8080/o/r.git'), 'http://host:8080/o/r.git');
  assert.equal(verifyPublicUrl('https://github.com/o/r.git'), 'https://github.com/o/r.git');
  assert.equal(verifyPublicUrl('git@github.com:o/r.git'), 'git@github.com:o/r.git');
  assert.equal(verifyPublicUrl('ssh://git:pw@host/o/r.git'), 'ssh://git@host/o/r.git');
  assert.equal(verifyPublicUrl('/tmp/origin.git'), '/tmp/origin.git');
  assert.throws(() => verifyPublicUrl('https://[bad'), /push URL/);
});

test('a token in the remote URL: pushed to the literal URL, output pushUrl has no userinfo, nothing logs it', async () => {
  const t = setup(GO, {}, { cause: GO_CAUSE, total: 2 });
  const secretUrl = 'https://x-access-token:SECRET@git.example.com/o/repo.git';
  const logged = [];
  const orig = console.log;
  try {
    const sha = t.commit(GO_FIX);
    const pushes = [];
    const deps = {
      ...t.deps,
      git: (args, cwd) => {
        const i = args.indexOf('get-url');
        if (i >= 0) return `${secretUrl}\n`;
        if (args.includes('push')) {
          pushes.push(args);
          return git(args.map((a) => (a === secretUrl ? t.origin : a)), cwd);
        }
        return t.deps.git(args, cwd);
      },
    };
    console.log = (...a) => logged.push(a.join(' '));
    await main(t.env(), deps);
    console.log = orig;
    assert.equal(pushes.length, 1);
    assert.ok(pushes[0].includes(secretUrl), 'push goes to the literal pinned URL');
    assert.equal(t.remoteHead('nightly-fix/7'), sha);
    const out = t.calls.out.at(-1);
    assert.equal(out.pushUrl, 'https://git.example.com/o/repo.git');
    const json = JSON.stringify(out);
    assert.equal(json.includes('SECRET'), false);
    assert.equal(out.pushUrl.includes('@'), false);
    for (const line of logged) assert.equal(line.includes('SECRET') || line.includes('git.example.com'), false, line);
  } finally { console.log = orig; t.cleanup(); }
});

test('a failed push to a token URL leaks neither the literal nor the stripped URL', async () => {
  const t = setup(GO, {}, { cause: GO_CAUSE, total: 2 });
  const secretUrl = 'https://x-access-token:SECRET@git.example.com/o/repo.git';
  try {
    t.commit(GO_FIX);
    const deps = {
      ...t.deps,
      git: (args, cwd) => {
        if (args.includes('get-url')) return `${secretUrl}\n`;
        if (args.includes('push')) throw new Error(`git ${args.join(' ')} failed: To https://git.example.com/o/repo.git ! [rejected]`);
        return t.deps.git(args, cwd);
      },
    };
    const err = await main(t.env(), deps).then(() => null, (e) => e);
    assert.ok(err);
    for (const text of [err.message, String(err.stack), JSON.stringify(t.calls.out.at(-1))]) {
      assert.equal(text.includes('SECRET') || text.includes('git.example.com'), false, text);
    }
  } finally { t.cleanup(); }
});

// --- fix round 3: mode from cause files first; mixed languages need a human; config tamper ---

const GO_HELPER = { 'tests/helper_test.go': '// helper\n' };
const MIXED_PY = 'mixed-language test files: tests/helper_test.go, tests/test_calc.py';

test('mixed: cause .py + vacuous new .py + added _test.go -> interpreted, red check rejects, mixed reason listed', async () => {
  const t = setup(PY);
  try {
    t.commit({ ...PY_FIX, ...VACUOUS, ...GO_HELPER });
    const out = await rejected(t, /new test passes on old code/);
    assert.deepEqual(out.reasons, [
      'new test passes on old code: tests.test_vacuous::test_vacuous',
      `${MIXED_PY}, tests/test_vacuous.py`,
    ]);
    assert.ok(t.worktreeCalls().length > 0);
  } finally { t.cleanup(); }
});

test('mixed: cause .py + real new .py + added _test.go -> red check passes, pushed, needs human', async () => {
  const t = setup(PY);
  try {
    const sha = t.commit({ ...PY_FIX, ...PY_NEW_TEST, ...GO_HELPER });
    await main(t.env(), t.deps);
    const out = t.calls.out.at(-1);
    assert.equal(out.verified, false);
    assert.equal(out.needsHuman, true);
    assert.deepEqual(out.reasons, [`${MIXED_PY}, tests/test_more.py`]);
    assert.ok(out.checks.some((c) => /language mode: interpreted — old-code red check passed/.test(c)));
    assert.equal(t.remoteHead('nightly-fix/7'), sha);
  } finally { t.cleanup(); }
});

test('mixed: no JUnit file attributes + vacuous new .py + added _test.go -> interpreted, red check rejects', async () => {
  const t = setup(PY);
  try {
    t.commit({ ...PY_FIX, ...VACUOUS, ...GO_HELPER });
    const out = await rejected(t, /new test passes on old code/, { OC_PARAM_NIGHTLY_TEST_COMMAND: `FAKE_FILE_STYLE=none ${t.test}` });
    assert.deepEqual(out.reasons, [
      'new test passes on old code: tests.test_vacuous::test_vacuous',
      'mixed-language test files: tests/helper_test.go, tests/test_vacuous.py',
    ]);
  } finally { t.cleanup(); }
});

test('no JUnit file attributes + only compiled test sources touched -> compiled', async () => {
  const t = setup(GO, {}, { cause: GO_CAUSE, total: 2 });
  try {
    t.commit({ ...GO_FIX, 'add_test.go': '// CASE TestAddMore calc.go return a + b\n' });
    await main(t.env({ OC_PARAM_NIGHTLY_TEST_COMMAND: `FAKE_FILE_STYLE=none ${t.test}` }), t.deps);
    assert.equal(t.calls.out.at(-1).verified, true);
    assert.deepEqual(t.worktreeCalls(), []);
  } finally { t.cleanup(); }
});

test('mixed: cause .go + added .py test -> compiled (no old-code run), pushed, needs human', async () => {
  const t = setup(GO, {}, { cause: GO_CAUSE, total: 2 });
  try {
    const sha = t.commit({ ...GO_FIX, 'extra_test.py': '# CASE test_extra calc.go func Add\n' });
    await main(t.env(), t.deps);
    const out = t.calls.out.at(-1);
    assert.deepEqual(t.worktreeCalls(), []);
    assert.equal(out.verified, false);
    assert.equal(out.needsHuman, true);
    assert.deepEqual(out.reasons, ['mixed-language test files: calc_test.go, extra_test.py']);
    assert.equal(t.remoteHead('nightly-fix/7'), sha);
  } finally { t.cleanup(); }
});

test('Go-only fix: compiled, no mixed reason', async () => {
  const t = setup(GO, {}, { cause: GO_CAUSE, total: 2 });
  try {
    t.commit({ ...GO_FIX, 'add_test.go': '// CASE TestAddMore calc.go return a + b\n' });
    await main(t.env(), t.deps);
    const out = t.calls.out.at(-1);
    assert.equal(out.verified, true);
    assert.deepEqual(out.reasons, []);
  } finally { t.cleanup(); }
});

for (const [label, cmdTail] of [
  ['sets http.proxy', 'git config http.proxy http://127.0.0.1:9'],
  ['sets core.sshCommand', "git config core.sshCommand 'ssh -o ProxyCommand=nc'"],
  ['sets credential.helper', "git config credential.helper '!echo x'"],
  ['adds an include.path', 'git config include.path /dev/null'],
]) {
  test(`config tamper: a run that ${label} -> exit 1 "git config changed during verification"`, async () => {
    const t = setup(GO, {}, { cause: GO_CAUSE, total: 2 });
    try {
      t.commit(GO_FIX);
      const cmd = `${t.test}; ec=$?; ${cmdTail}; exit $ec`;
      const out = await rejected(t, /git config changed during verification/, { OC_PARAM_NIGHTLY_TEST_COMMAND: cmd });
      assert.deepEqual(out.reasons, ['git config changed during verification']);
    } finally { t.cleanup(); }
  });
}

// --- fix round 4: only network-affecting config rejects; other repo-local changes are restored ---

const RESTORED = 'restored repo-local git config changed by setup/test (non-network keys)';

function localConfig(t, key) {
  try { return tgit(['config', '--local', '--get', key], t.dir).trim(); } catch { return null; }
}

test('husky-style setup (core.hooksPath + .husky/_ hooks) -> not rejected, config restored, pushed, pre-push hook not run', async () => {
  const t = setup(GO, {}, { cause: GO_CAUSE, total: 2 });
  try {
    const sha = t.commit(GO_FIX);
    const marker = join(t.ws, 'husky-hook-ran');
    const hook = `#!/bin/sh\ntouch ${marker}\n`;
    const husky = `mkdir -p .husky/_ && printf '*\\n' > .husky/_/.gitignore && for h in pre-push pre-commit post-checkout reference-transaction; do printf ${JSON.stringify(hook)} > .husky/_/$h; chmod +x .husky/_/$h; done && git config core.hooksPath .husky/_`;
    await main(t.env({ OC_PARAM_NIGHTLY_SETUP_COMMAND: husky }), t.deps);
    const out = t.calls.out.at(-1);
    assert.equal(out.verified, true, JSON.stringify(out));
    assert.ok(out.checks.includes(RESTORED), out.checks.join('\n'));
    assert.equal(t.remoteHead('nightly-fix/7'), sha);
    assert.equal(existsSync(join(t.dir, '.husky', '_', 'pre-push')), true, 'the husky hook was written');
    assert.equal(existsSync(marker), false, 'a husky hook ran');
    assert.equal(localConfig(t, 'core.hooksPath'), null, 'repo-local config restored');
    await assertHead({ AGENT_WORKSPACE_PATH: t.ws, REPO_FULL_NAME: 'o/repo', BRANCH: 'nightly-fix/7', SHA: sha, PUSH_URL: out.pushUrl }, { git, outputJson: () => {} });
    assert.equal(existsSync(marker), false, 'a hook ran on assert-head ls-remote');
  } finally { t.cleanup(); }
});

test('a pre-push hook written to .git/hooks during a run does not execute on the verify push', async () => {
  const t = setup(GO, {}, { cause: GO_CAUSE, total: 2 });
  try {
    const sha = t.commit(GO_FIX);
    const marker = join(t.ws, 'pre-push-ran');
    const cmd = `${t.test}; ec=$?; printf ${JSON.stringify(`#!/bin/sh\ntouch ${marker}\n`)} > .git/hooks/pre-push; chmod +x .git/hooks/pre-push; exit $ec`;
    await main(t.env({ OC_PARAM_NIGHTLY_TEST_COMMAND: cmd }), t.deps);
    assert.equal(t.calls.out.at(-1).verified, true);
    assert.equal(existsSync(join(t.dir, '.git', 'hooks', 'pre-push')), true);
    assert.equal(t.remoteHead('nightly-fix/7'), sha);
    assert.equal(existsSync(marker), false, 'the pre-push hook ran');
  } finally { t.cleanup(); }
});

test('a run that sets submodule.foo.url -> restored, not rejected', async () => {
  const t = setup(GO, {}, { cause: GO_CAUSE, total: 2 });
  try {
    const sha = t.commit(GO_FIX);
    const cmd = `${t.test}; ec=$?; git config submodule.foo.url https://example.invalid/foo.git; git config user.name changed; exit $ec`;
    await main(t.env({ OC_PARAM_NIGHTLY_TEST_COMMAND: cmd }), t.deps);
    const out = t.calls.out.at(-1);
    assert.equal(out.verified, true, JSON.stringify(out));
    assert.ok(out.checks.includes(RESTORED));
    assert.equal(t.remoteHead('nightly-fix/7'), sha);
    assert.equal(localConfig(t, 'submodule.foo.url'), null);
    assert.equal(localConfig(t, 'user.name'), null);
  } finally { t.cleanup(); }
});

test('no config change -> no restore line', async () => {
  const t = setup(GO, {}, { cause: GO_CAUSE, total: 2 });
  try {
    t.commit(GO_FIX);
    await main(t.env(), t.deps);
    assert.equal(t.calls.out.at(-1).checks.includes(RESTORED), false);
  } finally { t.cleanup(); }
});

test('a run that adds url.X.insteadOf in the global config -> exit 1, nothing pushed anywhere', async () => {
  const t = setup(GO, {}, { cause: GO_CAUSE, total: 2 });
  const saved = process.env.GIT_CONFIG_GLOBAL;
  try {
    t.commit(GO_FIX);
    const o = otherBare(t);
    const global = join(t.ws, 'global.gitconfig');
    writeFileSync(global, '');
    process.env.GIT_CONFIG_GLOBAL = global;
    const cmd = `${t.test}; ec=$?; git config --global ${JSON.stringify(`url.${o.other}.pushInsteadOf`)} ${JSON.stringify(t.origin)}; exit $ec`;
    const out = await rejected(t, /git config changed during verification/, { OC_PARAM_NIGHTLY_TEST_COMMAND: cmd });
    assert.deepEqual(out.reasons, ['git config changed during verification']);
    assert.match(readFileSync(global, 'utf8'), /pushInsteadOf/i, 'the global rule was written');
    assert.equal(o.head('nightly-fix/7'), null);
  } finally {
    if (saved === undefined) delete process.env.GIT_CONFIG_GLOBAL; else process.env.GIT_CONFIG_GLOBAL = saved;
    t.cleanup();
  }
});
