// v2 引擎回归：书 → 章节 → 知识碎片
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createMatch, apply, incomeOf, tally } from '../src/engine.ts';
import { validateFile } from './validate-map.mjs';

let failures = 0;
function ok(cond, msg) {
  if (!cond) {
    console.log('FAIL:', msg);
    failures++;
  }
}

const bookPath = fileURLToPath(new URL('../public/maps/pharmacology/book.json', import.meta.url));
const book = JSON.parse(readFileSync(bookPath, 'utf8').replace(/^\uFEFF/, ''));
const chapterPath = join(bookPath, '..', book.chapters[0].file);
const chapter = JSON.parse(readFileSync(chapterPath, 'utf8').replace(/^\uFEFF/, ''));

const v = validateFile(bookPath);
ok(v.ok, `书校验失败：${v.errors.join('; ')}`);
ok(book.chapters.length >= 1, '书应至少有一章');
ok(chapter.fragments.length >= 1, '章节应至少有一个知识碎片');

const meta = {
  bookId: book.id,
  bookTitle: book.title,
  chapterId: chapter.id,
  chapterTitle: chapter.title ?? '',
};
const fragId = chapter.fragments[0].id;

// --- AP 不结转 ---
{
  let s = createMatch(chapter, fragId, 9, 5, meta);
  const side = s.turn;
  const before = s.ap[side];
  s = apply(s, { kind: 'endTurn' }).state;
  ok(s.ap[side] === 0, `回合结束后 ${side} 的 AP 应清零，实际 ${s.ap[side]}`);
  ok(before > 0, '首回合应有 AP');
}

// --- 不限轮数：棋盘占满即结束 ---
{
  let s = createMatch(chapter, fragId, 0, 11, meta);
  let guard = 0;
  while (!s.ended && guard++ < 8000) {
    const side = s.turn;
    const free = s.order.filter((id) => s.cells[id].owner === null);
    if (s.ap[side] >= 1 && free.length) {
      s = apply(s, { kind: 'claim', unitId: free[0] }).state;
      continue;
    }
    if (free.length === 0 && s.ap[side] < 1) {
      ok(false, '棋盘占满后未结束');
      break;
    }
    s = apply(s, { kind: 'endTurn' }).state;
  }
  ok(s.ended, '不限轮数下棋盘占满应结束');
}

// --- 随机对局 ---
for (const rounds of [6, 9, 12]) {
  const frag = chapter.fragments[1] ?? chapter.fragments[0];
  let s = createMatch(chapter, frag.id, rounds, 1000 + rounds, meta);
  let guard = 0;
  while (!s.ended && guard++ < 20000) {
    const side = s.turn;
    const owned = s.order.filter((id) => s.cells[id].owner === side);
    const free = s.order.filter((id) => s.cells[id].owner === null);
    const enemy = s.order.filter((id) => s.cells[id].owner && s.cells[id].owner !== side);
    const r = Math.random();
    let action;
    if (s.ap[side] >= 2 && enemy.length && r < 0.15) {
      action = { kind: 'convert', unitId: enemy[Math.floor(Math.random() * enemy.length)] };
    } else if (s.ap[side] >= 1 && owned.length && r < 0.5) {
      const id = owned[Math.floor(Math.random() * owned.length)];
      const opt = s.units[id].options[Math.floor(Math.random() * 4)];
      action = { kind: 'correct', unitId: id, optionId: opt.id };
    } else if (s.ap[side] >= 1 && free.length) {
      action = { kind: 'claim', unitId: free[Math.floor(Math.random() * free.length)] };
    } else {
      action = { kind: 'endTurn' };
    }
    const res = apply(s, action);
    if (res.error) {
      ok(false, `非预期错误：${res.error}`);
      break;
    }
    s = res.state;
    ok(s.ap.A >= 0 && s.ap.B >= 0, 'AP 不应为负');
    for (const sd of ['A', 'B']) {
      const t = tally(s, sd);
      ok(incomeOf(s, sd) === Math.max(1, 1 + t.correct - t.wrong), `${sd} 收入公式不一致`);
    }
  }
  ok(s.ended, `${rounds} 轮对局应结束`);
  ok(s.winner === 'A' || s.winner === 'B' || s.winner === null, '胜者应为 A/B，或平局 null');
  ok(s.pulseIndex === Math.floor((rounds - 1) / 3), `${rounds} 轮应有 ${Math.floor((rounds - 1) / 3)} 次脉冲`);
  ok(s.bookId === book.id && s.chapterId === chapter.id, '对局上下文应为书/章节');
}

console.log(failures === 0 ? 'ALL OK' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
