// 内容硬校验（在 build 之前跑）
// 用法：node validate-content.mjs <units.json> [sentences.json]
//
// 校验：
// - original 与 sentences.json 逐字一致（若提供）
// - original + 3 段篡改，4 段文本唯一
// - 每段篡改相对 original 只有 1 段连续差异，不跨标点，差异段 <= 12 字
// - 4 段文本长度比 <= 1.3
// - 若带 errorOps：3 个必须互异且属于允许算子
import { readFileSync } from "node:fs";

const unitsPath = process.argv[2];
const sentencesPath = process.argv[3];
if (!unitsPath) {
  console.error("用法：node validate-content.mjs <units.json> [sentences.json]");
  process.exit(2);
}

const raw = JSON.parse(readFileSync(unitsPath, "utf8"));
const units = Array.isArray(raw) ? raw : raw.units;
if (!Array.isArray(units) || units.length === 0) {
  console.error("units 为空");
  process.exit(2);
}

const source = sentencesPath
  ? (() => {
      const s = JSON.parse(readFileSync(sentencesPath, "utf8"));
      return Array.isArray(s) ? s : s.sentences;
    })()
  : null;
const sourceById = source ? new Map(source.map((s) => [s.id, s])) : null;

const ALLOWED = new Set([
  "scope", "negation", "number", "name", "direction", "subject-object",
  "time", "degree", "modality", "unit", "population", "route", "position", "comparator",
]);
const PUNCT = /[，。；：、]/;
const problems = [];
const seen = new Set();

function suffixId(id) {
  const m = String(id).match(/(?:^|-)s(\d+)$/);
  return m ? "s" + m[1] : null;
}

for (const u of units) {
  const tag = u.id ?? "?";
  if (!u.id || seen.has(u.id)) problems.push(tag + ": id 缺失或重复");
  seen.add(u.id);

  if (sourceById) {
    const sid = u.sourceId ?? suffixId(u.id);
    const s = sid ? sourceById.get(sid) : null;
    if (!s) problems.push(tag + ": 找不到对应原句 " + (sid ?? "(无)"));
    else if (u.original !== s.text) problems.push(tag + ": original 与 sentences.json 不一致");
  }

  if (!u.original) {
    problems.push(tag + ": original 缺失");
    continue;
  }
  if (!Array.isArray(u.wrongOptions) || u.wrongOptions.length !== 3) {
    problems.push(tag + ": wrongOptions 必须 3 项");
    continue;
  }

  const texts = [u.original, ...u.wrongOptions];
  if (new Set(texts).size !== 4) problems.push(tag + ": 4 段文本不唯一");

  const lens = texts.map((s) => String(s).length);
  const max = Math.max(...lens);
  const min = Math.min(...lens);
  if (min > 0 && max / min > 1.3) {
    problems.push(tag + ": 文本长度比 " + (max / min).toFixed(2) + " > 1.3");
  }

  u.wrongOptions.forEach((t, i) => {
    const a = u.original;
    let p = 0;
    while (p < a.length && p < t.length && a[p] === t[p]) p++;
    let s = 0;
    while (s < a.length - p && s < t.length - p && a[a.length - 1 - s] === t[t.length - 1 - s]) s++;
    const mo = a.slice(p, a.length - s);
    const mn = t.slice(p, t.length - s);
    if (!mo && !mn) problems.push(tag + " 第" + (i + 1) + "段：与原文无差异");
    if (PUNCT.test(mo) || PUNCT.test(mn)) problems.push(tag + " 第" + (i + 1) + "段：差异跨标点 [" + mo + "]→[" + mn + "]");
    if (Math.max(mo.length, mn.length) > 12) problems.push(tag + " 第" + (i + 1) + "段：差异段 " + Math.max(mo.length, mn.length) + " 字 > 12 [" + mo + "]→[" + mn + "]");
  });

  if (Array.isArray(u.errorOps)) {
    if (u.errorOps.length !== 3 || new Set(u.errorOps).size !== 3) problems.push(tag + ": 3 个算子不互异");
    for (const op of u.errorOps) if (!ALLOWED.has(op)) problems.push(tag + ": 不允许的算子 " + op);
  }
}

console.log("句子 " + units.length);
if (problems.length) {
  console.error("FAIL（" + problems.length + " 个问题）");
  for (const p of problems.slice(0, 60)) console.error(" -", p);
  if (problems.length > 60) console.error(" ... 还有 " + (problems.length - 60) + " 条");
  process.exit(1);
}
console.log("PASS");
