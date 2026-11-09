// AI 对打模拟：粗调胜率
// 用法：
//   node --experimental-strip-types scripts/simulate.mjs [局数] [轮数]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createMatch, apply } from '../src/engine.ts';
import { AI_PRESETS, decideNext, makeRng, newAiMemory, presetById } from '../src/ai.ts';

const pack = JSON.parse(
  readFileSync(fileURLToPath(new URL('../public/maps/bee.json', import.meta.url)), 'utf8'),
);

const GAMES = Number(process.argv[2] ?? 1000);
const ROUNDS = Number(process.argv[3] ?? 9);
const MERGE = process.argv[4] === 'merge';

// 现有地图每战区只有 16 句元，经济会掉到保底 1，把差距冲淡。
// merge 模式把全部战区的句元合成一张大图，用来近似正式关卡的 30–45 句元规模。
let packForSim = pack;
if (MERGE) {
  const units = pack.maps.flatMap((m) =>
    m.units.map((u) => ({ ...u, id: `${m.id}-${u.id}` })),
  );
  packForSim = {
    ...pack,
    maps: [
      {
        id: 'merged',
        title: '合并测试图',
        order: 1,
        recommendedRounds: ROUNDS,
        units,
      },
    ],
  };
  console.log(`merge 模式：合并 ${pack.maps.length} 个战区，共 ${units.length} 句元\n`);
}

function playGame(mapId, seed, cfgA, cfgB) {
  const s = createMatch(packForSim, mapId, ROUNDS, seed);
  // 双方使用同一随机种子（公共随机数），避免某一方的 RNG 流系统性占便宜
  const rngA = makeRng(seed);
  const rngB = makeRng(seed);
  const memA = newAiMemory();
  const memB = newAiMemory();
  let guard = 0;
  while (!s.ended && guard++ < 8000) {
    const isA = s.turn === 'A';
    const cfg = isA ? cfgA : cfgB;
    const rng = isA ? rngA : rngB;
    const mem = isA ? memA : memB;
    const action = decideNext(s, cfg, rng, mem);
    const res = apply(s, action);
    if (res.error) {
      apply(s, { kind: 'endTurn' });
      continue;
    }
    if (action.kind === 'correct' && res.correctResult) mem.confirmed.add(action.unitId);
  }
  return s;
}

function runPairing(idA, idB) {
  const cfgA = presetById(idA);
  const cfgB = presetById(idB);
  let winA = 0;
  let winB = 0;
  let draw = 0;
  let marginSum = 0;
  let roundsSum = 0;

  for (let i = 0; i < GAMES; i++) {
    const seed = 10000 + i;
    const mapId = packForSim.maps[i % packForSim.maps.length].id;
    // 交替执先，抵消先手偏差
    const swapped = i % 2 === 1;
    const cfgOnA = swapped ? cfgB : cfgA;
    const cfgOnB = swapped ? cfgA : cfgB;
    const s = playGame(mapId, seed, cfgOnA, cfgOnB);

    const margin = (s.finalIncome?.A ?? 0) - (s.finalIncome?.B ?? 0);
    const marginForA = swapped ? -margin : margin;

    if (idA === idB) {
      // 镜像对局：只统计执 A 方胜率，应接近 50%
      if (s.winner === 'A') winA++;
      else winB++;
    } else {
      const winnerCfgId = s.winner === 'A' ? cfgOnA.id : cfgOnB.id;
      if (winnerCfgId === idA) winA++;
      else winB++;
    }
    marginSum += marginForA;
    roundsSum += Math.max(0, s.round - 1);
  }

  return {
    pairing: `${idA} vs ${idB}`,
    winA,
    winB,
    draw,
    rateA: ((winA / GAMES) * 100).toFixed(1),
    rateB: ((winB / GAMES) * 100).toFixed(1),
    avgMargin: (marginSum / GAMES).toFixed(2),
    avgRounds: (roundsSum / GAMES).toFixed(1),
    ci: ((1.96 * Math.sqrt(0.25 / GAMES)) * 100).toFixed(1),
  };
}

const PAIRS = [
  ['master', 'normal'],
  ['hard', 'normal'],
  ['normal', 'beginner'],
  ['master', 'hard'],
  ['beginner', 'beginner'],
];

const t0 = performance.now();
console.log(`局数/配对 ${GAMES}，轮数 ${ROUNDS}，地图 ${pack.maps.length} 个战区\n`);
console.log('配对'.padEnd(22), 'A胜%', 'B胜%', '平', '平均分差', '平均轮', '95%CI');
console.log('-'.repeat(78));

for (const [a, b] of PAIRS) {
  const r = runPairing(a, b);
  console.log(
    r.pairing.padEnd(22),
    r.rateA.padStart(6),
    r.rateB.padStart(6),
    String(r.draw).padStart(4),
    r.avgMargin.padStart(8),
    r.avgRounds.padStart(6),
    `±${r.ci}`.padStart(7),
  );
}

console.log(`\n总耗时 ${((performance.now() - t0) / 1000).toFixed(1)} 秒`);
