import { spawnSync, execFileSync } from 'node:child_process';
import { openSync, closeSync, readSync, fstatSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir, constants as osConstants } from 'node:os';
import { join, resolve } from 'node:path';
import { readJUnitDir } from './junit.mjs';

const EXEC_TAIL = 1048576;

function execTailOfFd(fd) {
  const size = fstatSync(fd).size;
  const len = Math.min(size, EXEC_TAIL);
  const buf = Buffer.alloc(len);
  let off = 0;
  while (off < len) {
    const n = readSync(fd, buf, off, len - off, size - len + off);
    if (n <= 0) break;
    off += n;
  }
  return buf.subarray(0, off).toString('utf8');
}

export function sh(cmd, { cwd, env, timeoutMs } = {}) {
  const logPath = join(tmpdir(), `nightly-sh-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.log`);
  const fd = openSync(logPath, 'w+');
  try {
    const r = spawnSync('bash', ['-c', cmd], {
      cwd,
      env: { ...process.env, ...(env || {}) },
      stdio: ['ignore', fd, fd],
      timeout: timeoutMs,
    });
    const out = execTailOfFd(fd);
    let code;
    if (r.error && r.error.code === 'ETIMEDOUT') code = 124;
    else if (r.error) return { code: 127, out: out + String(r.error.message) };
    else if (r.status !== null) code = r.status;
    else code = 128 + (osConstants.signals[r.signal] || 0);
    return { code, out };
  } finally {
    closeSync(fd);
    rmSync(logPath, { force: true });
  }
}

export function git(args, cwd) {
  try {
    return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 256 * 1024 * 1024,
    });
  } catch (e) {
    const stderr = e.stderr ? String(e.stderr) : '';
    throw new Error(`git ${args.join(' ')} failed: ${stderr.trim() || e.message}`);
  }
}

export function repoDir(env) {
  const ws = env.AGENT_WORKSPACE_PATH;
  const full = env.REPO_FULL_NAME;
  if (!ws) throw new Error('AGENT_WORKSPACE_PATH is not set');
  if (!full) throw new Error('REPO_FULL_NAME is not set');
  const name = full.split('/')[1];
  if (!name) throw new Error(`REPO_FULL_NAME has no "/": ${full}`);
  const dir = join(ws, name);
  if (!existsSync(join(dir, '.git'))) throw new Error(`repo not found at ${dir}`);
  return dir;
}

function execTail(s) {
  return s.length > EXEC_TAIL ? s.slice(s.length - EXEC_TAIL) : s;
}

export function runSuite({ dir, setup, test, junitDir, timeoutMs }) {
  const jd = resolve(junitDir);
  rmSync(jd, { recursive: true, force: true });
  mkdirSync(jd, { recursive: true });
  let log = '';
  let setupCode = 0;
  if (setup && setup.trim()) {
    const s = sh(setup, { cwd: dir, timeoutMs });
    setupCode = s.code;
    log += `== setup\n${s.out}\n`;
    if (setupCode !== 0) return { setupCode, testCode: null, cases: null, log: execTail(log) };
  }
  const t = sh(test, { cwd: dir, env: { NIGHTLY_JUNIT_DIR: jd }, timeoutMs });
  log += `== test\n${t.out}\n`;
  // A killed run's partial XML must never read as a result.
  let cases = null;
  if (t.code !== 124) {
    try {
      cases = readJUnitDir(jd);
    } catch (e) {
      cases = null;
    }
  }
  return { setupCode, testCode: t.code, cases, log: execTail(log) };
}

export function outputJson(obj) {
  const f = process.env.OC_OUTPUT_FILE;
  if (f) writeFileSync(f, JSON.stringify(obj));
}
