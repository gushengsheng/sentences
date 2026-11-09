// 地图校验器 v2：支持 书(book.json) / 章节(fragments) / v1 地图包(maps)
// 用法：node scripts/validate-map.mjs <book.json | 章节.json | v1包.json>
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const errors = [];
const warnings = [];
const fail = (m) => errors.push(m);
const warn = (m) => warnings.push(m);
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;

function validateFragment(frag, tag) {
  if (!Array.isArray(frag.units) || frag.units.length === 0) {
    fail(`${tag}：units 为空`);
    return { units: 0 };
  }

  const ids = new Set();
  let corrupt = 0;

  for (const u of frag.units) {
    const t = `${tag}/${u.id ?? '?'}`;
    if (!isStr(u.id)) fail(`${t}：id 缺失`);
    if (ids.has(u.id)) fail(`${t}：id 重复`);
    ids.add(u.id);
    if (!isStr(u.original)) fail(`${t}：original 缺失`);
    if (!isStr(u.wrongDisplay)) fail(`${t}：wrongDisplay 缺失`);
    if (!isStr(u.correctOption)) fail(`${t}：correctOption 缺失`);
    if (!Array.isArray(u.wrongOptions) || u.wrongOptions.length !== 3) {
      fail(`${t}：wrongOptions 必须为 3 项`);
    } else if (!u.wrongOptions.every(isStr)) {
      fail(`${t}：wrongOptions 含空项`);
    }
    if (typeof u.corruptNow !== 'boolean') fail(`${t}：corruptNow 必须为布尔`);
    if (u.corruptNow) corrupt++;

    const opts = [u.correctOption, ...(u.wrongOptions ?? [])];
    const optSet = new Set(opts);
    if (optSet.size !== 4) fail(`${t}：4 个选项不唯一`);
    if (optSet.has(u.original)) fail(`${t}：原文与某个选项重复`);
    if (optSet.has(u.wrongDisplay)) fail(`${t}：wrongDisplay 与某个选项重复`);
    if (u.original === u.wrongDisplay) fail(`${t}：原文与篡改版相同`);

    const lens = [u.original, u.wrongDisplay, ...opts].filter(isStr).map((s) => s.length);
    if (lens.length === 5) {
      const max = Math.max(...lens);
      const min = Math.min(...lens);
      if (max / min > 1.3) warn(`${t}：文本长度差 ${Math.round((max / min - 1) * 100)}%`);
    }
  }

  const density = corrupt / frag.units.length;
  if (density < 0.15 || density > 0.35) {
    warn(`${tag}：错误密度 ${(density * 100).toFixed(0)}% 超出 15–35%`);
  }

  if (Array.isArray(frag.pages) && frag.pages.length > 0) {
    const covered = new Set();
    for (const p of frag.pages) {
      if (!Array.isArray(p.unitIds) || p.unitIds.length === 0) {
        fail(`${tag}/${p.id}：页为空`);
        continue;
      }
      for (const id of p.unitIds) {
        if (!ids.has(id)) fail(`${tag}/${p.id}：引用了不存在的句元 ${id}`);
        if (covered.has(id)) fail(`${tag}/${p.id}：句元 ${id} 被多页覆盖`);
        covered.add(id);
      }
    }
    for (const id of ids) if (!covered.has(id)) fail(`${tag}：句元 ${id} 没有归入任何页`);
  }

  return { units: frag.units.length };
}

function validateChapter(chapter, tag) {
  if (!Array.isArray(chapter.fragments) || chapter.fragments.length === 0) {
    fail(`${tag}：fragments 为空`);
    return { fragments: 0, units: 0 };
  }
  let units = 0;
  const fragIds = new Set();
  for (const frag of chapter.fragments) {
    if (!isStr(frag.id)) fail(`${tag}：碎片 id 缺失`);
    if (fragIds.has(frag.id)) fail(`${tag}：碎片 id 重复 ${frag.id}`);
    fragIds.add(frag.id);
    if (!isStr(frag.title)) warn(`${tag}/${frag.id}：title 缺失`);
    units += validateFragment(frag, `${tag}/${frag.id}`).units;
  }
  return { fragments: chapter.fragments.length, units };
}

export function validateFile(filePath) {
  errors.length = 0;
  warnings.length = 0;

  let data;
  try {
    data = JSON.parse(readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  } catch (e) {
    fail(`JSON 解析失败：${e.message}`);
    return { ok: false, errors, warnings, stats: [] };
  }

  const stats = [];

  // v2 书
  if (Array.isArray(data.chapters)) {
    const dir = dirname(filePath);
    if (!isStr(data.id)) fail('书 id 缺失');
    if (!isStr(data.title)) fail('书 title 缺失');
    for (const ref of data.chapters) {
      if (!isStr(ref.file)) {
        fail(`章节 ${ref.id}：file 缺失`);
        continue;
      }
      const chapterPath = join(dir, ref.file);
      if (!existsSync(chapterPath)) {
        fail(`章节文件不存在：${ref.file}`);
        continue;
      }
      let chapter;
      try {
        chapter = JSON.parse(readFileSync(chapterPath, 'utf8').replace(/^\uFEFF/, ''));
      } catch (e) {
        fail(`${ref.file} 解析失败：${e.message}`);
        continue;
      }
      const r = validateChapter(chapter, `${data.id}/${ref.id}`);
      stats.push({ mapId: ref.id, fragments: r.fragments, units: r.units });
    }
    return { ok: errors.length === 0, errors, warnings, stats };
  }

  // v2 章节
  if (Array.isArray(data.fragments)) {
    const r = validateChapter(data, data.id ?? 'chapter');
    stats.push({ mapId: data.id ?? 'chapter', fragments: r.fragments, units: r.units });
    return { ok: errors.length === 0, errors, warnings, stats };
  }

  // v1 地图包
  if (Array.isArray(data.maps)) {
    let units = 0;
    for (const m of data.maps) units += validateFragment(m, `${data.id}/${m.id}`).units;
    stats.push({ mapId: data.id ?? 'pack', fragments: data.maps.length, units });
    return { ok: errors.length === 0, errors, warnings, stats };
  }

  fail('无法识别的文件类型：既不是书、也不是章节、也不是 v1 地图包');
  return { ok: false, errors, warnings, stats: [] };
}

const isMain = process.argv[1] && process.argv[1].endsWith('validate-map.mjs');
if (isMain) {
  const file = process.argv[2];
  if (!file) {
    console.error('用法：node scripts/validate-map.mjs <book.json | 章节.json | v1包.json>');
    process.exit(2);
  }
  const res = validateFile(file);
  for (const s of res.stats) {
    console.log(`  ${s.mapId}: ${s.fragments} 个碎片, ${s.units} 个句元`);
  }
  for (const w of res.warnings) console.warn('WARN ', w);
  for (const e of res.errors) console.error('ERROR', e);
  console.log(res.ok ? `PASS (${res.warnings.length} warnings)` : `FAIL (${res.errors.length} errors)`);
  process.exit(res.ok ? 0 : 1);
}
