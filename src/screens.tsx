import { useEffect, useState } from 'react';
import { AI_PRESETS, presetById, type AiConfig } from './ai';
import type { Book, Chapter, FragmentDef } from './engine';
import type { BookBundle, BookSummary } from './mapsource';
import { ratingAtLeast, type Difficulty, type Progress, type Settings } from './store';

export type Mode = 'ai' | 'hotseat' | 'spectate';

// ---------- 主菜单 ----------

interface MenuProps {
  hasSave: boolean;
  totals: { cleared: number; total: number };
  onContinue: () => void;
  onBooks: () => void;
  onReading: () => void;
  onSettings: () => void;
}

export function MenuScreen({ hasSave, totals, onContinue, onBooks, onReading, onSettings }: MenuProps) {
  return (
    <div className="screen center">
      <div className="hero">
        <h1>sentences</h1>
        <p className="hero-sub">让智慧永恒</p>
      </div>

      <div className="menu">
        {hasSave && (
          <button className="menu-btn primary" onClick={onContinue}>
            继续上次对局
          </button>
        )}
        <button className="menu-btn" onClick={onBooks}>
          选择书
        </button>
        <button className="menu-btn" onClick={onReading}>
          文章回顾
        </button>
        <button className="menu-btn" onClick={onSettings}>
          设置
        </button>
      </div>

      <p className="muted menu-foot">
        已通关 {totals.cleared} / {totals.total} 个知识碎片
      </p>
    </div>
  );
}

// ---------- 书 ----------

interface BookListProps {
  books: BookSummary[];
  progress: Progress;
  onOpen: (bookId: string) => void;
  onBack: () => void;
}

function clearedInBook(progress: Progress, bookId: string) {
  return Object.values(progress).filter((r) => r.bookId === bookId && r.rating !== null).length;
}

export function BooksScreen({ books, progress, onOpen, onBack }: BookListProps) {
  return (
    <div className="screen">
      <header className="screen-head">
        <button className="back" onClick={onBack}>
          ← 返回
        </button>
        <h2>书</h2>
      </header>

      <div className="cards">
        {books.map((b) => {
          const done = clearedInBook(progress, b.id);
          return (
            <button key={b.id} className="card" onClick={() => onOpen(b.id)}>
              <div className="card-title">{b.title}</div>
              <div className="card-meta">
                {b.author ? `${b.author} · ` : ''}
                {b.chapters} 章 · {b.fragments} 个知识碎片 · 已通关 {done}
              </div>
              <div className="bar">
                <div
                  className="bar-fill"
                  style={{ width: `${b.fragments ? (done / b.fragments) * 100 : 0}%` }}
                />
              </div>
            </button>
          );
        })}
        {books.length === 0 && <p className="muted">还没有书。</p>}
      </div>
    </div>
  );
}

// ---------- 章节 ----------

interface ChapterListProps {
  bundle: BookBundle;
  progress: Progress;
  onOpen: (chapterId: string) => void;
  onBack: () => void;
}

