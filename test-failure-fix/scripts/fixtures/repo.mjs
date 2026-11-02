// Test fixtures: temp git repos with a bare origin, and a fake test runner that writes JUnit
// from the source under test. Not a step script (sync-scripts.py only bundles scripts/*.mjs).
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { formatMarker } from '../../../scripts/lib/nightly/marker.mjs';

// Test files declare cases as lines `# CASE <name> <target file> <needle>` (or `// CASE ...`):
// a case passes when <target file> contains <needle>. `CASE-FLAKY <name>` fails on the first
// run of the workspace and passes afterwards. Env: FAKE_NO_XML=1 exits 2 with no XML (a
// compile error); FAKE_FILE_STYLE=rel|abs|dot|back picks the JUnit `file` attribute form.
const RUNNER = String.raw`
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
if (process.env.FAKE_NO_XML) { console.error('error: does not compile'); process.exit(2); }
const root = process.cwd();
const files = [];
(function walk(d) {
  for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (e.name === '.git' || e.name === 'node_modules') continue;
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p); else files.push(p);
  }
})(root);
const style = process.env.FAKE_FILE_STYLE || 'rel';
const flakeState = process.env.FAKE_FLAKE_STATE;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
let xml = '<testsuites><testsuite name="fake">';
let failed = false;
for (const f of files) {
  const rel = relative(root, f).split('\\').join('/');
  const src = readFileSync(f, 'utf8');
  const cls = rel.replace(/\.[^./]*$/, '').split('/').join('.');
  const file = style === 'abs' ? join(root, rel) : style === 'dot' ? './' + rel : style === 'back' ? rel.split('/').join('\\') : rel;
  for (const m of src.matchAll(/^(?:#|\/\/) CASE(-FLAKY)? (\S+)(?: (\S+) (.+))?$/gm)) {
    let ok;
    if (m[1]) {
      ok = !!flakeState && existsSync(flakeState);
      if (flakeState) writeFileSync(flakeState, 'ran');
    } else {
      try { ok = readFileSync(join(root, m[3]), 'utf8').includes(m[4]); } catch { ok = false; }
    }
    if (!ok) failed = true;
    xml += '<testcase classname="' + esc(cls) + '" name="' + esc(m[2]) + '" file="' + esc(file) + '">' +
      (ok ? '' : '<failure message="assertion failed"/>') + '</testcase>';
  }
}
xml += '</testsuite></testsuites>';
writeFileSync(join(process.env.NIGHTLY_JUNIT_DIR, 'results.xml'), xml);
process.exit(failed ? 1 : 0);
`;

export function tgit(args, cwd) {
  return execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', '-c', 'init.defaultBranch=main', ...args], {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function writeTree(dir, files) {
  for (const [p, content] of Object.entries(files)) {
    const full = join(dir, p);
    if (content === null) {
      rmSync(full, { force: true });
    } else {
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, content);
    }
  }
}

// A workspace like Overcut's: $ws/repo (the clone, on branch nightly-fix/7 at base), $ws/origin.git.
export function makeRepo(files) {
  const ws = mkdtempSync(join(tmpdir(), 'fix-'));
  const runner = join(ws, 'runner.mjs');
  writeFileSync(runner, RUNNER);
  const origin = join(ws, 'origin.git');
  tgit(['init', '-q', '--bare', origin], ws);
  const dir = join(ws, 'repo');
  tgit(['init', '-q', dir], ws);
  writeTree(dir, files);
  tgit(['add', '-A'], dir);
  tgit(['commit', '-q', '-m', 'base'], dir);
  tgit(['remote', 'add', 'origin', origin], dir);
  tgit(['push', '-q', 'origin', 'HEAD:refs/heads/main'], dir);
  const base = tgit(['rev-parse', 'HEAD'], dir).trim();
  tgit(['checkout', '-q', '-b', 'nightly-fix/7'], dir);
  const commit = (changes, msg = 'fix') => {
    writeTree(dir, changes);
    tgit(['add', '-A'], dir);
    tgit(['commit', '-q', '--allow-empty', '-m', msg], dir);
    return tgit(['rev-parse', 'HEAD'], dir).trim();
  };
  const remoteHead = (branch) => {
    const out = tgit(['ls-remote', origin, `refs/heads/${branch}`], ws).trim();
    return out ? out.split('\t')[0] : null;
  };
  const cleanup = () => rmSync(ws, { recursive: true, force: true });
  return { ws, dir, origin, base, runner, commit, remoteHead, cleanup, test: `node ${JSON.stringify(runner)}` };
}

export function issueBody(over) {
  return `Failing tests\n\n${formatMarker({
    junit: true, tests: [], allFailing: [], total: 0, skipped: 0, setup: '', test: '', causeCommand: '',
    greenNights: 0, ...over,
  })}\n`;
}

export function installHooks(dir, sentinel) {
  const hook = `#!/bin/sh\necho "$0" >> ${JSON.stringify(sentinel)}\n`;
  const custom = join(dirname(dir), 'hooks-custom');
  for (const hdir of [join(dir, '.git', 'hooks'), custom]) {
    mkdirSync(hdir, { recursive: true });
    for (const name of ['pre-push', 'post-checkout', 'reference-transaction', 'pre-commit', 'post-index-change']) {
      writeFileSync(join(hdir, name), hook);
      chmodSync(join(hdir, name), 0o755);
    }
  }
  tgit(['config', 'core.hooksPath', custom], dir);
  return () => existsSync(sentinel);
}
