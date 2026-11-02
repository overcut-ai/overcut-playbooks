import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runSuite } from '../../scripts/lib/nightly/exec.mjs';
import { main } from './run-tests.mjs';

const SHA = 'a'.repeat(40);

function workspace({ commands } = {}) {
  const ws = mkdtempSync(join(tmpdir(), 'run-tests-'));
  mkdirSync(join(ws, 'repo', '.git'), { recursive: true });
  mkdirSync(join(ws, '.nightly'), { recursive: true });
  if (commands) writeFileSync(join(ws, '.nightly', 'commands.json'), JSON.stringify(commands));
  return ws;
}

function harness(suiteResult) {
  const calls = { suite: [], out: [] };
  const deps = {
    runSuite: (args) => { calls.suite.push(args); return suiteResult; },
    git: (args) => { assert.deepEqual(args, ['rev-parse', 'HEAD']); return `${SHA}\n`; },
    outputJson: (o) => calls.out.push(o),
  };
  return { calls, deps };
}

const env = (ws, extra = {}) => ({ AGENT_WORKSPACE_PATH: ws, REPO_FULL_NAME: 'o/repo', ...extra });
const results = (ws) => JSON.parse(readFileSync(join(ws, '.nightly', 'results.json'), 'utf8'));
const tc = (id, status) => ({ id, name: id, classname: 'c', file: null, status });

test('green: JUnit cases, no failures; commands from commands.json', async () => {
  const ws = workspace({ commands: { setup: 'npm ci', test: 'npm test' } });
  try {
    const { calls, deps } = harness({ setupCode: 0, testCode: 0, cases: [tc('a', 'passed'), tc('b', 'skipped')], log: 'L' });
    await main(env(ws), deps);
    assert.equal(calls.suite[0].dir, join(ws, 'repo'));
    assert.equal(calls.suite[0].setup, 'npm ci');
    assert.equal(calls.suite[0].test, 'npm test');
    assert.equal(calls.suite[0].junitDir, join(ws, '.nightly', 'junit'));
    const r = results(ws);
    assert.equal(r.status, 'green');
    assert.equal(r.sha, SHA);
    assert.equal(r.junit, true);
    assert.equal(r.testCode, 0);
    assert.equal(r.total, 2);
    assert.equal(r.skipped, 1);
    assert.deepEqual(r.failing, []);
    assert.equal(r.cases.length, 2);
    assert.equal(r.setup, 'npm ci');
    assert.equal(r.test, 'npm test');
    assert.equal(r.log, 'L');
    assert.deepEqual(calls.out, [{ status: 'green', total: 2, failing: 0 }]);
  } finally { rmSync(ws, { recursive: true, force: true }); }
});

test('red: failing JUnit cases; OC_PARAM settings override commands.json', async () => {
  const ws = workspace({ commands: { setup: 'x', test: 'y' } });
  try {
    const { calls, deps } = harness({ setupCode: 0, testCode: 1, cases: [tc('a', 'failed'), tc('b', 'passed')], log: '' });
    await main(env(ws, { OC_PARAM_NIGHTLY_SETUP_COMMAND: 'make deps', OC_PARAM_NIGHTLY_TEST_COMMAND: 'make test' }), deps);
    assert.equal(calls.suite[0].setup, 'make deps');
    assert.equal(calls.suite[0].test, 'make test');
    const r = results(ws);
    assert.equal(r.status, 'red');
    assert.deepEqual(r.failing, ['a']);
    assert.equal(r.setup, 'make deps');
    assert.equal(r.test, 'make test');
    assert.deepEqual(calls.out, [{ status: 'red', total: 2, failing: 1 }]);
  } finally { rmSync(ws, { recursive: true, force: true }); }
});

test('empty OC_PARAM values fall back to commands.json', async () => {
  const ws = workspace({ commands: { setup: '', test: 'pytest' } });
  try {
    const { calls, deps } = harness({ setupCode: 0, testCode: 0, cases: [tc('a', 'passed')], log: '' });
    await main(env(ws, { OC_PARAM_NIGHTLY_SETUP_COMMAND: '', OC_PARAM_NIGHTLY_TEST_COMMAND: '  ' }), deps);
    assert.equal(calls.suite[0].test, 'pytest');
    assert.equal(results(ws).setup, '');
  } finally { rmSync(ws, { recursive: true, force: true }); }
});

