import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const JUNIT_ENTITIES = { quot: '"', apos: "'", lt: '<', gt: '>', amp: '&' };

function junitDecode(s) {
  return s.replace(/&(?:#x([0-9a-fA-F]+)|#(\d+)|(quot|apos|lt|gt|amp));/g, (m, hex, dec, name) => {
    if (name) return JUNIT_ENTITIES[name];
    const cp = hex ? parseInt(hex, 16) : parseInt(dec, 10);
    try {
      return String.fromCodePoint(cp);
    } catch {
      return m;
    }
  });
}

function junitAttrs(raw) {
  const out = {};
  const re = /([^\s=/]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    out[m[1]] = junitDecode(m[2] !== undefined ? m[2] : m[3]);
  }
  return out;
}

export function parseJUnit(xml) {
  // Drop comments and CDATA (failure bodies) so their text can't look like tags.
  const clean = xml.replace(/<!--[\s\S]*?-->/g, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');
  // A report cut short (e.g. a killed run) must not pass for a complete one.
  if (!/(<\/testsuites?\s*>|<testsuites?\b[^>]*\/>)\s*$/.test(clean)) {
    throw new Error('malformed JUnit XML: no closing testsuite tag (truncated?)');
  }
  const tagRe = /<(\/?)(testcase|failure|error|skipped)\b((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  const cases = [];
  let cur = null;
  const finish = () => {
    if (!cur) return;
    const classname = cur.classname;
    const id = classname ? `${classname}::${cur.name}` : `${cur.file ?? ''}::${cur.name}`;
    cases.push({ id, name: cur.name, classname, file: cur.file, status: cur.status });
    cur = null;
  };
  let m;
  while ((m = tagRe.exec(clean)) !== null) {
    const [, closing, tag, rawAttrs, selfClose] = m;
    if (tag === 'testcase') {
      if (closing) {
        finish();
      } else {
        if (cur) throw new Error(`malformed JUnit XML: testcase ${cur.name} is not closed`);
        const a = junitAttrs(rawAttrs);
        cur = { name: a.name ?? '', classname: a.classname ?? '', file: a.file || null, status: 'passed' };
        if (selfClose) finish();
      }
    } else if (cur && !closing) {
      if (tag === 'skipped') {
        if (cur.status !== 'failed') cur.status = 'skipped';
      } else {
        cur.status = 'failed';
      }
    }
  }
  if (cur) throw new Error(`malformed JUnit XML: testcase ${cur.name} is not closed`);
  return cases;
}

function junitFindXml(dir, acc) {
  const entries = readdirSync(dir, { withFileTypes: true });
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) junitFindXml(p, acc);
    else if (e.isFile() && e.name.toLowerCase().endsWith('.xml')) acc.push(p);
  }
  return acc;
}

export function readJUnitDir(dir) {
  const files = junitFindXml(dir, []);
  if (files.length === 0) throw new Error(`no JUnit XML in ${dir}`);
  const cases = [];
  for (const f of files) cases.push(...parseJUnit(readFileSync(f, 'utf8')));
  return cases;
}

export function statusById(cases) {
  const byId = new Map();
  for (const c of cases) {
    const prev = byId.get(c.id);
    if (prev === undefined || c.status === 'failed' || (prev === 'skipped' && c.status === 'passed')) {
      byId.set(c.id, c.status);
    }
  }
  return byId;
}

export function summarize(cases) {
  const byId = statusById(cases);
  let skipped = 0;
  const failing = [];
  for (const [id, status] of byId) {
    if (status === 'skipped') skipped++;
    else if (status === 'failed') failing.push(id);
  }
  failing.sort();
  return { total: byId.size, skipped, failing };
}
