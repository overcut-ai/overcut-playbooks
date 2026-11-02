import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  COMPILED_EXTENSIONS, isTestFile, isProtectedFile, languageMode, parseNameStatus, parseNumstat,
} from './classify.mjs';

test('isTestFile positives', () => {
  for (const p of ['src/app_test.go', 'tests/unit/foo.py', 'Foo.Tests/BarTests.cs', 'web/a.spec.ts',
    'src/FooTest.java', 'test_x.py', 'a/b.test.js', 'x/__tests__/y.js', 'spec/z.rb']) {
    assert.equal(isTestFile(p), true, p);
  }
});
test('isTestFile negatives and junit', () => {
  assert.equal(isTestFile('src/testing_utils.py'), false);
  assert.equal(isTestFile('src/Tests'), false);
  assert.equal(isTestFile('Test/a.py'), false);
  assert.equal(isTestFile('src/odd.py'), false);
  assert.equal(isTestFile('src/odd.py', new Set(['src/odd.py'])), true);
});
test('isProtectedFile extended list', () => {
  for (const p of ['setup.cfg', 'a/CMakeLists.txt', 'Makefile', 'GNUmakefile', 'build.sbt', 'x/A.fsproj',
    'Directory.Build.props', '.rspec', 'noxfile.py', 'vitest.workspace.ts', 'jest.setup.js',
    'tsconfig.build.json', 'deno.jsonc', 'Rakefile', '.nycrc.json', 'babel.config.js', '.babelrc']) {
    assert.equal(isProtectedFile(p), true, p);
  }
});
test('isProtectedFile', () => {
  for (const p of ['.github/workflows/ci.yml', '.circleci/config.yml', 'Jenkinsfile', 'pkg/a/package.json',
    'requirements-dev.txt', 'build.gradle.kts', 'x/App.csproj', 'phpunit.xml.dist', '.mocharc.json',
    'jest.config.ts', 'conftest.py', 'pubspec.yaml', 'Gemfile.lock', 'go.sum']) {
    assert.equal(isProtectedFile(p), true, p);
  }
  for (const p of ['src/github/a.js', 'x/.github/a.yml', 'src/main.go', 'Package.json', 'requirements.md']) {
    assert.equal(isProtectedFile(p), false, p);
  }
});
test('languageMode', () => {
  assert.equal(languageMode(['a.py', 'b.ts']), 'interpreted');
  assert.equal(languageMode(['a.py', 'x_test.go']), 'compiled');
  assert.equal(languageMode(['a.weird']), 'compiled');
  assert.equal(languageMode(['Makefile']), 'compiled');
  assert.equal(languageMode(['a.R']), 'interpreted');
  assert.equal(languageMode([]), 'compiled');
  assert.ok(COMPILED_EXTENSIONS.has('.rs'));
});
test('parseNameStatus basic', () => {
  const out = 'M\0a b/ü"x.py\0A\0n.js\0R100\0old.py\0new.py\0C075\0s\0t\0D\0d.go\0';
  assert.deepEqual(parseNameStatus(out), [
    { status: 'M', path: 'a b/ü"x.py' },
    { status: 'A', path: 'n.js' },
    { status: 'R', path: 'new.py', oldPath: 'old.py' },
    { status: 'C', path: 't', oldPath: 's' },
    { status: 'D', path: 'd.go' },
  ]);
  assert.deepEqual(parseNameStatus(''), []);
});
test('parseNameStatus malformed throws', () => {
  assert.throws(() => parseNameStatus('M\0'));
  assert.throws(() => parseNameStatus('R100\0old\0'));
  assert.throws(() => parseNameStatus('Q\0a\0'));
  assert.throws(() => parseNameStatus('M\0a'));
});
test('parseNameStatus matches real git output', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cls-'));
  try {
    const git = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: dir }).toString();
    git('init', '-q');
    mkdirSync(join(dir, 'd e'));
    const names = ['d e/sp ace.py', 'ünï.py', 'q"uote.py', 'keep.txt', 'ren ame.py'];
    for (const n of names) writeFileSync(join(dir, n), `content of ${n}\nline2\nline3\n`);
    git('add', '-A'); git('commit', '-q', '-m', 'one');
    writeFileSync(join(dir, 'd e/sp ace.py'), 'changed\n');
    writeFileSync(join(dir, 'ünï.py'), 'x\n');
    git('mv', 'ren ame.py', 'rén"amed.py');
    git('rm', '-q', 'q"uote.py');
    git('add', '-A');
    const ns = parseNameStatus(git('diff', '--cached', '--name-status', '-M', '-z'));
    const by = Object.fromEntries(ns.map((e) => [e.path, e]));
    assert.equal(by['d e/sp ace.py'].status, 'M');
    assert.equal(by['ünï.py'].status, 'M');
    assert.equal(by['q"uote.py'].status, 'D');
    assert.equal(by['rén"amed.py'].status, 'R');
    assert.equal(by['rén"amed.py'].oldPath, 'ren ame.py');
    const nu = parseNumstat(git('diff', '--cached', '--numstat', '-M', '-z'));
    const nby = Object.fromEntries(nu.map((e) => [e.path, e]));
    assert.equal(nby['rén"amed.py'].added, 0);
    assert.equal(nby['d e/sp ace.py'].added, 1);
    assert.equal(nby['q"uote.py'].deleted, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('parseNumstat', () => {
  const out = '3\t1\ta b.py\0-\t-\timg.png\x002\t0\t\0old.py\0new.py\0';
  assert.deepEqual(parseNumstat(out), [
    { path: 'a b.py', added: 3, deleted: 1, binary: false },
    { path: 'img.png', added: 0, deleted: 0, binary: true },
    { path: 'new.py', added: 2, deleted: 0, binary: false },
  ]);
  assert.deepEqual(parseNumstat(''), []);
  assert.throws(() => parseNumstat('3\t1\0'));
  assert.throws(() => parseNumstat('x\ty\tp\0'));
  assert.throws(() => parseNumstat('1\t1\t\0old\0'));
});
