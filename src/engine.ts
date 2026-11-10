// sentences · 规则引擎 v2
// 纯函数风格，不依赖 DOM。apply 原地修改 state（见 apply 前的注释）。

export type Side = 'A' | 'B';

// ---------- 内容模型 ----------

export interface Option {
  id: string;
  text: string;
  isCorrect: boolean;
}

/** 句子定义：棋盘上的最小判定单位 */
export interface UnitDef {
  id: string;
  paragraph: number;
  /** 原文：正确时棋盘显示它，也是 4 选项里的忠实项 */
  original: string;
  /** 3 段篡改；错误时随机显示其中一段 */
  wrongOptions: [string, string, string];
}

/** 渲染分页 */
export interface PageDef {
  id: string;
  title?: string;
  unitIds: string[];
}

/** 知识碎片 = 一局。字段与 v1 的 MapDef 完全一致。 */
export interface FragmentDef {
  id: string;
  title: string;
  order: number;
  recommendedRounds: number;
  units: UnitDef[];
  pages?: PageDef[];
}

/** v1 的旧名字，保留做别名 */
export type MapDef = FragmentDef;

/** 书的目录项：指向一个章节文件 */
export interface ChapterRef {
  id: string;
  title: string;
  order: number;
  /** 相对书目录的文件名，例如 01-anticholinergic.json */
  file: string;
}

/** 章节：一组知识碎片 */
export interface Chapter {
  id: string;
  title?: string;
  /** 开局错误比例，缺省 0.25；只有章节作者指定 */
  density?: number;
  fragments: FragmentDef[];
}

/** 书：v2 的顶层 */
export interface Book {
  id: string;
  title: string;
  author?: string;
  /** 内容格式版本；v1 旧内容记为 1，不假装合规 */
  contentVersion?: number;
  /** 内容说明，例如“旧版整句改写，未按词级规则重生成” */
  contentNote?: string;
  chapters: ChapterRef[];
}

// ---------- 运行态 ----------

export interface UnitState extends UnitDef {
  correct: boolean;
  text: string;
  options: Option[];
}

export interface Cell {
  owner: Side | null;
  revealed: boolean;
}

export interface MatchState {
  bookId: string;
  bookTitle: string;
  chapterId: string;
  chapterTitle: string;
  fragmentId: string;
  fragmentTitle: string;
  pages: PageDef[];
  order: string[];
  units: Record<string, UnitState>;
  cells: Record<string, Cell>;
  round: number;
  /** 0 = 不限 */
  rounds: number;
  turn: Side;
  first: Side;
  ap: Record<Side, number>;
  /** 回合结束时按当时状态算好的下一回合 AP，在回合开始时发放 */
  pendingAp: Record<Side, number>;
  /** 本回合实际发放的 AP（信息栏用） */
  lastGrant: Record<Side, number>;
  /** 信息栏快照：只在回合结束时更新，显示上一回合的状态 */
  ledger: Record<Side, { correct: number; wrong: number }>;
  /** 最近一次动作事件，供棋盘反馈 */
  eventSeq: number;
  lastEvent: { kind: 'convert'; unitId: string; side: Side } | null;
  ended: boolean;
  winner: Side | null;
  finalIncome: Record<Side, number> | null;
  pulseIndex: number;
  seed: number;
}

/** 对局上下文：书与章节的显示信息，缺省时退回章节自身的 id/title */
export interface MatchMeta {
  bookId: string;
  bookTitle: string;
  chapterId: string;
  chapterTitle: string;
}

// ---------- 随机数 ----------

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------- 收入 ----------

export function tally(state: MatchState, side: Side) {
  let correct = 0;
  let wrong = 0;
  for (const id of state.order) {
    if (state.cells[id].owner !== side) continue;
    if (state.units[id].correct) correct++;
    else wrong++;
  }
  return { correct, wrong, owned: correct + wrong };
}

/** 规则 §2.5：max(1, 1 + 正确数 − 错误数) */
export function incomeOf(state: MatchState, side: Side): number {
  const { correct, wrong } = tally(state, side);
  return Math.max(1, 1 + correct - wrong);
}

// ---------- 建立对局 ----------

