import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatMarker } from '../../scripts/lib/nightly/marker.mjs';
import { main } from './rerun.mjs';

const SHA = 'c'.repeat(40);

function workspace() {
  const ws = mkdtempSync(join(tmpdir(), 'rerun-'));
  mkdirSync(join(ws, 'repo', '.git'), { recursive: true });
  return ws;
}

function body(over = {}) {
  const m = formatMarker({
    sha: SHA, junit: true, tests: ['s::a', 's::b'], allFailing: ['s::a', 's::b', 's::z'],
    total: 10, skipped: 1, setup: 'npm ci', test: 'npm test', causeCommand: 'npx jest s', greenNights: 0, ...over,
  });
  return `Some issue text\n\n${m}\n`;
}

function harness(suiteResult, { gitFail } = {}) {
  const calls = { suite: [], git: [], out: [] };
  const deps = {
    runSuite: (args) => { calls.suite.push(args); return suiteResult; },
    git: (args, cwd) => {
      calls.git.push({ args, cwd });
      if (gitFail && args[0] === gitFail) throw new Error(`git ${args.join(' ')} failed: nope`);
      return '';
    },
    outputJson: (o) => calls.out.push(o),
  };
  return { calls, deps };
}

const env = (ws, issueBody) => ({ AGENT_WORKSPACE_PATH: ws, REPO_FULL_NAME: 'o/repo', ISSUE_BODY: issueBody });
const rerun = (ws) => JSON.parse(readFileSync(join(ws, '.nightly', 'rerun.json'), 'utf8'));
const tc = (id, status) => ({ id, name: id, classname: 's', file: null, status });

for (const [label, b] of [['no marker', 'just text'], ['empty body', ''], ['undefined body', undefined]]) {
  test(`${label}: rejects with "no baseline marker" and runs nothing`, async () => {
    const ws = workspace();
    try {
      const { calls, deps } = harness({});
      await assert.rejects(main(env(ws, b), deps), /no baseline marker/);
      assert.equal(calls.git.length, 0);
      assert.equal(calls.suite.length, 0);
      assert.equal(existsSync(join(ws, '.nightly', 'rerun.json')), false);
    } finally { rmSync(ws, { recursive: true, force: true }); }
  });
}

test('checks out the baseline sha (fetch, then detached checkout) in the repo dir', async () => {
  const ws = workspace();
  try {
    const { calls, deps } = harness({ setupCode: 0, testCode: 1, cases: [tc('s::a', 'failed'), tc('s::b', 'failed')], log: '' });
    await main(env(ws, body()), deps);
    assert.deepEqual(calls.git.map((g) => g.args), [['fetch', 'origin', SHA], ['checkout', '--detach', SHA]]);
    for (const g of calls.git) assert.equal(g.cwd, join(ws, 'repo'));
  } finally { rmSync(ws, { recursive: true, force: true }); }
});

for (const failing of ['fetch', 'checkout']) {
  test(`${failing} failure: rejects with "cannot check out baseline <sha>" and runs nothing`, async () => {
    const ws = workspace();
    try {
      const { calls, deps } = harness({}, { gitFail: failing });
      await assert.rejects(main(env(ws, body()), deps), new RegExp(`cannot check out baseline ${SHA}`));
      assert.equal(calls.suite.length, 0);
    } finally { rmSync(ws, { recursive: true, force: true }); }
  });
}

test('junit: all marker tests still failing; marker commands and .nightly/junit used', async () => {
  const ws = workspace();
  try {
    const cases = [tc('s::a', 'failed'), tc('s::b', 'failed'), tc('s::c', 'passed')];
    const { calls, deps } = harness({ setupCode: 0, testCode: 1, cases, log: 'LOG' });
    await main(env(ws, body()), deps);
    assert.equal(calls.suite.length, 1);
    assert.equal(calls.suite[0].dir, join(ws, 'repo'));
    assert.equal(calls.suite[0].setup, 'npm ci');
    assert.equal(calls.suite[0].test, 'npm test');
    assert.equal(calls.suite[0].junitDir, join(ws, '.nightly', 'junit'));
    assert.ok(calls.suite[0].timeoutMs > 0);
    const r = rerun(ws);
    assert.equal(r.junit, true);
    assert.deepEqual(r.stillFailing, ['s::a', 's::b']);
    assert.deepEqual(r.nowPassing, []);
    assert.deepEqual(r.cases, cases);
    assert.equal(r.rerunError, undefined);
    assert.deepEqual(calls.out, [{ junit: true, stillFailing: 2, nowPassing: 0 }]);
  } finally { rmSync(ws, { recursive: true, force: true }); }
});

test('junit: one test now passing', async () => {
  const ws = workspace();
  try {
    const { calls, deps } = harness({ setupCode: 0, testCode: 1, cases: [tc('s::a', 'failed'), tc('s::b', 'passed')], log: '' });
    await main(env(ws, body()), deps);
    const r = rerun(ws);
    assert.deepEqual(r.stillFailing, ['s::a']);
    assert.deepEqual(r.nowPassing, ['s::b']);
    assert.deepEqual(calls.out, [{ junit: true, stillFailing: 1, nowPassing: 1 }]);
  } finally { rmSync(ws, { recursive: true, force: true }); }
});

