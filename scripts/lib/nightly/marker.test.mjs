import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatMarker, parseMarker } from './marker.mjs';

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
