import { useEffect, useMemo, useRef, useState } from 'react';
import { presetById, type AiConfig } from './ai';
import Game from './Game';
import type { MatchState } from './engine';
import {
  HttpMapSource,
  loadBookBundle,
  type BookBundle,
  type BookSummary,
  type MapSource,
} from './mapsource';
import {
  MenuScreen,
  BooksScreen,
  ChaptersScreen,
  FragmentsScreen,
  SetupScreen,
  SettingsScreen,
  ReadingScreen,
  type Mode,
  type SetupResult,
} from './screens';
import {
  clearSave,
  loadProgress,
  loadSave,
  loadSettings,
  recordKey,
  recordResult,
  saveProgress,
  saveSettings,
  type Difficulty,
  type Progress,
  type SaveFile,
  type Settings,
} from './store';

type Screen =
  | { name: 'menu' }
  | { name: 'books' }
  | { name: 'chapters'; bookId: string }
  | { name: 'fragments'; bookId: string; chapterId: string }
  | { name: 'setup'; bookId: string; chapterId: string; fragmentId: string }
  | {
      name: 'game';
      bookId: string;
      chapterId: string;
      fragmentId: string;
      rounds: number;
      mode: Mode;
      presetId: string;
      presetB?: string;
      aiSpeed?: number;
      difficulty: Difficulty;
      initialState?: MatchState;
      nonce: number;
    }
  | { name: 'reading'; bookId?: string }
  | { name: 'settings' };

function Loading({ text }: { text: string }) {
  return (
    <div className="screen center">
      <p className="muted">{text}</p>
    </div>
  );
}

