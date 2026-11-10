import { useEffect, useMemo, useRef, useState } from 'react';
import {
  apply,
  createMatch,
  incomeOf,
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
  const [flashUnit, setFlashUnit] = useState<{ id: string; ok: boolean } | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const bannerShown = useRef(false);
  const [reviewing, setReviewing] = useState(false);
  const [panelMore, setPanelMore] = useState(false);
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

  // 被进攻时棋盘红闪
  useEffect(() => {
    if (!settings.flashBoard) return;
    const evt = match.lastEvent;
    if (!evt || evt.kind !== 'convert') return;
    setFlashUnit({ id: evt.unitId, ok: false });
    const t = window.setTimeout(() => setFlashUnit(null), 900);
    return () => window.clearTimeout(t);
  }, [match.eventSeq, settings.flashBoard]);

  // 第 1 回合横幅
  useEffect(() => {
    if (!settings.turnBanner || bannerShown.current) return;
    if (match.round !== 1) return;
    bannerShown.current = true;
    showBanner(1);
  }, [match.round, settings.turnBanner]);

  const pages = match.pages ?? [];
  const page = pages[Math.min(pageIdx, Math.max(0, pages.length - 1))];

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
    if (r.correctResult !== undefined) {
      setFlash({ ok: r.correctResult });
      window.setTimeout(() => setFlash(null), 800);
    }
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
    setPanelMore(false);
    setSelected((cur) => (cur === id ? null : id));
  }

  const won = match.ended && match.winner === 'A';
  const draw = match.ended && match.winner === null;
  const breadcrumb = [match.bookTitle, match.chapterTitle, match.fragmentTitle]
    .filter((v, i, arr) => !!v && arr.indexOf(v) === i)
    .join(' · ');

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <button className="back" onClick={onExit}>
            ← 返回
          </button>
          <span className="brand-sub">{breadcrumb}</span>
        </div>
        <div className="top-actions">
          <span className="muted">
            {mode === 'ai' ? `人机 · ${presetById(presetId).name}` : mode === 'spectate' ? `看海 · ${presetById(presetId).name} vs ${presetById(presetBId).name}` : '双人'} ·{' '}
            {rounds === 0 ? '不限轮' : `${rounds} 轮`}
          </span>
          <button className="ghost" onClick={restart}>
            重开
          </button>
        </div>
      </header>

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

      <main className="board">
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
                flashUnit && flashUnit.id === id ? (flashUnit.ok ? 'flash-ok' : 'flash-bad') : '',
                reviewing ? (unit.correct ? 'review-right' : 'review-wrong') : '',
                cell.shielded === match.round ? 'shielded' : '',
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <span
                  key={id}
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

      {pages.length > 1 && (
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
                  className="ghost more-btn"
                  title="更多操作"
                  onClick={() => setPanelMore((v) => !v)}
                >
                  {panelMore ? '收起' : '⋯'}
                </button>
                {panelMore && (
                  <>
                    <button
                      disabled={
                        match.ap[match.turn] < 1 ||
                        match.cells[selected].shielded === match.round
                      }
                      onClick={() => run({ kind: 'protect', unitId: selected })}
                    >
                      保护 · 1 AP
                    </button>
                    <button
                      onClick={() => {
                        run({ kind: 'abandon', unitId: selected });
                        setSelected(null);
                      }}
                    >
                      放弃 · 0 AP
                    </button>
                  </>
                )}
              </>
            )}
            {match.cells[selected].owner !== match.turn && (
              <button
                className="primary"
                disabled={
                  match.ap[match.turn] < 2 ||
                  match.cells[selected].shielded === match.round
                }
                onClick={() => {
                  run({ kind: 'convert', unitId: selected });
                  setSelected(null);
                }}
              >
                {match.cells[selected].shielded === match.round ? '已被保护' : '进攻 · 2 AP'}
              </button>
            )}
          </div>
        </div>
      )}

      <footer className="hud">
        <div className="hud-left">
          <span className={`turn-chip ${match.turn.toLowerCase()}`}>{sideName(match.turn)}</span>
          {thinking && <span className="thinking">思考中…</span>}
          <span className="muted">
            第 {match.rounds === 0 ? match.round : Math.min(match.round, match.rounds)} /{' '}
            {match.rounds === 0 ? '不限' : match.rounds} 轮
          </span>
          {pulse !== null && <span className="muted pulse-hint">灾难 · 第 {pulse} 轮末</span>}
        </div>

        <div className="hud-right">
          <div className="ledger">
            <span>上回合 正确 {ledger.correct}</span>
            <span>错误 {ledger.wrong}</span>
            <span className="income">
              → 收入 <b>{currentIncome}</b>
            </span>
          </div>
          <div className="ap-box">
            <span className="ap-label">AP</span>
            <span className="ap-value">{match.ap[match.turn]}</span>
          </div>
          <button
            className="end-turn"
            disabled={!humanTurn || match.ended}
            onClick={() => {
              run({ kind: 'endTurn' });
              setSelected(null);
            }}
          >
            结束回合
          </button>
        </div>
      </footer>

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
                    setFlashUnit({ id: modalUnit, ok: !!r.correctResult });
                    window.setTimeout(() => setFlashUnit(null), 900);
                    if (settings.vibrate && typeof navigator !== 'undefined' && navigator.vibrate) {
                      navigator.vibrate(r.correctResult ? 20 : 60);
                    }
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
