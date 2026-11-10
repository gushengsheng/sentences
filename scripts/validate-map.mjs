// 地图校验器 v3：书 / 章节 / v1 包
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

const errors = [];
const warnings = [];
const fail = (m) => errors.push(m);
const warn = (m) => warnings.push(m);
const isStr = (v) => typeof v === "string" && v.trim().length > 0;
const LEGACY = ["wrongDisplay", "correctOption", "corruptNow"];

function validateUnit(u, tag) {
  if (!isStr(u.id)) fail(tag + "：id 缺失");
  if (!isStr(u.original)) fail(tag + "：original 缺失");
  if (!Array.isArray(u.wrongOptions) || u.wrongOptions.length !== 3) {
    fail(tag + "：wrongOptions 必须为 3 段");
  } else if (!u.wrongOptions.every(isStr)) {
    fail(tag + "：wrongOptions 含空项");
  }
  for (const k of LEGACY) {
    if (k in u) warn(tag + "：残留旧字段 " + k + "（请运行迁移脚本）");
  }
  const texts = [u.original, ...(Array.isArray(u.wrongOptions) ? u.wrongOptions : [])].filter(isStr);
  if (new Set(texts).size !== texts.length) fail(tag + "：4 段文本不唯一");
  if (texts.length === 4) {
    const lens = texts.map((s) => s.length);
    const max = Math.max(...lens), min = Math.min(...lens);
    if (min > 0 && max / min > 1.3) warn(tag + "：文本长度差 " + Math.round((max / min - 1) * 100) + "%");
  }
}

function validateFragment(frag, tag) {
  if (!Array.isArray(frag.units) || frag.units.length === 0) {
    fail(tag + "：units 为空");
    return { units: 0 };
  }
  const ids = new Set();
  for (const u of frag.units) {
    if (ids.has(u.id)) fail(tag + "：句子 id 重复 " + u.id);
    ids.add(u.id);
    validateUnit(u, tag + "/" + (u.id || "?"));
  }
  if (Array.isArray(frag.pages) && frag.pages.length > 0) {
    const covered = new Set();
    for (const p of frag.pages) {
      if (!Array.isArray(p.unitIds) || p.unitIds.length === 0) { fail(tag + "/" + p.id + "：页为空"); continue; }
      for (const id of p.unitIds) {
        if (!ids.has(id)) fail(tag + "/" + p.id + "：引用了不存在的句子 " + id);
        if (covered.has(id)) fail(tag + "/" + p.id + "：句子 " + id + " 被多页覆盖");
        covered.add(id);
      }
    }
    for (const id of ids) if (!covered.has(id)) fail(tag + "：句子 " + id + " 没有归入任何页");
  }
  return { units: frag.units.length };
}

function validateChapter(chapter, tag) {
  if (chapter.density !== undefined) {
    if (typeof chapter.density !== "number" || chapter.density <= 0 || chapter.density > 0.5) {
      fail(tag + "：density 必须是 (0, 0.5] 的数字");
    }
  }
  if (!Array.isArray(chapter.fragments) || chapter.fragments.length === 0) {
    fail(tag + "：fragments 为空");
    return { fragments: 0, units: 0 };
  }
  let units = 0;
  const fragIds = new Set();
  for (const frag of chapter.fragments) {
    if (!isStr(frag.id)) fail(tag + "：碎片 id 缺失");
    if (fragIds.has(frag.id)) fail(tag + "：碎片 id 重复 " + frag.id);
    fragIds.add(frag.id);
    units += validateFragment(frag, tag + "/" + frag.id).units;
  }
  return { fragments: chapter.fragments.length, units };
}

export function validateFile(filePath) {
  errors.length = 0;
  warnings.length = 0;
  let data;
  try {
    data = JSON.parse(readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
  } catch (e) {
    fail("JSON 解析失败：" + e.message);
    return { ok: false, errors, warnings, stats: [] };
  }
  const stats = [];
  if (Array.isArray(data.chapters)) {
    const dir = dirname(filePath);
    if (!isStr(data.id)) fail("书 id 缺失");
    if (!isStr(data.title)) fail("书 title 缺失");
    for (const ref of data.chapters) {
      if (!isStr(ref.file)) { fail("章节 " + ref.id + "：file 缺失"); continue; }
      const chapterPath = join(dir, ref.file);
      if (!existsSync(chapterPath)) { fail("章节文件不存在：" + ref.file); continue; }
      let chapter;
      try { chapter = JSON.parse(readFileSync(chapterPath, "utf8").replace(/^\uFEFF/, "")); }
      catch (e) { fail(ref.file + " 解析失败：" + e.message); continue; }
      const r = validateChapter(chapter, data.id + "/" + ref.id);
      stats.push({ mapId: ref.id, fragments: r.fragments, units: r.units });
    }
    return { ok: errors.length === 0, errors, warnings, stats };
  }
  if (Array.isArray(data.fragments)) {
    const r = validateChapter(data, data.id ?? "chapter");
    stats.push({ mapId: data.id ?? "chapter", fragments: r.fragments, units: r.units });
    return { ok: errors.length === 0, errors, warnings, stats };
  }
  if (Array.isArray(data.maps)) {
    let units = 0;
    for (const m of data.maps) units += validateFragment(m, (data.id ?? "pack") + "/" + m.id).units;
    stats.push({ mapId: data.id ?? "pack", fragments: data.maps.length, units });
    return { ok: errors.length === 0, errors, warnings, stats };
  }
  fail("无法识别的文件类型");
  return { ok: false, errors, warnings, stats: [] };
}

const isMain = process.argv[1] && process.argv[1].endsWith("validate-map.mjs");
if (isMain) {
  const file = process.argv[2];
  if (!file) { console.error("用法：node scripts/validate-map.mjs <book.json | 章节.json | v1包.json>"); process.exit(2); }
  const res = validateFile(file);
  for (const s of res.stats) console.log("  " + s.mapId + ": " + s.fragments + " 个碎片, " + s.units + " 个句子");
  for (const w of res.warnings) console.warn("WARN ", w);
  for (const e of res.errors) console.error("ERROR", e);
  console.log(res.ok ? "PASS (" + res.warnings.length + " warnings)" : "FAIL (" + res.errors.length + " errors)");
  process.exit(res.ok ? 0 : 1);
}
