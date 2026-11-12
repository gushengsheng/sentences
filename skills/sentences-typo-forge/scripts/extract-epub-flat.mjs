// 扁平抽取：处理「篇/章」混在顶层的目录（如诊断学）
// 用法：node extract-epub-flat.mjs <epub解包目录> <顶层起>-<顶层止> <输出目录>
import fs from 'node:fs';
import path from 'node:path';

const [srcDir, rangeArg, outDir] = process.argv.slice(2);
const [from, to] = rangeArg.split('-').map(Number);
if (!srcDir || !from || !to || !outDir) {
  console.error('用法：node extract-epub-flat.mjs <解包目录> <起>-<止> <输出目录>');
  process.exit(2);
}

const decode = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));

const clean = (s) =>
  decode(s.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ''))
    .replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();

// toc.ncx -> tree
const ncx = fs.readFileSync(path.join(srcDir, 'toc.ncx'), 'utf8');
const tree = [], stack = [];
const tagRe = /<(\/?)navPoint\b[^>]*>/g;
let m;
while ((m = tagRe.exec(ncx))) {
  if (m[1] === '/') { stack.pop(); continue; }
  const rest = ncx.slice(m.index);
  const text = /<text>([\s\S]*?)<\/text>/.exec(rest.slice(0, 600));
  const content = /<content\s+src="([^"]+)"/.exec(rest);
  const node = { label: text ? decode(text[1]).trim() : '', src: content ? content[1] : '', children: [] };
  if (stack.length) stack[stack.length - 1].children.push(node);
  else tree.push(node);
  stack.push(node);
}

// 段落流
const files = fs.readdirSync(srcDir).filter((f) => /^index_split_\d+\.html$/.test(f)).sort();
const stream = [], anchorPos = new Map();
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

const posOf = (node) => anchorPos.get(node.src.split('#')[1]);

// 扁平化：篇头（无子项）只记当前篇名；有子项且子项是「第X章」则每章一项
const chapters = [];
let part = '';
for (let i = from - 1; i < to; i++) {
  const node = tree[i];
  if (!node) continue;
  const isPart = /^第.+篇/.test(node.label) && node.children.length === 0;
  if (isPart) { part = node.label; continue; }
  const childIsChapter = node.children.length > 0 && node.children.some((c) => /^第.+章/.test(c.label));
  if (childIsChapter) {
    for (const ch of node.children) {
      chapters.push({ title: `${node.label} · ${ch.label}`, part: node.label, node: ch, sections: ch.children });
    }
  } else {
    const standalone = /^附录/.test(node.label);
    chapters.push({ title: standalone || !part ? node.label : `${part} · ${node.label}`, part: standalone ? '' : part, node, sections: node.children });
  }
}

// 按锚点切片
const starts = chapters.map((c) => ({ c, pos: posOf(c.node) })).filter((x) => x.pos !== undefined);
starts.sort((a, b) => a.pos - b.pos);
const noise = (t) =>
  !t || /^\d{1,4}$/.test(t) || /^[（(]\s*[\u4e00-\u9fa5]{1,4}\s*[）)]$/.test(t) ||
  (/^●/.test(t) && [...t].filter((c) => c.charCodeAt(0) < 128).length / [...t].length > 0.5);

fs.mkdirSync(outDir, { recursive: true });
const stats = [];
starts.forEach((s, idx) => {
  const start = s.pos;
  const end = idx + 1 < starts.length ? starts[idx + 1].pos : stream.length;
  const chapterBlocks = stream.slice(start, end);
  const sections = [];
  const marks = s.c.sections
    .map((c) => ({ title: c.label, pos: posOf(c) }))
    .filter((x) => x.pos !== undefined && x.pos >= start && x.pos < end)
    .sort((a, b) => a.pos - b.pos);
  if (!marks.length) {
    sections.push({ title: s.c.title, paragraphs: chapterBlocks.map((p) => p.text) });
  } else {
    if (marks[0].pos > start) sections.push({ title: s.c.title, paragraphs: stream.slice(start, marks[0].pos).map((p) => p.text) });
    marks.forEach((mk, i) => {
      const stop = i + 1 < marks.length ? marks[i + 1].pos : end;
      sections.push({ title: mk.title, paragraphs: stream.slice(mk.pos, stop).map((p) => p.text) });
    });
  }
  for (const sec of sections) sec.paragraphs = sec.paragraphs.filter((p) => !noise(p));
  const payload = { chapterTitle: s.c.title, part: s.c.part, sections };
  const key = String(idx + 1).padStart(2, '0');
  fs.writeFileSync(path.join(outDir, `${key}.json`), JSON.stringify(payload, null, 2), 'utf8');
  const paras = sections.reduce((n, x) => n + x.paragraphs.length, 0);
  stats.push({ key, title: s.c.title, sections: sections.length, paragraphs: paras });
});

console.log(`抽出 ${stats.length} 章`);
for (const s of stats) console.log(`${s.key} ${s.title}：${s.sections} 节 ${s.paragraphs} 段`);
fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(stats, null, 2), 'utf8');
