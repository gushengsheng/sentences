// 组装地图包并写入 public/maps，同时更新 index.json
// 用法：node build.mjs <meta.json>
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const metaPath = process.argv[2];
if (!metaPath) {
  console.error('用法：node build.mjs <meta.json>');
  process.exit(2);
}

const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
if (!meta.packId || !meta.title || !Array.isArray(meta.maps)) {
  console.error('meta.json 缺少 packId / title / maps');
  process.exit(1);
}

const maps = meta.maps.map((m, i) => {
  const units = JSON.parse(readFileSync(m.unitsFile, 'utf8'));
  const pages = m.pagesFile ? JSON.parse(readFileSync(m.pagesFile, 'utf8')) : undefined;
  return {
    id: m.id,
    title: m.title,
    order: m.order ?? i + 1,
    recommendedRounds: m.recommendedRounds ?? 9,
    ...(pages ? { pages: pages.map((p, k) => ({ ...p, id: `${m.id}-p${k + 1}` })) } : {}),
    units,
  };
});

const pack = {
  schemaVersion: 1,
  id: meta.packId,
  title: meta.title,
  ...(meta.source ? { source: meta.source } : {}),
  ...(meta.description ? { description: meta.description } : {}),
  maps,
};

const outDir = 'public/maps';
mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, `${pack.id}.json`);
writeFileSync(outFile, JSON.stringify(pack, null, 2), 'utf8');

// 更新清单
const indexPath = join(outDir, 'index.json');
let index = { schemaVersion: 1, packs: [] };
if (existsSync(indexPath)) {
  try {
    index = JSON.parse(readFileSync(indexPath, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    // 清单坏了就重建
  }
}
index.packs = (index.packs ?? []).filter((p) => p.id !== pack.id);
index.packs.push({
  id: pack.id,
  title: pack.title,
  file: `${pack.id}.json`,
  maps: pack.maps.length,
});
index.packs.sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf8');

console.log(`写入 ${outFile}（${pack.maps.length} 个战区）`);
console.log(`更新 ${indexPath}（${index.packs.length} 个地图包）`);
