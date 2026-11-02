import { git, repoDir, outputJson } from '../../scripts/lib/nightly/exec.mjs';

// The PR head must be exactly the commit verify tested and pushed.
export async function main(env, deps = { git, outputJson }) {
  const branch = String(env.BRANCH ?? '');
  const sha = String(env.SHA ?? '').toLowerCase();
  if (!/^nightly-fix\/[1-9][0-9]*$/.test(branch)) throw new Error(`BRANCH is not a nightly-fix branch: ${JSON.stringify(branch)}`);
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`SHA is not 40 hex characters: ${JSON.stringify(env.SHA)}`);
  const dir = repoDir(env);
  const ref = `refs/heads/${branch}`;
  const heads = String(deps.git(['ls-remote', 'origin', ref], dir)).split('\n')
    .map((l) => l.split('\t'))
    .filter((f) => f[1] === ref)
    .map((f) => f[0].toLowerCase());
  if (heads.length !== 1 || heads[0] !== sha) {
    throw new Error(`origin ${ref} is ${heads.join(',') || 'missing'}; does not match verified ${sha}`);
  }
  console.log(`assert-head: ${ref} is ${sha}`);
  deps.outputJson({ ok: true, branch, sha });
}
