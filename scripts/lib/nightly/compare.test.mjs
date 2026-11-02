import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareResults, redCheck } from './compare.mjs';

const c = (id, status) => ({ id, name: id, classname: '', file: '', status });
const base = { allFailing: ['old1'], total: 4, skipped: 0 };
const mkRerun = (ret) => {
  const f = (ids) => { f.calls.push(ids); return ret; };
  f.calls = [];
  return f;
};

test('clean fix is ok and does not rerun', () => {
  const rr = mkRerun([]);
  const r = compareResults({ baseline: base, fixCases: [c('a', 'passed'), c('b', 'passed'), c('d', 'passed'), c('old1', 'failed')], causeIds: ['a'], rerunFailed: rr });
  assert.deepEqual(r, { ok: true, reasons: [] });
  assert.equal(rr.calls.length, 0);
});

test('cause still failing, absent, or skipped', () => {
  const rr = mkRerun([]);
  const r = compareResults({ baseline: { allFailing: [], total: 3, skipped: 5 }, fixCases: [c('a', 'failed'), c('s', 'skipped'), c('x', 'passed')], causeIds: ['s', 'a', 'gone'], rerunFailed: rr });
  assert.deepEqual(r.reasons, ['cause test still failing: a', 'cause test still failing: gone', 'cause test still failing: s']);
  assert.equal(r.ok, false);
});

test('new failure passing on rerun is ok; failing on rerun is reported', () => {
  const cases = [c('a', 'passed'), c('n2', 'failed'), c('n1', 'failed'), c('old1', 'failed')];
  const b = { allFailing: ['old1'], total: 4, skipped: 0 };
  const ok = mkRerun([]);
  assert.equal(compareResults({ baseline: b, fixCases: cases, causeIds: ['a'], rerunFailed: ok }).ok, true);
  assert.deepEqual(ok.calls, [['n1', 'n2']]);
  const bad = mkRerun(['n2', 'zzz']);
  const r = compareResults({ baseline: b, fixCases: cases, causeIds: ['a'], rerunFailed: bad });
  assert.deepEqual(r.reasons, ['new failure: n2']);
  assert.equal(bad.calls.length, 1);
});

test('count reasons', () => {
  const r = compareResults({ baseline: { allFailing: [], total: 5, skipped: 0 }, fixCases: [c('a', 'passed'), c('b', 'skipped')], causeIds: ['a'], rerunFailed: mkRerun([]) });
  assert.deepEqual(r.reasons, ['fewer tests than baseline: 2 < 5', 'more skipped than baseline: 1 > 0']);
});

test('redCheck all failing is ok with exact newIds', () => {
  const r = redCheck({ unmodifiedCases: [c('a', 'passed')], overlayCases: [c('a', 'failed'), c('n2', 'failed'), c('n1', 'failed')], causeIds: ['a', 'missing'] });
  assert.deepEqual(r, { ok: true, reasons: [], newIds: ['n1', 'n2'] });
});

test('redCheck passing new/cause tests give reasons', () => {
  const r = redCheck({ unmodifiedCases: [c('a', 'passed')], overlayCases: [c('a', 'passed'), c('n1', 'passed'), c('n2', 'skipped')], causeIds: ['a'] });
  assert.equal(r.ok, false);
  assert.deepEqual(r.reasons, ['cause test passes on old code: a', 'new test passes on old code: n1', 'new test passes on old code: n2']);
  assert.deepEqual(r.newIds, ['n1', 'n2']);
});

test('duplicate cause id: failed wins in either order', () => {
  for (const cases of [[c('a', 'failed'), c('a', 'passed')], [c('a', 'passed'), c('a', 'failed')]]) {
    const r = compareResults({ baseline: { allFailing: [], total: 1, skipped: 0 }, fixCases: cases, causeIds: ['a'], rerunFailed: () => { throw new Error('no'); } });
    assert.deepEqual(r.reasons, ['cause test still failing: a']);
  }
});

test('redCheck duplicate ids: failed wins', () => {
  const r = redCheck({ unmodifiedCases: [], overlayCases: [c('n', 'failed'), c('n', 'passed'), c('k', 'passed'), c('k', 'failed')], causeIds: ['k'] });
  assert.deepEqual(r, { ok: true, reasons: [], newIds: ['k', 'n'] });
});

test('rerunFailed non-array throws', () => {
  for (const bad of [undefined, 'n1', [1]]) {
    assert.throws(() => compareResults({ baseline: base, fixCases: [c('n1', 'failed'), c('old1', 'failed'), c('x', 'passed'), c('y', 'passed')], causeIds: [], rerunFailed: () => bad }), TypeError);
  }
});
