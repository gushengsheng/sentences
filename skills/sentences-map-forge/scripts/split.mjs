// 切句 v2：医学/教材文本 → 书稿句子（带质量标记）
// 用法：node split.mjs <文本文件> <输出.json> [--max=160]
//
// 输出：
// {
//   schemaVersion: 2,
//   source, paragraphs,
//   headings: [{ paragraph, text }],
//   sentences: [{ id, index, paragraph, text, quality, reasons }]
// }
//
// 与 v1 的区别：
// - 只在 。！？ 处断句，不再在逗号/分号处把完整句切碎
// - 识别 Markdown / “第X章/节”标题，单独放进 headings
// - 给每句标 high / medium / low，low 句默认不做句子
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const src = process.argv[2];
const out = process.argv[3];
if (!src || !out) {
  console.error('用法：node split.mjs <文本文件> <输出.json> [--max=160]');
  process.exit(2);
}
const maxArg = process.argv.find((a) => a.startsWith('--max='));
const MAX_LEN = Math.max(60, Number(maxArg?.split('=')[1] ?? 160) || 160);

const text = readFileSync(src, 'utf8').replace(/^\uFEFF/, '');

const END = new Set(['。', '！', '？', '!', '?']);
const CLOSE = new Set(['”', '’', '」', '』', '）', ')', '》', '】', '"']);
const STRONG = new Set(['；', ';']);
const SOFT = new Set(['，', ',']);

function splitSentences(paragraph) {
  const parts = [];
  let buf = '';
  const chars = [...paragraph];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    buf += c;
    if (END.has(c)) {
      let j = i + 1;
      while (j < chars.length && CLOSE.has(chars[j])) {
        buf += chars[j];
        j++;
      }
      i = j - 1;
      const s = buf.trim();
      if (s) parts.push(s);
      buf = '';
    }
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts;
}

function cutLong(sentence) {
  if (sentence.length <= MAX_LEN) return [sentence];
  const target = Math.floor(MAX_LEN * 0.8);
  let cut = -1;
  let kind = null;
  for (let i = 0; i < Math.min(sentence.length, MAX_LEN); i++) {
    if (i >= target && (STRONG.has(sentence[i]) || SOFT.has(sentence[i]))) {
      cut = i + 1;
      kind = STRONG.has(sentence[i]) ? 'strong' : 'soft';
      if (kind === 'strong') break;
    }
  }
  if (cut <= 0) return [sentence];
  const head = sentence.slice(0, cut).trim();
  const tail = sentence.slice(cut).trim();
  return [head, ...cutLong(tail)];
}

function stripMarkdown(s) {
  return s
    .replace(/^#{1,6}\s*/, '')
    .replace(/\*\*/g, '')
    .replace(/^\s*[-*]\s+/, '')
    .trim();
}

function isHeading(raw) {
  if (/^#{1,6}\s+/.test(raw)) return true;
  const s = stripMarkdown(raw);
  if (!s || /[。！？；]$/.test(s)) return false;
  if (s.length > 40) return false;
  return /^第[一二三四五六七八九十百千0-9]+[章节篇部]/.test(s);
}

function grade(text) {
  const reasons = [];
  if (!/[。！？]$/.test(text)) reasons.push('no-terminal-punctuation');
  if (text.length < 12) reasons.push('too-short');
  else if (text.length < 18) reasons.push('short');
  if (/^(其|也|但|而|则|这|该|从而|因此|其中|加之|相反|同时|此外|例如)/.test(text)) {
    reasons.push('fragment-start');
  }
  if (reasons.includes('no-terminal-punctuation') || reasons.includes('too-short')) {
    return { quality: 'low', reasons };
  }
  if (reasons.includes('fragment-start') || reasons.includes('short')) {
    return { quality: 'medium', reasons };
  }
  return { quality: 'high', reasons };
}

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
    headings.push({ paragraph, text: stripMarkdown(raw) });
    return;
  }
  const body = stripMarkdown(raw);
  for (const piece of splitSentences(body).flatMap(cutLong)) {
    const s = piece.trim();
    if (!s) continue;
    const { quality, reasons } = grade(s);
    sentences.push({
      id: `s${String(index + 1).padStart(2, '0')}`,
      index: index++,
      paragraph,
      text: s,
      quality,
      reasons,
    });
  }
});


mkdirSync(dirname(out), { recursive: true });
const payload = {
  schemaVersion: 2,
  source: src,
  paragraphs: blocks.length,
  headings,
  sentences,
};
writeFileSync(out, JSON.stringify(payload, null, 2), 'utf8');

const counts = { high: 0, medium: 0, low: 0 };
for (const s of sentences) counts[s.quality]++;
console.log(
  `切出 ${sentences.length} 句（high ${counts.high} / medium ${counts.medium} / low ${counts.low}），` +
    `${headings.length} 个标题，${blocks.length} 段 → ${out}`,
);
