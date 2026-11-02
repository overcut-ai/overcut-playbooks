import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { sh, git, repoDir, runSuite, outputJson } from './exec.mjs';

const XML = '<testsuite><testcase classname="a.B" name="ok"/></testsuite>';

function tmp() {
  return mkdtempSync(join(tmpdir(), 'exec-test-'));
}

function initRepo(dir) {
  execFileSync('git', ['init', '-q'], { cwd: dir });
  const hook = join(dir, '.git', 'hooks', 'pre-commit');
  mkdirSync(join(dir, '.git', 'hooks'), { recursive: true });
  writeFileSync(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 });
}

test('sh merges stdout and stderr and returns code', () => {
  const r = sh('echo a; echo b >&2; exit 4', {});
  assert.equal(r.code, 4);
  assert.match(r.out, /a/);
  assert.match(r.out, /b/);
});

test('sh honors cwd and env', () => {
  const d = tmp();
  try {
    const r = sh('pwd; echo $FOO', { cwd: d, env: { FOO: 'bar' } });
    assert.equal(r.code, 0);
    assert.match(r.out, /bar/);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test('sh returns promptly when a command backgrounds a process', () => {
  const t = Date.now();
  const r = sh('sleep 30 & echo started', {});
  assert.equal(r.code, 0);
  assert.match(r.out, /started/);
  assert.ok(Date.now() - t < 10000);
});

test('sh timeout yields 124', () => {
  const r = sh('sleep 5', { timeoutMs: 300 });
  assert.equal(r.code, 124);
});

test('sh keeps only the last 1 MB', () => {
  const r = sh('head -c 2000000 /dev/zero | tr "\\0" x; echo END', {});
  assert.equal(r.out.length, 1048576);
  assert.match(r.out, /END\n$/);
});

test('git succeeds despite a failing pre-commit hook', () => {
  const d = tmp();
  try {
    initRepo(d);
    writeFileSync(join(d, 'f'), 'x');
    git(['add', 'f'], d);
    git(['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'm'], d);
    assert.equal(git(['log', '--format=%s'], d).trim(), 'm');
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test('git throws with args and stderr on failure', () => {
  const d = tmp();
  try {
    initRepo(d);
    assert.throws(() => git(['checkout', 'nope-branch'], d), (e) => /checkout nope-branch/.test(e.message) && /nope-branch/.test(e.message));
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test('repoDir accepts .git dir or file, rejects otherwise', () => {
  const ws = tmp();
  try {
    const env = { AGENT_WORKSPACE_PATH: ws, REPO_FULL_NAME: 'o/r' };
    assert.throws(() => repoDir(env), new RegExp('repo not found at ' + join(ws, 'r')));
    mkdirSync(join(ws, 'r', '.git'), { recursive: true });
    assert.equal(repoDir(env), join(ws, 'r'));
    rmSync(join(ws, 'r'), { recursive: true });
    mkdirSync(join(ws, 'r'));
    writeFileSync(join(ws, 'r', '.git'), 'gitdir: x');
    assert.equal(repoDir(env), join(ws, 'r'));
  } finally {
    rmSync(ws, { recursive: true, force: true });
  }
});

test('repoDir validates env', () => {
  assert.throws(() => repoDir({ REPO_FULL_NAME: 'o/r' }), /AGENT_WORKSPACE_PATH/);
  assert.throws(() => repoDir({ AGENT_WORKSPACE_PATH: '/x' }), /REPO_FULL_NAME/);
  assert.throws(() => repoDir({ AGENT_WORKSPACE_PATH: '/x', REPO_FULL_NAME: 'noslash' }), /REPO_FULL_NAME/);
});

test('runSuite: stale XML is cleared, no output -> cases null', () => {
  const d = tmp();
  try {
    const junitDir = join(d, 'junit');
    mkdirSync(junitDir);
    writeFileSync(join(junitDir, 'stale.xml'), XML);
    const r = runSuite({ dir: d, setup: '', test: 'echo hi', junitDir, timeoutMs: 20000 });
    assert.equal(r.setupCode, 0);
    assert.equal(r.testCode, 0);
    assert.equal(r.cases, null);
    assert.ok(!existsSync(join(junitDir, 'stale.xml')));
    assert.match(r.log, /== test/);
    assert.doesNotMatch(r.log, /== setup/);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test('runSuite: test writes XML into NIGHTLY_JUNIT_DIR', () => {
  const d = tmp();
  try {
    const junitDir = join(d, 'junit');
    const r = runSuite({
      dir: d,
      setup: 'echo setting up',
      test: `echo '${XML}' > "$NIGHTLY_JUNIT_DIR/r.xml"; exit 1`,
      junitDir,
      timeoutMs: 20000,
    });
    assert.equal(r.setupCode, 0);
    assert.equal(r.testCode, 1);
    assert.equal(r.cases.length, 1);
    assert.match(r.log, /== setup\n[\s\S]*setting up[\s\S]*== test/);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test('runSuite: setup failure skips test', () => {
  const d = tmp();
  try {
    const r = runSuite({ dir: d, setup: 'exit 3', test: `touch "${d}/ran"`, junitDir: join(d, 'j'), timeoutMs: 20000 });
    assert.equal(r.setupCode, 3);
    assert.equal(r.testCode, null);
    assert.equal(r.cases, null);
    assert.ok(!existsSync(join(d, 'ran')));
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test('outputJson writes to OC_OUTPUT_FILE only when set', () => {
  const d = tmp();
  const prev = process.env.OC_OUTPUT_FILE;
  try {
    const f = join(d, 'out.json');
    process.env.OC_OUTPUT_FILE = f;
    outputJson({ a: 1 });
    assert.deepEqual(JSON.parse(readFileSync(f, 'utf8')), { a: 1 });
    delete process.env.OC_OUTPUT_FILE;
    assert.doesNotThrow(() => outputJson({ b: 2 }));
  } finally {
    if (prev === undefined) delete process.env.OC_OUTPUT_FILE;
    else process.env.OC_OUTPUT_FILE = prev;
    rmSync(d, { recursive: true, force: true });
  }
});
