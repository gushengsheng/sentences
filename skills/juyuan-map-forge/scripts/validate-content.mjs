// 内容硬校验（在 build 之前跑）
// 用法：node validate-content.mjs <units.json> [sentences.json]
//
// 校验：
// - original 与 sentences.json 逐字一致（若提供）
// - 4 个选项唯一；original / wrongDisplay 不混入选项
// - wrongOptions + wrongDisplay 相对 original 只有 1 段连续差异，不跨标点，差异段 <= 12 字
// - 6 个文本长度比 <= 1.3
// - 错误密度 15%–35%，连续 corruptNow 不超过 2
// - 若带 errorOps：3 个 + errorOpDisplay 必须互异且属于允许算子
import { readFileSync } from 'node:fs';

const unitsPath = process.argv[2];
const sentencesPath = process.argv[3];
if (!unitsPath) {
  console.error('用法：node validate-content.mjs <units.json> [sentences.json]');
  process.exit(2);
}

const raw = JSON.parse(readFileSync(unitsPath, 'utf8'));
const units = Array.isArray(raw) ? raw : raw.units;
if (!Array.isArray(units) || units.length === 0) {
  console.error('units 为空');
  process.exit(2);
}

const source = sentencesPath
  ? (() => {
      const s = JSON.parse(readFileSync(sentencesPath, 'utf8'));
      return Array.isArray(s) ? s : s.sentences;
    })()
  : null;
const sourceById = source ? new Map(source.map((s) => [s.id, s])) : null;

const ALLOWED = new Set([
  'scope', 'negation', 'number', 'name', 'direction', 'subject-object',
  'time', 'degree', 'modality', 'unit', 'population', 'route', 'position', 'comparator',
]);
const PUNCT = /[，。；：、]/;
const problems = [];
const seen = new Set();

function suffixId(id) {
  const m = String(id).match(/(?:^|-)s(\d+)$/);
  return m ? `s${m[1]}` : null;
}

for (const u of units) {
  const tag = u.id ?? '?';
  if (!u.id || seen.has(u.id)) problems.push(`${tag}: id 缺失或重复`);
  seen.add(u.id);

  if (sourceById) {
    const sid = u.sourceId ?? suffixId(u.id);
    const s = sid ? sourceById.get(sid) : null;
    if (!s) problems.push(`${tag}: 找不到对应原句 ${sid ?? '(无)'}`);
    else if (u.original !== s.text) problems.push(`${tag}: original 与 sentences.json 不一致`);
  }

  if (!Array.isArray(u.wrongOptions) || u.wrongOptions.length !== 3) {
    problems.push(`${tag}: wrongOptions 必须 3 项`);
    continue;
  }
  const opts = [u.correctOption, ...u.wrongOptions];
  if (new Set(opts).size !== 4) problems.push(`${tag}: 4 个选项不唯一`);
  if (opts.includes(u.original)) problems.push(`${tag}: 原文混入选项`);
  if (opts.includes(u.wrongDisplay)) problems.push(`${tag}: wrongDisplay 混入选项`);
  if (u.original === u.wrongDisplay) problems.push(`${tag}: 原文与 wrongDisplay 相同`);

  const generated = [u.correctOption, ...u.wrongOptions, u.wrongDisplay];
  if (new Set(generated).size !== 5) problems.push(`${tag}: 5 个生成文本不互异`);

  const lens = [u.original, ...generated].map((s) => String(s).length);
  if (Math.max(...lens) / Math.min(...lens) > 1.3) {
    problems.push(`${tag}: 文本长度比 ${(Math.max(...lens) / Math.min(...lens)).toFixed(2)} > 1.3`);
  }

  for (const [i, t] of [u.wrongDisplay, ...u.wrongOptions].entries()) {
    const a = u.original;
    let p = 0;
    while (p < a.length && p < t.length && a[p] === t[p]) p++;
    let s = 0;
    while (s < a.length - p && s < t.length - p && a[a.length - 1 - s] === t[t.length - 1 - s]) s++;
    const mo = a.slice(p, a.length - s);
    const mn = t.slice(p, t.length - s);
    if (!mo && !mn) problems.push(`${tag} 第${i === 0 ? 'D' : i}项：与原文无差异`);
    if (PUNCT.test(mo) || PUNCT.test(mn)) {
      problems.push(`${tag} 第${i === 0 ? 'D' : i}项：差异跨标点 [${mo}]→[${mn}]`);
    }
    if (Math.max(mo.length, mn.length) > 12) {
      problems.push(`${tag} 第${i === 0 ? 'D' : i}项：差异段 ${Math.max(mo.length, mn.length)} 字 > 12 [${mo}]→[${mn}]`);
    }
  }

  if (Array.isArray(u.errorOps)) {
    const ops = [...u.errorOps, u.errorOpDisplay];
    if (ops.length !== 4 || new Set(ops).size !== 4) problems.push(`${tag}: 4 个算子不互异`);
    for (const op of ops) if (!ALLOWED.has(op)) problems.push(`${tag}: 不允许的算子 ${op}`);
  }
}

const corrupt = units.filter((u) => u.corruptNow).length;
const density = corrupt / units.length;
if (density < 0.15 || density > 0.35) {
  problems.push(`错误密度 ${(density * 100).toFixed(1)}% 越界（15%–35%）`);
}
let run = 0;
for (const u of units) {
  run = u.corruptNow ? run + 1 : 0;
  if (run > 2) problems.push(`${u.id}: 连续 corruptNow 超过 2`);
}

console.log(`句元 ${units.length}，错误 ${corrupt}（${(density * 100).toFixed(1)}%）`);
if (problems.length) {
  console.error(`FAIL（${problems.length} 个问题）`);
  for (const p of problems.slice(0, 60)) console.error(' -', p);
  if (problems.length > 60) console.error(` ... 还有 ${problems.length - 60} 条`);
  process.exit(1);
}
console.log('PASS');
