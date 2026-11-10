// 旧句元 → v3：wrongOptions = [wrongDisplay, 旧w2, 旧w3]
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = "public/maps";
let files = 0, units = 0;

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full);
    else if (name.endsWith(".json") && name !== "index.json") migrate(full);
  }
}

function migrateUnit(u) {
  if (!u || typeof u !== "object") return false;
  if (!("wrongDisplay" in u) && !("correctOption" in u) && !("corruptNow" in u)) return false;
  const old = Array.isArray(u.wrongOptions) ? u.wrongOptions.slice() : [];
  const merged = [u.wrongDisplay, old[1], old[2]].filter((x) => typeof x === "string" && x.trim());
  if (merged.length !== 3) {
    console.error("  !! 无法合并（段数不足）", u.id);
    return false;
  }
  u.wrongOptions = merged;
  delete u.wrongDisplay;
  delete u.correctOption;
  delete u.corruptNow;
  return true;
}

function migrateUnits(list) {
  let n = 0;
  for (const u of list ?? []) if (migrateUnit(u)) n++;
  return n;
}

function migrate(file) {
  const raw = readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  let data;
  try { data = JSON.parse(raw); } catch { return; }
  let n = 0;
  if (Array.isArray(data.fragments)) {
    for (const f of data.fragments) n += migrateUnits(f.units);
  } else if (Array.isArray(data.maps)) {
    for (const m of data.maps) n += migrateUnits(m.units);
  } else return;
  if (n > 0) {
    writeFileSync(file, JSON.stringify(data, null, 2) + "\n", "utf8");
    files++; units += n;
    console.log("migrated", file, "units:", n);
  }
}

walk(root);
console.log(`完成：${files} 个文件，${units} 个句元`);
