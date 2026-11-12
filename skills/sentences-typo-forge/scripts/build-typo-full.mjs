// 脚本版全书：多章 → 一本书
// 用法：node build-typo-full.mjs --epub <解包目录> --book pharmacology-script \
//   --title "药理学（脚本版）" --chapters 1-48 --work .work-typo/full [--min=30] [--max=55]
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

const epubDir = arg('epub');
const bookId = arg('book');
const bookTitle = arg('title');
const chaptersArg = arg('chapters', '1-48');
const workDir = arg('work');
const author = arg('author', '杨宝峰');
const MIN = Number(arg('min', '30'));
const MAX = Number(arg('max', '55'));
if (!epubDir || !bookId || !bookTitle || !workDir) {
  console.error('缺少参数');
  process.exit(2);
}

const [from, to] = chaptersArg.split('-').map(Number);
const root = process.cwd();
const dataDir = path.join(root, 'skills/sentences-typo-forge/data');
const shape = JSON.parse(fs.readFileSync(path.join(dataDir, 'shape-similar.json'), 'utf8'));
const common = JSON.parse(fs.readFileSync(path.join(dataDir, 'common-chars.json'), 'utf8'));

const chaptersDir = path.join(workDir, 'chapters');
const unitsDir = path.join(workDir, 'units');
const pagesDir = path.join(workDir, 'pages');
fs.mkdirSync(chaptersDir, { recursive: true });
fs.mkdirSync(unitsDir, { recursive: true });
fs.mkdirSync(pagesDir, { recursive: true });

const stripNum = (t) => t.replace(/^第[一二三四五六七八九十百千0-9]+[章节]\s*/, '').trim();
const ANAPHORA = /^(其|该|此|这|它|上述|因此|所以|但|而|也|又|其中|同时|此外|例如|如|总之|综上|[①-⑳]|（[一二三四五六七八九十]+）|对|在|与|使|通过|由于|为了|防止|降低|增加|减少|可|能|应|需)/;

function joinTitle(a, b) {
  if (a.includes(b)) return a;
  if (b.includes(a)) return b;
  return `${a} 与 ${b}`;
}
function mergeSmall(fragments, min = 18, max = 30) {
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < fragments.length; i++) {
      if (fragments[i].units.length >= min) continue;
      const tryMerge = (j) => {
        const a = fragments[i], b = fragments[j];
        const units = j > i ? [...a.units, ...b.units] : [...b.units, ...a.units];
        const merged = { title: joinTitle(a.title, b.title), units };
        const at = Math.min(i, j);
        fragments.splice(at, 2, merged);
        changed = true;
      };
      if (i + 1 < fragments.length && fragments[i].units.length + fragments[i + 1].units.length <= max) { tryMerge(i + 1); break; }
      if (i > 0 && fragments[i - 1].units.length + fragments[i].units.length <= max) { tryMerge(i - 1); break; }
      if (i + 1 < fragments.length) { tryMerge(i + 1); break; }
    }
  }
  return fragments;
}
function splitBig(fragments, splitAt = 35, chunk = 30) {
  const out = [];
  for (const f of fragments) {
    const n = f.units.length;
    if (n <= splitAt) { out.push(f); continue; }
    const k = Math.ceil(n / chunk);
    let i = 0;
    for (let p = 0; p < k; p++) {
      const size = Math.floor(n / k) + (p < n % k ? 1 : 0);
      out.push({ title: p === 0 ? f.title : `${f.title}（续）`, units: f.units.slice(i, i + size) });
      i += size;
    }
  }
  return out;
}
function mergeWeak(units, max = 55) {
  const cjkCount = (t) => [...t].filter((c) => /[\u4e00-\u9fa5]/.test(c)).length;
  for (let i = 0; i < units.length; i++) {
    if (cjkCount(units[i].text) >= 3) continue;
    if (i + 1 < units.length && L(units[i].text + units[i + 1].text) <= max) {
      units.splice(i, 2, { ...units[i], text: units[i].text + units[i + 1].text });
    } else if (i > 0 && L(units[i - 1].text + units[i].text) <= max) {
      units.splice(i - 1, 2, { ...units[i - 1], text: units[i - 1].text + units[i].text });
      i = Math.max(-1, i - 2);
    } else if (i + 1 < units.length) {
      units.splice(i, 2, { ...units[i], text: units[i].text + units[i + 1].text });
    } else if (i > 0) {
      units.splice(i - 1, 2, { ...units[i - 1], text: units[i - 1].text + units[i].text });
      i = Math.max(-1, i - 2);
    }
  }
  return units;
}
function rebalanceLong(units, max = 55) {
  const out = [];
  const cjk = (t) => [...t].filter((c) => /[\u4e00-\u9fa5]/.test(c)).length;
  for (const u of units) {
    const chars = [...u.text];
    if (chars.length <= max) { out.push(u); continue; }
    const k = Math.ceil(chars.length / max);
    const parts = [];
    let i = 0;
    for (let p = 0; p < k; p++) {
      const size = Math.floor(chars.length / k) + (p < chars.length % k ? 1 : 0);
      parts.push(chars.slice(i, i + size).join(''));
      i += size;
    }
    if (parts.every((t) => cjk(t) >= 3)) out.push(...parts.map((text) => ({ ...u, text })));
    else out.push(u);
  }
  return out;
}
function hardCap(text, max) {
  const chars = [...text];
  const out = [];
  for (let i = 0; i < chars.length; i += max) out.push(chars.slice(i, i + max).join(''));
  return out;
}

