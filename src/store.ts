// 本地存储：设置、进度、对局存档
// 层级：书 → 章节 → 知识碎片（进度与存档都按这三层定位）

import type { MatchState } from './engine';

// ---------- 设置 ----------

export interface Settings {
  uiScale: number; // 0.85–1.4
  animation: boolean;
  sequentialUnlock: boolean;
  theme: 'dark' | 'light';
}

const SETTINGS_KEY = 'sentences.settings.v1';
const LEGACY_SETTINGS_KEY = 'juyuan.settings.v1';

const DEFAULT_SETTINGS: Settings = {
  uiScale: 1,
  animation: true,
  sequentialUnlock: true,
  theme: 'dark',
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY) ?? localStorage.getItem(LEGACY_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
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
const LEGACY_PROGRESS_KEY = 'juyuan.progress.v1';

interface LegacyRecord {
  packId?: string;
  mapId?: string;
  bestDifficulty?: Difficulty | null;
  bestMargin?: number;
  rating?: Rating | null;
  plays?: number;
  wins?: number;
  updatedAt?: number;
}

/** v1 进度（packId/mapId）→ v2（bookId/chapterId/fragmentId） */
function migrateLegacy(legacy: Record<string, LegacyRecord>): Progress {
  const out: Progress = {};
  for (const rec of Object.values(legacy)) {
    if (!rec?.packId || !rec?.mapId) continue;
    const bookId = rec.packId;
    const chapterId = rec.packId;
    out[recordKey(bookId, chapterId, rec.mapId)] = {
      bookId,
      chapterId,
      fragmentId: rec.mapId,
      bestDifficulty: rec.bestDifficulty ?? null,
      bestMargin: rec.bestMargin ?? 0,
      rating: rec.rating ?? null,
      plays: rec.plays ?? 0,
      wins: rec.wins ?? 0,
      updatedAt: rec.updatedAt ?? 0,
    };
  }
  return out;
}

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (raw) return JSON.parse(raw) as Progress;
    const legacyRaw = localStorage.getItem(LEGACY_PROGRESS_KEY);
    if (!legacyRaw) return {};
    return migrateLegacy(JSON.parse(legacyRaw) as Record<string, LegacyRecord>);
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
  schemaVersion: 2;
  bookId: string;
  chapterId: string;
  fragmentId: string;
  rounds: number;
  mode: 'ai' | 'hotseat';
  presetId: string;
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
    if (data.schemaVersion !== 2 || !data.state) return null;
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
