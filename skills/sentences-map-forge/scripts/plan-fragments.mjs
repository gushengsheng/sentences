// 碎片规划：按标题/知识块切，句数只做上下限
// 用法：node plan-fragments.mjs <sentences.json> <plan.json> [--min=12] [--max=35]
//
// 规则：
// - 以 headings 为知识块边界，一个块优先一个碎片
// - 超过 max：在该块内按段落边界尽量均分
// - 不足 min：与下一个块合并（合并后不超过 max）
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const src = process.argv[2];
const out = process.argv[3];
if (!src || !out) {
  console.error("用法：node plan-fragments.mjs <sentences.json> <plan.json> [--min=12] [--max=35]");
  process.exit(2);
}
const numArg = (name, dflt) => {
  const hit = process.argv.find((a) => a.startsWith("--" + name + "="));
  return hit ? Number(hit.split("=")[1]) : dflt;
};
const MIN = numArg("min", 12);
const MAX = numArg("max", 35);

const data = JSON.parse(readFileSync(src, "utf8").replace(/^\uFEFF/, ""));
const sentences = data.sentences ?? [];
const headings = [...(data.headings ?? [])].sort((a, b) => a.paragraph - b.paragraph);
if (sentences.length === 0) {
  console.error("sentences 为空");
  process.exit(2);
}

function headingFor(paragraph) {
  let cur = null;
  for (const h of headings) {
    if (h.paragraph <= paragraph) cur = h;
    else break;
  }
  return cur;
}

// 1. 按标题分组
const groups = [];
let current = null;
for (const s of sentences) {
  const h = headingFor(s.paragraph);
  const key = h ? h.text : "(无标题)";
  if (!current || current.title !== key) {
    current = { title: key, paragraphStart: s.paragraph, items: [] };
    groups.push(current);
  }
  current.items.push(s);
}

// 2. 短块与下一块合并
const merged = [];
for (const g of groups) {
  const prev = merged[merged.length - 1];
  if (prev && prev.items.length < MIN && prev.items.length + g.items.length <= MAX) {
    prev.items.push(...g.items);
    continue;
  }
  merged.push(g);
}

// 3. 长块按段落边界均分
function splitByParagraph(items, max) {
  const parts = [];
  let cur = [];
  for (const s of items) {
    if (cur.length >= max) {
      parts.push(cur);
      cur = [];
    }
    cur.push(s);
  }
  if (cur.length) parts.push(cur);
  return parts;
}

const fragments = [];
let order = 0;
for (const g of merged) {
  const parts = g.items.length > MAX ? splitByParagraph(g.items, MAX) : [g.items];
  parts.forEach((items, i) => {
    order += 1;
    fragments.push({
      id: "frag-" + String(order).padStart(2, "0"),
      title: parts.length > 1 ? g.title + "（" + (i + 1) + "/" + parts.length + "）" : g.title,
      order,
      count: items.length,
      sentenceIds: items.map((s) => s.id),
    });
  });
}

const lowCount = fragments.filter((f) => f.count < MIN).length;
const warnings = [];
if (lowCount > 0) warnings.push(lowCount + " 个碎片少于 " + MIN + " 句，检查是否该合并");
for (let i = 1; i < fragments.length; i++) {
  const a = fragments[i - 1], b = fragments[i];
  if (a.title.replace(/（\d+\/\d+）$/, "") === b.title.replace(/（\d+\/\d+）$/, "")) {
    warnings.push("知识点被拆成多个碎片：" + a.title + " / " + b.title);
  }
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ fragments, warnings }, null, 2), "utf8");
console.log("规划 " + fragments.length + " 个碎片：" + fragments.map((f) => f.count).join(" / "));
if (warnings.length) for (const w of warnings) console.log("WARN " + w);
