import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJUnit, readJUnitDir, summarize } from './junit.mjs';

const fx = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'junit');
const load = (n) => parseJUnit(readFileSync(join(fx, n), 'utf8'));
const pairs = (cs) => cs.map((c) => [c.id, c.status]);

test('jest-junit: entities decoded, CDATA ignored', () => {
  assert.deepEqual(pairs(load('jest.xml')), [
    ['Cart adds item::Cart adds item', 'passed'],
    ['Cart handles "quoted" names & symbols::Cart handles "quoted" names & symbols', 'failed'],
    ['Cart total < limit::Cart total < limit', 'passed'],
  ]);
});

test('pytest: failure, error, skipped, self-closing pass', () => {
  assert.deepEqual(pairs(load('pytest.xml')), [
    ['tests.test_math::test_add', 'failed'],
    ['tests.test_math::test_sub', 'passed'],
    ['tests.test_db::test_connect', 'failed'],
    ['tests.test_io::test_slow', 'skipped'],
  ]);
});

test('gotestsum: numeric entities, skipped', () => {
  const cs = load('gotestsum.xml');
  assert.deepEqual(pairs(cs), [
    ['github.com/acme/app/pkg/store::TestPut', 'passed'],
    ['github.com/acme/app/pkg/store::TestGet/missing_key', 'failed'],
    ['github.com/acme/app/pkg/store::TestSkip', 'skipped'],
  ]);
  assert.equal(cs[0].file, null);
});

test('surefire: failure with escaped attrs and CDATA, error', () => {
  assert.deepEqual(pairs(load('surefire.xml')), [
    ['com.acme.OrderServiceTest::createsOrder', 'passed'],
    ['com.acme.OrderServiceTest::rejectsEmpty', 'failed'],
    ['com.acme.OrderServiceTest::timesOut', 'failed'],
  ]);
});

test('nested testsuites, file attr, empty classname uses file', () => {
  const cs = load('nested.xml');
  assert.deepEqual(pairs(cs), [
    ['a.B::one', 'passed'],
    ['a.B::two', 'failed'],
    ['spec/c_spec.rb::no_class', 'passed'],
  ]);
  assert.equal(cs[0].file, 'src/a/B.js');
});

test('self-closing testcase', () => {
  assert.deepEqual(load('selfclosing.xml'), [
    { id: 'x.Y::only', name: 'only', classname: 'x.Y', file: null, status: 'passed' },
  ]);
});

test('CDATA containing fake tags is ignored', () => {
  const xml = '<testcase classname="c" name="n"><failure><![CDATA[</testcase><testcase name="fake"/>]]></failure></testcase>';
  assert.deepEqual(pairs(parseJUnit(xml)), [['c::n', 'failed']]);
});

test('summarize: dedupe, failed wins, sorted failing', () => {
  const mk = (id, status) => ({ id, name: id, classname: '', file: null, status });
  const s = summarize([mk('b', 'passed'), mk('b', 'failed'), mk('a', 'failed'), mk('c', 'skipped'), mk('c', 'skipped'), mk('d', 'passed')]);
  assert.deepEqual(s, { total: 4, skipped: 1, failing: ['a', 'b'] });
});

test('readJUnitDir: recursive, and throws when empty', () => {
  const d = mkdtempSync(join(tmpdir(), 'junit-'));
  assert.throws(() => readJUnitDir(d), /no JUnit XML/);
  mkdirSync(join(d, 'sub', 'deep'), { recursive: true });
  writeFileSync(join(d, 'sub', 'deep', 'r.xml'), readFileSync(join(fx, 'selfclosing.xml')));
  writeFileSync(join(d, 'notes.txt'), 'x');
  assert.deepEqual(pairs(readJUnitDir(d)), [['x.Y::only', 'passed']]);
  assert.equal(readJUnitDir(fx).length, 3 + 4 + 3 + 3 + 3 + 1);
});