export default function App() {
  const sourceRef = useRef<MapSource | null>(null);
  if (!sourceRef.current) sourceRef.current = new HttpMapSource();
  const source = sourceRef.current;

  const [summaries, setSummaries] = useState<BookSummary[] | null>(null);
  const [bundles, setBundles] = useState<Record<string, BookBundle>>({});
  const bundleRef = useRef<Record<string, BookBundle>>({});
  const bundlePromise = useRef<Record<string, Promise<BookBundle> | undefined>>({});

  const [screen, setScreen] = useState<Screen>({ name: 'menu' });
  const [progress, setProgress] = useState<Progress>(() => loadProgress());
  const [settings, setSettings] = useState<Settings>(() => {
    const s = loadSettings();
    // 预览用：?theme=light / ?theme=dark 覆盖本次初始配色
    const q = new URLSearchParams(window.location.search).get('theme');
    return q === 'light' || q === 'dark' ? { ...s, theme: q } : s;
  });
  const [save, setSave] = useState<SaveFile | null>(() => loadSave());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    source
      .listBooks()
      .then(setSummaries)
      .catch((e: unknown) => setError(String((e as Error)?.message ?? e)));
  }, [source]);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.style.setProperty('--ui-scale', String(settings.uiScale));
    document.documentElement.classList.toggle('no-anim', !settings.animation);
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    saveProgress(progress);
  }, [progress]);

  async function ensureBundle(bookId: string): Promise<BookBundle> {
    const cached = bundleRef.current[bookId];
    if (cached) return cached;
    const pending = bundlePromise.current[bookId];
    if (pending) return pending;

    const summary = summaries?.find((b) => b.id === bookId);
    if (!summary) throw new Error(`找不到书：${bookId}`);

    const p = loadBookBundle(source, summary).then((bundle) => {
      bundleRef.current[bookId] = bundle;
      bundlePromise.current[bookId] = undefined;
      setBundles({ ...bundleRef.current });
      return bundle;
    });
    bundlePromise.current[bookId] = p;
    return p;
  }

  // 调试入口：?debug=game&book=&chapter=&fragment= 直接进对局（用于无头测试）
  useEffect(() => {
    if (!summaries) return;
    const q = new URLSearchParams(window.location.search);
    if (q.get('debug') !== 'game') return;
    void (async () => {
      const summary = summaries.find((b) => b.id === q.get('book')) ?? summaries[0];
      if (!summary) return;
      const bundle = await ensureBundle(summary.id);
      const chapter =
        bundle.book.chapters.find((c) => c.id === q.get('chapter')) ?? bundle.book.chapters[0];
      if (!chapter) return;
      const loaded = bundle.chapters[chapter.id];
      const fragment =
        loaded?.fragments.find((f) => f.id === q.get('fragment')) ?? loaded?.fragments[0];
      if (!fragment) return;
      setScreen({
        name: 'game',
        bookId: summary.id,
        chapterId: chapter.id,
        fragmentId: fragment.id,
        rounds: fragment.recommendedRounds ?? 12,
        mode: 'ai',
        presetId: 'normal',
        difficulty: 'normal',
        nonce: Date.now(),
      });
    })().catch((e: unknown) => setError(String((e as Error)?.message ?? e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaries]);

  async function openBook(bookId: string) {
    try {
      await ensureBundle(bookId);
      setScreen({ name: 'chapters', bookId });
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    }
  }

  async function continueGame() {
    if (!save) return;
    try {
      await ensureBundle(save.bookId);
      setScreen({
        name: 'game',
        bookId: save.bookId,
        chapterId: save.chapterId,
        fragmentId: save.fragmentId,
        rounds: save.rounds,
        mode: save.mode,
        presetId: save.presetId,
        presetB: save.presetB,
        aiSpeed: save.aiSpeed,
        difficulty: save.difficulty ?? 'normal',
        initialState: save.state,
        nonce: Date.now(),
      });
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    }
  }

  const totals = useMemo(() => {
    const total = summaries?.reduce((s, b) => s + b.fragments, 0) ?? 0;
    const cleared = Object.values(progress).filter((r) => r.rating !== null).length;
    return { cleared, total };
  }, [summaries, progress]);

  if (error) {
    return (
      <div className="screen center">
        <h2>加载失败</h2>
        <p className="muted">{error}</p>
        <button className="menu-btn" onClick={() => setError(null)}>
          返回
        </button>
      </div>
    );
  }

  if (!summaries) return <Loading text="载入中…" />;

  switch (screen.name) {
    case 'menu':
      return (
        <MenuScreen
          hasSave={!!save}
          totals={totals}
          onContinue={continueGame}
          onBooks={() => setScreen({ name: 'books' })}
          onReading={() => setScreen({ name: 'reading' })}
          onSettings={() => setScreen({ name: 'settings' })}
        />
      );

    case 'books':
      return (
        <BooksScreen
          books={summaries}
          progress={progress}
          onOpen={openBook}
          onBack={() => setScreen({ name: 'menu' })}
        />
      );

    case 'chapters': {
      const bundle = bundles[screen.bookId];
      if (!bundle) {
        void ensureBundle(screen.bookId).catch((e: unknown) =>
          setError(String((e as Error)?.message ?? e)),
        );
        return <Loading text="载入书…" />;
      }
      return (
        <ChaptersScreen
          bundle={bundle}
          progress={progress}
          onOpen={(chapterId) =>
            setScreen({ name: 'fragments', bookId: screen.bookId, chapterId })
          }
          onBack={() => setScreen({ name: 'books' })}
        />
      );
    }

    case 'fragments': {
      const bundle = bundles[screen.bookId];
      const chapter = bundle?.chapters[screen.chapterId];
      if (!bundle || !chapter) {
        void ensureBundle(screen.bookId).catch((e: unknown) =>
          setError(String((e as Error)?.message ?? e)),
        );
        return <Loading text="载入章节…" />;
      }
      return (
        <FragmentsScreen
          bundle={bundle}
          chapter={chapter}
          progress={progress}
          onPlay={(fragmentId) =>
            setScreen({
              name: 'setup',
              bookId: screen.bookId,
              chapterId: screen.chapterId,
              fragmentId,
            })
          }
          onBack={() => setScreen({ name: 'chapters', bookId: screen.bookId })}
        />
      );
    }

    case 'setup': {
      const bundle = bundles[screen.bookId];
      const chapter = bundle?.chapters[screen.chapterId];
      const fragment = chapter?.fragments.find((f) => f.id === screen.fragmentId);
      if (!bundle || !chapter || !fragment) {
        return <Loading text="载入中…" />;
      }
      return (
        <SetupScreen
          book={bundle.book}
          chapter={chapter}
          fragment={fragment}
          onBack={() =>
            setScreen({
              name: 'fragments',
              bookId: screen.bookId,
              chapterId: screen.chapterId,
            })
          }
          onStart={(cfg) => startGame(screen.bookId, screen.chapterId, screen.fragmentId, cfg)}
        />
      );
    }

    case 'game': {
      const bundle = bundles[screen.bookId];
      const chapter = bundle?.chapters[screen.chapterId];
      if (!bundle || !chapter) return <Loading text="载入中…" />;
      const custom: AiConfig = presetById(screen.presetId);
      return (
        <Game
          key={`${screen.bookId}:${screen.chapterId}:${screen.fragmentId}:${screen.nonce}`}
          book={bundle.book}
          chapter={chapter}
          fragmentId={screen.fragmentId}
          rounds={screen.rounds}
          mode={screen.mode}
          aiSpeed={screen.aiSpeed ?? 550}
          presetId={screen.presetId}
          presetBId={screen.presetB ?? screen.presetId}
          custom={custom}
          difficulty={screen.difficulty}
          initialState={screen.initialState}
          onExit={() => {
            setScreen({
              name: 'fragments',
              bookId: screen.bookId,
              chapterId: screen.chapterId,
            });
            setSave(loadSave());
          }}
          onFinish={({ won, margin }) => {
            if (screen.mode !== 'spectate') {
              setProgress((p) =>
                recordResult(
                  p,
                  screen.bookId,
                  screen.chapterId,
                  screen.fragmentId,
                  screen.difficulty,
                  won,
                  margin,
                ),
              );
            }
            setSave(null);
            clearSave();
          }}
        />
      );
    }

    case 'reading': {
      const bid = screen.bookId;
      if (!bid) {
        return (
          <ReadingScreen
            summaries={summaries}
            onSelect={(id) => setScreen({ name: 'reading', bookId: id ?? undefined })}
            onBack={() => setScreen({ name: 'menu' })}
          />
        );
      }
      const bundle = bundles[bid];
      if (!bundle) {
        void ensureBundle(bid).catch((e: unknown) =>
          setError(String((e as Error)?.message ?? e)),
        );
        return <Loading text="载入书…" />;
      }
      return (
        <ReadingScreen
          summaries={summaries}
          bundle={bundle}
          onSelect={(id) => setScreen({ name: 'reading', bookId: id ?? undefined })}
          onBack={() => setScreen({ name: 'menu' })}
        />
      );
    }

    case 'settings':
      return (
        <SettingsScreen
          settings={settings}
          onChange={setSettings}
          progress={progress}
          onResetProgress={() => setProgress({})}
          onBack={() => setScreen({ name: 'menu' })}
        />
      );
  }

  function startGame(
    bookId: string,
    chapterId: string,
    fragmentId: string,
    cfg: SetupResult,
  ) {
    setScreen({
      name: 'game',
      bookId,
      chapterId,
      fragmentId,
      rounds: cfg.rounds,
      mode: cfg.mode,
      presetId: cfg.presetId,
      presetB: cfg.presetB,
      aiSpeed: cfg.aiSpeed,
      difficulty: cfg.difficulty,
      nonce: Date.now(),
    });
  }
}
