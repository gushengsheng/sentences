// 扫描 public/maps/<bookDir>/book.json，生成 public/maps/index.json
// 由 npm run build 的 prebuild 自动调用。
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const mapsDir = 'public/maps';

if (!existsSync(mapsDir)) {
  console.error(`缺少目录：${mapsDir}`);
  process.exit(1);
}

const dirs = readdirSync(mapsDir).filter((name) => {
  const full = join(mapsDir, name);
  return statSync(full).isDirectory() && existsSync(join(full, 'book.json'));
});

const books = [];

for (const dir of dirs.sort()) {
  const bookPath = join(mapsDir, dir, 'book.json');
  let book;
  try {
    book = JSON.parse(readFileSync(bookPath, 'utf8').replace(/^\uFEFF/, ''));
  } catch (e) {
    console.error(`跳过 ${bookPath}：${e.message}`);
    continue;
  }

  let fragmentCount = 0;
  let broken = false;
  const chapterMeta = [];
  for (const ref of book.chapters ?? []) {
    const chapterPath = join(mapsDir, dir, ref.file);
    if (!existsSync(chapterPath)) {
      console.error(`跳过 ${dir}：章节文件缺失 ${ref.file}`);
      broken = true;
      break;
    }
    try {
      const chapter = JSON.parse(readFileSync(chapterPath, 'utf8').replace(/^\uFEFF/, ''));
      const count = chapter.fragments?.length ?? 0;
      fragmentCount += count;
      chapterMeta.push({ id: ref.id, title: ref.title, order: ref.order, fragments: count });
    } catch (e) {
      console.error(`跳过 ${dir}：${ref.file} 解析失败 ${e.message}`);
      broken = true;
      break;
    }
  }
  if (broken) continue;

  books.push({
    id: book.id ?? dir,
    title: book.title ?? dir,
    ...(book.author ? { author: book.author } : {}),
    dir,
    file: `${dir}/book.json`,
    chapters: (book.chapters ?? []).length,
    fragments: fragmentCount,
    chapterMeta,
  });
}

books.sort((a, b) => a.title.localeCompare(b.title, 'zh'));

const index = { schemaVersion: 2, books };
writeFileSync(join(mapsDir, 'index.json'), JSON.stringify(index, null, 2) + '\n', 'utf8');
console.log(`maps/index.json：${books.length} 本书，${books.reduce((s, b) => s + b.fragments, 0)} 个知识碎片`);
