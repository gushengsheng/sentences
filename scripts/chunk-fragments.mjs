// 碎片规划：把保留句按段落边界切成 25–30 句元一片
// 用法：node chunk-fragments.mjs <sentences.json> <keep-ids.json> <chapterId> <out.json> [--min=25] [--max=30]
import fs from 'node:fs';

const [sentFile, keepFile, chapterId, outFile] = process.argv.slice(2);
const arg = (n, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${n}=`));
  return a ? Number(a.split('=')[1]) : d;
};
const MIN = arg('min', 25);
const MAX = arg('max', 30);
if (!sentFile || !keepFile || !chapterId || !outFile) {
  console.error('用法：node chunk-fragments.mjs <sentences.json> <keep-ids.json> <chapterId> <out.json> [--min=25] [--max=30]');
  process.exit(2);
}

const s = JSON.parse(fs.readFileSync(sentFile, 'utf8'));
const keepIds = JSON.parse(fs.readFileSync(keepFile, 'utf8'));
const byId = new Map(s.sentences.map((x) => [x.id, x]));
const keep = keepIds.map((id) => byId.get(id)).filter(Boolean);

const chunks = [];
let cur = [];
let para = null;
const flush = () => {
  if (cur.length) chunks.push(cur);
  cur = [];
};
for (const x of keep) {
  if (cur.length >= MIN && x.paragraph !== para) flush();
  cur.push(x);
  para = x.paragraph;
  if (cur.length >= MAX) flush();
}
flush();
if (chunks.length > 1 && chunks[chunks.length - 1].length < MIN) {
  const tail = chunks.pop();
  chunks[chunks.length - 1].push(...tail);
}

const plan = { chapterId, fragments: [] };
chunks.forEach((c, i) => {
  plan.fragments.push({
    id: `${chapterId}-${String(i + 1).padStart(2, '0')}`,
    count: c.length,
    ids: c.map((x) => x.id),
  });
});
fs.writeFileSync(outFile, JSON.stringify(plan, null, 2), 'utf8');
for (const f of plan.fragments) console.log(`${f.id}  ${f.count} 句`);
console.log(`共 ${plan.fragments.length} 片，${keep.length} 句`);
