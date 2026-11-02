const MARKER_PREFIX = '<!-- nightly-baseline: ';
const MARKER_SUFFIX = ' -->';

export function formatMarker(b) {
  const json = JSON.stringify({
    sha: b.sha, junit: b.junit, tests: b.tests, allFailing: b.allFailing,
    total: b.total, skipped: b.skipped, setup: b.setup, test: b.test,
    causeCommand: b.causeCommand, greenNights: b.greenNights,
  }).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
  return MARKER_PREFIX + json + MARKER_SUFFIX;
}

export function markerIsStrArray(a) {
  return Array.isArray(a) && a.every((x) => typeof x === 'string');
}

export function markerIsCount(n) {
  return Number.isInteger(n) && n >= 0;
}

export function parseMarker(body) {
  if (typeof body !== 'string') return null;
  const found = [...body.matchAll(/<!-- nightly-baseline: (.*?) -->/g)];
  if (found.length !== 1) return null;
  let o;
  try { o = JSON.parse(found[0][1]); } catch { return null; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  if (typeof o.sha !== 'string' || !/^[0-9a-f]{40}$/i.test(o.sha)) return null;
  if (typeof o.junit !== 'boolean') return null;
  if (!markerIsStrArray(o.tests) || !markerIsStrArray(o.allFailing)) return null;
  if (!markerIsCount(o.total) || !markerIsCount(o.skipped) || !markerIsCount(o.greenNights)) return null;
  if (typeof o.setup !== 'string' || typeof o.test !== 'string' || typeof o.causeCommand !== 'string') return null;
  return {
    sha: o.sha, junit: o.junit, tests: o.tests, allFailing: o.allFailing,
    total: o.total, skipped: o.skipped, setup: o.setup, test: o.test,
    causeCommand: o.causeCommand, greenNights: o.greenNights,
  };
}
