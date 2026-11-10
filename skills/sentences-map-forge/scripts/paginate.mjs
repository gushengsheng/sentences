// DP 分页：句子数组 → 页数组
// 用法：node paginate.mjs <units.json> <pages.json> [target=12]
import { readFileSync, writeFileSync } from 'node:fs';

const unitsPath = process.argv[2];
const outPath = process.argv[3];
const target = Number(process.argv[4] ?? 12);

if (!unitsPath || !outPath) {
  console.error('用法：node paginate.mjs <units.json> <pages.json> [target=12]');
  process.exit(2);
}

const units = JSON.parse(readFileSync(unitsPath, 'utf8'));
const n = units.length;
if (n === 0) {
  console.error('units.json 为空');
  process.exit(1);
}

function solve(minLen, maxLen) {
  const INF = 1e12;
  const dp = new Array(n + 1).fill(INF);
  const prev = new Array(n + 1).fill(-1);
  dp[0] = 0;

  for (let i = 1; i <= n; i++) {
    for (let j = i - 1; j >= 0; j--) {
      const len = i - j;
      if (len > maxLen) break;
      if (len < minLen && i !== n) continue;
      if (dp[j] === INF) continue;
      const dev = Math.abs(len - target) / target;
      // 页尾不在段落边界上 → 罚分
      const cutMidParagraph =
        i < n && units[i - 1].paragraph === units[i].paragraph ? 0.8 : 0;
      const cost = dp[j] + dev + cutMidParagraph;
      if (cost < dp[i]) {
        dp[i] = cost;
        prev[i] = j;
      }
    }
  }
  return { dp, prev };
}

let minLen = Math.max(4, Math.round(target * 0.65));
let maxLen = Math.round(target * 1.35);
let { dp, prev } = solve(minLen, maxLen);
if (dp[n] >= 1e12) {
  // 太严格，放宽
  minLen = 1;
  maxLen = Math.max(maxLen, Math.ceil(n / 2));
  ({ dp, prev } = solve(minLen, maxLen));
}
if (dp[n] >= 1e12) {
  console.error('无法完成分页，检查 units.json 的 paragraph 字段');
  process.exit(1);
}

const bounds = [];
let cur = n;
while (cur > 0) {
  const j = prev[cur];
  bounds.push([j, cur]);
  cur = j;
}
bounds.reverse();

const pages = bounds.map(([a, b], i) => ({
  id: `p${i + 1}`,
  title: `第 ${i + 1} 页`,
  unitIds: units.slice(a, b).map((u) => u.id),
}));

writeFileSync(outPath, JSON.stringify(pages, null, 2), 'utf8');
console.log(
  `分页完成：${n} 句 → ${pages.length} 页，页长 ${pages.map((p) => p.unitIds.length).join('/')} → ${outPath}`,
);