test('red without JUnit: cases null and non-zero exit', async () => {
  const ws = workspace({ commands: { setup: '', test: 'go test ./...' } });
  try {
    const { calls, deps } = harness({ setupCode: 0, testCode: 2, cases: null, log: 'boom' });
    await main(env(ws), deps);
    const r = results(ws);
    assert.equal(r.status, 'red');
    assert.equal(r.junit, false);
    assert.equal(r.testCode, 2);
    assert.equal(r.total, 0);
    assert.equal(r.skipped, 0);
    assert.deepEqual(r.failing, []);
    assert.equal(r.cases, null);
    assert.deepEqual(calls.out, [{ status: 'red', total: 0, failing: 0 }]);
  } finally { rmSync(ws, { recursive: true, force: true }); }
});

test('green without JUnit: cases null and exit 0', async () => {
  const ws = workspace({ commands: { setup: '', test: 't' } });
  try {
    const { deps } = harness({ setupCode: 0, testCode: 0, cases: null, log: '' });
    await main(env(ws), deps);
    assert.equal(results(ws).status, 'green');
    assert.equal(results(ws).junit, false);
  } finally { rmSync(ws, { recursive: true, force: true }); }
});

test('setup-failed: setup exits non-zero', async () => {
  const ws = workspace({ commands: { setup: 'docker compose up', test: 't' } });
  try {
    const { calls, deps } = harness({ setupCode: 3, testCode: null, cases: null, log: 'no docker' });
    await main(env(ws), deps);
    const r = results(ws);
    assert.equal(r.status, 'setup-failed');
    assert.equal(r.junit, false);
    assert.equal(r.testCode, null);
    assert.equal(r.log, 'no docker');
    assert.deepEqual(calls.out, [{ status: 'setup-failed', total: 0, failing: 0 }]);
  } finally { rmSync(ws, { recursive: true, force: true }); }
});

test('stale XML is never used: command writes none and exits 1 -> red, junit false', async () => {
  const ws = workspace({ commands: { setup: '', test: 'exit 1' } });
  try {
    const jd = join(ws, '.nightly', 'junit');
    mkdirSync(jd, { recursive: true });
    writeFileSync(join(jd, 'stale.xml'), '<testsuite><testcase classname="s" name="old"/></testsuite>');
    const out = [];
    await main(env(ws), { runSuite, git: () => SHA, outputJson: (o) => out.push(o) });
    const r = results(ws);
    assert.equal(r.status, 'red');
    assert.equal(r.junit, false);
    assert.equal(r.testCode, 1);
    assert.equal(r.cases, null);
    assert.equal(r.total, 0);
  } finally { rmSync(ws, { recursive: true, force: true }); }
});

test('no test command anywhere throws', async () => {
  const ws = workspace({ commands: { setup: '', test: '' } });
  try {
    const { deps } = harness({});
    await assert.rejects(main(env(ws), deps), /no test command/);
  } finally { rmSync(ws, { recursive: true, force: true }); }
});

test('missing commands.json without settings throws', async () => {
  const ws = workspace();
  try {
    const { deps } = harness({});
    await assert.rejects(main(env(ws), deps), /commands\.json/);
  } finally { rmSync(ws, { recursive: true, force: true }); }
});

test('settings set: commands.json is not needed', async () => {
  const ws = workspace();
  try {
    const { calls, deps } = harness({ setupCode: 0, testCode: 0, cases: [], log: '' });
    await main(env(ws, { OC_PARAM_NIGHTLY_SETUP_COMMAND: 's', OC_PARAM_NIGHTLY_TEST_COMMAND: 't' }), deps);
    assert.equal(calls.suite[0].test, 't');
  } finally { rmSync(ws, { recursive: true, force: true }); }
});

test('bad sha throws', async () => {
  const ws = workspace({ commands: { setup: '', test: 't' } });
  try {
    const { deps } = harness({ setupCode: 0, testCode: 0, cases: [], log: '' });
    deps.git = () => 'not-a-sha';
    await assert.rejects(main(env(ws), deps), /sha/);
  } finally { rmSync(ws, { recursive: true, force: true }); }
});
