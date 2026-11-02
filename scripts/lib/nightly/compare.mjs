import { summarize, statusById } from './junit.mjs';

export function compareResults({ baseline, fixCases, causeIds, rerunFailed }) {
  const status = statusById(fixCases);
  const sum = summarize(fixCases);
  const causeReasons = [...causeIds].sort()
    .filter((id) => !status.has(id) || status.get(id) === 'skipped' || status.get(id) === 'failed')
    .map((id) => `cause test still failing: ${id}`);
  const known = new Set([...baseline.allFailing, ...causeIds]);
  const candidates = [...sum.failing].filter((id) => !known.has(id)).sort();
  const newReasons = [];
  if (candidates.length > 0) {
    const ret = rerunFailed(candidates);
    if (!Array.isArray(ret) || !ret.every((x) => typeof x === 'string')) throw new TypeError('rerunFailed must return string[]');
    const still = new Set(ret);
    for (const id of candidates) if (still.has(id)) newReasons.push(`new failure: ${id}`);
  }
  const countReasons = [];
  const n = sum.total;
  if (n < baseline.total) countReasons.push(`fewer tests than baseline: ${n} < ${baseline.total}`);
  if (sum.skipped > baseline.skipped) countReasons.push(`more skipped than baseline: ${sum.skipped} > ${baseline.skipped}`);
  const reasons = [...causeReasons, ...newReasons, ...countReasons];
  return { ok: reasons.length === 0, reasons };
}

export function redCheck({ unmodifiedCases, overlayCases, causeIds }) {
  const before = new Set(unmodifiedCases.map((t) => t.id));
  const status = statusById(overlayCases);
  const newIds = [...new Set(overlayCases.map((t) => t.id))].filter((id) => !before.has(id)).sort();
  const reasons = [];
  for (const id of [...causeIds].sort()) {
    if (status.has(id) && status.get(id) !== 'failed') reasons.push(`cause test passes on old code: ${id}`);
  }
  for (const id of newIds) {
    if (status.get(id) !== 'failed') reasons.push(`new test passes on old code: ${id}`);
  }
  return { ok: reasons.length === 0, reasons, newIds };
}
