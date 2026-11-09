// 合并分片：node merge-units.mjs <out.json> <shard1.json> <shard2.json> ...
import { readFileSync, writeFileSync } from 'node:fs';

const [out, ...inputs] = process.argv.slice(2);
if (!out || inputs.length === 0) {
  console.error('用法：node merge-units.mjs <out.json> <shard1.json> <shard2.json> ...');
  process.exit(2);
}

const all = [];
for (const file of inputs) {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const arr = Array.isArray(data) ? data : data.units;
  if (!Array.isArray(arr)) {
    console.error(`${file}: 不是句元数组`);
    process.exit(1);
  }
  all.push(...arr);
}

writeFileSync(out, JSON.stringify(all, null, 2) + '\n', 'utf8');
console.log(`合并 ${inputs.length} 个分片，共 ${all.length} 个句元 → ${out}`);
