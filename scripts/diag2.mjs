import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createMatch, apply, tally } from "../src/engine.ts";
import { decideNext, makeRng, presetById } from "../src/ai.ts";

const base = JSON.parse(readFileSync(fileURLToPath(new URL("../public/maps/bee.json", import.meta.url)), "utf8"));
const units = base.maps.flatMap((m) => m.units.map((u) => ({ ...u, id: `${m.id}-${u.id}` })));
const pack = { ...base, maps: [{ id: "merged", title: "m", order: 1, recommendedRounds: 9, units }] };

function play(seed, a, b) {
  const s = createMatch(pack, "merged", 9, seed);
  const ra = makeRng(seed ^ 0x11111111), rb = makeRng(seed ^ 0x5bd1e995);
  let g = 0;
  while (!s.ended && g++ < 8000) {
    const cfg = s.turn === "A" ? a : b, rng = s.turn === "A" ? ra : rb;
    if (apply(s, decideNext(s, cfg, rng)).error) apply(s, { kind: "endTurn" });
  }
  return s;
}

for (const [x, y] of [["normal", "beginner"], ["master", "beginner"]]) {
  let aC = 0, aW = 0, bC = 0, bW = 0, aI = 0, bI = 0, aOwn = 0, bOwn = 0, wins = 0;
  for (let i = 0; i < 300; i++) {
    const s = play(10000 + i, presetById(x), presetById(y));
    const ta = tally(s, "A"), tb = tally(s, "B");
    aC += ta.correct; aW += ta.wrong; bC += tb.correct; bW += tb.wrong;
    aI += s.finalIncome?.A ?? 0; bI += s.finalIncome?.B ?? 0;
    aOwn += ta.owned; bOwn += tb.owned;
    if (s.winner === "A") wins++;
  }
  const n = 300;
  console.log(`${x} vs ${y}: A胜 ${(wins/n*100).toFixed(1)}%`);
  console.log(`  A 占有${(aOwn/n).toFixed(1)} 正确${(aC/n).toFixed(1)} 错误${(aW/n).toFixed(1)} 收入${(aI/n).toFixed(1)}`);
  console.log(`  B 占有${(bOwn/n).toFixed(1)} 正确${(bC/n).toFixed(1)} 错误${(bW/n).toFixed(1)} 收入${(bI/n).toFixed(1)}`);
}
