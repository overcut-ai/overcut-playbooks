const MARKER_PREFIX = '<!-- nightly-test-failure ';
const MARKER_SUFFIX = ' -->';

// GitHub caps issue bodies at 65536 characters; the marker line alone stays under this.
export const MARKER_BUDGET = 60000;

function markerLine(b) {
  const o = {
    sha: b.sha, junit: b.junit, tests: b.tests, allFailing: b.allFailing,
    total: b.total, skipped: b.skipped, setup: b.setup, test: b.test,
    causeCommand: b.causeCommand, greenNights: b.greenNights,
  };
  if (b.allFailingTruncated === true) o.allFailingTruncated = true;
  if (b.testsTruncated === true) o.testsTruncated = true;
  const json = JSON.stringify(o).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
  return MARKER_PREFIX + json + MARKER_SUFFIX;
}

// Over budget: drop allFailing (allFailingTruncated), then keep the longest sorted prefix of
// tests that fits (testsTruncated). Readers treat both flags fail-closed.
export function formatMarker(b) {
  let line = markerLine(b);
  if (line.length <= MARKER_BUDGET) return line;
  const noAll = { ...b, allFailing: [], allFailingTruncated: true };
  line = markerLine(noAll);
  if (line.length <= MARKER_BUDGET) return line;
  const sorted = [...b.tests].sort();
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (markerLine({ ...noAll, tests: sorted.slice(0, mid), testsTruncated: true }).length <= MARKER_BUDGET) lo = mid;
    else hi = mid - 1;
  }
  line = markerLine({ ...noAll, tests: sorted.slice(0, lo), testsTruncated: true });
  if (line.length > MARKER_BUDGET) throw new Error(`marker exceeds ${MARKER_BUDGET} characters even without test ids`);
  return line;
}

export function markerIsStrArray(a) {
  return Array.isArray(a) && a.every((x) => typeof x === 'string');
}

export function markerIsCount(n) {
  return Number.isInteger(n) && n >= 0;
}

export function parseMarker(body) {
  if (typeof body !== 'string') return null;
  const found = [...body.matchAll(new RegExp(MARKER_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(.*?)' + MARKER_SUFFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))];
  if (found.length !== 1) return null;
  let o;
  try { o = JSON.parse(found[0][1]); } catch { return null; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  if (typeof o.sha !== 'string' || !/^[0-9a-f]{40}$/i.test(o.sha)) return null;
  if (typeof o.junit !== 'boolean') return null;
  if (!markerIsStrArray(o.tests) || !markerIsStrArray(o.allFailing)) return null;
  if (!markerIsCount(o.total) || !markerIsCount(o.skipped) || !markerIsCount(o.greenNights)) return null;
  if (typeof o.setup !== 'string' || typeof o.test !== 'string' || typeof o.causeCommand !== 'string') return null;
  if ('allFailingTruncated' in o && o.allFailingTruncated !== true) return null;
  if ('testsTruncated' in o && o.testsTruncated !== true) return null;
  const m = {
    sha: o.sha, junit: o.junit, tests: o.tests, allFailing: o.allFailing,
    total: o.total, skipped: o.skipped, setup: o.setup, test: o.test,
    causeCommand: o.causeCommand, greenNights: o.greenNights,
  };
  if (o.allFailingTruncated) m.allFailingTruncated = true;
  if (o.testsTruncated) m.testsTruncated = true;
  return m;
}

// Provenance: only triage+ users (and the nightly run) can label an issue, so the label shows
// the marker came through a trusted path. `raw` is the trigger issue's labels as JSON: an array
// of names or of {name} objects. Anything else is untrusted.
export function markerTrustedLabels(raw) {
  let a;
  try { a = JSON.parse(String(raw ?? '')); } catch { return false; }
  if (!Array.isArray(a)) return false;
  return a.some((l) => (typeof l === 'string' ? l : l && typeof l === 'object' ? l.name : null) === 'nightly-test-failure');
}
