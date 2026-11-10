// 单字找茬核心：切句、限长、短句拼接、单字替换
export const L = (s) => [...s].length;

const END = new Set(['。', '！', '？', '!', '?']);
const CLOSE = new Set(['”', '’', '」', '』', '）', ')', '》', '】', '"']);
const BREAK = new Set(['；', '：', '，', '、', ';', ':', ',']);
const CJK = /[\u4e00-\u9fa5]/;

export function splitParagraph(p) {
  const parts = [];
  let buf = '';
  const chars = [...p];
  for (let i = 0; i < chars.length; i++) {
    buf += chars[i];
    if (END.has(chars[i])) {
      let j = i + 1;
      while (j < chars.length && CLOSE.has(chars[j])) buf += chars[j++];
      i = j - 1;
      if (buf.trim()) parts.push(buf.trim());
      buf = '';
    }
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts;
}

export function capSentence(s, max = 55) {
  const out = [];
  let rest = s;
  while (L(rest) > max) {
    const chars = [...rest];
    let cut = -1;
    for (let i = 0; i < chars.length && i < max; i++) if (BREAK.has(chars[i])) cut = i + 1;
    if (cut < 0) {
      for (let i = 0; i < chars.length; i++) if (BREAK.has(chars[i])) { cut = i + 1; break; }
    }
    if (cut <= 0 || cut >= chars.length) break;
    out.push(chars.slice(0, cut).join('').trim());
    rest = chars.slice(cut).join('').trim();
  }
  if (rest) out.push(rest);
  return out.filter(Boolean);
}

// 短句在同小节内按序拼接，直到 >= min（不超 max）
export function mergeShort(items, min = 30, max = 55) {
  const out = [];
  let cur = null;
  for (const it of items) {
    if (!cur) { cur = { ...it }; continue; }
    const joined = cur.text + it.text;
    if (L(cur.text) < min && L(joined) <= max) {
      cur.text = joined;
    } else {
      out.push(cur);
      cur = { ...it };
    }
  }
  if (cur) out.push(cur);
  // 末尾过短，尝试并入前一个
  if (out.length > 1 && L(out[out.length - 1].text) < min) {
    const tail = out.pop();
    const prev = out[out.length - 1];
    if (L(prev.text + tail.text) <= max) prev.text += tail.text;
    else out.push(tail);
  }
  return out;
}

export function hash(str) {
  let h = 2166136261;
  for (const c of str) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function rngOf(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(a, rng) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 返回 3 段单字篡改；失败返回 null
export function mutateUnit(original, shape, common, seedStr, edge = 3) {
  const chars = [...original];
  const idx = [];
  for (let i = 0; i < chars.length; i++) if (CJK.test(chars[i])) idx.push(i);
  let cand = idx.filter((i) => i >= edge && i < chars.length - edge);
  if (cand.length < 3) cand = idx.slice();
  if (cand.length < 3) return null;
  const rng = rngOf(hash(seedStr));
  shuffle(cand, rng);
  const opts = [];
  for (const i of cand) {
    const ch = chars[i];
    let pool = (shape[ch] ?? []).filter((c) => c !== ch && CJK.test(c));
    if (!pool.length) pool = common.filter((c) => c !== ch);
    if (!pool.length) continue;
    shuffle(pool, rng);
    for (const rep of pool.slice(0, 12)) {
      const text = chars.slice(0, i).join('') + rep + chars.slice(i + 1).join('');
      if (text === original || opts.includes(text)) continue;
      opts.push(text);
      break;
    }
    if (opts.length === 3) break;
  }
  return opts.length === 3 ? opts : null;
}
