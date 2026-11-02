import { test } from 'node:test';
import assert from 'node:assert/strict';
import { git } from '../../../scripts/lib/nightly/exec.mjs';
import { makeRepo, tgit } from './fixtures/repo.mjs';
import { main } from './assert-head.mjs';

function setup() {
  const r = makeRepo({ 'a.txt': 'a\n' });
  const sha = r.commit({ 'a.txt': 'fixed\n' });
  tgit(['push', '-q', 'origin', `${sha}:refs/heads/nightly-fix/7`], r.dir);
  const out = [];
  const deps = { git, outputJson: (o) => out.push(o) };
  const env = (extra = {}) => ({ AGENT_WORKSPACE_PATH: r.ws, REPO_FULL_NAME: 'o/repo', BRANCH: 'nightly-fix/7', SHA: sha, PUSH_URL: r.origin, ...extra });
  return { ...r, sha, out, deps, env };
}

test('remote branch head equals the verified SHA -> ok', async () => {
  const t = setup();
  try {
    await main(t.env(), t.deps);
    assert.deepEqual(t.out, [{ ok: true, branch: 'nightly-fix/7', sha: t.sha }]);
  } finally { t.cleanup(); }
});

test('remote branch moved (e.g. an agent pushed) -> exit 1', async () => {
  const t = setup();
  try {
    const other = t.commit({ 'a.txt': 'sneaky\n' });
    tgit(['push', '-q', '-f', 'origin', `${other}:refs/heads/nightly-fix/7`], t.dir);
    await assert.rejects(main(t.env(), t.deps), /does not match/);
    assert.deepEqual(t.out, []);
  } finally { t.cleanup(); }
});

for (const [label, extra, re] of [
  ['branch missing on origin', { BRANCH: 'nightly-fix/8' }, /does not match/],
  ['SHA not 40 hex', { SHA: 'abc' }, /SHA/],
  ['SHA empty (verify output missing)', { SHA: '' }, /SHA/],
  ['BRANCH not a fix branch', { BRANCH: 'main' }, /BRANCH/],
  ['PUSH_URL missing (verify output missing)', { PUSH_URL: '' }, /PUSH_URL/],
]) {
  test(`${label} -> exit 1`, async () => {
    const t = setup();
    try {
      await assert.rejects(main(t.env(extra), t.deps), re);
      assert.deepEqual(t.out, []);
    } finally { t.cleanup(); }
  });
}

test('reads the pinned PUSH_URL, not origin: a rewritten origin does not fool it', async () => {
  const t = setup();
  try {
    const fake = `${t.ws}/fake.git`;
    tgit(['init', '-q', '--bare', fake], t.ws);
    tgit(['push', '-q', fake, `${t.sha}:refs/heads/nightly-fix/7`], t.dir);
    const other = t.commit({ 'a.txt': 'sneaky\n' });
    tgit(['push', '-q', '-f', 'origin', `${other}:refs/heads/nightly-fix/7`], t.dir);
    tgit(['remote', 'set-url', 'origin', fake], t.dir);
    await assert.rejects(main(t.env(), t.deps), /does not match/);
  } finally { t.cleanup(); }
});

test('an unreachable PUSH_URL fails without printing the URL', async () => {
  const t = setup();
  try {
    const url = `${t.ws}/secret-token-xyz/missing.git`;
    const err = await main(t.env({ PUSH_URL: url }), t.deps).then(() => null, (e) => e);
    assert.ok(err);
    assert.equal(String(err.message).includes('secret-token-xyz'), false, err.message);
    assert.deepEqual(t.out, []);
  } finally { t.cleanup(); }
});
