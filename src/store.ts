// 本地存储：设置、进度、对局存档
// 层级：书 → 章节 → 知识碎片（进度与存档都按这三层定位）

import type { MatchState } from './engine';

// ---------- 设置 ----------

export interface Settings {
  uiScale: number; // 0.85–1.4
  animation: boolean;
  theme: 'dark' | 'light' | 'mono';
  /** 隐藏上边框 */
  hideTopbar: boolean;
  /** 隐藏下边框（含翻页器） */
  hideBottombar: boolean;
  /** 翻页方式：按钮 / 手势 */
  pagerMode: 'buttons' | 'edge';
  /** 快速结束回合时，若还有 AP 先确认 */
  confirmApEnd: boolean;
  /** 快捷操作：双击进攻/保护，长按修正 */
  quickActions: boolean;
  /** 棋盘闪光：修正 / 被进攻时高亮那一句 */
  flashBoard: boolean;
  /** 回合横幅：只在第 1 回合和灾变后出现 */
  turnBanner: boolean;
  /** 手机震动反馈 */
  /** 占领时闪一下 */
  claimFlash: boolean;

}

const SETTINGS_KEY = 'sentences.settings.v1';

const DEFAULT_SETTINGS: Settings = {
  uiScale: 1,
  animation: true,
  theme: 'dark',
  hideTopbar: false,
  hideBottombar: false,
  pagerMode: 'buttons',
  confirmApEnd: true,
  quickActions: false,
  flashBoard: true,
  turnBanner: true,
  claimFlash: true,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const merged = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } as Settings;
    if (merged.pagerMode !== 'buttons' && merged.pagerMode !== 'edge') {
      merged.pagerMode = 'buttons';
    }
    return merged;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* 忽略配额错误 */
  }
}

// ---------- 进度 ----------

export type Difficulty = 'beginner' | 'normal' | 'hard' | 'master';
export type Rating = '完美' | '优秀' | '良好' | '及格';

const DIFF_ORDER: Difficulty[] = ['beginner', 'normal', 'hard', 'master'];

export interface ClearRecord {
  bookId: string;
  chapterId: string;
  fragmentId: string;
  bestDifficulty: Difficulty | null;
  bestMargin: number;
  rating: Rating | null;
  plays: number;
  wins: number;
  updatedAt: number;
}

export type Progress = Record<string, ClearRecord>;

const PROGRESS_KEY = 'sentences.progress.v1';
export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    return raw ? (JSON.parse(raw) as Progress) : {};
  } catch {
    return {};
  }
}

export function saveProgress(p: Progress) {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch {
    /* 忽略 */
  }
}

export function recordKey(bookId: string, chapterId: string, fragmentId: string) {
  return `${bookId}::${chapterId}::${fragmentId}`;
}

const RATING_RANK: Record<Rating, number> = { 及格: 1, 良好: 2, 优秀: 3, 完美: 4 };

/** 进度里的评级是否达到某个门槛 */
export function ratingAtLeast(r: Rating | null | undefined, min: Rating): boolean {
  return !!r && RATING_RANK[r] >= RATING_RANK[min];
}

export function ratingFor(d: Difficulty): Rating {
  if (d === 'master') return '完美';
  if (d === 'hard') return '优秀';
  if (d === 'normal') return '良好';
  return '及格';
}

export function recordResult(
  prev: Progress,
  bookId: string,
  chapterId: string,
  fragmentId: string,
  difficulty: Difficulty,
  won: boolean,
  margin: number,
): Progress {
  const key = recordKey(bookId, chapterId, fragmentId);
  const old: ClearRecord = prev[key] ?? {
    bookId,
    chapterId,
    fragmentId,
    bestDifficulty: null,
    bestMargin: 0,
    rating: null,
    plays: 0,
    wins: 0,
    updatedAt: 0,
  };

  const better =
    won &&
    (old.bestDifficulty === null ||
      DIFF_ORDER.indexOf(difficulty) > DIFF_ORDER.indexOf(old.bestDifficulty));

  const next: ClearRecord = {
    ...old,
    plays: old.plays + 1,
    wins: old.wins + (won ? 1 : 0),
    bestDifficulty: better ? difficulty : old.bestDifficulty,
    bestMargin: won ? Math.max(old.bestMargin, margin) : old.bestMargin,
    rating: better ? ratingFor(difficulty) : old.rating,
    updatedAt: Date.now(),
  };

  return { ...prev, [key]: next };
}

// ---------- 对局存档 ----------

export interface SaveFile {
  schemaVersion: 3;
  bookId: string;
  chapterId: string;
  fragmentId: string;
  rounds: number;
  mode: 'ai' | 'hotseat' | 'spectate';
  presetId: string;
  presetB?: string;
  /** 仅看海模式使用 */
  aiSpeed?: number;
  difficulty?: Difficulty;
  state: MatchState;
  savedAt: number;
}

const SAVE_KEY = 'sentences.save.v2';

export function loadSave(): SaveFile | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveFile;
    if (data.schemaVersion !== 3 || !data.state) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeSave(f: SaveFile) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(f));
  } catch {
    /* 忽略 */
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* 忽略 */
  }
}