export function createMatch(
  chapter: Chapter,
  fragmentId: string,
  rounds: number,
  seed: number,
  meta?: Partial<MatchMeta>,
): MatchState {
  const fragment = chapter.fragments.find((f) => f.id === fragmentId) ?? chapter.fragments[0];
  if (!fragment) throw new Error(`知识碎片不存在：${fragmentId}`);

  const rng = mulberry32(seed);
  const first: Side = rng() < 0.5 ? 'A' : 'B';

  const units: Record<string, UnitState> = {};
  const cells: Record<string, Cell> = {};
  const order: string[] = [];

  // 开局随机挑 density 比例的句子变错
  const density = chapter.density ?? 0.25;
  const corruptCount = Math.max(0, Math.min(fragment.units.length, Math.round(fragment.units.length * density)));
  const corruptIds = new Set(
    shuffle([...fragment.units.map((u) => u.id)], rng).slice(0, corruptCount),
  );

  for (const def of fragment.units) {
    const options: Option[] = shuffle(
      [
        { id: `${def.id}-c`, text: def.original, isCorrect: true },
        { id: `${def.id}-w1`, text: def.wrongOptions[0], isCorrect: false },
        { id: `${def.id}-w2`, text: def.wrongOptions[1], isCorrect: false },
        { id: `${def.id}-w3`, text: def.wrongOptions[2], isCorrect: false },
      ],
      rng,
    );
    const corrupted = corruptIds.has(def.id);
    const shown = def.wrongOptions[Math.floor(rng() * def.wrongOptions.length)] ?? def.wrongOptions[0];
    units[def.id] = {
      id: def.id,
      paragraph: def.paragraph,
      original: def.original,
      wrongOptions: def.wrongOptions,
      correct: !corrupted,
      text: corrupted ? shown : def.original,
      options,
    };
    cells[def.id] = { owner: null, revealed: false };
    order.push(def.id);
  }

  const pages: PageDef[] =
    fragment.pages && fragment.pages.length > 0
      ? fragment.pages
      : [{ id: `${fragment.id}-p1`, title: fragment.title, unitIds: [...order] }];

  const chapterId = meta?.chapterId ?? chapter.id;
  const chapterTitle = meta?.chapterTitle ?? chapter.title ?? chapter.id;

  const state: MatchState = {
    bookId: meta?.bookId ?? chapterId,
    bookTitle: meta?.bookTitle ?? chapterTitle,
    chapterId,
    chapterTitle,
    fragmentId: fragment.id,
    fragmentTitle: fragment.title,
    pages,
    order,
    units,
    cells,
    round: 1,
    rounds,
    turn: first,
    first,
    ap: { A: 0, B: 0 },
    pendingAp: { A: 1, B: 1 },
    lastGrant: { A: 0, B: 0 },
    ledger: { A: { correct: 0, wrong: 0 }, B: { correct: 0, wrong: 0 } },
    eventSeq: 0,
    lastEvent: null,
    ended: false,
    winner: null,
    finalIncome: null,
    pulseIndex: 0,
    seed,
  };
  const startIncome = incomeOf(state, first);
  state.pendingAp = { A: startIncome, B: startIncome };
  state.ap[first] += startIncome;
  state.lastGrant[first] = startIncome;
  return state;
}

// ---------- 动作 ----------

export type Action =
  | { kind: 'claim'; unitId: string }
  | { kind: 'correct'; unitId: string; optionId: string }
  | { kind: 'convert'; unitId: string }
  | { kind: 'abandon'; unitId: string }
  | { kind: 'endTurn' };

export interface ApplyResult {
  state: MatchState;
  error?: string;
  correctResult?: boolean;
}

// 注意：apply 会**原地修改** state，并返回同一个对象。
// 所有前置校验都在修改之前完成，失败时 state 不会被改动。
// React 侧需要 setMatch({ ...match }) 触发重渲染；回放时从新状态重放即可。

function finish(s: MatchState) {
  s.ended = true;
  const a = incomeOf(s, 'A');
  const b = incomeOf(s, 'B');
  s.finalIncome = { A: a, B: b };
  s.winner = a > b ? 'A' : b > a ? 'B' : s.first;
}

function boardFull(s: MatchState): boolean {
  return s.order.every((id) => s.cells[id].owner !== null);
}

