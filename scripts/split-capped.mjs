// 限长切句：整句超上限时，优先在 ；：， 处切开
// 用法：node split-capped.mjs <文本.txt> <输出.json> [--max=55] [--min=12]
// 输出结构与 juyuan-map-forge/scripts/split.mjs 一致
import fs from 'node:fs';
import path from 'node:path';

const src = process.argv[2];
const out = process.argv[3];
const arg = (n, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${n}=`));
  return a ? Number(a.split('=')[1]) : d;
};
const MAX = arg('max', 55);
const MIN = arg('min', 12);
if (!src || !out) {
  console.error('用法：node split-capped.mjs <文本.txt> <输出.json> [--max=55] [--min=12]');
  process.exit(2);
}

const END = new Set(['。', '！', '？', '!', '?']);
const CLOSE = new Set(['”', '’', '」', '』', '）', ')', '》', '】', '"']);
const BREAK = new Set(['；', '：', '，', ';', ':', ',']);
const L = (s) => [...s].length;

function splitSentences(paragraph) {
  const parts = [];
  let buf = '';
  const chars = [...paragraph];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    buf += c;
    if (END.has(c)) {
      let j = i + 1;
      while (j < chars.length && CLOSE.has(chars[j])) buf += chars[j++];
      i = j - 1;
      if (buf.trim()) parts.push(buf.trim());
      buf = '';
    }
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts;
}

function capSentence(s) {
  const out = [];
  let rest = s;
  while (L(rest) > MAX) {
    const chars = [...rest];
    let cut = -1;
    for (let i = 0; i < chars.length; i++) {
      if (BREAK.has(chars[i]) && i + 1 <= MAX) cut = i + 1;
    }
    if (cut < 0) {
      for (let i = 0; i < chars.length; i++) {
        if (BREAK.has(chars[i])) {
          cut = i + 1;
          break;
        }
      }
    }
    if (cut < 0 || cut >= chars.length) break;
    out.push(chars.slice(0, cut).join('').trim());
    rest = chars.slice(cut).join('').trim();
  }
  if (rest) out.push(rest);
  // 过短片段并入相邻
  const merged = [];
  for (const p of out) {
    if (L(p) < MIN && merged.length) merged[merged.length - 1] += p;
    else merged.push(p);
  }
  return merged;
}

function isHeading(raw) {
  const s = raw.replace(/^#{1,6}\s*/, '').trim();
  if (!s || /[。！？；]$/.test(s)) return false;
  if (L(s) > 40) return false;
  return /^第[一二三四五六七八九十百千0-9]+[章节篇部]/.test(s);
}

function grade(text) {
  const reasons = [];
  if (!/[。！？]$/.test(text)) reasons.push('clause-tail');
  if (L(text) < 12) reasons.push('too-short');
  else if (L(text) < 18) reasons.push('short');
  if (/^(其|也|但|而|则|这|该|从而|因此|其中|加之|相反|同时|此外|例如)/.test(text)) reasons.push('fragment-start');
  if (L(text) > MAX) reasons.push('over-max');
  if (reasons.includes('too-short') || reasons.includes('over-max')) return { quality: 'low', reasons };
  if (reasons.includes('fragment-start') || reasons.includes('short') || reasons.includes('clause-tail')) {
    return { quality: 'medium', reasons };
  }
  return { quality: 'high', reasons };
}

const text = fs.readFileSync(src, 'utf8').replace(/^\uFEFF/, '');
const blocks = text
  .split(/\r?\n\s*\r?\n/)
  .map((b) => b.replace(/\s*\n\s*/g, ' ').trim())
  .filter(Boolean);

const headings = [];
const sentences = [];
let index = 0;
blocks.forEach((raw, bi) => {
  const paragraph = bi + 1;
  if (isHeading(raw)) {
    headings.push({ paragraph, text: raw.replace(/^#{1,6}\s*/, '').trim() });
    return;
  }
  for (const base of splitSentences(raw)) {
    for (const piece of capSentence(base)) {
      const { quality, reasons } = grade(piece);
      sentences.push({
        id: `s${String(index + 1).padStart(2, '0')}`,
        index: index++,
        paragraph,
        text: piece,
        quality,
        reasons,
      });
    }
  }
});

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(
  out,
  JSON.stringify({ schemaVersion: 2, source: src, maxLen: MAX, paragraphs: blocks.length, headings, sentences }, null, 2),
  'utf8',
);
const c = { high: 0, medium: 0, low: 0 };
for (const s of sentences) c[s.quality]++;
console.log(`切出 ${sentences.length} 句（high ${c.high} / medium ${c.medium} / low ${c.low}），上限 ${MAX} 字 → ${out}`);
