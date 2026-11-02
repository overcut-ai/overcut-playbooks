export function diffRules({ nameStatus, numstat, isTest, isProtected }) {
  const stats = new Map(numstat.map((n) => [n.path, n]));
  const out = [];
  for (const e of nameStatus) {
    const paths = e.oldPath ? [e.oldPath, e.path] : [e.path];
    const stat = stats.get(e.path);
    if (e.status === 'D' && isTest(e.path)) {
      out.push(`test file deleted: ${e.path}`);
    } else if (e.status === 'R' && paths.some(isTest)) {
      out.push(`test file renamed: ${e.oldPath} -> ${e.path}`);
    } else if (paths.some(isProtected)) {
      out.push(`protected file changed: ${e.path}`);
    } else if (isTest(e.path) && stat && stat.binary) {
      out.push(`binary test file changed: ${e.path}`);
    } else if (isTest(e.path) && stat && stat.deleted > 0) {
      out.push(`existing test lines changed: ${e.path} (-${stat.deleted})`);
    }
  }
  return out;
}
