import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffRules } from './diff-rules.mjs';
import { isTestFile, isProtectedFile } from './classify.mjs';

const isTest = (p) => /(^|\/)tests?\//.test(p) || /_test\./.test(p);
const isProtected = (p) => p.endsWith('package.json');
const run = (nameStatus, numstat = []) => diffRules({ nameStatus, numstat, isTest, isProtected });
const nu = (path, added, deleted, binary = false) => ({ path, added, deleted, binary });

test('added test file allowed', () => {
  assert.deepEqual(run([{ status: 'A', path: 'tests/b.py' }], [nu('tests/b.py', 5, 0)]), []);
  assert.deepEqual(run([{ status: 'M', path: 'src/a.py' }], [nu('src/a.py', 1, 4)]), []);
  assert.deepEqual(run([{ status: 'A', path: 'src/a.py' }]), []);
});
test('existing test file changed: additions, deletions, mode-only', () => {
  assert.deepEqual(run([{ status: 'M', path: 'tests/a.py' }], [nu('tests/a.py', 3, 0)]),
    ['existing test file changed: tests/a.py (+3 -0)']);
  assert.deepEqual(run([{ status: 'M', path: 'tests/a.py' }], [nu('tests/a.py', 5, 1)]),
    ['existing test file changed: tests/a.py (+5 -1)']);
  assert.deepEqual(run([{ status: 'T', path: 'tests/a.py' }], [nu('tests/a.py', 0, 0)]),
    ['existing test file changed: tests/a.py (+0 -0)']);
  assert.deepEqual(run([{ status: 'M', path: 'tests/a.py' }], [nu('tests/a.py', 0, 0)]),
    ['existing test file changed: tests/a.py (+0 -0)']);
  assert.deepEqual(run([{ status: 'C', path: 'tests/c.py', oldPath: 'src/o.py' }], [nu('tests/c.py', 2, 0)]),
    ['existing test file changed: tests/c.py (+2 -0)']);
});
test('deleted test file', () => {
  assert.deepEqual(run([{ status: 'D', path: 'tests/a.py' }], [nu('tests/a.py', 0, 9)]),
    ['test file deleted: tests/a.py']);
});
test('renamed test file (old or new)', () => {
  assert.deepEqual(run([{ status: 'R', path: 'src/n.py', oldPath: 'tests/o.py' }], [nu('src/n.py', 0, 0)]),
    ['test file renamed: tests/o.py -> src/n.py']);
  assert.deepEqual(run([{ status: 'R', path: 'tests/n.py', oldPath: 'src/o.py' }], [nu('tests/n.py', 0, 0)]),
    ['test file renamed: src/o.py -> tests/n.py']);
});
test('real isTestFile / isProtectedFile with rename', () => {
  const junit = new Set(['src/odd.py']);
  const res = diffRules({
    nameStatus: [
      { status: 'R', path: 'src/n.py', oldPath: 'tests/o.py' },
      { status: 'R', path: 'src/new.py', oldPath: 'src/odd.py' },
      { status: 'R', path: 'a/package.json', oldPath: 'a/p.txt' },
    ],
    numstat: [nu('src/n.py', 0, 0), nu('src/new.py', 0, 0), nu('a/package.json', 0, 0)],
    isTest: (p) => isTestFile(p, junit),
    isProtected: isProtectedFile,
  });
  assert.deepEqual(res, [
    'test file renamed: tests/o.py -> src/n.py',
    'test file renamed: src/odd.py -> src/new.py',
    'protected file changed: a/package.json',
  ]);
});
test('protected file', () => {
  assert.deepEqual(run([{ status: 'M', path: 'package.json' }], [nu('package.json', 1, 1)]),
    ['protected file changed: package.json']);
  assert.deepEqual(run([{ status: 'R', path: 'x/package.json', oldPath: 'y.txt' }], [nu('x/package.json', 0, 0)]),
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
});
test('fail closed on missing numstat', () => {
  assert.throws(() => run([{ status: 'M', path: 'tests/a.py' }]), /^Error: numstat missing for tests\/a\.py$/);
  assert.throws(() => run([{ status: 'M', path: 'package.json' }]), /numstat missing for package\.json/);
  assert.throws(() => run([{ status: 'R', path: 'src/n.py', oldPath: 'src/o.py' }]), /numstat missing for src\/n\.py/);
});
test('duplicates throw', () => {
  assert.throws(() => run([], [nu('a', 1, 0), nu('a', 1, 0)]), /^Error: duplicate numstat path: a$/);
  assert.throws(() => run([{ status: 'A', path: 'a' }, { status: 'M', path: 'a' }]),
    /^Error: duplicate name-status path: a$/);
});
