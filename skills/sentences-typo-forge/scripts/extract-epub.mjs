// 从 calibre 解包的 EPUB 抽取一章（含小节），保留段落结构
// 用法：node extract-epub.mjs <epub解包目录> <章序号1基> <输出.json>
import fs from 'node:fs';
import path from 'node:path';

const [srcDir, indexArg, outFile] = process.argv.slice(2);
const chapterIndex = Number(indexArg);
if (!srcDir || !chapterIndex || !outFile) {
  console.error('用法：node extract-epub.mjs <epub解包目录> <章序号1基> <输出.json>');
  process.exit(2);
}

const decode = (s) =>
  s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));

const clean = (s) =>
  decode(s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''))
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();

// --- 解析 toc.ncx 成树 ---
const ncx = fs.readFileSync(path.join(srcDir, 'toc.ncx'), 'utf8');
const tree = [];
const stack = [];
const tagRe = /<(\/?)navPoint\b[^>]*>/g;
let m;
while ((m = tagRe.exec(ncx))) {
  if (m[1] === '/') {
    stack.pop();
    continue;
  }
  const rest = ncx.slice(m.index);
  const text = /<text>([\s\S]*?)<\/text>/.exec(rest.slice(0, 600));
  const content = /<content\s+src="([^"]+)"/.exec(rest);
  const node = { label: text ? decode(text[1]).trim() : '', src: content ? content[1] : '', children: [] };
  if (stack.length) stack[stack.length - 1].children.push(node);
  else tree.push(node);
  stack.push(node);
}

const chapter = tree[chapterIndex - 1];
if (!chapter) {
  console.error(`没有第 ${chapterIndex} 章`);
  process.exit(1);
}

// --- 段落流 ---
const files = fs.readdirSync(srcDir).filter((f) => /^index_split_\d+\.html$/.test(f)).sort();
const stream = [];
const anchorPos = new Map();
for (const f of files) {
  const html = fs.readFileSync(path.join(srcDir, f), 'utf8');
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html);
  const content = body ? body[1] : html;
  const pRe = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
  let pm;
  while ((pm = pRe.exec(content))) {
    const text = clean(pm[2]);
    if (!text) continue;
    const idm = /\bid="([^"]*)"/.exec(pm[1]);
    const id = idm ? idm[1] : '';
    if (id) anchorPos.set(id, stream.length);
    stream.push({ id, text });
  }
}

const startAnchor = chapter.src.split('#')[1];
const start = anchorPos.get(startAnchor);
if (start === undefined) {
  console.error('找不到章首锚点', startAnchor);
  process.exit(1);
}
// 下一章起点（顶层）
const next = tree[chapterIndex];
const nextAnchor = next ? next.src.split('#')[1] : null;
const end = nextAnchor && anchorPos.has(nextAnchor) ? anchorPos.get(nextAnchor) : stream.length;

// 小节切分
const sections = [];
const marks = chapter.children
  .map((c) => ({ title: c.label, pos: anchorPos.get(c.src.split('#')[1]) }))
  .filter((x) => x.pos !== undefined && x.pos >= start && x.pos < end)
  .sort((a, b) => a.pos - b.pos);

if (!marks.length) {
  sections.push({ title: chapter.label, paragraphs: stream.slice(start, end).map((p) => p.text) });
} else {
  if (marks[0].pos > start) {
    sections.push({ title: chapter.label, paragraphs: stream.slice(start, marks[0].pos).map((p) => p.text) });
  }
  marks.forEach((mk, i) => {
    const stop = i + 1 < marks.length ? marks[i + 1].pos : end;
    sections.push({ title: mk.title, paragraphs: stream.slice(mk.pos, stop).map((p) => p.text) });
  });
}

const noise = (t) =>
  !t ||
  /^\d{1,4}$/.test(t) ||
  /^[（(]\s*[\u4e00-\u9fa5]{1,4}\s*[）)]$/.test(t) ||
  (/^●/.test(t) && [...t].filter((c) => c.charCodeAt(0) < 128).length / [...t].length > 0.5);

for (const s of sections) s.paragraphs = s.paragraphs.filter((p) => !noise(p));

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify({ chapterTitle: chapter.label, sections }, null, 2), 'utf8');
console.log(`${chapter.label}：${sections.length} 小节，${sections.reduce((n, s) => n + s.paragraphs.length, 0)} 段`);
for (const s of sections) console.log(' -', s.title, s.paragraphs.length, '段');
