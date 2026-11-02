import { formatMarker, parseMarker } from './marker.mjs';

export const NIGHTLY_LABEL = 'nightly-test-failure';
export const NIGHTLY_SETUP_LABEL = 'nightly-setup-failure';
export const NIGHTLY_NO_JUNIT_TITLE = 'Test suite failing (no per-test results)';

export function dedupeCheckPartition(failing, causes, requireTests) {
  const count = new Map();
  for (const c of causes) for (const t of c.tests) count.set(t, (count.get(t) || 0) + 1);
  const fset = new Set(failing);
  const missing = [...fset].filter((t) => !count.has(t));
  const duplicate = [...count].filter(([, n]) => n > 1).map(([t]) => t);
  const unknown = [...count.keys()].filter((t) => !fset.has(t));
  const empty = requireTests ? causes.filter((c) => c.tests.length === 0).map((c) => c.title) : [];
  if (missing.length || duplicate.length || unknown.length || empty.length) {
    throw new Error(`causes do not partition failing tests: missing [${missing.join(', ')}] duplicate [${duplicate.join(', ')}] unknown [${unknown.join(', ')}] empty [${empty.join(', ')}]`);
  }
}

export function dedupeOpenBody(cause, results, marker) {
  const lines = [cause.summary || cause.title, ''];
  if (cause.tests.length) {
    lines.push('Failing tests:', ...cause.tests.map((t) => `- ${t}`), '');
  }
  lines.push(`Commit: ${results.sha}`, `Setup: \`${results.setup}\``, `Test: \`${results.test}\``, '', formatMarker(marker));
  return lines.join('\n');
}

export function planIssues({ results, causes, openIssues, setupFailed }) {
  const labelled = (l) => openIssues.filter((i) => Array.isArray(i.labels) && i.labels.includes(l));
  if (setupFailed) {
    const body = `Nightly setup failed on ${results.sha}.\n\n\`\`\`\n${setupFailed.log}\n\`\`\``;
    const existing = labelled(NIGHTLY_SETUP_LABEL).sort((a, b) => a.number - b.number)[0];
    if (existing) return [{ type: 'comment', issue: existing.number, body }];
    return [{ type: 'open-setup', title: 'Nightly setup failing', body, labels: [NIGHTLY_SETUP_LABEL] }];
  }

  const noJunitFail = !results.junit && results.testCode !== 0;
  const effective = results.junit
    ? causes
    : noJunitFail ? [{ title: NIGHTLY_NO_JUNIT_TITLE, summary: 'The test suite failed and produced no per-test results.', tests: [], causeCommand: results.test }] : [];
  dedupeCheckPartition(results.junit ? results.failing : [], effective, results.junit);

  const issues = labelled(NIGHTLY_LABEL)
    .map((i) => ({ number: i.number, marker: parseMarker(i.body) }))
    .filter((i) => i.marker)
    .sort((a, b) => a.number - b.number);

  const actions = [];
  const commented = new Set();
  for (const cause of effective) {
    const hit = issues.find((i) => (results.junit
      ? i.marker.junit && cause.tests.some((t) => i.marker.tests.includes(t))
      : !i.marker.junit));
    if (hit) {
      const ids = cause.tests.length ? `\n\nFailing:\n${cause.tests.map((t) => `- ${t}`).join('\n')}` : '';
      actions.push({ type: 'comment', issue: hit.number, body: `Still failing on ${results.sha}${ids}` });
      if (!commented.has(hit.number)) {
        commented.add(hit.number);
        actions.push({ type: 'set-marker', issue: hit.number, marker: formatMarker({ ...hit.marker, greenNights: 0 }) });
      }
    } else {
      const marker = {
        sha: results.sha, junit: results.junit, tests: cause.tests, allFailing: results.failing || [],
        total: results.total, skipped: results.skipped, setup: results.setup, test: results.test,
        causeCommand: cause.causeCommand, greenNights: 0,
      };
      actions.push({ type: 'open', title: cause.title, body: dedupeOpenBody(cause, results, marker), labels: [NIGHTLY_LABEL] });
    }
  }

  const failing = new Set(results.failing || []);
  const passed = new Set((results.cases || []).filter((c) => c.status === 'passed').map((c) => c.id));
  for (const { number, marker } of issues) {
    if (commented.has(number)) continue;
    let green;
    if (marker.junit) {
      if (!results.junit) continue;
      if (marker.tests.some((t) => failing.has(t))) green = false;
      else if (marker.tests.some((t) => passed.has(t))) green = true;
      else continue;
    } else {
      green = results.testCode === 0;
    }
    const next = green ? marker.greenNights + 1 : 0;
    if (green && next >= 3) {
      actions.push({ type: 'close', issue: number, body: `Closing: the tests for this issue passed 3 consecutive nightly runs (latest on ${results.sha}).` });
    } else if (next !== marker.greenNights) {
      actions.push({ type: 'set-marker', issue: number, marker: formatMarker({ ...marker, greenNights: next }) });
    }
  }
  return actions;
}
