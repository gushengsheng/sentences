import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createMatch, apply, tally, incomeOf } from "../src/engine.ts";
import { decideNext, makeRng, presetById } from "../src/ai.ts";

const pack = JSON.parse(readFileSync(fileURLToPath(new URL("../public/maps/bee.json", import.meta.url)), "utf8"));

function play(mapId, seed, a, b, rounds = 9) {
  const s = createMatch(pack, mapId, rounds, seed);
  const rngA = makeRng(seed ^ 0x11111111);
  const rngB = makeRng(seed ^ 0x5bd1e995);
  let guard = 0;
  while (!s.ended && guard++ < 8000) {
    const cfg = s.turn === "A" ? a : b;
    const rng = s.turn === "A" ? rngA : rngB;
    const action = decideNext(s, cfg, rng);
    if (apply(s, action).error) apply(s, { kind: "endTurn" });
  }
  return s;
}

for (let i = 0; i < 8; i++) {
  const s = play(pack.maps[i % 2].id, 10000 + i, presetById("master"), presetById("beginner"));
  const tA = tally(s, "A"), tB = tally(s, "B");
  console.log(
    `g${i} A=${tA.correct}/${tA.wrong} inc${s.finalIncome?.A}`,
    ` B=${tB.correct}/${tB.wrong} inc${s.finalIncome?.B}`,
    ` win=${s.winner} pulses=${s.pulseIndex}`,
  );
}
