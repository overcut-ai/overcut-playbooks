import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatMarker, parseMarker, MARKER_BUDGET, markerTrustedLabels } from './marker.mjs';

const SHA = 'a'.repeat(40);
const base = () => ({
  sha: SHA, junit: true, tests: ['a.T.one', 'a.T.two'], allFailing: ['a.T.one', 'a.T.two', 'b.U.x'],
  total: 10, skipped: 1, setup: 'npm ci', test: 'npm test', causeCommand: 'npm test -- a', greenNights: 0,
});

test('round-trip', () => {
  const b = base();
  const line = formatMarker(b);
  assert.ok(!line.includes('\n'));
  assert.deepEqual(parseMarker(`Summary\n\n${line}`), b);
});

test('round-trip survives --> and newlines in strings', () => {
  const b = { ...base(), tests: ['x --> y\nz'], causeCommand: 'a --> b' };
  const line = formatMarker(b);
  assert.ok(!line.includes('\n'));
  assert.deepEqual(parseMarker(line), b);
});

test('null cases', () => {
  const line = formatMarker(base());
  assert.equal(parseMarker('no marker'), null);
  assert.equal(parseMarker(null), null);
  assert.equal(parseMarker(undefined), null);
  assert.equal(parseMarker(`${line}\n${line}`), null);
  assert.equal(parseMarker(formatMarker({ ...base(), sha: 'abc' })), null);
  assert.equal(parseMarker(formatMarker({ ...base(), total: -1 })), null);
  assert.equal(parseMarker(formatMarker({ ...base(), greenNights: 1.5 })), null);
  assert.equal(parseMarker(formatMarker({ ...base(), tests: [1] })), null);
  assert.equal(parseMarker('<!-- nightly-test-failure {not json} -->'), null);
});

test('quoted marker in reply counts as second marker', () => {
  const line = formatMarker(base());
  assert.equal(parseMarker(`${line}\n\n> ${line}\nreply`), null);
});

test('exact marker prefix and suffix', () => {
  const line = formatMarker(base());
  assert.ok(line.startsWith('<!-- nightly-test-failure {'));
  assert.ok(line.endsWith(' -->'));
});

const ids = (n, len = 160) => Array.from({ length: n }, (_, i) => `pkg/module_${String(i).padStart(5, '0')}_test.py::TestSuite::test_${'x'.repeat(len - 50)}`);

test('marker under budget keeps lists and has no truncation flags', () => {
  const line = formatMarker(base());
  const m = parseMarker(line);
  assert.equal('allFailingTruncated' in m, false);
  assert.equal('testsTruncated' in m, false);
});

test('marker over budget drops allFailing first', () => {
  const b = { ...base(), tests: ids(10), allFailing: ids(400) };
  const line = formatMarker(b);
  assert.ok(line.length <= MARKER_BUDGET, `${line.length}`);
  const m = parseMarker(line);
  assert.deepEqual(m.allFailing, []);
  assert.equal(m.allFailingTruncated, true);
  assert.deepEqual(m.tests, b.tests);
  assert.equal('testsTruncated' in m, false);
});

test('marker still over budget keeps the longest sorted prefix of tests', () => {
  const tests = ids(5000).reverse();
  const line = formatMarker({ ...base(), tests, allFailing: tests });
  assert.ok(line.length <= MARKER_BUDGET, `${line.length}`);
  const m = parseMarker(line);
  assert.equal(m.allFailingTruncated, true);
  assert.equal(m.testsTruncated, true);
  const sorted = [...tests].sort();
  assert.ok(m.tests.length > 0 && m.tests.length < tests.length);
  assert.deepEqual(m.tests, sorted.slice(0, m.tests.length));
  // One more id would not fit.
  const more = formatMarker({ ...base(), tests: sorted.slice(0, m.tests.length + 1), allFailing: [], allFailingTruncated: true });
  assert.ok(parseMarker(more).testsTruncated);
});

test('truncation flags survive a re-format (set-marker)', () => {
  const m = parseMarker(formatMarker({ ...base(), tests: ids(5000), allFailing: ids(5000) }));
  const again = parseMarker(formatMarker({ ...m, greenNights: 1 }));
  assert.deepEqual({ ...again, greenNights: 0 }, m);
});

test('truncation flags must be true when present', () => {
  const line = formatMarker(base()).replace('"greenNights":0', '"greenNights":0,"testsTruncated":"yes"');
  assert.equal(parseMarker(line), null);
  const f = formatMarker(base()).replace('"greenNights":0', '"greenNights":0,"allFailingTruncated":false');
  assert.equal(parseMarker(f), null);
});

test('markerTrustedLabels: JSON array of names or {name} objects containing nightly-test-failure', () => {
  assert.equal(markerTrustedLabels('["bug","nightly-test-failure"]'), true);
  assert.equal(markerTrustedLabels('[{"name":"nightly-test-failure","color":"ff0000"}]'), true);
  for (const raw of [undefined, null, '', 'nightly-test-failure', '{"name":"nightly-test-failure"}', '[]',
    '["bug"]', '["Nightly-Test-Failure"]', '[{"name":"nightly-test-failure-x"}]', '[null, 3]', '{{json trigger.issue.labels}}', 'not json']) {
    assert.equal(markerTrustedLabels(raw), false, String(raw));
  }
});
