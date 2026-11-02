import { formatMarker, parseMarker } from './marker.mjs';

export const NIGHTLY_LABEL = 'nightly-test-failure';
export const NIGHTLY_SETUP_LABEL = 'nightly-setup-failure';
export const NIGHTLY_NO_JUNIT_TITLE = 'Test suite failing (no per-test results)';

export const NIGHTLY_UNGROUPED_TITLE = 'Ungrouped failures';
// GitHub caps issue and comment bodies at 65536 characters.
const DEDUPE_BODY_MAX = 65000;
const DEDUPE_LIST_MAX = 50;
const DEDUPE_NOTE_IDS = 10;

function dedupeTickRun(s) {
  return Math.max(0, ...(String(s).match(/`+/g) || []).map((r) => r.length));
}

// A fenced block whose fence is longer than any backtick run in the content.
export function dedupeFenced(content) {
  const fence = '`'.repeat(Math.max(3, dedupeTickRun(content) + 1));
  return `${fence}\n${content}\n${fence}`;
}

// Inline code that survives backticks in the content.
export function dedupeInline(content) {
  const n = dedupeTickRun(content);
  const ticks = '`'.repeat(n + 1);
  return n ? `${ticks} ${content} ${ticks}` : `${ticks}${content}${ticks}`;
}

// The first DEDUPE_LIST_MAX ids as list items, then a count of the rest.
export function dedupeIdList(ids) {
  const lines = ids.slice(0, DEDUPE_LIST_MAX).map((t) => `- ${t}`);
  if (ids.length > DEDUPE_LIST_MAX) lines.push(`… and ${ids.length - DEDUPE_LIST_MAX} more`);
  return lines;
}

// Cut human-readable text so it plus `tail` (the marker, if any) stays under the body cap.
export function dedupeFit(text, tail = '') {
  const room = DEDUPE_BODY_MAX - tail.length;
  if (text.length <= room) return text + tail;
  const cut = '\n… (truncated)\n\n';
  let head = text.slice(0, Math.max(0, room - cut.length));
  if (head.lastIndexOf('\n') > 0) head = head.slice(0, head.lastIndexOf('\n'));
  return head + cut + tail;
}

function dedupeNoteIds(ids) {
  const shown = ids.slice(0, DEDUPE_NOTE_IDS).join(', ');
  return ids.length > DEDUPE_NOTE_IDS ? `${shown}, … and ${ids.length - DEDUPE_NOTE_IDS} more` : shown;
}

// Make the agent's causes a partition of the failing ids, deterministically: unknown ids are
// dropped, a duplicate id stays only in its first cause, empty causes are dropped, and ids in no
// cause go to an extra "Ungrouped failures" cause that runs the full test command.
export function dedupePartition(failing, causes, testCommand) {
  const fset = new Set(failing);
  const owner = new Map();
  const unknown = [];
  const duplicate = [];
  const notes = [];
  const kept = [];
  for (const c of causes) {
    const tests = [];
    for (const t of c.tests) {
      if (!fset.has(t)) { unknown.push(t); continue; }
      if (owner.has(t)) { duplicate.push(t); continue; }
      owner.set(t, c.title);
      tests.push(t);
    }
    if (tests.length === 0) notes.push(`cause "${c.title}" has no tests; dropped`);
    else kept.push({ ...c, tests });
  }
  if (unknown.length) notes.push(`${unknown.length} unknown test id(s) dropped: ${dedupeNoteIds(unknown)}`);
  if (duplicate.length) notes.push(`${duplicate.length} duplicate test id(s) kept only in their first cause: ${dedupeNoteIds(duplicate)}`);
  const missing = [...fset].filter((t) => !owner.has(t));
  if (missing.length) {
    notes.push(`${missing.length} failing test(s) in no cause moved to "${NIGHTLY_UNGROUPED_TITLE}": ${dedupeNoteIds(missing)}`);
    kept.push({
      title: NIGHTLY_UNGROUPED_TITLE,
      summary: 'Failing tests the grouping step did not assign to any cause.',
      tests: missing,
      causeCommand: testCommand,
    });
  }
  return { causes: kept, notes };
}

export function dedupeOpenBody(cause, results, marker) {
  const lines = [cause.summary || cause.title, '', `Commit: ${results.sha}`, `Setup: ${dedupeInline(results.setup)}`, `Test: ${dedupeInline(results.test)}`, ''];
  if (cause.tests.length) lines.push('Failing tests:', ...dedupeIdList(cause.tests), '');
  lines.push('');
  return dedupeFit(lines.join('\n'), formatMarker(marker));
}

export function planIssues({ results, causes, openIssues, setupFailed }) {
  const labelled = (l) => openIssues.filter((i) => Array.isArray(i.labels) && i.labels.includes(l));
  const setupIssues = labelled(NIGHTLY_SETUP_LABEL).sort((a, b) => a.number - b.number);
  if (setupFailed) {
    const body = dedupeFit(`Nightly setup failed on ${results.sha}.\n\n${dedupeFenced(setupFailed.log)}`);
    const existing = setupIssues[0];
    if (existing) return { actions: [{ type: 'comment', issue: existing.number, body }], notes: [] };
    return { actions: [{ type: 'open-setup', title: 'Nightly setup failing', body, labels: [NIGHTLY_SETUP_LABEL] }], notes: [] };
  }
  const actions = setupIssues.map((i) => ({ type: 'close', issue: i.number, body: `Setup succeeded on ${results.sha}; closing.` }));

  const noJunitFail = !results.junit && results.testCode !== 0;
  let effective;
  let notes = [];
  if (results.junit) ({ causes: effective, notes } = dedupePartition(results.failing || [], causes, results.test));
  else effective = noJunitFail ? [{ title: NIGHTLY_NO_JUNIT_TITLE, summary: 'The test suite failed and produced no per-test results.', tests: [], causeCommand: results.test }] : [];

  const issues = labelled(NIGHTLY_LABEL)
    .map((i) => ({ number: i.number, marker: parseMarker(i.body) }))
    .filter((i) => i.marker)
    .sort((a, b) => a.number - b.number);

  const commented = new Set();
  for (const cause of effective) {
    const hit = issues.find((i) => (results.junit
      ? i.marker.junit && cause.tests.some((t) => i.marker.tests.includes(t))
      : !i.marker.junit));
    if (hit) {
      const ids = cause.tests.length ? `\n\nFailing:\n${dedupeIdList(cause.tests).join('\n')}` : '';
      actions.push({ type: 'comment', issue: hit.number, body: dedupeFit(`Still failing on ${results.sha}${ids}`) });
      if (!commented.has(hit.number)) {
        commented.add(hit.number);
        if (hit.marker.greenNights !== 0) actions.push({ type: 'set-marker', issue: hit.number, marker: formatMarker({ ...hit.marker, greenNights: 0 }) });
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
  return { actions, notes };
}
