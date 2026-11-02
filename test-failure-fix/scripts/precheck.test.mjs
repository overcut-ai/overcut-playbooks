import { test } from 'node:test';
import assert from 'node:assert/strict';
import { git } from '../../scripts/lib/nightly/exec.mjs';
import { makeRepo, issueBody, tgit } from './fixtures/repo.mjs';
import { main } from './precheck.mjs';

// A fresh clone like git.clone's: on main, the marker sha one commit behind origin/main.
function setup() {
  const r = makeRepo({ 'a.txt': 'a\n' });
  const base = r.base;
  tgit(['checkout', '-q', 'main'], r.dir);
  tgit(['branch', '-q', '-D', 'nightly-fix/7'], r.dir);
  r.commit({ 'a.txt': 'b\n' }, 'later');
  tgit(['push', '-q', 'origin', 'HEAD:refs/heads/main'], r.dir);
  const calls = { git: [], out: [] };
  const deps = {
    git: (args, cwd) => { calls.git.push(args); return git(args, cwd); },
    outputJson: (o) => calls.out.push(o),
  };
  const env = (extra = {}) => ({
    AGENT_WORKSPACE_PATH: r.ws, REPO_FULL_NAME: 'o/repo', ISSUE_NUMBER: '7',
    ISSUE_BODY: issueBody({ sha: base, tests: ['t::a'], allFailing: ['t::a'], total: 1, test: 'x', causeCommand: 'x' }),
    ...extra,
  });
  const pushBranch = (name) => tgit(['push', '-q', 'origin', `${base}:refs/heads/${name}`], r.dir);
  return { ...r, base, calls, deps, env, pushBranch };
}

const checkouts = (t) => t.calls.git.filter((a) => a.includes('checkout'));

test('creates nightly-fix/<issue> at the marker sha and outputs {branch, base}', async () => {
  const t = setup();
  try {
    t.pushBranch('nightly-fix/1');
    t.pushBranch('nightly-fix/2');
    t.pushBranch('x/nightly-fix/3');
    t.pushBranch('nightly-fix-4');
    await main(t.env(), t.deps);
    assert.deepEqual(t.calls.out, [{ branch: 'nightly-fix/7', base: t.base }]);
    assert.equal(tgit(['rev-parse', 'HEAD'], t.dir).trim(), t.base);
    assert.equal(tgit(['symbolic-ref', '--short', 'HEAD'], t.dir).trim(), 'nightly-fix/7');
  } finally { t.cleanup(); }
});

test('existing fix branch -> skip output, exit 1, no checkout', async () => {
  const t = setup();
  try {
    t.pushBranch('nightly-fix/7');
    await assert.rejects(main(t.env(), t.deps), /fix branch nightly-fix\/7 already exists/);
    assert.deepEqual(t.calls.out, [{ skip: true, reason: 'fix branch nightly-fix/7 already exists' }]);
    assert.deepEqual(checkouts(t), []);
  } finally { t.cleanup(); }
});

test('3 open nightly-fix branches -> skip output, exit 1, no checkout', async () => {
  const t = setup();
  try {
    for (const n of [1, 2, 3]) t.pushBranch(`nightly-fix/${n}`);
    await assert.rejects(main(t.env(), t.deps), /3 open nightly-fix branches/);
    assert.deepEqual(t.calls.out, [{ skip: true, reason: '3 open nightly-fix branches' }]);
    assert.deepEqual(checkouts(t), []);
  } finally { t.cleanup(); }
});

for (const [label, extra, re] of [
  ['no marker', { ISSUE_BODY: 'plain text' }, /no baseline marker/],
  ['undefined body', { ISSUE_BODY: undefined }, /no baseline marker/],
  ['bad issue number', { ISSUE_NUMBER: '7; rm -rf /' }, /ISSUE_NUMBER/],
  ['zero issue number', { ISSUE_NUMBER: '0' }, /ISSUE_NUMBER/],
  ['empty issue number', { ISSUE_NUMBER: '' }, /ISSUE_NUMBER/],
]) {
  test(`${label} -> exit 1, no git calls, no output`, async () => {
    const t = setup();
    try {
      await assert.rejects(main(t.env(extra), t.deps), re);
      assert.deepEqual(t.calls.git, []);
      assert.deepEqual(t.calls.out, []);
    } finally { t.cleanup(); }
  });
}