export function apply(state: MatchState, action: Action): ApplyResult {
  if (state.ended) return { state, error: '对局已结束' };
  const s = state;

  switch (action.kind) {
    case 'claim': {
      const cell = s.cells[action.unitId];
      if (!cell) return { state, error: '句子不存在' };
      if (cell.owner !== null) return { state, error: '该句子已有归属' };
      if (s.ap[s.turn] < 1) return { state, error: 'AP 不足' };
      s.ap[s.turn] -= 1;
      cell.owner = s.turn;
      cell.revealed = true;
      if (boardFull(s) && s.rounds === 0) finish(s);
      return { state: s };
    }

    case 'correct': {
      const cell = s.cells[action.unitId];
      const unit = s.units[action.unitId];
      if (!cell || !unit) return { state, error: '句子不存在' };
      if (cell.owner !== s.turn) return { state, error: '只能修正己方句子' };
      if (s.ap[s.turn] < 1) return { state, error: 'AP 不足' };
      const opt = unit.options.find((o) => o.id === action.optionId);
      if (!opt) return { state, error: '选项不存在' };

      s.ap[s.turn] -= 1;
      if (opt.isCorrect) {
        unit.correct = true;
        unit.text = unit.original;
        return { state: s, correctResult: true };
      }
      unit.correct = false;
      unit.text = opt.text;
      return { state: s, correctResult: false };
    }

    case 'convert': {
      const cell = s.cells[action.unitId];
      if (!cell) return { state, error: '句子不存在' };
      if (cell.owner === null) return { state, error: '该句子无主' };
      if (cell.owner === s.turn) return { state, error: '不能进攻己方句子' };
      if (s.ap[s.turn] < 2) return { state, error: 'AP 不足' };
      s.ap[s.turn] -= 2;
      cell.owner = null;
      s.eventSeq += 1;
      s.lastEvent = { kind: 'convert', unitId: action.unitId, side: s.turn };
      return { state: s };
    }

    case 'abandon': {
      const cell = s.cells[action.unitId];
      if (!cell) return { state, error: '句子不存在' };
      if (cell.owner !== s.turn) return { state, error: '只能放弃己方句子' };
      cell.owner = null;
      return { state: s };
    }

    case 'endTurn': {
      if (s.turn === 'A') {
        s.ap.A = 0; // 不结转
        // 账本与下一回合 AP 都在自己回合结束时定格
        const ta = tally(s, 'A');
        s.ledger.A = { correct: ta.correct, wrong: ta.wrong };
        s.pendingAp.A = incomeOf(s, 'A');
        s.turn = 'B';
        s.ap.B += s.pendingAp.B;
        s.lastGrant.B = s.pendingAp.B;
        return { state: s };
      }

      s.ap.B = 0;
      const tb = tally(s, 'B');
      s.ledger.B = { correct: tb.correct, wrong: tb.wrong };
      s.pendingAp.B = incomeOf(s, 'B');
      const completed = s.round;

      // 终局在灾难之前结算：最后一轮结束后的那一次灾难不会发生
      if (s.rounds > 0 && completed >= s.rounds) {
        finish(s);
        return { state: s };
      }

      s.round += 1;
      s.turn = 'A';
      s.ap.A += s.pendingAp.A;
      s.lastGrant.A = s.pendingAp.A;

      if (completed % 3 === 0) {
        const rng = mulberry32((s.seed ^ (s.pulseIndex * 2654435761)) >>> 0);
        s.pulseIndex += 1;
        for (const side of ['A', 'B'] as Side[]) {
          for (const id of s.order) {
            const cell = s.cells[id];
            if (cell.owner !== side) continue;
            const unit = s.units[id];
            if (!unit.correct) continue;
            if (rng() < 0.25) {
              unit.correct = false;
              unit.text = unit.wrongOptions[Math.floor(rng() * unit.wrongOptions.length)];
            }
          }
        }
      }

      return { state: s };
    }
  }
}
// ---------- 辅助 ----------

export function nextPulseRound(state: MatchState): number | null {
  const r = Math.ceil(state.round / 3) * 3;
  if (state.rounds === 0) return r;
  return r <= state.rounds ? r : null;
}
