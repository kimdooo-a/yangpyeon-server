const r = JSON.parse(require('fs').readFileSync(0, 'utf8'));
const groups = {};
for (const f of r) {
  let cnt = 0;
  for (const m of f.messages) {
    if (m.ruleId && m.ruleId.includes('no-raw-prisma-without-tenant')) cnt++;
  }
  if (cnt > 0) {
    const norm = f.filePath.replace(/\\/g, '/');
    const idx = norm.indexOf('/src/');
    const path = idx >= 0 ? norm.slice(idx + 1) : norm;
    groups[path] = cnt;
  }
}
const sorted = Object.entries(groups).sort();
console.log('Total unique files:', sorted.length);
let total = 0;
for (const [f, c] of sorted) {
  console.log(c.toString().padStart(3), f);
  total += c;
}
console.log('Total violations:', total);
