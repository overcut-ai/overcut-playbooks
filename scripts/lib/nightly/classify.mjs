export const COMPILED_EXTENSIONS = new Set([
  '.go', '.rs', '.java', '.kt', '.kts', '.scala', '.groovy', '.cs', '.fs', '.vb', '.c', '.h', '.cc',
  '.cpp', '.cxx', '.hpp', '.m', '.mm', '.swift', '.dart', '.zig', '.hs', '.ml', '.erl', '.ex', '.exs',
  '.cr', '.nim', '.d',
]);

const CLASSIFY_INTERPRETED = new Set([
  '.py', '.rb', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.php', '.pl', '.lua', '.r', '.sh', '.bash',
]);
const CLASSIFY_TEST_DIRS = new Set(['test', 'tests', 'spec', '__tests__']);
const CLASSIFY_TEST_BASENAMES = [
  /^.*_test\..*$/s, /^test_.*\..*$/s, /^.*Test\..*$/s, /^.*Tests\..*$/s, /^.*\.spec\..*$/s, /^.*\.test\..*$/s,
];
const CLASSIFY_PROTECTED_PREFIXES = ['.github/', '.circleci/'];
const CLASSIFY_PROTECTED_BASENAMES = [
  '.gitlab-ci.yml', 'Jenkinsfile', 'azure-pipelines.yml', 'bitbucket-pipelines.yml',
  'jest.config.*', 'vitest.config.*', 'pytest.ini', 'tox.ini', 'conftest.py', 'phpunit.xml*',
  'karma.conf.*', '.mocharc*', 'playwright.config.*', 'cypress.config.*',
  'package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'requirements*.txt',
  'pyproject.toml', 'poetry.lock', 'Pipfile*', 'go.mod', 'go.sum', 'Cargo.toml', 'Cargo.lock',
  'pom.xml', 'build.gradle*', 'settings.gradle*', 'gradle.lockfile', '*.csproj', 'packages.lock.json',
  'Gemfile*', 'composer.json', 'composer.lock', 'mix.exs', 'mix.lock', 'Package.swift',
  'Package.resolved', 'pubspec.*',
].map((g) => new RegExp('^' + g.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$', 's'));

function classifyBasename(path) {
  return path.slice(path.lastIndexOf('/') + 1);
}

export function isTestFile(path, junitFiles = new Set()) {
  if (junitFiles.has(path)) return true;
  const parts = path.split('/');
  const base = parts.pop();
  if (parts.some((d) => CLASSIFY_TEST_DIRS.has(d))) return true;
  return CLASSIFY_TEST_BASENAMES.some((re) => re.test(base));
}

export function isProtectedFile(path) {
  if (CLASSIFY_PROTECTED_PREFIXES.some((p) => path.startsWith(p))) return true;
  const base = classifyBasename(path);
  return CLASSIFY_PROTECTED_BASENAMES.some((re) => re.test(base));
}

function classifyExt(path) {
  const base = classifyBasename(path);
  const i = base.lastIndexOf('.');
  return i <= 0 ? '' : base.slice(i).toLowerCase();
}

export function languageMode(paths) {
  if (paths.length === 0) return 'compiled';
  for (const p of paths) {
    const ext = classifyExt(p);
    if (COMPILED_EXTENSIONS.has(ext) || !CLASSIFY_INTERPRETED.has(ext)) return 'compiled';
  }
  return 'interpreted';
}

function classifyTokens(out, what) {
  if (out === '') return [];
  if (!out.endsWith('\0')) throw new Error(`${what}: truncated output`);
  return out.slice(0, -1).split('\0');
}

export function parseNameStatus(out) {
  const t = classifyTokens(out, 'name-status');
  const res = [];
  let i = 0;
  while (i < t.length) {
    const m = /^([AMDRCT])(\d*)$/.exec(t[i]);
    if (!m) throw new Error(`name-status: malformed status ${JSON.stringify(t[i])}`);
    const status = m[1];
    if (status === 'R' || status === 'C') {
      const oldPath = t[i + 1];
      const path = t[i + 2];
      if (!oldPath || !path) throw new Error('name-status: truncated rename record');
      res.push({ status, path, oldPath });
      i += 3;
    } else {
      const path = t[i + 1];
      if (!path) throw new Error('name-status: missing path');
      res.push({ status, path });
      i += 2;
    }
  }
  return res;
}

export function parseNumstat(out) {
  const t = classifyTokens(out, 'numstat');
  const res = [];
  let i = 0;
  while (i < t.length) {
    const a = t[i].indexOf('\t');
    const b = a < 0 ? -1 : t[i].indexOf('\t', a + 1);
    if (b < 0) throw new Error(`numstat: malformed record ${JSON.stringify(t[i])}`);
    const addedS = t[i].slice(0, a);
    const deletedS = t[i].slice(a + 1, b);
    let path = t[i].slice(b + 1);
    const binary = addedS === '-' && deletedS === '-';
    if (!binary && !(/^\d+$/.test(addedS) && /^\d+$/.test(deletedS))) {
      throw new Error(`numstat: malformed counts ${JSON.stringify(t[i])}`);
    }
    if (path === '') {
      if (i + 2 >= t.length || !t[i + 1] || !t[i + 2]) throw new Error('numstat: truncated rename record');
      path = t[i + 2];
      i += 3;
    } else {
      i += 1;
    }
    res.push({ path, added: binary ? 0 : Number(addedS), deleted: binary ? 0 : Number(deletedS), binary });
  }
  return res;
}
