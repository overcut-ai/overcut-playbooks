import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatMarker, parseMarker } from './marker.mjs';
import { planIssues } from './dedupe.mjs';

const SHA = 'b'.repeat(40);
const OLD = 'a'.repeat(40);
const mk = (o = {}) => ({
  sha: OLD, junit: true, tests: ['t1'], allFailing: ['t1'], total: 5, skipped: 0,
  setup: 's', test: 't', causeCommand: 'c', greenNights: 0, ...o,
});
const issue = (number, m, label = 'nightly-test-failure') => ({
  number, labels: [label], body: `text\n${formatMarker(m)}`,
});
const cs = (id, status = 'passed') => ({ id, name: id, classname: '', file: '', status });
const res = (o = {}) => ({ setup: 'make setup', test: 'make test',
  sha: SHA, junit: true, testCode: 0, total: 5, skipped: 0, failing: [], cases: [], ...o,
});
const cause = (title, tests) => ({ title, summary: `sum ${title}`, tests, causeCommand: `run ${title}` });

test('two new causes open two issues', () => {
  const a = planIssues({
    results: res({ testCode: 1, failing: ['t1', 't2', 't3'], cases: [cs('t1', 'failed'), cs('t2', 'failed'), cs('t3', 'failed')] }),
    causes: [cause('A', ['t1', 't2']), cause('B', ['t3'])], openIssues: [], setupFailed: null,
  });
  assert.equal(a.length, 2);
  assert.equal(a[0].type, 'open');
  assert.equal(a[0].title, 'A');
  assert.deepEqual(a[0].labels, ['nightly-test-failure']);
  const m = parseMarker(a[0].body);
  assert.deepEqual(m.tests, ['t1', 't2']);
  assert.deepEqual(m.allFailing, ['t1', 't2', 't3']);
  assert.equal(m.causeCommand, 'run A');
  assert.equal(m.sha, SHA);
  assert.equal(m.greenNights, 0);
  assert.ok(a[0].body.trim().split('\n').pop().includes('nightly-baseline'));
  assert.ok(a[0].body.includes('- t1'));
});

test('overlap comments lowest issue and resets greenNights', () => {
  const a = planIssues({
    results: res({ testCode: 1, failing: ['t1'], cases: [cs('t1', 'failed')] }),
    causes: [cause('A', ['t1'])],
    openIssues: [issue(9, mk({ greenNights: 1 })), issue(7, mk({ greenNights: 1 }))], setupFailed: null,
  });
  const c = a.find((x) => x.type === 'comment');
  assert.equal(c.issue, 7);
  assert.ok(c.body.includes(`Still failing on ${SHA}`));
  const s = a.filter((x) => x.type === 'set-marker' && x.issue === 7);
  assert.equal(s.length, 1);
  const m = parseMarker(s[0].marker);
  assert.equal(m.greenNights, 0);
  assert.equal(m.sha, OLD);
  assert.ok(!a.some((x) => x.type === 'open'));
  // #9 also has failing t1 and was not commented: reset
  assert.ok(a.some((x) => x.type === 'set-marker' && x.issue === 9 && parseMarker(x.marker).greenNights === 0));
});

test('green issue with 2 greenNights closes', () => {
  const a = planIssues({
    results: res({ cases: [cs('t1')] }), causes: [],
    openIssues: [issue(8, mk({ greenNights: 2 }))], setupFailed: null,
  });
  assert.equal(a.length, 1);
  assert.equal(a[0].type, 'close');
  assert.equal(a[0].issue, 8);
  assert.ok(a[0].body.includes(SHA) && a[0].body.includes('3 consecutive'));
});

test('green issue below 3 increments marker; absent tests unchanged', () => {
  const a = planIssues({
    results: res({ cases: [cs('t1')] }), causes: [],
    openIssues: [issue(8, mk({ greenNights: 0 }))], setupFailed: null,
  });
  assert.equal(a[0].type, 'set-marker');
  assert.equal(parseMarker(a[0].marker).greenNights, 1);
  assert.deepEqual(planIssues({ results: res({ cases: [cs('zzz')] }), causes: [], openIssues: [issue(8, mk({ greenNights: 1 }))], setupFailed: null }), []);
  assert.deepEqual(planIssues({ results: res({ junit: false, cases: null }), causes: [], openIssues: [issue(8, mk({ greenNights: 1 }))], setupFailed: null }), []);
});