export function ChaptersScreen({ bundle, progress, onOpen, onBack }: ChapterListProps) {
  const { book, chapters } = bundle;
  const refs = [...book.chapters].sort((a, b) => a.order - b.order);

  return (
    <div className="screen">
      <header className="screen-head">
        <button className="back" onClick={onBack}>
          ← 返回
        </button>
        <h2>{book.title}</h2>
      </header>

      <div className="cards">
        {refs.map((ref) => {
          const meta = bundle.summary.chapterMeta?.find((x) => x.id === ref.id);
          const fragments = meta?.fragments ?? chapters[ref.id]?.fragments.length ?? 0;
          const done = Object.keys(progress).filter(
            (k) => k.startsWith(`${book.id}::${ref.id}::`) && progress[k]?.rating,
          ).length;
              return (
            <button
              key={ref.id}
              className="card"
              onClick={() => onOpen(ref.id)}
            >
              <div className="card-row">
                <span className="card-title">
                  {String(ref.order).padStart(2, '0')} · {ref.title}
                </span>
                <span className="badge dim">{done} / {fragments}</span>
              </div>
              <div className="card-meta">{fragments} 个知识碎片</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- 知识碎片 ----------

interface FragmentListProps {
  bundle: BookBundle;
  chapter: Chapter;
  progress: Progress;
  onPlay: (fragmentId: string) => void;
  onBack: () => void;
}

export function FragmentsScreen({
  bundle,
  chapter,
  progress,
  onPlay,
  onBack,
}: FragmentListProps) {
  const { book } = bundle;
  const ordered = [...chapter.fragments].sort((a, b) => a.order - b.order);
  const chapterTitle = chapter.title ?? chapter.id;

  return (
    <div className="screen">
      <header className="screen-head">
        <button className="back" onClick={onBack}>
          ← 返回
        </button>
        <h2>
          <span className="muted">{book.title} / </span>
          {chapterTitle}
        </h2>
      </header>

      <div className="cards">
        {ordered.map((f, i) => {
          const rec = progress[`${book.id}::${chapter.id}::${f.id}`];
          // 顺序解锁：前一个碎片没通关就锁着，必须从第一个开始
          const prev = ordered[i - 1];
          const prevCleared =
            !prev || ratingAtLeast(progress[`${book.id}::${chapter.id}::${prev.id}`]?.rating, '良好');
          const locked = i > 0 && !prevCleared;

          return (
            <button
              key={f.id}
              className={`card ${locked ? 'locked' : ''}`}
              disabled={locked}
              onClick={() => onPlay(f.id)}
              title={locked ? '上一关需达到「良好」以上' : undefined}
            >
              <div className="card-row">
                <span className="card-title">
                  {String(i + 1).padStart(2, '0')} · {f.title}
                </span>
                {rec?.rating && <span className="badge">{rec.rating}</span>}
                {locked && <span className="badge dim">未解锁</span>}
              </div>
              <div className="card-meta">
                {f.units.length} 句 · {f.pages?.length ?? 1} 页 · 推荐 {f.recommendedRounds} 轮
                {rec?.plays ? ` · 已打 ${rec.plays} 局` : ''}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- 对局设置 ----------

export interface SetupResult {
  mode: Mode;
  presetId: string;
  presetB: string;
  aiSpeed: number;
  custom: AiConfig;
  rounds: number;
  difficulty: Difficulty;
}

interface SetupProps {
  book: Book;
  chapter: Chapter;
  fragment: FragmentDef;
  onBack: () => void;
  onStart: (cfg: SetupResult) => void;
}

export function SetupScreen({ book, chapter, fragment, onBack, onStart }: SetupProps) {
  const [mode, setMode] = useState<Mode>('ai');
  const [presetId, setPresetId] = useState('normal');
  const [presetB, setPresetB] = useState('normal');
  const [aiSpeed, setAiSpeed] = useState(550);
  const [custom, setCustom] = useState<AiConfig>(() => ({ ...presetById('normal') }));
  const [rounds, setRounds] = useState(fragment.recommendedRounds || 12);

  const difficulty: Difficulty =
    presetId === 'custom' ? 'normal' : (presetId as Difficulty);

  return (
    <div className="screen">
      <header className="screen-head">
        <button className="back" onClick={onBack}>
          ← 返回
        </button>
        <h2>对局设置</h2>
      </header>

      <div className="setup">
        <div className="setup-map">
          <div className="card-title">{fragment.title}</div>
          <div className="card-meta">
            {book.title} / {chapter.title ?? chapter.id} · {fragment.units.length} 句 ·{' '}
            {fragment.pages?.length ?? 1} 页
          </div>
        </div>

        <label className="field">
          <span>模式</span>
          <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            <option value="ai">人机</option>
            <option value="hotseat">双人（同屏）</option>
            <option value="spectate">看海（AI 对打）</option>
          </select>
        </label>

        {mode === 'ai' && (
          <label className="field">
            <span>难度</span>
            <select
              value={presetId}
              onChange={(e) => {
                const id = e.target.value;
                setPresetId(id);
                if (id !== 'custom') setCustom({ ...presetById(id) });
              }}
            >
              {AI_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              <option value="custom">自定义</option>
            </select>
          </label>
        )}

        {mode === 'spectate' && (
          <>
            <label className="field">
              <span>甲方 AI</span>
              <select value={presetId} onChange={(e) => setPresetId(e.target.value)}>
                {AI_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>乙方 AI</span>
              <select value={presetB} onChange={(e) => setPresetB(e.target.value)}>
                {AI_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        {mode === 'ai' && presetId === 'custom' && (
          <div className="sliders">
            <label>
              准确度 <b>{custom.accuracy.toFixed(2)}</b>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={custom.accuracy}
                onChange={(e) => setCustom({ ...custom, accuracy: Number(e.target.value) })}
              />
            </label>
            <label>
              扩张 <b>{custom.expand.toFixed(2)}</b>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={custom.expand}
                onChange={(e) => setCustom({ ...custom, expand: Number(e.target.value) })}
              />
            </label>
            <label>
              攻击 <b>{custom.attack.toFixed(2)}</b>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={custom.attack}
                onChange={(e) => setCustom({ ...custom, attack: Number(e.target.value) })}
              />
            </label>
          </div>
        )}

        {mode === 'spectate' && (
          <label className="field slider-field">
            <span>
              响应速度 <b>{aiSpeed} ms</b>
            </span>
            <input
              type="range"
              min="150"
              max="2000"
              step="50"
              value={aiSpeed}
              onChange={(e) => setAiSpeed(Number(e.target.value))}
            />
          </label>
        )}

        <label className="field slider-field">
          <span>
            回合数 <b>{rounds === 0 ? '不限' : rounds}</b>
          </span>
          <input
            type="range"
            min="0"
            max="50"
            step="1"
            value={rounds}
            onChange={(e) => setRounds(Number(e.target.value))}
          />
          <span className="muted hint">
            0 = 不限，打到棋盘占满或一方无法行动。每 3 轮一次灾难。
          </span>
        </label>

        <button
          className="menu-btn primary"
          onClick={() => onStart({ mode, presetId, presetB, aiSpeed, custom, rounds, difficulty })}
        >
          开始对局
        </button>
      </div>
    </div>
  );
}

// ---------- 设置 ----------

interface SettingsProps {
  settings: Settings;
  onChange: (s: Settings) => void;
  progress: Progress;
  onResetProgress: () => void;
  onBack: () => void;
}

export function SettingsScreen({
  settings,
  onChange,
  progress,
  onResetProgress,
  onBack,
}: SettingsProps) {
  const [confirmReset, setConfirmReset] = useState(false);

  function exportProgress() {
    const blob = new Blob([JSON.stringify(progress, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sentences-progress.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="screen">
      <header className="screen-head">
        <button className="back" onClick={onBack}>
          ← 返回
        </button>
        <h2>设置</h2>
      </header>

      <div className="setup">
        <label className="field slider-field">
          <span>
            UI 缩放 <b>{settings.uiScale.toFixed(2)}×</b>
          </span>
          <input
            type="range"
            min="0.85"
            max="1.4"
            step="0.05"
            value={settings.uiScale}
            onChange={(e) => onChange({ ...settings, uiScale: Number(e.target.value) })}
          />
        </label>

        <label className="field row">
          <span>配色</span>
          <select
            value={settings.theme}
            onChange={(e) =>
              onChange({ ...settings, theme: e.target.value as 'dark' | 'light' | 'mono' })
            }
          >
            <option value="dark">深色</option>
            <option value="light">浅色（墨水屏）</option>
            <option value="mono">黑白（磨砂）</option>
          </select>
        </label>

        <label className="field row">
          <span>隐藏上边框</span>
          <input
            type="checkbox"
            checked={settings.hideTopbar}
            onChange={(e) => onChange({ ...settings, hideTopbar: e.target.checked })}
          />
        </label>

        <label className="field row">
          <span>隐藏下边框</span>
          <input
            type="checkbox"
            checked={settings.hideBottombar}
            onChange={(e) => onChange({ ...settings, hideBottombar: e.target.checked })}
          />
        </label>

        <div className="divider" />
        <h3 className="settings-group">动画</h3>

        <label className="field row">
          <span>动画反馈</span>
          <input
            type="checkbox"
            checked={settings.animation}
            onChange={(e) => onChange({ ...settings, animation: e.target.checked })}
          />
        </label>

        <label className="field row">
          <span>棋盘闪光</span>
          <input
            type="checkbox"
            checked={settings.flashBoard}
            onChange={(e) => onChange({ ...settings, flashBoard: e.target.checked })}
          />
        </label>

        <label className="field row">
          <span>回合横幅</span>
          <input
            type="checkbox"
            checked={settings.turnBanner}
            onChange={(e) => onChange({ ...settings, turnBanner: e.target.checked })}
          />
        </label>

        <label className="field row">
          <span>占领闪光</span>
          <input
            type="checkbox"
            checked={settings.claimFlash}
            onChange={(e) => onChange({ ...settings, claimFlash: e.target.checked })}
          />
        </label>

        <div className="divider" />

        <div className="field row">
          <span>进度</span>
          <button onClick={exportProgress}>导出 JSON</button>
        </div>

        <div className="field row">
          <span>清空进度</span>
          {confirmReset ? (
            <span className="row">
              <button
                className="danger"
                onClick={() => {
                  onResetProgress();
                  setConfirmReset(false);
                }}
              >
                确认清空
              </button>
              <button onClick={() => setConfirmReset(false)}>取消</button>
            </span>
          ) : (
            <button onClick={() => setConfirmReset(true)}>清空…</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- 文章回顾 ----------

interface ReadingProps {
  summaries: BookSummary[];
  bundle?: BookBundle;
  onSelect: (bookId: string | null) => void;
  onBack: () => void;
}

export function ReadingScreen({ summaries, bundle, onSelect, onBack }: ReadingProps) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!bundle) return;
    const first = [...bundle.book.chapters].sort((a, b) => a.order - b.order)[0];
    setOpenIds(first ? new Set([first.id]) : new Set());
  }, [bundle?.book.id]);

  if (!bundle) {
    return (
      <div className="screen">
        <header className="screen-head">
          <button className="back" onClick={onBack}>
            ← 返回
          </button>
          <h2>文章回顾</h2>
        </header>
        <p className="muted reading-hint">
          这里按「书 → 章节」显示正确原文，供对局外复习。对局中依然看不到原文。
        </p>
        <div className="cards">
          {summaries.map((b) => (
            <button key={b.id} className="card" onClick={() => onSelect(b.id)}>
              <div className="card-title">{b.title}</div>
              <div className="card-meta">
                {b.chapters} 章 · {b.fragments} 个知识碎片
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const { book, chapters } = bundle;
  const refs = [...book.chapters].sort((a, b) => a.order - b.order);

  function toggle(id: string) {
    setOpenIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="screen">
      <header className="screen-head">
        <button className="back" onClick={() => onSelect(null)}>
          ← 返回
        </button>
        <h2>{book.title}</h2>
      </header>

      <div className="reading">
        {refs.map((ref) => {
          const chapter = chapters[ref.id];
          const open = openIds.has(ref.id);
          return (
            <div key={ref.id} className="reading-block">
              <button className="reading-chapter" onClick={() => toggle(ref.id)}>
                <span>{ref.title}</span>
                <span className="reading-toggle">{open ? '收起' : '展开'}</span>
              </button>
              {open && chapter && (
                <div className="reading-body">
                  {[...chapter.fragments]
                    .sort((a, b) => a.order - b.order)
                    .map((f) => {
                      const paragraphs: { p: number; text: string }[] = [];
                      for (const u of f.units) {
                        if (u.carried) continue;
                        const last = paragraphs[paragraphs.length - 1];
                        if (last && last.p === u.paragraph) last.text += u.original;
                        else paragraphs.push({ p: u.paragraph, text: u.original });
                      }
                      return (
                        <section key={f.id}>
                          <h3>
                            {String(f.order).padStart(2, '0')} · {f.title}
                          </h3>
                          {paragraphs.map((pg) => (
                            <p key={pg.p}>{pg.text}</p>
                          ))}
                        </section>
                      );
                    })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
