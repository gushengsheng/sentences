// 脚本版地图：一节 → 若干碎片；每句 3 段单字篡改
// 用法：
// node build-typo-book.mjs --chapter <.work-typo/x/chapter.json> --book heart-failure-script \
//   --title "治疗心力衰竭的药物（脚本版）" --chapter-id heart-failure --file 01-heart-failure.json \
//   --work .work-typo/heart-failure [--min=30] [--max=55]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { splitParagraph, capSentence, mergeShort, mutateUnit, L } from './mutate.mjs';

const arg = (name, def) => {
  const eq = process.argv.find((x) => x.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
};
const chapterFile = arg('chapter');
const bookId = arg('book');
const bookTitle = arg('title');
const chapterId = arg('chapter-id');
const chapterFileOut = arg('file');
const workDir = arg('work');
const MIN = Number(arg('min', '30'));
const MAX = Number(arg('max', '55'));
if (!chapterFile || !bookId || !bookTitle || !chapterId || !chapterFileOut || !workDir) {
  console.error('缺少参数');
  process.exit(2);
}

const root = process.cwd();
const dataDir = path.join(root, 'skills/sentences-typo-forge/data');
const shape = JSON.parse(fs.readFileSync(path.join(dataDir, 'shape-similar.json'), 'utf8'));
const common = JSON.parse(fs.readFileSync(path.join(dataDir, 'common-chars.json'), 'utf8'));
const chapter = JSON.parse(fs.readFileSync(chapterFile, 'utf8'));

const stripNum = (t) => t.replace(/^第[一二三四五六七八九十百千0-9]+[章节]\s*/, '').trim();
const chapterTitle = stripNum(chapter.chapterTitle);
let skippedEnglish = 0;
let filteredHead = 0;
let filteredLegend = 0;
let filteredShort = 0;
const skippedUnits = [];
function hardCap(text, max) {
  const chars = [...text];
  const out = [];
  for (let i = 0; i < chars.length; i += max) out.push(chars.slice(i, i + max).join(''));
  return out;
}
function splitBalanced(units) {
  const n = units.length;
  if (n <= 30) return [units];
  let k = Math.max(1, Math.round(n / 26));
  while (Math.ceil(n / k) > 30) k++;
  const out = [];
  let start = 0;
  for (let i = 0; i < k; i++) {
    const size = Math.floor(n / k) + (i < n % k ? 1 : 0);
    out.push(units.slice(start, start + size));
    start += size;
  }
  return out;
}
const ANAPHORA = /^(其|该|此|这|它|上述|因此|所以|但|而|也|又|其中|同时|此外|例如|如|总之|综上|[①-⑳]|（[一二三四五六七八九十]+）|对|在|与|使|通过|由于|为了|防止|降低|增加|减少|可|能|应|需)/;

// 1) 每个小节：切句 → 拼接短句 → 每片 ≤28 句
const fragments = [];
for (const sec of chapter.sections) {
  const items = [];
  sec.paragraphs.forEach((p, pi) => {
    if (/^第[一二三四五六七八九十百千0-9]+[章节]/.test(p) || /^[一二三四五六七八九十]+、/.test(p) || /^【/.test(p) || /^（[一二三四五六七八九十]+）/.test(p) || /^[①-⑳]/.test(p) || /^\d+[.、]/.test(p) || /^[图表]\s*\d+/.test(p)) { filteredHead++; return; }
    if ([...p].length < 25 && !/[。！？]/.test(p)) { filteredShort++; return; }
    if ((p.match(/；/g) || []).length >= 2 && !p.includes('。') && [...p].length < 100) { filteredLegend++; return; }
    for (const s of splitParagraph(p).flatMap((x) => capSentence(x, MAX))) {
      const ascii = [...s].filter((c) => c.charCodeAt(0) < 128).length / Math.max(1, [...s].length);
      if (ascii > 0.6) { skippedEnglish++; continue; }
      items.push({ text: s, paragraph: pi + 1 });
    }
  });
  if (!items.length) continue;
  const merged = mergeShort(items, MIN, MAX);
  const chunks = splitBalanced(merged);
  chunks.forEach((chunk, ci) => {
    const suffix = chunks.length > 1 ? `（${ci + 1}）` : '';
    const title = (sec.title === chapter.chapterTitle ? '概述' : stripNum(sec.title)) + suffix;
    fragments.push({ title, units: chunk });
  });
}

// 2) 独立性：片首为代词/连词时，复制上一片末句
for (let i = 1; i < fragments.length; i++) {
  const first = fragments[i].units[0];
  if (ANAPHORA.test(first.text)) {
    const prevUnits = fragments[i - 1].units;
    const pick = [...prevUnits].reverse().find((u) => [...u.text].length >= 30 && !((u.text.match(/；/g) || []).length >= 2 && !u.text.includes('。'))) ?? prevUnits[prevUnits.length - 1];
    const prev = pick;
    fragments[i].units.unshift({ ...prev, carried: true });
  }
}

// 3) 单字篡改
let skipped = 0;
const outFrags = [];
fragments.forEach((frag, fi) => {
  const id = `${chapterId}-${String(fi + 1).padStart(2, '0')}`;
  const units = [];
  frag.units.forEach((u, ui) => {
    let wrongs = u.wrongOptions;
    if (!wrongs) {
      for (let attempt = 0; attempt < 6 && !wrongs; attempt++) {
        wrongs = mutateUnit(u.text, shape, common, `${id}-s${ui + 1}-${attempt}`, 3);
      }
    }
    if (!wrongs) {
      skipped++;
      skippedUnits.push({ fragment: id, text: u.text });
      console.warn('跳过（无法生成 3 段单字篡改）', id, u.text.slice(0, 30));
      return;
    }
    units.push({
      id: `${id}-s${String(units.length + 1).padStart(2, '0')}`,
      paragraph: u.paragraph ?? 1,
      original: u.text,
      wrongOptions: wrongs,
      ...(u.carried ? { carried: true } : {}),
    });
  });
  if (!units.length) return;
  const pages = [];
  for (let i = 0; i < units.length; i += 12) {
    pages.push({
      id: `${id}-p${pages.length + 1}`,
      title: `第 ${pages.length + 1} 页`,
      unitIds: units.slice(i, i + 12).map((x) => x.id),
    });
  }
  outFrags.push({ id, title: frag.title, units, pages });
});

// 4) 落盘 units/pages/meta
const unitsDir = path.join(workDir, 'units');
const pagesDir = path.join(workDir, 'pages');
fs.mkdirSync(unitsDir, { recursive: true });
fs.mkdirSync(pagesDir, { recursive: true });
const metaFrags = outFrags.map((f, i) => {
  const uf = path.join(unitsDir, `${f.id}.json`);
  const pf = path.join(pagesDir, `${f.id}.json`);
  fs.writeFileSync(uf, JSON.stringify(f.units, null, 2), 'utf8');
  fs.writeFileSync(pf, JSON.stringify(f.pages, null, 2), 'utf8');
  return {
    id: f.id,
    title: f.title,
    order: i + 1,
    recommendedRounds: 12,
    unitsFile: uf,
    pagesFile: pf,
  };
});

const meta = {
  book: {
    id: bookId,
    title: bookTitle,
    author: '杨宝峰',
    contentVersion: 2,
    contentNote: '脚本版：单字找茬模式，每段与原句仅差 1 个形近字/常用字；长句按标点切分，短句同小节内拼接。',
  },
  chapters: [
    {
      id: chapterId,
      title: chapterTitle,
      order: 1,
      file: chapterFileOut,
      fragments: metaFrags,
    },
  ],
};
const metaPath = path.join(workDir, 'meta.json');
fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');

// 5) 组装 + 校验
const build = spawnSync(process.execPath, ['skills/sentences-map-forge/scripts/build-book.mjs', metaPath], {
  encoding: 'utf8',
  stdio: 'inherit',
});
if (build.status !== 0) process.exit(build.status ?? 1);

const bookFile = path.join('public/maps', bookId, 'book.json');
const v = spawnSync(process.execPath, ['scripts/validate-map.mjs', bookFile], { encoding: 'utf8' });
process.stdout.write(v.stdout);
process.stderr.write(v.stderr);

const total = outFrags.reduce((n, f) => n + f.units.length, 0);
const report = {
  bookId,
  bookTitle,
  chapter: chapterTitle,
  fragments: outFrags.length,
  units: total,
  skipped,
  skippedEnglish,
  filteredHead,
  filteredLegend,
  filteredShort,
  skippedUnits,
  minLen: MIN,
  maxLen: MAX,
  fragmentsDetail: outFrags.map((f) => ({ id: f.id, title: f.title, units: f.units.length })),
};
fs.writeFileSync(path.join(workDir, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(`\n${bookTitle}：${outFrags.length} 碎片 ${total} 句，跳过 ${skipped}`);
for (const f of report.fragmentsDetail) console.log(` ${f.id} ${f.units}  ${f.title}`);
