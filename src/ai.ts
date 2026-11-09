// 规则 AI：纯函数决策，不修改状态
// 参数：accuracy（判断准确率）、expand（扩张）、attack（攻击）、strategy（记忆与脉冲时机）

import { tally, type Action, type MatchState, type Option } from './engine.ts';

export interface AiConfig {
  accuracy: number; // 0–1：选对忠实项的概率
  expand: number; // 0–1：占领倾向
  attack: number; // 0–1：转化倾向
  strategy: number; // 0–1：记忆 + 脉冲时机的运用程度
  /** 实验用：转化动作的额外权重，默认 0。正式预设不使用。 */
  convertBonus?: number;
}

export interface AiPreset extends AiConfig {
  id: string;
  name: string;
}

export const AI_PRESETS: AiPreset[] = [
  { id: 'beginner', name: '初学者', accuracy: 0.3, expand: 0.35, attack: 0.15, strategy: 0.0 },
  { id: 'normal', name: '普通', accuracy: 0.65, expand: 0.55, attack: 0.45, strategy: 0.3 },
  { id: 'hard', name: '困难', accuracy: 0.8, expand: 0.7, attack: 0.65, strategy: 0.7 },
  { id: 'master', name: 'Master', accuracy: 0.92, expand: 0.85, attack: 0.8, strategy: 1.0 },
];

export function presetById(id: string): AiPreset {
  return AI_PRESETS.find((p) => p.id === id) ?? AI_PRESETS[1];
}

// ---------- AI 记忆 ----------

export interface AiMemory {
  /** 已确认正确的句子。脉冲之后清空，因为可能被重新腐化。 */
  confirmed: Set<string>;
  /** 已经历的脉冲纪元，用来判断是否需要清空记忆 */
  pulseEpoch: number;
}

export function newAiMemory(): AiMemory {
  return { confirmed: new Set(), pulseEpoch: 0 };
}

// ---------- 随机数 ----------

export type Rng = () => number;

export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: T[], rng: Rng): T {
  return arr[Math.floor(rng() * arr.length)];
}

/** 以 accuracy 概率选中忠实项，否则随机选一个（模型化“读懂 / 没读懂”） */
function pickOption(unit: { options: Option[] }, accuracy: number, rng: Rng): Option {
  if (rng() < accuracy) return unit.options.find((o) => o.isCorrect) ?? unit.options[0];
  return pick(unit.options, rng);
}

/** 距离下次腐化脉冲还有几轮（脉冲发生在第 3、6、9…轮末） */
function roundsToNextPulse(state: MatchState): number {
  const next = Math.ceil(state.round / 3) * 3;
  return Math.max(0, next - state.round);
}

/**
 * 决定下一步动作。只读 state，不改。
 * memory 可选：提供后 AI 会记住确认过的句子，并在脉冲后自动清空。
 */
export function decideNext(
  state: MatchState,
  cfg: AiConfig,
  rng: Rng,
  memory?: AiMemory,
): Action {
  const side = state.turn;
  const ap = state.ap[side];

  const owned = state.order.filter((id) => state.cells[id].owner === side);
  const free = state.order.filter((id) => state.cells[id].owner === null);
  const enemy = state.order.filter((id) => {
    const o = state.cells[id].owner;
    return o !== null && o !== side;
  });

  if (ap < 1) return { kind: 'endTurn' };

  // 脉冲之后清空“已确认”记忆：被洗过的句子不再可信
  if (memory && cfg.strategy >= 0.5) {
    const epoch = Math.floor((state.round - 1) / 3);
    if (epoch > memory.pulseEpoch) {
      memory.confirmed.clear();
      memory.pulseEpoch = epoch;
    }
  }

  const { wrong } = tally(state, side);
  // 自己领地中“错误句子”的占比。不知道是哪句，只能按这个比例估。
  const w = owned.length > 0 ? wrong / owned.length : 0;

  interface Cand {
    action: Action;
    score: number;
  }
  const cands: Cand[] = [];

  // 1) 修正：c + w > 1 才值得动手；脉冲越近越不值得
  if (ap >= 1 && owned.length > 0 && wrong > 0 && cfg.accuracy + w > 1) {
    let pool = owned;
    if (memory && cfg.strategy >= 0.5) {
      const filtered = owned.filter((id) => !memory.confirmed.has(id));
      if (filtered.length > 0) pool = filtered;
    }
    let chosen: { id: string; opt: Option } | null = null;
    for (let tries = 0; tries < 3; tries++) {
      const id = pick(pool, rng);
      const unit = state.units[id];
      const readIt = rng() < cfg.accuracy;
      // 高策略：读得出来且本来就是对的，换一个再试，别浪费 AP
      if (cfg.strategy >= 0.5 && readIt && unit.correct) continue;
      const opt =
        cfg.strategy >= 0.5 && readIt
          ? unit.options.find((o) => o.isCorrect) ?? unit.options[0]
          : pickOption(unit, cfg.accuracy, rng);
      chosen = { id, opt };
      break;
    }

    // 一次修正的收益要乘以“还能保持几轮”。脉冲就在本轮结束时，先不动。
    const r = roundsToNextPulse(state);
    const pulseFactor = 0.5 + 0.5 * Math.min(1, r / 2);
    const timing = 1 - cfg.strategy * (1 - pulseFactor);

    if (chosen) {
      cands.push({
        action: { kind: 'correct', unitId: chosen.id, optionId: chosen.opt.id },
        score: cfg.accuracy * 0.9 * timing,
      });
    }
  }

  // 2) 转化：读得懂时只拆“正确的”句子，读不懂才盲目拆
  if (ap >= 2 && enemy.length > 0) {
    const id = pick(enemy, rng);
    const unit = state.units[id];
    const read = rng() < cfg.accuracy;
    // 高策略：没读出来就不拆，避免帮对方消掉罚金
    const worthConverting =
      cfg.strategy >= 0.5 ? read && unit.correct : !read || unit.correct;
    if (worthConverting) {
      cands.push({
        action: { kind: 'convert', unitId: id },
        score:
          cfg.attack * cfg.accuracy * 0.5 * (1 - cfg.strategy * 0.2) * (1 + (cfg.convertBonus ?? 0)),
      });
    }
  }

  // 3) 占领：早期优先扩张，领地是收入的引擎
  if (ap >= 1 && free.length > 0) {
    const targetOwned = Math.max(6, Math.ceil(state.order.length * 0.4));
    const urgency = owned.length < targetOwned ? 2.5 : 1;
    const id = pick(free, rng);
    cands.push({
      action: { kind: 'claim', unitId: id },
      score: cfg.expand * 0.5 * urgency,
    });
  }

  if (cands.length === 0) return { kind: 'endTurn' };
  cands.sort((a, b) => b.score - a.score);
  return cands[0].action;
}
