// 引擎吞吐基准：随机合法动作跑 N 局，报告 ms/局
// 用法：node --experimental-strip-types scripts/bench.mjs [N]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createMatch, apply } from '../src/engine.ts';

const pack = JSON.parse(
  readFileSync(fileURLToPath(new URL('../public/maps/bee.json', import.meta.url)), 'utf8'),
);

const N = Number(process.argv[2] ?? 200);
let totalActions = 0;
let totalGames = 0;
const t0 = performance.now();

for (let g = 0; g < N; g++) {
  const map = pack.maps[g % pack.maps.length];
  let s = createMatch(pack, map.id, 9, g + 1);
  let guard = 0;
  while (!s.ended && guard++ < 5000) {
    const side = s.turn;
    const owned = s.order.filter((id) => s.cells[id].owner === side);
    const free = s.order.filter((id) => s.cells[id].owner === null);
    const enemy = s.order.filter(
      (id) => s.cells[id].owner !== null && s.cells[id].owner !== side,
    );
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
    if (res.error) break;
    s = res.state;
    totalActions++;
  }
  totalGames++;
}

const dt = performance.now() - t0;
console.log(`局数 ${totalGames}，动作 ${totalActions}，总耗时 ${dt.toFixed(0)} ms`);
console.log(`每局 ${(dt / totalGames).toFixed(2)} ms，每动作 ${(dt / totalActions * 1000).toFixed(1)} µs`);
console.log(`1000 局预计 ${((dt / totalGames) * 1000 / 1000).toFixed(1)} 秒`);
