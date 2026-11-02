import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffRules } from './diff-rules.mjs';

const isTest = (p) => /(^|\/)tests?\//.test(p) || /_test\./.test(p);
const isProtected = (p) => p.endsWith('package.json');
const run = (nameStatus, numstat = []) => diffRules({ nameStatus, numstat, isTest, isProtected });
const nu = (path, added, deleted, binary = false) => ({ path, added, deleted, binary });

test('additions only: no violation', () => {
  assert.deepEqual(run([{ status: 'M', path: 'tests/a.py' }], [nu('tests/a.py', 5, 0)]), []);
  assert.deepEqual(run([{ status: 'A', path: 'tests/b.py' }], [nu('tests/b.py', 5, 0)]), []);
});
test('deleted lines in test file', () => {
  assert.deepEqual(run([{ status: 'M', path: 'tests/a.py' }], [nu('tests/a.py', 5, 1)]),
    ['existing test lines changed: tests/a.py (-1)']);
});
test('deleted test file', () => {
  assert.deepEqual(run([{ status: 'D', path: 'tests/a.py' }], [nu('tests/a.py', 0, 9)]),
    ['test file deleted: tests/a.py']);
});
test('renamed test file (old or new)', () => {
  assert.deepEqual(run([{ status: 'R', path: 'src/n.py', oldPath: 'tests/o.py' }], [nu('src/n.py', 0, 0)]),
    ['test file renamed: tests/o.py -> src/n.py']);
  assert.deepEqual(run([{ status: 'R', path: 'tests/n.py', oldPath: 'src/o.py' }]),
    ['test file renamed: src/o.py -> tests/n.py']);
});
test('protected file', () => {
  assert.deepEqual(run([{ status: 'M', path: 'package.json' }], [nu('package.json', 1, 1)]),
    ['protected file changed: package.json']);
  assert.deepEqual(run([{ status: 'R', path: 'x/package.json', oldPath: 'y.txt' }]),
    ['protected file changed: x/package.json']);
});
test('binary test file', () => {
  assert.deepEqual(run([{ status: 'M', path: 'tests/i.png' }], [nu('tests/i.png', 0, 0, true)]),
    ['binary test file changed: tests/i.png']);
});
test('one violation per file, in order', () => {
  assert.deepEqual(run([{ status: 'D', path: 'tests/package.json' }], [nu('tests/package.json', 0, 3)]),
    ['test file deleted: tests/package.json']);
  assert.deepEqual(run([{ status: 'M', path: 'tests/package.json' }], [nu('tests/package.json', 0, 3)]),
    ['protected file changed: tests/package.json']);
  assert.deepEqual(run([{ status: 'M', path: 'src/a.py' }], [nu('src/a.py', 1, 4)]), []);
});
