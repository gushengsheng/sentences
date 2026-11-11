import { useEffect, useMemo, useRef, useState } from 'react';
import {
  apply,
  createMatch,
  nextPulseRound,
  tally,
  type Action,
  type Book,
  type Chapter,
  type MatchState,
  type Side,
} from './engine';
import { decideNext, newAiMemory, presetById, type AiConfig } from './ai';
import { clearSave, ratingFor, writeSave, type Difficulty, type Settings } from './store';
import { Hud, Topbar } from './game/Chrome';

interface GameProps {
  book: Book;
  chapter: Chapter;
  fragmentId: string;
  rounds: number;
  mode: 'ai' | 'hotseat' | 'spectate';
  aiSpeed: number;
  settings: Settings;
  presetId: string;
  presetBId: string;
  custom: AiConfig;
  difficulty: Difficulty;
  initialState?: MatchState;
  onExit: () => void;
  onFinish: (result: { won: boolean; margin: number }) => void;
}

const CATACLYSMS = [
  { title: '腐化', sub: '侵蚀与重塑' },
  { title: '分裂', sub: '一种神经官能症' },
  { title: '休克', sub: '衰亡的旅程' },
  { title: '静默', sub: '无人认领的句子' },
  { title: '潮汐', sub: '覆巢之下' },
];

function randomSeed() {
  return Math.floor(Math.random() * 1_000_000_000);
}

