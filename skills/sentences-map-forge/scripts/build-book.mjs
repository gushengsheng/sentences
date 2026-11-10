// 组装 sentences v2：书 → 章节 → 知识碎片 → 句子
// 用法：node build-book.mjs <meta.json> [--out=<dir>]
//
// meta.json：
// {
//   "book": {
//     "id": "pharmacology",
//     "title": "药理学",
//     "author": "",
//     "contentVersion": 2,
//     "contentNote": ""
//   },
//   "chapters": [
//     {
//       "id": "anticholinergic",
//       "title": "胆碱受体阻断药",
//       "order": 1,
//       "file": "01-anticholinergic.json",
//       "fragments": [
//         {
//           "id": "anticholinergic-01",
//           "title": "总论与药动学",
//           "order": 1,
//           "recommendedRounds": 12,
//           "unitsFile": ".work/units/anticholinergic-01.json",
//           "pagesFile": ".work/pages/anticholinergic-01.json"
//         }
//       ]
//     }
//   ]
// }
//
// 输出：
//   <out>/<book.id>/book.json
//   <out>/<book.id>/<chapter.file>
// 默认 out=public/maps，并在最后调用 scripts/index-books.mjs。
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const metaPath = process.argv[2];
if (!metaPath) {
  console.error('用法：node build-book.mjs <meta.json> [--out=<dir>]');
  process.exit(2);
}
const outArg = process.argv.find((a) => a.startsWith('--out='));
const OUT = outArg ? outArg.slice('--out='.length) : 'public/maps';

const meta = JSON.parse(readFileSync(metaPath, 'utf8').replace(/^\uFEFF/, ''));
const book = meta.book;
if (!book?.id || !book?.title) {
  console.error('meta.book 缺少 id / title');
  process.exit(1);
}
if (!Array.isArray(meta.chapters) || meta.chapters.length === 0) {
  console.error('meta.chapters 为空');
  process.exit(1);
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
if (!SLUG.test(book.id)) {
  console.error(`book.id 必须是英文小写 slug：${book.id}`);
  process.exit(1);
}

const bookDir = join(OUT, book.id);
mkdirSync(bookDir, { recursive: true });

const chapterRefs = [];
const usedChapters = new Set();
let totalFragments = 0;
let totalUnits = 0;

meta.chapters.forEach((ch, ci) => {
  if (!ch.id || usedChapters.has(ch.id)) {
    console.error(`章节 id 缺失或重复：${ch.id}`);
    process.exit(1);
  }
  usedChapters.add(ch.id);
  if (!ch.file || !/^\d{2}-[a-z0-9-]+\.json$/.test(ch.file)) {
    console.error(`章节 ${ch.id}：file 必须是 NN-<english>.json，例如 01-anticholinergic.json`);
    process.exit(1);
  }
  if (!Array.isArray(ch.fragments) || ch.fragments.length === 0) {
    console.error(`章节 ${ch.id}：fragments 为空`);
    process.exit(1);
  }

  const usedFragments = new Set();
  const fragments = ch.fragments.map((frag, fi) => {
    if (!frag.id || usedFragments.has(frag.id)) {
      console.error(`章节 ${ch.id}：碎片 id 缺失或重复 ${frag.id}`);
      process.exit(1);
    }
    usedFragments.add(frag.id);
    if (!frag.unitsFile || !existsSync(frag.unitsFile)) {
      console.error(`碎片 ${frag.id}：unitsFile 不存在 ${frag.unitsFile}`);
      process.exit(1);
    }
    let units = JSON.parse(readFileSync(frag.unitsFile, 'utf8'));
    if (!Array.isArray(units)) units = units.units;
    if (!Array.isArray(units) || units.length === 0) {
      console.error(`碎片 ${frag.id}：units 为空`);
      process.exit(1);
    }
    units = units.map(({ id, paragraph, original, wrongOptions, carried }) => ({
      id,
      paragraph,
      original,
      wrongOptions,
      ...(carried ? { carried: true } : {}),
    }));

    const pages = frag.pagesFile
      ? JSON.parse(readFileSync(frag.pagesFile, 'utf8'))
      : undefined;

    totalFragments++;
    totalUnits += units.length;
    return {
      id: frag.id,
      title: frag.title ?? frag.id,
      order: frag.order ?? fi + 1,
      recommendedRounds: frag.recommendedRounds ?? 12,
      ...(pages
        ? {
            pages: pages.map((p, k) => ({
              ...p,
              id: `${frag.id}-p${k + 1}`,
              title: p.title ?? `第 ${k + 1} 页`,
            })),
          }
        : {}),
      units,
    };
  });

  const chapter = { id: ch.id, title: ch.title ?? ch.id, fragments };
  writeFileSync(join(bookDir, ch.file), JSON.stringify(chapter, null, 2) + '\n', 'utf8');
  chapterRefs.push({
    id: ch.id,
    title: ch.title ?? ch.id,
    order: ch.order ?? ci + 1,
    file: ch.file,
  });
});

const bookJson = {
  schemaVersion: 2,
  id: book.id,
  title: book.title,
  author: book.author ?? '',
  contentVersion: book.contentVersion ?? 2,
  ...(book.contentNote ? { contentNote: book.contentNote } : {}),
  chapters: chapterRefs,
};
writeFileSync(join(bookDir, 'book.json'), JSON.stringify(bookJson, null, 2) + '\n', 'utf8');

console.log(`写入 ${bookDir}/book.json（${chapterRefs.length} 章，${totalFragments} 个碎片，${totalUnits} 个句子）`);

if (OUT === 'public/maps') {
  const r = spawnSync(process.execPath, ['scripts/index-books.mjs'], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
