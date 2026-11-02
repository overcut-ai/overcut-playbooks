import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatMarker, parseMarker } from './marker.mjs';
import { planIssues } from './dedupe.mjs';

const plan = (x) => planIssues(x).actions;

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
  const a = plan({
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
  assert.ok(a[0].body.trim().split('\n').pop().includes('<!-- nightly-test-failure {'));
  assert.ok(a[0].body.includes('- t1'));
});

test('overlap comments lowest issue and resets greenNights', () => {
  const a = plan({
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

test('a night counts as green only when every tracked test passed', () => {
  const partial = plan({
    results: res({ cases: [cs('t1'), cs('t2', 'skipped')] }), causes: [],
    openIssues: [issue(8, mk({ tests: ['t1', 't2', 't3'], greenNights: 2 }))], setupFailed: null,
  });
  assert.deepEqual(partial, []);
  const all = plan({
    results: res({ cases: [cs('t1'), cs('t2')] }), causes: [],
    openIssues: [issue(8, mk({ tests: ['t1', 't2'], greenNights: 2 }))], setupFailed: null,
  });
  assert.equal(all[0].type, 'close');
});

test('green issue with 2 greenNights closes', () => {
  const a = plan({
    results: res({ cases: [cs('t1')] }), causes: [],
    openIssues: [issue(8, mk({ greenNights: 2 }))], setupFailed: null,
  });
  assert.equal(a.length, 1);
  assert.equal(a[0].type, 'close');
  assert.equal(a[0].issue, 8);
  assert.ok(a[0].body.includes(SHA) && a[0].body.includes('3 consecutive'));
});

test('green issue below 3 increments marker; absent tests unchanged', () => {
  const a = plan({
    results: res({ cases: [cs('t1')] }), causes: [],
    openIssues: [issue(8, mk({ greenNights: 0 }))], setupFailed: null,
  });
  assert.equal(a[0].type, 'set-marker');
  assert.equal(parseMarker(a[0].marker).greenNights, 1);
  assert.deepEqual(plan({ results: res({ cases: [cs('zzz')] }), causes: [], openIssues: [issue(8, mk({ greenNights: 1 }))], setupFailed: null }), []);
  assert.deepEqual(plan({ results: res({ junit: false, cases: null }), causes: [], openIssues: [issue(8, mk({ greenNights: 1 }))], setupFailed: null }), []);
});

test('failed marker test with no greenNights emits nothing', () => {
  const a = plan({
    results: res({ testCode: 1, failing: ['t1'], cases: [cs('t1', 'failed')] }),
    causes: [cause('A', ['t1'])], openIssues: [], setupFailed: null,
  });
  assert.equal(a.length, 1);
  assert.deepEqual(plan({ results: res({ testCode: 1, failing: ['q'], cases: [cs('q', 'failed'), cs('t1', 'failed')] }), causes: [cause('Q', ['q'])], openIssues: [issue(3, mk({ greenNights: 0 }))], setupFailed: null }).map((x) => x.type), ['open']);
});

test('partition fallback: missing ids go to "Ungrouped failures" with the full test command', () => {
  const r = res({ testCode: 1, failing: ['a', 'b', 'c'], cases: [] });
  const p = planIssues({ results: r, causes: [cause('X', ['a'])], openIssues: [], setupFailed: null });
  assert.deepEqual(p.actions.map((x) => [x.type, x.title]), [['open', 'X'], ['open', 'Ungrouped failures']]);
  const m = parseMarker(p.actions[1].body);
  assert.deepEqual(m.tests, ['b', 'c']);
  assert.equal(m.causeCommand, 'make test');
  assert.equal(p.notes.length, 1);
  assert.match(p.notes[0], /2 failing test\(s\) in no cause moved to "Ungrouped failures": b, c/);
});

test('partition fallback: duplicates keep their first cause, unknown ids are dropped', () => {
  const r = res({ testCode: 1, failing: ['a', 'b'], cases: [] });
  const p = planIssues({ results: r, causes: [cause('X', ['a', 'b', 'c']), cause('Y', ['b', 'b'])], openIssues: [], setupFailed: null });
  assert.deepEqual(p.actions.map((x) => x.title), ['X']);
  assert.deepEqual(parseMarker(p.actions[0].body).tests, ['a', 'b']);
  assert.ok(p.notes.some((n) => /duplicate/.test(n) && n.includes('b')));
  assert.ok(p.notes.some((n) => /unknown/.test(n) && n.includes('c')));
  assert.ok(p.notes.some((n) => /"Y".*no tests/.test(n)));
});

test('partition fallback: a correct partition has no notes', () => {
  const r = res({ testCode: 1, failing: ['a', 'b'], cases: [] });
  const p = planIssues({ results: r, causes: [cause('X', ['a']), cause('Y', ['b'])], openIssues: [], setupFailed: null });
  assert.deepEqual(p.notes, []);
  assert.equal(p.actions.length, 2);
});

test('junit night drops an empty-tests cause', () => {
  const r = res({ testCode: 1, failing: ['a'], cases: [] });
  const p = planIssues({ results: r, causes: [cause('X', ['a']), cause('Empty', [])], openIssues: [], setupFailed: null });
  assert.deepEqual(p.actions.map((x) => x.title), ['X']);
  assert.match(p.notes.join('\n'), /"Empty" has no tests; dropped/);
});

test('partition fallback: no causes at all on a red night still files every failing test', () => {
  const r = res({ testCode: 1, failing: ['a'], cases: [] });
  const p = planIssues({ results: r, causes: [], openIssues: [], setupFailed: null });
  assert.deepEqual(p.actions.map((x) => x.title), ['Ungrouped failures']);
});

test('no-junit failing creates script cause; dedupes on junit:false marker', () => {
  const results = res({ junit: false, testCode: 1, cases: null, total: 0, failing: [] });
  const o = plan({ results, causes: [cause('ignored', [])], openIssues: [], setupFailed: null });
  assert.equal(o.length, 1);
  assert.equal(o[0].title, 'Test suite failing (no per-test results)');
  const m = parseMarker(o[0].body);
  assert.equal(m.junit, false);
  assert.deepEqual(m.tests, []);
  const open = issue(4, mk({ junit: false, tests: [], allFailing: [], total: 0, greenNights: 2 }));
  const c = plan({ results, causes: [], openIssues: [open], setupFailed: null });
  assert.deepEqual(c.map((x) => x.type), ['comment', 'set-marker']);
  const g = plan({ results: res({ junit: false, testCode: 0, cases: null }), causes: [], openIssues: [open], setupFailed: null });
  assert.equal(g[0].type, 'close');
});

test('setup failure', () => {
  const a = plan({
    results: res(), causes: [],
    openIssues: [issue(9, mk(), 'nightly-setup-failure'), issue(8, mk({ greenNights: 2 }))],
    setupFailed: { log: 'boom' },
  });
  assert.equal(a.length, 1);
  assert.equal(a[0].type, 'comment');
  assert.equal(a[0].issue, 9);
  const b = plan({ results: res(), causes: [], openIssues: [], setupFailed: { log: 'boom' } });
  assert.equal(b[0].type, 'open-setup');
  assert.deepEqual(b[0].labels, ['nightly-setup-failure']);
});

test('unparseable-marker issues are ignored', () => {
  const bad = { number: 2, labels: ['nightly-test-failure'], body: 'no marker' };
  const a = plan({ results: res({ testCode: 1, failing: ['t1'], cases: [cs('t1', 'failed')] }), causes: [cause('A', ['t1'])], openIssues: [bad], setupFailed: null });
  assert.deepEqual(a.map((x) => x.type), ['open']);
});

test('no-junit cause carries test command as causeCommand', () => {
  const o = plan({ results: res({ junit: false, testCode: 1, cases: null, total: 0 }), causes: [], openIssues: [], setupFailed: null });
  assert.equal(parseMarker(o[0].body).causeCommand, 'make test');
});

const longIds = (n) => Array.from({ length: n }, (_, i) => `pkg/sub/module_${String(i).padStart(5, '0')}_test.py::TestSomething::test_case_with_a_long_name_${i}`);

for (const n of [400, 5000]) {
  test(`${n} failing ids: open body and marker fit GitHub limits`, () => {
    const failing = longIds(n);
    const r = res({ testCode: 1, failing, cases: failing.map((id) => cs(id, 'failed')) });
    const p = planIssues({ results: r, causes: [{ ...cause('Big', failing), summary: 'S'.repeat(3000) }], openIssues: [], setupFailed: null });
    const body = p.actions[0].body;
    assert.ok(body.length <= 65000, `body ${body.length}`);
    const m = parseMarker(body);
    assert.ok(m, 'marker parses');
    assert.equal(m.allFailingTruncated, true);
    assert.ok(body.startsWith('S'.repeat(3000)));
    assert.ok(body.includes(`Commit: ${SHA}`));
    if (n === 400) {
      assert.equal((body.match(/^- /gm) || []).length, 50);
      assert.ok(body.includes(`… and ${n - 50} more`));
    } else {
      // The marker nearly fills the body: the list is cut at a line and says so.
      assert.equal(m.testsTruncated, true);
      assert.ok((body.match(/^- /gm) || []).length < 50);
      assert.match(body, /\n… \(truncated\)\n/);
    }
  });

  test(`${n} failing ids: comment body is capped and set-marker fits`, () => {
    const failing = longIds(n);
    const r = res({ testCode: 1, failing, cases: failing.map((id) => cs(id, 'failed')) });
    const a = plan({ results: r, causes: [cause('Big', failing)], openIssues: [issue(4, mk({ tests: [failing[0]], greenNights: 1 }))], setupFailed: null });
    const c = a.find((x) => x.type === 'comment');
    assert.ok(c.body.length <= 65000);
    assert.equal((c.body.match(/^- /gm) || []).length, 50);
    assert.ok(c.body.includes(`… and ${n - 50} more`));
    for (const s of a.filter((x) => x.type === 'set-marker')) assert.ok(s.marker.length <= 60000);
  });
}

test('comment hit with greenNights 0 emits no set-marker', () => {
  const a = plan({
    results: res({ testCode: 1, failing: ['t1'], cases: [cs('t1', 'failed')] }),
    causes: [cause('A', ['t1'])], openIssues: [issue(7, mk({ greenNights: 0 }))], setupFailed: null,
  });
  assert.deepEqual(a.map((x) => [x.type, x.issue]), [['comment', 7]]);
});

test('first night after a setup failure closes the open setup issue', () => {
  for (const results of [res({ cases: [cs('t1')] }), res({ testCode: 1, failing: ['t1'], cases: [cs('t1', 'failed')] })]) {
    const a = plan({
      results, causes: results.failing.length ? [cause('A', ['t1'])] : [],
      openIssues: [issue(9, mk(), 'nightly-setup-failure')], setupFailed: null,
    });
    const close = a.filter((x) => x.type === 'close');
    assert.deepEqual(close, [{ type: 'close', issue: 9, body: `Setup succeeded on ${SHA}; closing.` }]);
  }
  const s = plan({ results: res(), causes: [], openIssues: [issue(9, mk(), 'nightly-setup-failure')], setupFailed: { log: 'boom' } });
  assert.deepEqual(s.map((x) => x.type), ['comment']);
});

test('fences and inline code are longer than any backtick run inside', () => {
  const s = plan({ results: res(), causes: [], openIssues: [], setupFailed: { log: 'a\n```\nb ```` c' } });
  assert.ok(s[0].body.includes('`````\na\n```\nb ```` c\n`````'), s[0].body);
  const o = plan({
    results: res({ testCode: 1, failing: ['a'], cases: [cs('a', 'failed')], setup: 'echo `x`', test: 'run ``y``' }),
    causes: [cause('A', ['a'])], openIssues: [], setupFailed: null,
  });
  assert.ok(o[0].body.includes('Setup: `` echo `x` ``'), o[0].body);
  assert.ok(o[0].body.includes('Test: ``` run ``y`` ```'), o[0].body);
});
