import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseMarker, formatMarker } from '../../scripts/lib/nightly/marker.mjs';
import { main } from './plan-issues.mjs';

const SHA = 'b'.repeat(40);

function ws(files) {
  const d = mkdtempSync(join(tmpdir(), 'plan-issues-'));
  mkdirSync(join(d, '.nightly'));
  for (const [name, v] of Object.entries(files)) {
    writeFileSync(join(d, '.nightly', name), typeof v === 'string' ? v : JSON.stringify(v));
  }
  return d;
}

function base(over) {
  return { status: 'red', sha: SHA, junit: true, testCode: 1, total: 2, skipped: 0, failing: [], cases: [], setup: 's', test: 't', log: 'LOG', ...over };
}

async function run(d) {
  const out = [];
  await main({ AGENT_WORKSPACE_PATH: d }, { outputJson: (o) => out.push(o) });
  return { plan: JSON.parse(readFileSync(join(d, '.nightly', 'plan.json'), 'utf8')), out };
}

test('red without JUnit: single open with junit:false marker; agent causes ignored', async () => {
  const d = ws({
    'results.json': base({ junit: false, testCode: 1, total: 0, failing: [], cases: null }),
    'causes.json': [{ title: 'agent guess', summary: 'x', tests: ['nope'], causeCommand: 'c' }],
    'open-issues.json': [],
  });
  try {
    const { plan, out } = await run(d);
    assert.equal(plan.length, 1);
    assert.equal(plan[0].type, 'open');
    assert.equal(plan[0].title, 'Test suite failing (no per-test results)');
    const m = parseMarker(plan[0].body);
    assert.equal(m.junit, false);
    assert.deepEqual(m.tests, []);
    assert.equal(m.causeCommand, 't');
    assert.deepEqual(out, [{ actions: 1 }]);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('setup-failed: single open-setup action', async () => {
  const d = ws({
    'results.json': base({ status: 'setup-failed', junit: false, testCode: null, total: 0, cases: null, log: 'apt failed' }),
    'causes.json': [],
    'open-issues.json': [],
  });
  try {
    const { plan, out } = await run(d);
    assert.equal(plan.length, 1);
    assert.equal(plan[0].type, 'open-setup');
    assert.deepEqual(plan[0].labels, ['nightly-setup-failure']);
    assert.match(plan[0].body, /apt failed/);
    assert.deepEqual(out, [{ actions: 1 }]);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('setup-failed: log in the issue body is capped to its tail', async () => {
  const log = 'HEAD' + 'x'.repeat(100000) + 'TAIL';
  const d = ws({
    'results.json': base({ status: 'setup-failed', junit: false, testCode: null, cases: null, log }),
    'open-issues.json': [],
  });
  try {
    const { plan } = await run(d);
    assert.ok(plan[0].body.length < 30000);
    assert.match(plan[0].body, /TAIL/);
    assert.doesNotMatch(plan[0].body, /HEAD/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('red with JUnit: agent causes are used, one open per cause', async () => {
  const d = ws({
    'results.json': base({ failing: ['a', 'b'], cases: [{ id: 'a', status: 'failed' }, { id: 'b', status: 'failed' }] }),
    'causes.json': [
      { title: 'A broke', summary: 'sa', tests: ['a'], causeCommand: 'ta' },
      { title: 'B broke', summary: 'sb', tests: ['b'], causeCommand: 'tb' },
    ],
    'open-issues.json': [],
  });
  try {
    const { plan } = await run(d);
    assert.deepEqual(plan.map((a) => [a.type, a.title]), [['open', 'A broke'], ['open', 'B broke']]);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('green: causes.json is ignored and may be absent; green nights advance', async () => {
  const marker = formatMarker({ sha: SHA, junit: true, tests: ['a'], allFailing: ['a'], total: 1, skipped: 0, setup: 's', test: 't', causeCommand: 'c', greenNights: 0 });
  const d = ws({
    'results.json': base({ status: 'green', testCode: 0, failing: [], cases: [{ id: 'a', status: 'passed' }] }),
    'open-issues.json': [{ number: 7, labels: [{ name: 'nightly-test-failure' }], body: `text\n${marker}` }],
  });
  try {
    const { plan } = await run(d);
    assert.equal(plan.length, 1);
    assert.equal(plan[0].type, 'set-marker');
    assert.equal(plan[0].issue, 7);
    assert.equal(parseMarker(plan[0].marker).greenNights, 1);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('red with causes that do not partition: throws', async () => {
  const d = ws({
    'results.json': base({ failing: ['a'], cases: [{ id: 'a', status: 'failed' }] }),
    'causes.json': [],
    'open-issues.json': [],
  });
  try {
    await assert.rejects(run(d), /partition/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('malformed open-issues.json throws', async () => {
  const d = ws({ 'results.json': base({ status: 'green', testCode: 0 }), 'open-issues.json': { number: 1 } });
  try {
    await assert.rejects(run(d), /open-issues\.json/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('malformed cause throws', async () => {
  const d = ws({
    'results.json': base({ failing: ['a'], cases: [{ id: 'a', status: 'failed' }] }),
    'causes.json': [{ title: 'x', tests: 'a' }],
    'open-issues.json': [],
  });
  try {
    await assert.rejects(run(d), /causes\.json/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
