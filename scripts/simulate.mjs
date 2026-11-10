// AI 对打模拟（v2 结构）
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createMatch, apply } from "../src/engine.ts";
import { decideNext, makeRng, newAiMemory, presetById } from "../src/ai.ts";

const bookPath = fileURLToPath(new URL("../public/maps/pharmacology-ai/book.json", import.meta.url));
const book = JSON.parse(readFileSync(bookPath, "utf8"));
const chapter = JSON.parse(readFileSync(join(bookPath, "..", book.chapters[0].file), "utf8"));
const meta = { bookId: book.id, bookTitle: book.title, chapterId: chapter.id, chapterTitle: chapter.title || "" };
const fragIds = chapter.fragments.map((f) => f.id);

const GAMES = Number(process.argv[2] ?? 1000);
const ROUNDS = Number(process.argv[3] ?? 12);

function playGame(seed, cfgA, cfgB) {
  const fragId = fragIds[seed % fragIds.length];
  const s = createMatch(chapter, fragId, ROUNDS, seed, meta);
  const rngA = makeRng(seed);
  const rngB = makeRng(seed);
  const memA = newAiMemory();
  const memB = newAiMemory();
  let guard = 0;
  while (!s.ended && guard++ < 8000) {
    const isA = s.turn === "A";
    const cfg = isA ? cfgA : cfgB;
    const rng = isA ? rngA : rngB;
    const mem = isA ? memA : memB;
    const action = decideNext(s, cfg, rng, mem);
    const res = apply(s, action);
    if (res.error) { apply(s, { kind: "endTurn" }); continue; }
    if (action.kind === "correct" && res.correctResult) mem.confirmed.add(action.unitId);
  }
  return s;
}

function runPairing(idA, idB) {
  const cfgA = presetById(idA);
  const cfgB = presetById(idB);
  let winA = 0, winB = 0, draw = 0, marginSum = 0, roundsSum = 0;
  for (let i = 0; i < GAMES; i++) {
    const seed = 10000 + i;
    const swapped = i % 2 === 1;
    const cfgOnA = swapped ? cfgB : cfgA;
    const cfgOnB = swapped ? cfgA : cfgB;
    const s = playGame(seed, cfgOnA, cfgOnB);
    const margin = (s.finalScore?.A ?? 0) - (s.finalScore?.B ?? 0);
    marginSum += swapped ? -margin : margin;
    roundsSum += Math.max(0, s.round - 1);
    if (s.winner === null) draw++;
    else if (idA === idB) { if (s.winner === "A") winA++; else winB++; }
    else {
      const winnerCfgId = s.winner === "A" ? cfgOnA.id : cfgOnB.id;
      if (winnerCfgId === idA) winA++; else winB++;
    }
  }
  return { pairing: idA + " vs " + idB, rateA: ((winA / GAMES) * 100).toFixed(1), rateB: ((winB / GAMES) * 100).toFixed(1), rateDraw: ((draw / GAMES) * 100).toFixed(1), avgMargin: (marginSum / GAMES).toFixed(2), avgRounds: (roundsSum / GAMES).toFixed(1) };
}

const PAIRS = [["master","normal"],["hard","normal"],["normal","beginner"],["master","hard"],["beginner","beginner"]];
console.log("局数/配对 " + GAMES + "，轮数 " + ROUNDS + "\n");
console.log("配对".padEnd(22), "A胜%", "B胜%", "平局%", "平均分差", "平均轮");
console.log("-".repeat(70));
for (const [a, b] of PAIRS) {
  const r = runPairing(a, b);
  console.log(r.pairing.padEnd(22), r.rateA.padStart(6), r.rateB.padStart(6), r.rateDraw.padStart(6), r.avgMargin.padStart(8), r.avgRounds.padStart(6));
}
