import { test } from 'node:test';
import assert from 'node:assert/strict';
import { git } from '../../scripts/lib/nightly/exec.mjs';
import { makeRepo, tgit } from './fixtures/repo.mjs';
import { main } from './assert-head.mjs';

function setup() {
  const r = makeRepo({ 'a.txt': 'a\n' });
  const sha = r.commit({ 'a.txt': 'fixed\n' });
  tgit(['push', '-q', 'origin', `${sha}:refs/heads/nightly-fix/7`], r.dir);
  const out = [];
  const deps = { git, outputJson: (o) => out.push(o) };
  const env = (extra = {}) => ({ AGENT_WORKSPACE_PATH: r.ws, REPO_FULL_NAME: 'o/repo', BRANCH: 'nightly-fix/7', SHA: sha, ...extra });
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
]) {
  test(`${label} -> exit 1`, async () => {
    const t = setup();
    try {
      await assert.rejects(main(t.env(extra), t.deps), re);
      assert.deepEqual(t.out, []);
    } finally { t.cleanup(); }
  });
}
