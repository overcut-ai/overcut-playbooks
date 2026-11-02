import { git, repoDir, outputJson } from '../../scripts/lib/nightly/exec.mjs';

// The URL may embed a token: keep it out of every message.
function assertHeadRedact(msg, url) {
  return String(msg).split(url).join('<push-url>').replace(/([a-z][a-z0-9+.-]*:\/\/)[^@/\s]+@/gi, '$1***@');
}

// The PR head must be exactly the commit verify tested and pushed, read from the URL verify pushed to.
export async function main(env, deps = { git, outputJson }) {
  const branch = String(env.BRANCH ?? '');
  const sha = String(env.SHA ?? '').toLowerCase();
  const url = String(env.PUSH_URL ?? '');
  if (!/^nightly-fix\/[1-9][0-9]*$/.test(branch)) throw new Error(`BRANCH is not a nightly-fix branch: ${JSON.stringify(branch)}`);
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`SHA is not 40 hex characters: ${JSON.stringify(env.SHA)}`);
  if (!url.trim() || /[\r\n]/.test(url)) throw new Error('PUSH_URL is not set');
  const dir = repoDir(env);
  const ref = `refs/heads/${branch}`;
  let out;
  try {
    out = String(deps.git(['ls-remote', url, ref], dir));
  } catch (e) {
    throw new Error(assertHeadRedact(`ls-remote of ${ref} failed: ${e.message}`, url));
  }
  const heads = out.split('\n')
    .map((l) => l.split('\t'))
    .filter((f) => f[1] === ref)
    .map((f) => f[0].toLowerCase());
  if (heads.length !== 1 || heads[0] !== sha) {
    throw new Error(`${ref} is ${heads.join(',') || 'missing'}; does not match verified ${sha}`);
  }
  console.log(`assert-head: ${ref} is ${sha}`);
  deps.outputJson({ ok: true, branch, sha });
}
