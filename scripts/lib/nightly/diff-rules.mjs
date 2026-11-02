export function diffRules({ nameStatus, numstat, isTest, isProtected }) {
  const stats = new Map();
  for (const n of numstat) {
    if (stats.has(n.path)) throw new Error(`duplicate numstat path: ${n.path}`);
    stats.set(n.path, n);
  }
  const seen = new Set();
  for (const e of nameStatus) {
    if (seen.has(e.path)) throw new Error(`duplicate name-status path: ${e.path}`);
    seen.add(e.path);
  }
  const out = [];
  for (const e of nameStatus) {
    const paths = e.oldPath ? [e.oldPath, e.path] : [e.path];
    const anyTest = paths.some((p) => isTest(p));
    const anyProtected = paths.some((p) => isProtected(p));
    const stat = stats.get(e.path);
    if ((anyTest || anyProtected || e.status === 'R') && !stat) {
      throw new Error(`numstat missing for ${e.path}`);
    }
    if (e.status === 'D' && isTest(e.path)) {
      out.push(`test file deleted: ${e.path}`);
    } else if (e.status === 'R' && anyTest) {
      out.push(`test file renamed: ${e.oldPath} -> ${e.path}`);
    } else if (anyProtected) {
      out.push(`protected file changed: ${e.path}`);
    } else if (isTest(e.path) && stat.binary) {
      out.push(`binary test file changed: ${e.path}`);
    } else if (['M', 'T', 'C'].includes(e.status) && isTest(e.path)) {
      out.push(`existing test file changed: ${e.path} (+${stat.added} -${stat.deleted})`);
    }
  }
  return out;
}
