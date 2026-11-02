import { git, repoDir, outputJson } from '../../scripts/lib/nightly/exec.mjs';
import { parseMarker, markerTrustedLabels } from '../../scripts/lib/nightly/marker.mjs';

const PRECHECK_MAX_OPEN = 3;
const PRECHECK_PREFIX = 'refs/heads/nightly-fix/';

// Exact ref names from `git ls-remote` output (sha<TAB>ref per line).
export function precheckFixBranches(out) {
  return String(out).split('\n')
    .map((l) => l.split('\t')[1])
    .filter((ref) => typeof ref === 'string' && ref.startsWith(PRECHECK_PREFIX) && ref.length > PRECHECK_PREFIX.length);
}

export async function main(env, deps = { git, outputJson }) {
  if (!markerTrustedLabels(env.ISSUE_LABELS)) throw new Error('issue is not labelled nightly-test-failure');
  const marker = parseMarker(env.ISSUE_BODY);
  if (!marker) throw new Error('no baseline marker in the issue body');
  const n = String(env.ISSUE_NUMBER ?? '');
  if (!/^[1-9][0-9]*$/.test(n)) throw new Error(`ISSUE_NUMBER is not a positive integer: ${JSON.stringify(n)}`);
  const branch = `nightly-fix/${n}`;
  const dir = repoDir(env);

  const heads = precheckFixBranches(deps.git(['ls-remote', '--heads', 'origin', `${PRECHECK_PREFIX}*`], dir));
  let reason = null;
  if (heads.includes(`refs/heads/${branch}`)) reason = `fix branch ${branch} already exists`;
  // Counts branches, not open PRs: merged or closed fix branches still count until deleted.
  else if (heads.length >= PRECHECK_MAX_OPEN) {
    reason = `${heads.length} nightly-fix/* branches exist on origin; delete merged/closed ones (or enable "Automatically delete head branches")`;
  }
  if (reason) {
    deps.outputJson({ skip: true, reason });
    throw new Error(`skip: ${reason}`);
  }

  // Fetch only when the clone does not already have the commit.
  try {
    deps.git(['cat-file', '-e', `${marker.sha}^{commit}`], dir);
  } catch {
    deps.git(['fetch', 'origin', marker.sha], dir);
  }
  deps.git(['checkout', '-b', branch, marker.sha], dir);
  console.log(`precheck: ${branch} at ${marker.sha}`);
  deps.outputJson({ branch, base: marker.sha });
}