export default function Game(props: GameProps) {
  const { book, chapter, fragmentId, rounds, mode, aiSpeed, settings, presetId, presetBId, custom, difficulty, initialState, onExit, onFinish } =
    props;

  const meta = useMemo(
    () => ({
      bookId: book.id,
      bookTitle: book.title,
      chapterId: chapter.id,
      chapterTitle: chapter.title ?? '',
    }),
    [book.id, book.title, chapter.id, chapter.title],
  );

  const [match, setMatch] = useState<MatchState>(
    () => initialState ?? createMatch(chapter, fragmentId, rounds, randomSeed(), meta),
  );
  const [pageIdx, setPageIdx] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [modalUnit, setModalUnit] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ ok: boolean } | null>(null);
  const [quake, setQuake] = useState<{ title: string; sub: string } | null>(null);
  const [picked, setPicked] = useState<{ id: string; ok: boolean } | null>(null);
  const [flashUnit, setFlashUnit] = useState<{ id: string; kind: 'ok' | 'bad' | 'attack' | 'attack-foe' | 'shield' } | null>(null);
  const [dim, setDim] = useState(false);
  const [chromeOpen, setChromeOpen] = useState(
    () => !(settings.hideTopbar || settings.hideBottombar),
  );
  const [chromeTick, setChromeTick] = useState(0);

  useEffect(() => {
    setChromeOpen(!(settings.hideTopbar || settings.hideBottombar));
  }, [settings.hideTopbar, settings.hideBottombar]);

  // 边框浮出后长时间不操作，自动收起
  useEffect(() => {
    if (!chromeOpen) return;
    if (!settings.hideTopbar && !settings.hideBottombar) return;
    const t = window.setTimeout(() => setChromeOpen(false), 3000);
    return () => window.clearTimeout(t);
  }, [chromeOpen, chromeTick, settings.hideTopbar, settings.hideBottombar]);
  const [fadingShields, setFadingShields] = useState<string[]>([]);
  const [slash, setSlash] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [awayDot, setAwayDot] = useState<{ side: 'left' | 'right'; color: 'a' | 'b' } | null>(null);
  const [revealUnit, setRevealUnit] = useState<string | null>(null);
  const flashT = useRef(0);
  const lastTap = useRef(0);
  const blankToggleT = useRef(0);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const dimT = useRef(0);
  const slashT = useRef(0);
  const [banner, setBanner] = useState<string | null>(null);
  const bannerShown = useRef(false);
  const [reviewing, setReviewing] = useState(false);
  const [reviewCell, setReviewCell] = useState<string | null>(null);
  const lastPulse = useRef(0);

  const memA = useRef(newAiMemory());
  const memB = useRef(newAiMemory());
  const reported = useRef(false);

  const configA: AiConfig = presetId === 'custom' ? custom : presetById(presetId);
  const configB: AiConfig = presetBId === 'custom' ? custom : presetById(presetBId);
  const humanTurn = mode !== 'spectate' && (mode === 'hotseat' || match.turn === 'A');
  const thinking = !match.ended && (mode === 'spectate' || (mode === 'ai' && match.turn === 'B'));

  useEffect(() => {
    if (match.ended) return;
    writeSave({
      schemaVersion: 3,
      bookId: match.bookId,
      chapterId: match.chapterId,
      fragmentId: match.fragmentId,
      rounds,
      mode,
      presetId,
      presetB: presetBId,
      aiSpeed: mode === 'spectate' ? aiSpeed : undefined,
      difficulty,
      state: match,
      savedAt: Date.now(),
    });
  }, [match, rounds, mode, presetId, difficulty]);

  useEffect(() => {
    if (!match.ended || reported.current) return;
    reported.current = true;
    clearSave();
    onFinish({
      won: match.winner === 'A',
      margin: (match.finalScore?.A ?? 0) - (match.finalScore?.B ?? 0),
    });
  }, [match, onFinish]);

  useEffect(() => {
    if (match.pulseIndex <= lastPulse.current) return;
    lastPulse.current = match.pulseIndex;
    setQuake(CATACLYSMS[Math.floor(Math.random() * CATACLYSMS.length)]);
  }, [match.pulseIndex]);

  useEffect(() => {
    if (quake) return;
    if (match.ended || mode === 'hotseat') return;
    if (mode === 'ai' && match.turn !== 'B') return;
    const timer = window.setTimeout(() => {
      const mem = match.turn === 'A' ? memA.current : memB.current;
      const action = decideNext(match, match.turn === 'A' ? configA : configB, Math.random, mem);
      const r = apply(match, action);
      if (r.error) apply(match, { kind: 'endTurn' });
      else if (action.kind === 'correct' && r.correctResult) mem.confirmed.add(action.unitId);
      setMatch({ ...match });
    }, mode === 'spectate' ? aiSpeed : 550);
    return () => window.clearTimeout(timer);
  }, [match, mode, configA, configB, aiSpeed, presetId, presetBId, custom, quake]);

  // 自己占领：文字显影
  useEffect(() => {
    const evt = match.lastEvent;
    if (!evt || evt.kind !== 'claim' || !settings.claimFlash) return;
    const v = mode === 'hotseat' ? match.turn : mode === 'ai' ? 'A' : null;
    if (!v || evt.side !== v) return;
    setRevealUnit(evt.unitId);
    const t = window.setTimeout(() => setRevealUnit(null), 430);
    return () => window.clearTimeout(t);
  }, [match.eventSeq, mode, settings.claimFlash]);

  // 对方进攻被护盾挡下：防守方也收到提示和闪光
  useEffect(() => {
    const evt = match.lastEvent;
    if (!evt || evt.kind !== 'blocked') return;
    const v = mode === 'hotseat' ? match.turn : mode === 'ai' ? 'A' : null;
    if (!v || evt.side === v) return;
    if (match.cells[evt.unitId]?.owner !== v) return;
    if (settings.flashBoard) setFlashUnit({ id: evt.unitId, kind: 'shield' });
    notify('你的护盾挡下了一次进攻');
    window.clearTimeout(flashT.current);
    flashT.current = window.setTimeout(() => setFlashUnit(null), 900);
  }, [match.eventSeq, mode, settings.flashBoard]);

  // 被进攻时棋盘红闪
  useEffect(() => {
    if (!settings.flashBoard) return;
    const evt = match.lastEvent;
    if (!evt || evt.kind !== 'convert') return;
    const humanAttack = mode !== 'spectate' && (mode === 'hotseat' || evt.side === 'A');
    const v = mode === 'hotseat' ? match.turn : mode === 'ai' ? 'A' : null;
    if (v && evt.from === v) notify('被进攻');

    // 双方进攻都闪；自己进攻用刀光，对方进攻只红闪
    setFlashUnit({ id: evt.unitId, kind: humanAttack ? 'attack' : 'attack-foe' });
    window.clearTimeout(flashT.current);
    flashT.current = window.setTimeout(() => setFlashUnit(null), 900);

    if (!humanAttack) return;

    // 刀光：量出这句所有行盒的并集矩形，画成独立覆盖层
    const el = document.querySelector(`[data-unit="${evt.unitId}"]`);
    if (el) {
      const rects = Array.from(el.getClientRects());
      if (rects.length > 0) {
        const left = Math.min(...rects.map((r) => r.left));
        const right = Math.max(...rects.map((r) => r.right));
        const top = Math.min(...rects.map((r) => r.top));
        const bottom = Math.max(...rects.map((r) => r.bottom));
        setSlash({ left, top, width: right - left, height: bottom - top });
        window.clearTimeout(slashT.current);
        slashT.current = window.setTimeout(() => setSlash(null), 950);
      }
    }

    setDim(true);
    window.clearTimeout(dimT.current);
    dimT.current = window.setTimeout(() => setDim(false), 420);
  }, [match.eventSeq, settings.flashBoard, mode]);

  // 第 1 回合横幅
  useEffect(() => {
    if (!settings.turnBanner || bannerShown.current) return;
    if (match.round !== 1) return;
    bannerShown.current = true;
    showBanner(1);
  }, [match.round, settings.turnBanner]);

  // 谁能在屏幕上看到自己的护盾：热座看当前玩家，人机只看 A，观战都不看
  const viewer: Side | null = mode === 'hotseat' ? match.turn : mode === 'ai' ? 'A' : null;

  useEffect(() => {
    if (!match.shieldCleared || match.shieldCleared.length === 0) return;
    setFadingShields(match.shieldCleared);
    const t = window.setTimeout(() => setFadingShields([]), 700);
    return () => window.clearTimeout(t);
  }, [match.shieldClearSeq]);

  const pages = match.pages ?? [];

  // 键盘翻页：←/A 上一页，→/D 下一页
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName ?? '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const count = pages.length;
      if (count < 2) return;
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        setPageIdx((i) => Math.max(0, i - 1));
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        setPageIdx((i) => Math.min(count - 1, i + 1));
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pages.length]);
  const page = pages[Math.min(pageIdx, Math.max(0, pages.length - 1))];

  // 对方在别的页操作时，侧边亮一个点
  useEffect(() => {
    const evt = match.lastEvent;
    if (!evt) return;
    const v = mode === 'hotseat' ? match.turn : mode === 'ai' ? 'A' : null;
    if (!v || evt.side === v) return;
    const cur = Math.min(pageIdx, Math.max(0, pages.length - 1));
    const target = pages.findIndex((p) => p.unitIds.includes(evt.unitId));
    if (target < 0 || target === cur) return;
    setAwayDot({ side: target < cur ? 'left' : 'right', color: evt.side === 'A' ? 'a' : 'b' });
    const t = window.setTimeout(() => setAwayDot(null), 1200);
    return () => window.clearTimeout(t);
  }, [match.eventSeq, pageIdx, pages, mode]);

  const paragraphs = useMemo(() => {
    if (!page) return [] as { paragraph: number; ids: string[] }[];
    const groups: { paragraph: number; ids: string[] }[] = [];
    for (const id of page.unitIds) {
      const p = match.units[id].paragraph;
      const last = groups[groups.length - 1];
      if (last && last.paragraph === p) last.ids.push(id);
      else groups.push({ paragraph: p, ids: [id] });
    }
    return groups;
  }, [match, page]);

  function sideName(s: Side) {
    if (mode === 'hotseat') return s === 'A' ? '甲方' : '乙方';
    if (mode === 'spectate') return s === 'A' ? '甲·AI' : '乙·AI';
    return s === 'A' ? '你' : '电脑';
  }

  function closeModal() {
    setPicked(null);
    setModalUnit(null);
  }

  function showBanner(round: number) {
    setBanner('第 ' + round + ' 回合');
    window.setTimeout(() => setBanner(null), 1100);
  }

  function notify(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1500);
  }

  function run(action: Action) {
    const r = apply(match, action);
    if (r.error) {
      notify(r.error);
      return;
    }
    setMatch({ ...match });
    if (r.blocked) {
      notify('对方有护盾');
      if (settings.flashBoard && action.kind === 'convert') {
        setFlashUnit({ id: action.unitId, kind: 'shield' });
        window.clearTimeout(flashT.current);
        flashT.current = window.setTimeout(() => setFlashUnit(null), 900);
      }
    }
    if (action.kind === 'protect' && settings.flashBoard) {
      setFlashUnit({ id: action.unitId, kind: 'shield' });
      window.clearTimeout(flashT.current);
      flashT.current = window.setTimeout(() => setFlashUnit(null), 900);
    }
    if (r.correctResult !== undefined) {
      setFlash({ ok: r.correctResult });
      window.setTimeout(() => setFlash(null), 800);
    }
  }

  function quickEndTurn() {
    if (!humanTurn || match.ended || modalUnit || quake || reviewing || confirmEnd) return;
    if (match.ap[match.turn] > 0) {
      setConfirmEnd(true);
      return;
    }
    run({ kind: 'endTurn' });
    setSelected(null);
  }

  function restart() {
    reported.current = false;
    memA.current = newAiMemory();
    memB.current = newAiMemory();
    bannerShown.current = false;
    setMatch(createMatch(chapter, fragmentId, rounds, randomSeed(), meta));
    setReviewing(false);
    setReviewCell(null);
    setPageIdx(0);
    setSelected(null);
    setModalUnit(null);
  }

  const ledger = match.ledger[match.turn];
  const currentIncome = match.lastGrant[match.turn];
  const pulse = nextPulseRound(match);

  function clickCell(id: string) {
    if (reviewing) {
      if (!match.cells[id]?.revealed) return;
      setReviewCell((cur) => (cur === id ? null : id));
      return;
    }
    if (!humanTurn || match.ended) return;
    const cell = match.cells[id];
    if (cell.owner === null) {
      if (match.ap[match.turn] < 1) {
        notify('AP 不足');
        return;
      }
      run({ kind: 'claim', unitId: id });
      return;
    }
    setSelected((cur) => (cur === id ? null : id));
  }

  const won = match.ended && match.winner === 'A';
  const draw = match.ended && match.winner === null;
  const breadcrumb = [match.bookTitle, match.chapterTitle, match.fragmentTitle]
    .filter((v, i, arr) => !!v && arr.indexOf(v) === i)
    .join(' · ');

  return (
    <div
      className={`app${settings.hideBottombar && !chromeOpen ? ' chrome-hide-bottom' : ''}`}
      onContextMenu={(e) => {
        e.preventDefault();
        quickEndTurn();
      }}
      onClickCapture={(e) => {
        const target = e.target as HTMLElement;
        // 边缘点击翻页：屏幕左右两侧 44px 的空白窄边
        if (
          settings.pagerMode === 'edge' &&
          pages.length > 1 &&
          !target.closest('.unit, button, a, .panel, .topbar, .hud, .pager')
        ) {
          const w = window.innerWidth;
          if (e.clientX < 44) {
            setPageIdx((i) => Math.max(0, i - 1));
            return;
          }
          if (e.clientX > w - 44) {
            setPageIdx((i) => Math.min(pages.length - 1, i + 1));
            return;
          }
        }
        if (!settings.hideTopbar && !settings.hideBottombar) return;
        // 顶栏 / 底栏 / 翻页器里的按钮要能正常点，并重置自动收起计时
        if (target.closest('.topbar, .hud, .pager')) {
          setChromeTick((v) => v + 1);
          return;
        }
        // 句子、面板等交互元素：收起
        if (target.closest('.unit, button, a, .panel')) {
          setChromeOpen(false);
          return;
        }
        // 其余位置（页面空白、段落间隙、棋盘外）：延时切换，给双击留判断时间
        window.clearTimeout(blankToggleT.current);
        blankToggleT.current = window.setTimeout(() => setChromeOpen((v) => !v), 280);
      }}
    >
      {(!settings.hideTopbar || chromeOpen) && (
        <Topbar
          breadcrumb={breadcrumb}
          modeText={
            mode === 'ai'
              ? `人机 · ${presetById(presetId).name}`
              : mode === 'spectate'
                ? `看海 · ${presetById(presetId).name} vs ${presetById(presetBId).name}`
                : '双人'
          }
          onExit={onExit}
          onRestart={restart}
        />
      )}

      {banner && <div className="round-banner">{banner}</div>}

      {reviewing && reviewCell && (
        <div className="panel">
          <div className="panel-head">
            <span>原文对照</span>
            <button className="x" onClick={() => setReviewCell(null)}>
              ×
            </button>
          </div>
          <p className="panel-text muted">棋盘上：{match.units[reviewCell].text}</p>
          <p className="panel-text">原文：{match.units[reviewCell].original}</p>
        </div>
      )}

      {reviewing && (
        <div className="review-bar">
          <span>
            回顾 · 错误{' '}
            {match.order.filter((id) => match.cells[id].revealed && !match.units[id].correct).length} 句
          </span>
          <button
            className="ghost"
            onClick={() => {
              setReviewing(false);
              setReviewCell(null);
            }}
          >
            返回结算
          </button>
        </div>
      )}

      <main
        className="board"
        onClick={(e) => {
          const now = Date.now();
          const target = e.target as HTMLElement;
          if (
            now - lastTap.current < 320 &&
            !target.closest('.unit, button, a, .panel')
          ) {
            lastTap.current = 0;
            window.clearTimeout(blankToggleT.current);
            quickEndTurn();
          } else {
            lastTap.current = now;
          }
        }}
      >
        {paragraphs.map((g) => (
          <p className="para" key={g.paragraph}>
            {g.ids.map((id) => {
              const unit = match.units[id];
              const cell = match.cells[id];

              if (!cell.revealed) {
                const w = Math.min(26, Math.max(5, Math.round(unit.original.length * 0.95)));
                return (
                  <button
                    key={id}
                    className="unit hidden"
                    style={{ width: `${w}em` }}
                    disabled={!humanTurn || match.ended}
                    onClick={() => clickCell(id)}
                    title="占领 · 1 AP"
                  >
                    <span className="ink" />
                  </button>
                );
              }

              const cls = [
                'unit',
                'owned',
                cell.owner ? cell.owner.toLowerCase() : 'blank',
                selected === id ? 'selected' : '',
                flashUnit && flashUnit.id === id ? `flash-${flashUnit.kind}` : '',
                reviewing ? (unit.correct ? 'review-right' : 'review-wrong') : '',
                cell.owner === viewer && cell.shieldedBy === viewer ? 'shielded' : '',
                cell.owner !== null && viewer ? (cell.owner === viewer ? 'mine' : 'theirs') : '',
                revealUnit === id ? 'claim-flash' : '',
                cell.owner === viewer && fadingShields.includes(id) ? 'shielded shield-fade' : '',
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <span
                  key={id}
                  data-unit={id}
                  className={cls}
                  role="button"
                  tabIndex={0}
                  aria-disabled={!humanTurn || match.ended}
                  onClick={() => clickCell(id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') clickCell(id);
                  }}
                >
                  {unit.text}
                </span>
              );
            })}
          </p>
        ))}
      </main>

      {settings.pagerMode === 'buttons' && pages.length > 1 && (
        <nav className="pager">
          <button
            className="page-btn"
            disabled={pageIdx <= 0}
            onClick={() => setPageIdx((i) => Math.max(0, i - 1))}
          >
            ← 上一页
          </button>
          <span className="page-ind">
            {page?.title ?? `第 ${pageIdx + 1} 页`} · {pageIdx + 1} / {pages.length}
          </span>
          <button
            className="page-btn"
            disabled={pageIdx >= pages.length - 1}
            onClick={() => setPageIdx((i) => Math.min(pages.length - 1, i + 1))}
          >
            下一页 →
          </button>
        </nav>
      )}

      {selected && humanTurn && !match.ended && (
        <div className="panel">
          <div className="panel-head">
            <span>
              {`${sideName(match.cells[selected].owner as Side)}的领地`}
            </span>
            <button className="x" onClick={() => setSelected(null)}>
              ×
            </button>
          </div>
          <p className="panel-text">{match.units[selected].text}</p>
          <div className="panel-actions">
            {match.cells[selected].owner === match.turn && (
              <>
                <button
                  className="primary"
                  disabled={match.ap[match.turn] < 1}
                  onClick={() => {
                    setPicked(null);
                    setModalUnit(selected);
                  }}
                >
                  修正 · 1 AP
                </button>
                <button
                  disabled={
                    match.ap[match.turn] < 1 ||
                    match.cells[selected].shieldedBy === match.turn
                  }
                  onClick={() => run({ kind: 'protect', unitId: selected })}
                >
                  保护 · 1 AP
                </button>
              </>
            )}
            {match.cells[selected].owner !== match.turn && (
              <button
                className="primary"
                disabled={match.ap[match.turn] < 2}
                onClick={() => {
                  run({ kind: 'convert', unitId: selected });
                  setSelected(null);
                }}
              >
                进攻 · 2 AP
              </button>
            )}
          </div>
        </div>
      )}

      {(!settings.hideBottombar || chromeOpen) && (
        <Hud
          turn={match.turn}
          turnLabel={sideName(match.turn)}
          thinking={thinking}
          round={match.rounds === 0 ? match.round : Math.min(match.round, match.rounds)}
          rounds={match.rounds}
          pulse={pulse}
          correct={ledger.correct}
          wrong={ledger.wrong}
          income={currentIncome}
          ap={match.ap[match.turn]}
          canEnd={humanTurn && !match.ended}
          onEndTurn={() => {
            run({ kind: 'endTurn' });
            setSelected(null);
          }}
        />
      )}

      {settings.hideBottombar && !chromeOpen && (
        <div className="float-ap">
          AP <b>{match.ap[match.turn]}</b>
        </div>
      )}

      {confirmEnd && (
        <div className="overlay" onClick={() => setConfirmEnd(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>还有 AP 剩余</h3>
            <p className="muted">确定进入下一回合吗？</p>
            <div className="result-actions">
              <button onClick={() => setConfirmEnd(false)}>取消</button>
              <button
                className="primary"
                onClick={() => {
                  setConfirmEnd(false);
                  run({ kind: 'endTurn' });
                  setSelected(null);
                }}
              >
                进入下一回合
              </button>
            </div>
          </div>
        </div>
      )}

      {modalUnit && (
        <div className="overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>修正</h3>
            <p className="muted">选出忠实于原文的那一句。选错会让这句变成错误。</p>
            {match.units[modalUnit].options.map((o) => {
              const mark = picked && picked.id === o.id ? (picked.ok ? 'ok' : 'bad') : '';
              return (
                <button
                  key={o.id}
                  className={'option ' + mark}
                  disabled={!!picked}
                  onClick={() => {
                    const r = apply(match, { kind: 'correct', unitId: modalUnit, optionId: o.id });
                    if (r.error) {
                      notify(r.error);
                      return;
                    }
                    setMatch({ ...match });
                    setPicked({ id: o.id, ok: !!r.correctResult });
                    setFlash({ ok: !!r.correctResult });
                    setFlashUnit({ id: modalUnit, kind: r.correctResult ? 'ok' : 'bad' });
                    window.setTimeout(() => setFlashUnit(null), 900);
                    window.setTimeout(() => {
                      setFlash(null);
                      setPicked(null);
                      setModalUnit(null);
                    }, 750);
                  }}
                >
                  {o.text}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {flash && (
        <div className={`flash ${flash.ok ? 'ok' : 'bad'}`}>
          {flash.ok ? '✓ 修正成功' : '✗ 与原文不符'}
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}

      <div className={dim ? 'dim-overlay on' : 'dim-overlay'} />

      {awayDot && <div className={`away-dot ${awayDot.side} ${awayDot.color}`} />}

      {slash && (() => {
        const len = Math.hypot(slash.width, slash.height);
        const angle = (Math.atan2(slash.height, slash.width) * 180) / Math.PI;
        const left = slash.width / 2 - len / 2;
        const angleStyle = { ['--slash-angle' as string]: `-${angle}deg` };
        return (
          <div
            className="slash-box"
            style={{
              left: slash.left,
              top: slash.top,
              width: slash.width,
              height: slash.height,
            }}
          >
            <div
              className="slash-line"
              style={{ left, top: slash.height / 2 - 3, width: len, ...angleStyle }}
            />
            <div
              className="slash-scar"
              style={{ left, top: slash.height / 2 - 1, width: len, ...angleStyle }}
            />
          </div>
        );
      })()}

      {quake && (
        <div className="overlay quake-overlay" onClick={() => { setQuake(null); if (settings.turnBanner) showBanner(match.round); }}>
          <div className="cataclysm">
            <h2>{quake.title}</h2>
            <p>{quake.sub}</p>
            <span className="muted">点击继续</span>
          </div>
        </div>
      )}

      {match.ended && !reviewing && (
        <div className="overlay">
          <div className="modal result">
            <h2>
              {draw
                ? '平局'
                : mode === 'spectate'
                  ? match.winner === 'A'
                    ? '甲·AI 获胜'
                    : '乙·AI 获胜'
                  : won
                    ? '你拿下了这个知识碎片'
                    : '这个知识碎片失守了'}
            </h2>
            {won && mode !== 'spectate' && <p className="rating">{ratingFor(difficulty)}</p>}
            <table>
              <thead>
                <tr>
                  <th />
                  <th>正确</th>
                  <th>错误</th>
                  <th>得分</th>
                </tr>
              </thead>
              <tbody>
                {(['A', 'B'] as Side[]).map((side) => {
                  const t = tally(match, side);
                  const score = match.finalScore ? match.finalScore[side] : t.correct - t.wrong;
                  return (
                    <tr key={side} className={match.winner === side ? 'win' : ''}>
                      <td>{sideName(side)}</td>
                      <td>{t.correct}</td>
                      <td>{t.wrong}</td>
                      <td>{score > 0 ? '+' + score : score}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="result-actions">
              <button className="primary" onClick={restart}>
                再来一局
              </button>
              <button
                onClick={() => {
                  setReviewing(true);
                  setReviewCell(null);
                }}
              >
                查看回顾
              </button>
              <button onClick={onExit}>返回知识碎片</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