let filteredTableSection = 0;
let filteredHead = 0;
let filteredLegend = 0;
let filteredShort = 0;
let filteredEnglish = 0;
let filteredTableCaption = 0;
let skippedUnits = 0;

const chapterMeta = [];
const chapterStats = [];

for (let idx = from; idx <= to; idx++) {
  const key = String(idx).padStart(2, '0');
  const chapterJson = path.join(chaptersDir, `${key}.json`);
  if (!fs.existsSync(chapterJson)) {
    const r = spawnSync(process.execPath, ['skills/sentences-typo-forge/scripts/extract-epub.mjs', epubDir, String(idx), chapterJson], {
      encoding: 'utf8',
    });
    if (r.status !== 0) {
      console.error(`第 ${idx} 章抽取失败`, r.stderr);
      continue;
    }
  }
  const chapter = JSON.parse(fs.readFileSync(chapterJson, 'utf8'));
  const chapterTitle = stripNum(chapter.chapterTitle);
  const chapterId = `chapter-${key}`;
  const file = `${key}-chapter.json`;

  const fragments = [];
  for (const sec of chapter.sections) {
    const shortRatio = sec.paragraphs.filter((p) => L(p) < 12 && !/[。！？]/.test(p)).length / Math.max(1, sec.paragraphs.length);
    if (sec.paragraphs.length > 40 && shortRatio > 0.5) { filteredTableSection++; continue; }
    const items = [];
    sec.paragraphs.forEach((p, pi) => {
      if (
        /^第[一二三四五六七八九十百千0-9]+[章节]/.test(p) ||
        /^[一二三四五六七八九十]+、/.test(p) ||
        /^【/.test(p) ||
        /^（[一二三四五六七八九十]+）/.test(p) ||
        /^[①-⑳]/.test(p) ||
        /^\d+[.、]/.test(p) ||
        /^[图表]\s*\d+/.test(p)
      ) {
        filteredHead++;
        return;
      }
      if (/^表\s*\d+[-—]\d+/.test(p)) {
        filteredTableCaption++;
        return;
      }
      if ((p.match(/；/g) || []).length >= 2 && !p.includes('。') && [...p].length < 100) {
        filteredLegend++;
        return;
      }
      if ([...p].length < 25 && !/[。！？]/.test(p)) {
        filteredShort++;
        return;
      }
      for (const s of splitParagraph(p).flatMap((x) => capSentence(x, MAX))) {
        const ascii = [...s].filter((c) => c.charCodeAt(0) < 128).length / Math.max(1, [...s].length);
        const cjkCount = [...s].filter((c) => /[\u4e00-\u9fa5]/.test(c)).length;
        if (cjkCount < 4 && ascii > 0.6) {
          filteredEnglish++;
          continue;
        }
        items.push({ text: s, paragraph: pi + 1 });
      }
    });
    if (!items.length) continue;
    const merged0 = mergeShort(items, MIN, MAX);
    mergeWeak(merged0, MAX);
    const merged = merged0.flatMap((u) => {
      if ([...u.text].length > MAX) {
        const parts = hardCap(u.text, MAX);
        return parts.map((text, i) => ({ ...u, text, hardCut: i }));
      }
      return [u];
    });

    mergeWeak(merged, MAX);
    merged.splice(0, merged.length, ...rebalanceLong(merged, MAX));
    const n = merged.length;
    const chunks = [];
    if (n <= 30) chunks.push(merged);
    else {
      let k = Math.max(1, Math.round(n / 26));
      while (Math.ceil(n / k) > 30) k++;
      let start = 0;
      for (let i = 0; i < k; i++) {
        const size = Math.floor(n / k) + (i < n % k ? 1 : 0);
        chunks.push(merged.slice(start, start + size));
        start += size;
      }
    }
    chunks.forEach((chunk, ci) => {
      const suffix = chunks.length > 1 ? `（${ci + 1}）` : '';
      const title = (sec.title === chapter.chapterTitle ? '概述' : stripNum(sec.title)) + suffix;
      fragments.push({ title, units: chunk });
    });
  }

  mergeSmall(fragments);
  fragments.splice(0, fragments.length, ...splitBig(fragments));

  // 独立性
  for (let i = 1; i < fragments.length; i++) {
    const first = fragments[i].units[0];
    if (!first || !ANAPHORA.test(first.text)) continue;
    const prevUnits = fragments[i - 1].units;
    const pick =
      [...prevUnits].reverse().find(
        (u) => [...u.text].length >= 30 && !((u.text.match(/；/g) || []).length >= 2 && !u.text.includes('。')),
      ) ?? prevUnits[prevUnits.length - 1];
    fragments[i].units.unshift({ ...pick, carried: true });
  }

  // 生成
  const chapterFrags = [];
  fragments.forEach((frag, fi) => {
    const fragId = `${chapterId}-${String(fi + 1).padStart(2, '0')}`;
    const units = [];
    frag.units.forEach((u, ui) => {
      let wrongs = u.wrongOptions;
      if (!wrongs) {
        for (let attempt = 0; attempt < 6 && !wrongs; attempt++) {
          wrongs = mutateUnit(u.text, shape, common, `${fragId}-s${ui + 1}-${attempt}`, 3);
        }
      }
      if (!wrongs) {
        skippedUnits++;
        return;
      }
      units.push({
        id: `${fragId}-s${String(units.length + 1).padStart(2, '0')}`,
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
        id: `${fragId}-p${pages.length + 1}`,
        title: `第 ${pages.length + 1} 页`,
        unitIds: units.slice(i, i + 12).map((x) => x.id),
      });
    }
    chapterFrags.push({ id: fragId, title: frag.title, units, pages });
  });

  if (!chapterFrags.length) continue;
  const metaFrags = chapterFrags.map((f, i) => {
    const uf = path.join(unitsDir, `${f.id}.json`);
    const pf = path.join(pagesDir, `${f.id}.json`);
    fs.writeFileSync(uf, JSON.stringify(f.units, null, 2), 'utf8');
    fs.writeFileSync(pf, JSON.stringify(f.pages, null, 2), 'utf8');
    return { id: f.id, title: f.title, order: i + 1, recommendedRounds: 12, unitsFile: uf, pagesFile: pf };
  });

  chapterMeta.push({ id: chapterId, title: chapterTitle, order: chapterMeta.length + 1, file, fragments: metaFrags });
  chapterStats.push({
    chapter: chapterTitle,
    fragments: chapterFrags.length,
    units: chapterFrags.reduce((n, f) => n + f.units.length, 0),
  });
  console.log(`${key} ${chapterTitle}：${chapterFrags.length} 碎片 ${chapterStats[chapterStats.length - 1].units} 句`);
}

const meta = {
  book: {
    id: bookId,
    title: bookTitle,
    author,
    contentVersion: 2,
    contentNote: '脚本版：单字找茬模式；表格式小节跳过；长句按标点切分，短句同小节内拼接。',
  },
  chapters: chapterMeta,
};
const metaPath = path.join(workDir, 'meta.json');
fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');

const build = spawnSync(process.execPath, ['skills/sentences-map-forge/scripts/build-book.mjs', metaPath], {
  encoding: 'utf8',
  stdio: 'inherit',
});
if (build.status !== 0) process.exit(build.status ?? 1);

const v = spawnSync(process.execPath, ['scripts/validate-map.mjs', path.join('public/maps', bookId, 'book.json')], {
  encoding: 'utf8',
});
process.stdout.write(v.stdout);
process.stderr.write(v.stderr);

const report = {
  bookId,
  bookTitle,
  chapters: chapterMeta.length,
  fragments: chapterMeta.reduce((n, c) => n + c.fragments.length, 0),
  units: chapterStats.reduce((n, c) => n + c.units, 0),
  filteredTableSection,
  filteredHead,
  filteredTableCaption,
  filteredLegend,
  filteredShort,
  filteredEnglish,
  skippedUnits,
  chapterStats,
};
fs.writeFileSync(path.join(workDir, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(`\n全书：${report.chapters} 章 ${report.fragments} 碎片 ${report.units} 句`);
console.log(`过滤：标题 ${filteredHead}，表题 ${filteredTableCaption}，图注 ${filteredLegend}，短行 ${filteredShort}，英文 ${filteredEnglish}，跳过 ${skippedUnits}`);
