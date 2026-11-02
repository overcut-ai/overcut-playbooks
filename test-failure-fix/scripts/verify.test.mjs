import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { git, runSuite } from '../../scripts/lib/nightly/exec.mjs';
import { makeRepo, issueBody, installHooks, tgit } from './fixtures/repo.mjs';
import { main, verifyRelPath } from './verify.mjs';

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
  const calls = { git: [], suite: [], out: [] };
  const deps = {
    git: (args, cwd) => { calls.git.push({ args, cwd }); return git(args, cwd); },
    runSuite: (a) => { calls.suite.push(a); return runSuite(a); },
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
    assert.deepEqual(out.reasons, ['fewer tests than baseline: 2 < 3']);
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
    const deps = { ...t.deps, runSuite: (a) => { suite.push(a); return { setupCode: 0, testCode: 0, cases: null, log: '' }; } };
    await main(t.env({ OC_PARAM_NIGHTLY_SETUP_COMMAND: 's-setup', OC_PARAM_NIGHTLY_TEST_COMMAND: 's-test' }), deps);
    assert.deepEqual(suite.map((s) => [s.dir, s.setup, s.test, s.junitDir]), [
      [t.dir, 's-setup', 's-test', join(t.ws, '.nightly', 'junit')],
      [t.dir, 's-setup', 'm-cause', join(t.ws, '.nightly', 'junit-cause')],
    ]);
    for (const s of suite) assert.ok(s.timeoutMs > 0);
    suite.length = 0;
    t.calls.out.length = 0;
    tgit(['push', '-q', 'origin', ':refs/heads/nightly-fix/7'], t.dir);
    await main(t.env({ OC_PARAM_NIGHTLY_SETUP_COMMAND: '  ', OC_PARAM_NIGHTLY_TEST_COMMAND: '' }), deps);
    assert.deepEqual(suite.map((s) => [s.setup, s.test]), [['m-setup', 'm-test'], ['m-setup', 'm-cause']]);
  } finally { t.cleanup(); }
});