test('failed marker test with no greenNights emits nothing', () => {
  const a = planIssues({
    results: res({ testCode: 1, failing: ['t1'], cases: [cs('t1', 'failed')] }),
    causes: [cause('A', ['t1'])], openIssues: [], setupFailed: null,
  });
  assert.equal(a.length, 1);
  assert.deepEqual(planIssues({ results: res({ testCode: 1, failing: ['q'], cases: [cs('q', 'failed'), cs('t1', 'failed')] }), causes: [cause('Q', ['q'])], openIssues: [issue(3, mk({ greenNights: 0 }))], setupFailed: null }).map((x) => x.type), ['open']);
});

test('partition errors', () => {
  const r = res({ testCode: 1, failing: ['a', 'b'], cases: [] });
  const go = (causes) => () => planIssues({ results: r, causes, openIssues: [], setupFailed: null });
  assert.throws(go([cause('X', ['a'])]), { message: 'causes do not partition failing tests: missing [b] duplicate [] unknown []' });
  assert.throws(go([cause('X', ['a', 'b']), cause('Y', ['b'])]), { message: 'causes do not partition failing tests: missing [] duplicate [b] unknown []' });
  assert.throws(go([cause('X', ['a', 'b', 'c'])]), { message: 'causes do not partition failing tests: missing [] duplicate [] unknown [c]' });
});

test('no-junit failing creates script cause; dedupes on junit:false marker', () => {
  const results = res({ junit: false, testCode: 1, cases: null, total: 0, failing: [] });
  const o = planIssues({ results, causes: [cause('ignored', [])], openIssues: [], setupFailed: null });
  assert.equal(o.length, 1);
  assert.equal(o[0].title, 'Test suite failing (no per-test results)');
  const m = parseMarker(o[0].body);
  assert.equal(m.junit, false);
  assert.deepEqual(m.tests, []);
  const open = issue(4, mk({ junit: false, tests: [], allFailing: [], total: 0, greenNights: 2 }));
  const c = planIssues({ results, causes: [], openIssues: [open], setupFailed: null });
  assert.deepEqual(c.map((x) => x.type), ['comment', 'set-marker']);
  const g = planIssues({ results: res({ junit: false, testCode: 0, cases: null }), causes: [], openIssues: [open], setupFailed: null });
  assert.equal(g[0].type, 'close');
});

test('setup failure', () => {
  const a = planIssues({
    results: res(), causes: [],
    openIssues: [issue(9, mk(), 'nightly-setup-failure'), issue(8, mk({ greenNights: 2 }))],
    setupFailed: { log: 'boom' },
  });
  assert.equal(a.length, 1);
  assert.equal(a[0].type, 'comment');
  assert.equal(a[0].issue, 9);
  const b = planIssues({ results: res(), causes: [], openIssues: [], setupFailed: { log: 'boom' } });
  assert.equal(b[0].type, 'open-setup');
  assert.deepEqual(b[0].labels, ['nightly-setup-failure']);
});

test('unparseable-marker issues are ignored', () => {
  const bad = { number: 2, labels: ['nightly-test-failure'], body: 'no marker' };
  const a = planIssues({ results: res({ testCode: 1, failing: ['t1'], cases: [cs('t1', 'failed')] }), causes: [cause('A', ['t1'])], openIssues: [bad], setupFailed: null });
  assert.deepEqual(a.map((x) => x.type), ['open']);
});

test('no-junit cause carries test command as causeCommand', () => {
  const o = planIssues({ results: res({ junit: false, testCode: 1, cases: null, total: 0 }), causes: [], openIssues: [], setupFailed: null });
  assert.equal(parseMarker(o[0].body).causeCommand, 'make test');
});
