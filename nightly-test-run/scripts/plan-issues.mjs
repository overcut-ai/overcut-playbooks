import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { planIssues } from '../../scripts/lib/nightly/dedupe.mjs';
import { outputJson } from '../../scripts/lib/nightly/exec.mjs';

// GitHub caps issue bodies at 65536 characters; keep the setup log's tail well under it.
const PLAN_SETUP_LOG_MAX = 20000;

function planRead(stateDir, name) {
  const f = join(stateDir, name);
  if (!existsSync(f)) throw new Error(`${f} not found`);
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch (e) {
    throw new Error(`${f} is not valid JSON: ${e.message}`);
  }
}

export function planOpenIssues(raw) {
  if (!Array.isArray(raw)) throw new Error('open-issues.json must be a JSON array');
  return raw.map((i, n) => {
    if (!i || !Number.isInteger(i.number) || !Array.isArray(i.labels)) {
      throw new Error(`open-issues.json entry ${n} needs an integer "number" and a "labels" array`);
    }
    const labels = i.labels.map((l) => (typeof l === 'string' ? l : l && l.name)).filter((l) => typeof l === 'string');
    return { number: i.number, labels, body: typeof i.body === 'string' ? i.body : '' };
  });
}

export function planCauses(raw) {
  if (!Array.isArray(raw)) throw new Error('causes.json must be a JSON array');
  raw.forEach((c, n) => {
    const ok = c && typeof c.title === 'string' && c.title.trim() && typeof c.summary === 'string'
      && Array.isArray(c.tests) && c.tests.every((t) => typeof t === 'string') && typeof c.causeCommand === 'string';
    if (!ok) throw new Error(`causes.json entry ${n} needs string "title", "summary", "causeCommand" and a "tests" array of strings`);
  });
  return raw;
}

export async function main(env, deps = { outputJson }) {
  if (!env.AGENT_WORKSPACE_PATH) throw new Error('AGENT_WORKSPACE_PATH is not set');
  const stateDir = join(env.AGENT_WORKSPACE_PATH, '.nightly');
  const results = planRead(stateDir, 'results.json');
  const openIssues = planOpenIssues(planRead(stateDir, 'open-issues.json'));
  const setupFailed = results.status === 'setup-failed' ? { log: String(results.log || '').slice(-PLAN_SETUP_LOG_MAX) } : null;
  // Causes only matter on a red night with per-test results; planIssues ignores them otherwise.
  const causes = results.status === 'red' && results.junit ? planCauses(planRead(stateDir, 'causes.json')) : [];
  // Causes that do not partition the failing ids are corrected deterministically; notes say how.
  const { actions, notes } = planIssues({ results, causes, openIssues, setupFailed });
  writeFileSync(join(stateDir, 'plan.json'), JSON.stringify(actions, null, 2));
  console.log(`nightly plan: ${actions.length} action(s): ${actions.map((a) => a.type).join(', ') || 'none'}`);
  for (const n of notes) console.log(`nightly plan note: ${n}`);
  deps.outputJson({ actions: actions.length, notes });
}
