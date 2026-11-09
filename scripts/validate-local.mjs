// 本地内容校验：允许 correctOption === original；diff ≤6 字；长度比 ≤1.15
// 用法：node validate-local.mjs <units.json> <sentences.json>
import fs from 'node:fs';

const [unitsPath, sentencesPath] = process.argv.slice(2);
if (!unitsPath || !sentencesPath) {
  console.error('用法：node validate-local.mjs <units.json> <sentences.json>');
  process.exit(2);
}
const PUNCT = /[，。；：、]/;
const ALLOWED = new Set(['scope','negation','number','name','direction','subject-object','time','degree','modality','unit','population','route','position','comparator']);

const units = JSON.parse(fs.readFileSync(unitsPath, 'utf8'));
const src = JSON.parse(fs.readFileSync(sentencesPath, 'utf8'));
const sources = src.sentences;
const byId = new Map(sources.map((s) => [s.id, s]));

function findSource(unitId) {
  // unitId = <fragmentId>-<sourceId>；sourceId 里可能带 p1 等后缀
  const hit = sources.find((s) => unitId.endsWith(`-${s.id}`));
  return hit ?? byId.get(unitId.split('-').slice(1).join('-'));
}

const problems = [];
const seen = new Set();
for (const u of units) {
  const tag = u.id ?? '?';
  if (!u.id || seen.has(u.id)) problems.push(`${tag}: id 缺失或重复`);
  seen.add(u.id);

  const s = findSource(u.id);
  if (!s) problems.push(`${tag}: 找不到原句`);
  else if (u.original !== s.text) problems.push(`${tag}: original 与句源不一致`);

  if (!Array.isArray(u.wrongOptions) || u.wrongOptions.length !== 3) {
    problems.push(`${tag}: wrongOptions 必须 3 项`);
    continue;
  }
  const opts = [u.correctOption, ...u.wrongOptions];
  if (new Set(opts).size !== 4) problems.push(`${tag}: 4 个选项不唯一`);
  if (u.wrongOptions.includes(u.original)) problems.push(`${tag}: 篡改项等于原文`);
  if (u.wrongDisplay === u.original) problems.push(`${tag}: wrongDisplay 等于原文`);

  const generated = [u.correctOption, ...u.wrongOptions, u.wrongDisplay];
  if (new Set(generated).size !== 5) problems.push(`${tag}: 5 个生成文本不互异`);

  const lens = [u.original, ...generated].map((t) => [...String(t)].length);
  if (Math.max(...lens) / Math.min(...lens) > 1.15) {
    problems.push(`${tag}: 长度比 ${(Math.max(...lens) / Math.min(...lens)).toFixed(2)} > 1.15`);
  }

  for (const [i, t] of [u.wrongDisplay, ...u.wrongOptions].entries()) {
    const a = u.original;
    let p = 0;
    while (p < a.length && p < t.length && a[p] === t[p]) p++;
    let s2 = 0;
    while (s2 < a.length - p && s2 < t.length - p && a[a.length - 1 - s2] === t[t.length - 1 - s2]) s2++;
    const mo = a.slice(p, a.length - s2);
    const mn = t.slice(p, t.length - s2);
    if (!mo && !mn) problems.push(`${tag} 第${i}: 与原文无差异`);
    if (PUNCT.test(mo) || PUNCT.test(mn)) problems.push(`${tag} 第${i}: 差异跨标点`);
    if (Math.max(mo.length, mn.length) > 6) problems.push(`${tag} 第${i}: 差异段 ${Math.max(mo.length, mn.length)} 字 >6`);
  }

  if (Array.isArray(u.errorOps)) {
    if (u.errorOps.length !== 3 || u.errorOpDisplay === undefined) problems.push(`${tag}: 算子字段不全`);
    const ops = [...u.errorOps, u.errorOpDisplay];
    if (new Set(ops).size !== 4) problems.push(`${tag}: 4 算子不互异`);
    for (const op of ops) if (!ALLOWED.has(op)) problems.push(`${tag}: 不允许的算子 ${op}`);
  }
}

const corrupt = units.filter((u) => u.corruptNow).length;
const density = corrupt / units.length;
if (density < 0.15 || density > 0.35) problems.push(`错误密度 ${(density * 100).toFixed(1)}% 越界`);
let run = 0;
for (const u of units) {
  run = u.corruptNow ? run + 1 : 0;
  if (run > 2) problems.push(`${u.id}: 连续 corruptNow 超过 2`);
}

console.log(`句元 ${units.length}，错误 ${corrupt}（${(density * 100).toFixed(1)}%）`);
if (problems.length) {
  console.error(`FAIL（${problems.length}）`);
  for (const p of problems.slice(0, 40)) console.error(' -', p);
  process.exit(1);
}
console.log('PASS');