test('junit: all now passing (exit 0)', async () => {
  const ws = workspace();
  try {
    const { calls, deps } = harness({ setupCode: 0, testCode: 0, cases: [tc('s::a', 'passed'), tc('s::b', 'passed')], log: '' });
    await main(env(ws, body()), deps);
    const r = rerun(ws);
    assert.deepEqual(r.stillFailing, []);
    assert.deepEqual(r.nowPassing, ['s::a', 's::b']);
    assert.deepEqual(calls.out, [{ junit: true, stillFailing: 0, nowPassing: 2 }]);
  } finally { rmSync(ws, { recursive: true, force: true }); }
});

test('junit: skipped and absent marker tests count as still failing; failed wins over passed duplicates', async () => {
  const ws = workspace();
  try {
    const cases = [tc('s::a', 'skipped'), tc('s::c', 'passed'), tc('s::d', 'passed'), tc('s::d', 'failed'), tc('s::e', 'passed')];
    const { deps } = harness({ setupCode: 0, testCode: 1, cases, log: '' });
    await main(env(ws, body({ tests: ['s::a', 's::b', 's::d', 's::e'] })), deps);
    const r = rerun(ws);
    assert.deepEqual(r.stillFailing, ['s::a', 's::b', 's::d']);
    assert.deepEqual(r.nowPassing, ['s::e']);
  } finally { rmSync(ws, { recursive: true, force: true }); }
});

for (const [label, res] of [
  ['cases null (no XML or timeout)', { setupCode: 0, testCode: 124, cases: null, log: '' }],
  ['non-zero exit with no failing case', { setupCode: 0, testCode: 2, cases: [tc('s::a', 'passed'), tc('s::b', 'passed')], log: '' }],
]) {
  test(`junit: ${label} -> rerunError, all marker tests still failing`, async () => {
    const ws = workspace();
    try {
      const { calls, deps } = harness(res);
      await main(env(ws, body()), deps);
      const r = rerun(ws);
      assert.equal(r.junit, true);
      assert.equal(r.rerunError, `no per-test results from rerun (exit ${res.testCode})`);
      assert.deepEqual(r.stillFailing, ['s::a', 's::b']);
      assert.deepEqual(r.nowPassing, []);
      assert.equal(r.cases, null);
      assert.deepEqual(calls.out, [{ junit: true, stillFailing: 2, nowPassing: 0, rerunError: r.rerunError }]);
    } finally { rmSync(ws, { recursive: true, force: true }); }
  });
}

test('no junit: runs setup then causeCommand; still failing on non-zero exit', async () => {
  const ws = workspace();
  try {
    const { calls, deps } = harness({ setupCode: 0, testCode: 1, cases: [tc('x', 'passed')], log: '' });
    await main(env(ws, body({ junit: false, tests: [], causeCommand: 'go test ./...' })), deps);
    assert.equal(calls.suite[0].setup, 'npm ci');
    assert.equal(calls.suite[0].test, 'go test ./...');
    const r = rerun(ws);
    assert.equal(r.junit, false);
    assert.equal(r.testCode, 1);
    assert.equal(r.stillFailing, true);
    assert.equal(r.nowPassing, false);
    assert.equal(r.cases, null);
    assert.deepEqual(calls.out, [{ junit: false, stillFailing: true, nowPassing: false }]);
  } finally { rmSync(ws, { recursive: true, force: true }); }
});

test('no junit: now passing on exit 0', async () => {
  const ws = workspace();
  try {
    const { calls, deps } = harness({ setupCode: 0, testCode: 0, cases: null, log: '' });
    await main(env(ws, body({ junit: false, tests: [] })), deps);
    const r = rerun(ws);
    assert.equal(r.stillFailing, false);
    assert.equal(r.nowPassing, true);
    assert.deepEqual(calls.out, [{ junit: false, stillFailing: false, nowPassing: true }]);
  } finally { rmSync(ws, { recursive: true, force: true }); }
});

test('setup failure: setupFailed with code and log tail; resolves (exit 0)', async () => {
  const ws = workspace();
  try {
    const log = 'HEAD' + 'x'.repeat(100000) + 'TAIL';
    const { calls, deps } = harness({ setupCode: 3, testCode: null, cases: null, log });
    await main(env(ws, body()), deps);
    const r = rerun(ws);
    assert.equal(r.setupFailed, true);
    assert.equal(r.setupCode, 3);
    assert.match(r.log, /TAIL$/);
    assert.doesNotMatch(r.log, /HEAD/);
    assert.ok(r.log.length <= 20000);
    assert.deepEqual(r.stillFailing, ['s::a', 's::b']);
    assert.deepEqual(r.nowPassing, []);
    assert.equal(r.cases, null);
    assert.deepEqual(calls.out, [{ junit: true, stillFailing: 2, nowPassing: 0, setupFailed: true }]);
  } finally { rmSync(ws, { recursive: true, force: true }); }
});
